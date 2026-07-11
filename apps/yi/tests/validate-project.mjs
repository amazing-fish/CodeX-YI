import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const testsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testsRoot, '..', '..', '..');
const failures = [];

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function loadFallback(relativePath, globalName) {
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

function validateDataFallbacks() {
  const hexagrams = JSON.parse(read('apps/yi/data/hexagrams.json'));
  const bagua = JSON.parse(read('apps/yi/data/bagua.json'));
  const hexagramFallback = loadFallback('apps/yi/data/hexagrams.js', '__HEXAGRAM_DATA__');
  const baguaFallback = loadFallback('apps/yi/data/bagua.js', '__BAGUA_DATA__');

  assert(Object.keys(hexagrams).length === 64, 'hexagrams.json must contain 64 entries.');
  assert(Object.keys(bagua).length === 8, 'bagua.json must contain 8 entries.');
  assert(JSON.stringify(hexagrams) === JSON.stringify(hexagramFallback),
    'hexagrams.js fallback must match hexagrams.json.');
  assert(JSON.stringify(bagua) === JSON.stringify(baguaFallback),
    'bagua.js fallback must match bagua.json.');
}

function validateJavaScriptSyntax() {
  const files = execFileSync('git', ['ls-files', 'apps/yi/*.js', 'apps/yi/js/*.js', 'apps/yi/js/**/*.js'], {
    cwd: repoRoot,
    encoding: 'utf8'
  }).split(/\r?\n/).filter(Boolean);

  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { cwd: repoRoot, stdio: 'pipe' });
    } catch (error) {
      failures.push(`${file} has invalid JavaScript syntax: ${error.stderr?.toString().trim() || error.message}`);
    }
  }
}

function validateContractTests() {
  const contracts = [
    'apps/yi/tests/static-ui-contract.mjs',
    'apps/yi/tests/data-service-contract.mjs',
    'apps/yi/tests/hexagram-content-contract.mjs',
    'apps/yi/tests/history-security-contract.mjs'
  ];

  for (const contract of contracts) {
    try {
      execFileSync(process.execPath, [contract], {
        cwd: repoRoot,
        stdio: 'inherit'
      });
    } catch (error) {
      failures.push(`${contract} failed with exit code ${error.status ?? 'unknown'}.`);
    }
  }
}

validateLicense();
validateDataFallbacks();
validateJavaScriptSyntax();
validateContractTests();

if (failures.length > 0) {
  console.error('Project validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Project validation passed: MIT license, 64/8 data snapshots, fallback parity, JavaScript syntax.');
