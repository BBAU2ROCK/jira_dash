#!/usr/bin/env node
/**
 * Jira CSV bulk import — 일회성 작업용 스크립트.
 *
 * 사용:
 *   node scripts/import-jira-csv.cjs <csv-path> <project-key> <epic-key> [--dry-run] [--limit N]
 *
 * 예:
 *   # dry-run (실제 생성 X, 변환 결과만 출력)
 *   node scripts/import-jira-csv.cjs "C:\Users\jwchoo\Desktop\jira_import_Trombone_v3_0_5_2.csv" IGMU IGMU-538 --dry-run
 *
 *   # 1건 테스트
 *   node scripts/import-jira-csv.cjs "C:\Users\jwchoo\Desktop\jira_import_Trombone_v3_0_5_2.csv" IGMU IGMU-538 --limit 1
 *
 *   # 전체 실행 (50건 batch)
 *   node scripts/import-jira-csv.cjs "C:\Users\jwchoo\Desktop\jira_import_Trombone_v3_0_5_2.csv" IGMU IGMU-538
 *
 * 동작:
 *   - 로컬 proxy(127.0.0.1:3001) 경유로 Jira 호출
 *   - assignee 한글 이름 → accountId 조회 (캐시)
 *   - issuetype "할 일", parent.key=에픽
 *   - 50건 batch (Jira bulk-create endpoint)
 *   - 결과 JSON으로 .import-result.json 저장 (재시도 시 skip)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PROXY = 'http://localhost:3001/api';
const RESULT_FILE = path.join(process.cwd(), '.import-result.json');

// ──────────────────────────────────────────────────────────────────
// CLI args
// ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flags = new Set(args.filter((a) => a.startsWith('--')));
const limitArgIdx = args.indexOf('--limit');
const limit = limitArgIdx >= 0 ? parseInt(args[limitArgIdx + 1], 10) : null;
const skipArgIdx = args.indexOf('--skip');
const skip = skipArgIdx >= 0 ? parseInt(args[skipArgIdx + 1], 10) : 0;

if (positional.length < 3) {
    console.error('Usage: import-jira-csv.cjs <csv> <project> <epic> [--dry-run] [--limit N]');
    process.exit(1);
}
const [CSV_PATH, PROJECT_KEY, EPIC_KEY] = positional;
const DRY_RUN = flags.has('--dry-run');

console.log('[args] csv:', CSV_PATH);
console.log('[args] project:', PROJECT_KEY);
console.log('[args] epic:', EPIC_KEY);
console.log('[args] dry-run:', DRY_RUN);
console.log('[args] limit:', limit ?? 'none');

// ──────────────────────────────────────────────────────────────────
// CSV parser (multi-line description 지원, RFC 4180 quote escape)
// ──────────────────────────────────────────────────────────────────
function parseCsv(text) {
    // UTF-8 BOM strip
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = [];
    let row = [];
    let field = '';
    let inQuote = false;
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (inQuote) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                inQuote = false; i++; continue;
            }
            field += ch; i++; continue;
        }
        if (ch === '"') { inQuote = true; i++; continue; }
        if (ch === ',') { row.push(field); field = ''; i++; continue; }
        if (ch === '\r') { i++; continue; }
        if (ch === '\n') {
            row.push(field); rows.push(row);
            row = []; field = ''; i++; continue;
        }
        field += ch; i++;
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field); rows.push(row);
    }
    if (rows.length === 0) return { headers: [], data: [] };
    const headers = rows[0];
    const data = rows.slice(1)
        .filter((r) => r.some((c) => c && c.trim()))
        .map((r) => Object.fromEntries(headers.map((h, k) => [h, (r[k] ?? '').trim()])));
    return { headers, data };
}

// ──────────────────────────────────────────────────────────────────
// User cache — 한글 displayName → accountId
// ──────────────────────────────────────────────────────────────────
const userCache = new Map(); // displayName → { accountId, displayName, emailAddress? } | null (not found)

async function resolveUser(displayName) {
    if (!displayName) return null;
    if (userCache.has(displayName)) return userCache.get(displayName);

    try {
        const r = await axios.get(`${PROXY}/user/search`, {
            params: { query: displayName },
            timeout: 10000,
        });
        const list = Array.isArray(r.data) ? r.data : [];
        // 정확 매칭 우선
        const exact = list.find((u) => u.displayName === displayName);
        const found = exact ?? list[0] ?? null;
        if (found) {
            const out = { accountId: found.accountId, displayName: found.displayName, emailAddress: found.emailAddress };
            userCache.set(displayName, out);
            return out;
        }
    } catch (e) {
        console.warn(`[user] '${displayName}' search 실패: ${e.message}`);
    }
    userCache.set(displayName, null);
    return null;
}

// ──────────────────────────────────────────────────────────────────
// CSV row → Jira issue payload
// ──────────────────────────────────────────────────────────────────
const PLANNED_START_FIELD = 'customfield_11481'; // CSV 'Start Date'

function descriptionToAdf(text) {
    const t = (text ?? '').trim();
    if (!t) return undefined;
    return {
        version: 1,
        type: 'doc',
        content: t.split('\n').map((line) => ({
            type: 'paragraph',
            content: line ? [{ type: 'text', text: line }] : [],
        })),
    };
}

function buildIssuePayload(row, assigneeAccountId) {
    const fields = {
        project: { key: PROJECT_KEY },
        issuetype: { name: row['Issue Type'] || '할 일' },
        summary: row.Summary,
        parent: { key: EPIC_KEY },
    };

    if (assigneeAccountId) {
        fields.assignee = { accountId: assigneeAccountId };
    }

    if (row.Description) {
        fields.description = descriptionToAdf(row.Description);
    }
    if (row['Due Date']) fields.duedate = row['Due Date'];
    if (row['Start Date']) fields[PLANNED_START_FIELD] = row['Start Date'];
    if (row.Labels) {
        fields.labels = row.Labels.split(/[,\s]+/).filter(Boolean);
    }
    // Component 는 프로젝트에 등록되어 있어야 함 — IGMU엔 없으므로 skip (Labels로 분류)
    return { fields };
}

// ──────────────────────────────────────────────────────────────────
// Bulk create (50개씩)
// ──────────────────────────────────────────────────────────────────
async function bulkCreate(payloads) {
    const r = await axios.post(`${PROXY}/issue/bulk`, { issueUpdates: payloads }, {
        timeout: 30000,
    });
    return r.data;
}

// 단일 생성 (디버깅 + bulk 실패 시 fallback)
async function singleCreate(payload) {
    const r = await axios.post(`${PROXY}/issue`, payload, { timeout: 15000 });
    return r.data;
}

// ──────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────
async function main() {
    const csv = fs.readFileSync(CSV_PATH, 'utf8');
    const { data } = parseCsv(csv);
    const after = data.slice(skip);
    const rows = limit != null ? after.slice(0, limit) : after;
    console.log(`[csv] 전체 ${data.length}건 (skip ${skip}, limit ${limit ?? 'none'} → 처리 ${rows.length}건)`);

    // 1) 사용자 사전 조회
    const uniqueAssignees = [...new Set(rows.map((r) => r.Assignee).filter(Boolean))];
    console.log(`[user] ${uniqueAssignees.length}명 사전 조회 중...`);
    for (const name of uniqueAssignees) {
        const u = await resolveUser(name);
        console.log(`  ${u ? '✓' : '✗'} ${name}${u ? ` → ${u.accountId} (${u.displayName})` : ' [미발견]'}`);
    }
    const missing = uniqueAssignees.filter((n) => !userCache.get(n));
    if (missing.length > 0) {
        console.error(`\n[user] 매핑 실패: ${missing.join(', ')}`);
        if (!DRY_RUN) {
            console.error('실행 중단 — 매핑 실패 사용자가 있습니다. 정확한 displayName 확인 필요.');
            process.exit(2);
        }
    }

    // 2) 페이로드 변환
    const payloads = [];
    const skipped = [];
    for (const row of rows) {
        const u = row.Assignee ? userCache.get(row.Assignee) : null;
        if (row.Assignee && !u) {
            skipped.push({ summary: row.Summary, reason: `assignee '${row.Assignee}' not found` });
            continue;
        }
        payloads.push(buildIssuePayload(row, u?.accountId));
    }
    console.log(`\n[payload] 생성 가능 ${payloads.length}건, 스킵 ${skipped.length}건`);

    if (DRY_RUN) {
        console.log('\n[dry-run] 첫 3건 미리보기:');
        payloads.slice(0, 3).forEach((p, i) => {
            console.log(`\n--- [${i + 1}] ---`);
            console.log(JSON.stringify(p, null, 2));
        });
        if (skipped.length > 0) {
            console.log('\n[dry-run] 스킵:', skipped.slice(0, 5));
        }
        console.log('\n[dry-run] 완료. 실행하려면 --dry-run 제거.');
        return;
    }

    // 3) 실제 bulk create — 50건씩
    const BATCH = 50;
    const results = { created: [], failed: [] };
    for (let i = 0; i < payloads.length; i += BATCH) {
        const batch = payloads.slice(i, i + BATCH);
        const range = `${i + 1}~${i + batch.length}`;
        process.stdout.write(`[bulk] ${range}/${payloads.length} ... `);
        try {
            const res = await bulkCreate(batch);
            const issues = res?.issues ?? [];
            const errors = res?.errors ?? [];
            issues.forEach((iss, k) => {
                results.created.push({
                    key: iss.key,
                    summary: batch[k]?.fields?.summary,
                });
            });
            errors.forEach((err) => {
                results.failed.push({
                    summary: batch[err.failedElementNumber ?? 0]?.fields?.summary,
                    error: err.elementErrors,
                });
            });
            console.log(`OK (${issues.length} 생성, ${errors.length} 실패)`);
        } catch (e) {
            console.log(`FAIL: ${e.message}`);
            // batch 전체 실패 시 단건 retry로 부분 복구
            for (const p of batch) {
                try {
                    const r = await singleCreate(p);
                    results.created.push({ key: r.key, summary: p.fields.summary });
                } catch (e2) {
                    results.failed.push({
                        summary: p.fields.summary,
                        error: e2.response?.data ?? e2.message,
                    });
                }
            }
        }

        // 결과 중간 저장 (인터럽트 대비)
        fs.writeFileSync(RESULT_FILE, JSON.stringify(results, null, 2), 'utf8');
    }

    console.log(`\n[done] 생성: ${results.created.length}, 실패: ${results.failed.length}`);
    console.log(`[done] 상세 결과: ${RESULT_FILE}`);
    if (results.failed.length > 0) {
        console.log('[done] 실패 샘플:', results.failed.slice(0, 3));
    }
}

main().catch((e) => {
    console.error('[fatal]', e.message);
    if (e.response?.data) console.error(JSON.stringify(e.response.data, null, 2));
    process.exit(1);
});
