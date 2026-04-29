/**
 * v2: BE/FE 분리 휴리스틱.
 *
 * BE: 외부 통합·트랜잭션·비즈니스 로직 무게 큼
 * FE: 외부 통합 가중 감소, UI 복잡도(차트·실시간·트리·드래그) 가중
 */

const fs = require('fs');
const path = require('path');

const TMP = 'C:/Users/jwchoo/AppData/Local/Temp';

const cacheFile = path.join(TMP, 'igmu538_children.json');
const children = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

// ── BE 룰 ─────────────────────────────────────────────────
const BE_RULES = {
    // Hard +3: 외부 통합·실행
    hardKeywords: [
        'jenkins', '젠킨스', 'sonar', 'sonarqube', 'junit', 'gitea', 'harbor', 'k8s', 'rancher', 'argocd', 'argo',
        '파이프라인 실행', '빌드 실행', '배포 실행', '실행 모니터링',
        '워크플로우',
    ],
    // Medium +1.5
    mediumKeywords: [
        '결재 라인', '결재 승인', '결재 반려', '결재 처리',
        '배포 시퀀스', '연계', '연동', '매핑',
        '템플릿', '아티팩트', '결과물',
        '배포 작업', '빌드 작업', '테스트 작업',
        '검증', '권한', '인증',
        '상태 변경', '실행 이력', '구성 정보',
    ],
    // Easy -1
    easyKeywords: ['목록 조회', '상세 조회', '단건 조회', '엑셀다운로드', '카운트', '집계', '코드 조회'],
    // 동작별
    actionWeights: {
        '실행': 1, '생성': 0.5, '모니터링': 1.5, '이력': 1, '결과': 0.5,
        '조회': -0.5, '목록': -0.5, '상세': -0.3,
        '등록': -0.3, '수정': -0.3, '삭제': -0.2,
    },
    baseline: 2,
    threshold: { hard: 5, medium: 3 },
};

// ── FE 룰 ─────────────────────────────────────────────────
const FE_RULES = {
    // Hard +2.5 (UI 전용)
    hardKeywords: [
        '실시간', '모니터링', '대시보드',
        '워크플로우',  // 빌더 UI
        '드래그', '빌더',
        '트리', '계층',
        '차트', '그래프', '시각화',
    ],
    // Medium +1.5 (외부 통합 — UI는 BE보다 가벼움)
    mediumKeywords: [
        'jenkins', '젠킨스', 'sonar', 'sonarqube', 'junit', 'gitea', 'harbor', 'argocd',
        '파이프라인 실행', '빌드 실행', '배포 실행',
        '결재', '승인', '반려',
        '연계', '연동',
        '매핑',
    ],
    // Light +1
    lightKeywords: [
        '템플릿', '템플릿 선택',
        '필터', '검색', '정렬',
        '페이징', '페이지',
        '탭',
    ],
    // Easy -0.5 (단순 폼은 그래도 컴포넌트 필요)
    easyKeywords: ['단건 조회', '엑셀다운로드', '코드 조회'],
    actionWeights: {
        '실행': 0.5, '생성': 0, '모니터링': 1.5, '이력': 0.5, '결과': 0.5,
        '조회': -0.3, '목록': 0, '상세': 0,  // 목록·상세는 UI 컴포넌트 자체
        '등록': 0, '수정': 0, '삭제': -0.3,
    },
    baseline: 1.5,  // FE는 baseline 약간 낮음 (폼은 라이브러리로)
    threshold: { hard: 4.5, medium: 2.8 },
};

function classify(summary, isBE) {
    const rules = isBE ? BE_RULES : FE_RULES;
    const s = summary.toLowerCase();
    let score = rules.baseline;
    const matched = { hard: [], medium: [], light: [], easy: [] };

    for (const k of rules.hardKeywords) {
        if (s.includes(k.toLowerCase())) {
            score += isBE ? 3 : 2.5;
            matched.hard.push(k);
        }
    }
    for (const k of rules.mediumKeywords) {
        if (s.includes(k.toLowerCase())) {
            score += 1.5;
            matched.medium.push(k);
        }
    }
    if (rules.lightKeywords) {
        for (const k of rules.lightKeywords) {
            if (s.includes(k.toLowerCase())) { score += 1; matched.light.push(k); }
        }
    }
    for (const k of rules.easyKeywords) {
        if (s.includes(k.toLowerCase())) {
            score += isBE ? -1 : -0.5;
            matched.easy.push(k);
        }
    }
    // 동작 가중
    for (const [action, w] of Object.entries(rules.actionWeights)) {
        if (s.includes(action)) score += w;
    }

    let level;
    if (score >= rules.threshold.hard) level = '상';
    else if (score >= rules.threshold.medium) level = '중';
    else level = '하';

    return { level, score: +score.toFixed(1), matched };
}

const results = children.map((c) => {
    const isBE = c.summary.startsWith('[B/E]');
    const isFE = c.summary.startsWith('[F/E]');
    return {
        key: c.key,
        summary: c.summary,
        assignee: c.assignee,
        isBE, isFE,
        ...classify(c.summary, isBE),
    };
});

const dist = { 상: 0, 중: 0, 하: 0 };
const beDist = { 상: 0, 중: 0, 하: 0 };
const feDist = { 상: 0, 중: 0, 하: 0 };
for (const r of results) {
    dist[r.level]++;
    if (r.isBE) beDist[r.level]++;
    else if (r.isFE) feDist[r.level]++;
}
const beTotal = beDist.상 + beDist.중 + beDist.하;
const feTotal = feDist.상 + feDist.중 + feDist.하;

console.log(`총 ${results.length}건`);
console.log(`전체: 상 ${dist.상} (${Math.round(dist.상/results.length*100)}%) / 중 ${dist.중} (${Math.round(dist.중/results.length*100)}%) / 하 ${dist.하} (${Math.round(dist.하/results.length*100)}%)`);
console.log(`\n[BE] 총 ${beTotal}건`);
console.log(`  상 ${beDist.상} (${Math.round(beDist.상/beTotal*100)}%) / 중 ${beDist.중} (${Math.round(beDist.중/beTotal*100)}%) / 하 ${beDist.하} (${Math.round(beDist.하/beTotal*100)}%)`);
console.log(`\n[FE] 총 ${feTotal}건`);
console.log(`  상 ${feDist.상} (${Math.round(feDist.상/feTotal*100)}%) / 중 ${feDist.중} (${Math.round(feDist.중/feTotal*100)}%) / 하 ${feDist.하} (${Math.round(feDist.하/feTotal*100)}%)`);

// 비교 분석 — 같은 task의 BE vs FE 등급 차이
const summaryNoPrefix = (s) => s.replace(/^\[(B\/E|F\/E)\]\s*/, '').trim();
const pairs = new Map();
for (const r of results) {
    const k = summaryNoPrefix(r.summary);
    const prev = pairs.get(k) ?? {};
    if (r.isBE) prev.be = r;
    if (r.isFE) prev.fe = r;
    pairs.set(k, prev);
}
const diffPairs = [];
for (const [k, p] of pairs) {
    if (p.be && p.fe && p.be.level !== p.fe.level) {
        diffPairs.push({ summary: k, be: p.be.level, fe: p.fe.level, beScore: p.be.score, feScore: p.fe.score });
    }
}
console.log(`\n=== BE vs FE 등급 차이 (${diffPairs.length}건) — 처음 10건 ===`);
for (const d of diffPairs.slice(0, 10)) {
    console.log(`  BE=${d.be} (${d.beScore}) FE=${d.fe} (${d.feScore})  | ${d.summary.slice(0, 60)}`);
}

// 저장
fs.writeFileSync(
    path.join(TMP, 'difficulty_estimate_v2.json'),
    JSON.stringify(results.map((r) => ({ key: r.key, summary: r.summary, assignee: r.assignee, level: r.level, score: r.score })), null, 2),
    'utf8'
);
console.log(`\nsaved → difficulty_estimate_v2.json`);
