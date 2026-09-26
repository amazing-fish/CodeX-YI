/**
 * 卦典模块 - 六十四卦方图 / 列表 + 排序搜索
 * 取代旧的“卦象分析”（上下卦选择 ≡ 方图行列）与“卦象查询”两个分散入口
 */
const LibraryModule = (function() {
    const search = document.getElementById('librarySearch');
    const body = document.getElementById('libraryBody');
    const meta = document.getElementById('libraryMeta');
    const layoutButtons = document.querySelectorAll('[data-layout]');

    // 先天八卦次序
    const ORDER = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
    const LAYOUT_KEY = 'library_layout';
    const FIELD_LABELS = {
        judgment: '卦辞',
        line: '爻辞',
        tuan: '彖',
        xiang: '象',
        wenyan: '文言',
        overview: '卦义',
        gloss: '白话',
        detail: '详解'
    };

    let query = '';
    let layout = YizhiApp.storage.getItem(LAYOUT_KEY)
        || (window.matchMedia('(max-width: 720px)').matches ? 'list' : 'grid');
    let dataFailed = false;

    function init() {
        syncLayoutButtons();

        search?.addEventListener('input', YizhiApp.utils.debounce(() => {
            query = search.value.trim();
            render();
        }, 150));

        search?.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && search.value) {
                event.preventDefault();
                search.value = '';
                query = '';
                render();
            }
        });

        layoutButtons.forEach((button) => {
            button.addEventListener('click', () => {
                layout = button.dataset.layout;
                YizhiApp.storage.setItem(LAYOUT_KEY, layout);
                syncLayoutButtons();
                render();
            });
        });

        YizhiApp.whenDataReady(render);
        YizhiApp.events.on('hexagram-data:error', () => {
            dataFailed = true;
            render();
        });
    }

    function onActivate() {
        render();
    }

    function syncLayoutButtons() {
        layoutButtons.forEach((button) => {
            button.setAttribute('aria-pressed', String(button.dataset.layout === layout));
        });
    }

    function render() {
        if (!body) return;
        const data = YizhiApp.getModule('hexagramData');
        if (!data?.isInitialized) {
            if (dataFailed) {
                body.innerHTML = '<div class="empty"><p class="empty-title">卦象数据加载失败</p><p>请检查网络后刷新页面。</p></div>';
            }
            return;
        }

        const results = query ? data.searchHexagrams(query) : null;
        const hits = results ? new Map(results.map(result => [result.hexagram.id, result])) : null;

        if (meta) {
            meta.textContent = results
                ? (results.length ? `“${query}”匹配 ${results.length} 卦` : `没有找到与“${query}”相关的卦`)
                : '共六十四卦 · 点击任一卦查看卦义与六爻';
        }

        body.innerHTML = layout === 'grid' ? gridHtml(data, hits) : listHtml(data, results);
    }

    function gridHtml(data, hits) {
        const { ui, utils } = YizhiApp;
        const trigram = name => data.getBagua(name);
        const head = ORDER.map((name) => `
            <th scope="col">
                ${ui.figureFromBinary(trigram(name).binary, { size: 'xs' })}
                <strong>${name}</strong>${utils.escapeHtml(trigram(name).nature)}
            </th>`).join('');

        const rows = ORDER.map((upper) => {
            const cells = ORDER.map((lower) => {
                const hexagram = data.getHexagramByTrigrams(upper, lower);
                if (!hexagram) return '<td></td>';
                const state = hits ? (hits.has(hexagram.id) ? ' is-hit' : ' is-dim') : '';
                return `
                    <td>
                        <button class="matrix-cell${state}" type="button" data-open-hexagram="${hexagram.id}"
                            aria-label="第 ${hexagram.id} 卦 ${utils.escapeHtml(hexagram.fullName)}，${utils.escapeHtml(hexagram.explanation)}">
                            ${ui.figureFromBinary(hexagram.binary, { size: 'sm' })}
                            <span class="matrix-name">${utils.escapeHtml(hexagram.name)}</span>
                        </button>
                    </td>`;
            }).join('');

            return `
                <tr>
                    <th scope="row">
                        <span class="matrix-rowhead">
                            <span><strong>${upper}</strong>${utils.escapeHtml(trigram(upper).nature)}</span>
                            ${ui.figureFromBinary(trigram(upper).binary, { size: 'xs' })}
                        </span>
                    </th>
                    ${cells}
                </tr>`;
        }).join('');

        return `
            <div class="matrix-wrap">
                <table class="matrix">
                    <caption class="visually-hidden">六十四卦方图：行为上卦，列为下卦</caption>
                    <thead><tr><th class="matrix-corner" scope="col">上 ╲ 下</th>${head}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    function listHtml(data, results) {
        const { ui, utils } = YizhiApp;
        const items = results || data.getAllHexagrams().map(hexagram => ({ hexagram }));

        if (items.length === 0) {
            return `
                <div class="empty">
                    <p class="empty-title">没有匹配的卦</p>
                    <p>试试卦名（如“既济”）、卦序（如“63”）或爻辞中的字词（如“龙”）。</p>
                </div>`;
        }

        return `<ul class="hex-list">${items.map(({ hexagram, field, snippet }) => `
            <li>
                <button class="hex-item" type="button" data-open-hexagram="${hexagram.id}">
                    ${ui.figureFromBinary(hexagram.binary, { size: 'sm' })}
                    <span class="hex-text">
                        <span class="hex-title">
                            <span class="hex-name">${ui.highlight(hexagram.name, query)}</span>
                            <span class="hex-full">${ui.highlight(hexagram.fullName, query)}</span>
                            <span class="hex-id">${hexagram.id}</span>
                        </span>
                        <span class="hex-gist">${ui.highlight(hexagram.explanation, query)}</span>
                        ${snippet ? `<span class="hex-snippet">${FIELD_LABELS[field] || ''}：${ui.highlight(snippet, query)}</span>` : ''}
                    </span>
                </button>
            </li>`).join('')}</ul>`;
    }

    function focusSearch() {
        search?.focus();
        search?.select();
    }

    return {
        init,
        onActivate,
        focusSearch
    };
})();
