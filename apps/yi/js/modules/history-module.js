/**
 * 占记模块 - 本机保存的卦
 *
 * 持久化结构 v1（存储键 yizhi_divination_history，只存引用与用户输入，不复制卦文）：
 * { version: 1, id, timestamp, question, notes, lines: [6|7|8|9]×(0|6), hexagramId, source: 'cast'|'modal' }
 * 读取时一律经数据服务按卦序/六爻重新水合；非法卦序、未知版本、损坏的六爻整条丢弃并回写清理。
 * 兼容旧版：无 version、hexagram 为完整对象、lines 为 { type, changing } 或来源为 'divination'。
 * 安全边界：所问与备注等持久化文本只经 textContent 输出，不拼入 innerHTML。
 */
const HistoryModule = (function() {
    const list = document.getElementById('historyList');
    const summary = document.getElementById('historySummary');
    const searchInput = document.getElementById('historySearch');
    const rangeButtons = document.querySelectorAll('#historyRange [data-range]');
    const exportBtn = document.getElementById('exportHistoryBtn');
    const importBtn = document.getElementById('importHistoryBtn');
    const importInput = document.getElementById('importHistoryInput');
    const clearBtn = document.getElementById('clearHistoryBtn');

    const STORAGE_KEY = 'divination_history';
    const HISTORY_VERSION = 1;
    const MAX_ID_LENGTH = 100;
    const MAX_TEXT_LENGTH = 500;
    const DELETE_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>';

    let range = 'all';
    let query = '';
    let dataFailed = false;

    function init() {
        searchInput?.addEventListener('input', YizhiApp.utils.debounce(() => {
            query = searchInput.value.trim().toLowerCase();
            render();
        }, 150));

        rangeButtons.forEach((button) => {
            button.addEventListener('click', () => {
                range = button.dataset.range;
                rangeButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
                render();
            });
        });

        list?.addEventListener('click', handleListClick);
        exportBtn?.addEventListener('click', exportHistory);
        importBtn?.addEventListener('click', () => importInput?.click());
        importInput?.addEventListener('change', importHistory);
        clearBtn?.addEventListener('click', clearHistory);

        YizhiApp.events.on('hexagram-data:error', () => {
            dataFailed = true;
            render();
        });

        render();
        YizhiApp.whenDataReady(render);
    }

    function onActivate() {
        render();
    }

    function dataService() {
        const data = YizhiApp.getModule('hexagramData');
        return data?.isInitialized ? data : null;
    }

    function cleanText(value, maxLength) {
        if (typeof value !== 'string') return '';
        return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, maxLength);
    }

    // 须为正数且能构造有效 Date（上限 ±8.64e15 毫秒），否则 toISOString 会抛错
    function isValidTimestamp(value) {
        return Number.isFinite(value) && value > 0 && Number.isFinite(new Date(value).getTime());
    }

    function parseTimestamp(record) {
        const timestamp = Number(record.timestamp);
        if (isValidTimestamp(timestamp)) return timestamp;
        const parsed = typeof record.date === 'string' ? Date.parse(record.date.replace(' ', 'T')) : NaN;
        return isValidTimestamp(parsed) ? parsed : 0;
    }

    // 接受 6/7/8/9 爻值，或旧版的 { value } / { type, changing }；其余返回 null
    function decodeLine(line) {
        const raw = typeof line === 'number' ? line : Number(line?.value);
        if ([6, 7, 8, 9].includes(raw)) return YiCore.lineFromValue(raw);
        if (!line || !['yin', 'yang'].includes(line.type)) return null;
        const changing = line.changing === true;
        return YiCore.lineFromValue(line.type === 'yang' ? (changing ? 9 : 7) : (changing ? 6 : 8));
    }

    /**
     * 存储记录 → 运行时记录（附 canonical 卦对象）。任何字段不合法都返回 null。
     * 有六爻时以六爻推出本卦与之卦，卦序仅用于只有卦、没有六爻的“查阅保存”记录。
     */
    function decodeRecord(record, data, { fallbackId = '' } = {}) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
        if (record.version !== undefined && record.version !== HISTORY_VERSION) return null;

        const timestamp = parseTimestamp(record);
        if (!timestamp) return null;

        const rawLines = Array.isArray(record.lines) ? record.lines : [];
        if (rawLines.length !== 0 && rawLines.length !== 6) return null;
        const lines = rawLines.map(decodeLine);
        if (lines.some(line => line === null)) return null;

        let primary = null;
        let changed = null;
        if (lines.length === 6) {
            primary = data.getHexagramByBinary(YiCore.toBinary(lines));
            if (lines.some(line => line.changing)) {
                changed = data.getHexagramByBinary(YiCore.toBinary(YiCore.transformLines(lines)));
            }
        } else {
            const hexagramId = Number(record.hexagramId ?? record.hexagram?.id);
            primary = Number.isInteger(hexagramId) ? data.getHexagramById(hexagramId) : null;
        }
        if (!primary) return null;

        const id = cleanText(record.id, MAX_ID_LENGTH) || fallbackId || `legacy-${timestamp}`;
        const source = record.source === 'modal' || (record.source !== 'cast' && record.source !== 'divination' && lines.length === 0)
            ? 'modal'
            : 'cast';

        return {
            id,
            timestamp,
            date: YizhiApp.utils.formatDate(new Date(timestamp)),
            question: cleanText(record.question, MAX_TEXT_LENGTH),
            notes: cleanText(record.notes, MAX_TEXT_LENGTH),
            lines,
            hexagramId: primary.id,
            changedHexagramId: changed ? changed.id : null,
            changingLinesCount: lines.filter(line => line.changing).length,
            source,
            hexagram: primary,
            changed
        };
    }

    // 运行时记录 → 存储记录：只保留引用与用户输入
    function encodeRecord(record) {
        return {
            version: HISTORY_VERSION,
            id: record.id,
            timestamp: record.timestamp,
            question: record.question,
            notes: record.notes,
            lines: record.lines.map(line => line.value),
            hexagramId: record.hexagramId,
            source: record.source
        };
    }

    function saveRecords(records) {
        const limited = records.slice(0, YizhiApp.config.history.maxRecords);
        YizhiApp.storage.setItem(STORAGE_KEY, limited.map(encodeRecord));
    }

    /**
     * 数据服务就绪前返回空数组且不触碰存储，避免把尚无法校验的记录误清掉。
     * 就绪后解码全部记录；若清理或迁移改变了内容，立即回写为 v1 结构。
     */
    function getHistoryRecords() {
        const data = dataService();
        if (!data) return [];

        const stored = YizhiApp.storage.getItem(STORAGE_KEY, []);
        if (!Array.isArray(stored)) {
            YizhiApp.storage.setItem(STORAGE_KEY, []);
            return [];
        }

        const seen = new Set();
        const records = [];
        stored.forEach((item) => {
            const record = decodeRecord(item, data);
            if (!record || seen.has(record.id)) return;
            seen.add(record.id);
            records.push(record);
        });
        records.sort((a, b) => b.timestamp - a.timestamp);

        const limited = records.slice(0, YizhiApp.config.history.maxRecords);
        const encoded = limited.map(encodeRecord);
        if (JSON.stringify(stored) !== JSON.stringify(encoded)) {
            YizhiApp.storage.setItem(STORAGE_KEY, encoded);
        }
        return limited;
    }

    function addRecord(input) {
        try {
            const data = dataService();
            if (!data) throw new Error('卦象数据尚未就绪，无法保存占记。');
            const record = decodeRecord({ ...input, id: YizhiApp.utils.generateId() }, data);
            if (!record) throw new Error('占记不符合 canonical 结构，已拒绝保存。');

            saveRecords([record, ...getHistoryRecords()]);
            render();
            return record;
        } catch (error) {
            YizhiApp.errors.handle(error, '保存占记');
            return null;
        }
    }

    function deleteRecord(id) {
        const records = getHistoryRecords();
        const index = records.findIndex(record => record.id === id);
        if (index < 0) return;

        const [removed] = records.splice(index, 1);
        saveRecords(records);
        render();

        YizhiApp.toast('info', '已删除一条占记', {
            action: {
                label: '撤销',
                handler: () => {
                    const current = getHistoryRecords().filter(record => record.id !== removed.id);
                    current.splice(Math.min(index, current.length), 0, removed);
                    saveRecords(current);
                    render();
                }
            }
        });
    }

    function inRange(record) {
        if (range === 'all') return true;
        const { utils } = YizhiApp;
        const start = range === 'today' ? utils.startOfDay() : range === 'week' ? utils.startOfWeek() : utils.startOfMonth();
        return record.timestamp >= start.getTime();
    }

    function matches(record) {
        if (!query) return true;
        return [record.question, record.notes, record.hexagram.name, record.changed?.name, record.hexagram.explanation]
            .some(text => (text || '').toLowerCase().includes(query));
    }

    // 空态与提示均为静态文案，可安全使用 innerHTML
    function renderEmpty(title, text, withLink = false) {
        list.innerHTML = `
            <li class="empty">
                <p class="empty-title">${title}</p>
                <p>${text}</p>
                ${withLink ? '<a class="btn btn-primary" href="#cast">去起卦</a>' : ''}
            </li>`;
    }

    function render() {
        if (!list) return;

        if (!dataService()) {
            summary.textContent = '';
            if (exportBtn) exportBtn.disabled = true;
            if (clearBtn) clearBtn.disabled = true;
            if (dataFailed) {
                renderEmpty('卦象数据加载失败', '占记需要卦象数据才能校验与显示，请刷新页面重试。');
            } else {
                list.innerHTML = `<li class="empty">${YizhiApp.ui.spinner('载入占记')}</li>`;
            }
            return;
        }

        const records = getHistoryRecords();
        const weekStart = YizhiApp.utils.startOfWeek().getTime();
        const thisWeek = records.filter(record => record.timestamp >= weekStart).length;
        const changing = records.filter(record => record.changingLinesCount > 0).length;

        if (exportBtn) exportBtn.disabled = records.length === 0;
        if (clearBtn) clearBtn.disabled = records.length === 0;

        if (records.length === 0) {
            summary.textContent = '';
            renderEmpty('还没有占记', '成卦后点“保存到占记”，就会出现在这里。', true);
            return;
        }

        const visible = records.filter(record => inRange(record) && matches(record));
        const filtered = visible.length !== records.length ? `，当前显示 ${visible.length} 条` : '';
        summary.textContent = `共 ${records.length} 条 · 本周 ${thisWeek} 条 · 含变爻 ${changing} 条${filtered}`;

        if (visible.length === 0) {
            renderEmpty('没有符合条件的占记', '换个关键词或时间范围试试。');
            return;
        }

        list.innerHTML = '';
        const fragment = document.createDocumentFragment();
        visible.forEach(record => fragment.appendChild(itemNode(record)));
        list.appendChild(fragment);
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function itemNode(record) {
        const { ui, utils } = YizhiApp;
        const primary = record.hexagram;
        const changed = record.changed;
        const bits = record.lines.length === 6
            ? record.lines.map(line => (line.type === 'yang' ? 1 : 0))
            : YiCore.binaryToBits(primary.binary);
        const changingPositions = record.lines.length === 6 ? YiCore.changingPositions(record.lines) : [];
        const text = record.question || record.notes;

        const item = el('li', 'history-item');
        const open = el('button', 'history-open');
        open.setAttribute('type', 'button');
        open.setAttribute('data-open-record', record.id);

        // 卦画由已校验的六爻/卦序生成，不含任何持久化文本
        const figures = el('span', 'history-figures');
        figures.innerHTML = ui.figure(bits, { size: 'sm', changing: changingPositions });

        const main = el('span', 'history-main');
        const names = el('span', 'history-names', primary.name);
        if (changed) {
            names.appendChild(el('span', 'of', '之'));
            names.appendChild(document.createTextNode(changed.name));
        }
        main.appendChild(names);
        main.appendChild(el('span', `history-question${text ? '' : ' is-empty'}`, text || '未记所问'));

        const meta = el('span', 'history-meta');
        const time = el('time', '', utils.formatRelative(record.timestamp));
        time.setAttribute('datetime', new Date(record.timestamp).toISOString());
        time.setAttribute('title', record.date);
        meta.appendChild(time);
        const badgeText = record.source === 'modal'
            ? '查阅'
            : (record.changingLinesCount ? `${record.changingLinesCount} 爻变` : '安静');
        meta.appendChild(el('span', `badge${record.source !== 'modal' && record.changingLinesCount ? ' badge-changing' : ''}`, badgeText));

        open.appendChild(figures);
        open.appendChild(main);
        open.appendChild(meta);

        const remove = el('button', 'icon-btn history-delete');
        remove.setAttribute('type', 'button');
        remove.setAttribute('data-delete-record', record.id);
        remove.setAttribute('aria-label', `删除 ${primary.name} 这条占记`);
        remove.innerHTML = DELETE_ICON;

        item.appendChild(open);
        item.appendChild(remove);
        return item;
    }

    function handleListClick(event) {
        const deleteId = event.target.closest('[data-delete-record]')?.getAttribute('data-delete-record');
        if (deleteId) {
            deleteRecord(deleteId);
            return;
        }

        const openId = event.target.closest('[data-open-record]')?.getAttribute('data-open-record');
        if (!openId) return;
        const record = getHistoryRecords().find(item => item.id === openId);
        if (!record) return;

        // 起卦记录回到起卦页完整重读；“查阅保存”的记录只有卦，没有六爻
        if (record.lines.length === 6) {
            YizhiApp.getModule('cast')?.loadRecord(record);
        } else {
            YizhiApp.getModule('modal')?.show(record.hexagramId);
        }
    }

    function exportHistory() {
        const records = getHistoryRecords();
        if (records.length === 0) return;
        YizhiApp.utils.downloadJson(`易之占记_${YizhiApp.utils.formatDate(new Date(), 'YYYYMMDD-HHmmss')}.json`, {
            exported_at: YizhiApp.utils.formatDate(new Date()),
            version: YizhiApp.config.version,
            history_version: HISTORY_VERSION,
            total_records: records.length,
            records: records.map(encodeRecord)
        });
        YizhiApp.toast('success', `已导出 ${records.length} 条占记`);
    }

    async function importHistory() {
        const file = importInput.files?.[0];
        importInput.value = '';
        if (!file) return;

        const data = dataService();
        if (!data) {
            YizhiApp.toast('error', '卦象数据尚未就绪，请稍后再导入');
            return;
        }

        try {
            const parsed = JSON.parse(await file.text());
            const incoming = (Array.isArray(parsed) ? parsed : parsed?.records || [])
                .map(record => decodeRecord(record, data))
                .filter(Boolean);

            if (incoming.length === 0) {
                YizhiApp.toast('error', '文件中没有可识别的占记');
                return;
            }

            const existing = getHistoryRecords();
            const known = new Set(existing.map(record => record.id));
            const added = incoming.filter(record => !known.has(record.id) && known.add(record.id));
            const merged = [...existing, ...added].sort((a, b) => b.timestamp - a.timestamp);
            saveRecords(merged);
            render();

            const skipped = incoming.length - added.length;
            YizhiApp.toast('success', `导入 ${added.length} 条${skipped ? `，跳过重复 ${skipped} 条` : ''}`);
        } catch (error) {
            YizhiApp.errors.handle(error, '导入占记', '导入失败：文件不是有效的易之占记备份。');
        }
    }

    async function clearHistory() {
        const count = getHistoryRecords().length;
        if (count === 0) return;
        const confirmed = await YizhiApp.dialogs.confirm(
            `清空全部 ${count} 条占记？`,
            '此操作无法撤销。如需保留，请先导出备份。',
            { okText: '清空', danger: true }
        );
        if (!confirmed) return;

        YizhiApp.storage.removeItem(STORAGE_KEY);
        render();
        YizhiApp.toast('info', '占记已清空');
    }

    return {
        init,
        onActivate,
        addRecord,
        getHistoryRecords,
        deleteRecord
    };
})();
