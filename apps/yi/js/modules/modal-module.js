/**
 * 卦详情弹窗 - 基于原生 <dialog>（焦点圈定、Esc 关闭由浏览器提供）
 * show(hexagram | hexagramId)
 */
const ModalModule = (function() {
    const dialog = document.getElementById('hexagramDialog');
    const figure = document.getElementById('hexagramDialogFigure');
    const title = document.getElementById('hexagramDialogTitle');
    const subtitle = document.getElementById('hexagramDialogSubtitle');
    const body = document.getElementById('hexagramDialogBody');
    const copyButton = document.getElementById('hexagramDialogCopy');

    let current = null;

    function init() {
        copyButton?.addEventListener('click', copyCurrent);

        // 全局委托：任何带 data-open-hexagram 的元素都可打开对应卦
        document.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-open-hexagram]');
            if (!trigger) return;
            event.preventDefault();
            show(Number(trigger.getAttribute('data-open-hexagram')));
        });

        dialog?.addEventListener('close', () => {
            current = null;
        });
    }

    function resolve(input) {
        const data = YizhiApp.getModule('hexagramData');
        if (typeof input === 'number') {
            return data?.getHexagramById(input) || null;
        }
        if (input && input.id && data?.isInitialized) {
            return data.getHexagramById(input.id) || input;
        }
        return input || null;
    }

    function show(input) {
        const hexagram = resolve(input);
        if (!hexagram || !dialog) return;

        current = hexagram;
        render(hexagram);
        YizhiApp.dialogs.open(dialog);
        body.scrollTop = 0;
    }

    function render(hexagram) {
        const { ui, utils } = YizhiApp;
        const data = YizhiApp.getModule('hexagramData');
        const upper = data?.getBagua(hexagram.upperTrigram);
        const lower = data?.getBagua(hexagram.lowerTrigram);

        figure.innerHTML = hexagram.binary ? ui.figureFromBinary(hexagram.binary, { size: 'md' }) : '';
        title.textContent = hexagram.name;
        subtitle.textContent = [
            hexagram.id ? `第 ${hexagram.id} 卦` : '',
            hexagram.fullName || '',
            hexagram.explanation || ''
        ].filter(Boolean).join(' · ');

        const trigrams = upper && lower
            ? `<p class="sheet-trigrams">上${utils.escapeHtml(hexagram.upperTrigram)}（${utils.escapeHtml(upper.nature)}）· 下${utils.escapeHtml(hexagram.lowerTrigram)}（${utils.escapeHtml(lower.nature)}）</p>`
            : '';
        const relations = ui.relationChips(hexagram);
        const classic = ui.classicBlock(hexagram);
        const wings = ui.wingsBlock(hexagram);
        // 占记快照只有卦名与卦义，没有卦画与爻辞时不渲染对应段落
        const hasLines = hexagram.bits?.length === 6 && hexagram.lines?.length;

        body.innerHTML = `
            ${trigrams}
            ${classic}
            <h3 class="section-label">白话</h3>
            <p class="study-overview">${utils.escapeHtml(hexagram.overview || '')}</p>
            ${hexagram.detail ? `<p class="sheet-detail">${utils.escapeHtml(hexagram.detail)}</p>` : ''}
            ${hasLines ? `<h3 class="section-label">六爻</h3>${ui.positionSummary(hexagram.bits)}${ui.lineList(hexagram)}` : ''}
            ${wings ? `<h3 class="section-label">传</h3>${wings}` : ''}
            ${relations ? `<h3 class="section-label">错 · 综 · 互</h3>${relations}` : ''}
        `;
    }

    function textOf(hexagram) {
        const classic = hexagram.classic;
        const lineText = line => [
            `${line.title}，${line.text}`,
            line.xiang ? `　象曰：${line.xiang}` : ''
        ].filter(Boolean).join('\n');
        const lines = [...(hexagram.lines || []), ...(classic?.extra ? [classic.extra] : [])].map(lineText);

        return [
            `${hexagram.fullName || hexagram.name}（第 ${hexagram.id} 卦）· ${hexagram.explanation || ''}`,
            '',
            ...(classic ? [
                classic.judgment,
                classic.tuan ? `彖曰：${classic.tuan}` : '',
                classic.daxiang ? `象曰：${classic.daxiang}` : '',
                ''
            ].filter((line, index, list) => line || index === list.length - 1) : []),
            ...lines,
            '',
            hexagram.overview || '',
            '',
            '—— 易之'
        ].join('\n');
    }

    async function copyCurrent() {
        if (!current) return;
        const copied = await YizhiApp.utils.copyText(textOf(current));
        YizhiApp.toast(copied ? 'success' : 'error', copied ? `已复制「${current.name}」卦文` : '复制失败，请手动选择文本');
    }

    function hide() {
        if (dialog?.open) dialog.close();
    }

    return {
        init,
        show,
        hide,
        get isVisible() { return Boolean(dialog?.open); }
    };
})();
