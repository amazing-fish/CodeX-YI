import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import { createYiApi } from '../api.mjs';
import { renderPng } from '../render.mjs';

const api = await createYiApi();
const paper = [246, 241, 231];
const ink = [34, 32, 28];
const red = [179, 58, 43];
const green = [47, 107, 90];

// 独立按 PNG 规范解码并逐字节计算 CRC，不复用生产编码器。
function decode(png) {
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const chunks = [];
    let width, height, offset = 8;
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
            assert.deepEqual([...data.subarray(8)], [8, 2, 0, 0, 0]);
        } else if (type === 'IDAT') chunks.push(data);
        else assert.equal(type, 'IEND', '不嵌入文本、路径、事件或外链元数据');
        offset += length + 12;
    }
    assert.equal(offset, png.length);
    const pixels = inflateSync(Buffer.concat(chunks));
    const stride = width * 3 + 1;
    assert.equal(pixels.length, stride * height);
    for (let y = 0; y < height; y += 1) assert.equal(pixels[y * stride], 0);
    return { width, height, pixel(x, y) { return [...pixels.subarray(y * stride + 1 + x * 3, y * stride + 4 + x * 3)]; } };
}

test('4096 六爻组合的五栏图形数据与本之错综互一致，无上下颠倒或自反省略', async () => {
    for (let mask = 0; mask < 4096; mask += 1) {
        const values = Array.from({ length: 6 }, (_, index) => 6 + ((mask >> (index * 2)) & 3));
        const result = await api.invoke('yi_reading', { values });
        const { rendering } = result;
        assert.equal(rendering.figures.length, 5);
        assert.deepEqual(rendering.figures.map(figure => figure.role), ['primary', 'changed', 'opposite', 'inverse', 'mutual']);
        for (const figure of rendering.figures) {
            const hexagram = result[figure.role] || result.related[figure.role];
            assert.equal(figure.id, hexagram.id);
            assert.equal(figure.binary, hexagram.binary);
            assert.equal(figure.fullName, hexagram.fullName);
            assert.equal(figure.upperTrigram, hexagram.upperTrigram);
            assert.equal(figure.lowerTrigram, hexagram.lowerTrigram);
            assert.deepEqual(figure.rows.map(row => row.position), [6, 5, 4, 3, 2, 1]);
            assert.equal(figure.rows.map(row => Number(row.yang)).join(''), hexagram.binary);
            for (const row of figure.rows) {
                const value = values[row.position - 1];
                const moving = value === 6 || value === 9;
                assert.equal(row.changing, figure.role === 'primary' && moving);
                assert.equal(row.changed, figure.role === 'changed' && moving);
                assert.equal(row.marker, figure.role === 'primary' && moving ? (value === 9 ? 'circle' : 'cross') : null);
            }
        }
    }
});

test('PNG 为可解码 RGB 图片，关键像素呈现实断线、上下顺序、圆叉与已变方块', async () => {
    const reading = await api.invoke('yi_reading', { values: [6, 7, 8, 9, 7, 8] });
    const png = renderPng(reading.rendering);
    const decoded = decode(png);
    assert.equal(decoded.width, 1272);
    assert.equal(decoded.height, 388);
    assert.ok(png.length < 32768, '固定场景应保持小型图片');
    reading.rendering.figures.forEach((figure, index) => {
        const left = 16 + index * 248;
        figure.rows.forEach((row, j) => {
            const y = 110 + j * 32 + (j >= 3 ? 14 : 0);
            const color = row.changing ? red : row.changed ? green : ink;
            assert.deepEqual(decoded.pixel(left + 50, y + 7), color);
            assert.deepEqual(decoded.pixel(left + 175, y + 7), color);
            assert.deepEqual(decoded.pixel(left + 116, y + 7), row.yang ? color : paper);
            if (row.marker === 'circle') {
                assert.deepEqual(decoded.pixel(left + 211, y), red);
                assert.deepEqual(decoded.pixel(left + 211, y + 7), paper);
            } else if (row.marker === 'cross') assert.deepEqual(decoded.pixel(left + 211, y + 7), red);
            else assert.deepEqual(decoded.pixel(left + 211, y + 7), row.changed ? green : paper);
        });
    });
    assert.deepEqual(renderPng(reading.rendering), png, '同卦重复绘制须字节一致');
});

test('0 到 6 动爻、乾坤全变、两栏起卦均可成图，场景不携带事件或占记身份', async () => {
    for (let moving = 0; moving <= 6; moving += 1) {
        const reading = await api.invoke('yi_reading', { values: Array.from({ length: 6 }, (_, i) => i < moving ? 9 : 7) });
        decode(renderPng(reading.rendering));
    }
    decode(renderPng((await api.invoke('yi_reading', { values: [6, 6, 6, 6, 6, 6] })).rendering));
    const cast = await api.invoke('yi_cast', { question: 'PRIVATE_QUESTION', notes: 'PRIVATE_NOTES' });
    assert.equal(cast.storage.status, 'not_saved');
    assert.equal(cast.rendering.figures.length, 2);
    assert.equal(decode(renderPng(cast.rendering)).width, 528);
    const text = JSON.stringify(cast.rendering);
    for (const privateValue of ['PRIVATE_QUESTION', 'PRIVATE_NOTES', cast.record.id, String(cast.record.timestamp)]) assert.ok(!text.includes(privateValue));
    assert.throws(() => renderPng({ ...cast.rendering, width: 1e9 }), /场景不合法/);
});
