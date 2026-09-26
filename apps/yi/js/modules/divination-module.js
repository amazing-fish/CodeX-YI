/**
 * 起卦模块 - 三钱起卦、成卦台与解读
 *
 * 所有界面都由 state 推导：lines（自下而上）决定成卦台、按钮与解读，
 * 不再分别维护进度条、步骤条、流程看板等多份重复状态。
 */
const DivinationModule = (function() {
    const panel = document.getElementById('castPanel');
    const questionInput = document.getElementById('questionInput');
    const stage = document.getElementById('castStage');
    const coins = document.getElementById('coins');
    const status = document.getElementById('castStatus');
    const castBtn = document.getElementById('castBtn');
    const castBtnLabel = document.getElementById('castBtnLabel');
    const castAllBtn = document.getElementById('castAllBtn');
    const resetBtn = document.getElementById('resetBtn');
    const reading = document.getElementById('reading');

    const state = {
        lines: [],
        busy: false,
        fast: false,
        lastCoins: null,
        castAt: null,
        savedId: null,
        fromHistory: false,
        tab: 'primary'
    };

    let dataFailed = false;
    let axis = null;

    function init() {
        castBtn?.addEventListener('click', () => castOnce());
        castAllBtn?.addEventListener('click', castRemaining);
        resetBtn?.addEventListener('click', () => reset());

        questionInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                castOnce();
            }
        });

        document.addEventListener('keydown', handleSpace);
        reading?.addEventListener('click', handleReadingClick);
        reading?.addEventListener('keydown', handleTabKeys);

        renderCoins(null);
        render();

        YizhiApp.events.on('hexagram-data:ready', render);
        YizhiApp.events.on('hexagram-data:error', () => {
            dataFailed = true;
            render();
        });
    }

    function onActivate() {
        render();
    }

    // 空格掷爻：仅在起卦页、未在输入框内、没有打开弹窗时生效
    function handleSpace(event) {
        if (event.key !== ' ' || event.repeat) return;
        if (YizhiApp.router.current !== 'cast' || document.querySelector('dialog[open]')) return;
        const target = event.target;
        if (target instanceof HTMLElement && (target.closest('input, textarea, select, [contenteditable="true"]')
            || (target.closest('button, a') && target !== castBtn))) {
            return;
        }
        if (state.lines.length >= 6) return;
        event.preventDefault();
        castOnce();
    }

    function motionDuration() {
        if (YizhiApp.utils.prefersReducedMotion()) return 0;
        return state.fast ? 360 : YizhiApp.config.motion.coinFlip;
    }

    async function castOnce() {
        if (state.busy || state.lines.length >= 6) return;
        if (state.lines.length === 0) {
            state.castAt = Date.now();
        }

        state.busy = true;
        const tossed = YiCore.tossCoins();
        const line = YiCore.lineFromCoins(tossed);
        const duration = motionDuration();

        renderControls();
        renderCoins(tossed, duration);
        turnAxis(state.lines.length + 1, duration);
        if (duration > 0) {
            status.textContent = '铜钱落定中…';
            await YizhiApp.utils.delay(duration + 120);
        }

        state.lines.push(line);
        state.lastCoins = tossed;
        state.busy = false;
        render({ newPosition: state.lines.length });

        if (state.lines.length === 6) {
            requestAnimationFrame(onComplete);
        }
    }

    async function castRemaining() {
        if (state.busy) return;
        state.fast = true;
        try {
            while (state.lines.length < 6) {
                await castOnce();
            }
        } finally {
            state.fast = false;
        }
    }

    const CN_ORDINAL = ['一', '二', '三', '四', '五', '六'];

    function dataService() {
        return YizhiApp.getModule('hexagramData');
    }

    function render(options = {}) {
        renderStage(options.newPosition || 0);
        renderControls();
        renderStatus();
        renderReading();
    }

    function renderCoins(tossed, duration = 0) {
        if (!coins) return;
        const faces = tossed || [false, false, false];
        coins.innerHTML = faces.map((isBack, index) => {
            const tossing = tossed && duration > 0;
            const style = tossing ? ` style="--toss-duration:${duration}ms;--toss-delay:${index * 70}ms"` : '';
            const value = tossed ? `${isBack ? '背' : '字'} ${YiCore.coinValue(isBack)}` : '';
            return `
                <span class="coin-slot${tossing ? ' is-tossing' : ''}">
                    <span class="coin${isBack ? '' : ' is-face'}${tossing ? ' is-tossing' : ''}"${style}>
                        <span class="coin-side coin-back"></span>
                        <span class="coin-side coin-face"><span>易</span><span>之</span><span>通</span><span>宝</span></span>
                    </span>
                    <span class="coin-value">${value}</span>
                </span>`;
        }).join('');
    }

    // 自上而下的三爻（如 [6,5,4]）→ 八卦名
    function trigramOf(positions) {
        const lines = positions.map(position => state.lines[position - 1]);
        const data = dataService();
        if (lines.some(line => !line) || !data?.isInitialized) return null;
        const binary = lines.map(line => (line.type === 'yang' ? '1' : '0')).join('');
        const entry = Object.entries(data.getBaguaData()).find(([, item]) => item.binary === binary);
        return entry ? { name: entry[0], ...entry[1] } : null;
    }

    function stageRow(position, newPosition) {
        const line = state.lines[position - 1];
        const isNext = !line && position === state.lines.length + 1;
        const rowClasses = ['stage-row'];
        const yaoClasses = ['yao'];
        let label = YiCore.POSITION_NAMES[position - 1];
        let meta = '';
        let place = '';

        if (line) {
            const yang = line.type === 'yang';
            const proper = yang === (position % 2 === 1);
            place = `<span class="stage-place${proper ? '' : ' is-off'}" title="${yang ? '阳' : '阴'}爻居${position % 2 === 1 ? '阳' : '阴'}位">${proper ? '当位' : '失位'}</span>`;
            label = YiCore.lineTitle(position, line.type === 'yang');
            yaoClasses.push(line.type === 'yang' ? 'is-yang' : 'is-yin');
            if (line.changing) {
                rowClasses.push('is-changing');
                yaoClasses.push('is-changing');
            }
            if (position === newPosition) yaoClasses.push('is-new');
            const mark = line.changing
                ? ` <span aria-hidden="true">${line.type === 'yang' ? '○' : '×'}</span><span class="visually-hidden">，变爻</span>`
                : '';
            meta = `${line.name} ${line.value}${mark}`;
        } else {
            yaoClasses.push('is-empty');
            if (isNext) {
                rowClasses.push('is-next');
                yaoClasses.push('is-active');
                meta = '待掷';
            }
        }

        return `
            <div class="${rowClasses.join(' ')}" data-position="${position}">
                <span class="stage-pos">${label}</span>
                <span class="${yaoClasses.join(' ')}"></span>
                <span class="stage-meta">${meta}</span>
                ${place || '<span class="stage-place" aria-hidden="true"></span>'}
            </div>`;
    }

    const STAGE_GROUPS = [
        { name: '上卦', positions: [6, 5, 4] },
        { name: '下卦', positions: [3, 2, 1] }
    ];

    /**
     * 成卦台骨架只建一次：上卦 / 太极轴 / 下卦。
     * 太极轴常驻 DOM，才能让“每成一爻转六十度、六爻成卦转满一周”的过渡连续进行。
     */
    function buildStage() {
        if (!stage) return;
        stage.innerHTML = `
            <div class="stage-group" role="group" aria-label="上卦" data-group="0"></div>
            <div class="stage-axis" aria-hidden="true">${YizhiApp.ui.taiji()}</div>
            <div class="stage-group" role="group" aria-label="下卦" data-group="1"></div>`;
        axis = stage.querySelector('.stage-axis');
    }

    // 太极随爻数转动；转动时长与铜钱翻落同步，减少动态效果时直接落位
    function turnAxis(count, duration) {
        if (!axis) return;
        axis.style.setProperty('--axis-turn', `${count * 60}deg`);
        axis.style.setProperty('--axis-duration', `${Math.max(duration, 320)}ms`);
        // 掷第六爻途中不提前亮起成卦光环，待铜钱落定后由 renderStage 设置
        if (!state.busy) axis.classList.toggle('is-complete', count === 6);
    }

    function renderStage(newPosition) {
        if (!stage) return;
        if (!axis) buildStage();

        STAGE_GROUPS.forEach((group, index) => {
            const trigram = trigramOf(group.positions);
            const caption = trigram ? `<strong>${trigram.name} · ${trigram.nature}</strong>` : '';
            stage.querySelector(`[data-group="${index}"]`).innerHTML = `
                <div class="stage-caption"><span>${group.name}</span>${caption}</div>
                ${group.positions.map(position => stageRow(position, newPosition)).join('')}`;
        });

        if (!state.busy) turnAxis(state.lines.length, YizhiApp.config.motion.lineSettle);
    }

    function renderControls() {
        const count = state.lines.length;
        const done = count === 6;

        panel?.classList.toggle('is-complete', done);
        castBtn.hidden = done;
        castAllBtn.hidden = done;
        castBtn.disabled = state.busy;
        castAllBtn.disabled = state.busy;
        castBtnLabel.textContent = done ? '已成卦' : `掷第${CN_ORDINAL[count]}爻`;
        castAllBtn.textContent = count === 0 ? '一次成卦' : '掷完余下各爻';

        resetBtn.hidden = count === 0;
        resetBtn.disabled = state.busy;
        resetBtn.textContent = done ? '再起一卦' : '重来';
        resetBtn.classList.toggle('btn-ghost', !done);

        if (questionInput) {
            questionInput.readOnly = done;
        }
    }

    function renderStatus() {
        if (!status || state.busy) return;
        const count = state.lines.length;

        if (count === 0) {
            status.textContent = '静心默念所问，掷六次成卦。';
            return;
        }

        const last = state.lines[count - 1];
        if (!state.lastCoins) {
            status.textContent = state.castAt
                ? `取自占记 · ${YizhiApp.utils.formatDate(new Date(state.castAt), 'YYYY-MM-DD HH:mm')}`
                : '取自占记';
            return;
        }

        const sum = state.lastCoins.map(isBack => YiCore.coinValue(isBack)).join(' + ');
        const changing = last.changing ? '<span class="mark-changing">，变</span>' : '';
        status.innerHTML = `第${CN_ORDINAL[count - 1]}爻：${sum} = ${last.value}，<strong>${last.name}</strong>${changing}`;
    }

    const esc = value => YizhiApp.utils.escapeHtml(value);

    function renderReading() {
        if (!reading) return;

        if (state.lines.length < 6) {
            reading.innerHTML = introHtml();
            return;
        }

        const data = dataService();
        if (!data?.isInitialized) {
            reading.innerHTML = dataFailed
                ? '<div class="panel empty"><p class="empty-title">卦象数据加载失败</p><p>卦已成，但暂时无法读取卦文，请检查网络后刷新页面。</p></div>'
                : `<div class="panel">${YizhiApp.ui.spinner('正在载入卦文')}</div>`;
            return;
        }

        const model = buildModel();
        reading.innerHTML = model.primary ? readingHtml(model) : '';
    }

    function introHtml() {
        const count = state.lines.length;
        const changingCount = state.lines.filter(line => line.changing).length;
        const lower = trigramOf([3, 2, 1]);
        const heading = count === 0 ? '三钱起卦' : '卦将成';
        const lead = count === 0
            ? '取三枚铜钱，背记三、字记二。每掷一次，三钱之和定一爻；自下而上掷六次成卦。'
            : `已得 ${count} 爻${changingCount ? `，其中变爻 ${changingCount} 个` : ''}。${lower ? `下卦为${lower.name}（${lower.nature}），` : ''}再掷 ${6 - count} 次成卦。`;

        return `
            <section class="panel reading-intro" aria-labelledby="introTitle">
                <div>
                    <h2 id="introTitle">${heading}</h2>
                    <p>${lead}</p>
                </div>
                <dl class="value-table">
                    <div><dt>九</dt><dd>老阳 · 阳变阴 <span class="mark-changing">○</span></dd></div>
                    <div><dt>七</dt><dd>少阳 · 不变</dd></div>
                    <div><dt>八</dt><dd>少阴 · 不变</dd></div>
                    <div><dt>六</dt><dd>老阴 · 阴变阳 <span class="mark-changing">×</span></dd></div>
                </dl>
                <p>六爻成后，这里会给出本卦与之卦，并按变爻多少指出应当细读的卦辞或爻辞。</p>
            </section>`;
    }

    function buildModel() {
        const data = dataService();
        const guide = YiCore.readingGuide(state.lines);
        const primary = data.getHexagramByBinary(YiCore.toBinary(state.lines));
        const changed = guide.count > 0
            ? data.getHexagramByBinary(YiCore.toBinary(YiCore.transformLines(state.lines)))
            : null;
        return { guide, primary, changed };
    }

    function readingHtml(model) {
        const { primary, changed, guide } = model;
        const question = questionInput?.value.trim() || '';
        const when = state.castAt ? YizhiApp.utils.formatDate(new Date(state.castAt), 'YYYY-MM-DD HH:mm') : '';
        const title = changed ? `${primary.name}之${changed.name}` : `${primary.name}，六爻安静`;
        const arrow = '<span class="pair-arrow" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>';

        return `
            <article class="reading-result" aria-labelledby="readingTitle">
                <header class="reading-head">
                    <h2 class="visually-hidden" id="readingTitle" tabindex="-1">卦成：${esc(title)}</h2>
                    <p class="reading-eyebrow">
                        ${when ? `<span>${when}</span>` : ''}
                        ${state.fromHistory ? '<span class="badge">取自占记</span>' : ''}
                        <span class="badge${guide.count ? ' badge-changing' : ''}">${guide.count ? `${guide.count} 爻变` : '六爻安静'}</span>
                    </p>
                    ${question ? `<p class="reading-question">${esc(question)}</p>` : ''}
                    <div class="pair${changed ? '' : ' is-single'}">
                        ${pairCard(primary, '本卦', { changing: guide.changing })}
                        ${changed ? arrow + pairCard(changed, '之卦', { moved: guide.changing }) : ''}
                    </div>
                </header>
                ${guideHtml(model)}
                ${studyHtml(model)}
                ${footerHtml()}
            </article>`;
    }

    function pairCard(hexagram, tag, options) {
        const figure = YizhiApp.ui.figureFromBinary(hexagram.binary, {
            size: 'md',
            changing: options.changing || [],
            moved: options.moved || []
        });
        return `
            <button class="pair-card" type="button" data-open-hexagram="${hexagram.id}"
                aria-label="${tag}：${esc(hexagram.fullName)}，${esc(hexagram.explanation)}。查看全文">
                ${figure}
                <span class="pair-text">
                    <span class="pair-tag">${tag} · 第 ${hexagram.id} 卦</span>
                    <span class="pair-name">${esc(hexagram.name)}</span>
                    <span class="pair-full">${esc(hexagram.fullName)}</span>
                    <span class="pair-gist">${esc(hexagram.explanation)}</span>
                </span>
            </button>`;
    }

    // 解读指引：直接把“应当看的那一句”摆到用户眼前
    function guideHtml(model) {
        const { guide, primary, changed } = model;
        const items = guide.focus.map((focus) => {
            const hexagram = focus.target === 'changed' ? changed : primary;
            const tag = focus.target === 'changed' ? '之卦' : '本卦';

            if (focus.kind === 'special') {
                // 用九、用六以经传原文为准，缺失时退回内置文本
                const extra = primary.classic?.extra;
                return focusItem(true, [`${tag}${esc(primary.name)}`, esc(focus.label)], {
                    classic: `${esc(focus.label)}，${esc(extra?.text || focus.text)}`,
                    xiang: extra?.xiang || '',
                    gloss: '六爻皆变，乾坤两卦另有专辞。'
                });
            }

            if (focus.kind === 'overview') {
                const role = focus.role ? `<span class="badge">${focus.role === '贞' ? '贞 · 体' : '悔 · 用'}</span>` : '';
                return focusItem(!focus.role || focus.role === '贞', [`${tag}${esc(hexagram.name)}`, '卦辞', role], {
                    classic: esc(hexagram.judgment || hexagram.explanation),
                    xiang: hexagram.classic?.daxiang || '',
                    gloss: `${hexagram.explanation}。${hexagram.overview}`
                });
            }

            const line = hexagram.lines[focus.position - 1];
            const role = guide.focus.length > 1 ? `<span class="badge">${focus.main ? '为主' : '参看'}</span>` : '';
            const moving = focus.target === 'primary' ? '<span class="badge badge-changing">变爻</span>' : '<span class="badge">不变爻</span>';
            const position = YiCore.linePositions(hexagram.bits)[focus.position - 1];
            return focusItem(focus.main, [`${tag}${esc(hexagram.name)}`, esc(line.title), moving, role, YizhiApp.ui.positionTags(position)], {
                classic: esc(line.text),
                xiang: line.xiang,
                gloss: line.gloss
            });
        });

        return `
            <section class="panel guide" aria-labelledby="guideTitle">
                <div class="guide-head">
                    <h3 class="guide-title" id="guideTitle">解读指引</h3>
                    <p class="guide-rule"><strong>${guide.rule.name}</strong>，${guide.rule.text}</p>
                </div>
                <div class="focus-list">${items.join('')}</div>
            </section>`;
    }

    /**
     * @param {boolean} main 是否为主断之辞
     * @param {string[]} metaParts 已转义的标签片段
     * @param {{classic: string, xiang?: string, gloss?: string}} text classic 已转义；xiang、gloss 为原始文本
     */
    function focusItem(main, metaParts, text) {
        return `
            <div class="focus-item${main ? ' is-main' : ''}">
                <p class="focus-meta">${metaParts.filter(Boolean).map(part => (part.startsWith('<') ? part : `<span>${part}</span>`)).join('')}</p>
                <p class="focus-classic">${text.classic}</p>
                ${text.xiang ? `<p class="focus-xiang"><span class="line-xiang-label">象曰</span>${esc(text.xiang)}</p>` : ''}
                ${text.gloss ? `<p class="focus-gloss">${esc(text.gloss)}</p>` : ''}
            </div>`;
    }

    function studyHtml(model) {
        const { guide, primary, changed } = model;
        const showChanged = state.tab === 'changed' && changed;
        const hexagram = showChanged ? changed : primary;
        const target = showChanged ? 'changed' : 'primary';
        const focus = {};
        guide.focus
            .filter(item => item.kind === 'line' && item.target === target)
            .forEach((item) => {
                focus[item.position] = guide.focus.length > 1 ? (item.main ? '为主' : '参看') : '所占';
            });

        if (guide.count === 6 && target === 'primary' && hexagram.classic?.extra) {
            focus[7] = '所占';
        }

        const { ui } = YizhiApp;
        const classic = ui.classicBlock(hexagram);
        const wings = ui.wingsBlock(hexagram);

        const tabs = changed
            ? `<div class="tabs" role="tablist" aria-label="卦文">
                    ${tabButton('primary', `本卦 · ${primary.name}`, !showChanged)}
                    ${tabButton('changed', `之卦 · ${changed.name}`, showChanged)}
               </div>`
            : '';

        return `
            <section class="panel study" aria-label="卦文">
                ${tabs}
                <div class="tab-panel" ${changed ? `role="tabpanel" id="studyPanel" aria-labelledby="tab-${target}"` : ''}>
                    ${classic ? `<h3 class="section-label">${esc(hexagram.name)} · 卦辞 · 彖 · 象</h3>${classic}` : ''}
                    <h3 class="section-label">白话</h3>
                    <p class="study-overview">${esc(hexagram.overview)}</p>
                    <details class="study-detail">
                        <summary>展开详解</summary>
                        <p>${esc(hexagram.detail)}</p>
                    </details>
                    <h3 class="section-label">六爻</h3>
                    ${ui.positionSummary(hexagram.bits)}
                    ${ui.lineList(hexagram, {
                        changing: showChanged ? [] : guide.changing,
                        moved: showChanged ? guide.changing : [],
                        focus
                    })}
                    ${wings ? `<h3 class="section-label">传</h3>${wings}` : ''}
                    <h3 class="section-label">错 · 综 · 互</h3>
                    ${ui.relationChips(hexagram)}
                </div>
            </section>`;
    }

    function tabButton(key, label, selected) {
        return `<button class="tab" type="button" role="tab" id="tab-${key}" data-tab="${key}"
            aria-selected="${selected}" aria-controls="studyPanel" tabindex="${selected ? 0 : -1}">${esc(label)}</button>`;
    }

    function footerHtml() {
        const saved = Boolean(state.savedId);
        return `
            <footer class="reading-footer" id="readingFooter">
                <p class="reading-note">${saved ? '已记入占记' : '尚未保存 · 记录只存于本机'}</p>
                <button class="btn btn-ghost" type="button" data-action="export">导出 JSON</button>
                <button class="btn" type="button" data-action="copy">复制卦文</button>
                <button class="btn btn-primary" type="button" data-action="save" aria-disabled="${saved}">${saved ? '已保存' : '保存到占记'}</button>
            </footer>`;
    }

    function handleReadingClick(event) {
        const tab = event.target.closest('[data-tab]');
        if (tab) {
            selectTab(tab.dataset.tab);
            return;
        }

        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'save') save();
        if (action === 'copy') copy();
        if (action === 'export') exportJson();
    }

    function selectTab(key) {
        if (state.tab === key) return;
        state.tab = key;
        renderReading();
        document.getElementById(`tab-${key}`)?.focus();
    }

    // 标签页键盘操作：左右方向键切换
    function handleTabKeys(event) {
        if (!event.target.matches('[role="tab"]')) return;
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            selectTab(state.tab === 'primary' ? 'changed' : 'primary');
        }
    }

    function onComplete() {
        const title = document.getElementById('readingTitle');
        if (!title) return;
        title.focus({ preventScroll: true });

        // 窄屏时解读在成卦台下方，成卦后滚动过去；放到下一帧，避免被同步重绘与失焦打断
        if (!window.matchMedia('(max-width: 960px)').matches) return;
        requestAnimationFrame(() => {
            const offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-height')) || 56;
            window.scrollTo({
                top: reading.getBoundingClientRect().top + window.scrollY - offset - 12,
                behavior: YizhiApp.utils.prefersReducedMotion() ? 'auto' : 'smooth'
            });
        });
    }

    function refreshFooter() {
        const footer = document.getElementById('readingFooter');
        if (footer) footer.outerHTML = footerHtml();
    }

    function save() {
        if (state.lines.length !== 6 || state.savedId) return;
        const model = buildModel();
        const record = YizhiApp.getModule('history')?.addRecord({
            timestamp: state.castAt || Date.now(),
            question: questionInput?.value.trim() || '',
            lines: state.lines.map(line => ({ ...line })),
            hexagramId: model.primary.id,
            changedHexagramId: model.changed ? model.changed.id : null,
            source: 'cast'
        });

        if (!record) return;
        state.savedId = record.id;
        refreshFooter();
        reading.querySelector('[data-action="save"]')?.focus();
        YizhiApp.toast('success', '已记入占记', {
            action: { label: '查看', handler: () => YizhiApp.router.go('history') }
        });
    }

    function readingText() {
        const { guide, primary, changed } = buildModel();
        const question = questionInput?.value.trim();
        const when = YizhiApp.utils.formatDate(new Date(state.castAt || Date.now()), 'YYYY-MM-DD HH:mm');
        const lines = state.lines.map((line, index) => {
            const mark = line.changing ? (line.type === 'yang' ? ' ○' : ' ×') : '';
            return `${YiCore.lineTitle(index + 1, line.type === 'yang')}　${line.name}${mark}`;
        }).reverse();

        const withXiang = (text, xiang) => (xiang ? `${text}\n象曰：${xiang}` : text);
        const focus = guide.focus.map((item) => {
            const hexagram = item.target === 'changed' ? changed : primary;
            if (item.kind === 'special') {
                const extra = primary.classic?.extra;
                return withXiang(`${item.label}，${extra?.text || item.text}`, extra?.xiang);
            }
            if (item.kind === 'overview') {
                const judgment = hexagram.judgment || `${hexagram.name}：${hexagram.explanation}。`;
                return withXiang(judgment, hexagram.classic?.daxiang) + `\n${hexagram.overview}`;
            }
            const line = hexagram.lines[item.position - 1];
            return line ? withXiang(`${line.title}，${line.text}`, line.xiang) + (line.gloss ? `\n${line.gloss}` : '') : '';
        });

        return [
            ...(question ? [`所问：${question}`] : []),
            `时间：${when}`,
            `本卦：${primary.fullName}（${primary.explanation}）`,
            changed ? `之卦：${changed.fullName}（${changed.explanation}）` : '六爻安静',
            '',
            ...lines,
            '',
            `${guide.rule.name}：${guide.rule.text}`,
            ...focus,
            '',
            '—— 易之'
        ].join('\n');
    }

    async function copy() {
        const copied = await YizhiApp.utils.copyText(readingText());
        YizhiApp.toast(copied ? 'success' : 'error', copied ? '卦文已复制' : '复制失败，请手动选择文本');
    }

    function exportJson() {
        const { primary, changed, guide } = buildModel();
        const timestamp = state.castAt || Date.now();
        YizhiApp.utils.downloadJson(`易之_${primary.name}_${YizhiApp.utils.formatDate(new Date(timestamp), 'YYYYMMDD-HHmmss')}.json`, {
            app: YizhiApp.config.name,
            version: YizhiApp.config.version,
            date: YizhiApp.utils.formatDate(new Date(timestamp)),
            question: questionInput?.value.trim() || '',
            hexagram: { id: primary.id, name: primary.name, fullName: primary.fullName, explanation: primary.explanation },
            changedHexagram: changed ? { id: changed.id, name: changed.name, fullName: changed.fullName } : null,
            lines: state.lines.map((line, index) => ({
                position: index + 1,
                value: line.value,
                type: line.type,
                changing: line.changing
            })),
            changingLinesCount: guide.count,
            rule: `${guide.rule.name}：${guide.rule.text}`
        });
    }

    function hasUnsavedWork() {
        return state.lines.length > 0 && !state.savedId && !state.fromHistory;
    }

    async function reset(options = {}) {
        if (state.busy) return false;
        if (!options.force && hasUnsavedWork()) {
            const done = state.lines.length === 6;
            const confirmed = await YizhiApp.dialogs.confirm(
                done ? '放弃这一卦？' : '重新开始？',
                done ? '这一卦尚未保存，重新起卦后将无法找回。' : `已掷 ${state.lines.length} 爻，重来会清空当前进度。`,
                { okText: done ? '放弃并重起' : '重来', danger: true }
            );
            if (!confirmed) return false;
        }

        const clearQuestion = state.lines.length === 6;
        Object.assign(state, {
            lines: [],
            lastCoins: null,
            castAt: null,
            savedId: null,
            fromHistory: false,
            tab: 'primary'
        });
        if (clearQuestion && questionInput) questionInput.value = '';

        renderCoins(null);
        render();
        questionInput?.focus();
        return true;
    }

    function normalizeLine(line) {
        const type = line?.type === 'yang' ? 'yang' : 'yin';
        const changing = Boolean(line?.changing);
        const value = Number(line?.value) || (type === 'yang' ? (changing ? 9 : 7) : (changing ? 6 : 8));
        return YiCore.lineFromValue(value);
    }

    // 从占记恢复：完整还原六爻与所问，便于重读
    async function loadRecord(record) {
        if (!Array.isArray(record?.lines) || record.lines.length !== 6) return false;

        if (hasUnsavedWork() && record.id !== state.savedId) {
            const confirmed = await YizhiApp.dialogs.confirm(
                '打开这条占记？',
                '当前的卦尚未保存，打开占记后将被替换。',
                { okText: '打开', danger: true }
            );
            if (!confirmed) return false;
        }

        Object.assign(state, {
            lines: record.lines.map(normalizeLine),
            lastCoins: null,
            castAt: record.timestamp || null,
            savedId: record.id,
            fromHistory: true,
            tab: 'primary'
        });
        if (questionInput) questionInput.value = record.question || '';

        YizhiApp.router.go('cast');
        renderCoins(null);
        render();
        // hashchange 异步触发并会回到顶部，稍后再定位到解读
        setTimeout(onComplete, 80);
        return true;
    }

    return {
        init,
        onActivate,
        loadRecord,
        reset: () => reset({ force: true })
    };
})();
