/**
 * 易理核心 - 纯函数集合（不依赖 DOM，可在 Node 中直接测试）
 *
 * 约定：
 * - lines：自下而上（初爻 → 上爻）的爻对象数组，形如 { type: 'yang'|'yin', changing, name, value }
 * - binary：自上而下的 6 位字符串（上爻在前），与 data/hexagrams.json 保持一致
 */
(function(root) {
    'use strict';

    // 三钱法：背（无字面）记 3，字面记 2；三钱之和定爻
    const COIN_BACK = 3;
    const COIN_FACE = 2;

    const LINE_BY_SUM = Object.freeze({
        6: Object.freeze({ value: 6, type: 'yin', changing: true, name: '老阴' }),
        7: Object.freeze({ value: 7, type: 'yang', changing: false, name: '少阳' }),
        8: Object.freeze({ value: 8, type: 'yin', changing: false, name: '少阴' }),
        9: Object.freeze({ value: 9, type: 'yang', changing: true, name: '老阳' })
    });

    const POSITION_NAMES = Object.freeze(['初', '二', '三', '四', '五', '上']);

    // 断卦规则，依朱熹《易学启蒙·考变占》整理
    const RULES = Object.freeze([
        { count: 0, name: '六爻安静', text: '以本卦卦辞为断。' },
        { count: 1, name: '一爻变', text: '以本卦变爻爻辞为断。' },
        { count: 2, name: '二爻变', text: '以本卦两变爻爻辞为断，以上爻为主。' },
        { count: 3, name: '三爻变', text: '以本卦与之卦卦辞合断，本卦为贞（体），之卦为悔（用）。' },
        { count: 4, name: '四爻变', text: '以之卦两不变爻爻辞为断，以下爻为主。' },
        { count: 5, name: '五爻变', text: '以之卦不变爻爻辞为断。' },
        { count: 6, name: '六爻皆变', text: '乾坤占用九、用六；余卦以之卦卦辞为断。' }
    ]);

    const SPECIAL_ALL_CHANGING = Object.freeze({
        '111111': { label: '用九', text: '见群龙无首，吉。' },
        '000000': { label: '用六', text: '利永贞。' }
    });

    function randomBit() {
        const cryptoApi = root.crypto;
        if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
            return (cryptoApi.getRandomValues(new Uint8Array(1))[0] & 1) === 1;
        }
        return Math.random() < 0.5;
    }

    // 返回三枚铜钱的朝向：true 为背（3），false 为字（2）
    function tossCoins() {
        return [randomBit(), randomBit(), randomBit()];
    }

    function coinValue(isBack) {
        return isBack ? COIN_BACK : COIN_FACE;
    }

    function lineFromValue(value) {
        const line = LINE_BY_SUM[value];
        if (!line) {
            throw new RangeError(`无效的爻值：${value}`);
        }
        return { ...line };
    }

    function lineFromCoins(coins) {
        if (!Array.isArray(coins) || coins.length !== 3) {
            throw new TypeError('需要三枚铜钱的结果');
        }
        const sum = coins.reduce((total, isBack) => total + coinValue(isBack), 0);
        return lineFromValue(sum);
    }

    function isYang(line) {
        return line && line.type === 'yang';
    }

    function toBinary(lines) {
        if (!Array.isArray(lines) || lines.length !== 6) {
            throw new TypeError('需要完整的六爻');
        }
        return lines.map(line => (isYang(line) ? '1' : '0')).reverse().join('');
    }

    // binary（上爻在前）→ 自下而上的 0/1 数组，便于渲染
    function binaryToBits(binary) {
        return String(binary).split('').reverse().map(bit => (bit === '1' ? 1 : 0));
    }

    function changingPositions(lines) {
        return lines.reduce((positions, line, index) => {
            if (line && line.changing) {
                positions.push(index + 1);
            }
            return positions;
        }, []);
    }

    // 之卦：变爻阴阳互换，且不再为变爻
    function transformLines(lines) {
        return lines.map((line) => {
            if (!line.changing) {
                return { ...line };
            }
            return line.type === 'yang'
                ? { ...LINE_BY_SUM[8] }
                : { ...LINE_BY_SUM[7] };
        });
    }

    // 爻题，如“初九”“六二”“上六”
    function lineTitle(position, yang) {
        const number = yang ? '九' : '六';
        if (position === 1) return `初${number}`;
        if (position === 6) return `上${number}`;
        return `${number}${POSITION_NAMES[position - 1]}`;
    }

    // 爻辞数据形如“初九，潜龙勿用。潜伏修身……”：拆分为爻题、原文、白话
    function splitLineText(content) {
        const text = String(content || '').trim();
        const match = text.match(/^([^，,]{2})[，,](.*)$/);
        if (!match) {
            return { title: '', classic: text, gloss: '' };
        }

        const rest = match[2];
        const end = rest.indexOf('。');
        if (end < 0) {
            return { title: match[1], classic: rest, gloss: '' };
        }

        return {
            title: match[1],
            classic: rest.slice(0, end + 1),
            gloss: rest.slice(end + 1).trim()
        };
    }

    const PUNCTUATION_CHAR = /[，。、；：！？“”‘’「」,.;:!?\s]/;
    const PUNCTUATION_ALL = new RegExp(PUNCTUATION_CHAR.source, 'g');

    /**
     * 旧数据的爻辞条目为“爻题，原文。白话”，但原文常被截在第一个句号处。
     * 给定完整经文后，按“忽略标点逐字比对”剥掉条目前部的经文，只留白话；
     * 比对不上（旧数据有讹字或截断）时退回 splitLineText 的切分。
     */
    function glossAfterClassic(content, classic) {
        const parts = splitLineText(content);
        const target = String(classic || '').replace(PUNCTUATION_ALL, '');
        const rest = String(content || '').trim().replace(/^[^，,]{2}[，,]/, '');
        if (!target) return parts.gloss;

        let matched = 0;
        let index = 0;
        while (index < rest.length && matched < target.length) {
            const char = rest[index];
            if (PUNCTUATION_CHAR.test(char)) {
                index += 1;
                continue;
            }
            if (char !== target[matched]) break;
            matched += 1;
            index += 1;
        }

        if (matched < target.length) return parts.gloss;
        return rest.slice(index).replace(/^[，。、；：！？,.;:!?\s]+/, '').trim();
    }

    /**
     * 爻位：当位（阳居奇位、阴居偶位）、得中（二、五）、相应（初四、二五、三上阴阳相异）
     * @param {Array<0|1>} bits 自下而上
     * @returns {Array<{position, yang, proper, central, partner, corresponds}>}
     */
    function linePositions(bits) {
        if (!Array.isArray(bits) || bits.length !== 6) {
            throw new TypeError('需要完整的六爻');
        }
        return bits.map((bit, index) => {
            const position = index + 1;
            const yang = bit === 1;
            const partner = position > 3 ? position - 3 : position + 3;
            return {
                position,
                yang,
                proper: yang === (position % 2 === 1),
                central: position === 2 || position === 5,
                partner,
                corresponds: (bits[partner - 1] === 1) !== yang
            };
        });
    }

    // 爻位小结：当位几爻、相应几组，并点出六爻皆当位（既济）与皆失位（未济）
    function positionSummary(bits) {
        const positions = linePositions(bits);
        const proper = positions.filter(item => item.proper).length;
        const pairs = positions.filter(item => item.position <= 3 && item.corresponds).length;
        let note = '';
        if (proper === 6) note = '六爻皆当位';
        else if (proper === 0) note = '六爻皆失位';
        if (pairs === 3) note = note ? `${note}，三组皆应` : '三组皆应';
        else if (pairs === 0) note = note ? `${note}，上下无应` : '上下无应';
        return { positions, proper, improper: 6 - proper, pairs, note };
    }

    function oppositeBinary(binary) {
        return binary.split('').map(bit => (bit === '1' ? '0' : '1')).join('');
    }

    function inverseBinary(binary) {
        return binary.split('').reverse().join('');
    }

    // 互卦：取二三四爻为下卦、三四五爻为上卦
    function mutualBinary(binary) {
        return binary[1] + binary[2] + binary[3] + binary[2] + binary[3] + binary[4];
    }

    function fullName(hexagram, upperBagua, lowerBagua) {
        if (!hexagram || !upperBagua || !lowerBagua) {
            return hexagram ? hexagram.name : '';
        }
        if (upperBagua === lowerBagua || upperBagua.binary === lowerBagua.binary) {
            return `${hexagram.name}为${upperBagua.nature}`;
        }
        return `${upperBagua.nature}${lowerBagua.nature}${hexagram.name}`;
    }

    /**
     * 解读指引：告诉用户“这一卦该看哪里”
     * focus 项：
     * - { target: 'primary'|'changed', kind: 'line', position, main }
     * - { target: 'primary'|'changed', kind: 'overview', role }
     * - { target: 'primary', kind: 'special', label, text }
     */
    function readingGuide(lines) {
        const binary = toBinary(lines);
        const changing = changingPositions(lines);
        const count = changing.length;
        const stable = [1, 2, 3, 4, 5, 6].filter(position => !changing.includes(position));
        const rule = RULES[count];
        let focus = [];

        switch (count) {
            case 0:
                focus = [{ target: 'primary', kind: 'overview' }];
                break;
            case 1:
                focus = [{ target: 'primary', kind: 'line', position: changing[0], main: true }];
                break;
            case 2:
                focus = [
                    { target: 'primary', kind: 'line', position: changing[1], main: true },
                    { target: 'primary', kind: 'line', position: changing[0], main: false }
                ];
                break;
            case 3:
                focus = [
                    { target: 'primary', kind: 'overview', role: '贞' },
                    { target: 'changed', kind: 'overview', role: '悔' }
                ];
                break;
            case 4:
                focus = [
                    { target: 'changed', kind: 'line', position: stable[0], main: true },
                    { target: 'changed', kind: 'line', position: stable[1], main: false }
                ];
                break;
            case 5:
                focus = [{ target: 'changed', kind: 'line', position: stable[0], main: true }];
                break;
            default: {
                const special = SPECIAL_ALL_CHANGING[binary];
                focus = special
                    ? [{ target: 'primary', kind: 'special', label: special.label, text: special.text }]
                    : [{ target: 'changed', kind: 'overview' }];
            }
        }

        return { count, changing, stable, rule, focus };
    }

    root.YiCore = Object.freeze({
        LINE_BY_SUM,
        POSITION_NAMES,
        RULES,
        tossCoins,
        coinValue,
        lineFromValue,
        lineFromCoins,
        toBinary,
        binaryToBits,
        changingPositions,
        transformLines,
        lineTitle,
        splitLineText,
        glossAfterClassic,
        linePositions,
        positionSummary,
        oppositeBinary,
        inverseBinary,
        mutualBinary,
        fullName,
        readingGuide
    });
})(typeof window !== 'undefined' ? window : globalThis);
