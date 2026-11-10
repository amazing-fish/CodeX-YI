import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const YiCore = require('../../apps/yi/js/core/yijing-core.js');

// 只传卦象与六爻给图片层，问题、备注、占记身份均不进入浏览器。
export function createRendering(result) {
    const hexagram = result.primary;
    const positions = YiCore.linePositions(YiCore.binaryToBits(hexagram.binary));
    const rows = [...positions].reverse().map(position => {
        const value = result.values[position.position - 1];
        const changing = value === 6 || value === 9;
        return { ...position, value, changing, marker: changing ? (value === 9 ? 'circle' : 'cross') : null };
    });
    const figure = { role: 'primary', label: '本卦', id: hexagram.id, name: hexagram.name,
        fullName: hexagram.fullName, binary: hexagram.binary,
        upperTrigram: hexagram.upperTrigram, lowerTrigram: hexagram.lowerTrigram, rows };
    return { version: 2, renderer: 'web-component-chromium', width: 648, height: 520,
        valueOrder: 'bottom-to-top', binaryOrder: 'top-to-bottom', rowOrder: 'top-to-bottom',
        legend: { yang: '实线为阳', yin: '断线为阴', circle: '圆圈为老阳（9），变阴', cross: '叉为老阴（6），变阳',
            positions: '保留原网页当位/失位、居中、相应/无应标记；自上而下为上爻至初爻' },
        alt: `本卦：第${figure.id}卦 ${figure.fullName}，上${figure.upperTrigram}下${figure.lowerTrigram}，动爻${rows.filter(row => row.changing).map(row => row.position).reverse().join('、') || '无'}；含当位、居中及相应标记`,
        figures: [figure] };
}

// 按需加载：CLI / API / image:none 无浏览器依赖，也不读样式或创建临时目录。
export async function renderPng(rendering) {
    const { renderWebPng } = await import('./web-render.mjs');
    return renderWebPng(rendering);
}
