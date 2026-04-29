/**
 * IGMU-538 자식 312건의 난이도 customfield_11624 일괄 등록.
 *
 * 입력: difficulty_estimate.json (estimate-difficulty.cjs 결과)
 * 동작: PUT /issue/{key} { fields: { customfield_11624: { value: '상'|'중'|'하' } } }
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PROXY = 'http://localhost:3001/api';
const TMP = 'C:/Users/jwchoo/AppData/Local/Temp';
const RESULT_FILE = path.join(process.cwd(), '.difficulty-update-result.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArgIdx = args.indexOf('--limit');
const LIMIT = limitArgIdx >= 0 ? parseInt(args[limitArgIdx + 1], 10) : null;

(async () => {
    const plan = JSON.parse(fs.readFileSync(path.join(TMP, 'difficulty_estimate.json'), 'utf8'));
    const work = LIMIT ? plan.slice(0, LIMIT) : plan;
    console.log(`[args] dry-run: ${DRY_RUN}, limit: ${LIMIT ?? 'none'}`);
    console.log(`[plan] 대상: ${work.length}/${plan.length}건`);

    // 분포 출력
    const dist = work.reduce((m, p) => { m[p.level] = (m[p.level] ?? 0) + 1; return m; }, {});
    console.log(`[dist] 상:${dist['상']||0} 중:${dist['중']||0} 하:${dist['하']||0}`);

    const result = { updated: [], failed: [] };
    let i = 0;
    for (const p of work) {
        i++;
        const payload = {
            fields: { customfield_11624: { value: p.level } },
        };

        if (DRY_RUN) {
            if (i <= 3) console.log(`DRY  [${i}/${work.length}] ${p.key} → ${p.level} (${p.summary.slice(0,50)})`);
            else if (i === 4) console.log('  ...');
            continue;
        }

        try {
            await axios.put(`${PROXY}/issue/${p.key}`, payload, { timeout: 15000 });
            result.updated.push({ key: p.key, level: p.level });
            if (i % 25 === 0) {
                console.log(`[${i}/${work.length}] OK`);
                fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2), 'utf8');
            }
        } catch (e) {
            const err = e.response?.data ?? e.message;
            console.log(`FAIL ${p.key} (${p.level}) — ${JSON.stringify(err).slice(0, 200)}`);
            result.failed.push({ key: p.key, level: p.level, error: err });
        }
    }

    if (!DRY_RUN) {
        fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2), 'utf8');
        console.log(`\n[done] 성공 ${result.updated.length}, 실패 ${result.failed.length}`);
        console.log(`[done] 결과: ${RESULT_FILE}`);
    } else {
        console.log(`\n[dry-run] 완료. 실행하려면 --dry-run 제거.`);
    }
})().catch((e) => {
    console.error('[fatal]', e.message);
    if (e.response?.data) console.error(JSON.stringify(e.response.data, null, 2));
    process.exit(1);
});
