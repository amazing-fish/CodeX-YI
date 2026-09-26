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

    // 八卦键名与卦画是卦象索引的根，任何偏离都视为数据损坏
    const REQUIRED_BAGUA_BINARIES = Object.freeze({
        乾: '111', 坤: '000', 震: '001', 巽: '110', 坎: '010', 离: '101', 艮: '100', 兑: '011'
    });
    const REQUIRED_BAGUA_TEXT_FIELDS = Object.freeze(['symbol', 'nature', 'attribute', 'direction', 'animal', 'element', 'family']);

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

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function hasText(value) {
        return typeof value === 'string' && value.trim() !== '';
    }

    function snapshotOf(data) {
        const clone = YizhiApp.utils?.deepClone;
        return typeof clone === 'function' ? clone(data) : JSON.parse(JSON.stringify(data));
    }

    // 六十四卦必须恰好含 1–64，卦画唯一且为六位 0/1，六爻齐全；否则整体拒绝
    function validateHexagramData(data) {
        if (!isPlainObject(data)) throw new Error('卦象数据必须是对象。');

        const expectedKeys = Array.from({ length: 64 }, (_, index) => String(index + 1));
        if (Object.keys(data).length !== 64 || expectedKeys.some(key => !Object.prototype.hasOwnProperty.call(data, key))) {
            throw new Error('卦象数据必须恰好包含第 1–64 卦。');
        }

        const snapshot = snapshotOf(data);
        const binaries = new Set();
        for (const key of expectedKeys) {
            const hexagram = snapshot[key];
            if (!isPlainObject(hexagram)) throw new Error(`第 ${key} 卦必须是对象。`);
            if (!hasText(hexagram.name)) throw new Error(`第 ${key} 卦缺少卦名。`);
            if (typeof hexagram.explanation !== 'string') throw new Error(`第 ${key} 卦缺少卦义。`);
            if (typeof hexagram.binary !== 'string' || !/^[01]{6}$/.test(hexagram.binary)) {
                throw new Error(`第 ${key} 卦的卦画必须是六位 0/1。`);
            }
            if (binaries.has(hexagram.binary)) throw new Error(`卦画 ${hexagram.binary} 重复。`);
            binaries.add(hexagram.binary);

            if (!Array.isArray(hexagram.lines) || hexagram.lines.length !== 6) {
                throw new Error(`第 ${key} 卦必须恰好六爻。`);
            }
            hexagram.lines.forEach((line, index) => {
                if (!isPlainObject(line) || line.position !== index + 1 || typeof line.content !== 'string') {
                    throw new Error(`第 ${key} 卦第 ${index + 1} 爻结构不合法。`);
                }
            });
        }
        return snapshot;
    }

    // 八卦键名与卦画固定，展示字段不得为空
    function validateBaguaData(data) {
        const names = Object.keys(REQUIRED_BAGUA_BINARIES);
        if (!isPlainObject(data) || Object.keys(data).length !== names.length
            || names.some(name => !Object.prototype.hasOwnProperty.call(data, name))) {
            throw new Error('八卦数据必须恰好包含乾、坤、震、巽、坎、离、艮、兑。');
        }

        const snapshot = snapshotOf(data);
        for (const name of names) {
            const bagua = snapshot[name];
            if (!isPlainObject(bagua) || bagua.binary !== REQUIRED_BAGUA_BINARIES[name]) {
                throw new Error(`${name}卦必须使用固定卦画 ${REQUIRED_BAGUA_BINARIES[name]}。`);
            }
            const missing = REQUIRED_BAGUA_TEXT_FIELDS.find(field => !hasText(bagua[field]));
            if (missing) throw new Error(`${name}卦缺少 ${missing} 字段。`);
        }
        return snapshot;
    }

    // 下游直接当作字符串 / 字符串数组使用的字段：缺省可以，存在则类型必须正确
    const CLASSIC_TEXT_FIELDS = Object.freeze(['tuan', 'daxiang', 'xugua', 'zagua']);
    const CLASSIC_LIST_FIELDS = Object.freeze(['wenyan', 'notes']);
    const APPENDIX_KEYS = Object.freeze(['xici_shang', 'xici_xia', 'shuogua', 'xugua', 'zagua']);

    const isOptionalText = value => value === undefined || typeof value === 'string';
    const isTextList = value => Array.isArray(value) && value.every(item => typeof item === 'string');
    const isClassicLine = line => isPlainObject(line) && hasText(line.title) && hasText(line.text) && isOptionalText(line.xiang);

    function isClassicEntry(entry) {
        return isPlainObject(entry) && hasText(entry.judgment)
            && Array.isArray(entry.lines) && entry.lines.length === 6 && entry.lines.every(isClassicLine)
            && (entry.extra === undefined || isClassicLine(entry.extra))
            && CLASSIC_TEXT_FIELDS.every(field => isOptionalText(entry[field]))
            && CLASSIC_LIST_FIELDS.every(field => entry[field] === undefined || isTextList(entry[field]));
    }

    // 经传为可选增强：结构不完整时整体弃用（返回 null），不影响白话数据就绪
    function validateClassics(data) {
        if (!data) return null;
        const valid = isPlainObject(data) && hasText(data.source) && isPlainObject(data.hexagrams)
            && Array.from({ length: 64 }, (_, index) => data.hexagrams[index + 1]).every(isClassicEntry)
            && isPlainObject(data.appendix) && APPENDIX_KEYS.every(key => isTextList(data.appendix[key]));
        if (!valid) {
            console.warn('经传原文结构不完整，已弃用，仅显示白话数据。');
            return null;
        }
        return snapshotOf(data);
    }

    /**
     * 处理卦象数据：校验 → 建立索引 → 补齐全名、卦画、上下卦、关系卦与经传原文。
     * 全部在局部变量中完成，任一步失败即抛出，已有状态保持不变（不暴露部分快照）。
     */
    async function processHexagramData() {
        const [rawBagua, rawHexagrams, rawClassics] = await Promise.all([
            loadDataset('bagua'),
            loadDataset('hexagrams'),
            loadClassics()
        ]);
        const nextBagua = validateBaguaData(rawBagua);
        const nextMap = validateHexagramData(rawHexagrams);
        const nextClassics = validateClassics(rawClassics);

        const nextBaguaByBinary = new Map(Object.entries(nextBagua).map(([name, data]) => [data.binary, name]));
        const nextIdByBinary = new Map();
        const nextByTrigrams = new Map();

        for (const key of Object.keys(nextMap)) {
            const hexagram = nextMap[key];
            hexagram.id = parseInt(key, 10);
            nextIdByBinary.set(hexagram.binary, hexagram.id);
        }

        const relationOf = binary => nextIdByBinary.get(binary) || null;
        for (const hexagram of Object.values(nextMap)) {
            const classic = nextClassics?.hexagrams?.[hexagram.id] || null;
            hexagram.bits = YiCore.binaryToBits(hexagram.binary);
            hexagram.classic = classic;
            hexagram.judgment = classic?.judgment || '';
            hexagram.lines = normalizeLines(hexagram, classic);
            hexagram.upperTrigram = nextBaguaByBinary.get(hexagram.binary.slice(0, 3)) || null;
            hexagram.lowerTrigram = nextBaguaByBinary.get(hexagram.binary.slice(3)) || null;
            if (!hexagram.upperTrigram || !hexagram.lowerTrigram) {
                throw new Error(`第 ${hexagram.id} 卦无法解析上下卦。`);
            }
            hexagram.fullName = YiCore.fullName(hexagram, nextBagua[hexagram.upperTrigram], nextBagua[hexagram.lowerTrigram]);
            nextByTrigrams.set(`${hexagram.upperTrigram}_${hexagram.lowerTrigram}`, hexagram.id);

            hexagram.relations = {
                opposite: relationOf(YiCore.oppositeBinary(hexagram.binary)),
                inverse: relationOf(YiCore.inverseBinary(hexagram.binary)),
                mutual: relationOf(YiCore.mutualBinary(hexagram.binary))
            };
            if (Object.values(hexagram.relations).some(id => id === null)) {
                throw new Error(`第 ${hexagram.id} 卦存在无法解析的错综互关系。`);
            }
        }

        baguaData = nextBagua;
        baguaNameByBinary = nextBaguaByBinary;
        classics = nextClassics;
        hexagramMap = nextMap;
        hexagramIdByBinary = nextIdByBinary;
        hexagramByTrigramKey = nextByTrigrams;
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
