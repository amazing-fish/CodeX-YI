// 网页与本机图片共享的卦画、爻位标记；保持同一份 DOM 实现。
(function(root) {
    'use strict';
    const YiCore = typeof module === 'object' && module.exports
        ? require('./yijing-core.js') : root.YiCore;
    const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => escapes[char]);
    const view = {
    figure(bits, options = {}) {
        const { size = 'md', changing = [], moved = [], active = 0, label = '' } = options;
        let html = '';

        for (let position = bits.length; position >= 1; position -= 1) {
            const bit = bits[position - 1];
            const classes = ['yao'];

            if (bit === null || bit === undefined) {
                classes.push('is-empty');
                if (position === active) classes.push('is-active');
            } else {
                classes.push(bit === 1 ? 'is-yang' : 'is-yin');
                if (changing.includes(position)) classes.push('is-changing');
                if (moved.includes(position)) classes.push('is-moved');
            }

            html += `<span class="${classes.join(' ')}" data-position="${position}"></span>`;
        }

        const aria = label ? ` role="img" aria-label="${escapeHtml(label)}"` : ' aria-hidden="true"';
        return `<span class="gua gua-${size}"${aria}>${html}</span>`;
    },

    figureFromBinary(binary, options = {}) {
        return view.figure(YiCore.binaryToBits(binary), options);
    },

    // 爻位标记：当位 / 失位、居中、有应 / 无应
    positionTags(position) {
        const partner = YiCore.POSITION_NAMES[position.partner - 1];
        const tags = [
            position.proper
                ? '<span class="pos-tag" title="阳爻居奇位或阴爻居偶位">当位</span>'
                : '<span class="pos-tag is-off" title="阳爻居偶位或阴爻居奇位">失位</span>'
        ];
        if (position.central) {
            tags.push('<span class="pos-tag" title="二、五分居下卦、上卦之中">居中</span>');
        }
        tags.push(position.corresponds
            ? `<span class="pos-tag" title="与${partner}爻一阴一阳，相应">应${partner}</span>`
            : `<span class="pos-tag is-off" title="与${partner}爻同性，不相应">无应</span>`);
        return `<span class="pos-tags">${tags.join('')}</span>`;
    },

    positionSummary(bits) {
        const summary = YiCore.positionSummary(bits);
        return `<p class="pos-summary">当位 ${summary.proper} · 失位 ${summary.improper} · 相应 ${summary.pairs} 组${summary.note ? `<span class="pos-note">${escapeHtml(summary.note)}</span>` : ''}</p>`;
    },

    // 只展示本卦；错综互与之卦保留在调用方的文本资料中。
    primaryFigure(hexagram, values) {
        if (!hexagram || !/^[01]{6}$/.test(hexagram.binary)) throw new TypeError('需要完整的本卦');
        if (!Array.isArray(values) || values.length !== 6 || values.some(value => ![6, 7, 8, 9].includes(value))) {
            throw new TypeError('需要自下而上的六爻数值');
        }
        const bits = YiCore.binaryToBits(hexagram.binary);
        if (values.some((value, index) => value % 2 !== bits[index])) throw new TypeError('六爻与本卦不一致');
        const changing = values.flatMap((value, index) => value === 6 || value === 9 ? [index + 1] : []);
        const positions = YiCore.linePositions(bits).reverse();
        return `<article class="primary-figure">
            <header class="primary-figure-head">
                <p class="primary-figure-eyebrow">本卦 · 第 ${escapeHtml(hexagram.id)} 卦</p>
                <h1>${escapeHtml(hexagram.fullName || hexagram.name)}</h1>
                <p>上卦 ${escapeHtml(hexagram.upperTrigram)} · 下卦 ${escapeHtml(hexagram.lowerTrigram)}</p>
            </header>
            <div class="primary-figure-body">
                <div class="primary-figure-labels">${positions.map(item => `<span>${escapeHtml(YiCore.lineTitle(item.position, item.yang))}</span>`).join('')}</div>
                ${view.figure(bits, { size: 'lg', changing, label: hexagram.fullName || hexagram.name })}
                <div class="primary-figure-tags">${positions.map(item => `<div data-position="${item.position}">${view.positionTags(item)}${changing.includes(item.position) ? '<span class="primary-moving">变爻</span>' : ''}</div>`).join('')}</div>
            </div>
            ${view.positionSummary(bits)}
            <p class="primary-figure-legend">○ 老阳变阴 · × 老阴变阳</p>
        </article>`;
    }
    };
    Object.freeze(view);
    if (typeof module === 'object' && module.exports) module.exports = view;
    else root.YiView = view;
})(typeof window !== 'undefined' ? window : globalThis);
