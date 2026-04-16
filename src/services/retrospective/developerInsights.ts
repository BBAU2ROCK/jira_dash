/**
 * v1.0.12 F4: 담당자별 회고 인사이트 엔진.
 *
 * 여러 데이터 소스 통합:
 *   - DefectKpiDeveloperRow (결함 패턴)
 *   - DeveloperStrengthRow (type × cycle time)
 *   - 팀 baseline (중앙값)
 *
 * 출력: 강점 / 개선 포인트 / 페르소나.
 * 원칙: 코칭 용어 ("기회 제공·권장·고려"), 판단 용어("평가·낙인") 금지.
 */

import type { DefectKpiDeveloperRow } from '@/lib/defect-kpi-utils';
import type { DeveloperStrengthRow } from './types';
import { weightedSeverityScore, criticalPlusCount } from '@/lib/defect-severity-color';

/** 페르소나 — 자동 권고 어조 결정용 */
export type DeveloperProfile =
    | 'mentor'           // 여러 영역 강함, 개선점 0
    | 'balanced'         // 강점 1, 개선점 1 수준
    | 'specialized'      // 특정 영역 강함
    | 'needs-support'    // 개선점 2+
    | 'new-joiner';      // 담당 task < 5 (표본 부족)

export interface DeveloperProfileResult {
    strengths: string[];
    improvements: string[];
    profile: DeveloperProfile;
    /** 심각도 가중 점수 (Critical=5, High=3, Medium=2, Low=1 가중합) */
    severityWeightedScore: number;
    /** 팀 대비 백분위 — 결함율 기준 (낮을수록 좋음, 0=최저 결함율, 100=최고) */
    defectRatePercentile: number | null;
    /** 주력 이슈 타입 (DeveloperStrengthRow의 byType에서 가장 많이 처리한) */
    primaryIssueType: string | null;
}

export interface TeamBaseline {
    /** 결함율 중앙값 (%) — rows에서 null 제외 후 median */
    medianDefectRate: number;
    /** 전체 type별 cycle time 중앙값 (일) */
    medianCycleTime: number;
    /** 표본 크기 — 3명 미만이면 baseline 신뢰 불가 */
    sampleSize: number;
}

/** 배열 중앙값 */
function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}

/** 팀 baseline 계산 — 결함 rows + strength rows 조합 */
export function computeTeamBaseline(
    defectRows: DefectKpiDeveloperRow[],
    strengthRows: DeveloperStrengthRow[]
): TeamBaseline {
    const defectRates = defectRows
        .map((r) => r.defectRatePercent)
        .filter((v): v is number => v != null);

    // strengthRows의 모든 type cell cycle time 플랫
    const cycleTimes: number[] = [];
    for (const r of strengthRows) {
        for (const [, cell] of r.byType) {
            // 가중: count만큼 반복해서 median에 기여 (task 수 많은 값이 더 대표적)
            for (let i = 0; i < Math.min(cell.count, 10); i++) {
                cycleTimes.push(cell.avgCycleTimeDays);
            }
        }
    }

    return {
        medianDefectRate: median(defectRates),
        medianCycleTime: median(cycleTimes),
        sampleSize: defectRows.length,
    };
}

/** 값의 백분위 계산 (0~100, 낮을수록 "좋음" — 결함율) */
function percentileRank(value: number, sorted: number[]): number {
    if (sorted.length === 0) return 50;
    let below = 0;
    for (const v of sorted) {
        if (v < value) below++;
    }
    return Math.round((below / sorted.length) * 100);
}

/** 담당자 인사이트 생성 */
export function analyzeDeveloperProfile(
    defectRow: DefectKpiDeveloperRow,
    strengthRow: DeveloperStrengthRow | undefined,
    baseline: TeamBaseline,
    allDefectRates: number[]
): DeveloperProfileResult {
    const strengths: string[] = [];
    const improvements: string[] = [];

    // 심각도 가중 점수
    const severityWeightedScore = weightedSeverityScore(defectRow.severityBreakdown);
    const criticalCount = criticalPlusCount(defectRow.severityBreakdown);

    // 백분위 (팀 표본 3명 이상일 때만)
    const defectRatePercentile =
        baseline.sampleSize >= 3 && defectRow.defectRatePercent != null
            ? percentileRank(defectRow.defectRatePercent, [...allDefectRates].sort((a, b) => a - b))
            : null;

    // ── 강점 분석 ─────────────────────────────────────────────────────
    // S1: 낮은 결함율 (팀 평균의 절반 이하)
    if (
        defectRow.defectRatePercent != null &&
        baseline.medianDefectRate > 0 &&
        defectRow.defectRatePercent <= baseline.medianDefectRate * 0.5
    ) {
        strengths.push(
            `낮은 결함율 (${defectRow.defectRatePercent}% — 팀 중앙값 ${baseline.medianDefectRate.toFixed(1)}%의 절반 이하)`
        );
    }

    // S2: 심각 결함 0건 + 결함 있음 → 저위험 패턴
    if (defectRow.defectCount >= 2 && criticalCount === 0) {
        strengths.push(`Critical/Blocker 결함 0건 — 저위험 개발 패턴 유지`);
    }

    // S3: 빠른 cycle time in 특정 type (멘토 후보)
    let primaryIssueType: string | null = null;
    if (strengthRow && strengthRow.byType.size > 0) {
        const types = Array.from(strengthRow.byType.entries())
            .sort((a, b) => b[1].count - a[1].count); // 처리량 많은 순
        primaryIssueType = types[0][0];

        // cycle time 빠른 type 찾기 (count ≥ 3, 팀 중앙값의 70% 이하)
        for (const [typeName, cell] of types) {
            if (cell.count >= 3 && baseline.medianCycleTime > 0 &&
                cell.avgCycleTimeDays <= baseline.medianCycleTime * 0.7) {
                strengths.push(
                    `'${typeName}' 타입에서 팀 중앙값보다 빠름 (${cell.avgCycleTimeDays}d vs ${baseline.medianCycleTime.toFixed(1)}d) — 멘토·리뷰어 역할 적합`
                );
                break; // 첫 번째만
            }
        }
    }

    // ── 개선 포인트 ───────────────────────────────────────────────────
    // I1: 결함율 팀 평균 대비 2배 초과
    if (
        defectRow.defectRatePercent != null &&
        baseline.medianDefectRate > 0 &&
        defectRow.defectRatePercent >= baseline.medianDefectRate * 2
    ) {
        const multiple = (defectRow.defectRatePercent / baseline.medianDefectRate).toFixed(1);
        improvements.push(
            `결함율 팀 중앙값 대비 ${multiple}배 (${defectRow.defectRatePercent}% vs ${baseline.medianDefectRate.toFixed(1)}%) — 요구사항 재확인·테스트 커버리지 점검 권장`
        );
    }

    // I2: 심각 결함 비중 높음
    if (severityWeightedScore >= 10 || criticalCount >= 2) {
        improvements.push(
            `심각 결함(Critical/Blocker 이상) ${criticalCount}건 · 가중 점수 ${severityWeightedScore} — 설계 리뷰·pair programming 기회 제공 고려`
        );
    }

    // I3: 느린 cycle time in 특정 type
    if (strengthRow && strengthRow.byType.size > 0) {
        const types = Array.from(strengthRow.byType.entries())
            .sort((a, b) => b[1].avgCycleTimeDays - a[1].avgCycleTimeDays); // 느린 순

        for (const [typeName, cell] of types) {
            if (cell.count >= 3 && baseline.medianCycleTime > 0 &&
                cell.avgCycleTimeDays >= baseline.medianCycleTime * 1.5) {
                const pct = Math.round(
                    (cell.avgCycleTimeDays / baseline.medianCycleTime - 1) * 100
                );
                improvements.push(
                    `'${typeName}' cycle time 팀 중앙값 대비 +${pct}% (${cell.avgCycleTimeDays}d) — pair programming 또는 해당 영역 학습 기회 제공 고려`
                );
                break;
            }
        }
    }

    // ── 페르소나 분류 ─────────────────────────────────────────────────
    let profile: DeveloperProfile = 'balanced';
    if (defectRow.devIssueCount < 5) {
        profile = 'new-joiner';
    } else if (strengths.length >= 2 && improvements.length === 0) {
        profile = 'mentor';
    } else if (improvements.length >= 2) {
        profile = 'needs-support';
    } else if (strengths.length >= 1 && improvements.length === 0 && primaryIssueType) {
        profile = 'specialized';
    }

    return {
        strengths,
        improvements,
        profile,
        severityWeightedScore,
        defectRatePercentile,
        primaryIssueType,
    };
}

/** 페르소나 → UI 메타 (라벨·색·설명) */
export function profileMeta(profile: DeveloperProfile): {
    label: string;
    description: string;
    color: 'purple' | 'blue' | 'green' | 'amber' | 'slate';
} {
    const map: Record<DeveloperProfile, ReturnType<typeof profileMeta>> = {
        mentor: {
            label: 'Mentor',
            description: '여러 영역에서 강점 — 리뷰어·멘토 역할 적합',
            color: 'purple',
        },
        balanced: {
            label: 'Balanced',
            description: '균형 잡힌 성과 — 현재 업무 유지',
            color: 'blue',
        },
        specialized: {
            label: 'Specialized',
            description: '특정 영역에서 강점 — 해당 영역 심화 기회',
            color: 'green',
        },
        'needs-support': {
            label: 'Needs Support',
            description: '지원·학습 기회 제공 권장 (pair programming 등)',
            color: 'amber',
        },
        'new-joiner': {
            label: 'New Joiner',
            description: '담당 task 5건 미만 — 표본 부족, 관찰 기간',
            color: 'slate',
        },
    };
    return map[profile];
}
