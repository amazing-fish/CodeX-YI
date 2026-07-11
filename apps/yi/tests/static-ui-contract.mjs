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

class MockElement {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.className = '';
    this.disabled = false;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.style = { setProperty() {} };
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name)
    };
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  appendChild(child) {
    if (child?.isFragment) this.children.push(...child.children);
    else this.children.push(child);
    return child;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  focus() {}
}

function createDocument() {
  const elements = new Map();
  return {
    elements,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new MockElement(id));
      return elements.get(id);
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return new MockElement();
    },
    createDocumentFragment() {
      const fragment = new MockElement();
      fragment.isFragment = true;
      return fragment;
    }
  };
}

function evaluateModule(relativePath, moduleName, sandbox) {
  const source = readFileSync(join(appRoot, relativePath), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(`${source}\nglobalThis.__module = ${moduleName};`, sandbox, { filename: relativePath });
  return sandbox.__module;
}

function createHexagram(id, name = '乾') {
  return {
    id,
    name,
    unicode: '䷀',
    explanation: '刚健中正',
    overview: '元亨利贞',
    detail: '吉而有利',
    upperTrigram: '乾',
    lowerTrigram: '乾'
  };
}

function testSearchContract() {
  const document = createDocument();
  document.getElementById('resultCount').textContent = '0';
  const errors = [];
  const dataService = {
    isInitialized: true,
    searchHexagrams(query) {
      return query === '[' ? [createHexagram(1)] : [];
    },
    getHexagramById(id) {
      return id === 1 ? createHexagram(1) : null;
    },
    getAllHexagrams() {
      return [createHexagram(1)];
    }
  };
  const sandbox = {
    console,
    document,
    YizhiApp: {
      events: { on() {} },
      errors: { handle(error) { errors.push(error); } },
      getModule(name) { return name === 'hexagramData' ? dataService : null; },
      storage: { getItem() { return []; }, setItem() {} },
      utils: { debounce(fn) { return fn; } }
    }
  };
  const search = evaluateModule('js/modules/search-module.js', 'SearchModule', sandbox);
  search.init();

  const input = document.getElementById('searchInput');
  input.value = '1';
  input.listeners.get('input')({ target: input });
  assert.equal(document.getElementById('resultCount').textContent, 1,
    '按卦序 1 搜索应返回乾卦');

  input.value = '[';
  input.listeners.get('input')({ target: input });
  assert.equal(errors.length, 0, '正则特殊字符搜索不应触发异常');

  input.value = '';
  input.listeners.get('input')({ target: input });
  const category = document.getElementById('categoryFilter');
  category.value = 'fortune';
  category.listeners.get('change')({ target: category });
  assert.equal(document.getElementById('resultCount').textContent, 1,
    '吉凶分类应检索详情字段而非永远返回空结果');
}

function testStaticOwnershipAndStartupContracts() {
  const index = read('index.html');
  const knowledge = read('js/modules/knowledge-module.js');
  const analyzer = read('js/modules/hexagram-analyzer-module.js');
  const modal = read('js/modules/modal-module.js');
  const app = read('js/app.js');

  assert.match(index, /rel="icon" href="favicon\.svg"/, '页面应声明本地 favicon');
  assert.doesNotMatch(index, /fonts\.googleapis\.com|fonts\.gstatic\.com/,
    '启动路径不应依赖远程 Google Fonts');
  assert.equal((index.match(/id="searchFeaturedHexagrams"/g) || []).length, 1,
    '搜索推荐容器必须有唯一专属 id');
  assert.doesNotMatch(knowledge, /featuredHexagrams/,
    'KnowledgeModule 不得写入 SearchModule 的推荐容器');
  assert.match(analyzer, /hexagram-data:ready/, '分析器应监听数据就绪事件');
  assert.match(analyzer, /isInitialized/, '分析器渲染前应检查数据服务状态');
  assert.equal((app.match(/window\.addEventListener\('error'/g) || []).length, 1,
    '全局 error 监听器只能注册一次');
  assert.equal((app.match(/window\.addEventListener\('unhandledrejection'/g) || []).length, 1,
    '全局 unhandledrejection 监听器只能注册一次');
  assert.match(modal, /case 'Tab':/, '模态框应处理 Tab 焦点循环');
  assert.match(modal, /lastFocusedElement\.focus\(\)/, '关闭模态框后应恢复触发元素焦点');
}

async function testResetCancelsPendingThrow() {
  const document = createDocument();
  const timers = [];
  const errors = [];
  const sandbox = {
    console,
    document,
    Math,
    Blob,
    URL,
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
    YizhiApp: {
      events: { on() {} },
      errors: { handle(error) { errors.push(error); } },
      confirm: { async show() { return true; } },
      getModule(name) {
        if (name === 'hexagramData') {
          return { isInitialized: true, getHexagramByBinary() { return null; } };
        }
        return { show() {} };
      },
      utils: {
        deepClone(value) { return structuredClone(value); },
        formatDate() { return ''; },
        generateId() { return 'id'; }
      }
    }
  };
  const divination = evaluateModule('js/modules/divination-module.js', 'DivinationModule', sandbox);
  divination.init();

  const throwPromise = document.getElementById('throwCoinBtn').listeners.get('click')();
  divination.resetDivination();
  while (timers.length) timers.shift()();
  await throwPromise;

  assert.equal(document.getElementById('progressCount').textContent, '0/6',
    '重置后旧投掷不得写入第一爻');
  assert.equal(errors.length, 0, '取消旧投掷不应产生运行时错误');
}

testStaticOwnershipAndStartupContracts();
testSearchContract();
await testResetCancelsPendingThrow();
console.log('Static UI contract passed.');
