/**
 * 卦象数据服务 - 管理易经卦象数据
 */
const HexagramDataService = (function() {

    const DATA_URL = 'data/hexagrams.json';
    const BAGUA_DATA_URL = 'data/bagua.json';

    let rawHexagramData = null;
    let hexagramMap = {};
    let baguaData = null;
    let isInitialized = false;

    // 初始化
    async function init() {
        try {
            if (isInitialized) return;

            YizhiApp.performance.start('hexagram_data_init');

            // 处理卦象数据
            await processHexagramData();

            isInitialized = true;
            YizhiApp.performance.end('hexagram_data_init');

            YizhiApp.events.emit('hexagram-data:ready');
        } catch (error) {
            YizhiApp.errors.handle(error, 'Hexagram Data Service Init');
        }
    }

    // 加载卦象数据
    async function loadHexagramData() {
        if (rawHexagramData) {
            return rawHexagramData;
        }

        if (typeof fetch === 'function') {
            let response;
            try {
                response = await fetch(DATA_URL, { cache: 'default' });
                if (!response.ok) {
                    throw new Error(`Failed to load hexagram data: ${response.status}`);
                }
            } catch (error) {
                const fallbackData = getPreloadedHexagramData();
                if (fallbackData) {
                    console.warn('加载远程卦象数据失败，使用预加载数据回退。', error);
                    return fallbackData;
                }
                YizhiApp.errors.handle(error, 'Load Hexagram Data');
                throw error;
            }

            return response.json();
        }

        const fallback = getPreloadedHexagramData();
        if (fallback) {
            return fallback;
        }

        const loadError = new Error('Hexagram data is not available.');
        YizhiApp.errors.handle(loadError, 'Load Hexagram Data');
        throw loadError;
    }

    function getPreloadedHexagramData() {
        if (typeof window !== 'undefined' && window.__HEXAGRAM_DATA__) {
            return window.__HEXAGRAM_DATA__;
        }
        return null;
    }

    async function loadBaguaData() {
        if (baguaData) {
            return baguaData;
        }

        if (typeof fetch === 'function') {
            let response;
            try {
                response = await fetch(BAGUA_DATA_URL, { cache: 'default' });
                if (!response.ok) {
                    throw new Error('Failed to load bagua data: ' + response.status);
                }
            } catch (error) {
                const fallbackData = getPreloadedBaguaData();
                if (fallbackData) {
                    console.warn('加载远程八卦数据失败，使用预加载数据回退。', error);
                    return fallbackData;
                }
                YizhiApp.errors.handle(error, 'Load Bagua Data');
                throw error;
            }

            return response.json();
        }

        const fallback = getPreloadedBaguaData();
        if (fallback) {
            return fallback;
        }

        const loadError = new Error('Bagua data is not available.');
        YizhiApp.errors.handle(loadError, 'Load Bagua Data');
        throw loadError;
    }

    function getPreloadedBaguaData() {
        if (typeof window !== 'undefined' && window.__BAGUA_DATA__) {
            return window.__BAGUA_DATA__;
        }
        return null;
    }

    // 处理卦象数据
    async function processHexagramData() {
        const nextBaguaData = validateBaguaData(await loadBaguaData());
        const sourceHexagrams = await loadHexagramData();
        const nextHexagramMap = validateHexagramData(sourceHexagrams);
        const binaryIndex = new Map();

        for (const key in nextHexagramMap) {
            const id = parseInt(key, 10);
            const hexagram = nextHexagramMap[key];
            hexagram.id = id;
            binaryIndex.set(hexagram.binary, id);

            calculateTrigrams(hexagram, nextBaguaData);
        }

        for (const key in nextHexagramMap) {
            calculateRelations(nextHexagramMap[key], binaryIndex);
        }

        rawHexagramData = YizhiApp.utils.deepClone(sourceHexagrams);
        baguaData = nextBaguaData;
        hexagramMap = nextHexagramMap;
    }

    function validateHexagramData(data) {
        if (!isPlainObject(data)) {
            throw new Error('Hexagram data must be an object.');
        }

        const keys = Object.keys(data);
        const expectedKeys = Array.from({ length: 64 }, (_, index) => String(index + 1));
        if (keys.length !== 64 || expectedKeys.some(key =>
            !Object.prototype.hasOwnProperty.call(data, key))) {
            throw new Error('Hexagram data must contain exactly ids 1 through 64.');
        }

        const binaryValues = new Set();
        const snapshot = YizhiApp.utils.deepClone(data);

        for (const key of expectedKeys) {
            const hexagram = snapshot[key];
            if (!isPlainObject(hexagram)) {
                throw new Error(`Hexagram ${key} must be an object.`);
            }
            if (typeof hexagram.name !== 'string' || hexagram.name.trim() === '') {
                throw new Error(`Hexagram ${key} must have a name.`);
            }
            if (typeof hexagram.explanation !== 'string') {
                throw new Error(`Hexagram ${key} must have an explanation.`);
            }
            if (typeof hexagram.binary !== 'string' || !/^[01]{6}$/.test(hexagram.binary)) {
                throw new Error(`Hexagram ${key} must have a six-bit binary code.`);
            }
            if (binaryValues.has(hexagram.binary)) {
                throw new Error(`Hexagram binary code ${hexagram.binary} must be unique.`);
            }
            binaryValues.add(hexagram.binary);

            if (!Array.isArray(hexagram.lines) || hexagram.lines.length !== 6) {
                throw new Error(`Hexagram ${key} must contain six lines.`);
            }
            hexagram.lines.forEach((line, index) => {
                if (!isPlainObject(line) || line.position !== index + 1 || typeof line.content !== 'string') {
                    throw new Error(`Hexagram ${key} line ${index + 1} is invalid.`);
                }
            });
        }

        return snapshot;
    }

    function validateBaguaData(data) {
        if (!isPlainObject(data) || Object.keys(data).length !== 8) {
            throw new Error('Bagua data must contain exactly eight entries.');
        }

        const binaryValues = new Set();
        const snapshot = YizhiApp.utils.deepClone(data);
        for (const [name, bagua] of Object.entries(snapshot)) {
            if (!isPlainObject(bagua) || typeof bagua.symbol !== 'string' ||
                typeof bagua.binary !== 'string' || !/^[01]{3}$/.test(bagua.binary)) {
                throw new Error(`Bagua ${name} is invalid.`);
            }
            if (binaryValues.has(bagua.binary)) {
                throw new Error(`Bagua binary code ${bagua.binary} must be unique.`);
            }
            binaryValues.add(bagua.binary);
        }
        return snapshot;
    }

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    // 计算卦象的上下卦
    function calculateTrigrams(hexagram, sourceBaguaData = baguaData) {
        const binary = hexagram.binary;
        if (binary && binary.length === 6) {
            const upperBinary = binary.slice(0, 3);
            const lowerBinary = binary.slice(3);

            hexagram.upperTrigram = getBaguaByBinary(upperBinary, sourceBaguaData);
            hexagram.lowerTrigram = getBaguaByBinary(lowerBinary, sourceBaguaData);
            if (!hexagram.upperTrigram || !hexagram.lowerTrigram) {
                throw new Error(`Hexagram ${hexagram.id} references unknown trigrams.`);
            }
        }
    }

    // 计算关系数据结构
    function calculateRelations(hexagram, binaryIndex = null) {
        hexagram.relations = {};
        hexagram.relations.opposite = calculateOpposite(hexagram.binary, binaryIndex);
        hexagram.relations.inverse = calculateInverse(hexagram.binary, binaryIndex);
        hexagram.relations.mutual = calculateMutual(hexagram.binary, binaryIndex);

        if (Object.values(hexagram.relations).some(id => id === null)) {
            throw new Error(`Hexagram ${hexagram.id} has an unresolved relation.`);
        }
    }

    // 计算对宫卦
    function calculateOpposite(binary, binaryIndex) {
        const oppositeBinary = binary.split('').map(bit => bit === '1' ? '0' : '1').join('');
        return getHexagramIdByBinary(oppositeBinary, binaryIndex);
    }

    // 计算综卦
    function calculateInverse(binary, binaryIndex) {
        const inverseBinary = binary.split('').reverse().join('');
        return getHexagramIdByBinary(inverseBinary, binaryIndex);
    }

    // 计算互卦
    function calculateMutual(binary, binaryIndex) {
        const third = binary.charAt(2);
        const fourth = binary.charAt(3);
        const fifth = binary.charAt(4);
        const second = binary.charAt(1);

        const mutualBinary = second + third + fourth + third + fourth + fifth;
        return getHexagramIdByBinary(mutualBinary, binaryIndex);
    }

    // 通过二进制获取卦象ID
    function getHexagramIdByBinary(binary, binaryIndex = null) {
        if (binaryIndex) {
            return binaryIndex.get(binary) ?? null;
        }
        for (const key in hexagramMap) {
            if (hexagramMap[key].binary === binary) {
                return parseInt(key);
            }
        }
        return null;
    }

    // 根据二进制代码获取八卦
    function getBaguaByBinary(binary, sourceBaguaData = baguaData) {
        if (!sourceBaguaData) {
            return null;
        }
        for (const name in sourceBaguaData) {
            if (sourceBaguaData[name].binary === binary) {
                return name;
            }
        }
        return null;
    }

    // 公共API方法
    function getHexagramByBinary(binary) {
        for (const key in hexagramMap) {
            if (hexagramMap[key].binary === binary) {
                const hexagram = hexagramMap[key];
                if (!hexagram.upperTrigram || !hexagram.lowerTrigram) {
                    calculateTrigrams(hexagram);
                }
                return hexagram;
            }
        }
        return null;
    }

    function getHexagramById(id) {
        const hexagram = hexagramMap[id] || null;
        if (hexagram) {
            if (!hexagram.upperTrigram || !hexagram.lowerTrigram) {
                calculateTrigrams(hexagram);
            }
            if (!hexagram.relations) {
                calculateRelations(hexagram);
            }
        }
        return hexagram;
    }

    function getBaguaData() {
        return baguaData || {};
    }

    function getBagua(name) {
        return (baguaData && baguaData[name]) || null;
    }

    function getHexagramByTrigrams(upper, lower) {
        for (const key in hexagramMap) {
            const hexagram = hexagramMap[key];
            if (!hexagram.upperTrigram || !hexagram.lowerTrigram) {
                calculateTrigrams(hexagram);
            }
            if (hexagram.upperTrigram === upper && hexagram.lowerTrigram === lower) {
                return hexagram;
            }
        }
        return null;
    }

    function searchHexagrams(keyword) {
        keyword = keyword.toLowerCase();
        const results = [];

        for (const key in hexagramMap) {
            const hexagram = hexagramMap[key];
            if (!hexagram.upperTrigram || !hexagram.lowerTrigram) {
                calculateTrigrams(hexagram);
            }

            if (hexagram.name.toLowerCase().includes(keyword) ||
                hexagram.explanation.toLowerCase().includes(keyword) ||
                (hexagram.overview && hexagram.overview.toLowerCase().includes(keyword)) ||
                (hexagram.detail && hexagram.detail.toLowerCase().includes(keyword))) {
                results.push(hexagram);
            }
        }

        return results;
    }

    function getRelatedHexagrams(hexagramId) {
        const hexagram = hexagramMap[hexagramId];
        if (!hexagram || !hexagram.relations) {
            return {};
        }

        const related = {};
        for (const [type, id] of Object.entries(hexagram.relations)) {
            related[type] = getHexagramById(id);
        }

        return related;
    }

    function getAllHexagrams() {
        return Object.values(hexagramMap);
    }

    return {
        init,
        getHexagramByBinary,
        getHexagramById,
        getBaguaData,
        getBagua,
        getHexagramByTrigrams,
        searchHexagrams,
        getRelatedHexagrams,
        getAllHexagrams,
        get isInitialized() { return isInitialized; }
    };
})();

