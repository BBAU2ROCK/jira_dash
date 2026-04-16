/**
 * KPI Rules Resolver — store 우선 + JIRA_CONFIG fallback 공통 헬퍼.
 *
 * v1.0.10: v1.0.9의 kpiService 내부 resolveKpiRules 패턴을 모듈화.
 * 다른 서비스들(useBacklogForecast, perAssigneeForecast, date-utils 등)이
 * 동일한 방식으로 store 값을 참조할 수 있도록 헬퍼 함수들을 노출한다.
 *
 * 설계 원칙:
 *   - store 초기화 전에도 안전 (try/catch + JIRA_CONFIG fallback)
 *   - 매 호출 시 getState() — React 외부에서도 최신값
 *   - 순환 import 방지 — date-utils 를 import하지 않음
 */

import { JIRA_CONFIG } from '@/config/jiraConfig';
import { useKpiRulesStore, type KpiRuleSet } from '@/stores/kpiRulesStore';

/** store 규칙 우선, 실패 시 null (호출자가 JIRA_CONFIG fallback) */
export function getActiveRules(): KpiRuleSet | null {
    try {
        return useKpiRulesStore.getState().rules;
    } catch {
        return null;
    }
}

// ─── 라벨 ───────────────────────────────────────────────────────────────

export function resolveAgreedDelayLabel(): string {
    return getActiveRules()?.labels?.agreedDelay ?? JIRA_CONFIG.LABELS.AGREED_DELAY;
}

export function resolveVerificationDelayLabel(): string {
    return getActiveRules()?.labels?.verificationDelay ?? JIRA_CONFIG.LABELS.VERIFICATION_DELAY;
}

// ─── 상태명 ─────────────────────────────────────────────────────────────

export function resolveOnHoldStatus(): string {
    return getActiveRules()?.statusNames?.onHold ?? JIRA_CONFIG.STATUS_NAMES.ON_HOLD;
}

export function resolveCancelledStatus(): string {
    return getActiveRules()?.statusNames?.cancelled ?? JIRA_CONFIG.STATUS_NAMES.CANCELLED;
}

// ─── 프로젝트 ───────────────────────────────────────────────────────────

export function resolveDashboardProjectKey(): string {
    return getActiveRules()?.dashboardProjectKey ?? JIRA_CONFIG.DASHBOARD.PROJECT_KEY;
}

export function resolveWeekStartsOn(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
    return getActiveRules()?.weekStartsOn ?? JIRA_CONFIG.WEEK_STARTS_ON;
}

// ─── 예측 파라미터 ──────────────────────────────────────────────────────

/**
 * prediction 관련 설정. store에 있는 6개 필드는 store 우선,
 * store에 없는 나머지(MONTE_CARLO_MAX_DAYS, CV 임계값 등)는 JIRA_CONFIG 고정.
 *
 * **반환 객체 shape은 JIRA_CONFIG.PREDICTION과 동일**하므로 기존 `const C = JIRA_CONFIG.PREDICTION`
 * 패턴을 `const C = resolvePredictionConfig()`로 치환만 하면 drop-in 대체 가능.
 */
export function resolvePredictionConfig() {
    const p = getActiveRules()?.prediction;
    const JC = JIRA_CONFIG.PREDICTION;
    return {
        DEFAULT_HISTORY_DAYS: p?.defaultHistoryDays ?? JC.DEFAULT_HISTORY_DAYS,
        MONTE_CARLO_TRIALS: p?.monteCarloTrials ?? JC.MONTE_CARLO_TRIALS,
        DEFAULT_UTILIZATION: p?.defaultUtilization ?? JC.DEFAULT_UTILIZATION,
        ETA_EFFORT_GAP_THRESHOLD: p?.etaEffortGapThreshold ?? JC.ETA_EFFORT_GAP_THRESHOLD,
        SP_COVERAGE_THRESHOLD: p?.spCoverageThreshold ?? JC.SP_COVERAGE_THRESHOLD,
        WORKLOG_COVERAGE_THRESHOLD: p?.worklogCoverageThreshold ?? JC.WORKLOG_COVERAGE_THRESHOLD,
        // ↓ store에 없으므로 JIRA_CONFIG 고정 (필요 시 store 필드 확장)
        MONTE_CARLO_MAX_DAYS: JC.MONTE_CARLO_MAX_DAYS,
        MIN_ACTIVE_DAYS_RELIABLE: JC.MIN_ACTIVE_DAYS_RELIABLE,
        HIGH_CONFIDENCE_ACTIVE_DAYS: JC.HIGH_CONFIDENCE_ACTIVE_DAYS,
        LOW_CONFIDENCE_CV: JC.LOW_CONFIDENCE_CV,
        UNRELIABLE_CV: JC.UNRELIABLE_CV,
        SCOPE_CRISIS_RATIO: JC.SCOPE_CRISIS_RATIO,
        SCOPE_GROWING_RATIO: JC.SCOPE_GROWING_RATIO,
    };
}

// ─── 필드 ID ────────────────────────────────────────────────────────────

/**
 * Jira 커스텀 필드 ID 묶음. store 우선 참조.
 * 기존 `JIRA_CONFIG.FIELDS.XXX` 패턴을 `resolveFields().XXX` 로 치환.
 */
export function resolveFields() {
    const f = getActiveRules()?.fields;
    const JF = JIRA_CONFIG.FIELDS;
    return {
        STORY_POINT: f?.storyPoint ?? JF.STORY_POINT,
        PLANNED_START: f?.plannedStart ?? JF.PLANNED_START,
        ACTUAL_START: f?.actualStart ?? JF.ACTUAL_START,
        ACTUAL_DONE: f?.actualDone ?? JF.ACTUAL_DONE,
        DIFFICULTY: f?.difficulty ?? JF.DIFFICULTY,
    };
}

// ─── 가중치 / 등급 / 보너스 (v1.0.9 K1 재사용) ──────────────────────────

export function resolveWeights(): { completion: number; compliance: number } {
    return getActiveRules()?.weights ?? { completion: 0.5, compliance: 0.5 };
}

export function resolveGrades() {
    return (
        getActiveRules()?.grades ?? { S: 95, A: 90, B: 80, C: 70 }
    );
}

export function resolveEarlyBonus() {
    return (
        getActiveRules()?.earlyBonus ?? [
            { minRate: 50, bonus: 5 },
            { minRate: 40, bonus: 4 },
            { minRate: 30, bonus: 3 },
            { minRate: 20, bonus: 2 },
            { minRate: 10, bonus: 1 },
        ]
    );
}
