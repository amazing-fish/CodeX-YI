import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const testsRoot = dirname(fileURLToPath(import.meta.url));
const appRoot = join(testsRoot, '..');
const coreSource = readFileSync(join(appRoot, 'js/core/yijing-core.js'), 'utf8');

class MockElement {
  static unsafeHTML = false;

  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.disabled = false;
    this.isConnected = true;
    this.open = false;
    this.scrollTop = 0;
    this.showModalCalls = 0;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this._innerHTML = '';
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => (force ?? !classes.has(name)) ? classes.add(name) : classes.delete(name),
      contains: (name) => classes.has(name)
    };
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    if (this._innerHTML.includes('xss-payload')) MockElement.unsafeHTML = true;
    if (this._innerHTML === '') this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  appendChild(child) {
    if (child?.isFragment) this.children.push(...child.children);
    else this.children.push(child);
    return child;
  }

  querySelector() {
    return new MockElement();
  }

  querySelectorAll() {
    return [];
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  showModal() {
    this.open = true;
    this.showModalCalls += 1;
  }

  close() {
    this.open = false;
  }

  focus() {}
}

function createDocument() {
  const elements = new Map();
  return {
    elements,
    body: new MockElement('body'),
    activeElement: null,
    documentElement: new MockElement('html'),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new MockElement(id));
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    createElement() { return new MockElement(); },
    createTextNode(text) { return { textContent: String(text) }; },
    createDocumentFragment() {
      const fragment = new MockElement();
      fragment.isFragment = true;
      return fragment;
    },
    addEventListener() {}
  };
}

function textOf(node) {
  if (!node) return '';
  return `${node.textContent || ''}${(node.children || []).map(textOf).join('')}`;
}

function evaluate(relativePath, moduleName, sandbox) {
  const source = readFileSync(join(appRoot, relativePath), 'utf8');
  sandbox.window = sandbox.window || {};
  vm.createContext(sandbox);
  vm.runInContext(`${coreSource}\nglobalThis.YiCore = window.YiCore;`, sandbox, { filename: 'yijing-core.js' });
  vm.runInContext(`${source}\nglobalThis.__module = ${moduleName};`, sandbox, { filename: relativePath });
  return sandbox.__module;
}

const canonicalHexagram = {
  id: 1,
  name: '乾',
  fullName: '乾为天',
  binary: '111111',
  bits: [1, 1, 1, 1, 1, 1],
  explanation: '自强不息',
  overview: '乾为天',
  detail: '刚健中正',
  upperTrigram: '乾',
  lowerTrigram: '乾',
  lines: []
};

function createApp(initialStorage) {
  let stored = structuredClone(initialStorage);
  const errors = [];
  const dataService = {
    isInitialized: true,
    getHexagramById(id) { return Number(id) === 1 ? canonicalHexagram : null; },
    getHexagramByBinary(binary) { return binary === '111111' ? canonicalHexagram : null; },
    getRelatedHexagrams() { return {}; },
    getBagua() { return null; }
  };
  const day = () => new Date(0);

  return {
    errors,
    getStored() { return structuredClone(stored); },
    app: {
      config: { version: '2.1.0', history: { maxRecords: 200 } },
      events: { on() {} },
      errors: { handle(error) { errors.push(error); } },
      dialogs: {
        async confirm() { return true; },
        open(dialog) { if (!dialog.open) dialog.showModal(); }
      },
      toast() {},
      whenDataReady(callback) { callback(); },
      ui: {
        figure() { return '<span class="figure"></span>'; },
        figureFromBinary() { return '<span class="figure"></span>'; },
        spinner() { return ''; },
        relationChips() { return ''; },
        classicBlock() { return ''; },
        wingsBlock() { return ''; },
        positionSummary() { return ''; },
        lineList() { return ''; }
      },
      storage: {
        getItem() { return structuredClone(stored); },
        setItem(_key, value) { stored = structuredClone(value); },
        removeItem() { stored = []; }
      },
      utils: {
        debounce(fn) { return fn; },
        formatDate(date) { return date.toISOString(); },
        formatRelative() { return '刚刚'; },
        generateId() { return 'generated-id'; },
        escapeHtml(value) { return String(value).replace(/[&<>"']/g, ''); },
        startOfDay: day,
        startOfWeek: day,
        startOfMonth: day,
        async copyText() { return true; }
      },
      getModule(name) {
        if (name === 'hexagramData') return dataService;
        return { show() {}, loadRecord() {} };
      }
    }
  };
}

function loadHistory(initialStorage) {
  MockElement.unsafeHTML = false;
  const document = createDocument();
  const state = createApp(initialStorage);
  const history = evaluate('js/modules/history-module.js', 'HistoryModule', {
    console,
    document,
    Date,
    YizhiApp: state.app
  });
  history.init();
  return { document, state, history };
}

function testHistoryCodecAndRendering() {
  const maliciousLegacyRecord = {
    id: 'legacy-1',
    date: '2026-07-11T00:00:00.000Z',
    hexagram: {
      id: 1,
      name: '<img src=x onerror="xss-payload">',
      explanation: '<svg onload="xss-payload"></svg>',
      unicode: 'xss-payload'
    },
    notes: '<img src=x onerror="xss-payload">',
    lines: [],
    changingLinesCount: 0
  };
  const invalidRecord = { id: 'bad', timestamp: Date.now(), hexagramId: 999, notes: 'xss-payload' };
  const unknownVersion = { version: 999, id: 'future', timestamp: Date.now(), hexagramId: 1, lines: [], notes: '' };
  const brokenLines = { id: 'broken', timestamp: Date.now(), hexagramId: 1, lines: [7, 7, 7] };

  const { document, state, history } = loadHistory([maliciousLegacyRecord, invalidRecord, unknownVersion, brokenLines]);
  const records = history.getHistoryRecords();
  assert.equal(records.length, 1, '非法卦序、未知版本与残缺六爻必须被拒绝');
  assert.equal(records[0].hexagram.name, '乾', '旧记录必须从 canonical 数据重新水合');
  assert.equal(MockElement.unsafeHTML, false, '持久化字段不得进入 innerHTML');

  const list = document.getElementById('historyList');
  assert.equal(list.children.length, 1);
  assert.match(textOf(list.children[0]), /xss-payload/, '备注应作为纯文本原样显示');
  assert.match(textOf(list.children[0]), /乾/, '卦名取 canonical 数据');

  const stored = state.getStored();
  assert.equal(stored.length, 1, '读取后应清理非法记录');
  assert.equal(stored[0].version, 1);
  assert.equal(stored[0].hexagramId, 1);
  assert.equal('hexagram' in stored[0], false, '持久化模型不得复制整份卦象内容');
}

function testAddRecordBoundary() {
  const { state, history } = loadHistory([]);

  const rejected = history.addRecord({ timestamp: Date.now(), hexagramId: 999, lines: [], source: 'modal' });
  assert.equal(rejected, null, '非 canonical 卦序不得保存');
  assert.ok(state.errors.length > 0, '拒绝保存应报告错误');
  assert.equal(state.getStored().length, 0);

  // 六爻是事实来源：伪造的卦序会被六爻推出的本卦覆盖
  const saved = history.addRecord({ timestamp: Date.now(), question: '所问', hexagramId: 999, lines: [7, 7, 7, 7, 7, 9], source: 'cast' });
  assert.equal(saved?.hexagramId, 1);
  const [stored] = state.getStored();
  assert.deepEqual(stored.lines, [7, 7, 7, 7, 7, 9], '六爻只存爻值');
  assert.equal(stored.question, '所问');
  assert.equal('hexagram' in stored, false);
}

function testModalRendersCanonicalOnly() {
  const document = createDocument();
  const state = createApp([]);
  const modal = evaluate('js/modules/modal-module.js', 'ModalModule', {
    console,
    document,
    HTMLElement: MockElement,
    navigator: {},
    YizhiApp: state.app
  });
  modal.init();
  const dialog = document.getElementById('hexagramDialog');

  modal.show({ name: '帮助', explanation: '仅展示内容', overview: '', detail: '', lines: [] });
  assert.equal(dialog.showModalCalls, 0, '非 canonical 内容不得以卦详情打开');

  modal.show({ id: 1, name: '<img src=x onerror="xss-payload">' });
  assert.equal(document.getElementById('hexagramDialogTitle').textContent, '乾',
    '传入对象只取卦序，内容以 canonical 数据为准');
  assert.equal(dialog.showModalCalls, 1);
}

function testPersistentStorageConfiguration() {
  const app = readFileSync(join(appRoot, 'js/app.js'), 'utf8');
  const index = readFileSync(join(appRoot, 'index.html'), 'utf8');
  assert.match(app, /backend: 'localStorage'/);
  assert.match(app, /localStorage\.setItem/);
  assert.match(app, /sessionStorage\.getItem/, '应保留旧 sessionStorage 的迁移读取');
  assert.match(index, /readStorage\(localStorage, THEME_KEY\)/,
    '主题预初始化应优先读取持久化存储');
}

function loadStorageManager(sandbox) {
  const appSource = readFileSync(join(appRoot, 'js/app.js'), 'utf8');
  const start = appSource.indexOf('const StorageManager = {');
  const end = appSource.indexOf('const EventBus = {', start);
  assert.ok(start >= 0 && end > start, '应能定位真实 StorageManager 实现');
  vm.createContext(sandbox);
  vm.runInContext(`${appSource.slice(start, end)}\nglobalThis.__storage = StorageManager;`, sandbox);
  return sandbox.__storage;
}

function testLegacyReadSurvivesMigrationWriteFailure() {
  let removeCalls = 0;
  const storage = loadStorageManager({
    console: { warn() {} },
    APP_CONFIG: { storage: { prefix: 'yizhi_' } },
    localStorage: {
      getItem() { return null; },
      setItem() { throw new Error('QuotaExceededError'); }
    },
    sessionStorage: {
      getItem(key) {
        return key === 'yizhi_divination_history' ? JSON.stringify([{ id: 'legacy-record' }]) : null;
      },
      removeItem() { removeCalls += 1; }
    }
  });

  const value = storage.getItem('divination_history', []);
  assert.equal(JSON.stringify(value), JSON.stringify([{ id: 'legacy-record' }]),
    '迁移写入 localStorage 失败时仍应返回已解析的 legacy 值');
  assert.equal(removeCalls, 0, '迁移写入失败时不得删除 sessionStorage 原值');
}

function testLegacyReadSurvivesLocalReadFailure() {
  let sessionReads = 0;
  const storage = loadStorageManager({
    console: { warn() {} },
    APP_CONFIG: { storage: { prefix: 'yizhi_' } },
    localStorage: {
      getItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('SecurityError'); }
    },
    sessionStorage: {
      getItem(key) {
        sessionReads += 1;
        return key === 'yizhi_divination_history' ? JSON.stringify([{ id: 'legacy-after-read-failure' }]) : null;
      },
      removeItem() { throw new Error('must preserve legacy value'); }
    }
  });

  const value = storage.getItem('divination_history', []);
  assert.equal(JSON.stringify(value), JSON.stringify([{ id: 'legacy-after-read-failure' }]),
    'localStorage 读取失败后仍应尝试并返回可读的 legacy 值');
  assert.equal(sessionReads, 1, 'localStorage 读取失败不得跳过 sessionStorage');
}

testHistoryCodecAndRendering();
testAddRecordBoundary();
testModalRendersCanonicalOnly();
testPersistentStorageConfiguration();
testLegacyReadSurvivesMigrationWriteFailure();
testLegacyReadSurvivesLocalReadFailure();
console.log('History security contract passed.');
