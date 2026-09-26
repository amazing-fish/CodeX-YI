import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');
const appRoot = join(repoRoot, 'apps', 'yi');

const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function loadFallbackGlobal(relativePath, globalName) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read(relativePath), sandbox, { filename: relativePath });
  return sandbox.window[globalName];
}

function validateLicense() {
  assert(existsSync(join(repoRoot, 'LICENSE')), 'LICENSE must exist.');
  const license = read('LICENSE');
  assert(license.startsWith('MIT License'), 'LICENSE must use the MIT license text.');
  assert(license.includes('jiao-ling and contributors'), 'LICENSE must identify the copyright holders.');
}

function validateDocs() {
  assert(existsSync(join(repoRoot, 'AGENTS.md')), 'AGENTS.md must exist at repo root.');
  assert(existsSync(join(repoRoot, 'ANCHOR.md')), 'ANCHOR.md must exist at repo root.');

  const agentsPath = existsSync(join(repoRoot, 'AGENTS.md')) ? 'AGENTS.md' : 'Agents.md';
  const anchorPath = existsSync(join(repoRoot, 'ANCHOR.md')) ? 'ANCHOR.md' : 'anchor.md';
  const agents = read(agentsPath);
  const anchor = read(anchorPath);

  assert(!agents.includes('Agents.md'), 'Docs should reference AGENTS.md consistently.');
  assert(!agents.includes('anchor.md'), 'Docs should reference ANCHOR.md consistently.');
  assert(!anchor.includes('Agents.md'), 'ANCHOR.md should reference AGENTS.md consistently.');
  assert(!anchor.includes('agents.md'), 'ANCHOR.md should reference AGENTS.md consistently.');
  assert(!anchor.includes('anchor.md'), 'ANCHOR.md should reference ANCHOR.md consistently.');
  assert(anchor.includes('最近14个版本变更日志'), 'ANCHOR.md should keep the 14-version changelog policy.');
  assert(!anchor.includes('最近5个版本'), 'ANCHOR.md should not mention the old 5-version policy.');
  assert(existsSync(join(repoRoot, '.githooks', 'commit-msg')), '.githooks/commit-msg must exist.');
  assert(existsSync(join(repoRoot, '.gitmessage')), '.gitmessage must exist.');
}

function validateHtmlContracts() {
  const index = read('apps/yi/index.html');

  assert(/<link[^>]+rel=["']icon["'][^>]+href=["']favicon\.svg["']/i.test(index),
    'index.html must declare favicon.svg.');
  assert(existsSync(join(appRoot, 'favicon.svg')), 'apps/yi/favicon.svg must exist.');

  // 页面中的 id 必须唯一
  const ids = [...index.matchAll(/\sid=["']([^"']+)["']/g)].map(match => match[1]);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert(duplicates.length === 0, `index.html has duplicate ids: ${[...new Set(duplicates)].join(', ')}`);

  // 引用的脚本与样式必须存在
  const assets = [
    ...[...index.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(match => match[1]),
    ...[...index.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g)].map(match => match[1])
  ];
  for (const asset of assets) {
    assert(existsSync(join(appRoot, asset)), `index.html references missing asset: ${asset}`);
  }

  // 脚本中通过 getElementById 获取的静态节点必须在页面中存在（动态生成的节点列入白名单）
  const dynamicIds = new Set(['readingTitle', 'readingFooter', 'tab-primary', 'tab-changed', 'studyPanel', 'introTitle', 'guideTitle']);
  const scripts = assets.filter(asset => asset.endsWith('.js'));
  for (const script of scripts) {
    const source = read(join('apps/yi', script));
    for (const match of source.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
      const id = match[1];
      assert(ids.includes(id) || dynamicIds.has(id), `${script} looks up #${id}, which is not in index.html.`);
    }
  }

  // 每个视图都有导航入口，并在 app.js 中注册同名模块
  const app = read('apps/yi/js/app.js');
  const views = [...index.matchAll(/data-view=["']([^"']+)["']/g)].map(match => match[1]);
  assert(views.join(',') === 'cast,library,trigrams,history', `Unexpected views: ${views.join(',')}`);
  for (const view of views) {
    assert(index.includes(`data-nav="${view}"`), `View ${view} has no navigation link.`);
    assert(app.includes(`['${view}',`), `View ${view} has no module registered in app.js.`);
  }

  // 旧版遗留入口已移除
  assert(!existsSync(join(appRoot, 'js', 'modules', 'search-module.js')), 'search-module.js should be merged into library-module.js.');
  assert(!existsSync(join(appRoot, 'js', 'modules', 'hexagram-analyzer-module.js')), 'hexagram-analyzer-module.js should be merged into library-module.js.');
  assert(!/onclick=["'](?!location\.reload)/.test(index), 'index.html should not use inline onclick handlers.');
}

function validateStorageContract() {
  const index = read('apps/yi/index.html');
  const app = read('apps/yi/js/app.js');

  assert(app.includes("backend: 'localStorage'"), 'APP_CONFIG.storage.backend must document localStorage.');
  assert(app.includes('localStorage.setItem'), 'StorageManager must persist through localStorage.');
  assert(app.includes('sessionStorage.getItem'), 'StorageManager must keep sessionStorage legacy fallback.');
  assert(index.includes('readStorage(localStorage, THEME_KEY)'), 'Theme pre-init must read localStorage first.');
}

function validateDataFallbacks() {
  const hexagramJson = JSON.parse(read('apps/yi/data/hexagrams.json'));
  const baguaJson = JSON.parse(read('apps/yi/data/bagua.json'));
  const hexagramFallback = loadFallbackGlobal('apps/yi/data/hexagrams.js', '__HEXAGRAM_DATA__');
  const baguaFallback = loadFallbackGlobal('apps/yi/data/bagua.js', '__BAGUA_DATA__');

  assert(Object.keys(hexagramJson).length === 64, 'hexagrams.json must contain 64 entries.');
  assert(Object.keys(baguaJson).length === 8, 'bagua.json must contain 8 entries.');
  assert(JSON.stringify(hexagramJson) === JSON.stringify(hexagramFallback),
    'hexagrams.js fallback must match hexagrams.json.');
  assert(JSON.stringify(baguaJson) === JSON.stringify(baguaFallback),
    'bagua.js fallback must match bagua.json.');

  const zhouyiJson = JSON.parse(read('apps/yi/data/zhouyi.json'));
  const zhouyiFallback = loadFallbackGlobal('apps/yi/data/zhouyi.js', '__ZHOUYI_DATA__');
  assert(Object.keys(zhouyiJson.hexagrams || {}).length === 64, 'zhouyi.json must contain 64 hexagrams.');
  assert(typeof zhouyiJson.source === 'string' && zhouyiJson.source.length > 0, 'zhouyi.json must credit its source.');
  assert(JSON.stringify(zhouyiJson) === JSON.stringify(zhouyiFallback),
    'zhouyi.js fallback must match zhouyi.json.');
}

function validateJavaScriptSyntax() {
  const files = execFileSync('git', ['ls-files', 'apps/yi/*.js', 'apps/yi/js/*.js', 'apps/yi/js/**/*.js'], {
    cwd: repoRoot,
    encoding: 'utf8'
  }).split(/\r?\n/).filter(Boolean).filter(file => existsSync(join(repoRoot, file)));

  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { cwd: repoRoot, stdio: 'pipe' });
    } catch (error) {
      fail(`${file} has invalid JavaScript syntax: ${error.stderr?.toString().trim() || error.message}`);
    }
  }
}

// 纯函数单测 + 各项契约测试（数据失败关闭、占记编解码与安全渲染、界面契约、CI 与仓库卫生）
function validateTestSuites() {
  const suites = [
    'apps/yi/tests/yijing-core.test.mjs',
    'apps/yi/tests/static-ui-contract.mjs',
    'apps/yi/tests/data-service-contract.mjs',
    'apps/yi/tests/hexagram-content-contract.mjs',
    'apps/yi/tests/history-security-contract.mjs',
    'apps/yi/tests/ci-workflow-contract.mjs',
    'apps/yi/tests/repository-hygiene-contract.mjs'
  ];

  for (const suite of suites) {
    try {
      execFileSync(process.execPath, [suite], { cwd: repoRoot, stdio: 'inherit' });
    } catch (error) {
      fail(`${suite} failed with exit code ${error.status ?? 'unknown'}.`);
    }
  }
}

function validateWhitespace() {
  // 包含未跟踪的新文件，并跳过已在工作区删除的文件
  const trackedFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: repoRoot, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(file => existsSync(join(repoRoot, file)))
    .filter((file) => /\.(md|html|css|js|json|yml|mjs)$|^\.gitignore$/.test(file));

  for (const file of trackedFiles) {
    const content = read(file);
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/[ \t]+$/.test(line)) {
        fail(`${file}:${index + 1} has trailing whitespace.`);
      }
    });
    if (/\n\s*\n$/.test(content)) {
      fail(`${file} has extra blank lines at EOF.`);
    }
  }
}

validateLicense();
validateDocs();
validateHtmlContracts();
validateStorageContract();
validateDataFallbacks();
validateJavaScriptSyntax();
validateWhitespace();
validateTestSuites();

if (failures.length > 0) {
  console.error('Project validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Project validation passed: MIT license, docs, HTML contracts, 64/8/64 data snapshots with fallback parity, JavaScript syntax, core tests and contracts.');
