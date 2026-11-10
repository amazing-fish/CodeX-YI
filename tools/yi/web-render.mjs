import { createRequire } from 'node:module';
import { access, readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const CSS_FILES = ['tokens.css', 'base.css', 'components.css', 'gua.css', 'cast.css'];
const fail = (code, message) => Object.assign(new Error(message), { code });

export async function findBrowser(environment = process.env, platform = process.platform) {
    const candidates = environment.YI_BROWSER_PATH ? [environment.YI_BROWSER_PATH] : platform === 'win32'
        ? [join(environment.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
            join(environment['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
            join(environment.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')]
        : platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
            : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
    for (const candidate of candidates) {
        try { await access(candidate); return candidate; } catch { /* 尝试下一已知安装路径。 */ }
    }
    throw fail('BROWSER_NOT_FOUND', '未找到本机 Chrome/Edge/Chromium；可配置 YI_BROWSER_PATH，或使用 image:none。');
}

export function validateScene(scene) {
    const figure = scene?.figures?.[0];
    if (scene?.version !== 2 || scene.width !== 648 || scene.height !== 520 || scene.figures.length !== 1
        || figure?.role !== 'primary' || !/^[01]{6}$/.test(figure.binary) || figure.rows?.length !== 6
        || figure.rows.some((row, index) => row.position !== 6 - index || ![6, 7, 8, 9].includes(row.value)
            || Number(row.value % 2) !== Number(figure.binary[index]))) throw fail('INVALID_SCENE', '本卦场景不合法');
    return figure;
}

export async function createWebDocument(scene) {
    const figure = validateScene(scene);
    const view = require('../../apps/yi/js/core/hexagram-view.js');
    const styles = await Promise.all(CSS_FILES.map(name => readFile(new URL(`../../apps/yi/css/${name}`, import.meta.url), 'utf8')));
    const values = [...figure.rows].reverse().map(row => row.value);
    // 原组件、原 CSS；仅画布边距与动画关闭属于截图布局。无事件、外链或脚本。
    return `<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'none'; img-src 'none'; connect-src 'none'">
<style>${styles.join('\n')}\nhtml,body{margin:0;padding:0;width:648px;height:520px;min-height:0;overflow:hidden}body{padding:24px;display:grid;align-items:center}*,*::before,*::after{animation:none!important;transition:none!important}</style>
</head><body>${view.primaryFigure(figure, values)}</body></html>`;
}

// 使用 Node 自带 WebSocket 对本次隔离浏览器发 CDP；不连接用户的已开浏览器。
export async function connectCdp(url, { timeout = 10000 } = {}) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
        let settled = false;
        const finish = error => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) { socket.close(); reject(error); } else resolve();
        };
        const timer = setTimeout(() => finish(fail('RENDER_TIMEOUT', '本机图片浏览器握手超时')), timeout);
        socket.addEventListener('open', () => finish(), { once: true });
        socket.addEventListener('error', () => finish(fail('BROWSER_CONNECTION_FAILED', '本机图片浏览器连接失败')), { once: true });
        socket.addEventListener('close', () => finish(fail('BROWSER_CLOSED', '本机图片浏览器连接已关闭')), { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        const waiter = pending.get(message.id);
        if (!waiter) return;
        pending.delete(message.id);
        clearTimeout(waiter.timer);
        if (message.error) waiter.reject(fail('BROWSER_PROTOCOL', message.error.message));
        else waiter.resolve(message.result);
    });
    socket.addEventListener('close', () => {
        for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(fail('BROWSER_CLOSED', '图片浏览器已关闭')); }
        pending.clear();
    });
    return { close: () => socket.close(), send(method, params = {}, sessionId) {
        return new Promise((resolve, reject) => {
            const id = ++sequence;
            const timer = setTimeout(() => { pending.delete(id); reject(fail('RENDER_TIMEOUT', '网页图片渲染超时')); }, 10000);
            pending.set(id, { resolve, reject, timer });
            try { socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
            catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
        });
    } };
}

export async function renderWebPng(scene, { browserPath, timeout = 20000, temporaryRoot = tmpdir() } = {}) {
    const html = await createWebDocument(scene);
    const executable = browserPath || await findBrowser();
    const profile = await mkdtemp(join(temporaryRoot, 'yi-render-'));
    let child, cdp, exited, launchError;
    try {
        child = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
            '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-breakpad',
            '--disable-default-apps', '--metrics-recording-only', '--mute-audio', '--no-proxy-server',
            '--host-resolver-rules=MAP * ~NOTFOUND', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
            `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
        child.once('error', error => { launchError = error; });
        const closed = new Promise(resolve => child.once('exit', () => { exited = true; resolve(); }));
        const started = Date.now();
        let endpoint;
        while (!endpoint && Date.now() - started < timeout) {
            if (launchError || exited) throw fail('BROWSER_START_FAILED', '本机浏览器启动失败');
            try {
                const [port, path] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
                if (/^\d+$/.test(port) && path?.startsWith('/devtools/browser/')) endpoint = `ws://127.0.0.1:${port}${path}`;
            } catch { /* 首次启动时端点文件尚未就绪。 */ }
            if (!endpoint) await sleep(50);
        }
        if (!endpoint) throw fail('RENDER_TIMEOUT', '等待本机图片浏览器超时');
        cdp = await connectCdp(endpoint);
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        const send = (method, params) => cdp.send(method, params, sessionId);
        await send('Page.enable');
        await send('Network.enable');
        await send('Network.setBlockedURLs', { urls: ['*'] });
        await send('Emulation.setDeviceMetricsOverride', { width: scene.width, height: scene.height, deviceScaleFactor: 1, mobile: false });
        const { frameTree } = await send('Page.getFrameTree');
        await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
        const ready = await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))', awaitPromise: true });
        if (ready.exceptionDetails) throw fail('BROWSER_RENDER_FAILED', '网页图片未能完成布局');
        const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false,
            clip: { x: 0, y: 0, width: scene.width, height: scene.height, scale: 1 } });
        const png = Buffer.from(data, 'base64');
        if (png.length > 512 * 1024 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw fail('INVALID_PNG', '网页图片格式异常');
        await cdp.send('Browser.close').catch(() => {});
        await Promise.race([closed, sleep(1500)]);
        return png;
    } finally {
        cdp?.close();
        if (child && !exited) {
            child.kill();
            await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(1500)]);
        }
        // 只删除本次 mkdtemp 的专属配置目录，不触碰用户浏览器历史。
        await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
}
