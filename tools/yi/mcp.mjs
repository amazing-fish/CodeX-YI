#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createYiApi, OPERATIONS, VERSION, YiInputError } from './api.mjs';

// 仅实现本地 stdio 工具服务；不监听端口，不访问客户端文件，不执行命令。
export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([
    '2025-11-25', '2025-06-18'
]);
export const MAX_MESSAGE_BYTES = 1024 * 1024;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' || Number.isSafeInteger(value);
const errorMessage = failure => failure instanceof Error ? failure.message : '未知内部错误';
const rpcError = (id, code, message, data) => ({
    jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) }
});

class ProtocolError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

const invalidParams = message => { throw new ProtocolError(-32602, message); };

function validateParams(message) {
    if (Object.hasOwn(message, 'params') && !isObject(message.params)) invalidParams('params 必须是对象');
    const params = message.params || {};
    if (Object.hasOwn(params, '_meta') && !isObject(params._meta)) invalidParams('_meta 必须是对象');
    if (params._meta && Object.hasOwn(params._meta, 'progressToken') && !validId(params._meta.progressToken)) {
        invalidParams('progressToken 必须是字符串或整数');
    }
    return params;
}

function validateInitialize(params) {
    if (typeof params.protocolVersion !== 'string' || !params.protocolVersion) invalidParams('缺少 protocolVersion');
    if (!isObject(params.capabilities)) invalidParams('capabilities 必须是对象');
    if (!isObject(params.clientInfo) || typeof params.clientInfo.name !== 'string' || !params.clientInfo.name
        || typeof params.clientInfo.version !== 'string') invalidParams('clientInfo 必须包含 name 与 version');
}

function toolResult(value, isError = false) {
    return {
        content: [{ type: 'text', text: JSON.stringify(value) }],
        structuredContent: value,
        isError
    };
}

/**
 * 输入/输出流与 api 可注入以验证协议。正常 EOF 会等待所有已接收请求及输出完成。
 * 顺序执行和输出背压限制排队内存；可接收分片与流水线请求，不承诺并行执行。
 */
export async function runMcpServer({ input = process.stdin, output = process.stdout, error = process.stderr, api } = {}) {
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('YI MCP 需要 Node.js 22 或更新版本');
    const yi = await (api ?? createYiApi());
    if (!yi || typeof yi.invoke !== 'function') throw new Error('YI API 初始化失败');

    let state = 'new';
    let protocolVersion;
    let outputError;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const pending = Buffer.allocUnsafe(MAX_MESSAGE_BYTES);
    let pendingBytes = 0;
    let discarding = false;

    const onOutputError = failure => {
        outputError = failure;
        input.destroy();
    };
    output.on('error', onOutputError);

    async function send(message) {
        if (outputError) throw outputError;
        const line = `${JSON.stringify(message)}\n`;
        await new Promise((accept, reject) => {
            output.write(line, 'utf8', failure => failure ? reject(failure) : accept());
        });
    }

    async function dispatch(message) {
        const object = isObject(message);
        const id = object && validId(message.id) ? message.id : null;
        // 服务端不发送请求，因此合法的客户端响应只需忽略，不能再回复造成循环。
        if (object && message.jsonrpc === '2.0' && !Object.hasOwn(message, 'method') && validId(message.id)
            && ((Object.hasOwn(message, 'result') && !Object.hasOwn(message, 'error'))
                || (isObject(message.error) && Number.isInteger(message.error.code)
                    && typeof message.error.message === 'string' && !Object.hasOwn(message, 'result')))) return;
        if (!object || message.jsonrpc !== '2.0' || typeof message.method !== 'string'
            || Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error')
            || (Object.hasOwn(message, 'id') && !validId(message.id))) {
            await send(rpcError(id, -32600, '无效的 JSON-RPC 2.0 请求；不支持批量请求'));
            return;
        }

        // 所有通知均不回包，且不能以省略 id 的方式调用工具。
        if (!Object.hasOwn(message, 'id')) {
            if (message.method === 'notifications/initialized' && state === 'initializing') {
                try {
                    validateParams(message);
                    state = 'ready';
                } catch { /* 非法通知不改变生命周期，也不回包。 */ }
            }
            return;
        }

        let response;
        try {
            const params = validateParams(message);
            let result;
            if (message.method === 'ping') {
                result = {};
            } else if (message.method === 'initialize') {
                if (state !== 'new') throw new ProtocolError(-32600, '本连接已初始化');
                validateInitialize(params);
                protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(params.protocolVersion)
                    ? params.protocolVersion : SUPPORTED_PROTOCOL_VERSIONS[0];
                state = 'initializing';
                result = {
                    protocolVersion,
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: { name: 'yi', version: VERSION },
                    instructions: '易之离线工具仅用于文化学习与自省。六爻 values 自下而上；binary 自上而下。无网络、无占记存储，不提供现实预测或专业决策。'
                };
            } else {
                if (state !== 'ready') throw new ProtocolError(-32002, '服务尚未初始化，请先完成 initialize 与 notifications/initialized');
                if (message.method === 'tools/list') {
                    if (Object.hasOwn(params, 'cursor')) invalidParams('工具一次性返回完整列表，不支持 cursor');
                    result = { tools: OPERATIONS.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })) };
                } else if (message.method === 'tools/call') {
                    if (typeof params.name !== 'string' || !params.name) invalidParams('工具 name 必须是非空字符串');
                    if (Object.hasOwn(params, 'arguments') && !isObject(params.arguments)) invalidParams('工具 arguments 必须是对象');
                    if (Object.hasOwn(params, 'task')) invalidParams('本服务不支持 task 增强调用');
                    if (!OPERATIONS.some(operation => operation.name === params.name)) invalidParams(`未知工具：${params.name}`);
                    try {
                        const value = await yi.invoke(params.name, params.arguments || {});
                        if (!isObject(value)) throw new Error('YI API 返回值必须是 JSON 对象');
                        result = toolResult(value);
                    } catch (failure) {
                        if (!(failure instanceof YiInputError)) throw failure;
                        result = toolResult({ error: { code: failure.code, message: failure.message } }, true);
                    }
                } else {
                    throw new ProtocolError(-32601, `未知方法：${message.method}`);
                }
            }
            response = { jsonrpc: '2.0', id, result };
            // 在写出前验证整个响应可序列化，内部错误不能破坏 stdout 协议。
            JSON.stringify(response);
        } catch (failure) {
            if (failure instanceof ProtocolError) {
                response = rpcError(id, failure.code, failure.message);
            } else {
                error.write(`YI MCP 内部错误：${errorMessage(failure)}\n`);
                response = rpcError(id, -32603, '服务器内部错误');
            }
        }
        await send(response);
    }

    async function consumeLine(bytes) {
        let message;
        try {
            message = JSON.parse(decoder.decode(bytes));
        } catch {
            await send(rpcError(null, -32700, '无法解析 UTF-8 JSON 消息'));
            return;
        }
        await dispatch(message);
    }

    try {
        for await (const chunk of input) {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            let offset = 0;
            while (offset < bytes.length) {
                const newline = bytes.indexOf(10, offset);
                const end = newline === -1 ? bytes.length : newline;
                const length = end - offset;
                if (!discarding) {
                    if (pendingBytes + length > MAX_MESSAGE_BYTES) {
                        pendingBytes = 0;
                        discarding = true;
                        await send(rpcError(null, -32600, '消息超过 1 MiB 上限', { maxMessageBytes: MAX_MESSAGE_BYTES }));
                    } else {
                        bytes.copy(pending, pendingBytes, offset, end);
                        pendingBytes += length;
                    }
                }
                if (newline !== -1) {
                    if (!discarding) {
                        const lineEnd = pendingBytes && pending[pendingBytes - 1] === 13 ? pendingBytes - 1 : pendingBytes;
                        await consumeLine(pending.subarray(0, lineEnd));
                    }
                    pendingBytes = 0;
                    discarding = false;
                }
                offset = newline === -1 ? bytes.length : newline + 1;
            }
        }
        if (outputError) throw outputError;
        if (pendingBytes) await send(rpcError(null, -32700, '输入在消息换行前结束'));
    } catch (failure) {
        // 客户端已关闭输出管道时按连接结束处理，避免 EPIPE 变为未捕获异常。
        if (!['EPIPE', 'ERR_STREAM_DESTROYED'].includes((outputError || failure)?.code)) throw failure;
    } finally {
        input.pause();
        // write 回调早于 error 事件；留一个事件循环周期再移除错误监听器。
        await new Promise(accept => setImmediate(accept));
        output.off('error', onOutputError);
    }
}

function isMainModule() {
    try {
        // npm link / 目录联接会让 argv 保留链接路径，而模块 URL 已解析到真实路径。
        return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        // 程序化导入时 argv 也可能不是可解析的脚本路径，不应因此启动或中断服务。
        return false;
    }
}

if (isMainModule()) {
    try {
        await runMcpServer();
    } catch (failure) {
        process.stderr.write(`YI MCP 启动或传输失败：${errorMessage(failure)}\n`);
        process.exitCode = 1;
        process.stdin.pause();
    }
}
