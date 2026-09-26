/**
 * 占记模块 - 本机保存的卦
 *
 * 记录结构（存储键 yizhi_divination_history）：
 * { id, timestamp, date, question, notes, lines, hexagramId, changedHexagramId,
 *   changingLinesCount, source, hexagram: { id, name, explanation } }
 * 兼容旧版：hexagram 为完整对象、lines 缺少 value、无 question 字段。
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
    let range = 'all';
    let query = '';

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

        render();
        YizhiApp.whenDataReady(render);
    }

    function onActivate() {
        render();
    }

    function timestampOf(record) {
        if (record && Number.isFinite(record.timestamp)) return record.timestamp;
        const parsed = Date.parse(record?.date || '');
        return Number.isNaN(parsed) ? 0 : parsed;
    }

    function normalizeRecord(record) {
        if (!record || typeof record !== 'object') return null;

        const timestamp = timestampOf(record);
        const lines = Array.isArray(record.lines) ? record.lines : [];
        const hexagramId = Number(record.hexagramId || record.hexagram?.id) || null;
        const changingLinesCount = Number.isFinite(record.changingLinesCount)
            ? record.changingLinesCount
            : lines.filter(line => line?.changing).length;

        return {
            ...record,
            // 缺少 id 的旧记录用时间戳生成稳定 id，保证删除与去重可用
            id: record.id || `legacy-${timestamp}`,
            timestamp,
            date: timestamp > 0 ? YizhiApp.utils.formatDate(new Date(timestamp)) : (record.date || ''),
            question: record.question || '',
            notes: record.notes || '',
            lines,
            hexagramId,
            changedHexagramId: record.changedHexagramId ?? null,
            changingLinesCount,
            source: record.source || (lines.length === 6 ? 'cast' : 'modal')
        };
    }

    function getHistoryRecords() {
        const records = YizhiApp.storage.getItem(STORAGE_KEY, []);
        return Array.isArray(records) ? records.map(normalizeRecord).filter(Boolean) : [];
    }

    function saveRecords(records) {
        YizhiApp.storage.setItem(STORAGE_KEY, records.slice(0, YizhiApp.config.history.maxRecords));
    }

    // 读取时以数据服务为准补齐卦名；数据未就绪时退回记录中的快照
    function resolve(record) {
        const data = YizhiApp.getModule('hexagramData');
        const ready = data?.isInitialized;
        let primary = ready && record.hexagramId ? data.getHexagramById(record.hexagramId) : null;
        let changed = ready && record.changedHexagramId ? data.getHexagramById(record.changedHexagramId) : null;

        if (ready && record.lines.length === 6) {
            const lines = record.lines.map(line => ({ type: line.type, changing: Boolean(line.changing) }));
            primary = primary || data.getHexagramByBinary(YiCore.toBinary(lines));
            if (!changed && record.changingLinesCount > 0) {
                changed = data.getHexagramByBinary(YiCore.toBinary(YiCore.transformLines(lines)));
            }
        }

        return { primary: primary || record.hexagram || null, changed };
    }

    function addRecord(input) {
        try {
            const data = YizhiApp.getModule('hexagramData');
            const primary = data?.getHexagramById(input.hexagramId);
            const record = normalizeRecord({
                ...input,
                id: YizhiApp.utils.generateId(),
                hexagram: primary ? { id: primary.id, name: primary.name, explanation: primary.explanation } : input.hexagram
            });

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
                    const current = getHistoryRecords();
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

    function matches(record, resolved) {
        if (!query) return true;
        return [record.question, record.notes, resolved.primary?.name, resolved.changed?.name, resolved.primary?.explanation]
            .some(text => (text || '').toLowerCase().includes(query));
    }

    function render() {
        if (!list) return;
        const records = getHistoryRecords();
        const weekStart = YizhiApp.utils.startOfWeek().getTime();
        const thisWeek = records.filter(record => record.timestamp >= weekStart).length;
        const changing = records.filter(record => record.changingLinesCount > 0).length;

        exportBtn.disabled = records.length === 0;
        clearBtn.disabled = records.length === 0;

        if (records.length === 0) {
            summary.textContent = '';
            list.innerHTML = `
                <li class="empty">
                    <p class="empty-title">还没有占记</p>
                    <p>成卦后点“保存到占记”，就会出现在这里。</p>
                    <a class="btn btn-primary" href="#cast">去起卦</a>
                </li>`;
            return;
        }

        const visible = records
            .map(record => ({ record, resolved: resolve(record) }))
            .filter(({ record, resolved }) => inRange(record) && matches(record, resolved));

        const filtered = visible.length !== records.length ? `，当前显示 ${visible.length} 条` : '';
        summary.textContent = `共 ${records.length} 条 · 本周 ${thisWeek} 条 · 含变爻 ${changing} 条${filtered}`;

        list.innerHTML = visible.length
            ? visible.map(itemHtml).join('')
            : '<li class="empty"><p class="empty-title">没有符合条件的占记</p><p>换个关键词或时间范围试试。</p></li>';
    }

    function itemHtml({ record, resolved }) {
        const { ui, utils } = YizhiApp;
        const { primary, changed } = resolved;
        const bits = record.lines.length === 6
            ? record.lines.map(line => (line.type === 'yang' ? 1 : 0))
            : (primary?.binary ? YiCore.binaryToBits(primary.binary) : [null, null, null, null, null, null]);
        const changingPositions = record.lines.length === 6 ? YiCore.changingPositions(record.lines) : [];
        const name = primary?.name || '未知卦';
        const text = record.question || record.notes;
        const meta = [
            `<time datetime="${new Date(record.timestamp || 0).toISOString()}" title="${utils.escapeHtml(record.date)}">${record.timestamp ? utils.formatRelative(record.timestamp) : utils.escapeHtml(record.date)}</time>`,
            record.source === 'modal'
                ? '<span class="badge">查阅</span>'
                : `<span class="badge${record.changingLinesCount ? ' badge-changing' : ''}">${record.changingLinesCount ? `${record.changingLinesCount} 爻变` : '安静'}</span>`
        ];

        return `
            <li class="history-item">
                <button class="history-open" type="button" data-open-record="${utils.escapeHtml(record.id)}">
                    <span class="history-figures">${ui.figure(bits, { size: 'sm', changing: changingPositions })}</span>
                    <span class="history-main">
                        <span class="history-names">${utils.escapeHtml(name)}${changed ? `<span class="of">之</span>${utils.escapeHtml(changed.name)}` : ''}</span>
                        <span class="history-question${text ? '' : ' is-empty'}">${text ? utils.escapeHtml(text) : '未记所问'}</span>
                    </span>
                    <span class="history-meta">${meta.join('')}</span>
                </button>
                <button class="icon-btn history-delete" type="button" data-delete-record="${utils.escapeHtml(record.id)}" aria-label="删除 ${utils.escapeHtml(name)} 这条占记">
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>
                </button>
            </li>`;
    }

    function handleListClick(event) {
        const deleteId = event.target.closest('[data-delete-record]')?.dataset.deleteRecord;
        if (deleteId) {
            deleteRecord(deleteId);
            return;
        }

        const openId = event.target.closest('[data-open-record]')?.dataset.openRecord;
        if (!openId) return;
        const record = getHistoryRecords().find(item => item.id === openId);
        if (!record) return;

        // 起卦记录回到起卦页完整重读；旧版“查阅保存”的记录只有卦，没有六爻
        if (record.lines.length === 6) {
            YizhiApp.getModule('cast')?.loadRecord(record);
        } else {
            const { primary } = resolve(record);
            if (primary) YizhiApp.getModule('modal')?.show(primary);
        }
    }

    function exportHistory() {
        const records = getHistoryRecords();
        if (records.length === 0) return;
        YizhiApp.utils.downloadJson(`易之占记_${YizhiApp.utils.formatDate(new Date(), 'YYYYMMDD-HHmmss')}.json`, {
            exported_at: YizhiApp.utils.formatDate(new Date()),
            version: YizhiApp.config.version,
            total_records: records.length,
            records
        });
        YizhiApp.toast('success', `已导出 ${records.length} 条占记`);
    }

    async function importHistory() {
        const file = importInput.files?.[0];
        importInput.value = '';
        if (!file) return;

        try {
            const parsed = JSON.parse(await file.text());
            const incoming = (Array.isArray(parsed) ? parsed : parsed?.records || [])
                .map(normalizeRecord)
                .filter(record => record && (record.hexagramId || record.lines.length === 6));

            if (incoming.length === 0) {
                YizhiApp.toast('error', '文件中没有可识别的占记');
                return;
            }

            const existing = getHistoryRecords();
            const known = new Set(existing.map(record => record.id));
            const added = incoming.filter(record => !known.has(record.id));
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
