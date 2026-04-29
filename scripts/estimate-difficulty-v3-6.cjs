/**
 * v3.6: BE 비즈니스 로직 차원 + FE 엄격 + AI 도구 활용 가중.
 *
 * v3 → v3.5 → v3.6 진화:
 *   1) BE 비즈니스 로직 복잡도 (단순 API vs 어려운 로직)
 *   2) FE baseline 1.5 → 1.0, 단순 CRUD 감점 강화
 *   3) **AI 개발 도구 활용 가중 (NEW)** —
 *      AI가 잘 처리하는 정형 작업(보일러플레이트·CRUD·매핑·간단 폼)은 추가 감점.
 *      AI 도움 제한적 영역(외부 통합·동시성·도메인 정책)은 변동 없음.
 *
 * AI 활용 ROI 가정 (실측 기반):
 *   - DTO 변환·entity 매핑: AI 90% 자동 → -1.0
 *   - Controller-Service-Repo CRUD: AI 80% → -0.7
 *   - 단순 UI 폼·테이블·필터: AI 75% → -0.5
 *   - 표준 페이징·정렬: AI 70% → -0.4
 *   - 외부 시스템 통합: AI 30% (context 부족) → 0
 *   - 비즈니스 도메인 룰: AI 20% → 0
 *   - 동시성·실시간: AI 10% → 0
 */

const fs = require('fs');
const path = require('path');

const TMP = 'C:/Users/jwchoo/AppData/Local/Temp';
const cacheFile = path.join(TMP, 'igmu538_children.json');
const children = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

// ── 도구별 본질 난이도 ───────────────────────────────────────
const TOOL_WEIGHT = {
    jenkins:   { read: 1.5, exec: 4,   monitor: 5 },
    젠킨스:    { read: 1.5, exec: 4,   monitor: 5 },
    sonar:     { read: 1,   exec: 2,   monitor: 3 },
    sonarqube: { read: 1,   exec: 2,   monitor: 3 },
    junit:     { read: 0.5, exec: 0,   monitor: 2 },
    gitea:     { read: 1,   exec: 2.5, monitor: 3 },
    gitlab:    { read: 1,   exec: 2.5, monitor: 3 },
    harbor:    { read: 0.5, exec: 1.5, monitor: 2 },
    nexus:     { read: 0.5, exec: 1,   monitor: 2 },
    argocd:    { read: 1.5, exec: 4,   monitor: 4 },
    k8s:       { read: 2,   exec: 4,   monitor: 4 },
    rancher:   { read: 2,   exec: 3.5, monitor: 4 },
    redpanda:  { read: 2,   exec: 3,   monitor: 4 },
};

// ── BE 비즈니스 로직 복잡도 (NEW) ────────────────────────────────
// 도구 외 일반 BE 작업의 "단순 API vs 어려운 로직" 구분
const BE_BIZ_HARD = {
    // 트랜잭션·동시성·일관성
    '트랜잭션': 2, '잠금': 2.5, '동시성': 2.5, '낙관적': 2, '비관적': 2.5,
    '의존성': 1.5, '참조 무결성': 2, '연쇄': 1.5, '캐스케이드': 1.5,
    // 상태 머신·전이
    '상태 머신': 3, '상태 전이': 2.5, '상태 변경': 1.5, '상태 흐름': 2.5,
    // 권한·정책
    'rbac': 2.5, '롤': 1.5, '역할': 1.5, '정책': 2, '권한 매핑': 2,
    '권한 검증': 2, '인가': 2,
    // 이벤트·메시징·비동기
    '이벤트 발행': 2.5, '메시지 큐': 2.5, '카프카': 2.5, 'kafka': 2.5,
    '비동기 처리': 2, '백그라운드': 1.5, '스케줄': 1.5,
    // 감사·이력·로그
    '감사 로그': 1.5, '변경 이력': 1.5, '이력 추적': 1.5,
    // 검증
    '복잡 검증': 2, '교차 검증': 2, '비즈니스 검증': 2,
    // 워크플로 엔진
    '워크플로 엔진': 3, 'bpmn': 3, 'state machine': 3,
    // 결재
    '결재 라인': 2.5, '결재 트리': 2.5, '결재 위임': 2,
    // 데이터 처리
    '대량 처리': 2, '벌크': 1.5, '배치': 1.5, '집계': 1, 'aggregation': 1.5,
    // 트리·계층·재귀
    '재귀': 1.5, '계층': 1, '트리 구조': 1.5,
    // 통합·오케스트레이션
    '오케스트레이션': 2.5, '통합 작업': 1.5,
};

// ── BE 단순 API 패턴 (감점) ────────────────────────────────────
const BE_SIMPLE_API = [
    /^.+\b(목록|상세|단건) 조회\b/,
    /^.+\b(코드|옵션) 조회\b/,
    /^.+\b카운트\b$/,
    /^.+\b(다운로드|엑셀)\b/,
    /^.+\b단순 .+\b/,
];

// ── 동작 ─────────────────────────────────────────────────
function actionScore(summary) {
    if (/모니터링|실시간|로그 적재|로그 스트림|webhook|web hook/i.test(summary)) return { type: 'monitor', score: 4 };
    if (/실행 결과|실행 중지|실행 (시작|반환|로그)|실행 순서|실행 모니터|파이프라인 실행|빌드 실행|배포 실행/.test(summary)) return { type: 'exec', score: 3 };
    if (/동기화|연계|연동|orchestrat/i.test(summary)) return { type: 'sync', score: 3 };
    if (/검증/.test(summary)) return { type: 'validate', score: 2 };
    if (/등록|생성/.test(summary)) return { type: 'create', score: 1 };
    if (/수정/.test(summary)) return { type: 'update', score: 0.5 };
    if (/삭제/.test(summary)) return { type: 'delete', score: 1 };
    if (/(목록|상세|단건) 조회/.test(summary)) return { type: 'read', score: 0 };
    if (/조회/.test(summary)) return { type: 'read', score: 0.3 };
    if (/다운로드|엑셀/.test(summary)) return { type: 'simple', score: -0.5 };
    return { type: 'other', score: 0.5 };
}

// ── 도메인 본질 ──────────────────────────────────────────────
function domainScore(summary) {
    let s = 0;
    const matched = [];
    if (/워크플로우/i.test(summary)) { s += 3; matched.push('워크플로우'); }
    if (/결재 라인|결재 승인|결재 반려|결재 처리/i.test(summary)) { s += 2.5; matched.push('결재'); }
    if (/파이프라인 (실행|생성|수정)/i.test(summary)) { s += 2; matched.push('파이프라인'); }
    if (/(배포|빌드) (실행|시퀀스|작업)/i.test(summary)) { s += 1.5; matched.push('배포·빌드'); }
    if (/매핑|연결/i.test(summary)) { s += 1; matched.push('매핑'); }
    if (/템플릿/i.test(summary)) { s += 0.8; matched.push('템플릿'); }
    if (/권한|인증|롤|역할/i.test(summary)) { s += 1.5; matched.push('권한'); }
    if (/결과물|아티팩트/i.test(summary)) { s += 1; matched.push('결과물'); }
    if (/티켓 (실행|로그)/i.test(summary)) { s += 1.5; matched.push('티켓 실행'); }
    return { score: s, matched };
}

// ── BE 비즈니스 로직 가중 (NEW) ────────────────────────────────
function bizLogicScore(summary, isBE) {
    if (!isBE) return { score: 0, matched: [] };
    const lower = summary.toLowerCase();
    let s = 0;
    const matched = [];
    for (const [pat, weight] of Object.entries(BE_BIZ_HARD)) {
        if (lower.includes(pat.toLowerCase())) { s += weight; matched.push(pat); }
    }
    // 단순 API 패턴 감점
    for (const re of BE_SIMPLE_API) {
        if (re.test(summary)) { s -= 0.5; break; }
    }
    return { score: s, matched };
}

// ── 도구 가중 ────────────────────────────────────────────────
function toolScore(summary, isBE) {
    const lower = summary.toLowerCase();
    let s = 0;
    const matched = [];
    const action = actionScore(summary);
    for (const [tool, w] of Object.entries(TOOL_WEIGHT)) {
        if (lower.includes(tool)) {
            const phase = action.type === 'monitor' ? 'monitor'
                        : action.type === 'exec' || action.type === 'sync' ? 'exec'
                        : 'read';
            const baseScore = w[phase];
            const adj = isBE ? baseScore : baseScore * 0.5;
            s += adj;
            matched.push(`${tool}·${phase}=${adj}`);
            break;
        }
    }
    return { score: s, matched };
}

// ── UI 전용 (FE만) ─────────────────────────────────────────
function uiScore(summary, isFE) {
    if (!isFE) return { score: 0, matched: [] };
    let s = 0;
    const matched = [];
    if (/실시간|모니터링|대시보드/.test(summary)) { s += 2; matched.push('실시간 UI'); }
    if (/워크플로우 (등록|수정)|빌더|드래그|d&d/i.test(summary)) { s += 2.5; matched.push('빌더 UI'); }
    if (/트리|계층|디렉토리/.test(summary)) { s += 1; matched.push('트리'); }   // v3.5: 1.5 → 1
    if (/차트|그래프|시각화/.test(summary)) { s += 1; matched.push('차트'); }    // v3.5: 1.5 → 1
    if (/필터|검색|정렬|페이징/.test(summary)) { s += 0.3; matched.push('필터'); } // v3.5: 0.5 → 0.3
    return { score: s, matched };
}

// ── 단순 CRUD 감점 (FE 더 엄격) ───────────────────────────────
function simpleAdj(summary, isFE) {
    if (/(목록|상세|단건) 조회|단건 삭제|단건 수정|엑셀다운로드|다운로드/.test(summary)) {
        return isFE ? -1.5 : -1;
    }
    return 0;
}

// ── AI 개발 도구 활용 가중 (NEW v3.6) ────────────────────────
// AI가 잘 처리하는 정형 패턴은 추가 감점, 외부/도메인은 변동 없음
function aiBoost(summary, action, hasToolIntegration, bizScore) {
    // AI 도움 제한적 영역 — 가중 X
    if (action.type === 'monitor' || action.type === 'exec' || action.type === 'sync') return { score: 0, reason: 'AI 도움 제한 (외부 통합·실행·모니터링)' };
    if (hasToolIntegration && action.type !== 'read') return { score: 0, reason: 'AI 도움 제한 (도구 통합)' };
    if (bizScore >= 2) return { score: 0, reason: 'AI 도움 제한 (복잡 비즈니스 로직)' };

    // AI가 잘 처리하는 정형 작업 — 감점 적용
    let s = 0;
    const reasons = [];

    // 단순 CRUD 패턴
    if (/^.+ (등록|생성)$/.test(summary)) { s -= 0.5; reasons.push('AI: 단순 등록'); }
    if (/^.+ 수정$/.test(summary)) { s -= 0.3; reasons.push('AI: 단순 수정'); }
    if (/^.+ 삭제$/.test(summary)) { s -= 0.3; reasons.push('AI: 단순 삭제'); }

    // 매핑성 작업
    if (/매핑$/.test(summary) && bizScore < 1) { s -= 0.4; reasons.push('AI: 매핑 보일러플레이트'); }

    // 코드성 데이터·옵션 조회
    if (/(코드|옵션|타입) 조회/.test(summary)) { s -= 0.4; reasons.push('AI: 코드성 데이터'); }

    // 다운로드·엑셀
    if (/다운로드|엑셀/.test(summary)) { s -= 0.3; reasons.push('AI: 데이터 export 표준 패턴'); }

    return { score: s, reason: reasons.join(', ') };
}

function classify(summary) {
    const isBE = summary.startsWith('[B/E]');
    const isFE = summary.startsWith('[F/E]');
    const baseline = isBE ? 2 : 1.0;

    const action = actionScore(summary);
    const domain = domainScore(summary);
    const tool = toolScore(summary, isBE);
    const ui = uiScore(summary, isFE);
    const biz = bizLogicScore(summary, isBE);
    const simple = simpleAdj(summary, isFE);
    const ai = aiBoost(summary, action, tool.matched.length > 0, biz.score);  // NEW v3.6

    const total = baseline + action.score + domain.score + tool.score + ui.score + biz.score + simple + ai.score;

    let level;
    if (total >= 6) level = '상';
    else if (total >= 3.5) level = '중';
    else level = '하';

    return {
        level, score: +total.toFixed(1),
        breakdown: {
            baseline,
            action: action.score, domain: domain.score, tool: tool.score,
            ui: ui.score, biz: biz.score, simple, ai: ai.score,  // NEW
            actionType: action.type,
            bizMatched: biz.matched,
            toolMatched: tool.matched,
            aiReason: ai.reason,
        },
        isBE, isFE,
    };
}

// ── 메인 ──────────────────────────────────────────────────
const results = children.map((c) => ({
    key: c.key, summary: c.summary, assignee: c.assignee, ...classify(c.summary),
}));

const dist = { 상:0, 중:0, 하:0 };
const beDist = { 상:0, 중:0, 하:0 };
const feDist = { 상:0, 중:0, 하:0 };
for (const r of results) {
    dist[r.level]++;
    if (r.isBE) beDist[r.level]++;
    if (r.isFE) feDist[r.level]++;
}
const t = results.length, beT = beDist.상+beDist.중+beDist.하, feT = feDist.상+feDist.중+feDist.하;

console.log(`총 ${t}건`);
console.log(`전체: 상 ${dist.상} (${Math.round(dist.상/t*100)}%) / 중 ${dist.중} (${Math.round(dist.중/t*100)}%) / 하 ${dist.하} (${Math.round(dist.하/t*100)}%)`);
console.log(`\n[BE] ${beT}건  상 ${beDist.상} (${Math.round(beDist.상/beT*100)}%) / 중 ${beDist.중} (${Math.round(beDist.중/beT*100)}%) / 하 ${beDist.하} (${Math.round(beDist.하/beT*100)}%)`);
console.log(`[FE] ${feT}건  상 ${feDist.상} (${Math.round(feDist.상/feT*100)}%) / 중 ${feDist.중} (${Math.round(feDist.중/feT*100)}%) / 하 ${feDist.하} (${Math.round(feDist.하/feT*100)}%)`);

// 도구별 분포
const toolMatrix = {};
for (const r of results) {
    for (const t of r.breakdown.toolMatched) {
        const [name] = t.split('·');
        if (!toolMatrix[name]) toolMatrix[name] = { 상:0, 중:0, 하:0 };
        toolMatrix[name][r.level]++;
    }
}
console.log('\n=== 도구별 분포 ===');
for (const [name, d] of Object.entries(toolMatrix)) {
    const tt = d.상+d.중+d.하;
    console.log(`  ${name.padEnd(10)} ${tt}건: 상=${d.상} 중=${d.중} 하=${d.하}`);
}

// BE 비즈니스 로직 매칭 분포
const bizCounter = {};
for (const r of results) {
    if (!r.isBE) continue;
    for (const m of r.breakdown.bizMatched ?? []) {
        bizCounter[m] = (bizCounter[m] ?? 0) + 1;
    }
}
console.log('\n=== BE 비즈니스 로직 키워드 매칭 (top) ===');
Object.entries(bizCounter).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([k,n])=>console.log(`  ${k}: ${n}건`));

// 액션별 분포
const actionDist = {};
for (const r of results) {
    const a = r.breakdown.actionType;
    if (!actionDist[a]) actionDist[a] = { 상:0, 중:0, 하:0, total:0 };
    actionDist[a][r.level]++; actionDist[a].total++;
}
console.log('\n=== 액션별 분포 ===');
Object.entries(actionDist).sort((a,b)=>b[1].total-a[1].total).forEach(([a,d])=>console.log(`  ${a.padEnd(10)} ${d.total}건: 상=${d.상} 중=${d.중} 하=${d.하}`));

// 비교: v3 vs v3.5
const v3 = JSON.parse(fs.readFileSync(path.join(TMP, 'difficulty_estimate_v3.json'), 'utf8'));
const v3Map = new Map(v3.map((r) => [r.key, r.level]));
let changes = { upper: 0, lower: 0, same: 0 };
const changeDetail = [];
for (const r of results) {
    const old = v3Map.get(r.key);
    if (!old) continue;
    if (old === r.level) changes.same++;
    else {
        const order = { 하:1, 중:2, 상:3 };
        if (order[r.level] > order[old]) changes.upper++;
        else changes.lower++;
        changeDetail.push({ key: r.key, summary: r.summary.slice(0,60), v3: old, v35: r.level });
    }
}
console.log(`\n=== v3 → v3.5 변화 ===`);
console.log(`  동일: ${changes.same}건, 상승: ${changes.upper}건, 하락: ${changes.lower}건`);
if (changeDetail.length > 0) {
    console.log(`  변화 샘플 5건:`);
    changeDetail.slice(0, 5).forEach((c) => console.log(`    ${c.key} ${c.v3}→${c.v35} | ${c.summary}`));
}

// AI 가중 적용된 건수
const aiAdjusted = results.filter((r) => r.breakdown.ai !== 0);
console.log(`\n=== AI 가중 적용 ===`);
console.log(`적용된 이슈: ${aiAdjusted.length}건`);
console.log(`  평균 감점: ${(aiAdjusted.reduce((s, r) => s + r.breakdown.ai, 0) / aiAdjusted.length).toFixed(2)}점`);
console.log(`AI 감점 샘플 5건:`);
aiAdjusted.slice(0, 5).forEach((r) => {
    console.log(`  ${r.key} [${r.level}, score=${r.score}, ai=${r.breakdown.ai}] ${r.summary.slice(0, 50)}`);
    console.log(`    reason: ${r.breakdown.aiReason}`);
});

// 저장
fs.writeFileSync(
    path.join(TMP, 'difficulty_estimate_v3_6.json'),
    JSON.stringify(results.map((r) => ({
        key: r.key, summary: r.summary, assignee: r.assignee, level: r.level, score: r.score,
    })), null, 2),
    'utf8'
);
console.log('\nsaved → difficulty_estimate_v3_6.json');
