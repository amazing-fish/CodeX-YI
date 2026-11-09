import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
function run(...args) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: tmpdir(), encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(result.error, undefined);
    return result;
}
function json(...args) {
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
}

test('帮助、版本与 cwd 无关的 JSON 输出', () => {
    assert.match(run('--help').stdout, /初爻→上爻/);
    assert.match(run('help').stdout, /stdio MCP/);
    assert.equal(run('--version').stdout.trim(), '2.2.0');
    assert.equal(json('info').hexagrams, 64);
    assert.equal(json('info', '--json').lineOrder, 'bottom-to-top');
    assert.equal(json('list', '--limit', '2', '--offset', '62').items[1].id, 64);
});

test('四种查询方式与命中搜索', () => {
    for (const args of [['show', '1'], ['show', '乾'], ['show', '111111'], ['show', '--id', '1'], ['show', '--name', '乾为天'], ['show', '--binary', '111111'], ['show', '--upper', '乾', '--lower', '乾']]) {
        assert.equal(json(...args).hexagram.id, 1);
    }
    const search = json('search', '潜龙', '--limit', '1');
    assert.equal(search.items[0].hexagram.id, 1);
    assert.ok(search.items[0].snippet.includes('潜龙'));
    assert.equal(json('trigrams', '--name', '坎').items.坎.binary, '010');
    assert.ok(json('classics', '--section', 'shuogua').appendix.shuogua.length > 0);
});

test('六爻位序、所问、用九与便读输出', () => {
    const result = json('analyze', '9,9,9,9,9,9', '--question', '仅作学习');
    assert.equal(result.question, '仅作学习');
    assert.equal(result.primary.id, 1);
    assert.equal(result.changed.id, 2);
    assert.equal(result.guide.readings[0].title, '用九');
    assert.deepEqual(json('analyze', '--lines', '6, 7, 8, 9, 7, 8').values, [6, 7, 8, 9, 7, 8]);
    assert.match(run('analyze', '9,9,9,9,9,9', '--text').stdout, /用九/);
    assert.match(run('show', '1', '--text').stdout, /初九：潜龙勿用/);
    assert.match(run('list', '--limit', '1', '--text').stdout, /乾为天/);
    assert.match(run('search', '潜龙', '--text').stdout, /潜龙/);
    assert.equal(json('cast').values.length, 6);
});

test('无写入的本机 agent 配置使用绝对 Node 与入口路径', () => {
    const codex = run('agent-config');
    assert.equal(codex.status, 0, codex.stderr);
    assert.match(codex.stdout, /\[mcp_servers\.yi\]/);
    const claude = json('agent-config', '--client', 'claude');
    assert.equal(claude.mcpServers.yi.command, process.execPath);
    assert.ok(claude.mcpServers.yi.args[0].endsWith('mcp.mjs'));
});

test('参数错误均只写 stderr JSON、退出2且不泄漏堆栈', () => {
    const bad = [
        ['unknown'], ['__proto__'], ['constructor'], ['toString'], ['info', '--unknown'], ['info', 'extra'], ['list', '--limit', '1.5'],
        ['list', '--offset', '-1'], ['list', '--limit', '0'], ['list', '--limit', '65'],
        ['list', '--limit', '1', '--limit', '2'], ['show'], ['show', '--id', '0'],
        ['show', '乾', '--id', '1'], ['show', '--id', '1', '--binary', '111111'],
        ['show', '--upper', '乾'], ['show', '--name', '不存在'], ['search'], ['search', ' '],
        ['analyze'], ['analyze', '7,7'], ['analyze', '7,7,7,7,7,10'],
        ['analyze', '7,7,7,7,7,7', '--lines', '7,7,7,7,7,7'],
        ['info', '--text', '--json'], ['cast', '--question', 'x'.repeat(501)],
        ['trigrams', '--name', '__proto__'], ['classics', '--section', 'other'],
        ['agent-config', '--client', 'other'], ['mcp', '--text']
    ];
    for (const args of bad) {
        const result = run(...args);
        assert.equal(result.status, 2, `${args.join(' ')}: ${result.stderr}`);
        assert.equal(result.stdout, '', args.join(' '));
        const error = JSON.parse(result.stderr).error;
        assert.ok(['INVALID_INPUT', 'NOT_FOUND'].includes(error.code));
        assert.equal(Object.hasOwn(error, 'stack'), false);
    }
});


test('npm link / 目录联接入口仍真正执行 CLI', () => {
    const directory = mkdtempSync(join(tmpdir(), 'yi-cli-linked-'));
    try {
        const link = join(directory, 'linked-tools');
        symlinkSync(dirname(cli), link, 'junction');
        const result = spawnSync(process.execPath, [join(link, 'cli.mjs'), 'info'], { cwd: tmpdir(), encoding: 'utf8', timeout: 10000, windowsHide: true });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stderr, '');
        assert.equal(JSON.parse(result.stdout).hexagrams, 64);
    } finally {
        // 只清理本测试创建的临时目录；rm 不遍历目录联接的目标。
        rmSync(directory, { recursive: true, force: true });
    }
});
