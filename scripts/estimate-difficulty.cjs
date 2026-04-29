/**
 * IGMU-538 자식 313건의 난이도 추정.
 *
 * 휴리스틱:
 *   1) Summary에서 도메인 키워드 추출 → 04_TROMBONE_API_FIRST 도메인 매칭
 *   2) 동작 키워드(목록조회/등록/수정/실행/모니터링/...) 분석
 *   3) 외부 통합·워크플로 키워드 가중
 *   4) BE+FE 분리 — BE는 비즈니스 로직, FE는 UI 복잡도 별도 가중
 *
 * 난이도 룰:
 *   - 상 (Hard, 5+점)   : 외부 통합·워크플로·실행·모니터링·보안
 *   - 중 (Medium, 3-4점): 다중 엔티티·매핑·복합 비즈니스
 *   - 하 (Easy, 0-2점)  : 단순 CRUD·코드성 데이터·목록/상세
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PROXY = 'http://localhost:3001/api';
const TMP = 'C:/Users/jwchoo/AppData/Local/Temp';

(async () => {
    // 1. IGMU-538 자식 fetch (이미 cache 있음)
    let children;
    const cacheFile = path.join(TMP, 'igmu538_children.json');
    if (fs.existsSync(cacheFile) && (Date.now() - fs.statSync(cacheFile).mtimeMs) < 600_000) {
        children = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        console.log(`[cache] ${children.length}건`);
    } else {
        const all = [];
        let token;
        for (let i = 0; i < 10; i++) {
            const body = { jql: 'parent = IGMU-538', fields: ['summary', 'assignee', 'customfield_11482'], maxResults: 100 };
            if (token) body.nextPageToken = token;
            const r = await axios.post(`${PROXY}/search/jql`, body, { timeout: 20000 });
            all.push(...(r.data.issues ?? []));
            token = r.data.nextPageToken;
            if (r.data.isLast || !token || (r.data.issues ?? []).length < 100) break;
        }
        children = all.map((i) => ({
            key: i.key,
            summary: i.fields.summary,
            assignee: i.fields.assignee?.displayName ?? null,
            sub_assignees: (i.fields.customfield_11482 ?? []).map((u) => u.displayName),
        }));
        fs.writeFileSync(cacheFile, JSON.stringify(children, null, 2), 'utf8');
        console.log(`[fetch] ${children.length}건`);
    }

    // 2. 키워드 매핑 — Summary 기반
    const HARD_KEYWORDS = [
        // 외부 통합
        'jenkins', '젠킨스', 'sonar', 'sonarqube', 'junit', 'gitea', 'harbor', 'k8s', 'rancher',
        // 워크플로/파이프라인
        '워크플로우', '파이프라인 실행', '파이프라인 모니터링', '빌드 실행', '배포 실행', '실행 모니터링',
        // 보안/권한
        '인증', '권한', '결재 라인', '결재 승인', '결재 반려',
        // 비동기/상태
        '실시간', '모니터링', '로그 실시간', '비동기',
        // 복합 처리
        '검증', '연계', '연동',
    ];

    const MEDIUM_KEYWORDS = [
        '결재 목록', '결재 ', '승인', '반려',
        '워크플로우 등록', '워크플로우 수정', '워크플로우 컴포넌트',
        '매핑', '연결', '관계',
        '배포 작업', '빌드 작업', '테스트 작업', '파이프라인 ',
        '템플릿',
        '업무 코드 등록', '업무 코드 수정', '코드 매핑',
        '결과물', '아티팩트',
        '구성 정보',
        '필터', '검색',
        '상태 변경', '실행 이력',
    ];

    const EASY_KEYWORDS = [
        '목록 조회', '상세 조회', '단건 조회',
        '엑셀다운로드', '다운로드',
        '단건 삭제', '단건 수정',
        '간단', '코드 조회',
        '카운트', '집계',
    ];

    // BE/FE 가중치 (UI 복잡도 다름)
    function classify(summary) {
        const s = summary.toLowerCase();
        let score = 0;
        const matched = { hard: [], medium: [], easy: [] };
        for (const k of HARD_KEYWORDS) if (s.includes(k.toLowerCase())) { score += 3; matched.hard.push(k); }
        for (const k of MEDIUM_KEYWORDS) if (s.includes(k.toLowerCase())) { score += 1.5; matched.medium.push(k); }
        for (const k of EASY_KEYWORDS) if (s.includes(k.toLowerCase())) { score -= 1; matched.easy.push(k); }

        // BE/FE 별 가중
        const isBE = summary.startsWith('[B/E]');
        const isFE = summary.startsWith('[F/E]');

        // 동작 키워드 — 단순 CRUD는 마이너스
        if (/\b조회\b|\b목록\b|\b상세\b/.test(summary)) score -= 0.5;
        if (/\b등록\b|\b수정\b|\b삭제\b/.test(summary)) score -= 0.3;
        // 복합 행위 — 플러스
        if (/\b실행\b|\b생성\b/.test(summary)) score += 1;
        if (/\b모니터링\b|\b이력\b|\b결과\b/.test(summary)) score += 1.5;

        // 정규화 — 0~10 범위
        const adj = score + 2; // 기본 baseline
        let level;
        if (adj >= 5) level = '상';
        else if (adj >= 3) level = '중';
        else level = '하';

        return { level, score: +adj.toFixed(1), matched, isBE, isFE };
    }

    // 3. 각 이슈 분류
    const results = children.map((c) => ({
        key: c.key,
        summary: c.summary,
        assignee: c.assignee,
        ...classify(c.summary),
    }));

    // 4. 분포 통계
    const distribution = { 상: 0, 중: 0, 하: 0 };
    const byBeFe = { BE: { 상: 0, 중: 0, 하: 0 }, FE: { 상: 0, 중: 0, 하: 0 } };
    for (const r of results) {
        distribution[r.level]++;
        if (r.isBE) byBeFe.BE[r.level]++;
        if (r.isFE) byBeFe.FE[r.level]++;
    }

    console.log('\n=== 난이도 분포 ===');
    console.log(`총 ${results.length}건`);
    console.log(`  상: ${distribution.상}건 (${Math.round(distribution.상/results.length*100)}%)`);
    console.log(`  중: ${distribution.중}건 (${Math.round(distribution.중/results.length*100)}%)`);
    console.log(`  하: ${distribution.하}건 (${Math.round(distribution.하/results.length*100)}%)`);
    console.log('\n=== BE/FE 별 ===');
    console.log(`  BE — 상 ${byBeFe.BE.상} / 중 ${byBeFe.BE.중} / 하 ${byBeFe.BE.하}`);
    console.log(`  FE — 상 ${byBeFe.FE.상} / 중 ${byBeFe.FE.중} / 하 ${byBeFe.FE.하}`);

    // 5. CSV 저장 + 샘플 출력
    const csvLines = ['key,level,score,assignee,summary'];
    for (const r of results) {
        const safe = (r.summary ?? '').replace(/"/g, '""');
        csvLines.push(`${r.key},${r.level},${r.score},${r.assignee ?? ''},"${safe}"`);
    }
    const outCsv = path.join(TMP, 'difficulty_estimate.csv');
    fs.writeFileSync(outCsv, csvLines.join('\n'), 'utf8');
    console.log(`\nCSV 저장: ${outCsv}`);

    // 카테고리별 샘플
    console.log('\n=== 상 (Hard) 샘플 5건 ===');
    results.filter((r) => r.level === '상').slice(0, 5).forEach((r) => {
        console.log(`  ${r.key} [score=${r.score}] ${r.summary.slice(0, 70)}`);
        console.log(`    keywords: hard=${r.matched.hard.join(',')} medium=${r.matched.medium.join(',')}`);
    });
    console.log('\n=== 중 (Medium) 샘플 5건 ===');
    results.filter((r) => r.level === '중').slice(0, 5).forEach((r) => {
        console.log(`  ${r.key} [score=${r.score}] ${r.summary.slice(0, 70)}`);
    });
    console.log('\n=== 하 (Easy) 샘플 5건 ===');
    results.filter((r) => r.level === '하').slice(0, 5).forEach((r) => {
        console.log(`  ${r.key} [score=${r.score}] ${r.summary.slice(0, 70)}`);
    });

    // JSON으로도 저장 (Jira update에 사용)
    fs.writeFileSync(path.join(TMP, 'difficulty_estimate.json'), JSON.stringify(results, null, 2), 'utf8');
})();
