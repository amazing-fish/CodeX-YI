import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const testsRoot = dirname(fileURLToPath(import.meta.url));
const appRoot = join(testsRoot, '..');
const coreSource = readFileSync(join(appRoot, 'js/core/yijing-core.js'), 'utf8');
const serviceSource = readFileSync(join(appRoot, 'js/services/hexagram-data-service-module.js'), 'utf8');
const validHexagrams = JSON.parse(readFileSync(join(appRoot, 'data/hexagrams.json'), 'utf8'));
const validBagua = JSON.parse(readFileSync(join(appRoot, 'data/bagua.json'), 'utf8'));
const validZhouyi = JSON.parse(readFileSync(join(appRoot, 'data/zhouyi.json'), 'utf8'));

function clone(value) {
  return structuredClone(value);
}

function createService(hexagrams, bagua, { transportFailure = false, zhouyi = validZhouyi } = {}) {
  const errors = [];
  const events = [];
  const warnings = [];
  const pick = url => (url.includes('bagua') ? bagua : url.includes('zhouyi') ? zhouyi : hexagrams);
  const sandbox = {
    console: { log() {}, warn(message) { warnings.push(message); }, error() {} },
    window: transportFailure ? {
      __HEXAGRAM_DATA__: clone(hexagrams),
      __BAGUA_DATA__: clone(bagua),
      __ZHOUYI_DATA__: clone(zhouyi)
    } : {},
    fetch: async (url) => {
      if (transportFailure) throw new Error('network unavailable');
      return {
        ok: true,
        status: 200,
        async json() {
          return clone(pick(url));
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
  // 数据服务依赖纯函数核心 YiCore（卦画换算、错综互、爻辞拆分）
  vm.runInContext(`${coreSource}
globalThis.YiCore = window.YiCore;`, sandbox, { filename: 'yijing-core.js' });
  vm.runInContext(`${serviceSource}\nglobalThis.__service = HexagramDataService;`, sandbox, {
    filename: 'hexagram-data-service-module.js'
  });
  return { service: sandbox.__service, errors, events, warnings };
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

async function testClassicsAreOptionalButValidated() {
  const { service } = createService(validHexagrams, validBagua);
  await service.init();
  const qian = service.getHexagramById(1);
  assert.equal(qian.judgment, validZhouyi.hexagrams['1'].judgment, '经传有效时卦辞取自原文');
  assert.equal(qian.lines[0].xiang, validZhouyi.hexagrams['1'].lines[0].xiang, '爻应带小象');
  assert.ok(service.getClassics()?.appendix, '应暴露系辞等附录');

  const brokenClassics = clone(validZhouyi);
  brokenClassics.hexagrams['1'].lines = brokenClassics.hexagrams['1'].lines.slice(0, 5);
  const degraded = createService(validHexagrams, validBagua, { zhouyi: brokenClassics });
  await degraded.service.init();
  assert.equal(degraded.service.isInitialized, true, '经传为可选增强，结构损坏时不阻断就绪');
  assert.equal(degraded.errors.length, 0);
  assert.equal(degraded.service.getClassics(), null, '损坏的经传必须整体弃用，不得部分混入');
  assert.equal(degraded.service.getHexagramById(1).judgment, '');
  assert.ok(degraded.warnings.length > 0, '弃用经传应给出警告');

  // 下游直接当作对象 / 数组使用的字段，结构不对同样整体弃用
  const malformed = {
    '缺少附录': (data) => { delete data.appendix; },
    '附录篇目非数组': (data) => { data.appendix.xici_shang = '系辞'; },
    '文言非数组': (data) => { data.hexagrams['1'].wenyan = '元者善之长也'; },
    '校记非数组': (data) => { data.hexagrams['29'].notes = { text: '徽纆' }; },
    '用九结构不合法': (data) => { data.hexagrams['1'].extra = { title: '用九' }; },
    '彖传非字符串': (data) => { data.hexagrams['2'].tuan = ['至哉坤元']; }
  };
  for (const [label, mutate] of Object.entries(malformed)) {
    const payload = clone(validZhouyi);
    mutate(payload);
    const result = createService(validHexagrams, validBagua, { zhouyi: payload });
    await result.service.init();
    assert.equal(result.service.isInitialized, true, `${label}：经传损坏不阻断就绪`);
    assert.equal(result.service.getClassics(), null, `${label}：必须整体弃用经传`);
  }
}

await testValidSnapshot();
await testValidatedFallbackSnapshot();
await testClassicsAreOptionalButValidated();
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

const missingBaguaDisplayField = clone(validBagua);
delete missingBaguaDisplayField.乾.nature;
await assertRejectedSnapshot(validHexagrams, missingBaguaDisplayField, '缺少 nature 展示字段的八卦 payload');

const invalidFallback = createService({}, validBagua, { transportFailure: true });
await invalidFallback.service.init();
assert.equal(invalidFallback.service.isInitialized, false, '非法 fallback 也必须失败关闭');
assert.equal(invalidFallback.events.includes('hexagram-data:ready'), false);

console.log('Data service contract passed.');
