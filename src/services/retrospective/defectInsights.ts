/**
 * v1.0.12 F3-3: 결함 회고 자동 권고 규칙 엔진.
 *
 * 설계 원칙 (docs/retrospective-insights-plan.md §"코칭 vs 평가"):
 *   - 판단·낙인 용어 금지 ("D 등급 개발자")
 *   - 구체 액션 포함 ("RCA 세션", "Pair programming")
 *   - "권장·고려·기회 제공" 어조
 *
 * 규칙 R1~R6:
 *   R1: Critical/Blocker ≥ 3건 → 근본 원인 분석(RCA) 권장
 *   R2: 1인 집중 ≥ 50% → 업무 재분배 또는 pair programming
 *   R3: 최근 4주 악화 → QA 체크리스트·회귀 테스트 보강
 *   R4: 최근 4주 개선 → 현재 프로세스 유지·확산 고려
 *   R5: 팀 평균 Density +5%p 초과 → 요구사항·설계 리뷰 강화
 *   R6: 타입 편향 ≥ 70% → 해당 영역 자동화 테스트 투자
 */

import { criticalPlusCount } from '@/lib/defect-severity-color';
import type { DefectStatsExtended } from './types';

export interface DefectInsightInput {
    /** 기본 stats (보통 DefectStatsExtended 전체) */
    defectCount: number;
    defectsPerCompletedTask: number;
    severityBreakdown: Array<{ name: string; count: number }>;
    typeBreakdown: Array<{ name: string; count: number }>;
    trendDirection: DefectStatsExtended['trendDirection'];
    topAffectedPeople: DefectStatsExtended['topAffectedPeople'];
    /** 팀 평균 Defect Density (%) — null이면 R5 스킵 */
    teamAvgDensity: number | null;
}

/** 최대 3건의 권고 반환. 우선순위 높은 규칙부터. */
export function generateDefectRecommendations(input: DefectInsightInput): string[] {
    const recs: string[] = [];

    // R1 — Critical/Blocker 집중도 (최우선)
    const criticalCount = criticalPlusCount(input.severityBreakdown);
    if (criticalCount >= 3) {
        recs.push(
            `심각 결함(Critical/Blocker 이상) ${criticalCount}건 발생 — ` +
            `근본 원인 분석(RCA) 세션 진행 권장`
        );
    }

    // R2 — 1인 집중
    const top = input.topAffectedPeople[0];
    if (top && top.pctOfEpic >= 50 && input.defectCount >= 4) {
        recs.push(
            `결함의 ${top.pctOfEpic}%가 '${top.name}'에 집중 — ` +
            `업무 부하·전문 영역 재검토 또는 pair programming 고려`
        );
    }

    // R3 — 트렌드 악화
    if (input.trendDirection === 'worsening') {
        recs.push(
            `최근 4주 결함 증가세 — 릴리스 전 QA 체크리스트·회귀 테스트 보강 권장`
        );
    }

    // R4 — 트렌드 개선 (R3과 상호 배타)
    if (input.trendDirection === 'improving') {
        recs.push(
            `최근 4주 감소세 — 현재 프로세스 유지하고, 다른 에픽·팀에 확산 고려`
        );
    }

    // R5 — 팀 평균 대비 과다
    if (input.teamAvgDensity != null) {
        const delta = input.defectsPerCompletedTask - input.teamAvgDensity;
        if (delta > 5) {
            recs.push(
                `Defect Density가 팀 평균 대비 +${delta.toFixed(1)}%p — ` +
                `요구사항 명확화·설계 리뷰 단계 강화 권장`
            );
        }
    }

    // R6 — 타입 편향
    if (input.typeBreakdown.length > 0 && input.defectCount >= 5) {
        const topType = input.typeBreakdown[0];
        const pct = Math.round((topType.count / input.defectCount) * 100);
        if (pct >= 70) {
            recs.push(
                `결함의 ${pct}%가 '${topType.name}' 타입 — ` +
                `해당 영역 자동화 테스트·코드 커버리지 투자 우선`
            );
        }
    }

    return recs.slice(0, 3);
}

/**
 * 트렌드 방향 판정.
 * 최근 4주 합계 vs 그 이전 4주 합계 비교. 표본 부족 시 'insufficient'.
 */
export function classifyTrend(
    weeklyTrend: Array<{ weekStart: string; count: number }>
): DefectStatsExtended['trendDirection'] {
    if (weeklyTrend.length < 8) return 'insufficient';

    const sorted = [...weeklyTrend].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    const recent = sorted.slice(-4).reduce((sum, w) => sum + w.count, 0);
    const prior = sorted.slice(-8, -4).reduce((sum, w) => sum + w.count, 0);

    // 양쪽 모두 0이면 stable
    if (recent === 0 && prior === 0) return 'stable';
    // prior=0 recent>0 → 악화
    if (prior === 0) return recent > 0 ? 'worsening' : 'stable';

    const ratio = recent / prior;
    if (ratio < 0.7) return 'improving'; // 30%↑ 감소
    if (ratio > 1.3) return 'worsening'; // 30%↑ 증가
    return 'stable';
}
