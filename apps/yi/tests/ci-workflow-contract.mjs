import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const testsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testsRoot, '..', '..', '..');
const workflow = readFileSync(join(repoRoot, '.github/workflows/pages.yml'), 'utf8');

function jobSection(name, nextName = null) {
  const start = workflow.indexOf(`  ${name}:`);
  assert.ok(start >= 0, `workflow 必须包含 ${name} job`);
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start + 1) : workflow.length;
  return workflow.slice(start, end >= 0 ? end : workflow.length);
}

const pullRequestStart = workflow.indexOf('  pull_request:');
const workflowDispatchStart = workflow.indexOf('  workflow_dispatch:', pullRequestStart);
assert.ok(pullRequestStart >= 0 && workflowDispatchStart > pullRequestStart,
  '所有 PR 都必须触发验证');
assert.doesNotMatch(workflow.slice(pullRequestStart, workflowDispatchStart), /branches:/,
  'pull_request 不得过滤 base 分支，堆叠 PR 也必须验证');
assert.match(workflow, /push:\s*\n\s+branches:\s*\[main\]/,
  'main push 必须触发验证与部署');
assert.match(workflow, /concurrency:[\s\S]*cancel-in-progress:\s*true/,
  'Pages 工作流必须取消同组旧运行');

const jobsIndex = workflow.indexOf('jobs:');
const workflowHeader = workflow.slice(0, jobsIndex);
assert.match(workflowHeader, /permissions:\s*\n\s+contents:\s*read/,
  'workflow 默认权限必须只读');
assert.doesNotMatch(workflowHeader, /pages:\s*write|id-token:\s*write/,
  'workflow 级别不得授予部署写权限');

const validate = jobSection('validate', 'build');
const build = jobSection('build', 'deploy');
const deploy = jobSection('deploy');

assert.match(validate, /node apps\/yi\/tests\/validate-project\.mjs/,
  'validate job 必须执行项目统一校验入口');
assert.match(build, /needs:\s*validate/, 'build 必须依赖 validate');
assert.match(build, /github\.ref == 'refs\/heads\/main'/,
  '只有 main 快照可以构建 Pages artifact');
assert.doesNotMatch(build, /pages:\s*write|id-token:\s*write/,
  'build job 不得获得部署写权限');
assert.match(deploy, /needs:\s*build/, 'deploy 必须依赖通过验证的 build');
assert.match(deploy, /pages:\s*write/, 'deploy 必须拥有 pages 写权限');
assert.match(deploy, /id-token:\s*write/, 'deploy 必须拥有 OIDC token 权限');
assert.doesNotMatch(workflow, /enablement:\s*true/,
  '工作流不得在每次运行时修改 Pages 仓库设置');

const actionRefs = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+).*$/gm)].map(match => match[1]);
assert.ok(actionRefs.length >= 5, 'workflow 应包含检出、Node、Pages 配置、上传和部署 Actions');
for (const actionRef of actionRefs) {
  assert.match(actionRef, /^[^@]+@[0-9a-f]{40}$/,
    `Action 必须固定到 40 位 commit SHA：${actionRef}`);
}

console.log('CI workflow contract passed.');
