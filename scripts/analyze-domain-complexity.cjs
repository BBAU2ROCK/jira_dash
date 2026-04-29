/**
 * 04_TROMBONE_API_FIRST 도메인별 복잡도 측정.
 * controller/service/dto 파일 수 + 라인 수 → 도메인 복잡도 점수.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve('D:/01_project/04_TROMBONE_API_FIRST/services/api-first/src/main/java/com/trombone/apifirst/domain');
const domainStats = new Map();

function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.java')) {
            const rel = path.relative(ROOT, dir).replaceAll('\\', '/').split('/');
            if (rel.length === 0 || !rel[0]) continue;
            const domainKey = rel.slice(0, Math.min(rel.length, 3)).join('/');
            const s = domainStats.get(domainKey) ?? { controllers: 0, services: 0, dtos: 0, lines: 0 };
            try {
                s.lines += fs.readFileSync(full, 'utf8').split('\n').length;
            } catch {}
            const dlow = dir.toLowerCase();
            if (dlow.includes('controller') || /Controller\.java$/.test(e.name)) s.controllers++;
            else if (dlow.includes('application') || dlow.includes('service') || /Service\.java$/.test(e.name)) s.services++;
            else if (dlow.includes('dto')) s.dtos++;
            domainStats.set(domainKey, s);
        }
    }
}

walk(ROOT);

const scored = [...domainStats.entries()]
    .map(([k, s]) => ({ key: k, score: s.lines * 0.001 + s.controllers * 5 + s.services * 3 + s.dtos * 1, ...s }))
    .sort((a, b) => b.score - a.score);

console.log(`도메인 ${scored.length}개\n--- 상위 25 ---`);
for (const r of scored.slice(0, 25)) {
    console.log(`  ${r.score.toFixed(1).padStart(7)}  ${r.key.padEnd(45)}  ctrl=${r.controllers} svc=${r.services} dto=${r.dtos} lines=${r.lines}`);
}

// JSON 저장
fs.writeFileSync(
    path.resolve('C:/Users/jwchoo/AppData/Local/Temp/domain_complexity.json'),
    JSON.stringify(scored, null, 2),
    'utf8'
);
console.log('\nsaved → domain_complexity.json');
