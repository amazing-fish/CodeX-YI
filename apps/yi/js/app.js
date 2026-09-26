/**
 * 易之 - 应用内核
 * 职责：配置、存储、事件、错误、对话框、路由、通用 UI 片段与模块生命周期
 */

const APP_CONFIG = Object.freeze({
    name: '易之',
    version: '2.1.2',
    debug: false,
    storage: Object.freeze({
        backend: 'localStorage',
        prefix: 'yizhi_',
        useMemoryFallback: true
    }),
    history: Object.freeze({
        maxRecords: 200
    }),
    // 动效时长（毫秒）；系统开启“减少动态效果”时统一跳过
    motion: Object.freeze({
        coinFlip: 900,
        lineSettle: 320
    })
});

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const Utils = {
    debounce(func, wait) {
        let timer = null;
        return function debounced(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => func.apply(this, args), wait);
        };
    },

    generateId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
    },

    formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
        const pad = value => String(value).padStart(2, '0');
        return format
            .replace('YYYY', date.getFullYear())
            .replace('MM', pad(date.getMonth() + 1))
            .replace('DD', pad(date.getDate()))
            .replace('HH', pad(date.getHours()))
            .replace('mm', pad(date.getMinutes()))
            .replace('ss', pad(date.getSeconds()));
    },

    // 相对时间：用于历史列表，超过一周回退为日期
    formatRelative(timestamp) {
        const diff = Date.now() - timestamp;
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (diff < minute) return '刚刚';
        if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
        if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
        if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
        return Utils.formatDate(new Date(timestamp), 'YYYY-MM-DD');
    },

    startOfDay(date = new Date()) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    },

    // 周一为一周之始
    startOfWeek(date = new Date()) {
        const start = Utils.startOfDay(date);
        const offset = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - offset);
        return start;
    },

    startOfMonth(date = new Date()) {
        return new Date(date.getFullYear(), date.getMonth(), 1);
    },

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => HTML_ESCAPES[char]);
    },

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    prefersReducedMotion() {
        return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    },

    downloadJson(filename, data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 0);
    },

    async copyText(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (error) {
            // 落到下方的兼容方案
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch (error) {
            copied = false;
        }
        textarea.remove();
        return copied;
    }
};

// 存储：优先 localStorage，兼容迁移旧 sessionStorage 数据，不可用时退回内存 Map
const StorageManager = {
    _memoryStorage: new Map(),

    _key(key) {
        return APP_CONFIG.storage.prefix + key;
    },

    setItem(key, value) {
        const fullKey = this._key(key);
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(fullKey, JSON.stringify(value));
                return true;
            }
        } catch (error) {
            console.warn('本地存储写入失败，改用内存存储：', error);
        }
        this._memoryStorage.set(fullKey, value);
        return false;
    },

    /**
     * 读取顺序：localStorage → 旧 sessionStorage（读到即迁移）→ 内存。
     * localStorage 读取异常时仍尝试旧值；迁移写入失败时返回旧值且保留原数据，留待下次重试。
     */
    getItem(key, defaultValue = null) {
        const fullKey = this._key(key);
        try {
            if (typeof localStorage !== 'undefined') {
                let item = null;
                try {
                    item = localStorage.getItem(fullKey);
                } catch (localReadError) {
                    console.warn('本地存储读取失败，尝试旧会话存储：', localReadError);
                }
                if (item !== null) {
                    return JSON.parse(item);
                }
            }

            if (typeof sessionStorage !== 'undefined') {
                const legacyItem = sessionStorage.getItem(fullKey);
                if (legacyItem !== null) {
                    const value = JSON.parse(legacyItem);
                    if (typeof localStorage !== 'undefined') {
                        try {
                            localStorage.setItem(fullKey, JSON.stringify(value));
                            sessionStorage.removeItem(fullKey);
                        } catch (migrationError) {
                            console.warn('旧存储迁移失败，暂用旧值：', migrationError);
                        }
                    }
                    return value;
                }
            }
        } catch (error) {
            console.warn('本地存储读取失败：', error);
        }
        return this._memoryStorage.has(fullKey) ? this._memoryStorage.get(fullKey) : defaultValue;
    },

    removeItem(key) {
        const fullKey = this._key(key);
        try {
            if (typeof localStorage !== 'undefined') localStorage.removeItem(fullKey);
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(fullKey);
        } catch (error) {
            console.warn('本地存储删除失败：', error);
        }
        this._memoryStorage.delete(fullKey);
    }
};

const EventBus = {
    events: new Map(),

    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event).add(callback);
        return () => this.off(event, callback);
    },

    off(event, callback) {
        this.events.get(event)?.delete(callback);
    },

    emit(event, data) {
        this.events.get(event)?.forEach((callback) => {
            try {
                callback(data);
            } catch (error) {
                ErrorHandler.handle(error, `事件 ${event}`);
            }
        });
    }
};

const ErrorHandler = {
    handle(error, context = '未知环节', userMessage = '') {
        console.error(`[${context}]`, error);
        const message = userMessage || `${context}时出现问题，请稍后重试。`;
        window.YizhiApp?.toast('error', message);
    }
};

// 原生 <dialog> 的通用增强：点击遮罩关闭、关闭后还原焦点
const Dialogs = {
    enhance(dialog) {
        if (!dialog || dialog.dataset.enhanced === 'true') return;
        dialog.dataset.enhanced = 'true';

        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) {
                dialog.close('cancel');
            }
        });

        dialog.addEventListener('close', () => {
            const opener = dialog._opener;
            dialog._opener = null;
            if (opener && opener.isConnected && typeof opener.focus === 'function') {
                opener.focus();
            }
        });
    },

    open(dialog) {
        if (!dialog) return;
        this.enhance(dialog);
        if (!dialog.open) {
            dialog._opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            dialog.showModal();
        }
    },

    confirm(title, message, options = {}) {
        const dialog = document.getElementById('confirmDialog');
        const okButton = document.getElementById('confirmOk');
        const cancelButton = document.getElementById('confirmCancel');

        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        okButton.textContent = options.okText || '确定';
        cancelButton.textContent = options.cancelText || '取消';
        okButton.classList.toggle('btn-danger', options.danger === true);
        okButton.classList.toggle('btn-primary', options.danger !== true);

        return new Promise((resolve) => {
            dialog.returnValue = '';
            dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
            this.open(dialog);
            // 危险操作默认聚焦“取消”，避免误触回车
            (options.danger ? cancelButton : okButton).focus();
        });
    }
};

// 通用 UI 片段：卦画以 CSS 绘制，不依赖 U+4DC0 字形是否被字体支持
const UI = {
    /**
     * @param {Array<0|1|null>} bits 自下而上的爻（六爻卦或三爻卦）；null 表示尚未成爻
     * @param {Object} options
     * @param {'xs'|'sm'|'md'|'lg'} options.size
     * @param {number[]} options.changing 变爻位置（1-6）
     * @param {number[]} options.moved 之卦中由变爻而来的位置（1-6）
     * @param {number} options.active 正在投掷的位置（1-6）
     * @param {string} options.label 无障碍名称
     */
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

        const aria = label ? ` role="img" aria-label="${Utils.escapeHtml(label)}"` : ' aria-hidden="true"';
        return `<span class="gua gua-${size}"${aria}>${html}</span>`;
    },

    figureFromBinary(binary, options = {}) {
        return UI.figure(YiCore.binaryToBits(binary), options);
    },

    /**
     * 太极图：外圆两半、S 形分界与鱼眼均为独立图元，便于分别施加动效
     * 阳（light）取纸色、阴（dark）取墨色，随深浅主题自动互换
     */
    taiji(className = '') {
        return `<svg class="taiji${className ? ` ${className}` : ''}" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
            <circle class="taiji-yang" r="49"/>
            <path class="taiji-yin" d="M0-49A49 49 0 0 1 0 49A24.5 24.5 0 0 1 0 0A24.5 24.5 0 0 0 0-49z"/>
            <circle class="taiji-eye taiji-eye-yin" cy="-24.5" r="7"/>
            <circle class="taiji-eye taiji-eye-yang" cy="24.5" r="7"/>
            <circle class="taiji-rim" r="49"/>
        </svg>`;
    },

    spinner(text = '载入中') {
        return `<div class="loading-state" role="status">${UI.taiji('taiji-spin')}<span>${Utils.escapeHtml(text)}</span></div>`;
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
        return `<p class="pos-summary">当位 ${summary.proper} · 失位 ${summary.improper} · 相应 ${summary.pairs} 组${summary.note ? `<span class="pos-note">${Utils.escapeHtml(summary.note)}</span>` : ''}</p>`;
    },

    /**
     * 卦辞、彖、大象；无经传原文时返回空串
     * @param {Object} hexagram
     */
    classicBlock(hexagram) {
        const classic = hexagram.classic;
        if (!classic) return '';
        const esc = Utils.escapeHtml;
        return `
            <dl class="classic">
                <div class="classic-judgment"><dt class="visually-hidden">卦辞</dt><dd>${esc(classic.judgment)}</dd></div>
                ${classic.tuan ? `<div><dt>彖曰</dt><dd>${esc(classic.tuan)}</dd></div>` : ''}
                ${classic.daxiang ? `<div><dt>象曰</dt><dd>${esc(classic.daxiang)}</dd></div>` : ''}
            </dl>`;
    },

    // 与本卦相关的其余传文：文言（乾坤）、序卦、杂卦
    wingsBlock(hexagram) {
        const classic = hexagram.classic;
        if (!classic) return '';
        const esc = Utils.escapeHtml;
        const parts = [];
        if (classic.wenyan?.length) {
            parts.push(`
                <details class="wing">
                    <summary>文言</summary>
                    ${classic.wenyan.map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}
                </details>`);
        }
        const brief = [
            classic.xugua ? `<div><dt>序卦</dt><dd>${esc(classic.xugua)}</dd></div>` : '',
            classic.zagua ? `<div><dt>杂卦</dt><dd>${esc(classic.zagua)}</dd></div>` : ''
        ].join('');
        if (brief.trim()) parts.push(`<dl class="classic classic-brief">${brief}</dl>`);
        if (classic.notes?.length) {
            parts.push(`<p class="classic-note">校记：${classic.notes.map(esc).join('；')}</p>`);
        }
        return parts.join('');
    },

    /**
     * 爻辞列表（初 → 上；乾坤另附用九、用六）
     * @param {Object} hexagram
     * @param {Object} options
     * @param {number[]} options.changing 本次变爻位置
     * @param {number[]} options.moved 之卦中由变而来的位置
     * @param {Object<number,string>} options.focus 位置 → 标签（如“为主”“参看”）；7 表示用九 / 用六
     */
    lineList(hexagram, options = {}) {
        const { changing = [], moved = [], focus = {} } = options;
        const esc = Utils.escapeHtml;
        const positions = hexagram.bits?.length === 6 ? YiCore.linePositions(hexagram.bits) : [];

        const item = (line, position, meta) => {
            const classes = ['line-item'];
            const tags = [];

            if (changing.includes(position)) {
                classes.push('is-changing');
                tags.push('<span class="badge badge-changing">动</span>');
            }
            if (moved.includes(position)) {
                tags.push('<span class="badge badge-jade">由变</span>');
            }
            if (focus[position]) {
                classes.push('is-focus');
                tags.push(`<span class="badge">${esc(focus[position])}</span>`);
            }
            if (position === 7) classes.push('is-extra');

            return `
                <li class="${classes.join(' ')}">
                    <div class="line-head">
                        <span class="line-title">${esc(line.title)}</span>
                        ${meta}
                    </div>
                    <div class="line-body">
                        <p class="line-classic">${esc(line.text)}${tags.length ? `<span class="line-tags">${tags.join('')}</span>` : ''}</p>
                        ${line.xiang ? `<p class="line-xiang"><span class="line-xiang-label">象曰</span>${esc(line.xiang)}</p>` : ''}
                        ${line.gloss ? `<p class="line-gloss">${esc(line.gloss)}</p>` : ''}
                    </div>
                </li>`;
        };

        const items = (hexagram.lines || []).map((line, index) => {
            const position = positions[index];
            return item(line, index + 1, position ? UI.positionTags(position) : '');
        });
        const extra = hexagram.classic?.extra;
        if (extra) items.push(item(extra, 7, ''));

        return `<ol class="line-list">${items.join('')}</ol>`;
    },

    // 错、综、互卦入口，点击后在详情弹窗中打开
    relationChips(hexagram) {
        const data = YizhiApp.getModule('hexagramData');
        if (!data?.isInitialized || !hexagram?.id) return '';

        const related = data.getRelatedHexagrams(hexagram.id);
        const chips = Object.entries(related).map(([type, item]) => `
            <button class="chip" type="button" data-open-hexagram="${item.id}">
                ${UI.figureFromBinary(item.binary, { size: 'xs' })}
                <span class="chip-label">${data.RELATION_NAMES[type]}</span>
                <span>${Utils.escapeHtml(item.name)}</span>
            </button>`);
        return chips.length ? `<div class="chips">${chips.join('')}</div>` : '';
    },

    // 高亮关键词（先转义再标记，避免注入）
    highlight(text, query) {
        const safe = Utils.escapeHtml(text);
        if (!query) return safe;
        const escapedQuery = Utils.escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return safe.replace(new RegExp(escapedQuery, 'gi'), match => `<mark>${match}</mark>`);
    }
};

// 基于 hash 的视图路由，支持浏览器前进后退与直接分享链接
const Router = {
    views: ['cast', 'library', 'trigrams', 'history'],
    current: null,

    init() {
        window.addEventListener('hashchange', () => this.sync());
        this.sync();
    },

    viewFromHash() {
        const view = window.location.hash.replace(/^#\/?/, '');
        return this.views.includes(view) ? view : 'cast';
    },

    go(view) {
        if (!this.views.includes(view)) return;
        if (this.viewFromHash() === view && this.current === view) return;
        window.location.hash = `#${view}`;
    },

    sync() {
        const view = this.viewFromHash();
        const changed = this.current !== view;
        this.current = view;

        document.querySelectorAll('[data-view]').forEach((section) => {
            section.hidden = section.dataset.view !== view;
        });

        document.querySelectorAll('[data-nav]').forEach((link) => {
            if (link.dataset.nav === view) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });

        if (changed) {
            window.scrollTo({ top: 0 });
            EventBus.emit('view:changed', { view });
        }
    }
};

/**
 * 启动画面：数据就绪（或失败）后淡出并移除。
 * 画面在 400ms 后才显现（见 base.css），加载快时不会闪一下。
 */
const BootSplash = {
    dismiss() {
        const splash = document.getElementById('bootSplash');
        if (!splash || splash.classList.contains('is-leaving')) return;
        const visible = parseFloat(getComputedStyle(splash).opacity) > 0.05;
        if (!visible || Utils.prefersReducedMotion()) {
            splash.remove();
            return;
        }
        splash.classList.add('is-leaving');
        splash.addEventListener('animationend', () => splash.remove(), { once: true });
        setTimeout(() => splash.remove(), 800);
    }
};

const YizhiApp = (function() {
    const modules = new Map();
    let isInitialized = false;

    function registerModule(name, moduleInstance) {
        if (!moduleInstance || modules.has(name)) return;
        modules.set(name, moduleInstance);
    }

    function getModule(name) {
        return modules.get(name);
    }

    function toast(type, message, options) {
        const notification = modules.get('notification');
        if (notification) {
            notification.show(type, message, options);
        }
    }

    // 数据就绪后执行；若已就绪则立即执行
    function whenDataReady(callback) {
        const data = modules.get('hexagramData');
        if (data?.isInitialized) {
            callback(data);
            return;
        }
        const off = EventBus.on('hexagram-data:ready', () => {
            off();
            callback(modules.get('hexagramData'));
        });
    }

    function initShortcuts() {
        document.addEventListener('keydown', (event) => {
            const target = event.target;
            const typing = target instanceof HTMLElement
                && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
            const dialogOpen = Boolean(document.querySelector('dialog[open]'));

            if (event.altKey && !event.ctrlKey && !event.metaKey) {
                const index = Number(event.key) - 1;
                if (Router.views[index]) {
                    event.preventDefault();
                    Router.go(Router.views[index]);
                }
                return;
            }

            if (dialogOpen) return;

            const wantsSearch = (event.key === 'k' && (event.ctrlKey || event.metaKey))
                || (event.key === '/' && !typing);
            if (wantsSearch) {
                event.preventDefault();
                Router.go('library');
                requestAnimationFrame(() => document.getElementById('librarySearch')?.focus());
                return;
            }

            if (event.key === '?' && !typing) {
                event.preventDefault();
                modules.get('help')?.show();
            }
        });
    }

    function initGlobalErrors() {
        window.addEventListener('error', (event) => {
            if (event.error) ErrorHandler.handle(event.error, '运行');
        });
        window.addEventListener('unhandledrejection', (event) => {
            ErrorHandler.handle(event.reason, '异步任务');
        });
    }

    function init() {
        if (isInitialized) return;

        initGlobalErrors();
        document.querySelectorAll('dialog').forEach(dialog => Dialogs.enhance(dialog));

        for (const [name, module] of modules) {
            if (typeof module.init !== 'function') continue;
            try {
                // 数据服务异步加载，其余模块按需通过 whenDataReady 等待
                const result = module.init();
                if (result && typeof result.catch === 'function') {
                    result.catch(error => ErrorHandler.handle(error, `初始化 ${name}`));
                }
            } catch (error) {
                ErrorHandler.handle(error, `初始化 ${name}`);
            }
        }

        EventBus.on('view:changed', ({ view }) => {
            const module = modules.get(view);
            if (module && typeof module.onActivate === 'function') {
                try {
                    module.onActivate();
                } catch (error) {
                    ErrorHandler.handle(error, `切换到 ${view}`);
                }
            }
        });

        EventBus.on('hexagram-data:ready', BootSplash.dismiss);
        EventBus.on('hexagram-data:error', BootSplash.dismiss);
        // 兜底：无论数据服务是否注册成功，都不让启动画面长留
        setTimeout(BootSplash.dismiss, 8000);

        initShortcuts();
        Router.init();

        isInitialized = true;
        document.documentElement.classList.add('is-ready');
        EventBus.emit('app:initialized');
    }

    return {
        registerModule,
        getModule,
        init,
        toast,
        whenDataReady,
        utils: Utils,
        storage: StorageManager,
        events: EventBus,
        errors: ErrorHandler,
        dialogs: Dialogs,
        ui: UI,
        router: Router,
        config: APP_CONFIG,
        get isInitialized() { return isInitialized; }
    };
})();

window.YizhiApp = YizhiApp;

document.addEventListener('DOMContentLoaded', () => {
    try {
        // 注册顺序即初始化顺序：通知与数据最先，其余视图随后
        const registry = [
            ['notification', typeof NotificationModule !== 'undefined' ? NotificationModule : null],
            ['theme', typeof ThemeModule !== 'undefined' ? ThemeModule : null],
            ['hexagramData', typeof HexagramDataService !== 'undefined' ? HexagramDataService : null],
            ['modal', typeof ModalModule !== 'undefined' ? ModalModule : null],
            ['help', typeof HelpModule !== 'undefined' ? HelpModule : null],
            ['cast', typeof DivinationModule !== 'undefined' ? DivinationModule : null],
            ['library', typeof LibraryModule !== 'undefined' ? LibraryModule : null],
            ['trigrams', typeof KnowledgeModule !== 'undefined' ? KnowledgeModule : null],
            ['history', typeof HistoryModule !== 'undefined' ? HistoryModule : null]
        ];

        registry.forEach(([name, module]) => YizhiApp.registerModule(name, module));
        YizhiApp.init();
    } catch (error) {
        console.error('应用启动失败：', error);
        document.getElementById('bootSplash')?.remove();
        const fallback = document.getElementById('startupError');
        if (fallback) fallback.hidden = false;
    }
});
