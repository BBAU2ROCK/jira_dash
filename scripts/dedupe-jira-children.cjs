#!/usr/bin/env node
/**
 * 동일 summary 중복 자식 이슈 정리.
 *
 * 사용:
 *   node scripts/dedupe-jira-children.cjs <parent-key> [--dry-run]
 *
 * 동작:
 *   - parent = K 인 모든 child 이슈 fetch
 *   - summary 기준 그룹화
 *   - 중복 그룹: 키 번호 가장 작은 것만 보존, 나머지 모두 삭제 (DELETE /issue/{k})
 *   - 안전: dry-run이 기본 권장. 결과 .dedupe-result.json 저장
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PROXY = 'http://localhost:3001/api';
const RESULT_FILE = path.join(process.cwd(), '.dedupe-result.json');

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flags = new Set(args.filter((a) => a.startsWith('--')));
const DRY_RUN = flags.has('--dry-run');

if (positional.length < 1) {
    console.error('Usage: dedupe-jira-children.cjs <parent-key> [--dry-run]');
    process.exit(1);
}
const PARENT_KEY = positional[0];
console.log('[args] parent:', PARENT_KEY, '— dry-run:', DRY_RUN);

function keyNum(k) {
    const m = k.match(/-(\d+)$/);
    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

async function fetchAllChildren() {
    const all = [];
    let token;
    let guard = 0;
    while (true) {
        const body = {
            jql: `parent = ${PARENT_KEY}`,
            fields: ['summary', 'created', 'assignee'],
            maxResults: 100,
        };
        if (token) body.nextPageToken = token;
        const r = await axios.post(`${PROXY}/search/jql`, body, { timeout: 20000 });
        const issues = r.data?.issues ?? [];
        all.push(...issues);
        token = r.data?.nextPageToken;
        if (r.data?.isLast || !token || issues.length < 100) break;
        if (++guard > 30) break;
    }
    return all;
}

async function main() {
    console.log(`[fetch] children of ${PARENT_KEY} ...`);
    const children = await fetchAllChildren();
    console.log(`[fetch] ${children.length}건`);

    // summary 기준 그룹화
    const bySum = new Map();
    for (const i of children) {
        const s = i.fields?.summary ?? '';
        const arr = bySum.get(s) ?? [];
        arr.push({ key: i.key, summary: s, created: i.fields?.created, assignee: i.fields?.assignee?.displayName });
        bySum.set(s, arr);
    }

    const groups = [...bySum.values()];
    const dupGroups = groups.filter((g) => g.length > 1);
    const toDelete = [];
    for (const g of dupGroups) {
        // 키 번호 가장 작은 것 보존, 나머지 삭제 대상
        const sorted = g.sort((a, b) => keyNum(a.key) - keyNum(b.key));
        const keep = sorted[0];
        const remove = sorted.slice(1);
        toDelete.push(...remove.map((r) => ({ ...r, kept: keep.key })));
    }

    console.log(`[analyze] 그룹 ${groups.length}, 중복 그룹 ${dupGroups.length}, 삭제 대상 ${toDelete.length}`);

    if (DRY_RUN) {
        console.log('\n[dry-run] 첫 5건 미리보기:');
        toDelete.slice(0, 5).forEach((d) => {
            console.log(`  DELETE ${d.key} (keep ${d.kept}) — ${d.summary.slice(0, 60)}`);
        });
        console.log('\n[dry-run] 완료. 실행하려면 --dry-run 제거.');
        return;
    }

    // 실제 삭제
    const result = { deleted: [], failed: [] };
    let i = 0;
    for (const d of toDelete) {
        i++;
        try {
            await axios.delete(`${PROXY}/issue/${d.key}`, { timeout: 15000 });
            result.deleted.push(d);
            if (i % 20 === 0) {
                console.log(`[delete] ${i}/${toDelete.length}`);
                fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2), 'utf8');
            }
        } catch (e) {
            result.failed.push({ ...d, error: e.response?.data ?? e.message });
        }
    }
    fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2), 'utf8');
    console.log(`\n[done] 삭제 ${result.deleted.length}, 실패 ${result.failed.length}`);
    console.log(`[done] 상세: ${RESULT_FILE}`);
}

main().catch((e) => {
    console.error('[fatal]', e.message);
    if (e.response?.data) console.error(JSON.stringify(e.response.data, null, 2));
    process.exit(1);
});
