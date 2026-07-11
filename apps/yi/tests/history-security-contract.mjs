import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const testsRoot = dirname(fileURLToPath(import.meta.url));
const appRoot = join(testsRoot, '..');

class MockElement {
  static unsafeHTML = false;

  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.disabled = false;
    this.isConnected = true;
    this.offsetParent = {};
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.style = {};
    this._innerHTML = '';
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name))
    };
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    if (this._innerHTML.includes('xss-payload')) MockElement.unsafeHTML = true;
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

  before() {}

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
    this.attributes.set(name, value);
  }

  focus() {}
}

function createDocument() {
  const elements = new Map();
  const document = {
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
    createDocumentFragment() {
      const fragment = new MockElement();
      fragment.isFragment = true;
      return fragment;
    },
    addEventListener() {}
  };
  document.activeElement = document.getElementById('trigger');
  return document;
}

function evaluate(relativePath, moduleName, sandbox) {
  const source = readFileSync(join(appRoot, relativePath), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(`${source}\nglobalThis.__module = ${moduleName};`, sandbox, { filename: relativePath });
  return sandbox.__module;
}

const canonicalHexagram = {
  id: 1,
  name: '乾',
  binary: '111111',
  unicode: '䷀',
  explanation: '自强不息',
  overview: '乾为天',
  detail: '刚健中正',
  lines: []
};

function createApp(document, initialStorage) {
  let stored = structuredClone(initialStorage);
  const errors = [];
  const savedByModal = [];
  const dataService = {
    isInitialized: true,
    getHexagramById(id) { return Number(id) === 1 ? canonicalHexagram : null; },
    getRelatedHexagrams() { return {}; },
    getBagua() { return null; }
  };
  const historyApi = { addRecord(record) { savedByModal.push(record); } };

  return {
    errors,
    savedByModal,
    getStored() { return structuredClone(stored); },
    app: {
      config: { version: '7.0.0' },
      events: { on() {} },
      errors: { handle(error) { errors.push(error); } },
      confirm: { async show() { return true; } },
      storage: {
        getItem() { return structuredClone(stored); },
        setItem(_key, value) { stored = structuredClone(value); },
        removeItem() { stored = []; }
      },
      utils: {
        debounce(fn) { return fn; },
        formatDate(date) { return date.toISOString(); },
        generateId() { return 'generated-id'; }
      },
      getModule(name) {
        if (name === 'hexagramData') return dataService;
        if (name === 'history') return historyApi;
        return { show() {} };
      }
    }
  };
}

function testHistoryCodecAndRendering() {
  MockElement.unsafeHTML = false;
  const document = createDocument();
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
  const unknownVersion = {
    version: 999,
    id: 'future',
    timestamp: Date.now(),
    hexagramId: 1,
    lines: [],
    notes: ''
  };
  const state = createApp(document, [maliciousLegacyRecord, invalidRecord, unknownVersion]);
  const history = evaluate('js/modules/history-module.js', 'HistoryModule', {
    console,
    document,
    Blob,
    URL,
    Date,
    YizhiApp: state.app
  });

  history.init();
  const records = history.getHistoryRecords();
  assert.equal(records.length, 1, '非法卦象引用必须被拒绝');
  assert.equal(records[0].hexagram.name, '乾', '旧记录必须从 canonical 数据重新水合');
  assert.equal(MockElement.unsafeHTML, false, '持久化字段不得进入 innerHTML');

  const stored = state.getStored();
  assert.equal(stored.length, 1, '读取后应清理非法记录');
  assert.equal(stored[0].version, 1);
  assert.equal(stored[0].hexagramId, 1);
  assert.equal('hexagram' in stored[0], false, '持久化模型不得复制整份卦象内容');
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

function testLegacyReadSurvivesMigrationWriteFailure() {
  const appSource = readFileSync(join(appRoot, 'js/app.js'), 'utf8');
  const start = appSource.indexOf('const StorageManager = {');
  const end = appSource.indexOf('// 性能监控器', start);
  assert.ok(start >= 0 && end > start, '应能定位真实 StorageManager 实现');

  let removeCalls = 0;
  const sandbox = {
    console: { warn() {} },
    APP_CONFIG: { storage: { prefix: 'yizhi_' } },
    localStorage: {
      getItem() { return null; },
      setItem() { throw new Error('QuotaExceededError'); }
    },
    sessionStorage: {
      getItem(key) {
        return key === 'yizhi_divination_history'
          ? JSON.stringify([{ id: 'legacy-record' }])
          : null;
      },
      removeItem() { removeCalls += 1; }
    }
  };
  const storageSource = appSource.slice(start, end);
  vm.createContext(sandbox);
  vm.runInContext(`${storageSource}\nglobalThis.__storage = StorageManager;`, sandbox);

  const value = sandbox.__storage.getItem('divination_history', []);
  assert.equal(JSON.stringify(value), JSON.stringify([{ id: 'legacy-record' }]),
    '迁移写入 localStorage 失败时仍应返回已解析的 legacy 值');
  assert.equal(removeCalls, 0, '迁移写入失败时不得删除 sessionStorage 原值');
}

function testModalPersistenceBoundary() {
  const document = createDocument();
  const state = createApp(document, []);
  const sandbox = {
    console,
    document,
    HTMLElement: MockElement,
    navigator: {},
    window: { location: { href: 'https://example.test/' } },
    setTimeout(callback) { callback(); },
    YizhiApp: state.app
  };
  const modal = evaluate('js/modules/modal-module.js', 'ModalModule', sandbox);
  modal.init();

  modal.show({ name: '帮助', explanation: '仅展示内容', overview: '', detail: '', lines: [] });
  document.getElementById('modalSaveBtn').listeners.get('click')();
  assert.equal(state.savedByModal.length, 0, '帮助等展示内容不得保存为卦象历史');

  modal.show(canonicalHexagram);
  document.getElementById('modalSaveBtn').listeners.get('click')();
  assert.equal(state.savedByModal.length, 1, 'canonical 卦象允许保存');
  assert.equal(state.savedByModal[0].hexagram.id, 1);
}

testHistoryCodecAndRendering();
testModalPersistenceBoundary();
testPersistentStorageConfiguration();
testLegacyReadSurvivesMigrationWriteFailure();
console.log('History security contract passed.');
