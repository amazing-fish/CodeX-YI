import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const testsRoot = dirname(fileURLToPath(import.meta.url));
const appRoot = join(testsRoot, '..');

function read(relativePath) {
  return readFileSync(join(appRoot, relativePath), 'utf8');
}

const coreSource = read('js/core/yijing-core.js');
const appSource = read('js/app.js');

class MockElement {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.readOnly = false;
    this.open = false;
    this.isConnected = true;
    this.focusCount = 0;
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.style = { setProperty() {} };
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => ((force ?? !classes.has(name)) ? classes.add(name) : classes.delete(name)),
      contains: (name) => classes.has(name)
    };
  }

  addEventListener(type, listener, options = {}) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({ listener, once: options.once === true });
  }

  dispatch(type, event = {}) {
    const entries = this.listeners.get(type) || [];
    this.listeners.set(type, entries.filter(entry => !entry.once));
    return entries.map(entry => entry.listener({ target: this, preventDefault() {}, ...event }));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  querySelector() {
    return new MockElement();
  }

  querySelectorAll() {
    return [];
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
    this.dispatch('close');
  }

  focus() {
    this.focusCount += 1;
  }

  select() {}
}

function createDocument() {
  const elements = new Map();
  return {
    elements,
    body: new MockElement('body'),
    head: new MockElement('head'),
    activeElement: null,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new MockElement(id));
      return elements.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return new MockElement(); },
    addEventListener() {}
  };
}

// 取 app.js 中 Utils … UI 的真实实现（仅对象定义，不执行启动逻辑）
function loadAppHelpers(sandbox) {
  const start = appSource.indexOf('const Utils = {');
  const end = appSource.indexOf('// 基于 hash 的视图路由', start);
  assert.ok(start >= 0 && end > start, '应能定位 app.js 的工具与 UI 实现');
  vm.runInContext(`${appSource.slice(start, end)}\nObject.assign(globalThis, { Utils, Dialogs, UI });`, sandbox);
}

function createSandbox(document, extra = {}) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document,
    HTMLElement: MockElement,
    window: { matchMedia: () => ({ matches: true }), location: { protocol: 'https:' } },
    Math,
    Date,
    Promise,
    setTimeout() { return 0; },
    requestAnimationFrame() { return 0; },
    ...extra
  };
  vm.createContext(sandbox);
  vm.runInContext(`${coreSource}\nglobalThis.YiCore = window.YiCore;`, sandbox, { filename: 'yijing-core.js' });
  return sandbox;
}

function evaluateModule(sandbox, relativePath, moduleName) {
  vm.runInContext(`${read(relativePath)}\nglobalThis.__module = ${moduleName};`, sandbox, { filename: relativePath });
  return sandbox.__module;
}

async function createDataService(sandbox) {
  const datasets = {
    hexagrams: JSON.parse(read('data/hexagrams.json')),
    bagua: JSON.parse(read('data/bagua.json')),
    zhouyi: JSON.parse(read('data/zhouyi.json'))
  };
  sandbox.fetch = async url => ({
    ok: true,
    status: 200,
    async json() {
      return structuredClone(url.includes('bagua') ? datasets.bagua : url.includes('zhouyi') ? datasets.zhouyi : datasets.hexagrams);
    }
  });
  const service = evaluateModule(sandbox, 'js/services/hexagram-data-service-module.js', 'HexagramDataService');
  await service.init();
  assert.equal(service.isInitialized, true);
  return service;
}

function testStaticOwnershipAndStartupContracts() {
  const index = read('index.html');
  const scripts = [...index.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);

  assert.match(index, /rel="icon" href="favicon\.svg"/, '页面应声明本地 favicon');
  assert.doesNotMatch(index, /fonts\.googleapis\.com|fonts\.gstatic\.com/, '启动路径不应依赖远程 Google Fonts');
  assert.equal(new Set(scripts).size, scripts.length, '每个脚本只能引入一次');
  assert.ok(scripts.indexOf('js/core/yijing-core.js') < scripts.indexOf('js/services/hexagram-data-service-module.js'),
    '纯函数核心必须先于数据服务加载');
  assert.equal((appSource.match(/window\.addEventListener\('error'/g) || []).length, 1, '全局 error 监听器只能注册一次');
  assert.equal((appSource.match(/window\.addEventListener\('unhandledrejection'/g) || []).length, 1,
    '全局 unhandledrejection 监听器只能注册一次');

  for (const module of ['library-module.js', 'knowledge-module.js', 'history-module.js']) {
    assert.match(read(`js/modules/${module}`), /whenDataReady|hexagram-data:ready/, `${module} 应等待数据就绪`);
  }
  for (const id of ['hexagramDialog', 'confirmDialog']) {
    assert.match(index, new RegExp(`<dialog[^>]+id="${id}"`), `${id} 应使用原生 <dialog>（焦点圈定与 Esc 由浏览器提供）`);
  }
}

async function testSearchContract() {
  const document = createDocument();
  const errors = [];
  const sandbox = createSandbox(document);
  loadAppHelpers(sandbox);
  sandbox.YizhiApp = {
    utils: { deepClone: value => structuredClone(value), debounce: fn => fn },
    events: { emit() {}, on() {} },
    errors: { handle(error) { errors.push(error); } }
  };
  const service = await createDataService(sandbox);

  assert.equal(service.searchHexagrams('1')[0].hexagram.id, 1, '按卦序 1 搜索应首先返回乾卦');
  assert.equal(service.searchHexagrams('既济')[0].hexagram.id, 63);
  assert.ok(service.searchHexagrams('潜龙').some(result => result.hexagram.id === 1 && result.field === 'line'),
    '应能检索爻辞原文');

  Object.assign(sandbox.YizhiApp, {
    storage: { getItem() { return 'list'; }, setItem() {} },
    whenDataReady(callback) { callback(); },
    getModule(name) { return name === 'hexagramData' ? service : null; },
    ui: sandbox.UI
  });
  const library = evaluateModule(sandbox, 'js/modules/library-module.js', 'LibraryModule');
  library.init();

  const input = document.getElementById('librarySearch');
  const body = document.getElementById('libraryBody');
  const meta = document.getElementById('libraryMeta');
  for (const special of ['[', '(', '*', '\\', '?', '$']) {
    input.value = special;
    assert.doesNotThrow(() => input.dispatch('input'), `搜索“${special}”不应抛出异常`);
  }
  assert.equal(errors.length, 0, '正则特殊字符搜索不应触发异常');

  input.value = '<img src=x onerror=alert(1)>';
  input.dispatch('input');
  assert.doesNotMatch(body.innerHTML, /<img/, '搜索词必须转义后再高亮');

  input.value = '1';
  input.dispatch('input');
  assert.match(meta.textContent, /匹配/);
  assert.match(body.innerHTML, /data-open-hexagram="1"/);
}

function testDialogPreservesOriginalOpener() {
  const document = createDocument();
  const sandbox = createSandbox(document);
  loadAppHelpers(sandbox);
  const dialog = document.getElementById('hexagramDialog');
  const opener = document.getElementById('originalOpener');
  const related = document.getElementById('relatedChip');

  document.activeElement = opener;
  sandbox.Dialogs.open(dialog);
  // 在已打开的详情内点关系卦：同一个 dialog 再次 open，不得覆盖最初的 opener
  document.activeElement = related;
  sandbox.Dialogs.open(dialog);
  dialog.close();

  assert.equal(opener.focusCount, 1, '详情内切换关系卦后，关闭时仍应把焦点还给最初的外部 opener');
  assert.equal(related.focusCount, 0);
}

async function testPendingThrowIsCancelled() {
  const document = createDocument();
  const pending = [];
  const errors = [];
  const sandbox = createSandbox(document);
  sandbox.YizhiApp = {
    config: { name: '易之', version: 'test', motion: { coinFlip: 900, lineSettle: 300 } },
    events: { on() {} },
    errors: { handle(error) { errors.push(error); } },
    dialogs: { async confirm() { return true; } },
    router: { current: 'cast', go() {} },
    toast() {},
    getModule() { return { isInitialized: false }; },
    ui: { taiji: () => '', spinner: () => '', figureFromBinary: () => '', positionTags: () => '' },
    utils: {
      delay() { return new Promise(resolve => pending.push(resolve)); },
      prefersReducedMotion() { return false; },
      formatDate() { return ''; },
      escapeHtml: value => String(value)
    }
  };
  const cast = evaluateModule(sandbox, 'js/modules/divination-module.js', 'DivinationModule');
  cast.init();

  const castBtn = document.getElementById('castBtn');
  const label = document.getElementById('castBtnLabel');
  const flush = async () => {
    while (pending.length) pending.shift()();
    await new Promise(resolve => setImmediate(resolve));
  };

  // 投掷中强制重置：旧投掷落定后不得写入第一爻
  const [throwing] = castBtn.dispatch('click');
  assert.equal(castBtn.disabled, true, '投掷中按钮应禁用');
  await cast.reset();
  await flush();
  await throwing;
  assert.equal(label.textContent, '掷第一爻', '重置后旧投掷不得写入第一爻');

  // 取消后仍可正常起卦
  castBtn.dispatch('click');
  await flush();
  assert.equal(label.textContent, '掷第二爻');

  // 投掷中载入占记：占记的六爻不得被旧投掷追加成第七爻
  await cast.reset();
  castBtn.dispatch('click');
  await cast.loadRecord({ id: 'r1', timestamp: 1, question: '', lines: [7, 8, 7, 8, 7, 8].map(value => ({ value })) });
  await flush();
  assert.equal(label.textContent, '已成卦');
  assert.equal(errors.length, 0, '取消旧投掷不应产生运行时错误');
}

testStaticOwnershipAndStartupContracts();
await testSearchContract();
testDialogPreservesOriginalOpener();
await testPendingThrowIsCancelled();
console.log('Static UI contract passed.');
