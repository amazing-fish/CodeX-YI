import { deflateSync } from 'node:zlib';

// 图形只取卦象资料，不复制问题、背景、占记 ID 或时间；无需字体、浏览器或文件 IO。
const ROLES = [
    ['primary', '本卦', 'PRIMARY'], ['changed', '之卦', 'CHANGED'],
    ['opposite', '错卦', 'OPPOSITE'], ['inverse', '综卦', 'INVERSE'], ['mutual', '互卦', 'MUTUAL']
];
const COLORS = { paper: [246, 241, 231], ink: [34, 32, 28], vermilion: [179, 58, 43], jade: [47, 107, 90], muted: [125, 117, 104], border: [207, 197, 179] };
const CARD_WIDTH = 248;
const HEIGHT = 388;

export function createRendering(result, includeRelated = false) {
    const figures = ROLES.slice(0, includeRelated ? 5 : 2).map(([role, label, caption]) => {
        const hexagram = result[role] || result.related[role];
        const rows = [...hexagram.binary].map((bit, index) => {
            const position = 6 - index;
            const moving = result.values[position - 1] === 6 || result.values[position - 1] === 9;
            return { position, yang: bit === '1',
                changing: role === 'primary' && moving,
                changed: role === 'changed' && moving,
                marker: role === 'primary' && moving ? (bit === '1' ? 'circle' : 'cross') : null };
        });
        return { role, label, caption, id: hexagram.id, name: hexagram.name, fullName: hexagram.fullName,
            binary: hexagram.binary, upperTrigram: hexagram.upperTrigram, lowerTrigram: hexagram.lowerTrigram, rows };
    });
    return { version: 1, width: 32 + CARD_WIDTH * figures.length, height: HEIGHT,
        valueOrder: 'bottom-to-top', binaryOrder: 'top-to-bottom', rowOrder: 'top-to-bottom',
        legend: { yang: '实线为阳', yin: '断线为阴', circle: '圆圈为老阳（9），变阴', cross: '叉为老阴（6），变阳', changed: '之卦右侧方块表示已变位置，不是再次动爻', numbers: '左侧 6→1 对应上爻→初爻；三四爻之间留间隔区分上下卦' },
        alt: figures.map(figure => `${figure.caption}（${figure.label}）：第${figure.id}卦 ${figure.fullName}，上${figure.upperTrigram}下${figure.lowerTrigram}，自上而下${figure.binary}${figure.role === 'primary' ? `，动爻${figure.rows.filter(row => row.changing).map(row => row.position).reverse().join('、') || '无'}` : ''}`).join('；'),
        figures };
}

// 自制 5×7 ASCII 点阵只标识栏位和卦序；中文全名与图例由同一 rendering 元数据提供。
const FONT = {
    '0': '01110/10001/10011/10101/11001/10001/01110', '1': '00100/01100/00100/00100/00100/00100/01110',
    '2': '01110/10001/00001/00010/00100/01000/11111', '3': '11110/00001/00001/01110/00001/00001/11110',
    '4': '00010/00110/01010/10010/11111/00010/00010', '5': '11111/10000/10000/11110/00001/00001/11110',
    '6': '01110/10000/10000/11110/10001/10001/01110', '7': '11111/00001/00010/00100/01000/01000/01000',
    '8': '01110/10001/10001/01110/10001/10001/01110', '9': '01110/10001/10001/01111/00001/00001/01110',
    B: '11110/10001/10001/11110/10001/10001/11110',
    A: '01110/10001/10001/11111/10001/10001/10001', C: '01111/10000/10000/10000/10000/10000/01111',
    D: '11110/10001/10001/10001/10001/10001/11110', E: '11111/10000/10000/11110/10000/10000/11111',
    G: '01111/10000/10000/10111/10001/10001/01111', H: '10001/10001/10001/11111/10001/10001/10001',
    I: '11111/00100/00100/00100/00100/00100/11111', L: '10000/10000/10000/10000/10000/10000/11111',
    M: '10001/11011/10101/10101/10001/10001/10001', N: '10001/11001/10101/10011/10001/10001/10001',
    O: '01110/10001/10001/10001/10001/10001/01110', P: '11110/10001/10001/11110/10000/10000/10000',
    R: '11110/10001/10001/11110/10100/10010/10001', S: '01111/10000/10000/01110/00001/00001/11110',
    T: '11111/00100/00100/00100/00100/00100/00100', U: '10001/10001/10001/10001/10001/10001/01110',
    V: '10001/10001/10001/10001/10001/01010/00100', Y: '10001/10001/01010/00100/00100/00100/00100',
    '#': '01010/11111/01010/01010/11111/01010/01010'
};

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});
function chunk(type, data) {
    const name = Buffer.from(type, 'ascii');
    let crc = 0xffffffff;
    for (const byte of Buffer.concat([name, data])) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length, 0);
    name.copy(result, 4);
    data.copy(result, 8);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
}

export function renderPng(rendering) {
    // 仅接受内部固定场景；尺寸不受 MCP 参数控制，限制分配与响应大小。
    const { width, height, figures } = rendering;
    if (![2, 5].includes(figures?.length) || width !== 32 + CARD_WIDTH * figures.length || height !== HEIGHT
        || figures.some((figure, index) => figure.role !== ROLES[index][0] || figure.rows?.length !== 6)) throw new Error('卦画场景不合法');
    const pixels = Buffer.alloc(width * height * 3);
    function rect(x, y, w, h, color) {
        for (let row = Math.max(0, y); row < Math.min(height, y + h); row += 1) {
            for (let column = Math.max(0, x); column < Math.min(width, x + w); column += 1) {
                const offset = (row * width + column) * 3;
                pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2];
            }
        }
    }
    function text(value, x, y, scale = 2, color = COLORS.ink) {
        for (const [index, character] of [...value].entries()) {
            const glyph = FONT[character];
            if (!glyph) continue;
            glyph.split('/').forEach((row, j) => [...row].forEach((bit, i) => {
                if (bit === '1') rect(x + (index * 6 + i) * scale, y + j * scale, scale, scale, color);
            }));
        }
    }
    rect(0, 0, width, height, COLORS.paper);
    figures.forEach((figure, index) => {
        const left = 16 + index * CARD_WIDTH;
        if (index) rect(left - 8, 24, 1, 330, COLORS.border);
        text(figure.caption, left + 12, 24, 3);
        text(`#${figure.id}`, left + 12, 60, 2, COLORS.muted);
        figure.rows.forEach((row, rowIndex) => {
            const y = 110 + rowIndex * 32 + (rowIndex >= 3 ? 14 : 0);
            const color = row.changing ? COLORS.vermilion : row.changed ? COLORS.jade : COLORS.ink;
            text(String(row.position), left + 12, y + 1, 2, COLORS.muted);
            rect(left + 44, y, row.yang ? 144 : 60, 14, color);
            if (!row.yang) rect(left + 128, y, 60, 14, color);
            if (row.marker === 'circle') {
                for (let dy = -7; dy <= 7; dy += 1) for (let dx = -7; dx <= 7; dx += 1) {
                    const distance = dx * dx + dy * dy;
                    if (distance >= 25 && distance <= 49) rect(left + 211 + dx, y + 7 + dy, 1, 1, color);
                }
            } else if (row.marker === 'cross') {
                for (let d = 0; d < 14; d += 1) {
                    rect(left + 204 + d, y + d, 2, 2, color);
                    rect(left + 217 - d, y + d, 2, 2, color);
                }
            } else if (row.changed) {
                rect(left + 206, y + 2, 10, 10, color);
            }
        });
        text(figure.binary, left + 44, 318, 2, COLORS.muted);
    });
    text('6 TOP   1 BOTTOM', 28, 360, 2, COLORS.muted);
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
    const stride = width * 3;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y += 1) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
