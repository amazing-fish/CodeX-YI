/**
 * 通知模块 - 轻量提示（toast），仅用于没有其他可见反馈的操作结果
 * show(type, message, { action: { label, handler }, duration })
 */
const NotificationModule = (function() {
    const container = document.getElementById('notificationContainer');
    const MAX_TOASTS = 3;
    const DEFAULT_DURATION = 3200;

    function init() {
        YizhiApp.events.on('network:offline', () => show('info', '网络已断开，已加载的内容仍可使用。'));
        window.addEventListener('offline', () => YizhiApp.events.emit('network:offline'));
    }

    function show(type, message, options = {}) {
        if (!container || !message) return null;

        while (container.children.length >= MAX_TOASTS) {
            container.firstElementChild.remove();
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

        const text = document.createElement('span');
        text.className = 'toast-message';
        text.textContent = message;
        toast.appendChild(text);

        if (options.action) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'toast-action';
            button.textContent = options.action.label;
            button.addEventListener('click', () => {
                options.action.handler();
                dismiss(toast);
            });
            toast.appendChild(button);
        }

        container.appendChild(toast);

        const duration = options.duration ?? (options.action ? 6000 : DEFAULT_DURATION);
        let timer = setTimeout(() => dismiss(toast), duration);

        // 悬停或聚焦时暂停计时，便于阅读和点击操作
        const pause = () => clearTimeout(timer);
        const resume = () => {
            clearTimeout(timer);
            timer = setTimeout(() => dismiss(toast), 2000);
        };
        toast.addEventListener('mouseenter', pause);
        toast.addEventListener('focusin', pause);
        toast.addEventListener('mouseleave', resume);
        toast.addEventListener('focusout', resume);

        return toast;
    }

    function dismiss(toast) {
        if (!toast.isConnected || toast.classList.contains('is-leaving')) return;
        toast.classList.add('is-leaving');
        const remove = () => toast.remove();
        toast.addEventListener('animationend', remove, { once: true });
        setTimeout(remove, 400);
    }

    return {
        init,
        show
    };
})();
