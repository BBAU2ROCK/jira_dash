import { type JiraIssue } from "../api/jiraClient";
import { isBusinessDone } from "../lib/jira-helpers";
import { endOfLocalDay, startOfLocalDay } from "../lib/date-utils";
import {
    getGradeFromRules,
    getEarlyBonusFromRules,
} from "../stores/kpiRulesStore";
import {
    resolveAgreedDelayLabel,
    resolveVerificationDelayLabel,
    resolveCancelledStatus,
    resolveRejectedStatus,
    resolveFields,
    resolveWeights,
    resolveGrades,
    resolveEarlyBonus,
} from "../lib/kpi-rules-resolver";

/**
 * v1.0.10: KPI 산식용 규칙 해석.
 * 공통 resolver 헬퍼(`@/lib/kpi-rules-resolver`)를 조합하여 필요한 값만 취함.
 * v1.0.18: cancelled/rejected status 추가 (분모·분자 제외).
 */
function resolveKpiRules() {
    return {
        agreedDelayLabel: resolveAgreedDelayLabel(),
        verificationDelayLabel: resolveVerificationDelayLabel(),
        cancelledStatus: resolveCancelledStatus(),
        rejectedStatus: resolveRejectedStatus(),
        actualDoneField: resolveFields().ACTUAL_DONE,
        weights: resolveWeights(),
        grades: resolveGrades(),
        earlyBonus: resolveEarlyBonus(),
    };
}

/**
 * 이슈의 실제 완료 시각을 store 규칙 기반 필드로 조회.
 * ACTUAL_DONE(customfield) 우선, 없으면 resolutiondate fallback.
 * 외부(epicRetro 등)에서도 재사용 가능하도록 export.
 */
export function getCompletionDateStr(issue: JiraIssue): string | null {
    const actualDoneField = resolveFields().ACTUAL_DONE;
    const value = issue.fields[actualDoneField] as string | undefined;
    return value || issue.fields.resolutiondate || null;
}

/** Date 객체로 반환. 에픽 회고·차트 등에서 편의 사용 */
export function getCompletionDate(issue: JiraIssue): Date | null {
    const s = getCompletionDateStr(issue);
    return s ? new Date(s) : null;
}

export type KpiGrade = 'S' | 'A' | 'B' | 'C' | 'D' | '—';

export interface KPIMetrics {
    totalIssues: number;
    completedIssues: number;
    delayedIssues: number;
    earlyIssues: number;
    compliantIssues: number;
    agreedDelayIssues: number;
    /**
     * K6: 기한 미설정으로 "준수로 카운트된" 이슈 건수.
     * (duedate 또는 완료일이 없는 완료 이슈)
     * 준수율 해석 시 투명성을 위해 UI에서 별도 표시.
     */
    noDueDateCount: number;
    /**
     * v1.0.18: 취소(status='취소') 상태 이슈 — KPI 분모·분자에서 제외.
     * 표시는 별도 (UI 투명성).
     */
    cancelledIssues: number;
    /**
     * v1.0.18: 반려(status='반려') 상태 이슈 — KPI 분모·분자에서 제외.
     */
    rejectedIssues: number;

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
    noDueDateCount: 0,
    cancelledIssues: 0,
    rejectedIssues: 0,
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

    // K1: store 규칙 우선 참조 (labels, fields.actualDone, weights, grades, earlyBonus)
    const rules = resolveKpiRules();

    let completedIssues = 0;
    let compliantIssues = 0;
    let earlyIssues = 0;
    let delayedIssues = 0;
    let agreedDelayIssues = 0;
    // K6: 기한 미설정으로 준수 카운트된 이슈 수 (투명성용 UI 표시)
    let noDueDateCount = 0;
    // v1.0.18: 취소·반려 카운트 (분모·분자 제외)
    let cancelledIssues = 0;
    let rejectedIssues = 0;

    // KPI A/B/C 분자에서 차감해야 하는 합의지연 하위 카운트 (단일 패스로 누적)
    let agreedDelayDoneCount = 0;
    let agreedDelayCompliantCount = 0;
    let agreedDelayEarlyCount = 0;

    for (const issue of issues) {
        const isDone = isBusinessDone(issue);
        const statusName = issue.fields.status?.name?.trim() ?? '';
        // v1.0.18: 취소·반려는 KPI 평가에서 완전 제외 (성과 평가 X)
        const isCancelled = statusName === rules.cancelledStatus;
        const isRejected = statusName === rules.rejectedStatus;
        if (isCancelled) cancelledIssues++;
        if (isRejected) rejectedIssues++;
        if (isCancelled || isRejected) continue; // 분자 카운트 X (분모도 아래 kpiTotal에서 차감)

        const labels = issue.fields.labels;
        const isAgreedDelay = labels?.includes(rules.agreedDelayLabel) ?? false;
        const isVerificationDelay = labels?.includes(rules.verificationDelayLabel) ?? false;

        if (isAgreedDelay) agreedDelayIssues++;
        if (!isDone) continue;

        completedIssues++;
        if (isAgreedDelay) agreedDelayDoneCount++;

        const dueDateStr = issue.fields.duedate;
        const actualEndStr =
            (issue.fields[rules.actualDoneField] as string | undefined) ||
            issue.fields.resolutiondate;

        // 마감일이 없으면 준수 처리(기존 로직 유지) — K6: 별도 카운트
        if (!dueDateStr || !actualEndStr) {
            compliantIssues++;
            noDueDateCount++;
            if (isAgreedDelay) agreedDelayCompliantCount++;
            continue;
        }

        // K10: 타임존 혼합 방어 — YYYY-MM-DD를 로컬 자정 기반으로 일관되게 변환
        const dueEnd = endOfLocalDay(dueDateStr);
        const dueStart = startOfLocalDay(dueDateStr);
        if (!dueEnd || !dueStart) {
            // dueDate 파싱 실패 → 기한 없음과 동일하게 준수 처리
            compliantIssues++;
            noDueDateCount++;
            if (isAgreedDelay) agreedDelayCompliantCount++;
            continue;
        }
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

    // v1.0.18: 분모에서도 cancelled/rejected 제외 (agreed-delay 패턴)
    const kpiTotal = totalIssues - agreedDelayIssues - cancelledIssues - rejectedIssues;
    if (kpiTotal <= 0) {
        // 측정 불가 — 합의지연·취소·반려 카운트는 보존하되 등급은 '—'
        return {
            ...ZERO_METRICS,
            totalIssues,
            completedIssues,
            delayedIssues,
            earlyIssues,
            compliantIssues,
            agreedDelayIssues,
            noDueDateCount,
            cancelledIssues,
            rejectedIssues,
            measurable: false,
        };
    }

    const kpiCompleted = Math.max(completedIssues - agreedDelayDoneCount, 0);
    const kpiCompliant = Math.max(compliantIssues - agreedDelayCompliantCount, 0);
    const kpiEarly = Math.max(earlyIssues - agreedDelayEarlyCount, 0);

    const completionRate = Math.min((kpiCompleted / kpiTotal) * 100, 100);
    const complianceRate = Math.min((kpiCompliant / kpiTotal) * 100, 100);
    // K5: earlyRate 100% 상한 적용 (표시 일관성)
    const earlyRate = Math.min((kpiEarly / kpiTotal) * 100, 100);
    const earlyBonus = getEarlyBonusFromRules(earlyRate, rules.earlyBonus);

    // 가중치 — store 규칙 사용 (resolveKpiRules에서 이미 fallback 포함)
    const weightedScore = completionRate * rules.weights.completion + complianceRate * rules.weights.compliance;
    // K11 (현행 정책 유지 — 변경 전 PM 합의 필요):
    //   - completion / compliance 등급: unrounded float rate 기반 (경계 89.5 → A)
    //   - total 등급: rounded integer totalScore 기반 (경계 89.5 → round 90 → A)
    //   경계 케이스에서 완료율·준수율 등급과 종합 등급이 서로 다른 반올림 정책으로 산출될 수 있음.
    //   예) weighted 89.5 + bonus 0 → completionRate(89.5)=A, total(round 90)=A 일치.
    //       weighted 89.4 + bonus 0 → completion(89.4)=B, total(round 89)=B 일치.
    //   현실적으로 대부분 일치하지만, 미래에 반올림 정책을 통일할 경우 이 주석을 참고.
    const totalScore = Math.min(Math.round(weightedScore + earlyBonus), 100);

    return {
        totalIssues,
        completedIssues,
        delayedIssues,
        earlyIssues,
        compliantIssues,
        agreedDelayIssues,
        noDueDateCount,
        cancelledIssues,
        rejectedIssues,
        completionRate: Math.round(completionRate),
        complianceRate: Math.round(complianceRate),
        earlyRate: Math.round(earlyRate),
        grades: {
            completion: getGradeFromRules(completionRate, rules.grades) as KpiGrade,
            compliance: getGradeFromRules(complianceRate, rules.grades) as KpiGrade,
            earlyBonus,
            total: getGradeFromRules(totalScore, rules.grades) as KpiGrade,
        },
        totalScore,
        measurable: true,
    };
}

// ──────────────────────────────────────────────────────────────────
// v1.0.14: 가중 KPI — 메인 + 서브 협업 반영
// ──────────────────────────────────────────────────────────────────

export interface WeightedKpiInput {
    /** 본인이 메인 담당자인 leaf task */
    mainIssues: JiraIssue[];
    /** 본인이 서브담당자로 등록된 leaf task (메인은 다른 사람) */
    subIssues: JiraIssue[];
    /** 서브 가중치 (default 0.5) */
    subWeight?: number;
}

export interface WeightedKpiMetrics extends KPIMetrics {
    /** 가중 적용 전 — 메인 담당 단독 KPI (참조용) */
    mainOnly: KPIMetrics;
    /** 가중 적용 전 — 서브 단독 KPI (참조용) */
    subOnly: KPIMetrics;
    /** 적용된 서브 가중치 */
    appliedSubWeight: number;
    /** 가중 합산된 분모 (mainTotal + subTotal × weight) */
    weightedTotalRaw: number;
    /** 가중 합산된 완료 분자 */
    weightedCompletedRaw: number;
}

/**
 * 메인 + 서브를 가중 합산한 KPI.
 *
 * 산식:
 *   weightedTotal     = main.totalIssues + sub.totalIssues × subWeight
 *   weightedCompleted = main.completedIssues + sub.completedIssues × subWeight
 *   ... (compliant/early/agreedDelay 동일 패턴)
 *
 *   completionRate = (weightedCompleted - weightedAgreedDelayDone) / (weightedTotal - weightedAgreedDelay) × 100
 *
 * 등급·earlyBonus·totalScore는 일반 calculateKPI와 동일하게 산정 (rate 입력만 가중).
 *
 * **정직성 원칙**:
 *   - 메인 담당이 0건이고 서브로만 참여한 인원도 측정 가능 (가중 합산 분모 > 0)
 *   - 분모(가중) ≤ 0이면 measurable=false
 *   - mainOnly·subOnly 메트릭도 함께 반환 → UI에서 분해 표시 가능
 */
export function calculateWeightedKPI(input: WeightedKpiInput): WeightedKpiMetrics {
    const subWeight = input.subWeight ?? 0.5;
    const main = calculateKPI(input.mainIssues);
    const sub = calculateKPI(input.subIssues);

    // 가중 합산 (raw counts)
    const totalIssues = main.totalIssues + sub.totalIssues * subWeight;
    const completedIssues = main.completedIssues + sub.completedIssues * subWeight;
    const delayedIssues = main.delayedIssues + sub.delayedIssues * subWeight;
    const earlyIssues = main.earlyIssues + sub.earlyIssues * subWeight;
    const compliantIssues = main.compliantIssues + sub.compliantIssues * subWeight;
    const agreedDelayIssues = main.agreedDelayIssues + sub.agreedDelayIssues * subWeight;
    const noDueDateCount = main.noDueDateCount + sub.noDueDateCount * subWeight;

    const rules = resolveKpiRules();

    // 분자에서 agreed-delay 가중 차감을 직접 계산하기 어려움 (calculateKPI가 내부 카운트를 노출 안 함)
    // 대신 main / sub 각각의 rate를 가중 평균으로 합산
    const mkRate = (m: KPIMetrics) => ({
        completion: m.completionRate,
        compliance: m.complianceRate,
        early: m.earlyRate,
    });
    const mainRate = mkRate(main);
    const subRate = mkRate(sub);

    // 가중 평균: ratio = (mainRate × mainKpiTotal + subRate × subKpiTotal × weight)
    //                  / (mainKpiTotal + subKpiTotal × weight)
    const mainKpi = main.totalIssues - main.agreedDelayIssues;
    const subKpi = sub.totalIssues - sub.agreedDelayIssues;
    const denom = mainKpi + subKpi * subWeight;

    if (denom <= 0) {
        return {
            ...ZERO_METRICS,
            totalIssues,
            completedIssues,
            delayedIssues,
            earlyIssues,
            compliantIssues,
            agreedDelayIssues,
            noDueDateCount,
            measurable: false,
            mainOnly: main,
            subOnly: sub,
            appliedSubWeight: subWeight,
            weightedTotalRaw: totalIssues,
            weightedCompletedRaw: completedIssues,
        };
    }

    const blendRate = (mr: number, sr: number) =>
        Math.min(((mr * mainKpi) + (sr * subKpi * subWeight)) / denom, 100);

    const completionRate = blendRate(mainRate.completion, subRate.completion);
    const complianceRate = blendRate(mainRate.compliance, subRate.compliance);
    const earlyRate = blendRate(mainRate.early, subRate.early);
    const earlyBonus = getEarlyBonusFromRules(earlyRate, rules.earlyBonus);

    const weightedScore = completionRate * rules.weights.completion + complianceRate * rules.weights.compliance;
    const totalScore = Math.min(Math.round(weightedScore + earlyBonus), 100);

    return {
        totalIssues,
        completedIssues,
        delayedIssues,
        earlyIssues,
        compliantIssues,
        agreedDelayIssues,
        // v1.0.20: weighted return에서 누락됐던 cancelled·rejected 카운트 명시
        cancelledIssues: main.cancelledIssues + sub.cancelledIssues,
        rejectedIssues: main.rejectedIssues + sub.rejectedIssues,
        noDueDateCount,
        completionRate: Math.round(completionRate),
        complianceRate: Math.round(complianceRate),
        earlyRate: Math.round(earlyRate),
        grades: {
            completion: getGradeFromRules(completionRate, rules.grades) as KpiGrade,
            compliance: getGradeFromRules(complianceRate, rules.grades) as KpiGrade,
            earlyBonus,
            total: getGradeFromRules(totalScore, rules.grades) as KpiGrade,
        },
        totalScore,
        measurable: true,
        mainOnly: main,
        subOnly: sub,
        appliedSubWeight: subWeight,
        weightedTotalRaw: totalIssues,
        weightedCompletedRaw: completedIssues,
    };
}
