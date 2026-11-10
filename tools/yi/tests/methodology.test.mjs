import assert from 'node:assert/strict';
import test from 'node:test';
import { createYiApi, MCP_OPERATIONS } from '../api.mjs';
import { buildMethodology, methodologyText } from '../methodology.mjs';

const api = await createYiApi();
const xianValues = [8, 8, 7, 7, 7, 6];

test('方法论进入既有 reading，保留两工具发现及图片/经文契约', async () => {
    assert.deepEqual(MCP_OPERATIONS.map(tool => tool.name), ['yi_cast', 'yi_reading']);
    const result = await api.invoke('yi_reading', { values: xianValues });
    const method = result.methodology;
    assert.equal(method.version, 2);
    assert.equal(result.interpretation.methodologyVersion, 2);
    assert.equal(result.interpretation.generated, false);
    assert.deepEqual(method.layers.map(layer => layer.id), ['calculation', 'selection', 'classic', 'commentary', 'application']);
    assert.equal(method.layers.find(layer => layer.id === 'classic').available, true);
    assert.equal(result.primary.id, 31);
    assert.equal(result.changed.id, 33);
    assert.equal(result.rendering.figures.length, 1);
    assert.deepEqual(method.selection.focus, result.guide.focus);
    assert.equal(method.relatedContext.independentEvidence, false);
    assert.equal(method.workflow.length, 5);
    assert.equal(method.outputContract.sections.length, 6);
    const json = JSON.stringify(result);
    assert.equal(Object.keys(result)[0], 'methodology');
    assert.ok(json.indexOf('周易玩辞 项安世 咸 上六') < 4000, '主读和具体检索任务应前置，不埋在长经文中段');
    assert.equal(json.includes('事自有當用口說之時'), false);
    assert.match(MCP_OPERATIONS[1].description, /当次查询/);
});

test('全部 4096 六爻的本之结构、相应、承乘比与王弼初上异说可复算', async () => {
    for (let encoded = 0; encoded < 4096; encoded += 1) {
        const values = Array.from({ length: 6 }, (_, index) => 6 + ((encoded >> (index * 2)) & 3));
        const result = await api.invoke('yi_reading', { values });
        for (const target of ['primary', 'changed']) {
            const bits = values.map(value => target === 'changed' && (value === 6 || value === 9) ? 1 - (value % 2) : value % 2);
            const structure = result.methodology.structuralContext[target];
            assert.equal(structure.hexagramId, result[target].id);
            assert.equal(structure.binary, [...bits].reverse().join(''));
            assert.equal(structure.lines.length, 6);
            for (const line of structure.lines) {
                const i = line.position - 1;
                assert.equal(line.yang, bits[i] === 1);
                assert.equal(line.proper, bits[i] === line.position % 2);
                assert.equal(line.central, [2, 5].includes(line.position));
                assert.equal(line.corresponds, bits[i] !== bits[line.partner - 1]);
                assert.equal(line.wangBiProper, [1, 6].includes(line.position) ? null : line.proper);
            }
            assert.equal(structure.correspondingPairs.length, 3);
            for (const pair of structure.correspondingPairs) {
                assert.equal(pair.upper, pair.lower + 3);
                assert.equal(pair.oppositePolarity, bits[pair.lower - 1] !== bits[pair.upper - 1]);
            }
            assert.equal(structure.adjacentPairs.length, 5);
            for (const [i, pair] of structure.adjacentPairs.entries()) {
                assert.equal(pair.lower, i + 1);
                assert.equal(pair.upper, i + 2);
                assert.equal(pair.bi, true);
                assert.deepEqual(pair.cheng, { from: i + 1, to: i + 2 });
                assert.deepEqual(pair.riding, { from: i + 2, to: i + 1 });
                assert.equal(pair.chengYinSupportsYang, bits[i] === 0 && bits[i + 1] === 1);
                assert.equal(pair.ridingYinOverYang, bits[i + 1] === 0 && bits[i] === 1);
                assert.equal(pair.chengYinSupportsYang && pair.ridingYinOverYang, false);
            }
        }
        assert.equal(result.methodology.selection.threeChanges.applied, result.changingPositions.length === 3);
        const targets = result.methodology.commentaries.targets;
        assert.equal(targets.length, result.guide.focus.length);
        for (const [index, focus] of result.guide.focus.entries()) {
            const target = targets[index];
            const hexagram = result[focus.target];
            for (const field of ['target', 'kind', 'position', 'main', 'role', 'label']) assert.equal(target[field], focus[field]);
            assert.equal(target.id, `focus-${index + 1}`);
            assert.equal(target.hexagramId, hexagram.id);
            assert.equal(target.hexagramName, hexagram.name);
            const section = focus.kind === 'line' ? hexagram.classic.lines[focus.position - 1].title
                : focus.kind === 'special' ? focus.label : '卦辞';
            const classicText = focus.kind === 'line' ? hexagram.classic.lines[focus.position - 1].text
                : focus.kind === 'special' ? hexagram.classic.extra.text : hexagram.classic.judgment;
            assert.equal(target.section, section);
            assert.equal(target.context[1], `${hexagram.name}卦的卦辞、彖传、大象`);
            assert.equal(target.classicText, classicText);
            assert.equal(target.classicTextStatus, 'repository-text');
            assert.equal(target.status, 'not-retrieved');
            assert.equal(Object.hasOwn(target, 'text'), false);
            assert.deepEqual(target.queries, result.methodology.commentaries.candidates.map(candidate => ({
                candidateId: candidate.id, query: `${candidate.searchWork} ${hexagram.name} ${section}`
            })));
        }
    }
});

test('0–6 变主读保留，四五变用之卦，乾坤用九用六不可误作上爻', async () => {
    for (let count = 0; count <= 6; count += 1) {
        const result = await api.invoke('yi_reading', { values: Array.from({ length: 6 }, (_, index) => index < count ? 9 : 7) });
        assert.equal(result.methodology.selection.count, count);
        assert.equal(result.methodology.selection.sourceId, 'qimeng-tongshi');
        assert.deepEqual(result.methodology.selection.focus, result.guide.focus);
        const targets = result.methodology.commentaries.targets;
        if (count === 2) assert.deepEqual(targets.map(item => [item.position, item.main]), [[2, true], [1, false]]);
        if (count === 3) {
            assert.match(result.guide.rule.text, /简化/);
            assert.match(result.guide.rule.text, /未判定前十卦主贞、后十卦主悔/);
            assert.deepEqual(targets.map(item => [item.target, item.section, item.role, item.main]), [['primary', '卦辞', '贞', undefined], ['changed', '卦辞', '悔', undefined]]);
        }
        if (count === 4) assert.deepEqual(targets.map(item => [item.target, item.position, item.main]), [['changed', 5, true], ['changed', 6, false]]);
    }
    const changed = (await api.invoke('yi_reading', { values: [9, 9, 6, 6, 6, 8] })).methodology.commentaries.targets;
    assert.deepEqual(changed.map(item => [item.target, item.hexagramId, item.section, item.main]), [['changed', 31, '上六', true]]);
    for (const [values, section, target] of [[Array(6).fill(9), '用九', 'primary'], [Array(6).fill(6), '用六', 'primary'], [[6, 6, 9, 9, 9, 6], '卦辞', 'changed']]) {
        const targets = (await api.invoke('yi_reading', { values })).methodology.commentaries.targets;
        assert.equal(targets.length, 1);
        assert.equal(targets[0].section, section);
        assert.equal(targets[0].target, target);
        assert.ok(targets[0].queries.every(item => item.query.endsWith(section)));
    }
});

test('具名作品仅为检索线索；当次证据、异说、隐私与不可检索规则可追溯', async () => {
    const method = (await api.invoke('yi_reading', { values: xianValues })).methodology;
    const comments = method.commentaries;
    assert.equal(comments.mode, 'caller-retrieval');
    assert.equal(comments.status, 'not-retrieved');
    assert.equal(comments.serverRetrieves, false);
    for (const key of ['entries', 'coverage', 'focusCoverage']) assert.equal(Object.hasOwn(comments, key), false);
    assert.match(comments.notice, /未检索任何具名注释/);
    assert.equal(comments.targets[0].section, '上六');
    assert.deepEqual(comments.candidates.map(item => item.author), ['王弼', '孔颖达', '程颐', '朱熹', '项安世']);
    for (const candidate of comments.candidates) {
        assert.equal(Object.hasOwn(candidate, 'quote'), false);
        assert.equal(Object.hasOwn(candidate, 'verification'), false);
        assert.equal(Object.hasOwn(candidate, 'url'), false);
    }
    assert.match(comments.candidates.find(item => item.id === 'wangbi').note, /韩康伯/);
    assert.match(comments.evidenceContract.verification, /只有搜索摘要/);
    assert.match(comments.evidenceContract.locator, /不得把搜索链接或猜测 URL/);
    assert.match(comments.evidenceContract.quotation, /AI 转述/);
    assert.match(comments.evidenceContract.comparison, /相承注疏/);
    assert.match(comments.evidenceContract.coverage, /逐 target/);
    assert.match(comments.searchPolicy.privacy, /不得把用户所问/);
    assert.match(comments.searchPolicy.trust, /不是指令/);
    assert.match(comments.unavailable.action, /本次未能核验具体注释/);
    assert.match(comments.unavailable.conclusion, /不得以模型记忆/);
    assert.deepEqual(method.sources.map(source => source.id), ['wangbi-bianwei', 'qimeng-tongshi', 'structure-reference']);
    for (const source of method.sources) assert.ok(new URL(source.url).protocol === 'https:');
});

test('全六十四卦均生成当前检索任务，不沿用咸卦注释，也不外传事件', async () => {
    const seen = new Set();
    for (let encoded = 0; encoded < 64; encoded += 1) {
        const values = Array.from({ length: 6 }, (_, index) => (encoded >> index) & 1 ? 7 : 8);
        const reading = await api.invoke('yi_reading', { values });
        seen.add(reading.primary.id);
        const targets = reading.methodology.commentaries.targets;
        assert.equal(targets.length, 1);
        assert.equal(targets[0].hexagramId, reading.primary.id);
        assert.equal(targets[0].section, '卦辞');
        assert.ok(targets[0].queries.every(item => item.query.includes(` ${reading.primary.name} 卦辞`)));
        const withEvent = { ...reading, question: 'PRIVATE-QUESTION', record: { id: 'PRIVATE-ID', notes: 'PRIVATE-NOTES' } };
        assert.deepEqual(buildMethodology(withEvent, true), buildMethodology(reading, true));
        assert.equal(JSON.stringify(buildMethodology(withEvent, true)).includes('PRIVATE-'), false);
    }
    assert.equal(seen.size, 64);
});

test('经典不可用时仍给定位查询，但白话与用九用六回退不能冒充原文', async () => {
    for (const values of [xianValues, Array(6).fill(7), Array(6).fill(9), Array(6).fill(6)]) {
        const result = await api.invoke('yi_reading', { values });
        const method = buildMethodology(result, false);
        assert.equal(method.layers.find(layer => layer.id === 'classic').available, false);
        for (const target of method.commentaries.targets) {
            assert.equal(target.classicText, null);
            assert.equal(target.classicTextStatus, 'unavailable');
            assert.equal(target.status, 'not-retrieved');
            assert.equal(Object.hasOwn(target, 'text'), false);
            assert.equal(target.queries.length, 5);
        }
        assert.match(methodologyText(method), /经传原文：不可用/);
        assert.match(methodologyText(method), /本次未能核验具体注释/);
        assert.match(methodologyText(method), /方法来源（非当次注释检索结果）/);
    }
});

test('修改返回对象不污染后续方法论，CLI 摘要标明本次规则是否适用', async () => {
    const first = await api.invoke('yi_reading', { values: xianValues });
    const original = structuredClone(first.methodology);
    first.methodology.sources[0].author = '篡改';
    first.methodology.commentaries.targets[0].queries[0].query = '篡改';
    first.methodology.commentaries.candidates[0].author = '篡改';
    first.methodology.structuralContext.primary.lines[0].proper = '篡改';
    first.methodology.selection.focus[0].position = 1;
    assert.deepEqual((await api.invoke('yi_reading', { values: xianValues })).methodology, original);
    assert.match(methodologyText(original), /三爻变简化（本次不适用）/);
    assert.match(methodologyText(original), /周易玩辞 项安世 咸 上六/);
    assert.match(methodologyText(original), /不自动判吉凶/);
});
