/**
 * 帮助模块 - 打开静态的使用说明弹窗
 */
const HelpModule = (function() {
    const button = document.getElementById('helpButton');
    const dialog = document.getElementById('helpDialog');
    const version = document.getElementById('appVersion');

    function init() {
        if (version) version.textContent = YizhiApp.config.version;
        button?.addEventListener('click', show);
    }

    function show() {
        YizhiApp.dialogs.open(dialog);
    }

    return {
        init,
        show
    };
})();
