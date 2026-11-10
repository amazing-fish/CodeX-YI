#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { createYiApi, VERSION, YiInputError } from './api.mjs';

const HELP = `易之 YI ${VERSION} · 离线 CLI / MCP（Node >=22）
用法：node tools/yi/cli.mjs <命令> [参数]

日常只需两步，再交给调用方 AI 解读：
  cast --question 所问 [--notes 事件背景] [--save]
                               三钱起卦＋事件占记；默认不落盘
  reading <6,7,8,9,7,8>         经文、白话、变爻指引、爻位与错综互
          或 --record <占记ID>  重读已明确保存的本机占记，不重新起卦

  advanced                     查看兼容的高级查询命令
  agent-config [--client codex|claude]  输出本机 MCP 配置，不修改设置
  mcp                          启动 stdio MCP，stdout 仅协议

默认 JSON；--text 便读文本；--json 显式 JSON；--version 版本。
六爻顺序初爻→上爻：6老阴、7少阳、8少阴、9老阳。
--save 才把事件和六爻保存到本机 ~/.yi/records，明文且不加密。
AI 解读由调用方完成。仅供文化学习与自省，不提供现实预测或专业决策。`;

const ADVANCED_HELP = `兼容的高级命令（MCP 不再默认列出）：
  info                         版本、数据规模、位序与能力
  list [--offset 0] [--limit 64] 列出卦象摘要
  show <卦序|卦名|六位卦画>     查询全文与关系卦
       或 --id / --name / --binary / --upper + --lower
  search <关键词> [--limit 10]  搜索卦名、卦辞、爻辞、经传
  analyze <6,7,8,9,7,8>         旧六爻分析（支持 --lines / --question）
  trigrams [--name 乾]          八卦属性
  classics [--section shuogua]  经传出处及附录
六位 binary 自上而下。新流程请优先 cast → reading。`;

const COMMANDS = {
    info: { operation: 'yi_info', options: {} },
    list: { operation: 'yi_list_hexagrams', options: { offset: 'integer', limit: 'integer' } },
    show: { operation: 'yi_get_hexagram', options: { id: 'integer', name: 'string', binary: 'string', upper: 'string', lower: 'string' }, positional: 'selector' },
    search: { operation: 'yi_search_hexagrams', options: { limit: 'integer' }, positional: 'query' },
    analyze: { operation: 'yi_analyze_lines', options: { lines: 'string', question: 'string' }, positional: 'values' },
    cast: { operation: 'yi_cast', options: { question: 'string', notes: 'string', save: 'boolean' } },
    reading: { operation: 'yi_reading', options: { lines: 'string', record: 'string' }, positional: 'values' },
    advanced: { options: {} },
    trigrams: { operation: 'yi_get_trigrams', options: { name: 'string' } },
    classics: { operation: 'yi_get_classics', options: { section: 'string' } },
    'agent-config': { options: { client: 'string' } },
    mcp: { options: {} }
};

function parseValues(input) {
    if (!/^[6-9](?:\s*,\s*[6-9]){5}$/.test(input)) throw new YiInputError('六爻须为逗号分隔的六个 6/7/8/9，顺序为初爻到上爻');
    return input.split(',').map(Number);
}

function parseCommand(command, argv) {
    const definition = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : null;
    if (!definition) throw new YiInputError(`未知命令：${command}；使用 --help 查看用法`);
    const optionTypes = { ...definition.options, json: 'boolean', text: 'boolean', help: 'boolean' };
    let parsed;
    try {
        parsed = parseArgs({ args: argv, options: Object.fromEntries(Object.entries(optionTypes).map(([key, type]) => [key, { type: type === 'integer' ? 'string' : type }])), allowPositionals: true, strict: true, tokens: true });
    } catch (error) {
        throw new YiInputError(error.message);
    }
    const seen = new Set();
    for (const token of parsed.tokens.filter(token => token.kind === 'option')) {
        if (seen.has(token.name)) throw new YiInputError(`参数 --${token.name} 不可重复`);
        seen.add(token.name);
    }
    if (parsed.values.json && parsed.values.text) throw new YiInputError('--json 与 --text 不可同时使用');
    if (parsed.values.help) return { help: true };
    if (parsed.positionals.length > (definition.positional ? 1 : 0)) throw new YiInputError('位置参数过多；含空格的文字请使用引号');
    const args = {};
    for (const [key, type] of Object.entries(definition.options)) {
        if (!Object.hasOwn(parsed.values, key)) continue;
        const value = parsed.values[key];
        if (type === 'integer' && !/^\d+$/.test(value)) throw new YiInputError(`--${key} 必须是非负整数`);
        args[key] = type === 'integer' ? Number(value) : value;
    }
    const positional = parsed.positionals[0];
    if (command === 'show' && positional !== undefined) {
        if (Object.keys(args).length) throw new YiInputError('位置查询参数不可与 --id/--name/--binary/--upper/--lower 混用');
        if (/^[01]{6}$/.test(positional)) args.binary = positional;
        else if (/^\d+$/.test(positional)) args.id = Number(positional);
        else args.name = positional;
    }
    if (command === 'search') args.query = positional;
    if (command === 'reading' && args.record !== undefined) {
        if (positional !== undefined || args.lines !== undefined) throw new YiInputError('--record 与六爻不可混用');
        args.recordId = args.record;
        delete args.record;
    }
    if (command === 'analyze' || (command === 'reading' && args.recordId === undefined)) {
        if (positional !== undefined && args.lines !== undefined) throw new YiInputError('六爻不可重复指定');
        const input = args.lines ?? positional;
        if (input === undefined) throw new YiInputError('请提供六爻，例如 analyze 6,7,8,9,7,8');
        args.values = parseValues(input);
        delete args.lines;
    }
    return { definition, args, text: Boolean(parsed.values.text) };
}

function agentConfig(client = 'codex') {
    const command = process.execPath;
    const args = [fileURLToPath(new URL('./mcp.mjs', import.meta.url))];
    if (client === 'codex') return `[mcp_servers.yi]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}`;
    if (client === 'claude') return JSON.stringify({ mcpServers: { yi: { command, args } } }, null, 2);
    throw new YiInputError('--client 只支持 codex 或 claude');
}

function renderText(result) {
    if (result.record && result.storage) {
        const { record, storage } = result;
        return [`事件：${record.question || '未填写'}`, `背景：${record.notes || '未填写'}`, `占记 ID：${record.id}`,
            `时间：${new Date(record.timestamp).toISOString()}`, `${result.primary.fullName} → ${result.changed.fullName}`,
            `六爻（初→上）：${result.values.join(',')}`,
            storage.status === 'saved' ? `已保存：${storage.path}` : storage.status === 'failed' ? storage.message : '未保存到磁盘（需要时加 --save）',
            `下一步：reading ${result.values.join(',')}；结合事件与该经文结果，由调用方 AI 解读。`].join('\n');
    }
    if (result.primary) {
        const { primary, changed, guide } = result;
        const parts = [result.question ? `所问：${result.question}` : '', `${primary.id} ${primary.fullName} → ${changed.id} ${changed.fullName}`, `六爻（初→上）：${result.values.join(',')}`, `变爻：${result.changingPositions.join('、') || '无'}`, `${guide.rule.name}：${guide.rule.text}`];
        for (const reading of guide.readings) parts.push(`${reading.hexagram.fullName} ${reading.title || '卦辞'}${reading.main ? '（主）' : ''}：${reading.text}${reading.xiang ? `\n象曰：${reading.xiang}` : ''}`);
        if (result.related) {
            if (result.record?.notes) parts.push(`事件背景：${result.record.notes}`);
            parts.push(`爻位：${result.positions.proper} 爻当位、${result.positions.improper} 爻失位，${result.positions.pairs} 组相应${result.positions.note ? `；${result.positions.note}` : ''}`, `白话：${primary.explanation || primary.overview || ''}`);
            for (const [key, hexagram] of Object.entries(result.related)) parts.push(`${{ opposite: '错卦', inverse: '综卦', mutual: '互卦' }[key]}：${hexagram.fullName}；${hexagram.judgment || hexagram.explanation}`);
            parts.push('以上为经文与确定性基础解析，AI 解读由调用方结合事件生成。');
        }
        return parts.filter(Boolean).join('\n');
    }
    if (result.hexagram) {
        const hexagram = result.hexagram;
        return [`${hexagram.id} ${hexagram.fullName} (${hexagram.binary})`, hexagram.judgment, hexagram.classic?.tuan ? `彖曰：${hexagram.classic.tuan}` : '', hexagram.classic?.daxiang ? `象曰：${hexagram.classic.daxiang}` : '', ...hexagram.lines.map(line => `${line.title}：${line.text}${line.xiang ? `\n象曰：${line.xiang}` : ''}`), hexagram.classic?.extra ? `${hexagram.classic.extra.title}：${hexagram.classic.extra.text}` : '', ...Object.entries(result.related).map(([key, value]) => `${{ opposite: '错卦', inverse: '综卦', mutual: '互卦' }[key]}：${value.fullName}`)].filter(Boolean).join('\n');
    }
    if (Array.isArray(result.items)) return [`共 ${result.total} 条`, ...result.items.map(item => {
        const hexagram = item.hexagram || item;
        return `${hexagram.id} ${hexagram.fullName} ${hexagram.binary}${item.snippet ? `\n  ${item.snippet}` : ''}`;
    })].join('\n');
    return JSON.stringify(result, null, 2);
}

export async function main(argv = process.argv.slice(2)) {
    if (!argv.length || (argv.length === 1 && ['help', '--help', '-h'].includes(argv[0]))) {
        process.stdout.write(`${HELP}\n`);
        return;
    }
    if (argv.length === 1 && ['--version', '-v'].includes(argv[0])) {
        process.stdout.write(`${VERSION}\n`);
        return;
    }
    const command = argv[0];
    const parsed = parseCommand(command, argv.slice(1));
    if (parsed.help) { process.stdout.write(`${HELP}\n`); return; }
    if (command === 'advanced') { process.stdout.write(`${ADVANCED_HELP}\n`); return; }
    if (command === 'mcp') {
        if (parsed.text) throw new YiInputError('MCP stdout 只能输出协议，不支持 --text');
        const { runMcpServer } = await import('./mcp.mjs');
        await runMcpServer();
        return;
    }
    if (command === 'agent-config') {
        process.stdout.write(`${agentConfig(parsed.args.client)}\n`);
        return;
    }
    const api = await createYiApi();
    const result = await api.invoke(parsed.definition.operation, parsed.args);
    process.stdout.write(`${parsed.text ? renderText(result) : JSON.stringify(result, null, 2)}\n`);
    if (result.storage?.status === 'failed') process.exitCode = 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        const inputError = error instanceof YiInputError;
        process.stderr.write(`${JSON.stringify({ error: { code: inputError ? error.code : 'INTERNAL_ERROR', message: error.message } })}\n`);
        process.exitCode = inputError ? 2 : 1;
    });
}
