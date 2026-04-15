/**
 * 진행 추이/예측 기능 — 공유 타입.
 *
 * 분석 보고서 §20.4 (docs/progress-prediction-analysis.md) 기준.
 * 신뢰도 등급 정의는 confidence.ts, Monte Carlo 출력은 monteCarloForecast.ts 참조.
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unreliable';

export type WorkloadQuadrant = 'overload' | 'focus' | 'capacity' | 'fast';

export type EffortSource = 'worklog' | 'sp' | 'difficulty' | 'cycle-time';

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
}

/** 백로그 전체 공수 보고 */
export interface BacklogEffortReport {
    /** mid-point 총 인시 */
    totalHoursMid: number;
    totalHoursLow: number;
    totalHoursHigh: number;
    /** 인일(8시간 기준) 환산 */
    totalManDaysMid: number;
    /** 데이터 출처별 분포 */
    sourceMix: { source: EffortSource; count: number; hours: number }[];
    /** 이슈별 예측 (Tier 2에서는 그루밍 표 미노출, 데이터만 보존) */
    perIssue: IssueEffortPrediction[];
    /** 팀 capacity 가정 (UI 슬라이더는 Tier 3) */
    teamCapacityAssumption: {
        headcount: number;
        utilization: number;
        teamDaysMid: number;
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
