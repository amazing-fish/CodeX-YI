import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createContext, runInContext } from 'node:vm';
import { createYiApi, OPERATIONS, VERSION, YiInputError } from '../api.mjs';
import { renderText } from '../cli.mjs';

const require = createRequire(import.meta.url);
const YiCore = require('../../../apps/yi/js/core/yijing-core.js');
const createDataService = require('../../../apps/yi/js/services/hexagram-data-service-module.js');
const dataDirectory = fileURLToPath(new URL('../../../apps/yi/data/', import.meta.url));
const apiUrl = new URL('../api.mjs', import.meta.url).href;
const datasets = Object.fromEntries(await Promise.all(['hexagrams', 'bagua', 'zhouyi'].map(async name => [name, JSON.parse(await readFile(join(dataDirectory, `${name}.json`), 'utf8'))])));
const api = await createYiApi();
const operationNames = ['yi_info', 'yi_list_hexagrams', 'yi_get_hexagram', 'yi_search_hexagrams', 'yi_analyze_lines', 'yi_cast', 'yi_get_trigrams', 'yi_get_classics', 'yi_reading'];
const appendixNames = ['xici_shang', 'xici_xia', 'shuogua', 'xugua', 'zagua'];
const trigramBinaries = { 乾: '111', 坤: '000', 震: '001', 巽: '110', 坎: '010', 离: '101', 艮: '100', 兑: '011' };
const validArguments = {
    yi_info: {}, yi_list_hexagrams: {}, yi_get_hexagram: { id: 1 },
    yi_search_hexagrams: { query: '乾' }, yi_analyze_lines: { values: [7, 8, 7, 8, 7, 8] },
    yi_cast: {}, yi_get_trigrams: {}, yi_get_classics: {}, yi_reading: { values: [7, 8, 7, 8, 7, 8] }
};

async function invalid(name, args, code = 'INVALID_INPUT') {
    await assert.rejects(api.invoke(name, args), error => error instanceof YiInputError && error.code === code, name);
}

async function fixture(t, change) {
    const directory = await mkdtemp(join(tmpdir(), 'yi-api-test-'));
    t.after(async () => {
        // 清理仅限本测试明确创建的临时目录，不触碰项目或用户数据。
        assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
        assert.ok(basename(directory).startsWith('yi-api-test-'));
        await rm(directory, { recursive: true, force: true });
    });
    await Promise.all(Object.keys(datasets).map(name => copyFile(join(dataDirectory, `${name}.json`), join(directory, `${name}.json`))));
    await change(directory);
    return directory;
}

async function replaceDataset(directory, name, change) {
    const copy = structuredClone(datasets[name]);
    change(copy);
    await writeFile(join(directory, `${name}.json`), JSON.stringify(copy));
}

function expectedFocus(primary, changing) {
    const stable = [1, 2, 3, 4, 5, 6].filter(position => !changing.includes(position));
    switch (changing.length) {
        case 0: return [{ target: 'primary', kind: 'overview' }];
        case 1: return [{ target: 'primary', kind: 'line', position: changing[0], main: true }];
        case 2: return [{ target: 'primary', kind: 'line', position: changing[1], main: true }, { target: 'primary', kind: 'line', position: changing[0], main: false }];
        case 3: return [{ target: 'primary', kind: 'overview', role: '贞' }, { target: 'changed', kind: 'overview', role: '悔' }];
        case 4: return [{ target: 'changed', kind: 'line', position: stable[0], main: true }, { target: 'changed', kind: 'line', position: stable[1], main: false }];
        case 5: return [{ target: 'changed', kind: 'line', position: stable[0], main: true }];
        default:
            if (primary === '111111') return [{ target: 'primary', kind: 'special', label: '用九', text: '见群龙无首，吉。' }];
            if (primary === '000000') return [{ target: 'primary', kind: 'special', label: '用六', text: '利永贞。' }];
            return [{ target: 'changed', kind: 'overview' }];
    }
}

function assertAnalysis(result, values) {
    const bits = values.map(value => value % 2);
    const changedBits = values.map(value => value === 6 ? 1 : value === 9 ? 0 : value % 2);
    const primary = bits.toReversed().join('');
    const changed = changedBits.toReversed().join('');
    const changing = values.flatMap((value, index) => value === 6 || value === 9 ? [index + 1] : []);
    assert.equal(result.method, 'three-coins');
    assert.equal(result.lineOrder, 'bottom-to-top');
    assert.deepEqual(result.values, values);
    assert.equal(result.primary.binary, primary);
    assert.equal(result.changed.binary, changed);
    assert.deepEqual(result.primary.bits, bits);
    assert.deepEqual(result.changed.bits, changedBits);
    assert.deepEqual(result.changingPositions, changing);
    assert.deepEqual(result.guide.changing, changing);
    assert.equal(result.guide.count, changing.length);
    assert.equal(result.guide.rule.count, changing.length);
    assert.deepEqual(result.guide.stable, [1, 2, 3, 4, 5, 6].filter(position => !changing.includes(position)));
    assert.deepEqual(result.guide.focus, expectedFocus(primary, changing));
    const positions = bits.map((bit, index) => {
        const position = index + 1;
        const partner = position > 3 ? position - 3 : position + 3;
        return { position, yang: bit === 1, proper: bit === position % 2, central: position === 2 || position === 5, partner, corresponds: bit !== bits[partner - 1] };
    });
    assert.deepEqual(result.positions.positions, positions);
    assert.equal(result.positions.proper, positions.filter(item => item.proper).length);
    assert.equal(result.positions.improper, 6 - result.positions.proper);
    assert.equal(result.positions.pairs, positions.slice(0, 3).filter(item => item.corresponds).length);
    assert.equal(result.guide.readings.length, result.guide.focus.length);
    result.guide.readings.forEach((reading, index) => {
        const focus = result.guide.focus[index];
        const hexagram = focus.target === 'changed' ? result.changed : result.primary;
        assert.equal(reading.hexagram.id, hexagram.id);
        assert.equal(reading.kind, focus.kind);
        if (focus.kind === 'line') {
            const line = hexagram.lines[focus.position - 1];
            assert.equal(reading.position, focus.position);
            assert.equal(reading.main, focus.main);
            for (const field of ['title', 'text', 'gloss', 'xiang', 'content']) assert.equal(reading[field], line[field]);
        } else if (focus.kind === 'special') {
            assert.equal(reading.title, hexagram.classic?.extra?.title || focus.label);
            assert.equal(reading.text, hexagram.classic?.extra?.text || focus.text);
        } else {
            assert.equal(reading.text, hexagram.judgment || hexagram.explanation);
            assert.equal(reading.xiang, hexagram.classic?.daxiang || '');
        }
    });
}

test('操作元数据保持封闭 schema 与正确副作用标记', () => {
    assert.deepEqual(OPERATIONS.map(item => item.name), operationNames);
    const assertFrozen = value => {
        if (value === null || typeof value !== 'object') return;
        assert.ok(Object.isFrozen(value), '导出的工具元数据及嵌套 schema 必须不可变');
        Object.values(value).forEach(assertFrozen);
    };
    assertFrozen(OPERATIONS);
    for (const operation of OPERATIONS) {
        assert.equal(operation.inputSchema.type, 'object');
        assert.equal(operation.inputSchema.additionalProperties, false);
        assert.ok(operation.description.length > 0);
        assert.deepEqual(operation.annotations, { readOnlyHint: operation.name !== 'yi_cast', destructiveHint: false, idempotentHint: operation.name !== 'yi_cast', openWorldHint: false });
    }
});

test('info 报告版本、操作与两步流程、数据规模及双向位序', async () => {
    const info = await api.invoke('yi_info');
    assert.equal(info.version, VERSION);
    assert.equal(info.schemaVersion, 1);
    assert.equal(info.hexagrams, 64);
    assert.equal(info.trigrams, 8);
    assert.equal(info.classicsAvailable, true);
    assert.deepEqual(info.operations, operationNames);
    assert.equal(info.lineOrder, 'bottom-to-top');
    assert.equal(info.binaryOrder, 'top-to-bottom');
    assert.deepEqual(info.lineValues, { 6: '老阴', 7: '少阳', 8: '少阴', 9: '老阳' });
    assert.match(info.scope, /文化学习/);
    assert.match(info.scope, /默认不保存/);
    assert.deepEqual(info.workflow, ['yi_cast', 'yi_reading']);
});

test('列表按文王卦序返回 64 卦且分页边界不丢不重', async () => {
    const all = await api.invoke('yi_list_hexagrams');
    assert.equal(all.total, 64);
    assert.equal(all.offset, 0);
    assert.deepEqual(all.items.map(item => item.id), Array.from({ length: 64 }, (_, index) => index + 1));
    const pages = await Promise.all(Array.from({ length: 8 }, (_, index) => api.invoke('yi_list_hexagrams', { offset: index * 8, limit: 8 })));
    assert.deepEqual(pages.flatMap(page => page.items), all.items);
    assert.deepEqual((await api.invoke('yi_list_hexagrams', { offset: 63, limit: 64 })).items, all.items.slice(63));
    assert.deepEqual((await api.invoke('yi_list_hexagrams', { offset: 0, limit: 1 })).items, all.items.slice(0, 1));
});

test('64 卦按 id、准确卦名、全名、binary、上下卦查询完全一致', async () => {
    const all = (await api.invoke('yi_list_hexagrams')).items;
    for (const item of all) {
        const canonical = await api.invoke('yi_get_hexagram', { id: item.id });
        for (const args of [{ name: item.name }, { name: item.fullName }, { binary: item.binary }, { upper: item.upperTrigram, lower: item.lowerTrigram }]) {
            assert.deepEqual(await api.invoke('yi_get_hexagram', args), canonical, JSON.stringify(args));
        }
        assert.equal(canonical.hexagram.lines.length, 6);
        assert.deepEqual(canonical.hexagram.bits, [...item.binary].reverse().map(Number));
        assert.equal(item.binary.slice(0, 3), trigramBinaries[item.upperTrigram]);
        assert.equal(item.binary.slice(3), trigramBinaries[item.lowerTrigram]);
        assert.equal(canonical.hexagram.judgment, datasets.zhouyi.hexagrams[item.id].judgment);
    }
    await invalid('yi_get_hexagram', { name: '不存在' }, 'NOT_FOUND');
    await invalid('yi_get_hexagram', { name: '乾 ' }, 'NOT_FOUND');
});

test('64×3 错综互关系正确，关系摘要与完整卦引用一致', async () => {
    const all = (await api.invoke('yi_list_hexagrams')).items;
    const idByBinary = new Map(all.map(item => [item.binary, item.id]));
    for (const item of all) {
        const { hexagram, related } = await api.invoke('yi_get_hexagram', { id: item.id });
        const bottom = [...item.binary].reverse();
        const expected = {
            opposite: idByBinary.get([...item.binary].map(bit => bit === '1' ? '0' : '1').join('')),
            inverse: idByBinary.get(bottom.join('')),
            mutual: idByBinary.get([bottom[4], bottom[3], bottom[2], bottom[3], bottom[2], bottom[1]].join(''))
        };
        assert.deepEqual(hexagram.relations, expected);
        for (const [type, id] of Object.entries(expected)) {
            if (type !== 'opposite' && id === item.id) assert.equal(Object.hasOwn(related, type), false);
            else assert.deepEqual(related[type], (await api.invoke('yi_get_hexagram', { id })).hexagram);
        }
        assert.equal(all[expected.opposite - 1].relations.opposite, item.id);
        assert.equal(all[expected.inverse - 1].relations.inverse, item.id);
    }
});

test('搜索覆盖准确名、卦序、经文片段、特殊字符及分页上限', async () => {
    for (const query of ['乾', '乾为天', '1']) {
        const result = await api.invoke('yi_search_hexagrams', { query, limit: 1 });
        assert.equal(result.items.length, 1);
        assert.equal(result.items[0].hexagram.id, 1);
        assert.ok(result.total >= result.items.length);
        assert.equal(result.query, query);
    }
    const classic = await api.invoke('yi_search_hexagrams', { query: '潜龙勿用', limit: 64 });
    assert.equal(classic.items[0].hexagram.id, 1);
    assert.equal(classic.items[0].field, 'line');
    assert.match(classic.items[0].snippet, /潜龙勿用/);
    assert.ok(classic.items.every((item, index) => index === 0 || item.score <= classic.items[index - 1].score));
    for (const query of ['[(*', '__proto__', '<script>alert(1)</script>', '😀'.repeat(200)]) {
        const result = await api.invoke('yi_search_hexagrams', { query });
        assert.deepEqual(result.items, []);
        assert.equal(result.total, 0);
    }
    const all = await api.invoke('yi_search_hexagrams', { query: '不', limit: 64 });
    assert.ok(all.items.length > 10);
    assert.equal((await api.invoke('yi_search_hexagrams', { query: '不' })).items.length, 10);
});

test('八卦固定名称和 canonical 卦画，单卦过滤不影响后续', async () => {
    const all = await api.invoke('yi_get_trigrams');
    assert.deepEqual(Object.keys(all.items).sort(), Object.keys(trigramBinaries).sort());
    for (const [name, binary] of Object.entries(trigramBinaries)) {
        assert.equal(all.items[name].binary, binary);
        assert.deepEqual(await api.invoke('yi_get_trigrams', { name }), { items: { [name]: all.items[name] } });
        for (const field of ['symbol', 'nature', 'attribute', 'direction', 'animal', 'element', 'family']) assert.ok(all.items[name][field].trim());
    }
});

test('经传完整出处与五篇附录逐字保真，指定 section 只返回一篇', async () => {
    const classics = await api.invoke('yi_get_classics');
    assert.equal(classics.source, datasets.zhouyi.source);
    assert.deepEqual(classics.appendix, datasets.zhouyi.appendix);
    assert.deepEqual(Object.keys(classics.appendix).sort(), appendixNames.toSorted());
    for (const section of appendixNames) {
        assert.deepEqual(await api.invoke('yi_get_classics', { section }), { source: classics.source, appendix: { [section]: classics.appendix[section] } });
        assert.ok(classics.appendix[section].length > 0);
    }
});

test('穷举 6/7/8/9 六爻全部 4096 种：64×64 本之卦、0–6 变爻、爻位与应读经文', async () => {
    const pairs = new Set();
    const counts = Array(7).fill(0);
    for (let combination = 0; combination < 4096; combination += 1) {
        const values = Array.from({ length: 6 }, (_, position) => 6 + ((combination >> (2 * position)) & 3));
        const result = await api.invoke('yi_analyze_lines', { values });
        assert.equal(result.question, '');
        assertAnalysis(result, values);
        pairs.add(`${result.primary.id}/${result.changed.id}`);
        counts[result.guide.count] += 1;
    }
    assert.equal(pairs.size, 4096);
    assert.deepEqual(counts, [64, 384, 960, 1280, 960, 384, 64]);
});

test('乾坤六爻皆变准确返回用九、用六及经典原文', async () => {
    for (const [value, id, changedId, title] of [[9, 1, 2, '用九'], [6, 2, 1, '用六']]) {
        const result = await api.invoke('yi_analyze_lines', { values: Array(6).fill(value), question: '仅作文化学习' });
        assert.equal(result.primary.id, id);
        assert.equal(result.changed.id, changedId);
        assert.equal(result.guide.readings[0].title, title);
        assert.equal(result.guide.readings[0].text, datasets.zhouyi.hexagrams[id].extra.text);
        assert.equal(result.question, '仅作文化学习');
    }
});

test('随机三钱起卦均为合法六爻，其分析与相同六爻重放完全一致', async () => {
    // 不对随机结果的不同或频数断言，避免概率性失败。
    for (let index = 0; index < 64; index += 1) {
        const question = index === 0 ? '保留所问原文：<>&😀' : '';
        const cast = await api.invoke('yi_cast', { question });
        assert.equal(cast.values.length, 6);
        assert.ok(cast.values.every(value => [6, 7, 8, 9].includes(value)));
        const reading = await api.invoke(cast.next.tool, cast.next.arguments);
        assertAnalysis(reading, cast.values);
        assert.equal(cast.primary.id, reading.primary.id);
        assert.equal(cast.changed.id, reading.changed.id);
        assert.equal(cast.record.question, question);
        assert.deepEqual(cast.record.lines, cast.values);
        assert.equal(cast.storage.status, 'not_saved');
    }
});

test('所有操作拒绝非对象参数、未知属性及 transport 不支持的数据路径', async () => {
    for (const name of operationNames) {
        for (const args of [null, [], 'text', 0, false, new Date(), new Map()]) await invalid(name, args);
        for (const extra of [{ unknown: true }, { dataDirectory: dataDirectory }, JSON.parse('{"__proto__":{}}')]) {
            await invalid(name, { ...validArguments[name], ...extra });
        }
    }
    await invalid('no_such_operation', {});
    await invalid('__proto__', {});
    await invalid('yi_info ', {});
});

test('选择器互斥、必填、类型、范围、枚举和字符串长度严格拒绝', async () => {
    const cases = {
        yi_get_hexagram: [{}, { id: 0 }, { id: 65 }, { id: 1.1 }, { id: '1' }, { id: NaN }, { id: Infinity }, { id: 1n }, { id: undefined }, { name: '' }, { name: '乾'.repeat(31) }, { name: 1 }, { binary: '11111' }, { binary: '1111111' }, { binary: '11111x' }, { binary: 111111 }, { binary: ' 111111' }, { upper: '乾' }, { lower: '坤' }, { upper: '天', lower: '坤' }, { id: 1, name: '乾' }, { id: 1, binary: '111111' }, { name: '乾', binary: '111111' }, { upper: '乾', lower: '坤', id: 1 }],
        yi_list_hexagrams: [{ offset: -1 }, { offset: 64 }, { offset: 0.1 }, { offset: '0' }, { offset: null }, { limit: 0 }, { limit: 65 }, { limit: 1.5 }, { limit: true }, { limit: Infinity }],
        yi_search_hexagrams: [{}, { query: '' }, { query: ' \n\t　' }, { query: null }, { query: 1 }, { query: '字'.repeat(201) }, { query: '乾', limit: 0 }, { query: '乾', limit: 65 }, { query: '乾', limit: '1' }],
        yi_analyze_lines: [{}, { values: null }, { values: '777777' }, { values: [] }, { values: [7, 7, 7, 7, 7] }, { values: Array(7).fill(7) }, { values: [5, 7, 7, 7, 7, 7] }, { values: [10, 7, 7, 7, 7, 7] }, { values: ['7', 7, 7, 7, 7, 7] }, { values: [7.1, 7, 7, 7, 7, 7] }, { values: [null, 7, 7, 7, 7, 7] }, { values: [true, 7, 7, 7, 7, 7] }, { values: [NaN, 7, 7, 7, 7, 7] }, { values: new Uint8Array([7, 7, 7, 7, 7, 7]) }, { values: [7, 7, 7, 7, 7, 7], question: '字'.repeat(501) }],
        yi_cast: [{ question: null }, { question: 1 }, { question: '字'.repeat(501) }],
        yi_get_trigrams: [{ name: '' }, { name: '天' }, { name: '乾 ' }, { name: 1 }, { name: null }],
        yi_get_classics: [{ section: '' }, { section: 'source' }, { section: 'XICI_SHANG' }, { section: 1 }, { section: null }]
    };
    for (const [name, argsList] of Object.entries(cases)) for (const args of argsList) {
        // bigint 仅用于确认程序化 API 拒绝其类型，不通过 JSON 序列化诊断。
        await assert.rejects(api.invoke(name, args), error => error instanceof YiInputError && error.code === 'INVALID_INPUT', name);
    }
});

test('程序化调用拒绝缺槽数组和继承的必填字段，允许普通冻结输入', async () => {
    for (const values of [Array(6), [7, , 7, 7, 7, 7], Object.assign(Array(6), { 5: 7 })]) await invalid('yi_analyze_lines', { values });
    await invalid('yi_analyze_lines', Object.create({ values: Array(6).fill(7) }));
    await invalid('yi_search_hexagrams', Object.create({ query: '乾' }));
    const values = Object.freeze([6, 7, 8, 9, 7, 8]);
    const input = Object.freeze({ values, question: '😀'.repeat(500) });
    const result = await api.invoke('yi_analyze_lines', input);
    assert.equal(result.question, input.question);
    assert.deepEqual(result.values, values);
    assert.equal((await api.invoke('yi_cast', { question: '😀'.repeat(500) })).record.question.length, 1000);
    await invalid('yi_cast', { question: '😀'.repeat(501) });
    await invalid('yi_search_hexagrams', { query: '😀'.repeat(201) });
});

test('纯 JSON 参数契约拒绝非枚举、Symbol 与 accessor 字段且不执行 getter', async () => {
    let getterCalls = 0;
    for (const name of operationNames) {
        const args = structuredClone(validArguments[name]);
        const hidden = Object.defineProperty({ ...args }, 'hidden', { value: true });
        await invalid(name, hidden);
        await invalid(name, { ...args, [Symbol('hidden')]: true });
        const accessor = Object.defineProperty({ ...args }, 'getter', { enumerable: true, get() { getterCalls += 1; throw new Error('不得运行'); } });
        await invalid(name, accessor);
    }
    await invalid('yi_search_hexagrams', Object.defineProperty({}, 'query', { value: 123 }));
    await invalid('yi_analyze_lines', Object.defineProperty({}, 'values', { value: Array(6).fill(7) }));
    const knownAccessor = Object.defineProperty({}, 'query', { enumerable: true, get() { getterCalls += 1; return '乾'; } });
    await invalid('yi_search_hexagrams', knownAccessor);
    assert.equal(getterCalls, 0);
    const nullPrototype = Object.assign(Object.create(null), { id: 1 });
    assert.equal((await api.invoke('yi_get_hexagram', nullPrototype)).hexagram.id, 1);
});

test('所有返回值可任意改动且不污染后续结果、核心规则或另一 API 实例', async () => {
    const second = await createYiApi();
    for (const name of operationNames.filter(item => item !== 'yi_cast')) {
        const args = structuredClone(validArguments[name]);
        const expected = await api.invoke(name, args);
        const result = await api.invoke(name, args);
        const vandalize = value => {
            if (value === null || typeof value !== 'object') return;
            for (const [key, item] of Object.entries(value)) {
                if (item !== null && typeof item === 'object') vandalize(item);
                else value[key] = '已修改';
            }
            value.extra = true;
        };
        vandalize(result);
        assert.deepEqual(await api.invoke(name, args), expected, name);
        assert.deepEqual(await second.invoke(name, args), expected, name);
    }
    const original = [6, 7, 8, 9, 7, 8];
    const result = await api.invoke('yi_analyze_lines', { values: original });
    original.fill(9);
    assert.deepEqual(result.values, [6, 7, 8, 9, 7, 8]);
    result.values.fill(6);
    result.guide.rule.text = '篡改';
    assert.notEqual((await api.invoke('yi_analyze_lines', { values: [6, 7, 8, 9, 7, 8] })).guide.rule.text, '篡改');
    const cast = await api.invoke('yi_cast');
    cast.primary.name = '篡改';
    assert.equal((await api.invoke('yi_get_hexagram', { id: cast.primary.id })).hexagram.name, datasets.hexagrams[cast.primary.id].name);
});

test('必需 JSON 缺失、解析失败或结构损坏时 API 失败关闭', async t => {
    const cases = [
        ['缺少卦象文件', directory => rm(join(directory, 'hexagrams.json'))],
        ['缺少八卦文件', directory => rm(join(directory, 'bagua.json'))],
        ['卦象 JSON 损坏', directory => writeFile(join(directory, 'hexagrams.json'), '{')],
        ['八卦 JSON 损坏', directory => writeFile(join(directory, 'bagua.json'), '{')],
        ['卦象缺卦', directory => replaceDataset(directory, 'hexagrams', data => { delete data[64]; })],
        ['卦象多卦', directory => replaceDataset(directory, 'hexagrams', data => { data[65] = data[64]; })],
        ['卦画重复', directory => replaceDataset(directory, 'hexagrams', data => { data[2].binary = data[1].binary; })],
        ['卦画非法', directory => replaceDataset(directory, 'hexagrams', data => { data[1].binary = 'xxxxxx'; })],
        ['卦画方向字段类型错误', directory => replaceDataset(directory, 'hexagrams', data => { data[1].binary = 111111; })],
        ['卦名空白', directory => replaceDataset(directory, 'hexagrams', data => { data[1].name = ' '; })],
        ['卦义类型错误', directory => replaceDataset(directory, 'hexagrams', data => { data[1].explanation = null; })],
        ['六爻残缺', directory => replaceDataset(directory, 'hexagrams', data => { data[1].lines.pop(); })],
        ['爻位乱序', directory => replaceDataset(directory, 'hexagrams', data => { data[1].lines[0].position = 2; })],
        ['爻辞类型错误', directory => replaceDataset(directory, 'hexagrams', data => { data[1].lines[0].content = {}; })],
        ['八卦改名', directory => replaceDataset(directory, 'bagua', data => { data.天 = data.乾; delete data.乾; })],
        ['八卦交换编码', directory => replaceDataset(directory, 'bagua', data => { [data.乾.binary, data.坤.binary] = [data.坤.binary, data.乾.binary]; })],
        ['八卦展示字段缺失', directory => replaceDataset(directory, 'bagua', data => { delete data.乾.nature; })],
        ['八卦展示字段空白', directory => replaceDataset(directory, 'bagua', data => { data.乾.family = ' '; })]
    ];
    for (const [label, change] of cases) await t.test(label, async child => {
        const directory = await fixture(child, change);
        await assert.rejects(createYiApi({ dataDirectory: directory }));
        assert.equal((await api.invoke('yi_info')).hexagrams, 64);
    });
});

test('经传缺失或损坏可选降级，白话查询分析仍完整且经典工具返回 NOT_FOUND', async t => {
    t.mock.method(console, 'warn', () => {});
    const cases = [
        ['经传文件缺失', directory => rm(join(directory, 'zhouyi.json'))],
        ['经传 JSON 损坏', directory => writeFile(join(directory, 'zhouyi.json'), '{')],
        ['出处缺失', directory => replaceDataset(directory, 'zhouyi', data => { delete data.source; })],
        ['附录缺失', directory => replaceDataset(directory, 'zhouyi', data => { delete data.appendix; })],
        ['附录类型错误', directory => replaceDataset(directory, 'zhouyi', data => { data.appendix.shuogua = {}; })],
        ['经典六爻残缺', directory => replaceDataset(directory, 'zhouyi', data => { data.hexagrams[1].lines.pop(); })],
        ['用九类型错误', directory => replaceDataset(directory, 'zhouyi', data => { data.hexagrams[1].extra.text = 1; })],
        ['文言类型错误', directory => replaceDataset(directory, 'zhouyi', data => { data.hexagrams[1].wenyan = [1]; })],
        ['小象类型错误', directory => replaceDataset(directory, 'zhouyi', data => { data.hexagrams[1].lines[0].xiang = {}; })]
    ];
    for (const [label, change] of cases) await t.test(label, async child => {
        const directory = await fixture(child, change);
        const degraded = await createYiApi({ dataDirectory: directory });
        assert.equal((await degraded.invoke('yi_info')).classicsAvailable, false);
        assert.equal((await degraded.invoke('yi_list_hexagrams')).items.length, 64);
        await assert.rejects(degraded.invoke('yi_get_classics'), error => error instanceof YiInputError && error.code === 'NOT_FOUND');
        for (const values of [[7, 8, 7, 8, 7, 8], [6, 7, 8, 9, 7, 8], Array(6).fill(9), Array(6).fill(6)]) {
            const result = await degraded.invoke('yi_analyze_lines', { values });
            assertAnalysis(result, values);
            assert.equal(result.primary.classic, null);
            assert.equal(result.primary.judgment, '');
            assert.ok(result.primary.lines.every(line => typeof line.text === 'string' && line.text.length > 0));
        }
        const reading = await degraded.invoke('yi_reading', { values: [8, 8, 7, 7, 7, 6] });
        assert.equal(reading.evidence.classicsAvailable, false);
        assert.equal(reading.methodology.layers.find(layer => layer.id === 'classic').available, false);
        assert.equal(reading.methodology.commentaries.status, 'not-retrieved');
        assert.equal(reading.methodology.commentaries.targets[0].section, '上六');
        assert.equal(reading.methodology.commentaries.targets[0].classicText, null);
        assert.equal(reading.methodology.commentaries.targets[0].classicTextStatus, 'unavailable');
        const text = renderText(await degraded.invoke('yi_reading', { values: [7, 7, 7, 7, 7, 7] }));
        assert.match(text, /经传原文不可用/);
        assert.match(text, /乾为天 白话\/旧数据回退：自强不息/);
        assert.doesNotMatch(text, /乾为天 卦辞：自强不息/);
        assert.doesNotMatch(text, /以上为经文与确定性基础解析/);
    });
});

test('Node 核心及数据工厂显式导出、实例状态隔离、失败不暴露部分快照', async () => {
    assert.equal(typeof YiCore.readingGuide, 'function');
    assert.equal(typeof createDataService, 'function');
    assert.equal(Object.hasOwn(globalThis, 'YiCore'), false);
    const events = [];
    const errors = [];
    const shared = structuredClone(datasets);
    const first = createDataService({ core: YiCore, app: { events: { emit: (...args) => events.push(args) }, errors: { handle: error => errors.push(error) } }, loadDataset: async name => shared[name] });
    const second = createDataService({ core: YiCore, app: { events: { emit() {} }, errors: { handle: error => { throw error; } } }, loadDataset: async name => shared[name] });
    assert.equal(first.isInitialized, false);
    assert.deepEqual(first.getAllHexagrams(), []);
    await first.init();
    assert.equal(first.isInitialized, true);
    assert.equal(second.isInitialized, false);
    assert.deepEqual(second.getAllHexagrams(), []);
    await second.init();
    first.getHexagramById(1).name = '首实例改动';
    first.getBagua('乾').nature = '首实例改动';
    first.getClassics().appendix.xici_shang.push('首实例改动');
    assert.equal(second.getHexagramById(1).name, datasets.hexagrams[1].name);
    assert.equal(second.getBagua('乾').nature, datasets.bagua.乾.nature);
    assert.deepEqual(second.getClassics().appendix.xici_shang, datasets.zhouyi.appendix.xici_shang);
    assert.equal(shared.hexagrams[1].name, datasets.hexagrams[1].name);
    assert.equal(errors.length, 0);
    assert.equal(events.filter(([event]) => event === 'hexagram-data:ready').length, 1);
    await first.init();
    assert.equal(events.filter(([event]) => event === 'hexagram-data:ready').length, 1);
    const badData = structuredClone(datasets);
    delete badData.hexagrams[64];
    const bad = createDataService({ core: YiCore, app: { events: { emit: (...args) => events.push(args) }, errors: { handle: error => errors.push(error) } }, loadDataset: async name => badData[name] });
    await bad.init();
    assert.equal(bad.isInitialized, false);
    assert.deepEqual(bad.getAllHexagrams(), []);
    assert.deepEqual(bad.getBaguaData(), {});
    assert.equal(bad.getHexagramById(1), null);
    assert.equal(bad.getClassics(), null);
    assert.equal(errors.length, 1);
    assert.equal(events.filter(([event]) => event === 'hexagram-data:error').length, 1);
    assert.equal(second.isInitialized, true);
});

test('浏览器兼容：词法 const YizhiApp 与 window/词法 YiCore 均能正常初始化', async () => {
    const coreSource = await readFile(new URL('../../../apps/yi/js/core/yijing-core.js', import.meta.url), 'utf8');
    const serviceSource = await readFile(new URL('../../../apps/yi/js/services/hexagram-data-service-module.js', import.meta.url), 'utf8');
    for (const lexicalCore of [false, true]) {
        const emitted = [];
        const errors = [];
        const sandbox = {
            console,
            location: { protocol: 'file:' },
            __HEXAGRAM_DATA__: structuredClone(datasets.hexagrams),
            __BAGUA_DATA__: structuredClone(datasets.bagua),
            __ZHOUYI_DATA__: structuredClone(datasets.zhouyi),
            emit: (...args) => emitted.push(args),
            handle: (...args) => errors.push(args),
            fetch() { throw new Error('file:// 预加载回归不得访问网络'); }
        };
        sandbox.window = sandbox;
        const context = createContext(sandbox);
        runInContext(coreSource, context, { filename: 'yijing-core.js' });
        runInContext('const YizhiApp = { events: { emit }, errors: { handle } };', context);
        assert.equal(Object.hasOwn(sandbox, 'YizhiApp'), false, '真实 app 的 const 不会成为 window 属性');
        if (lexicalCore) {
            runInContext('const YiCore = window.YiCore; delete window.YiCore;', context);
            assert.equal(Object.hasOwn(sandbox, 'YiCore'), false);
        } else {
            assert.equal(typeof sandbox.YiCore.readingGuide, 'function');
        }
        runInContext(serviceSource, context, { filename: 'hexagram-data-service-module.js' });
        await runInContext('HexagramDataService.init()', context);
        assert.equal(runInContext('HexagramDataService.isInitialized', context), true);
        assert.equal(runInContext('HexagramDataService.getAllHexagrams().length', context), 64);
        assert.equal(runInContext('HexagramDataService.getHexagramByBinary("111111").id', context), 1);
        assert.equal(runInContext('HexagramDataService.getHexagramByTrigrams("坤", "坤").id', context), 2);
        assert.equal(runInContext('HexagramDataService.getClassics().source', context), datasets.zhouyi.source);
        assert.deepEqual(errors, []);
        assert.deepEqual(emitted, [['hexagram-data:ready']]);
    }
});

test('冷启动与所有默认操作调用仅读取固定本地 JSON，不联网、不碰浏览器对象或历史、不写文件', () => {
    const script = `
        import assert from 'node:assert/strict';
        import fs from 'node:fs/promises';
        import { syncBuiltinESMExports } from 'node:module';
        import { resolve } from 'node:path';
        const directory = ${JSON.stringify(dataDirectory)};
        const allowed = new Set(['bagua', 'hexagrams', 'zhouyi'].map(name => resolve(directory, name + '.json')));
        const reads = [];
        const read = fs.readFile;
        fs.readFile = async (path, ...rest) => {
            const target = resolve(String(path));
            assert.ok(allowed.has(target), '不允许读取用户历史或其他文件：' + target);
            reads.push(target);
            return read(path, ...rest);
        };
        const blocked = () => { throw new Error('不允许网络、浏览器或持久化副作用'); };
        for (const name of ['writeFile', 'appendFile', 'mkdir', 'rm', 'unlink', 'rename', 'copyFile']) fs[name] = blocked;
        syncBuiltinESMExports();
        globalThis.fetch = blocked;
        const browser = new Proxy({}, { get: blocked, set: blocked, ownKeys: blocked });
        for (const name of ['window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'history']) globalThis[name] = browser;
        const { createYiApi } = await import(${JSON.stringify(apiUrl)});
        const api = await createYiApi();
        for (const [name, args] of Object.entries(${JSON.stringify(validArguments)})) await api.invoke(name, args);
        assert.equal(reads.length, 3);
        assert.deepEqual(new Set(reads), allowed);
        assert.equal(Object.hasOwn(globalThis, 'YiCore'), false);
        process.stdout.write('offline-readonly-ok');
    `;
    assert.equal(execFileSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8', timeout: 15000 }).trim(), 'offline-readonly-ok');
});

test('六爻数组拒绝 getter、自定义方法和继承槽位，不执行外来行为', async () => {
    let calls = 0;
    const accessor = [7, 7, 7, 7, 7, 7];
    Object.defineProperty(accessor, '0', { enumerable: true, get() { calls += 1; return 7; } });
    const customMap = [7, 7, 7, 7, 7, 7];
    customMap.map = () => { calls += 1; return []; };
    const inherited = [7, 7, 7, 7, 7, 7];
    Object.setPrototypeOf(inherited, Object.create(Array.prototype));
    for (const values of [accessor, customMap, inherited]) await invalid('yi_analyze_lines', { values });
    assert.equal(calls, 0);
    assert.equal((await api.invoke('yi_analyze_lines', { values: Object.freeze([7, 7, 7, 7, 7, 7]) })).primary.id, 1);
});


test('第二步一次提供经文、白话、爻位和完整错综互（含自反关系）', async () => {
    for (const item of (await api.invoke('yi_list_hexagrams')).items) {
        const values = [...item.binary].reverse().map(bit => bit === '1' ? 7 : 8);
        const reading = await api.invoke('yi_reading', { values });
        assertAnalysis(reading, values);
        assert.deepEqual(Object.keys(reading.related).sort(), ['inverse', 'mutual', 'opposite']);
        for (const [kind, related] of Object.entries(reading.related)) {
            assert.equal(related.id, reading.primary.relations[kind]);
            assert.ok(related.classic.judgment);
            assert.ok(related.explanation);
        }
        assert.equal(reading.interpretation.provider, 'caller');
        assert.equal(reading.interpretation.generated, false);
        assert.equal(reading.evidence.classicsAvailable, true);
    }
});

test('显式保存占记、跨实例按 ID 重读且不改变原卦，文件不复制经文或 AI 解读', async t => {
    const directory = await fixture(t, async () => {});
    const recordsDirectory = join(directory, 'records');
    const first = await createYiApi({ recordsDirectory });
    const cast = await first.invoke('yi_cast', { question: '  学习方向  ', notes: '事件背景\u0000', save: true });
    assert.equal(cast.storage.status, 'saved');
    assert.equal(cast.storage.path, join(recordsDirectory, `${cast.record.id}.json`));
    assert.deepEqual(JSON.parse(await readFile(cast.storage.path, 'utf8')), [cast.record]);
    assert.deepEqual(Object.keys(cast.record).sort(), ['version', 'id', 'timestamp', 'question', 'notes', 'lines', 'hexagramId', 'source'].sort());
    assert.equal(cast.record.question, '学习方向');
    assert.equal(cast.record.notes, '事件背景');
    const second = await createYiApi({ recordsDirectory });
    const reread = await second.invoke('yi_reading', { recordId: cast.record.id });
    assertAnalysis(reread, cast.values);
    assert.deepEqual(reread.record, cast.record);
    assert.equal(reread.question, cast.record.question);
    assert.deepEqual(reread.primary, (await first.invoke('yi_reading', { values: cast.values })).primary);
});

test('默认不创建占记目录；保存失败仍返回已起原卦和可复制记录', async t => {
    const directory = await fixture(t, async () => {});
    const recordsDirectory = join(directory, 'absent');
    const first = await createYiApi({ recordsDirectory });
    assert.equal((await first.invoke('yi_cast', { question: '不应写入' })).storage.status, 'not_saved');
    await assert.rejects(readFile(recordsDirectory), { code: 'ENOENT' });
    const blockedDirectory = join(directory, 'blocked');
    await writeFile(blockedDirectory, 'not a directory');
    const blocked = await createYiApi({ recordsDirectory: blockedDirectory });
    const cast = await blocked.invoke('yi_cast', { question: '保留结果', save: true });
    assert.equal(cast.storage.status, 'failed');
    assert.equal(cast.storage.code, 'SAVE_FAILED');
    assert.equal(cast.record.question, '保留结果');
    assertAnalysis(await blocked.invoke(cast.next.tool, cast.next.arguments), cast.values);
});

test('并发保存不覆盖，占记格式损坏、引用篡改、目录与超大文件均拒绝', async t => {
    const directory = await fixture(t, async () => {});
    const local = await createYiApi({ recordsDirectory: directory });
    const casts = await Promise.all(Array.from({ length: 8 }, (_, index) => local.invoke('yi_cast', { question: `并发 ${index}`, save: true })));
    assert.equal(new Set(casts.map(cast => cast.record.id)).size, 8);
    for (const cast of casts) {
        assert.equal(cast.storage.status, 'saved');
        assert.deepEqual((await local.invoke('yi_reading', { recordId: cast.record.id })).record, cast.record);
    }
    const { record, storage } = casts[0];
    for (const payload of ['{', '[]', JSON.stringify([{ ...record, version: 2 }]), JSON.stringify([{ ...record, hexagramId: record.hexagramId === 1 ? 2 : 1 }]), JSON.stringify([{ ...record, timestamp: 8640000000000001 }]), JSON.stringify([{ ...record, id: casts[1].record.id }]), ' '.repeat(16385)]) {
        await writeFile(storage.path, payload);
        await assert.rejects(local.invoke('yi_reading', { recordId: record.id }), YiInputError);
    }
    await assert.rejects(local.invoke('yi_reading', { recordId: '00000000-0000-4000-8000-000000000000' }), error => error.code === 'NOT_FOUND');
});

test('两个工作流工具严格拒绝路径、选择器冲突、非布尔保存和畸形事件', async () => {
    for (const args of [{}, { values: [7] }, { recordId: '../history' }, { recordId: 'C:\\private.json' }, { recordId: '00000000-0000-4000-8000-000000000000', values: [7, 7, 7, 7, 7, 7] }]) await invalid('yi_reading', args);
    for (const args of [{ save: 'true' }, { save: 1 }, { notes: null }, { notes: '字'.repeat(501) }, { path: 'history.json' }, { values: [7, 7, 7, 7, 7, 7] }]) await invalid('yi_cast', args);
});
