import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const testsRoot = dirname(fileURLToPath(import.meta.url));
const appRoot = join(testsRoot, '..');
const serviceSource = readFileSync(join(appRoot, 'js/services/hexagram-data-service-module.js'), 'utf8');
const validHexagrams = JSON.parse(readFileSync(join(appRoot, 'data/hexagrams.json'), 'utf8'));
const validBagua = JSON.parse(readFileSync(join(appRoot, 'data/bagua.json'), 'utf8'));

function clone(value) {
  return structuredClone(value);
}

function createService(hexagrams, bagua, { transportFailure = false } = {}) {
  const errors = [];
  const events = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    window: transportFailure ? {
      __HEXAGRAM_DATA__: clone(hexagrams),
      __BAGUA_DATA__: clone(bagua)
    } : {},
    fetch: async (url) => {
      if (transportFailure) throw new Error('network unavailable');
      return {
        ok: true,
        status: 200,
        async json() {
          return clone(url.includes('bagua') ? bagua : hexagrams);
        }
      };
    },
    YizhiApp: {
      utils: { deepClone: clone },
      performance: { start() {}, end() {} },
      events: { emit(event) { events.push(event); } },
      errors: { handle(error) { errors.push(error); } }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(`${serviceSource}\nglobalThis.__service = HexagramDataService;`, sandbox, {
    filename: 'hexagram-data-service-module.js'
  });
  return { service: sandbox.__service, errors, events };
}

async function assertRejectedSnapshot(hexagrams, bagua, label) {
  const { service, errors, events } = createService(hexagrams, bagua);
  await service.init();
  assert.equal(service.isInitialized, false, `${label} 不得进入 ready 状态`);
  assert.equal(events.includes('hexagram-data:ready'), false, `${label} 不得发出 ready 事件`);
  assert.ok(errors.length > 0, `${label} 应报告明确错误`);
  assert.equal(service.getAllHexagrams().length, 0, `${label} 不得暴露部分快照`);
}

async function testValidSnapshot() {
  const { service, errors, events } = createService(validHexagrams, validBagua);
  await service.init();

  assert.equal(service.isInitialized, true);
  assert.deepEqual(events, ['hexagram-data:ready']);
  assert.equal(errors.length, 0);
  assert.equal(service.getAllHexagrams().length, 64);
  assert.equal(Object.keys(service.getBaguaData()).length, 8);

  for (const hexagram of service.getAllHexagrams()) {
    assert.match(hexagram.binary, /^[01]{6}$/);
    assert.ok(hexagram.upperTrigram);
    assert.ok(hexagram.lowerTrigram);
    assert.deepEqual(Object.keys(hexagram.relations).sort(), ['inverse', 'mutual', 'opposite']);
    for (const relatedId of Object.values(hexagram.relations)) {
      assert.ok(service.getHexagramById(relatedId),
        `第 ${hexagram.id} 卦的关系必须指向有效卦象`);
    }
  }
}

async function testValidatedFallbackSnapshot() {
  const { service, errors } = createService(validHexagrams, validBagua, { transportFailure: true });
  await service.init();
  assert.equal(service.isInitialized, true, '网络失败时允许使用通过同一校验的预加载快照');
  assert.equal(service.getAllHexagrams().length, 64);
  assert.equal(errors.length, 0);
}

await testValidSnapshot();
await testValidatedFallbackSnapshot();
await assertRejectedSnapshot({}, validBagua, '空六十四卦 payload');

const missingHexagram = clone(validHexagrams);
delete missingHexagram['64'];
await assertRejectedSnapshot(missingHexagram, validBagua, '缺少卦象的 payload');

const invalidBinary = clone(validHexagrams);
invalidBinary['1'].binary = '11111x';
await assertRejectedSnapshot(invalidBinary, validBagua, '非法六位二进制');

const invalidLines = clone(validHexagrams);
invalidLines['1'].lines = invalidLines['1'].lines.slice(0, 5);
await assertRejectedSnapshot(invalidLines, validBagua, '非六爻结构');

await assertRejectedSnapshot(validHexagrams, {}, '空八卦 payload');

const renamedBaguaKey = clone(validBagua);
renamedBaguaKey.天 = renamedBaguaKey.乾;
delete renamedBaguaKey.乾;
await assertRejectedSnapshot(validHexagrams, renamedBaguaKey, '缺少固定乾键的八卦 payload');

const swappedBaguaBinaries = clone(validBagua);
[swappedBaguaBinaries.乾.binary, swappedBaguaBinaries.坤.binary] =
  [swappedBaguaBinaries.坤.binary, swappedBaguaBinaries.乾.binary];
await assertRejectedSnapshot(validHexagrams, swappedBaguaBinaries, '交换乾坤编码的八卦 payload');

const invalidFallback = createService({}, validBagua, { transportFailure: true });
await invalidFallback.service.init();
assert.equal(invalidFallback.service.isInitialized, false, '非法 fallback 也必须失败关闭');
assert.equal(invalidFallback.events.includes('hexagram-data:ready'), false);

console.log('Data service contract passed.');
