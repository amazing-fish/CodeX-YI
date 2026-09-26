/**
 * 八卦 · 易传模块 - 八卦卡片、断卦规则与十翼通论
 * 规则文本取自 YiCore.RULES，与起卦页“解读指引”同源
 */
const KnowledgeModule = (function() {
    const grid = document.getElementById('trigramGrid');
    const rulesList = document.getElementById('rulesList');
    const wingsBody = document.getElementById('wingsBody');

    // 通论全经的传文；彖、象、文言随卦附于卦文
    const WINGS = [
        ['xici_shang', '系辞上'],
        ['xici_xia', '系辞下'],
        ['shuogua', '说卦'],
        ['xugua', '序卦'],
        ['zagua', '杂卦']
    ];

    // 先天八卦次序
    const ORDER = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
    const PROPS = [
        ['element', '五行'],
        ['direction', '方位'],
        ['family', '家人'],
        ['animal', '取象']
    ];

    function init() {
        renderRules();
        YizhiApp.whenDataReady((data) => {
            renderTrigrams(data);
            renderWings(data);
        });
    }

    function renderWings(data) {
        if (!wingsBody) return;
        const esc = YizhiApp.utils.escapeHtml;
        const classics = data.getClassics();
        if (!classics) {
            wingsBody.innerHTML = '<p class="wings-empty">经传原文未能载入，请检查网络后刷新页面。</p>';
            return;
        }

        const panels = WINGS.map(([key, name]) => {
            const paragraphs = classics.appendix[key] || [];
            return `
                <details class="wing wing-panel">
                    <summary><span>${name}</span><span class="wing-count">${paragraphs.length} 段</span></summary>
                    <ol class="wing-text">${paragraphs.map(paragraph => `<li>${esc(paragraph)}</li>`).join('')}</ol>
                </details>`;
        });

        wingsBody.innerHTML = `
            ${panels.join('')}
            <p class="wings-source">底本：${esc(classics.source)}</p>`;
    }

    function renderRules() {
        if (!rulesList) return;
        rulesList.innerHTML = YiCore.RULES.map(rule => `
            <li><strong>${rule.name}</strong><span>${YizhiApp.utils.escapeHtml(rule.text)}</span></li>`).join('');
    }

    function renderTrigrams(data) {
        if (!grid) return;
        const { ui, utils } = YizhiApp;

        grid.innerHTML = ORDER.map((name) => {
            const bagua = data.getBagua(name);
            if (!bagua) return '';
            const bits = YiCore.binaryToBits(bagua.binary);
            const props = PROPS
                .filter(([key]) => bagua[key])
                .map(([key, label]) => `<div><dt>${label}</dt><dd>${utils.escapeHtml(bagua[key])}</dd></div>`)
                .join('');

            return `
                <article class="panel trigram-card" aria-labelledby="trigram-${name}">
                    <div class="trigram-top">
                        ${ui.figure(bits, { size: 'md', label: `${name}卦` })}
                        <div>
                            <h2 class="trigram-name" id="trigram-${name}">${name}</h2>
                            <p class="trigram-nature">${utils.escapeHtml(bagua.nature)}</p>
                        </div>
                    </div>
                    <p class="trigram-attr">${utils.escapeHtml(bagua.attribute)}</p>
                    <dl class="trigram-props">${props}</dl>
                </article>`;
        }).join('');
    }

    return {
        init
    };
})();
