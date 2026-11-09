import { readFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const YiCore = require('../../apps/yi/js/core/yijing-core.js');
const createDataService = require('../../apps/yi/js/services/hexagram-data-service-module.js');
const DATA_DIRECTORY = fileURLToPath(new URL('../../apps/yi/data/', import.meta.url));
export const VERSION = '2.2.0';

export class YiInputError extends Error {
    constructor(message, code = 'INVALID_INPUT') {
        super(message);
        this.name = 'YiInputError';
        this.code = code;
    }
}

const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const text = (maxLength, minLength = 1) => ({ type: 'string', minLength, maxLength });
const object = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const sections = ['xici_shang', 'xici_xia', 'shuogua', 'xugua', 'zagua'];
const trigram = { type: 'string', enum: ['乾', '坤', '震', '巽', '坎', '离', '艮', '兑'] };

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
}

export const OPERATIONS = deepFreeze([
    { name: 'yi_info', description: '查看易之版本、可用能力与六爻位序。所有操作仅用于文化学习与自省，不提供现实预测或专业决策。', inputSchema: object() },
    { name: 'yi_list_hexagrams', description: '按文王卦序列出六十四卦摘要，支持分页。', inputSchema: object({ offset: integer(0, 63), limit: integer(1, 64) }) },
    { name: 'yi_get_hexagram', description: '按 id、准确卦名 name、六位 binary 或 upper+lower 查询一卦全文与错综互。四种选择方式只可使用一种。binary 自上而下，前3位为上卦。', inputSchema: { ...object({ id: integer(1, 64), name: text(30), binary: { type: 'string', pattern: '^[01]{6}$' }, upper: trigram, lower: trigram }), oneOf: [{ required: ['id'] }, { required: ['name'] }, { required: ['binary'] }, { required: ['upper', 'lower'] }] } },
    { name: 'yi_search_hexagrams', description: '搜索卦名、卦序、卦辞、爻辞与经传，返回排序摘要及命中片段。', inputSchema: object({ query: text(200), limit: integer(1, 64) }, ['query']) },
    { name: 'yi_analyze_lines', description: '分析给定六爻，返回本卦、之卦、变爻、爻位及应读经文。values 必须是初爻到上爻的六个整数：6老阴、7少阳、8少阴、9老阳；与 binary 方向相反。', inputSchema: object({ values: { type: 'array', items: { type: 'integer', enum: [6, 7, 8, 9] }, minItems: 6, maxItems: 6 }, question: text(500, 0) }, ['values']) },
    { name: 'yi_cast', description: '以安全随机源按三钱法一次起六爻，返回本卦、之卦及经文。每次结果不同，不保存、不读取浏览器占记。仅供文化学习与自省。', inputSchema: object({ question: text(500, 0) }), annotations: { ...annotations, idempotentHint: false } },
    { name: 'yi_get_trigrams', description: '查看八卦属性；可指定准确卦名。', inputSchema: object({ name: trigram }) },
    { name: 'yi_get_classics', description: '读取经传出处与系辞上/下、说卦、序卦、杂卦附录。可用 section 选择一篇。', inputSchema: object({ section: { type: 'string', enum: sections } }) }
].map(operation => ({ ...operation, annotations: operation.annotations || { ...annotations } })));

function validate(schema, value, label = 'arguments') {
    const fail = message => { throw new YiInputError(`${label} ${message}`); };
    if (schema.type === 'object') {
        if (value === null || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('必须是 JSON 对象');
        if (Reflect.ownKeys(value).some(key => {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            return typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value');
        })) fail('仅允许可枚举的 JSON 数据字段');
        const properties = schema.properties || {};
        for (const key of Object.keys(value)) {
            if (!Object.hasOwn(properties, key)) fail(`含未知参数 ${key}`);
            validate(properties[key], value[key], key);
        }
        for (const key of schema.required || []) if (!Object.hasOwn(value, key)) fail(`缺少 ${key}`);
    } else if (schema.type === 'integer') {
        if (!Number.isSafeInteger(value)) fail('必须是整数');
        if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) fail(`必须在 ${schema.minimum}–${schema.maximum} 之间`);
    } else if (schema.type === 'string') {
        if (typeof value !== 'string') fail('必须是字符串');
        const length = [...value].length;
        if (length < (schema.minLength ?? 0) || length > (schema.maxLength ?? Infinity)) fail('长度不合法');
        if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail('格式不合法');
    } else if (schema.type === 'array') {
        if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) fail(`必须恰好有 ${schema.minItems} 项`);
        if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) fail('必须是完整的 JSON 数组');
        for (let index = 0; index < value.length; index += 1) {
            const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
            if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('数组项必须是 JSON 数据字段');
        }
        for (let index = 0; index < value.length; index += 1) validate(schema.items, value[index], `${label}[${index}]`);
    }
    if (schema.enum && !schema.enum.includes(value)) fail(`必须为 ${schema.enum.join('、')} 之一`);
}

const clone = value => structuredClone(value);
const summary = hexagram => ({ id: hexagram.id, name: hexagram.name, fullName: hexagram.fullName, binary: hexagram.binary, upperTrigram: hexagram.upperTrigram, lowerTrigram: hexagram.lowerTrigram, judgment: hexagram.judgment, relations: hexagram.relations });

// 仅固定数据目录可通过 transport 访问；dataDirectory 仅供程序化调用与损坏快照测试。
export async function createYiApi({ dataDirectory = DATA_DIRECTORY } = {}) {
    const service = createDataService({
        core: YiCore,
        app: { events: { emit() {} }, errors: { handle(error) { throw error; } } },
        loadDataset: async key => JSON.parse(await readFile(join(dataDirectory, `${key}.json`), 'utf8'))
    });
    await service.init();
    if (!service.isInitialized) throw new Error('卦象数据初始化失败');

    function getHexagram(args) {
        const keys = Object.keys(args);
        const selectors = ['id', 'name', 'binary'].filter(key => Object.hasOwn(args, key));
        if (Object.hasOwn(args, 'upper') || Object.hasOwn(args, 'lower')) {
            if (keys.length !== 2 || !args.upper || !args.lower) throw new YiInputError('上下卦需成对指定，且不可混用其他查询参数');
        } else if (selectors.length !== 1 || keys.length !== 1) {
            throw new YiInputError('请仅指定 id、name、binary 或 upper+lower 一种查询方式');
        }
        const hexagram = Object.hasOwn(args, 'id') ? service.getHexagramById(args.id)
            : Object.hasOwn(args, 'binary') ? service.getHexagramByBinary(args.binary)
                : Object.hasOwn(args, 'name') ? service.getAllHexagrams().find(item => item.name === args.name || item.fullName === args.name)
                    : service.getHexagramByTrigrams(args.upper, args.lower);
        if (!hexagram) throw new YiInputError('未找到匹配的卦象', 'NOT_FOUND');
        return { hexagram, related: service.getRelatedHexagrams(hexagram.id) };
    }

    function analyze(values, question = '') {
        const lines = values.map(value => YiCore.lineFromValue(value));
        const primary = service.getHexagramByBinary(YiCore.toBinary(lines));
        const changed = service.getHexagramByBinary(YiCore.toBinary(YiCore.transformLines(lines)));
        const guide = YiCore.readingGuide(lines);
        const readings = guide.focus.map(focus => {
            const hexagram = focus.target === 'changed' ? changed : primary;
            const base = { ...focus, hexagram: summary(hexagram) };
            if (focus.kind === 'line') return { ...base, ...hexagram.lines[focus.position - 1] };
            if (focus.kind === 'special') return { ...base, ...(hexagram.classic?.extra || { title: focus.label, text: focus.text }) };
            return { ...base, text: hexagram.judgment || hexagram.explanation, xiang: hexagram.classic?.daxiang || '' };
        });
        return { method: 'three-coins', lineOrder: 'bottom-to-top', question, values, lines, primary, changed, changingPositions: guide.changing, positions: YiCore.positionSummary(primary.bits), guide: { ...guide, readings } };
    }

    const handlers = {
        yi_info: () => ({ name: '易之 YI', version: VERSION, schemaVersion: 1, hexagrams: service.getAllHexagrams().length, trigrams: Object.keys(service.getBaguaData()).length, classicsAvailable: Boolean(service.getClassics()), lineOrder: 'bottom-to-top', binaryOrder: 'top-to-bottom', lineValues: { 6: '老阴', 7: '少阳', 8: '少阴', 9: '老阳' }, operations: OPERATIONS.map(item => item.name), scope: '仅用于文化学习与自省。离线、只读、无网络和历史存储，不提供现实预测或专业决策。' }),
        yi_list_hexagrams: ({ offset = 0, limit = 64 }) => ({ total: 64, offset, items: service.getAllHexagrams().slice(offset, offset + limit).map(summary) }),
        yi_get_hexagram: getHexagram,
        yi_search_hexagrams: ({ query, limit = 10 }) => {
            if (!query.trim()) throw new YiInputError('搜索词不能为空白');
            const results = service.searchHexagrams(query);
            return { query, total: results.length, items: results.slice(0, limit).map(({ hexagram, ...match }) => ({ ...match, hexagram: summary(hexagram) })) };
        },
        yi_analyze_lines: ({ values, question }) => analyze(values, question),
        yi_cast: ({ question }) => analyze(Array.from({ length: 6 }, () => YiCore.lineFromCoins(Array.from({ length: 3 }, () => randomInt(2) === 1)).value), question),
        yi_get_trigrams: ({ name }) => ({ items: name ? { [name]: service.getBagua(name) } : service.getBaguaData() }),
        yi_get_classics: ({ section }) => {
            const classics = service.getClassics();
            if (!classics) throw new YiInputError('经传原文不可用', 'NOT_FOUND');
            return { source: classics.source, appendix: section ? { [section]: classics.appendix[section] } : classics.appendix };
        }
    };
    return Object.freeze({
        async invoke(name, args = {}) {
            const operation = OPERATIONS.find(item => item.name === name);
            if (!operation) throw new YiInputError(`未知操作：${name}`);
            validate(operation.inputSchema, args);
            return clone(handlers[name](args));
        }
    });
}
