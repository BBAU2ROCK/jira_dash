/**
 * KPI 규칙 관리 Store — Level 4 관리 UI.
 *
 * PM이 앱 내에서 직접 등급 기준·가중치·결함 등급·Jira 필드 편집.
 * localStorage(Zustand persist)에 저장. JSON import/export로 다른 PC 동기.
 *
 * 기존 jiraConfig.ts의 값은 default로만 사용 — store가 override.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { JIRA_CONFIG } from '@/config/jiraConfig';

/** KPI 등급 기준 — 점수 ≥ 이 값이면 해당 등급 */
export interface GradeThresholds {
    S: number;
    A: number;
    B: number;
    C: number;
}

/** 조기 보너스 단계 */
export interface EarlyBonusStep {
    minRate: number;  // 조기완료율 ≥ 이 값이면
    bonus: number;    // 이 점수 가산
}

/** 가중치 (합 = 1.0) */
export interface KpiWeights {
    completion: number;
    compliance: number;
}

/** 전체 KPI 규칙셋 */
export interface KpiRuleSet {
    /** 버전 식별 (예: '2026') */
    version: string;
    /** 사람이 읽을 수 있는 라벨 */
    label: string;
    /** 마지막 수정 시각 */
    updatedAt: string;

    // ── 등급 ──
    grades: GradeThresholds;
    defectGrades: GradeThresholds;

    // ── 가중치 ──
    weights: KpiWeights;

    // ── 보너스 ──
    earlyBonus: EarlyBonusStep[];

    // ── Jira 연결 ──
    labels: {
        agreedDelay: string;
        verificationDelay: string;
    };
    statusNames: {
        onHold: string;
        cancelled: string;
    };
    fields: {
        storyPoint: string;
        plannedStart: string;
        actualStart: string;
        actualDone: string;
        difficulty: string;
    };

    // ── 프로젝트 ──
    dashboardProjectKey: string;
    projectKeys: string[];
    weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;

    // ── 예측 파라미터 ──
    prediction: {
        defaultHistoryDays: number;
        monteCarloTrials: number;
        defaultUtilization: number;
        etaEffortGapThreshold: number;
        spCoverageThreshold: number;
        worklogCoverageThreshold: number;
    };
}

/** 현재 jiraConfig.ts 값을 default로 */
function getDefaultRuleSet(): KpiRuleSet {
    return {
        version: '2026',
        label: '2026년 KPI 기준 (기본)',
        updatedAt: new Date().toISOString(),
        grades: { S: 95, A: 90, B: 80, C: 70 },
        defectGrades: { S: 5, A: 10, B: 15, C: 20 },
        weights: { completion: 0.5, compliance: 0.5 },
        earlyBonus: [
            { minRate: 50, bonus: 5 },
            { minRate: 40, bonus: 4 },
            { minRate: 30, bonus: 3 },
            { minRate: 20, bonus: 2 },
            { minRate: 10, bonus: 1 },
        ],
        labels: {
            agreedDelay: JIRA_CONFIG.LABELS.AGREED_DELAY,
            verificationDelay: JIRA_CONFIG.LABELS.VERIFICATION_DELAY,
        },
        statusNames: {
            onHold: JIRA_CONFIG.STATUS_NAMES.ON_HOLD,
            cancelled: JIRA_CONFIG.STATUS_NAMES.CANCELLED,
        },
        fields: {
            storyPoint: JIRA_CONFIG.FIELDS.STORY_POINT,
            plannedStart: JIRA_CONFIG.FIELDS.PLANNED_START,
            actualStart: JIRA_CONFIG.FIELDS.ACTUAL_START,
            actualDone: JIRA_CONFIG.FIELDS.ACTUAL_DONE,
            difficulty: JIRA_CONFIG.FIELDS.DIFFICULTY,
        },
        dashboardProjectKey: JIRA_CONFIG.DASHBOARD.PROJECT_KEY,
        projectKeys: [...JIRA_CONFIG.PROJECT_KEYS],
        weekStartsOn: JIRA_CONFIG.WEEK_STARTS_ON,
        prediction: {
            defaultHistoryDays: JIRA_CONFIG.PREDICTION.DEFAULT_HISTORY_DAYS,
            monteCarloTrials: JIRA_CONFIG.PREDICTION.MONTE_CARLO_TRIALS,
            defaultUtilization: JIRA_CONFIG.PREDICTION.DEFAULT_UTILIZATION,
            etaEffortGapThreshold: JIRA_CONFIG.PREDICTION.ETA_EFFORT_GAP_THRESHOLD,
            spCoverageThreshold: JIRA_CONFIG.PREDICTION.SP_COVERAGE_THRESHOLD,
            worklogCoverageThreshold: JIRA_CONFIG.PREDICTION.WORKLOG_COVERAGE_THRESHOLD,
        },
    };
}

interface KpiRulesState {
    /** 활성 규칙셋 */
    rules: KpiRuleSet;
    /** 아카이브 (이전 버전 보관) */
    archive: KpiRuleSet[];
    /** 규칙셋 저장 (부분 업데이트) */
    updateRules: (patch: Partial<KpiRuleSet>) => void;
    /** 새 버전 생성 (현재 규칙 복사 → 새 version + label) */
    createVersion: (version: string, label: string) => void;
    /** 기본값으로 리셋 */
    resetToDefault: () => void;
    /** JSON에서 가져오기 (전체 교체) */
    importFromJson: (ruleSet: KpiRuleSet) => void;
}

export const useKpiRulesStore = create<KpiRulesState>()(
    persist(
        (set, get) => ({
            rules: getDefaultRuleSet(),
            archive: [],
            updateRules: (patch) =>
                set((s) => ({
                    rules: {
                        ...s.rules,
                        ...patch,
                        updatedAt: new Date().toISOString(),
                    },
                })),
            createVersion: (version, label) => {
                const current = get().rules;
                set((s) => ({
                    archive: [current, ...s.archive].slice(0, 20), // 최대 20개 보관
                    rules: {
                        ...current,
                        version,
                        label,
                        updatedAt: new Date().toISOString(),
                    },
                }));
            },
            resetToDefault: () => set({ rules: getDefaultRuleSet() }),
            importFromJson: (ruleSet) =>
                set({
                    rules: {
                        ...ruleSet,
                        updatedAt: new Date().toISOString(),
                    },
                }),
        }),
        {
            name: 'jira-dash-kpi-rules',
            storage: createJSONStorage(() =>
                typeof window !== 'undefined' && window.localStorage
                    ? window.localStorage
                    : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
            ),
        }
    )
);

/** store 규칙으로 KPI 등급 산정 (kpiService.getGrade 대체) */
export function getGradeFromRules(rate: number, grades: GradeThresholds): 'S' | 'A' | 'B' | 'C' | 'D' {
    if (rate >= grades.S) return 'S';
    if (rate >= grades.A) return 'A';
    if (rate >= grades.B) return 'B';
    if (rate >= grades.C) return 'C';
    return 'D';
}

/** store 규칙으로 조기 보너스 산정 (kpiService.getEarlyBonus 대체) */
export function getEarlyBonusFromRules(rate: number, steps: EarlyBonusStep[]): number {
    // 내림차순 정렬 후 첫 매칭
    const sorted = [...steps].sort((a, b) => b.minRate - a.minRate);
    for (const step of sorted) {
        if (rate >= step.minRate) return step.bonus;
    }
    return 0;
}

/** store 규칙으로 결함 등급 산정 (defect-kpi-utils.defectRateToGrade 대체) */
export function getDefectGradeFromRules(rate: number, grades: GradeThresholds): 'S' | 'A' | 'B' | 'C' | 'D' {
    if (rate <= grades.S) return 'S';
    if (rate <= grades.A) return 'A';
    if (rate <= grades.B) return 'B';
    if (rate <= grades.C) return 'C';
    return 'D';
}

/**
 * 검증 함수 — 규칙셋의 유효성 검사.
 * 에러 메시지 배열 반환. 빈 배열이면 유효.
 */
export function validateRuleSet(rules: KpiRuleSet): string[] {
    const errors: string[] = [];
    const { grades, defectGrades, weights, earlyBonus } = rules;

    // 등급 순서
    if (grades.S <= grades.A || grades.A <= grades.B || grades.B <= grades.C) {
        errors.push('KPI 등급 기준: S > A > B > C 순서여야 합니다.');
    }
    if (grades.C < 0 || grades.S > 100) {
        errors.push('KPI 등급 기준: 0~100 범위여야 합니다.');
    }

    // 결함 등급 순서 (작을수록 좋음)
    if (defectGrades.S >= defectGrades.A || defectGrades.A >= defectGrades.B || defectGrades.B >= defectGrades.C) {
        errors.push('결함 등급: S < A < B < C 순서여야 합니다 (낮을수록 좋음).');
    }

    // 가중치 합
    const weightSum = weights.completion + weights.compliance;
    if (Math.abs(weightSum - 1.0) > 0.01) {
        errors.push(`가중치 합이 ${(weightSum * 100).toFixed(0)}% — 100%여야 합니다.`);
    }

    // 보너스 순서
    for (let i = 1; i < earlyBonus.length; i++) {
        if (earlyBonus[i].minRate >= earlyBonus[i - 1].minRate) {
            errors.push('조기 보너스: minRate가 내림차순이어야 합니다.');
            break;
        }
    }

    // 필수 필드
    if (!rules.dashboardProjectKey.trim()) {
        errors.push('대시보드 프로젝트 키가 비어있습니다.');
    }
    if (!rules.fields.storyPoint.trim()) {
        errors.push('Story Point 필드 ID가 비어있습니다.');
    }

    return errors;
}
