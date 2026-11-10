import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createYiApi } from '../api.mjs';
import { connectCdp, createWebDocument, findBrowser, renderWebPng } from '../web-render.mjs';

const require = createRequire(import.meta.url);
const core = require('../../../apps/yi/js/core/yijing-core.js');
const view = require('../../../apps/yi/js/core/hexagram-view.js');
const api = await createYiApi();

// 独立验证 Chromium PNG 的 CRC、无损压缩数据与尺寸，不复用生产实现。
function inspectPng(png) {
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const chunks = [];
    let width, height, channels, offset = 8;
    while (offset < png.length) {
        const length = png.readUInt32BE(offset);
        const type = png.toString('ascii', offset + 4, offset + 8);
        const data = png.subarray(offset + 8, offset + 8 + length);
        let crc = 0xffffffff;
        for (const byte of png.subarray(offset + 4, offset + 8 + length)) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
        }
        assert.equal((crc ^ 0xffffffff) >>> 0, png.readUInt32BE(offset + 8 + length));
        if (type === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            assert.equal(data[8], 8);
            assert.ok([2, 6].includes(data[9]));
            channels = data[9] === 2 ? 3 : 4;
        } else if (type === 'IDAT') chunks.push(data);
        assert.ok(!['tEXt', 'iTXt', 'zTXt'].includes(type));
        offset += length + 12;
    }
    assert.equal(offset, png.length);
    const raw = inflateSync(Buffer.concat(chunks));
    assert.equal(raw.length, (width * channels + 1) * height);
    return { width, height };
}

test('4096 六爻只画本卦，动爻及爻位吻合原核心，文本保留完整之卦和错综互', async () => {
    for (let mask = 0; mask < 4096; mask += 1) {
        const values = Array.from({ length: 6 }, (_, index) => 6 + ((mask >> (index * 2)) & 3));
        const result = await api.invoke('yi_reading', { values });
        const { rendering } = result;
        assert.equal(rendering.figures.length, 1);
        assert.equal(rendering.version, 2);
        const figure = rendering.figures[0];
        assert.equal(figure.role, 'primary');
        assert.equal(figure.binary, result.primary.binary);
        assert.deepEqual(figure.rows.map(row => row.position), [6, 5, 4, 3, 2, 1]);
        const expected = core.linePositions(core.binaryToBits(figure.binary));
        for (const row of figure.rows) {
            const value = values[row.position - 1];
            const changing = value === 6 || value === 9;
            for (const key of ['yang', 'proper', 'central', 'partner', 'corresponds']) assert.equal(row[key], expected[row.position - 1][key]);
            assert.equal(row.value, value);
            assert.equal(row.changing, changing);
            assert.equal(row.marker, changing ? value === 9 ? 'circle' : 'cross' : null);
        }
        assert.ok(result.changed && result.related.opposite && result.related.inverse && result.related.mutual);
    }
});

test('图片 HTML 使用网页同一组件与原 CSS，不包含事件/身份或第二卦', async () => {
    const cast = await api.invoke('yi_cast', { question: 'PRIVATE_QUESTION', notes: 'PRIVATE_NOTES' });
    const html = await createWebDocument(cast.rendering);
    const figure = cast.rendering.figures[0];
    assert.ok(html.includes(view.primaryFigure(figure, cast.values)));
    assert.equal((html.match(/class="primary-figure"/g) || []).length, 1);
    assert.equal((html.match(/data-position="[1-6]"/g) || []).length, 12);
    assert.ok(html.includes('.yao.is-yin'));
    assert.ok(html.includes('.pos-tag'));
    assert.match(html, /Content-Security-Policy/);
    assert.ok(!/<script|<link|<img/i.test(html));
    for (const secret of ['PRIVATE_QUESTION', 'PRIVATE_NOTES', cast.record.id, String(cast.record.timestamp)]) {
        assert.ok(!html.includes(secret));
        assert.ok(!JSON.stringify(cast.rendering).includes(secret));
    }
    await assert.rejects(createWebDocument({ ...cast.rendering, width: 1e9 }), /场景不合法/);
    await assert.rejects(createWebDocument({ ...cast.rendering, figures: [figure, figure] }), /场景不合法/);
});

test('0 到 6 动爻与乾坤全变均由原网页组件标记', async () => {
    for (let moving = 0; moving <= 6; moving += 1) {
        const values = Array.from({ length: 6 }, (_, i) => i < moving ? 9 : 7);
        const result = await api.invoke('yi_reading', { values });
        const markup = view.primaryFigure(result.primary, values);
        assert.equal((markup.match(/class="primary-moving"/g) || []).length, moving);
        assert.equal((markup.match(/yao is-yang is-changing/g) || []).length, moving);
    }
    const values = [6, 6, 6, 6, 6, 6];
    const result = await api.invoke('yi_reading', { values });
    assert.equal((view.primaryFigure(result.primary, values).match(/yao is-yin is-changing/g) || []).length, 6);
});

test('真实 Chromium 生成单本卦 PNG；三种边界场景均清理专属临时配置', async () => {
    // 专属父目录避免与并行 MCP 测试的真实浏览器目录互相干扰。
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'yi-render-test-'));
    try {
        for (const values of [[8, 8, 7, 7, 7, 6], [7, 7, 7, 7, 7, 7], [6, 6, 6, 6, 6, 6]]) {
            const result = await api.invoke('yi_reading', { values });
            const png = await renderWebPng(result.rendering, { temporaryRoot });
            assert.deepEqual(inspectPng(png), { width: 648, height: 520 });
            assert.ok(png.length > 5000 && png.length < 512 * 1024);
        }
        assert.deepEqual(await readdir(temporaryRoot), []);
    } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
    }
});

test('缺少浏览器与启动失败明确拒绝，非法场景不启动浏览器', async () => {
    await assert.rejects(findBrowser({ YI_BROWSER_PATH: '/yi-test-not-installed' }), { code: 'BROWSER_NOT_FOUND' });
    const result = await api.invoke('yi_reading', { values: [7, 7, 7, 7, 7, 7] });
    await assert.rejects(renderWebPng(result.rendering, { browserPath: '/yi-test-not-installed' }), { code: 'BROWSER_START_FAILED' });
    await assert.rejects(renderWebPng({ ...result.rendering, width: 1 }), { code: 'INVALID_SCENE' });
});

test('本机 CDP 不响应握手时按时拒绝，避免串行 MCP 永久阻塞', async () => {
    const sockets = new Set();
    const server = createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        await assert.rejects(connectCdp(`ws://127.0.0.1:${server.address().port}`, { timeout: 50 }), { code: 'RENDER_TIMEOUT' });
    } finally {
        for (const socket of sockets) socket.destroy();
        await new Promise(resolve => server.close(resolve));
    }
});
