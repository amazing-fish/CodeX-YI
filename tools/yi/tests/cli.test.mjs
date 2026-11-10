import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
function run(...args) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: tmpdir(), encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(result.error, undefined);
    return result;
}
function json(...args) {
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
}

test('CLI 文本与 JSON reading 提供相同方法、当次注释检索与不可检索提示', () => {
    const result = json('reading', '8,8,7,7,7,6');
    assert.equal(result.methodology.commentaries.status, 'not-retrieved');
    const rendered = run('reading', '8,8,7,7,7,6', '--text');
    assert.equal(rendered.status, 0, rendered.stderr);
    for (const word of ['方法论', '王弼', '孔颖达', '朱熹', '项安世', '未检索', '阴承阳', '阴乘阳', '不能当作三次独立验证', '本次未能核验具体注释', '方法来源（非当次注释检索结果）', '不得把用户所问']) assert.ok(rendered.stdout.includes(word), word);
    const three = run('reading', '9,9,9,7,7,7', '--text');
    assert.equal(three.status, 0, three.stderr);
    assert.match(three.stdout, /三爻变简化（本次适用）/);
    assert.match(three.stdout, /待检索主读.*（未检索）/);
});

test('帮助、版本与 cwd 无关的 JSON 输出', () => {
    assert.match(run('--help').stdout, /初爻→上爻/);
    assert.match(run('help').stdout, /stdio MCP/);
    assert.equal(run('--version').stdout.trim(), '2.5.1');
    assert.equal(json('info').hexagrams, 64);
    assert.equal(json('info', '--json').lineOrder, 'bottom-to-top');
    assert.equal(json('list', '--limit', '2', '--offset', '62').items[1].id, 64);
});

test('四种查询方式与命中搜索', () => {
    for (const args of [['show', '1'], ['show', '乾'], ['show', '111111'], ['show', '--id', '1'], ['show', '--name', '乾为天'], ['show', '--binary', '111111'], ['show', '--upper', '乾', '--lower', '乾']]) {
        assert.equal(json(...args).hexagram.id, 1);
    }
    const search = json('search', '潜龙', '--limit', '1');
    assert.equal(search.items[0].hexagram.id, 1);
    assert.ok(search.items[0].snippet.includes('潜龙'));
    assert.equal(json('trigrams', '--name', '坎').items.坎.binary, '010');
    assert.ok(json('classics', '--section', 'shuogua').appendix.shuogua.length > 0);
});

test('六爻位序、所问、用九与便读输出', () => {
    const result = json('analyze', '9,9,9,9,9,9', '--question', '仅作学习');
    assert.equal(result.question, '仅作学习');
    assert.equal(result.primary.id, 1);
    assert.equal(result.changed.id, 2);
    assert.equal(result.guide.readings[0].title, '用九');
    assert.deepEqual(json('analyze', '--lines', '6, 7, 8, 9, 7, 8').values, [6, 7, 8, 9, 7, 8]);
    assert.match(run('analyze', '9,9,9,9,9,9', '--text').stdout, /用九/);
    assert.match(run('show', '1', '--text').stdout, /初九：潜龙勿用/);
    assert.match(run('list', '--limit', '1', '--text').stdout, /乾为天/);
    assert.match(run('search', '潜龙', '--text').stdout, /潜龙/);
    assert.equal(json('cast').values.length, 6);
});

test('无写入的本机 agent 配置使用绝对 Node 与入口路径', () => {
    const codex = run('agent-config');
    assert.equal(codex.status, 0, codex.stderr);
    assert.match(codex.stdout, /\[mcp_servers\.yi\]/);
    const claude = json('agent-config', '--client', 'claude');
    assert.equal(claude.mcpServers.yi.command, process.execPath);
    assert.ok(claude.mcpServers.yi.args[0].endsWith('mcp.mjs'));
});

test('参数错误均只写 stderr JSON、退出2且不泄漏堆栈', () => {
    const bad = [
        ['unknown'], ['__proto__'], ['constructor'], ['toString'], ['info', '--unknown'], ['info', 'extra'], ['list', '--limit', '1.5'],
        ['list', '--offset', '-1'], ['list', '--limit', '0'], ['list', '--limit', '65'],
        ['list', '--limit', '1', '--limit', '2'], ['show'], ['show', '--id', '0'],
        ['show', '乾', '--id', '1'], ['show', '--id', '1', '--binary', '111111'],
        ['show', '--upper', '乾'], ['show', '--name', '不存在'], ['search'], ['search', ' '],
        ['analyze'], ['analyze', '7,7'], ['analyze', '7,7,7,7,7,10'],
        ['analyze', '7,7,7,7,7,7', '--lines', '7,7,7,7,7,7'],
        ['info', '--text', '--json'], ['cast', '--question', 'x'.repeat(501)],
        ['trigrams', '--name', '__proto__'], ['classics', '--section', 'other'],
        ['agent-config', '--client', 'other'], ['mcp', '--text']
    ];
    for (const args of bad) {
        const result = run(...args);
        assert.equal(result.status, 2, `${args.join(' ')}: ${result.stderr}`);
        assert.equal(result.stdout, '', args.join(' '));
        const error = JSON.parse(result.stderr).error;
        assert.ok(['INVALID_INPUT', 'NOT_FOUND'].includes(error.code));
        assert.equal(Object.hasOwn(error, 'stack'), false);
    }
});


test('npm link / 目录联接入口仍真正执行 CLI', () => {
    const directory = mkdtempSync(join(tmpdir(), 'yi-cli-linked-'));
    try {
        const link = join(directory, 'linked-tools');
        symlinkSync(dirname(cli), link, 'junction');
        const result = spawnSync(process.execPath, [join(link, 'cli.mjs'), 'info'], { cwd: tmpdir(), encoding: 'utf8', timeout: 10000, windowsHide: true });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stderr, '');
        assert.equal(JSON.parse(result.stdout).hexagrams, 64);
    } finally {
        // 只清理本测试创建的临时目录；rm 不遍历目录联接的目标。
        rmSync(directory, { recursive: true, force: true });
    }
});


test('CLI 日常帮助收敛两步，起卦事件和 reading 全资料链路可运行', () => {
    const help = run('--help').stdout;
    assert.match(help, /cast --question/);
    assert.match(help, /reading/);
    assert.doesNotMatch(help, /search <关键词>/);
    assert.match(run('advanced').stdout, /search <关键词>/);
    const cast = json('cast', '--question', '事件', '--notes', '背景');
    assert.equal(cast.record.question, '事件');
    assert.equal(cast.record.notes, '背景');
    assert.equal(cast.storage.status, 'not_saved');
    const reading = json('reading', cast.values.join(','));
    assert.equal(reading.primary.id, cast.primary.id);
    assert.equal(Object.keys(reading.related).length, 3);
    const rendered = run('reading', '9,9,9,9,9,9', '--text');
    for (const word of ['用九', '错卦', '综卦', '互卦', '白话', '爻位', 'AI 解读由调用方']) assert.ok(rendered.stdout.includes(word), word);
    for (const args of [['reading'], ['reading', '--record', '../other'], ['reading', '7,7,7,7,7,7', '--record', 'id'], ['cast', '--save', 'true']]) assert.equal(run(...args).status, 2);
});


test('CLI 跨进程保存/重读呈现背景，保存失败有原卦输出且退出1', () => {
    const directory = mkdtempSync(join(tmpdir(), 'yi-cli-records-'));
    const env = { ...process.env, HOME: directory, USERPROFILE: directory };
    const isolated = args => spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8', timeout: 10000, windowsHide: true });
    try {
        const home = spawnSync(process.execPath, ['--input-type=module', '--eval', "import { homedir } from 'node:os'; process.stdout.write(homedir())"], { env, encoding: 'utf8', windowsHide: true });
        assert.equal(home.stdout, directory, '测试必须使用自己的临时用户目录，不接触真实占记');
        const saved = isolated(['cast', '--question', '学习安排', '--notes', '预算已经耗尽', '--save']);
        assert.equal(saved.status, 0, saved.stderr);
        const result = JSON.parse(saved.stdout);
        assert.equal(result.storage.status, 'saved');
        const reread = isolated(['reading', '--record', result.record.id, '--text']);
        assert.equal(reread.status, 0, reread.stderr);
        assert.ok(reread.stdout.includes('预算已经耗尽'));
        assert.doesNotMatch(reread.stdout, /爻位：\{/);
        assert.ok(reread.stdout.includes(result.values.join(',')));
        const blockedHome = join(directory, 'blocked-home');
        mkdirSync(blockedHome);
        writeFileSync(join(blockedHome, '.yi'), 'not a directory');
        const failed = spawnSync(process.execPath, [cli, 'cast', '--question', '保留这次', '--save'], { env: { ...env, HOME: blockedHome, USERPROFILE: blockedHome }, encoding: 'utf8', timeout: 10000, windowsHide: true });
        assert.equal(failed.status, 1);
        const retained = JSON.parse(failed.stdout);
        assert.equal(retained.storage.status, 'failed');
        assert.equal(retained.record.question, '保留这次');
        assert.equal(retained.values.length, 6);
    } finally {
        assert.equal(dirname(directory), tmpdir());
        assert.ok(directory.includes('yi-cli-records-'));
        rmSync(directory, { recursive: true, force: true });
    }
});
