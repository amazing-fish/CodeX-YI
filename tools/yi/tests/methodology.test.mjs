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
    assert.equal(method.version, 1);
    assert.equal(result.interpretation.methodologyVersion, 1);
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
    assert.ok(json.indexOf('事自有當用口說之時') < 4000, '主读与具名短引应前置，不埋在长经文中段');
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
    }
});

test('0–6 变主读保留；三变显式简化，四五变注解按之卦所选爻匹配', async () => {
    for (let count = 0; count <= 6; count += 1) {
        const result = await api.invoke('yi_reading', { values: Array.from({ length: 6 }, (_, index) => index < count ? 9 : 7) });
        assert.equal(result.methodology.selection.count, count);
        assert.equal(result.methodology.selection.sourceId, 'qimeng-tongshi');
        assert.deepEqual(result.methodology.selection.focus, result.guide.focus);
        if (count === 3) {
            assert.match(result.guide.rule.text, /简化/);
            assert.match(result.guide.rule.text, /未判定前十卦主贞、后十卦主悔/);
            assert.deepEqual(result.guide.focus.map(item => item.target), ['primary', 'changed']);
        }
    }
    // 五变：之卦咸，唯一不变爻为上六，具名短引必须标为 changed 主读。
    const result = await api.invoke('yi_reading', { values: [9, 9, 6, 6, 6, 8] });
    assert.equal(result.changed.id, 31);
    assert.equal(result.methodology.commentaries.entries.length, 4);
    for (const item of result.methodology.commentaries.entries) {
        assert.equal(item.target, 'changed');
        assert.equal(item.selected, true);
    }
});

test('咸上六的具名原话、来源、项目摘要、项安世异说和局部覆盖各自可追溯', async () => {
    const method = (await api.invoke('yi_reading', { values: xianValues })).methodology;
    const comments = method.commentaries;
    assert.equal(comments.coverage.fullCorpus, false);
    assert.deepEqual(comments.coverage.includedHexagrams, [31]);
    assert.deepEqual(comments.coverage.includedLines, [{ hexagramId: 31, position: 6 }]);
    assert.equal(comments.coverage.includedEntries, 4);
    assert.equal(comments.entries.length, 4);
    assert.equal(comments.focusCoverage[0].status, 'excerpt-only');
    assert.equal(comments.focusCoverage[0].commentaryIds.length, 4);
    assert.equal(comments.entries.find(item => item.author === '朱熹').quote, '感人以言而无其實');
    assert.equal(comments.entries.find(item => item.author === '王弼').quote, '咸道轉末，故在口舌言語而已。');
    assert.match(comments.entries.find(item => item.author === '项安世').perspective, /异说/);
    for (const item of comments.entries) {
        assert.equal(item.summaryType, 'project-paraphrase');
        assert.equal(item.selected, true);
        assert.equal(item.target, 'primary');
        const source = method.sources.find(source => source.id === item.sourceId);
        assert.ok(source);
        assert.equal(source.verification, 'text-checked');
        assert.ok(new URL(source.url).protocol === 'https:');
        assert.ok(source.section.includes('咸'));
    }
    assert.match(method.rights.sourceLicenses, /CC BY-SA 4.0/);
    assert.match(method.rights.sourceLicenses, /未核实/);
    assert.match(method.selection.provenance, /胡方平/);
    assert.match(comments.relationship, /不是独立/);
});

test('未收录主读与上下文注解不冒充主读覆盖，经典不可用也明确标记', async () => {
    const result = await api.invoke('yi_reading', { values: [8, 8, 7, 7, 7, 8] });
    assert.equal(result.primary.id, 31);
    assert.equal(result.methodology.commentaries.focusCoverage[0].status, 'not-included');
    assert.equal(result.methodology.commentaries.focusCoverage[0].commentaryIds.length, 0);
    assert.ok(result.methodology.commentaries.entries.every(item => !item.selected));
    const missing = await api.invoke('yi_reading', { values: [7, 7, 7, 7, 7, 7] });
    assert.deepEqual(missing.methodology.commentaries.entries, []);
    assert.ok(missing.methodology.commentaries.focusCoverage.every(item => item.status === 'not-included'));
    assert.equal(buildMethodology(missing, false).layers.find(layer => layer.id === 'classic').available, false);
    assert.match(methodologyText(buildMethodology(missing, false)), /经传原文：不可用/);
    assert.match(methodologyText(missing.methodology), /CC BY-SA 4.0/);
    assert.match(methodologyText(missing.methodology), /未收录/);
});

test('修改返回对象不污染后续方法论，CLI 摘要标明本次规则是否适用', async () => {
    const first = await api.invoke('yi_reading', { values: xianValues });
    const original = structuredClone(first.methodology);
    first.methodology.sources[0].author = '篡改';
    first.methodology.commentaries.entries[0].quote = '篡改';
    first.methodology.structuralContext.primary.lines[0].proper = '篡改';
    first.methodology.selection.focus[0].position = 1;
    assert.deepEqual((await api.invoke('yi_reading', { values: xianValues })).methodology, original);
    assert.match(methodologyText(original), /三爻变简化（本次不适用）/);
    assert.match(methodologyText(original), /项安世/);
    assert.match(methodologyText(original), /不自动判吉凶/);
});
