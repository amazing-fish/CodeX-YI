import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const testsRoot = dirname(fileURLToPath(import.meta.url));
const appRoot = join(testsRoot, '..');
const hexagrams = JSON.parse(readFileSync(join(appRoot, 'data/hexagrams.json'), 'utf8'));
const bagua = JSON.parse(readFileSync(join(appRoot, 'data/bagua.json'), 'utf8'));

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(appRoot, 'data/hexagrams.js'), 'utf8'), sandbox);
assert.deepEqual(structuredClone(sandbox.window.__HEXAGRAM_DATA__), hexagrams,
  'hexagrams.js fallback 必须与 hexagrams.json 完全一致');

const trigramByBinary = new Map(
  Object.entries(bagua).map(([name, value]) => [value.binary, { name, nature: value.nature }])
);

assert.equal(Object.keys(hexagrams).length, 64, '内容契约必须扫描全部 64 卦');

for (const [id, hexagram] of Object.entries(hexagrams)) {
  const upper = trigramByBinary.get(hexagram.binary.slice(0, 3));
  const lower = trigramByBinary.get(hexagram.binary.slice(3));
  assert.ok(upper && lower, `第 ${id} 卦的六爻编码必须可推导上下卦`);

  const overviewComposition = upper.name === lower.name
    ? upper.nature
    : `${upper.nature}${lower.nature}`;
  assert.ok(hexagram.overview.startsWith(`${hexagram.name}为${overviewComposition}，`),
    `第 ${id} 卦 ${hexagram.name} 的 overview 必须与六爻编码推导的 ${upper.name}上${lower.name}下一致`);

  if (upper.name === lower.name) {
    if (!['1', '2'].includes(id)) {
      assert.ok(hexagram.detail.startsWith(
        `${hexagram.name}卦由两个${upper.name}卦(${upper.nature})重叠而成，`
      ), `第 ${id} 卦 ${hexagram.name} 的重卦说明必须与六爻编码一致`);
    }
    continue;
  }

  assert.ok(hexagram.detail.startsWith(
    `${hexagram.name}卦由${upper.name}卦(${upper.nature})上${lower.name}卦(${lower.nature})下组成，`
  ), `第 ${id} 卦 ${hexagram.name} 的 detail 必须与六爻编码推导的上下卦一致`);
}

const byName = Object.fromEntries(Object.values(hexagrams).map(hexagram => [hexagram.name, hexagram]));
assert.match(byName.屯.detail, /云雷交作/, '屯卦意象必须与坎上震下一致');
assert.match(byName.贲.detail, /山下有火/, '贲卦空间叙述必须与艮上离下一致');
assert.match(byName.升.detail, /地中生木/, '升卦空间叙述必须与坤上巽下一致');

console.log('Hexagram content contract passed.');
