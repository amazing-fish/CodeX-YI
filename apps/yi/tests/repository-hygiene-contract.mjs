import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: repoRoot,
  encoding: 'utf8'
}).split(/\r?\n/).filter(Boolean);
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
