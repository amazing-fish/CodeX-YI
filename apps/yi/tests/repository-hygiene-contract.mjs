import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const testsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testsRoot, '..', '..', '..');
const rootEntries = readdirSync(repoRoot);

assert.ok(rootEntries.includes('AGENTS.md'), '根协作文档必须精确命名为 AGENTS.md');
assert.ok(rootEntries.includes('ANCHOR.md'), '根锚点必须精确命名为 ANCHOR.md');
assert.equal(rootEntries.includes('Agents.md'), false, '不得保留大小写漂移的 Agents.md');
assert.equal(rootEntries.includes('anchor.md'), false, '不得保留小写 anchor.md');

assert.ok(existsSync(join(repoRoot, '.gitattributes')), '.gitattributes 必须存在');
const attributes = readFileSync(join(repoRoot, '.gitattributes'), 'utf8');
for (const rule of [
  '* text=auto',
  '*.md text eol=lf',
  '*.html text eol=lf',
  '*.css text eol=lf',
  '*.js text eol=lf',
  '*.mjs text eol=lf',
  '*.json text eol=lf',
  '*.yml text eol=lf',
  '.githooks/* text eol=lf'
]) {
  assert.ok(attributes.includes(rule), `.gitattributes 缺少规则：${rule}`);
}

assert.ok(existsSync(join(repoRoot, '.githooks', 'commit-msg')), '中文 commit-msg hook 必须存在');
assert.ok(existsSync(join(repoRoot, '.gitmessage')), '中文提交模板必须存在');
const hook = readFileSync(join(repoRoot, '.githooks', 'commit-msg'), 'utf8');
const template = readFileSync(join(repoRoot, '.gitmessage'), 'utf8');
assert.match(hook, /提交信息必须包含中文/);
assert.match(template, /类型：简短中文说明/);

let shellExecutable = 'sh';
if (process.platform === 'win32') {
  const gitExecutable = execFileSync('where.exe', ['git'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .find(Boolean);
  shellExecutable = join(dirname(gitExecutable), '..', 'bin', 'sh.exe');
  assert.ok(existsSync(shellExecutable), 'Windows 必须使用 Git 自带的 sh.exe 执行 hook');
}

const hookFixtureDir = mkdtempSync(join(tmpdir(), 'codex-yi-hook-'));
try {
  const chineseMessage = join(hookFixtureDir, 'chinese.txt');
  const englishMessage = join(hookFixtureDir, 'english.txt');
  const templatedEnglishMessage = join(hookFixtureDir, 'templated-english.txt');
  writeFileSync(chineseMessage, '修复：验证中文提交\n', 'utf8');
  writeFileSync(englishMessage, 'fix: english only\n', 'utf8');
  writeFileSync(templatedEnglishMessage, `fix: english only\n\n${template}`, 'utf8');

  let chineseAccepted = true;
  try {
    execFileSync(shellExecutable, [join(repoRoot, '.githooks', 'commit-msg'), chineseMessage], { stdio: 'pipe' });
  } catch {
    chineseAccepted = false;
  }
  assert.equal(chineseAccepted, true, 'commit-msg hook 必须接受 UTF-8 中文提交');

  let englishRejected = false;
  try {
    execFileSync(shellExecutable, [join(repoRoot, '.githooks', 'commit-msg'), englishMessage], { stdio: 'pipe' });
  } catch (error) {
    englishRejected = error.status === 1;
  }
  assert.equal(englishRejected, true, 'commit-msg hook 必须拒绝不含中文的提交');

  let templatedEnglishRejected = false;
  try {
    execFileSync(shellExecutable, [join(repoRoot, '.githooks', 'commit-msg'), templatedEnglishMessage], {
      stdio: 'pipe'
    });
  } catch (error) {
    templatedEnglishRejected = error.status === 1;
  }
  assert.equal(templatedEnglishRejected, true,
    'commit-msg hook 必须忽略模板中文并拒绝纯英文实际内容');
} finally {
  rmSync(hookFixtureDir, { recursive: true, force: true });
}

const untrackedFixtureName = '.repository-hygiene-untracked-fixture.md';
const untrackedFixture = join(repoRoot, untrackedFixtureName);
assert.equal(existsSync(untrackedFixture), false, '回归测试的未跟踪 fixture 不得预先存在');

let files;
try {
  writeFileSync(untrackedFixture, 'anchor.md \t\n', 'utf8');
  files = execFileSync('git', [
    '-c',
    'core.quotePath=false',
    'ls-files',
    '-z',
    '--cached'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  }).split('\0').filter(Boolean);
  assert.equal(files.includes(untrackedFixtureName), false,
    'repository hygiene 不得扫描未跟踪的本地文件');
} finally {
  rmSync(untrackedFixture, { force: true });
}
assert.ok(files.some(file => file.startsWith('.trae/documents/') && file.endsWith('.md')),
  '非 ASCII 路径下的 Markdown 必须以真实未引号化路径进入扫描');

const eolEntries = execFileSync('git', ['ls-files', '--eol', '-z'], {
  cwd: repoRoot,
  encoding: 'utf8'
}).split('\0').filter(Boolean);
for (const entry of eolEntries.filter(item => item.includes('attr/text eol=lf'))) {
  assert.match(entry, /^i\/lf\s/, `LF 策略要求索引内容已归一化：${entry}`);
}

const textFiles = files.filter(file =>
  /\.(md|html|css|js|mjs|json|yml|yaml|svg)$/.test(file) ||
  ['.gitignore', '.gitattributes', '.gitmessage', '.githooks/commit-msg'].includes(file));

for (const file of textFiles) {
  const content = readFileSync(join(repoRoot, file), 'utf8');
  assert.doesNotMatch(content, /[ \t]+(?=\r?$)/m, `${file} 含行尾空白`);
  assert.match(content, /\r?\n$/, `${file} 必须以单个换行结束`);
  assert.doesNotMatch(content, /(?:\r?\n){2}$/, `${file} 末尾不得有额外空行`);
}

const markdownFiles = textFiles.filter(file => file.endsWith('.md'));
for (const file of markdownFiles) {
  const content = readFileSync(join(repoRoot, file), 'utf8');
  assert.equal(content.includes('Agents.md'), false, `${file} 不得引用 Agents.md`);
  assert.equal(content.includes('agents.md'), false, `${file} 不得引用 agents.md`);
  assert.equal(content.includes('anchor.md'), false, `${file} 不得引用 anchor.md`);
}

const agents = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8');
assert.match(agents, /git config core\.hooksPath \.githooks/);
assert.match(agents, /git config commit\.template \.gitmessage/);
assert.match(agents, /node apps\/yi\/tests\/validate-project\.mjs/);

console.log('Repository hygiene contract passed.');
