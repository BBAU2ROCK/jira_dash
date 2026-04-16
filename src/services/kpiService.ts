import { type JiraIssue } from "../api/jiraClient";
import { JIRA_CONFIG } from "../config/jiraConfig";
import { getStatusCategoryKey } from "../lib/jira-helpers";
import {
    useKpiRulesStore,
    getGradeFromRules,
    getEarlyBonusFromRules,
    type GradeThresholds,
    type EarlyBonusStep,
} from "../stores/kpiRulesStore";

export type KpiGrade = 'S' | 'A' | 'B' | 'C' | 'D' | '—';

export interface KPIMetrics {
    totalIssues: number;
    completedIssues: number;
    delayedIssues: number;
    earlyIssues: number;
    compliantIssues: number;
    agreedDelayIssues: number;

    completionRate: number;
    complianceRate: number;
    earlyRate: number;

    grades: {
        completion: KpiGrade;
        compliance: KpiGrade;
        earlyBonus: number;
        total: KpiGrade;
    };
    totalScore: number;
    /** kpiTotal(=total - agreedDelay)이 0 이하면 측정 불가 */
    measurable: boolean;
}

const ZERO_METRICS: KPIMetrics = {
    totalIssues: 0,
    completedIssues: 0,
    delayedIssues: 0,
    earlyIssues: 0,
    compliantIssues: 0,
    agreedDelayIssues: 0,
    completionRate: 0,
    complianceRate: 0,
    earlyRate: 0,
    grades: { completion: '—', compliance: '—', earlyBonus: 0, total: '—' },
    totalScore: 0,
    measurable: false,
};

/**
 * KPI 계산.
 *
 * **산출 규칙**
 * - 합의지연(`agreed-delay`) 라벨은 분모와 분자 양쪽에서 차감 → 100% 초과 방지.
 * - 검증지연(`verification-delay`) 라벨은 지연이어도 준수로 흡수.
 * - 조기완료(early)는 예정일 자정 이전 완료 = 1일 이상 빠른 완료.
 * - kpiTotal ≤ 0 (모두 합의지연 등)이면 `measurable=false` + 등급 '—'.
 *
 * **호출 비용**: 입력 배열을 정확히 1회만 순회.
 */
export function calculateKPI(issues: JiraIssue[]): KPIMetrics {
    const totalIssues = issues.length;
    if (totalIssues === 0) return ZERO_METRICS;

    let completedIssues = 0;
    let compliantIssues = 0;
    let earlyIssues = 0;
    let delayedIssues = 0;
    let agreedDelayIssues = 0;

    // KPI A/B/C 분자에서 차감해야 하는 합의지연 하위 카운트 (단일 패스로 누적)
    let agreedDelayDoneCount = 0;
    let agreedDelayCompliantCount = 0;
    let agreedDelayEarlyCount = 0;

    for (const issue of issues) {
        const isDone = getStatusCategoryKey(issue) === 'done';
        const labels = issue.fields.labels;
        const isAgreedDelay = labels?.includes(JIRA_CONFIG.LABELS.AGREED_DELAY) ?? false;
        const isVerificationDelay = labels?.includes(JIRA_CONFIG.LABELS.VERIFICATION_DELAY) ?? false;

        if (isAgreedDelay) agreedDelayIssues++;
        if (!isDone) continue;

        completedIssues++;
        if (isAgreedDelay) agreedDelayDoneCount++;

        const dueDateStr = issue.fields.duedate;
        const actualEndStr =
            (issue.fields[JIRA_CONFIG.FIELDS.ACTUAL_DONE] as string | undefined) ||
            issue.fields.resolutiondate;

        // 마감일이 없으면 준수 처리(기존 로직 유지)
        if (!dueDateStr || !actualEndStr) {
            compliantIssues++;
            if (isAgreedDelay) agreedDelayCompliantCount++;
            continue;
        }

        const dueEnd = new Date(dueDateStr);
        dueEnd.setHours(23, 59, 59, 999);
        const dueStart = new Date(dueDateStr);
        dueStart.setHours(0, 0, 0, 0);
        const actualEnd = new Date(actualEndStr);

        if (actualEnd <= dueEnd) {
            compliantIssues++;
            if (isAgreedDelay) agreedDelayCompliantCount++;
            // 마감일 자정 이전 완료 = 1일 이상 조기완료
            if (actualEnd < dueStart) {
                earlyIssues++;
                if (isAgreedDelay) agreedDelayEarlyCount++;
            }
        } else {
            // 지연 완료
            if (isVerificationDelay) {
                // 검증지연 → 준수로 흡수
                compliantIssues++;
                if (isAgreedDelay) agreedDelayCompliantCount++;
            } else if (!isAgreedDelay) {
                delayedIssues++;
            }
        }
    }

    const kpiTotal = totalIssues - agreedDelayIssues;
    if (kpiTotal <= 0) {
        // 측정 불가 — 합의지연 카운트는 보존하되 등급은 '—'
        return {
            ...ZERO_METRICS,
            totalIssues,
            completedIssues,
            delayedIssues,
            earlyIssues,
            compliantIssues,
            agreedDelayIssues,
            measurable: false,
        };
    }

    const kpiCompleted = Math.max(completedIssues - agreedDelayDoneCount, 0);
    const kpiCompliant = Math.max(compliantIssues - agreedDelayCompliantCount, 0);
    const kpiEarly = Math.max(earlyIssues - agreedDelayEarlyCount, 0);

    const completionRate = Math.min((kpiCompleted / kpiTotal) * 100, 100);
    const complianceRate = Math.min((kpiCompliant / kpiTotal) * 100, 100);
    const earlyRate = (kpiEarly / kpiTotal) * 100;
    const earlyBonus = getEarlyBonus(earlyRate);

    // 가중치 — store 규칙 사용
    let wCompletion = 0.5;
    let wCompliance = 0.5;
    try {
        const weights = useKpiRulesStore.getState().rules.weights;
        wCompletion = weights.completion;
        wCompliance = weights.compliance;
    } catch { /* fallback */ }
    const weightedScore = completionRate * wCompletion + complianceRate * wCompliance;
    const totalScore = Math.min(Math.round(weightedScore + earlyBonus), 100);

    return {
        totalIssues,
        completedIssues,
        delayedIssues,
        earlyIssues,
        compliantIssues,
        agreedDelayIssues,
        completionRate: Math.round(completionRate),
        complianceRate: Math.round(complianceRate),
        earlyRate: Math.round(earlyRate),
        grades: {
            completion: getGrade(completionRate),
            compliance: getGrade(complianceRate),
            earlyBonus,
            total: getGrade(totalScore),
        },
        totalScore,
        measurable: true,
    };
}

/** store에서 최신 규칙 조회 — React 외부에서도 작동 */
function getRules(): { grades: GradeThresholds; earlyBonus: EarlyBonusStep[] } {
    try {
        const state = useKpiRulesStore.getState();
        return { grades: state.rules.grades, earlyBonus: state.rules.earlyBonus };
    } catch {
        // store 초기화 전 fallback
        return {
            grades: { S: 95, A: 90, B: 80, C: 70 },
            earlyBonus: [
                { minRate: 50, bonus: 5 },
                { minRate: 40, bonus: 4 },
                { minRate: 30, bonus: 3 },
                { minRate: 20, bonus: 2 },
                { minRate: 10, bonus: 1 },
            ],
        };
    }
}

function getGrade(rate: number): KpiGrade {
    const { grades } = getRules();
    return getGradeFromRules(rate, grades) as KpiGrade;
}

function getEarlyBonus(rate: number): number {
    const { earlyBonus } = getRules();
    return getEarlyBonusFromRules(rate, earlyBonus);
}
