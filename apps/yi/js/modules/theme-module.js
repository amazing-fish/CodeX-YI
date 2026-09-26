/**
 * 主题模块 - 深浅色切换
 * 默认跟随系统；用户手动切换后以存储值为准（键：yizhi_theme）
 *
 * 切换按钮是一枚太极：每切换一次旋转半周（累计，不回转），阴阳互易即深浅互换；
 * 支持 View Transitions 的浏览器上，新主题自按钮处如墨晕开；减少动态效果时直接切换。
 */
const ThemeModule = (function() {
    const toggle = document.getElementById('themeToggle');
    const root = document.documentElement;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    const STORAGE_KEY = 'theme';
    const REVEAL_DURATION = 560;
    const SPIN_LEAD = 260;
    const SWITCHING_CLASS = 'theme-switching';
    // 与 css/tokens.css 中两套主题的 --paper 一致（由 static-ui 契约校验）。
    // 切换后若用 getComputedStyle 读取，会强制整页同步重算样式，是切换卡顿的主因
    const THEME_COLORS = Object.freeze({ light: '#f6f1e7', dark: '#16140f' });

    let turns = 0;
    let pendingTheme = null;
    let pendingTimer = null;

    function init() {
        const saved = YizhiApp.storage.getItem(STORAGE_KEY);
        if (saved === 'dark' || saved === 'light') {
            apply(saved);
        } else {
            apply(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
        }

        toggle?.addEventListener('click', () => {
            setTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark', { animate: true });
        });

        const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
        media?.addEventListener?.('change', (event) => {
            const userTheme = YizhiApp.storage.getItem(STORAGE_KEY);
            if (userTheme !== 'dark' && userTheme !== 'light') {
                withTransitionsPaused(() => apply(event.matches ? 'dark' : 'light'));
            }
        });
    }

    function apply(theme) {
        root.setAttribute('data-theme', theme);
        if (toggle) {
            toggle.setAttribute('aria-pressed', String(theme === 'dark'));
            toggle.setAttribute('title', theme === 'dark' ? '切换为浅色' : '切换为深色');
        }
        themeColorMeta?.setAttribute('content', THEME_COLORS[theme]);
    }

    /**
     * 切换期间暂停全站颜色过渡：否则每个带 transition 的元素都会各自补间一遍新旧颜色，
     * 既多出逐帧样式计算，又会让视图过渡拍到半途的颜色。两帧后（新主题已绘制）恢复
     */
    let switchingFrame = 0;
    function withTransitionsPaused(update) {
        cancelAnimationFrame(switchingFrame);
        root.classList.add(SWITCHING_CLASS);
        update();
        switchingFrame = requestAnimationFrame(() => {
            switchingFrame = requestAnimationFrame(() => root.classList.remove(SWITCHING_CLASS));
        });
    }

    function spin() {
        turns += 1;
        toggle?.style.setProperty('--taiji-turns', String(turns));
    }

    // 以按钮中心为圆心、覆盖整个视口的半径做圆形揭示
    function reveal(update) {
        const canAnimate = typeof document.startViewTransition === 'function' && toggle;
        if (!canAnimate) {
            update();
            return;
        }

        const rect = toggle.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

        const transition = document.startViewTransition(update);
        transition.ready.then(() => {
            root.animate(
                { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
                { duration: REVEAL_DURATION, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', pseudoElement: '::view-transition-new(root)' }
            );
        }).catch(() => {});
    }

    /**
     * 先转太极、再晕开新主题：视图过渡的快照会冻结按钮，
     * 故让旋转先在实时画面上走过大半，再开始揭示；连续点击以最后一次为准
     */
    function setTheme(theme, options = {}) {
        pendingTheme = theme;
        clearTimeout(pendingTimer);
        YizhiApp.storage.setItem(STORAGE_KEY, theme);

        const commit = () => {
            pendingTimer = null;
            withTransitionsPaused(() => apply(theme));
            YizhiApp.events.emit('theme:changed', { theme });
        };

        if (!options.animate || YizhiApp.utils.prefersReducedMotion()) {
            if (options.animate) spin();
            commit();
            return;
        }

        spin();
        toggle?.setAttribute('aria-pressed', String(theme === 'dark'));
        pendingTimer = setTimeout(() => reveal(commit), SPIN_LEAD);
    }

    // 过渡尚未落定时，以将要切换到的主题为准
    function getCurrentTheme() {
        if (pendingTimer) return pendingTheme;
        return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    return {
        init,
        setTheme,
        getCurrentTheme
    };
})();
