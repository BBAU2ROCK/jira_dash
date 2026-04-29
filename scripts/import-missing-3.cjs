/**
 * 일회성: 권한 부족으로 누락된 3건을 assignee 없이 생성.
 * 원래 담당자(이하린) 정보는 summary 끝에 [원담당:이하린]으로 표시.
 */
const fs = require('fs');
const axios = require('axios');
const PROXY = 'http://localhost:3001/api';
const CSV_PATH = 'C:\\Users\\jwchoo\\Desktop\\jira_import_Trombone_v3_0_5_2.csv';

function parseCsv(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = [];
    let row = [], field = '', inQ = false, i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (inQ) {
            if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
            field += ch; i++; continue;
        }
        if (ch === '"') { inQ = true; i++; continue; }
        if (ch === ',') { row.push(field); field = ''; i++; continue; }
        if (ch === '\r') { i++; continue; }
        if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
        field += ch; i++;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    const headers = rows[0];
    return rows.slice(1).filter((r) => r.some((c) => c && c.trim()))
        .map((r) => Object.fromEntries(headers.map((h, k) => [h, (r[k] ?? '').trim()])));
}

const TARGETS = new Set([
    '[B/E] 업무 코드 관리 - 등록 - 프로젝트 등록',
    '[B/E] 업무 코드 관리 - 수정 - 프로젝트 수정',
    '[B/E] 업무 코드 관리 - 상세 - 프로젝트 목록 조회',
]);

(async () => {
    const csv = fs.readFileSync(CSV_PATH, 'utf8');
    const all = parseCsv(csv);
    const rows = all.filter((r) => TARGETS.has(r.Summary));
    console.log('찾은 행:', rows.length);

    for (const row of rows) {
        const desc = row.Description ? {
            version: 1, type: 'doc',
            content: row.Description.split('\n').map((line) => ({
                type: 'paragraph', content: line ? [{ type: 'text', text: line }] : []
            })),
        } : undefined;
        const payload = {
            fields: {
                project: { key: 'IGMU' },
                issuetype: { name: '할 일' },
                summary: row.Summary,
                parent: { key: 'IGMU-538' },
                ...(desc ? { description: desc } : {}),
                ...(row['Due Date'] ? { duedate: row['Due Date'] } : {}),
                ...(row['Start Date'] ? { customfield_11481: row['Start Date'] } : {}),
                ...(row.Labels ? { labels: row.Labels.split(/[,\s]+/).filter(Boolean) } : {}),
                // assignee 의도적 생략 — 사용자가 권한 복구 후 수동 할당
            },
        };
        try {
            const r = await axios.post(`${PROXY}/issue`, payload, { timeout: 15000 });
            console.log('OK', r.data.key, '-', row.Summary);
        } catch (e) {
            console.log('FAIL', row.Summary, '-', JSON.stringify(e.response?.data ?? e.message));
        }
    }
})();
