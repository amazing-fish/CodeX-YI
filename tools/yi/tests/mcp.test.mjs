import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rmdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createYiApi, OPERATIONS, MCP_OPERATIONS, VERSION, YiInputError } from '../api.mjs';
import { runMcpServer, MAX_MESSAGE_BYTES, SUPPORTED_PROTOCOL_VERSIONS } from '../mcp.mjs';

const mcpPath = fileURLToPath(new URL('../mcp.mjs', import.meta.url));
const request = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
const notification = (method, params) => ({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) });
const initialize = (version = SUPPORTED_PROTOCOL_VERSIONS[0]) => request('init', 'initialize', {
    protocolVersion: version, capabilities: {}, clientInfo: { name: 'yi-test', version: '1.0.0' }
});
const ready = version => [initialize(version), notification('notifications/initialized')];
const encode = messages => `${messages.map(message => JSON.stringify(message)).join('\n')}\n`;
const stubApi = { async invoke(name, args) { return { name, args }; } };

function collector() {
    const chunks = [];
    const stream = new Writable({ write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
    return { stream, text: () => Buffer.concat(chunks).toString('utf8') };
}

function parseOutput(text) {
    assert.ok(!text || text.endsWith('\n'), '输出必须以换行界定完整协议消息');
    return text ? text.slice(0, -1).split('\n').map(line => {
        const message = JSON.parse(line);
        assert.equal(message.jsonrpc, '2.0', 'stdout 只能包含 JSON-RPC 协议消息');
        return message;
    }) : [];
}

async function transcript(messages, { api = stubApi, fragments, raw, renderImage } = {}) {
    const input = new PassThrough();
    const output = collector();
    const errors = collector();
    const running = runMcpServer({ input, output: output.stream, error: errors.stream, api, renderImage });
    const bytes = Buffer.from(raw ?? encode(messages));
    if (fragments) {
        for (let offset = 0; offset < bytes.length; offset += fragments) {
            input.write(bytes.subarray(offset, offset + fragments));
            // 让读取端实际消费这一片，避免 PassThrough 把全部片段合成一次读取。
            await new Promise(accept => setImmediate(accept));
        }
        input.end();
    } else {
        input.end(bytes);
    }
    await running;
    return { messages: parseOutput(output.text()), stderr: errors.text() };
}

function subprocess(path = mcpPath, { raw = '', cwd = tmpdir() } = {}) {
    return new Promise((accept, reject) => {
        const child = spawn(process.execPath, [path], { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        const stdout = [];
        const stderr = [];
        const timer = setTimeout(() => { child.kill(); reject(new Error('MCP 子进程未在 15 秒内退出')); }, 15000);
        child.on('error', failure => { clearTimeout(timer); reject(failure); });
        child.stdout.on('data', chunk => stdout.push(chunk));
        child.stderr.on('data', chunk => stderr.push(chunk));
        child.stdin.on('error', failure => { if (failure.code !== 'EPIPE') reject(failure); });
        child.on('close', (code, signal) => {
            clearTimeout(timer);
            accept({ code, signal, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
        });
        child.stdin.end(raw);
    });
}

test('初始化协商与能力声明完整，完成 initialized 后才开放工具', async () => {
    const { messages, stderr } = await transcript([
        request(0, 'ping'), request(1, 'tools/list'), initialize(), request(2, 'tools/list'),
        notification('notifications/initialized'), request(3, 'tools/list'), initialize()
    ]);
    assert.deepEqual(messages[0], { jsonrpc: '2.0', id: 0, result: {} });
    assert.equal(messages[1].error.code, -32002);
    assert.equal(messages[2].result.protocolVersion, SUPPORTED_PROTOCOL_VERSIONS[0]);
    assert.deepEqual(messages[2].result.capabilities, { tools: { listChanged: false } });
    assert.deepEqual(messages[2].result.serverInfo, { name: 'yi', version: VERSION });
    assert.equal(messages[3].error.code, -32002);
    assert.equal(messages[4].result.tools.length, 2);
    assert.equal(messages[5].error.code, -32600);
    assert.equal(stderr, '');
});

test('支持的版本原样协商，未支持的版本返回服务端支持版供客户端选择', async () => {
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
        const { messages } = await transcript([...ready(version), request(1, 'tools/list'), request(2, 'tools/call', { name: 'yi_info' })]);
        assert.equal(messages[0].result.protocolVersion, version);
        assert.ok(Object.hasOwn(messages[1].result.tools[0], 'annotations'));
        assert.ok(Object.hasOwn(messages[2].result, 'structuredContent'));
        assert.deepEqual(JSON.parse(messages[2].result.content[0].text), { name: 'yi_info', args: {} });
    }
    for (const version of ['2099-01-01', '2025-03-26', '2024-11-05']) {
        const { messages } = await transcript([initialize(version)]);
        assert.equal(messages[0].result.protocolVersion, SUPPORTED_PROTOCOL_VERSIONS[0]);
    }
});

test('初始化参数错误可重试，提前或错误的 initialized 通知不能绕过握手', async () => {
    const { messages } = await transcript([
        notification('notifications/initialized'),
        request(1, 'initialize'), request(2, 'initialize', { protocolVersion: 1, capabilities: {}, clientInfo: {} }),
        request(3, 'initialize', { protocolVersion: '2025-11-25', capabilities: [], clientInfo: {} }),
        request(4, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test' } }),
        initialize(), notification('notifications/initialized', []), request(5, 'tools/list'),
        notification('notifications/initialized'), request(6, 'tools/list')
    ]);
    for (const message of messages.slice(0, 4)) assert.equal(message.error.code, -32602);
    assert.equal(messages[5].error.code, -32002);
    assert.equal(messages[6].result.tools.length, 2);
});

test('tools/list 只发现两个工作流工具，声明保存副作用且不提供任意文件或网络工具', async () => {
    const { messages } = await transcript([...ready(), request(1, 'tools/list'), request(2, 'tools/list', { cursor: 'unknown' })]);
    assert.deepEqual(messages[1].result.tools, MCP_OPERATIONS);
    assert.equal(messages[2].error.code, -32602);
    assert.equal(messages[1].result.tools.find(tool => tool.name === 'yi_cast').annotations.idempotentHint, false);
    assert.ok(messages[1].result.tools.every(tool => !tool.annotations.openWorldHint));
    assert.equal(messages[1].result.tools[0].annotations.readOnlyHint, false);
    assert.equal(messages[1].result.tools[1].annotations.readOnlyHint, true);
    assert.deepEqual(messages[1].result.tools.map(tool => tool.name), [
        'yi_cast', 'yi_reading'
    ]);
});

test('畸形 JSON、批量及非法 JSON-RPC 请求分别返回标准错误并继续服务', async () => {
    const badRequests = [null, [], [request(1, 'ping')], 7, 'ping', {},
        { jsonrpc: '1.0', id: 1, method: 'ping' }, request(null, 'ping'), request(true, 'ping'),
        request(1.5, 'ping'), request({}, 'ping'), { jsonrpc: '2.0', id: 1, method: 2 },
        { ...request(1, 'ping'), result: {} }];
    const raw = `{broken}\n${encode(badRequests)}${encode([request('end', 'ping')])}`;
    const { messages } = await transcript([], { raw });
    assert.equal(messages[0].error.code, -32700);
    assert.equal(messages[0].id, null);
    for (const message of messages.slice(1, -1)) assert.equal(message.error.code, -32600);
    assert.deepEqual(messages.at(-1), { jsonrpc: '2.0', id: 'end', result: {} });
});

test('非法 params、未知方法与未知工具不会调用 API', async () => {
    let called = 0;
    const api = { async invoke() { called += 1; return {}; } };
    const calls = [
        request(1, 'tools/call'), request(2, 'tools/call', []), request(3, 'tools/call', null),
        request(4, 'tools/call', { name: 'yi_info', arguments: [] }),
        request(5, 'tools/call', { name: 'yi_info', arguments: null }),
        request(6, 'tools/call', { name: 'yi_info', _meta: [] }),
        request(7, 'tools/call', { name: 'yi_info', _meta: { progressToken: {} } }),
        request(8, 'tools/call', { name: 'yi_info', task: {} }),
        request(9, 'tools/call', { name: 'not_a_tool' }), request(10, 'ping', false),
        request(11, 'not_a_method')
    ];
    const { messages } = await transcript([...ready(), ...calls], { api });
    for (const message of messages.slice(1, -1)) assert.equal(message.error.code, -32602);
    assert.equal(messages.at(-1).error.code, -32601);
    assert.equal(called, 0);
});

test('输入与业务错误通过 isError 返回，后续请求仍可执行', async () => {
    const api = { async invoke(name, args) { throw new YiInputError('测试参数错误', args.missing ? 'NOT_FOUND' : 'INVALID_INPUT'); } };
    const { messages, stderr } = await transcript([
        ...ready(), request(1, 'tools/call', { name: 'yi_info', arguments: {} }),
        request(2, 'tools/call', { name: 'yi_info', arguments: { missing: true } }), request(3, 'ping')
    ], { api });
    for (const [index, code] of [[1, 'INVALID_INPUT'], [2, 'NOT_FOUND']]) {
        assert.equal(messages[index].result.isError, true);
        assert.equal(messages[index].result.structuredContent.error.code, code);
        assert.deepEqual(JSON.parse(messages[index].result.content[0].text), messages[index].result.structuredContent);
    }
    assert.deepEqual(messages.at(-1).result, {});
    assert.equal(stderr, '');
});

test('内部错误仅在 stderr 记录诊断，stdout 返回通用内部错误且服务继续', async () => {
    for (const failure of [new Error('测试内部故障'), null]) {
        const { messages, stderr } = await transcript([
            ...ready(), request(1, 'tools/call', { name: 'yi_info' }), request(2, 'ping')
        ], { api: { async invoke() { throw failure; } } });
        assert.deepEqual(messages[1], { jsonrpc: '2.0', id: 1, error: { code: -32603, message: '服务器内部错误' } });
        assert.deepEqual(messages[2].result, {});
        assert.match(stderr, /YI MCP 内部错误/);
        assert.ok(!JSON.stringify(messages).includes('测试内部故障'));
    }
    const circular = {};
    circular.self = circular;
    const { messages } = await transcript([...ready(), request(1, 'tools/call', { name: 'yi_info' })], { api: { async invoke() { return circular; } } });
    assert.equal(messages[1].error.code, -32603);
});

test('通知不回包、不能执行工具，客户端响应也不触发响应循环', async () => {
    let called = 0;
    const { messages } = await transcript([
        notification('initialize', initialize().params), ...ready(),
        notification('ping'), notification('tools/call', { name: 'yi_cast' }),
        notification('tools/call', []), notification('unknown'),
        notification('notifications/cancelled', { requestId: 999 }),
        ...[{}, null, [], 7, false, 'done'].map((result, index) => ({ jsonrpc: '2.0', id: `response-${index}`, result })),
        { jsonrpc: '2.0', id: 5, error: { code: -32601, message: 'no method' } }, request(6, 'ping')
    ], { api: { async invoke() { called += 1; return {}; } } });
    assert.deepEqual(messages.map(message => message.id), ['init', 6]);
    assert.equal(called, 0);
});

test('UTF-8 中文跨字节分片、CRLF 与单次输入中的流水线请求均保持 ID 和内容', async () => {
    const calls = Array.from({ length: 40 }, (_, id) => request(id, 'tools/call', { name: 'yi_cast', arguments: { question: `学习易经 ${id}：乾坤☯` } }));
    const raw = encode([...ready(), ...calls]).replaceAll('\n', '\r\n');
    const { messages, stderr } = await transcript([], { raw, fragments: 1 });
    assert.equal(messages.length, 41);
    for (const [id, message] of messages.slice(1).entries()) {
        assert.equal(message.id, id);
        assert.equal(message.result.structuredContent.args.question, `学习易经 ${id}：乾坤☯`);
    }
    assert.equal(stderr, '');
});

test('慢速异步执行与慢速 stdout 不会交织响应或丢失 EOF 前的请求', async () => {
    let active = 0;
    let maximum = 0;
    const api = { async invoke(name, args) {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise(accept => setTimeout(accept, 2));
        active -= 1;
        return { name, args };
    } };
    const input = new PassThrough();
    const writes = [];
    const output = new Writable({ highWaterMark: 1, write(chunk, encoding, callback) {
        setTimeout(() => { writes.push(chunk.toString()); callback(); }, 2);
    } });
    const running = runMcpServer({ input, output, error: collector().stream, api });
    input.end(encode([...ready(), ...Array.from({ length: 15 }, (_, id) => request(id, 'tools/call', { name: 'yi_info' }))]));
    await running;
    const messages = parseOutput(writes.join(''));
    assert.equal(messages.length, 16);
    assert.equal(maximum, 1, '顺序分派使排队与输出均受背压约束');
    assert.deepEqual(messages.slice(1).map(message => message.id), Array.from({ length: 15 }, (_, id) => id));
});

test('非法 UTF-8 不被替换字符静默接受，后续有效请求可恢复', async () => {
    const raw = Buffer.concat([Buffer.from('{"value":"'), Buffer.from([0xff]), Buffer.from('"}\n'), Buffer.from(encode([request(1, 'ping')]))]);
    const { messages } = await transcript([], { raw });
    assert.equal(messages[0].error.code, -32700);
    assert.deepEqual(messages[1].result, {});
});

test('单条消息超过 1 MiB 时只报一次，丢弃到 LF 后可以恢复', async () => {
    const raw = `${'x'.repeat(MAX_MESSAGE_BYTES + 1000)}\n${encode([request(1, 'ping')])}`;
    const { messages } = await transcript([], { raw, fragments: 32000 });
    assert.equal(messages.length, 2);
    assert.equal(messages[0].error.code, -32600);
    assert.deepEqual(messages[0].error.data, { maxMessageBytes: MAX_MESSAGE_BYTES });
    assert.deepEqual(messages[1].result, {});
    const unfinished = await transcript([], { raw: 'x'.repeat(MAX_MESSAGE_BYTES + 1), fragments: 64000 });
    assert.equal(unfinished.messages.length, 1);
    assert.equal(unfinished.messages[0].error.code, -32600);
});

test('恰好达到上限的消息合法，按 UTF-8 字节而非字符计数', async () => {
    const ping = JSON.stringify(request(1, 'ping', { padding: '' }));
    const raw = `${ping.replace('"padding":""', `"padding":"${'x'.repeat(MAX_MESSAGE_BYTES - Buffer.byteLength(ping))}"`)}\n`;
    assert.equal(Buffer.byteLength(raw), MAX_MESSAGE_BYTES + 1);
    assert.deepEqual((await transcript([], { raw })).messages[0].result, {});
    const largeChinese = JSON.stringify(request(2, 'ping', { padding: '乾'.repeat(Math.floor(MAX_MESSAGE_BYTES / 2)) }));
    assert.ok(largeChinese.length < MAX_MESSAGE_BYTES);
    assert.equal((await transcript([], { raw: `${largeChinese}\n` })).messages[0].error.code, -32600);
});

test('空 EOF 正常结束，未完成的帧不执行并返回解析错误', async () => {
    assert.deepEqual(await transcript([], { raw: '' }), { messages: [], stderr: '' });
    for (const raw of ['{"jsonrpc":', JSON.stringify(request(1, 'ping'))]) {
        const { messages, stderr } = await transcript([], { raw });
        assert.equal(messages.length, 1);
        assert.equal(messages[0].error.code, -32700);
        assert.equal(stderr, '');
    }
});

test('客户端提前关闭输出管道按断连处理，不产生未捕获 EPIPE', async () => {
    const input = new PassThrough();
    const output = new Writable({ write(chunk, encoding, callback) { callback(Object.assign(new Error('closed'), { code: 'EPIPE' })); } });
    const errors = collector();
    const running = runMcpServer({ input, output, error: errors.stream, api: stubApi });
    input.end(encode([request(1, 'ping')]));
    await running;
    assert.equal(errors.text(), '');
    const idleInput = new PassThrough();
    const idleOutput = collector().stream;
    const idleRunning = runMcpServer({ input: idleInput, output: idleOutput, error: errors.stream, api: stubApi });
    await new Promise(accept => setImmediate(accept));
    idleOutput.emit('error', Object.assign(new Error('closed'), { code: 'EPIPE' }));
    await idleRunning;
});

test('真实数据的新旧操作通过子进程调用，任意 cwd、正常 EOF 退出且 stdout 纯协议', async () => {
    const argumentsByName = {
        yi_info: {}, yi_list_hexagrams: { offset: 0, limit: 2 }, yi_get_hexagram: { id: 1 },
        yi_search_hexagrams: { query: '潜龙' }, yi_analyze_lines: { values: [7, 7, 7, 7, 7, 7], question: '文化学习' },
        yi_cast: {}, yi_get_trigrams: { name: '乾' }, yi_get_classics: { section: 'shuogua' }, yi_reading: { values: [7, 7, 7, 7, 7, 7] }
    };
    const calls = OPERATIONS.map(({ name }, index) => request(index, 'tools/call', { name, arguments: argumentsByName[name] }));
    const result = await subprocess(mcpPath, { raw: encode([...ready(), ...calls]) });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, '');
    const messages = parseOutput(result.stdout);
    assert.equal(messages.length, 10);
    for (const message of messages.slice(1)) {
        assert.equal(message.result.isError, false);
        assert.deepEqual(JSON.parse(message.result.content[0].text), message.result.structuredContent);
    }
    assert.equal(messages[1].result.structuredContent.hexagrams, 64);
    assert.equal(messages[2].result.structuredContent.items.length, 2);
    assert.equal(messages[3].result.structuredContent.hexagram.name, '乾');
    assert.ok(messages[4].result.structuredContent.items.length > 0);
    assert.equal(messages[5].result.structuredContent.primary.id, 1);
    assert.equal(messages[6].result.structuredContent.values.length, 6);
    assert.ok(messages[6].result.structuredContent.values.every(value => [6, 7, 8, 9].includes(value)));
    assert.ok(messages[7].result.structuredContent.items['乾']);
    assert.ok(messages[8].result.structuredContent.appendix.shuogua.length > 0);
});

test('真实 API 校验错误与未命中返回业务错误而不终止服务', async () => {
    const api = await createYiApi();
    const { messages } = await transcript([
        ...ready(), request(1, 'tools/call', { name: 'yi_get_hexagram', arguments: { id: 999 } }),
        request(2, 'tools/call', { name: 'yi_get_hexagram', arguments: { name: '不存在的卦' } }),
        request(3, 'tools/call', { name: 'yi_analyze_lines', arguments: { values: [6] } }),
        request(4, 'tools/call', { name: 'yi_cast', arguments: { file: 'history.json' } }), request(5, 'ping')
    ], { api });
    for (const message of messages.slice(1, -1)) assert.equal(message.result.isError, true);
    assert.equal(messages[1].result.structuredContent.error.code, 'INVALID_INPUT');
    assert.equal(messages[2].result.structuredContent.error.code, 'NOT_FOUND');
    assert.deepEqual(messages.at(-1).result, {});
});

test('通过真实目录联接启动 MCP 时仍完成握手与工具调用', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yi-mcp-linked-'));
    const linkedDirectory = join(directory, 'linked-yi');
    try {
        // Windows 创建目录联接；Unix 的 type 参数会被忽略并创建目录符号链接。
        await symlink(dirname(mcpPath), linkedDirectory, 'junction');
        const result = await subprocess(join(linkedDirectory, 'mcp.mjs'), {
            raw: encode([...ready(), request(1, 'tools/list'), request(2, 'tools/call', { name: 'yi_info' })])
        });
        assert.equal(result.code, 0, result.stderr);
        assert.equal(result.stderr, '');
        const messages = parseOutput(result.stdout);
        assert.equal(messages.length, 3, '目录联接入口不得静默退出');
        assert.equal(messages[0].result.protocolVersion, SUPPORTED_PROTOCOL_VERSIONS[0]);
        assert.equal(messages[1].result.tools.length, 2);
        assert.equal(messages[2].result.structuredContent.hexagrams, 64);
    } finally {
        // 只删除联接本身，不遍历或删除其目标目录。
        await unlink(linkedDirectory).catch(failure => { if (failure.code !== 'ENOENT') throw failure; });
        await rmdir(directory);
    }
});

test('启动失败仅写 stderr 并非零退出，不输出初始化成功假象', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yi-mcp-startup-'));
    const fixtureMcp = join(directory, 'mcp.mjs');
    const fixtureApi = join(directory, 'api.mjs');
    try {
        await writeFile(fixtureMcp, await readFile(mcpPath));
        await writeFile(join(directory, 'render.mjs'), await readFile(new URL('../render.mjs', import.meta.url)));
        await writeFile(fixtureApi, `export const OPERATIONS = [];\nexport const MCP_OPERATIONS = [];\nexport const VERSION = 'test';\nexport class YiInputError extends Error {}\nexport async function createYiApi() { throw new Error('测试初始化失败'); }\n`);
        const result = await subprocess(fixtureMcp);
        assert.equal(result.code, 1);
        assert.equal(result.stdout, '');
        assert.match(result.stderr, /YI MCP 启动或传输失败：测试初始化失败/);
    } finally {
        await unlink(fixtureMcp).catch(() => {});
        await unlink(fixtureApi).catch(() => {});
        await unlink(join(directory, 'render.mjs')).catch(() => {});
        await rmdir(directory);
    }
});


test('真实 API 的两步工作流保留事件并返回可供 AI 解读的完整资料', async () => {
    const api = await createYiApi();
    const first = await transcript([...ready(), request(1, 'tools/list'), request(2, 'tools/call', { name: 'yi_cast', arguments: { question: '学习规划', notes: '只有两个小时' } })], { api });
    assert.deepEqual(first.messages[1].result.tools.map(tool => tool.name), ['yi_cast', 'yi_reading']);
    const cast = first.messages[2].result.structuredContent;
    assert.equal(cast.record.notes, '只有两个小时');
    assert.equal(cast.storage.status, 'not_saved');
    const second = await transcript([...ready(), request(1, 'tools/call', { name: cast.next.tool, arguments: cast.next.arguments })], { api });
    const reading = second.messages[1].result.structuredContent;
    assert.equal(reading.primary.id, cast.primary.id);
    assert.deepEqual(reading.values, cast.values);
    assert.equal(Object.keys(reading.related).length, 3);
    assert.ok(reading.guide.readings.length);
    assert.equal(reading.interpretation.generated, false);
    assert.equal(first.stderr + second.stderr, '');
});

test('两种协议的真实 stdio 子进程默认返回原生 PNG 且 JSON 不重复 base64', async () => {
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
        const result = await subprocess(mcpPath, { raw: encode([...ready(version),
            request(1, 'tools/call', { name: 'yi_cast', arguments: { question: '合成测试事件' } }),
            request(2, 'tools/call', { name: 'yi_reading', arguments: { values: [6, 7, 8, 9, 7, 8] } })]) });
        assert.equal(result.code, 0);
        assert.equal(result.stderr, '');
        for (const message of parseOutput(result.stdout).slice(1)) {
            const { content, structuredContent, isError } = message.result;
            assert.equal(isError, false);
            assert.deepEqual(JSON.parse(content[0].text), structuredContent);
            assert.equal(content.length, 2);
            assert.equal(content[1].type, 'image');
            assert.equal(content[1].mimeType, 'image/png');
            assert.deepEqual([...Buffer.from(content[1].data, 'base64').subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
            assert.equal(structuredContent.rendering.image.contentIndex, 1);
            assert.equal(structuredContent.rendering.image.bytes, Buffer.from(content[1].data, 'base64').length);
            assert.ok(!content[0].text.includes(content[1].data));
            assert.ok(Buffer.byteLength(JSON.stringify(message)) < MAX_MESSAGE_BYTES);
        }
    }
});

test('关闭图片保留渲染数据；非法图片选项与原始参数均失败且服务可继续', async () => {
    const api = await createYiApi();
    const values = [7, 7, 7, 7, 7, 7];
    const { messages } = await transcript([...ready(),
        request(1, 'tools/call', { name: 'yi_reading', arguments: { values, image: 'none' } }),
        ...['svg', true, null, {}].map((image, index) => request(index + 2, 'tools/call', { name: 'yi_cast', arguments: { image } })),
        request(6, 'tools/call', { name: 'yi_reading', arguments: { values, image: 'png', path: 'private' } }),
        request(7, 'tools/call', { name: 'yi_reading', arguments: { values, image: 'png' } })], { api });
    assert.equal(messages[1].result.content.length, 1);
    assert.equal(messages[1].result.structuredContent.rendering.image.status, 'omitted');
    assert.equal(messages[1].result.structuredContent.rendering.figures.length, 5);
    for (const message of messages.slice(2, 7)) {
        assert.equal(message.result.isError, true);
        assert.equal(message.result.content.length, 1);
    }
    assert.equal(messages[7].result.content[1].type, 'image');
});

test('绘图失败保留原卦与占记，不触发再次起卦或伪装成工具整体失败', async () => {
    let calls = 0;
    const real = await createYiApi();
    const api = { async invoke(...args) { calls += 1; return real.invoke(...args); } };
    const { messages } = await transcript([...ready(), request(1, 'tools/call', { name: 'yi_cast', arguments: { question: '原卦不可丢失' } })], {
        api, renderImage() { throw new Error('合成绘图失败'); }
    });
    const result = messages[1].result;
    assert.equal(calls, 1);
    assert.equal(result.isError, false);
    assert.equal(result.content.length, 1);
    assert.equal(result.structuredContent.record.question, '原卦不可丢失');
    assert.equal(result.structuredContent.values.length, 6);
    assert.equal(result.structuredContent.rendering.image.status, 'failed');
    assert.match(result.structuredContent.rendering.image.message, /不要重新起卦/);
    assert.equal(result.structuredContent.storage.status, 'not_saved');
});
