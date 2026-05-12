/**
 * 진행 추이/예측 기능 — 공유 타입.
 *
 * 분석 보고서 §20.4 (docs/progress-prediction-analysis.md) 기준.
 * 신뢰도 등급 정의는 confidence.ts, Monte Carlo 출력은 monteCarloForecast.ts 참조.
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unreliable';

export type WorkloadQuadrant = 'overload' | 'focus' | 'capacity' | 'fast';

export type EffortSource = 'worklog' | 'planned' | 'sp' | 'difficulty' | 'cycle-time';

/** AI 도구 활용 시나리오 (3 시나리오) */
export type AiSavingsScenario = 'conservative' | 'average' | 'optimistic';

/** 이슈 카테고리 (AI 절감률 매트릭스 키) */
export type IssueCategory = 'story' | 'bug' | 'subtask' | 'test' | 'doc' | 'default';

export type ScopeStatus = 'stable' | 'growing' | 'crisis' | 'converging';

/** Monte Carlo 시뮬레이션 입력 통계 — confidence 계산에도 사용 */
export interface ThroughputStats {
    /** 활동(완료>0)이 있었던 일수 */
    activeDays: number;
    /** 참조 기간 총 일수 */
    totalDays: number;
    /** 일평균 처리량 (활동일 기준) */
    mean: number;
    /** 표준편차 */
    stddev: number;
    /** 변동계수 = stddev / mean */
    cv: number;
    /** 신규/완료 비율 — 1.0 이상이면 scope 발산 신호 */
    scopeRatio: number;
}

/** 단일 forecast 결과 (팀 또는 개인) */
export interface ForecastResult {
    p50Days: number;
    p85Days: number;
    p95Days: number;
    p50Date: Date;
    p85Date: Date;
    p95Date: Date;
    confidence: ConfidenceLevel;
    /** 사용자에게 표시할 경고/주의 사항 */
    warnings: string[];
    /** 시뮬레이션에 사용된 통계 (UI 상세 패널용) */
    stats: ThroughputStats;
    /** 잔여 이슈 수 (시뮬레이션 입력값) */
    remainingCount: number;
}

/** 담당자별 예측 행 */
export interface PerAssigneeForecast {
    /** personKey (id:accountId 또는 n:normalized name) */
    key: string;
    displayName: string;
    /** 활성 백로그 잔여 (보류 제외) */
    remaining: number;
    /** 보류 상태 건수 */
    onHold: number;
    /** 최근 N일 중 활동(완료) 일수 */
    activeDays: number;
    /** 활동일 기준 일평균 처리량 */
    avgDailyThroughput: number;
    /** confidence가 'unreliable'이면 null */
    forecast: ForecastResult | null;
    /** 워크로드 4분위 분류 (Tier 3에서만 시각화 — Tier 2에서는 데이터만 보존) */
    quadrant: WorkloadQuadrant;
}

/** 팀 forecast — 3 시나리오 + 담당자별 + scope 정보 */
export interface TeamForecast {
    /** 풀(자유 재할당) 가정 — 가장 낙관적 */
    optimistic: ForecastResult;
    /** 현재 할당 유지 가정 — 권장 약속 (max(개인 ETA)) */
    realistic: ForecastResult;
    /** 병목 인원 — realistic 산정에 결정적 영향 */
    bottleneck: PerAssigneeForecast | null;
    /** 담당자별 분해 */
    perAssignee: PerAssigneeForecast[];
    /** 미할당 이슈 카운트 (예측에서 제외) */
    unassignedCount: number;
    /** 보류 상태 카운트 (예측에서 제외) */
    onHoldCount: number;
    /** 신규 생성 / 완료 비율 */
    scopeRatio: number;
    /** scope 분류 */
    scopeStatus: ScopeStatus;
}

/** 단일 이슈의 공수 예측 */
export interface IssueEffortPrediction {
    issueKey: string;
    summary: string;
    /** 예측 인시 (mid-point) */
    hours: number;
    /** 신뢰 구간 하한 */
    hoursLow: number;
    /** 신뢰 구간 상한 */
    hoursHigh: number;
    source: EffortSource;
    confidence: ConfidenceLevel;
    /** v1.0.32: planned source 메타데이터 — UI tooltip 및 AI 절감 산정에 사용 */
    meta?: {
        /** 계획 영업일 수 (planned source일 때) */
        plannedDays?: number;
        /** 난이도 라벨 (있으면 — '상'/'중'/'하' 등) */
        difficultyLabel?: string;
        /** 이슈 타입 이름 (Story / Bug / Sub-task / Test 등) */
        issueTypeName?: string;
    };
}

/** AI 절감 추정 — 단일 이슈 */
export interface IssueAiSavings {
    issueKey: string;
    summary: string;
    /** 분류된 카테고리 */
    category: IssueCategory;
    /** 원본 추정 시간 (predictIssueEffort 결과) */
    baseHours: number;
    /** 적용된 절감률 (난이도 보정 후 최종, 0~1) */
    appliedReduction: number;
    /** 절감 후 시간 */
    savedHours: number;
    /** AI 적용 시 시간 */
    afterHours: number;
}

/** AI 도구 활용 시 절감 시뮬레이션 결과 */
export interface AiSavingsReport {
    /** 시나리오별 결과 (보수/평균/낙관) */
    scenarios: Record<AiSavingsScenario, {
        /** 평균 절감률 (가중) */
        avgReductionPct: number;
        /** 절감 후 인일 (mid) */
        savedManDaysMid: number;
        /** 절감 후 총 인일 (mid) */
        afterManDaysMid: number;
        /** 절감 후 총 인월 */
        afterManMonthsMid: number;
        /** 절감 후 팀 캘린더 일 */
        afterTeamDays: number;
    }>;
    /** 카테고리별 분해 (평균 시나리오 기준) */
    byCategory: Array<{
        category: IssueCategory;
        label: string;
        count: number;
        baseManDays: number;
        savedManDays: number;
        afterManDays: number;
        reductionPct: number;
    }>;
    /** 효과 큰 이슈 Top 5 (평균 시나리오 기준) */
    topImpactIssues: IssueAiSavings[];
    /** 사용된 사용자 설정 (UI에서 표시) */
    config: AiSavingsConfig;
    /** 적용 가능 (worklog 데이터 등) 신뢰도 */
    confidence: ConfidenceLevel;
}

/** AI 절감 사용자 설정 (Zustand persist) */
export interface AiSavingsConfig {
    /** 카테고리별 평균 시나리오 절감률 (0~1). 보수/낙관은 ±10%pt 자동 산출. */
    reductionByCategory: Record<IssueCategory, number>;
    /** 난이도 보정 — 라벨 → 곱셈 계수 */
    difficultyMultiplier: Record<string, number>;
}

/** 백로그 전체 공수 보고
 *
 * v1.0.16: 사용자 친화 단위로 표시 — 시간 단위 제거, 일/월 기준.
 *   - 일(인일) = 작업자 1명이 8시간 일한 만큼
 *   - 월       = 영업일 20일 기준 (한 달 ≈ 4주 × 5일)
 *   내부 계산은 시간(인시) 그대로 보존하되 UI는 일·월로 노출.
 */
export interface BacklogEffortReport {
    /** mid-point 총 인시 (내부 계산용 — UI 직접 노출 X) */
    totalHoursMid: number;
    totalHoursLow: number;
    totalHoursHigh: number;
    /** 인일(8시간 기준) 환산 — 작업자 1명 기준 추정 일수 */
    totalManDaysMid: number;
    totalManDaysLow: number;
    totalManDaysHigh: number;
    /** v1.0.16: 인월 환산 — 작업자 1명 기준 추정 개월 (1 인월 = 20 영업일) */
    totalManMonthsMid: number;
    totalManMonthsLow: number;
    totalManMonthsHigh: number;
    /** 데이터 출처별 분포 */
    sourceMix: { source: EffortSource; count: number; hours: number; manDays: number }[];
    /** 이슈별 예측 (Tier 2에서는 그루밍 표 미노출, 데이터만 보존) */
    perIssue: IssueEffortPrediction[];
    /** 팀 capacity 가정 (UI 슬라이더는 Tier 3) */
    teamCapacityAssumption: {
        headcount: number;
        utilization: number;
        teamDaysMid: number;
        /** v1.0.16: 팀 환산 월 (teamDaysMid / 20) */
        teamMonthsMid: number;
    };
    /** ETA-공수 일관성 검증 결과 */
    consistencyWithEta?: {
        teamEtaDays: number;
        effortEtaDays: number;
        gapPct: number;
        warning?: string;
    };
    /** worklog 커버리지가 낮아 cycle time fallback만 사용된 경우 true */
    cycleTimeFallbackOnly: boolean;
}

/** v1.0.16: 1 인월 = 20 영업일 기준 (4주 × 5일) */
export const BUSINESS_DAYS_PER_MONTH = 20 as const;

/** 일별 처리량 포인트 */
export interface DailyPoint {
    /** 'YYYY-MM-DD' */
    date: string;
    count: number;
}

/** 백로그 상태 카운트 (6 카드 데이터) */
export interface BacklogStateCounts {
    total: number;
    active: number;
    onHold: number;
    unassigned: number;
    completed90d: number;
    overdueInProgress: number;
    lateCompletion: number;
    noDueDate: number;
    completedToday: number;
    completedThisWeek: number;
}
