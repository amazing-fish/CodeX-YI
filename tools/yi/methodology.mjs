import YiCore from '../../apps/yi/js/core/yijing-core.js';

// 此处只保存具名古籍短引与本项目撰写的方法摘要，不收录现代译注或宣称名家全库。
export const METHODOLOGY_VERSION = 1;

const SOURCES = [
    {
        id: 'wangbi-bianwei', author: '王弼', work: '周易略例', section: '辩位',
        url: 'https://zh.wikisource.org/wiki/周易略例/辯位',
        revisionUrl: 'https://zh.wikisource.org/w/index.php?title=周易略例/辯位&oldid=194052',
        verification: 'text-checked', checkedOn: '2026-11-10',
        scope: '爻位学说的异说，不是本卦逐爻注解',
        excerpt: '初上者，是事之終始，無陰陽定位也。'
    },
    {
        id: 'zhouyi-zhengyi-xian', author: '王弼注、孔颖达疏', work: '周易正义', section: '卷四·咸·上六',
        url: 'https://zh.wikisource.org/wiki/周易正義/04咸',
        revisionUrl: 'https://zh.wikisource.org/w/index.php?title=周易正義/04咸&oldid=2404957',
        verification: 'text-checked', checkedOn: '2026-11-10',
        scope: '仅咸上六的两则具名短引'
    },
    {
        id: 'zhuxi-benyi-xian', author: '朱熹', work: '周易本义', section: '咸·上六',
        url: 'https://zh.wikisource.org/wiki/周易本義_(四庫全書本)/卷2',
        verification: 'text-checked', checkedOn: '2026-11-10',
        scope: '仅咸上六的一则短引；保留所核版本字形'
    },
    {
        id: 'xiangan-shi-wanci-xian', author: '项安世', work: '周易玩辞', section: '四库全书本卷七·咸·初六上六',
        url: 'https://zh.wikisource.org/zh-hant/周易玩辭_(四庫全書本)/卷07',
        verification: 'text-checked', checkedOn: '2026-11-10', scope: '仅咸上六口说问题的两则短引'
    },
    {
        id: 'qimeng-tongshi', author: '胡方平撰、朱士立补', work: '易学启蒙通释', section: '考变占第四',
        url: 'https://www.shidianguji.com/zh/book/SK0061/chapter/1l9qr24ok8562',
        verification: 'text-checked', checkedOn: '2026-11-10', scope: '朱熹系变占规则的核验文本；不把通释作者误署为朱熹',
        excerpt: '前十卦主貞，後十卦主悔'
    },
    {
        id: 'structure-reference', author: '东洋古典综合数据库', work: '周易入门', section: '應·比·承(履)·乘',
        url: 'https://db.cyberseodang.or.kr/front/sabuList/BookMain.do?bnCode=jti_1a0101&mId=m01&titleId=C2',
        verification: 'text-checked', checkedOn: '2026-11-10', scope: '现代术语核对参考；仅链接与自行撰写摘要，不收录其现代原文'
    }
];

const COMMENTARIES = [
    { id: 'xian-6-wangbi', hexagramId: 31, kind: 'line', position: 6,
        author: '王弼', work: '周易注（收入周易正义）', sourceId: 'zhouyi-zhengyi-xian',
        quote: '咸道轉末，故在口舌言語而已。',
        summary: '把上六放在感应之道的末端，指出感应停在口舌言语。' },
    { id: 'xian-6-kongyingda', hexagramId: 31, kind: 'line', position: 6,
        author: '孔颖达', work: '周易正义', sourceId: 'zhouyi-zhengyi-xian',
        quote: '所競者口，無復心實。',
        summary: '疏解王弼注，以口头竞说与内心诚实的区别说明这一爻。' },
    { id: 'xian-6-zhuxi', hexagramId: 31, kind: 'line', position: 6,
        author: '朱熹', work: '周易本义', sourceId: 'zhuxi-benyi-xian',
        quote: '感人以言而无其實',
        summary: '结合上六居兑说之终、咸感之极及兑为口舌，批评仅凭言语而缺乏实质的感人方式。' },
    { id: 'xian-6-xianganshi', hexagramId: 31, kind: 'line', position: 6,
        author: '项安世', work: '周易玩辞', sourceId: 'xiangan-shi-wanci-xian',
        quote: '事自有當用口說之時', additionalQuote: '但專恃口說亦不為美',
        summary: '不一概贬斥口说，认为训诰誓命也须言语传布；但专靠口说仍不足称美。',
        perspective: '异说：言语有其必要场景，不能径断说话者虚伪。' }
];

function structure(hexagram) {
    const bits = hexagram.bits;
    return {
        hexagramId: hexagram.id, binary: hexagram.binary,
        // 保留网页通用奇偶位标签，另给王弼初上无定位的异说，不伪造共识。
        lines: YiCore.linePositions(bits).map(line => ({ ...line,
            title: YiCore.lineTitle(line.position, line.yang),
            wangBiProper: line.position === 1 || line.position === 6 ? null : line.proper
        })),
        correspondingPairs: [1, 2, 3].map(lower => ({ lower, upper: lower + 3, oppositePolarity: bits[lower - 1] !== bits[lower + 2] })),
        adjacentPairs: [1, 2, 3, 4, 5].map(lower => ({
            lower, upper: lower + 1, lowerYang: bits[lower - 1] === 1, upperYang: bits[lower] === 1,
            // 比：两爻相邻；承：下承上；乘：上乘下。附常见狭义阴承阳/阴乘阳，不赋吉凶。
            bi: true, cheng: { from: lower, to: lower + 1 }, chengYinSupportsYang: bits[lower - 1] === 0 && bits[lower] === 1,
            riding: { from: lower + 1, to: lower }, ridingYinOverYang: bits[lower] === 0 && bits[lower - 1] === 1
        }))
    };
}

export function buildMethodology(result, classicsAvailable) {
    const { primary, changed, guide } = result;
    const current = { primary, changed };
    const entries = Object.entries(current).flatMap(([target, hexagram]) =>
        COMMENTARIES.filter(item => item.hexagramId === hexagram.id).map(item => ({
            ...item, target, summaryType: 'project-paraphrase',
            citation: { section: SOURCES.find(source => source.id === item.sourceId).section,
                url: SOURCES.find(source => source.id === item.sourceId).revisionUrl || SOURCES.find(source => source.id === item.sourceId).url },
            selected: guide.focus.some(focus => focus.target === target && focus.kind === item.kind && focus.position === item.position)
        })));
    const focusCoverage = guide.focus.map(focus => ({ ...focus,
        hexagramId: current[focus.target].id,
        commentaryIds: entries.filter(entry => entry.target === focus.target && entry.kind === focus.kind && entry.position === focus.position).map(entry => entry.id),
        status: entries.some(entry => entry.target === focus.target && entry.kind === focus.kind && entry.position === focus.position) ? 'excerpt-only' : 'not-included'
    }));
    const method = {
        version: METHODOLOGY_VERSION, profile: 'zhouyi-reading-with-attribution',
        purpose: '为调用方提供可审计的解读步骤和证据边界，不生成占断或现实预测。',
        layers: [
            { id: 'calculation', label: '确定性计算', includes: ['本卦与之卦', '动爻', '爻位与关系'], limit: '可复算不等于具有现实预测效力。' },
            { id: 'selection', label: '流派主读选择', includes: ['朱熹系简化规则'], limit: '决定先读什么，不等于解释经文或所有流派共识。' },
            { id: 'classic', label: '经传原文', available: classicsAvailable, limit: '经、传与注分开；原文缺失时白话不能冒充原文。' },
            { id: 'commentary', label: '具名注解', limit: '只引用下列实际匹配的具名短引；旧白话不是名家注释。' },
            { id: 'application', label: '现代引申', provider: 'caller', limit: '结合事件作条件性的自省建议，明确是 AI 推断，不冒充古人原意。' }
        ],
        selection: {
            school: '朱熹系变占规则的项目简化整理', sourceId: 'qimeng-tongshi', implementedBy: 'YiCore.readingGuide',
            count: guide.count, focus: guide.focus,
            scope: '0–6 变爻的读辞入口；乾坤六变读用九/用六。不是朱熹全部易学或其他流派的替代。',
            provenance: '据胡方平撰、朱士立补《易学启蒙通释·考变占第四》核验；其中彖辞指卦辞，并非单读彖传。二变、四变条文有据例推定，不代表先秦统一规则。',
            threeChanges: {
                applied: guide.count === 3, status: 'simplified',
                detail: '仅合读本卦（贞）与之卦（悔）卦辞；未实现前十卦主贞、后十卦主悔的卦变排序，不预设本卦永远为主。'
            }
        },
        structuralContext: {
            convention: '自下而上初至上；当位采用阳居奇位、阴居偶位；二五为中；初四、二五、三上阴阳相异为应。',
            definitions: {
                proper: '奇偶位模型的标签，不是自动吉利；王弼初上无阴阳定位，见 wangBiProper 的 null。',
                central: '二、五居内外卦中位；得中与当位是不同条件。',
                corresponds: '对应位阴阳相异的结构关系，不证明现实中的互爱、支持或成功。',
                bi: '相邻两爻，包括三四；仅记录邻接。',
                cheng: '广义下爻承上爻；另标常见狭义阴承阳。',
                riding: '广义上爻乘下爻；另标常见狭义阴乘阳。不同注家用语与解释须分别核对。'
            },
            sources: ['wangbi-bianwei', 'structure-reference'],
            schools: [{ sourceId: 'wangbi-bianwei', difference: '初上是终始，无阴阳定位；本工具的通用标签与此不相同。', affectedPositions: [1, 6] }],
            caution: '先读卦时、卦辞与所选爻辞，再看结构与注家如何使用它；不按当位、得中、有应、承乘比加减分判吉凶。',
            primary: structure(primary), changed: structure(changed)
        },
        relatedContext: {
            role: '补充观察角度', independentEvidence: false,
            definitions: { opposite: '错：六爻阴阳全反', inverse: '综：倒置六爻', mutual: '互：二三四为下、三四五为上' },
            caution: '错综互由同一本卦派生，不能当作三次独立验证，不能推翻主读经文；自反或重复关系也不增加证据权重。'
        },
        commentaries: {
            coverage: { status: 'partial', totalHexagrams: 64, includedHexagrams: [31], includedLines: [{ hexagramId: 31, position: 6 }],
                includedEntries: COMMENTARIES.length, fullCorpus: false,
                notice: '仅内置咸上六的王弼、孔颖达、朱熹、项安世短引；不声称收录名家六十四卦全解。未匹配处明确未收录，不能补造引文。' },
            focusCoverage, entries,
            relationship: '孔颖达疏承接王弼注，不是独立证实；多位注家语意相近也不证明现实事件。',
            disagreements: '项安世强调言语有必要场景，不赞成一概贬斥口说；不得把各家合并为对当事人虚伪的共同判断。本样本不覆盖全部异说。'
        },
        sources: SOURCES,
        rights: {
            ancientTexts: '所引为古代著作短句；不据此声称现代校勘、标点、译注或平台内容均属公共领域。',
            projectSummaries: 'summary、definitions 与流程为项目自行撰写，按仓库 MIT 许可。',
            transcription: '只附具名古文短引与来源链接，不整库复制网站文本；网页的现代整理、译注及平台条款须另行核验。',
            sourceLicenses: '维基文库网页文字标示 CC BY-SA 4.0（https://creativecommons.org/licenses/by-sa/4.0/）及可能的附加条款；此处不宣称其整理成果可改授 MIT。识典及现代术语参考页的整理复用许可未核实，不复制其现代译注。'
        },
        workflow: [
            '确认事件、原六爻与动爻，不因解释不合期待重新起卦。',
            '说明主读规则及三爻变简化；先读所选经文，再放回本卦/之卦的卦时、彖象上下文。',
            '列出实际匹配的具名注解及出处；未收录处明确说明；白话与项目摘要不冒充名家。',
            '以当位、得中、相应、承乘比辅助解释，保留王弼初上异说；结构标签不是吉凶分数。',
            '错综互仅作补充；最后把事件事实、古义与现代引申分开，提出可由现实检验的问题。'
        ],
        outputContract: {
            sections: ['卦与主读依据', '经传原文', '具名注解与覆盖缺口', '结构辅助与异说', '现代引申与可验证行动', '不确定性与边界'],
            rules: ['逐条注明引用作者、作品、篇章和 sourceId；不可编造未提供的原话。', '关键解释绑定经文或注解；结构只支持或质疑解读，不能代替经文。',
                '缺少事件背景或原文时说明缺口，不把假设当事实。', '不推断他人的内心，不许诺确定未来，不替代医疗、法律、财务等专业判断。']
        }
    };
    // 长结果在部分宿主中会截断中段；先提供当前主读和实际短引，不删完整经文资料。
    const { version, profile, purpose, selection, commentaries, layers, workflow, outputContract, ...references } = method;
    return { version, profile, purpose, selection, commentaries, layers, workflow, outputContract, ...references };
}

export function methodologyText(methodology) {
    const { selection, commentaries, structuralContext } = methodology;
    const lines = [`方法论：${selection.school}`, `三爻变简化（${selection.threeChanges.applied ? '本次适用' : '本次不适用'}）：${selection.threeChanges.detail}`,
        `证据层：${methodology.layers.map(layer => layer.label).join(' → ')}`, commentaries.coverage.notice,
        `经传原文：${methodology.layers.find(layer => layer.id === 'classic').available ? '可用' : '不可用，以下旧白话不能冒充经传原文'}`,
        `主读来源：${selection.provenance}`,
        `爻位异说：${structuralContext.schools[0].difference}`, structuralContext.caution];
    for (const [target, context] of [['本卦', structuralContext.primary], ['之卦', structuralContext.changed]]) {
        const supports = context.adjacentPairs.filter(pair => pair.chengYinSupportsYang).map(pair => `${pair.lower}承${pair.upper}`);
        const rides = context.adjacentPairs.filter(pair => pair.ridingYinOverYang).map(pair => `${pair.upper}乘${pair.lower}`);
        lines.push(`${target}承乘比：相邻五组；阴承阳 ${supports.join('、') || '无'}；阴乘阳 ${rides.join('、') || '无'}（不自动判吉凶）。`);
    }
    for (const focus of commentaries.focusCoverage) lines.push(`主读注解覆盖：${focus.target === 'primary' ? '本卦' : '之卦'}第${focus.hexagramId}卦 ${focus.position ? `${focus.position}爻` : focus.label || '卦辞'}：${focus.status === 'excerpt-only' ? '仅短引' : '未收录'}`);
    for (const entry of commentaries.entries) {
        const source = methodology.sources.find(item => item.id === entry.sourceId);
        lines.push(`${entry.selected ? '主读' : '上下文'}注解 · ${entry.author}《${entry.work}》咸上六：“${entry.quote}”${entry.additionalQuote ? `；“${entry.additionalQuote}”` : ''}\n项目摘要：${entry.summary}\n出处：${source.url}`);
    }
    lines.push(methodology.relatedContext.caution, ...methodology.workflow.map((step, index) => `${index + 1}. ${step}`),
        `输出层次：${methodology.outputContract.sections.join('；')}`, methodology.rights.transcription, methodology.rights.sourceLicenses);
    for (const id of [selection.sourceId, ...structuralContext.sources]) {
        const source = methodology.sources.find(item => item.id === id);
        lines.push(`方法来源：${source.author}《${source.work}》${source.section} ${source.revisionUrl || source.url}`);
    }
    return lines.join('\n');
}
