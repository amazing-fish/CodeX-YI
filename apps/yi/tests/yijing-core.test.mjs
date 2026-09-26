import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, '..');

function loadCore() {
  const sandbox = { window: {}, crypto: globalThis.crypto, Math };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(appRoot, 'js', 'core', 'yijing-core.js'), 'utf8'), sandbox);
  return sandbox.window.YiCore;
}

const YiCore = loadCore();
const hexagrams = JSON.parse(readFileSync(join(appRoot, 'data', 'hexagrams.json'), 'utf8'));
const bagua = JSON.parse(readFileSync(join(appRoot, 'data', 'bagua.json'), 'utf8'));

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error });
  }
}

// vm 沙箱对象的原型与主上下文不同，比较前统一转为普通对象
const plain = value => JSON.parse(JSON.stringify(value));
const eq = (actual, expected, message) => assert.deepEqual(plain(actual), expected, message);
const L = value => YiCore.lineFromValue(value);
const linesOf = (...values) => values.map(L);

test('三钱之和映射四象', () => {
  assert.equal(YiCore.lineFromCoins([true, true, true]).name, '老阳');
  assert.equal(YiCore.lineFromCoins([false, false, false]).name, '老阴');
  assert.equal(YiCore.lineFromCoins([true, false, false]).name, '少阳');
  assert.equal(YiCore.lineFromCoins([true, true, false]).name, '少阴');
  assert.throws(() => YiCore.lineFromValue(5), /无效的爻值/);
});

test('tossCoins 返回三枚布尔值', () => {
  for (let i = 0; i < 50; i += 1) {
    const coins = YiCore.tossCoins();
    assert.equal(coins.length, 3);
    coins.forEach(coin => assert.equal(typeof coin, 'boolean'));
  }
});

test('toBinary 以上爻在前，与数据一致', () => {
  // 贲：离下艮上 → 初九 六二 九三 六四 六五 上九
  assert.equal(YiCore.toBinary(linesOf(7, 8, 7, 8, 8, 7)), '100101');
  assert.equal(hexagrams['22'].binary, '100101');
  eq(YiCore.binaryToBits('100101'), [1, 0, 1, 0, 0, 1]);
});

test('之卦只翻转变爻', () => {
  const changed = YiCore.transformLines(linesOf(9, 8, 6, 7, 7, 7));
  assert.equal(YiCore.toBinary(changed), '111100');
  assert.ok(changed.every(line => !line.changing));
});

test('爻题命名', () => {
  assert.equal(YiCore.lineTitle(1, true), '初九');
  assert.equal(YiCore.lineTitle(2, false), '六二');
  assert.equal(YiCore.lineTitle(6, false), '上六');
});

test('卦全名', () => {
  const name = id => {
    const hexagram = hexagrams[id];
    const upper = Object.values(bagua).find(item => item.binary === hexagram.binary.slice(0, 3));
    const lower = Object.values(bagua).find(item => item.binary === hexagram.binary.slice(3));
    return YiCore.fullName(hexagram, upper, lower);
  };
  assert.equal(name('1'), '乾为天');
  assert.equal(name('11'), '地天泰');
  assert.equal(name('22'), '山火贲');
  assert.equal(name('64'), '火水未济');
});

test('错、综、互', () => {
  assert.equal(YiCore.oppositeBinary('100101'), '011010');
  assert.equal(YiCore.inverseBinary('100101'), '101001');
  // 贲之互卦为解（雷水解 001010）
  assert.equal(YiCore.mutualBinary('100101'), '001010');
  assert.equal(hexagrams['40'].binary, '001010');
});

test('断卦规则：变爻数量 0~6', () => {
  const zero = YiCore.readingGuide(linesOf(7, 8, 7, 8, 7, 8));
  assert.equal(zero.count, 0);
  eq(zero.focus, [{ target: 'primary', kind: 'overview' }]);

  const one = YiCore.readingGuide(linesOf(7, 8, 9, 8, 7, 8));
  eq(one.focus.map(f => [f.target, f.position]), [['primary', 3]]);

  const two = YiCore.readingGuide(linesOf(9, 8, 7, 6, 7, 8));
  eq(two.focus.map(f => [f.position, f.main]), [[4, true], [1, false]]);

  const three = YiCore.readingGuide(linesOf(9, 6, 9, 8, 7, 8));
  eq(three.focus.map(f => [f.target, f.role]), [['primary', '贞'], ['changed', '悔']]);

  const four = YiCore.readingGuide(linesOf(9, 6, 7, 9, 8, 6));
  eq(four.focus.map(f => [f.target, f.position, f.main]), [['changed', 3, true], ['changed', 5, false]]);

  const five = YiCore.readingGuide(linesOf(9, 6, 9, 6, 8, 6));
  eq(five.focus.map(f => [f.target, f.position]), [['changed', 5]]);

  const qian = YiCore.readingGuide(linesOf(9, 9, 9, 9, 9, 9));
  assert.equal(qian.focus[0].label, '用九');
  const kun = YiCore.readingGuide(linesOf(6, 6, 6, 6, 6, 6));
  assert.equal(kun.focus[0].label, '用六');
  const other = YiCore.readingGuide(linesOf(9, 6, 9, 6, 9, 6));
  eq(other.focus, [{ target: 'changed', kind: 'overview' }]);
});

test('爻辞拆分覆盖全部 384 爻，且爻题与阴阳一致', () => {
  for (const hexagram of Object.values(hexagrams)) {
    const bits = YiCore.binaryToBits(hexagram.binary);
    hexagram.lines.forEach((line, index) => {
      const parts = YiCore.splitLineText(line.content);
      assert.equal(parts.title, YiCore.lineTitle(index + 1, bits[index] === 1), `${hexagram.name} 第${index + 1}爻`);
      assert.ok(parts.classic.endsWith('。'), `${hexagram.name} 第${index + 1}爻原文`);
      assert.ok(parts.gloss.length > 0, `${hexagram.name} 第${index + 1}爻白话`);
    });
  }
});

test('爻位：当位、居中、相应', () => {
  // 既济 水火（010101）：六爻皆当位、三组皆应
  const jiji = YiCore.positionSummary(YiCore.binaryToBits(hexagrams['63'].binary));
  assert.equal(jiji.proper, 6);
  assert.equal(jiji.pairs, 3);
  assert.equal(jiji.note, '六爻皆当位，三组皆应');

  const weiji = YiCore.positionSummary(YiCore.binaryToBits(hexagrams['64'].binary));
  assert.equal(weiji.proper, 0);
  assert.equal(weiji.note, '六爻皆失位，三组皆应');

  // 乾：阳居初三五当位，二四上失位；六爻同性，上下无应
  const qian = YiCore.linePositions(YiCore.binaryToBits('111111'));
  eq(qian.map(p => p.proper), [true, false, true, false, true, false]);
  eq(qian.map(p => p.central), [false, true, false, false, true, false]);
  assert.ok(qian.every(p => !p.corresponds));
  eq(qian.map(p => p.partner), [4, 5, 6, 1, 2, 3]);
  assert.equal(YiCore.positionSummary(YiCore.binaryToBits('111111')).note, '上下无应');

  // 贲 初九 六二 九三 六四 六五 上九：初四应、二五不应、三上不应
  const bi = YiCore.linePositions(YiCore.binaryToBits('100101'));
  eq(bi.map(p => p.proper), [true, true, true, true, false, false]);
  eq(bi.map(p => p.corresponds), [true, false, false, true, false, false]);
  assert.throws(() => YiCore.linePositions([1, 0]), /完整的六爻/);
});

test('白话剥离：忽略标点比对经文，比对不上时退回按句号切分', () => {
  const guai = '九三，壮于頄，有凶。君子夬夬，独行遇雨，若濡有愠，无咎。颧骨变得强壮，有凶险。';
  assert.equal(YiCore.glossAfterClassic(guai, '壮于頄，有凶。君子夬夬，独行，遇雨若濡。有愠无咎。'), '颧骨变得强壮，有凶险。');
  // 旧数据只存到第一个句号：经文比对不完，退回旧切分
  assert.equal(YiCore.glossAfterClassic('初九，潜龙勿用。潜伏修身。', '潜龙勿用。'), '潜伏修身。');
  assert.equal(YiCore.glossAfterClassic('九二，包荒。包容荒秽。', '包荒，用冯河，不遐遗，朋亡，得尚于中行。'), '包容荒秽。');
  assert.equal(YiCore.glossAfterClassic('初九，潜龙勿用。潜伏修身。', ''), '潜伏修身。');
});

const zhouyi = JSON.parse(readFileSync(join(appRoot, 'data', 'zhouyi.json'), 'utf8'));

test('经传原文：六十四卦齐备，爻题与卦画一致', () => {
  const ids = Object.keys(zhouyi.hexagrams);
  assert.equal(ids.length, 64);
  for (const id of ids) {
    const classic = zhouyi.hexagrams[id];
    const hexagram = hexagrams[id];
    const bits = YiCore.binaryToBits(hexagram.binary);
    // 经文用“遯”、坎卦辞作“习坎”
    const name = { 遁: '遯', 坎: '习坎' }[hexagram.name] || hexagram.name;
    assert.ok(classic.judgment.startsWith(name), `${hexagram.name} 卦辞以卦名起首`);
    assert.ok(classic.tuan && classic.daxiang, `${hexagram.name} 彖、大象`);
    assert.equal(classic.lines.length, 6, `${hexagram.name} 六爻`);
    classic.lines.forEach((line, index) => {
      assert.equal(line.title, YiCore.lineTitle(index + 1, bits[index] === 1), `${hexagram.name} 第${index + 1}爻爻题`);
      assert.ok(line.text && line.xiang, `${hexagram.name} ${line.title} 爻辞与小象`);
    });
    assert.ok(classic.zagua, `${hexagram.name} 杂卦`);
  }
  eq(zhouyi.hexagrams['1'].extra.title, '用九');
  eq(zhouyi.hexagrams['2'].extra.title, '用六');
  assert.ok(zhouyi.hexagrams['1'].wenyan.length > 0 && zhouyi.hexagrams['2'].wenyan.length > 0);
  // 序卦自屯起，乾坤不另立句
  assert.equal(Object.values(zhouyi.hexagrams).filter(item => item.xugua).length, 62);
  for (const key of ['xici_shang', 'xici_xia', 'shuogua', 'xugua', 'zagua']) {
    assert.ok(zhouyi.appendix[key].length > 0, key);
  }
});

test('经传原文：内置用九用六与原文一致，白话剥离后均有剩余', () => {
  const special = YiCore.readingGuide(linesOf(9, 9, 9, 9, 9, 9)).focus[0];
  assert.equal(special.text, zhouyi.hexagrams['1'].extra.text);
  assert.equal(YiCore.readingGuide(linesOf(6, 6, 6, 6, 6, 6)).focus[0].text, zhouyi.hexagrams['2'].extra.text);
  for (const [id, hexagram] of Object.entries(hexagrams)) {
    hexagram.lines.forEach((line, index) => {
      const gloss = YiCore.glossAfterClassic(line.content, zhouyi.hexagrams[id].lines[index].text);
      assert.ok(gloss.length > 0, `${hexagram.name} 第${index + 1}爻白话`);
    });
  }
});

const failed = results.filter(result => !result.ok);
for (const result of results) {
  console.log(`${result.ok ? '✓' : '✗'} ${result.name}`);
  if (!result.ok) {
    console.log(`  ${result.error.message}`);
  }
}

if (failed.length > 0) {
  console.error(`${failed.length} / ${results.length} 项失败`);
  process.exit(1);
}

console.log(`全部 ${results.length} 项通过`);
