/**
 * 卦象数据服务 - 加载、索引与查询六十四卦、八卦与经传原文
 *
 * 三份数据同一套加载策略：http(s) 下 fetch JSON，失败或 file:// 下回退到同名 .js 预加载脚本。
 * - hexagrams：卦名、卦画与白话释义（必需）
 * - bagua：八卦属性（必需）
 * - zhouyi：经传原文——卦辞、爻辞、彖、象、文言、序卦、杂卦及系辞、说卦（可选；缺失时退回白话数据中的爻辞）
 */
const HexagramDataService = (function() {

    const DATASETS = Object.freeze({
        hexagrams: { url: 'data/hexagrams.json', preload: 'data/hexagrams.js', global: '__HEXAGRAM_DATA__', label: '卦象' },
        bagua: { url: 'data/bagua.json', preload: 'data/bagua.js', global: '__BAGUA_DATA__', label: '八卦' },
        zhouyi: { url: 'data/zhouyi.json', preload: 'data/zhouyi.js', global: '__ZHOUYI_DATA__', label: '经传' }
    });

    const cache = {};
    const preloadPromises = {};

    let hexagramMap = {};
    let baguaData = null;
    let classics = null;
    let hexagramIdByBinary = null;
    let baguaNameByBinary = null;
    let hexagramByTrigramKey = null;
    let isInitialized = false;

    async function init() {
        try {
            if (isInitialized) return;

            await processHexagramData();
            isInitialized = true;
            YizhiApp.events.emit('hexagram-data:ready');
        } catch (error) {
            YizhiApp.events.emit('hexagram-data:error', { error });
            YizhiApp.errors.handle(error, '加载卦象数据', '卦象数据加载失败，请检查网络后刷新页面。');
        }
    }

    function isLocalFileProtocol() {
        return typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
    }

    function getPreloaded(key) {
        const global = DATASETS[key].global;
        return typeof window !== 'undefined' && window[global] ? window[global] : null;
    }

    async function loadDataset(key) {
        if (cache[key]) return cache[key];
        const dataset = DATASETS[key];

        if (isLocalFileProtocol() || typeof fetch !== 'function') {
            const fallback = await ensurePreloaded(key);
            if (!fallback) throw new Error(`${dataset.label}数据不可用`);
            cache[key] = fallback;
            return fallback;
        }

        try {
            const response = await fetch(dataset.url, { cache: 'default' });
            if (!response.ok) {
                throw new Error(`加载${dataset.label}数据失败：${response.status}`);
            }
            cache[key] = await response.json();
            return cache[key];
        } catch (error) {
            const fallback = await ensurePreloaded(key);
            if (fallback) {
                console.warn(`加载远程${dataset.label}数据失败，使用预加载数据回退。`, error);
                cache[key] = fallback;
                return fallback;
            }
            throw error;
        }
    }

    async function ensurePreloaded(key) {
        const existing = getPreloaded(key);
        if (existing || typeof document === 'undefined') return existing;

        if (!preloadPromises[key]) {
            preloadPromises[key] = loadPreloadScript(DATASETS[key].preload, `${key} preload`).catch((error) => {
                preloadPromises[key] = null;
                throw error;
            });
        }

        try {
            await preloadPromises[key];
        } catch (error) {
            console.warn(`加载${DATASETS[key].label}预加载脚本失败。`, error);
        }
        return getPreloaded(key);
    }

    function loadPreloadScript(src, label) {
        return new Promise((resolve, reject) => {
            const existingScript = document.querySelector(`script[src="${src}"]`);
            if (existingScript) {
                if (existingScript.getAttribute('data-loaded') === 'true') {
                    resolve();
                    return;
                }

                existingScript.addEventListener('load', () => resolve(), { once: true });
                existingScript.addEventListener('error', () => reject(new Error(`Failed to load ${label}`)), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.defer = true;
            script.setAttribute('data-role', label);

            script.addEventListener('load', () => {
                script.setAttribute('data-loaded', 'true');
                resolve();
            }, { once: true });

            script.addEventListener('error', () => {
                reject(new Error(`Failed to load ${label}`));
            }, { once: true });

            document.head.appendChild(script);
        });
    }

    function buildBaguaBinaryIndex() {
        baguaNameByBinary = new Map();
        for (const [name, data] of Object.entries(baguaData || {})) {
            if (data && data.binary) {
                baguaNameByBinary.set(data.binary, name);
            }
        }
    }

    // 经传为增强数据：加载失败只记录警告，界面退回白话数据中的爻辞
    async function loadClassics() {
        try {
            return await loadDataset('zhouyi');
        } catch (error) {
            console.warn('经传原文加载失败，仅显示白话数据。', error);
            return null;
        }
    }

    /**
     * 统一爻辞结构：{ position, title, text（经文）, gloss（白话）, xiang（小象）, content（旧字段） }
     * 有经传原文时以原文为准，白话取旧数据中经文之后的部分
     */
    function normalizeLines(hexagram, classic) {
        return (hexagram.lines || []).map((line, index) => {
            const parts = YiCore.splitLineText(line.content);
            const source = classic?.lines?.[index];
            return {
                position: index + 1,
                content: line.content,
                title: source?.title || parts.title || YiCore.lineTitle(index + 1, hexagram.bits[index] === 1),
                text: source?.text || parts.classic,
                gloss: source ? YiCore.glossAfterClassic(line.content, source.text) : parts.gloss,
                xiang: source?.xiang || ''
            };
        });
    }

    // 处理卦象数据：建立索引并补齐全名、卦画、上下卦、关系卦与经传原文
    async function processHexagramData() {
        const [bagua, data, zhouyi] = await Promise.all([
            loadDataset('bagua'),
            loadDataset('hexagrams'),
            loadClassics()
        ]);
        baguaData = bagua;
        buildBaguaBinaryIndex();
        classics = zhouyi;

        hexagramMap = JSON.parse(JSON.stringify(data));
        hexagramIdByBinary = new Map();
        hexagramByTrigramKey = new Map();

        for (const key of Object.keys(hexagramMap)) {
            const hexagram = hexagramMap[key];
            hexagram.id = parseInt(key, 10);
            if (hexagram.binary && hexagram.binary.length === 6) {
                hexagramIdByBinary.set(hexagram.binary, hexagram.id);
            }
        }

        for (const hexagram of Object.values(hexagramMap)) {
            const classic = classics?.hexagrams?.[hexagram.id] || null;
            hexagram.bits = YiCore.binaryToBits(hexagram.binary);
            hexagram.classic = classic;
            hexagram.judgment = classic?.judgment || '';
            hexagram.lines = normalizeLines(hexagram, classic);
            hexagram.upperTrigram = getBaguaByBinary(hexagram.binary.slice(0, 3));
            hexagram.lowerTrigram = getBaguaByBinary(hexagram.binary.slice(3));
            hexagram.fullName = YiCore.fullName(hexagram, getBagua(hexagram.upperTrigram), getBagua(hexagram.lowerTrigram));

            if (hexagram.upperTrigram && hexagram.lowerTrigram) {
                hexagramByTrigramKey.set(`${hexagram.upperTrigram}_${hexagram.lowerTrigram}`, hexagram.id);
            }

            hexagram.relations = {
                opposite: getHexagramIdByBinary(YiCore.oppositeBinary(hexagram.binary)),
                inverse: getHexagramIdByBinary(YiCore.inverseBinary(hexagram.binary)),
                mutual: getHexagramIdByBinary(YiCore.mutualBinary(hexagram.binary))
            };
        }
    }

    function getHexagramIdByBinary(binary) {
        return hexagramIdByBinary ? (hexagramIdByBinary.get(binary) || null) : null;
    }

    function getBaguaByBinary(binary) {
        return baguaNameByBinary ? (baguaNameByBinary.get(binary) || null) : null;
    }

    function getHexagramByBinary(binary) {
        const id = getHexagramIdByBinary(binary);
        return id ? getHexagramById(id) : null;
    }

    function getHexagramById(id) {
        return hexagramMap[id] || null;
    }

    function getBaguaData() {
        return baguaData || {};
    }

    function getBagua(name) {
        return (baguaData && baguaData[name]) || null;
    }

    function getHexagramByTrigrams(upper, lower) {
        const id = hexagramByTrigramKey ? hexagramByTrigramKey.get(`${upper}_${lower}`) : null;
        return id ? getHexagramById(id) : null;
    }

    // 系辞、说卦、序卦、杂卦全文及出处；未加载经传时为 null
    function getClassics() {
        return classics ? { source: classics.source, appendix: classics.appendix } : null;
    }

    // 截取命中位置附近的片段，供结果列表展示“为何命中”
    function snippetAround(text, index, length) {
        const start = Math.max(0, index - 12);
        const end = Math.min(text.length, index + length + 24);
        return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
    }

    /**
     * 排序搜索：卦名 > 卦序 > 卦义关键词 > 卦辞 > 爻辞 > 彖象 > 概述 > 详解
     * 返回 [{ hexagram, score, field, snippet }]
     */
    function searchHexagrams(keyword) {
        const query = String(keyword || '').trim().toLowerCase();
        if (!query) return [];

        const results = [];
        const numeric = /^\d{1,2}$/.test(query) ? parseInt(query, 10) : null;

        for (const hexagram of getAllHexagrams()) {
            const name = hexagram.name.toLowerCase();
            const fullName = (hexagram.fullName || '').toLowerCase();
            const classic = hexagram.classic || {};
            let score = 0;
            let field = '';
            let snippet = '';

            if (name === query || fullName === query) {
                score = 100;
                field = 'name';
            } else if (numeric !== null && hexagram.id === numeric) {
                score = 90;
                field = 'id';
            } else if (name.includes(query) || fullName.includes(query)) {
                score = 80;
                field = 'name';
            } else if ((hexagram.explanation || '').toLowerCase().includes(query)) {
                score = 60;
                field = 'explanation';
            } else {
                const candidates = [
                    ['judgment', hexagram.judgment || '', 50],
                    ...hexagram.lines.map(line => ['line', `${line.title}，${line.text}`, 45]),
                    ...(classic.extra ? [['line', `${classic.extra.title}，${classic.extra.text}`, 45]] : []),
                    ['tuan', classic.tuan || '', 35],
                    ['xiang', classic.daxiang || '', 35],
                    ...hexagram.lines.map(line => ['xiang', line.xiang || '', 32]),
                    ['overview', hexagram.overview || '', 30],
                    ...hexagram.lines.map(line => ['gloss', line.gloss || '', 25]),
                    ['wenyan', (classic.wenyan || []).join(''), 22],
                    ['detail', hexagram.detail || '', 20]
                ];

                for (const [candidateField, text, candidateScore] of candidates) {
                    const index = text.toLowerCase().indexOf(query);
                    if (index >= 0) {
                        score = candidateScore;
                        field = candidateField;
                        snippet = snippetAround(text, index, query.length);
                        break;
                    }
                }
            }

            if (score > 0) {
                results.push({ hexagram, score, field, snippet });
            }
        }

        return results.sort((a, b) => b.score - a.score || a.hexagram.id - b.hexagram.id);
    }

    // 错卦恒存在；综卦、互卦与本卦相同时省略
    function getRelatedHexagrams(hexagramId) {
        const hexagram = hexagramMap[hexagramId];
        if (!hexagram || !hexagram.relations) {
            return {};
        }

        const related = {};
        for (const [type, id] of Object.entries(hexagram.relations)) {
            if (!id || (type !== 'opposite' && id === hexagram.id)) continue;
            const relatedHexagram = getHexagramById(id);
            if (relatedHexagram) {
                related[type] = relatedHexagram;
            }
        }
        return related;
    }

    function getAllHexagrams() {
        return Object.values(hexagramMap).sort((a, b) => a.id - b.id);
    }

    return {
        init,
        getHexagramByBinary,
        getHexagramById,
        getBaguaData,
        getBagua,
        getHexagramByTrigrams,
        getClassics,
        searchHexagrams,
        getRelatedHexagrams,
        getAllHexagrams,
        RELATION_NAMES: Object.freeze({ opposite: '错卦', inverse: '综卦', mutual: '互卦' }),
        get isInitialized() { return isInitialized; }
    };
})();
