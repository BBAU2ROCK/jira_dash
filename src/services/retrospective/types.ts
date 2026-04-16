/** 완료 에픽 회고 분석 — 공유 타입 */

export interface EpicRetroSummary {
    epicKey: string;
    epicSummary: string;
    /** 에픽 자체 상태 (Done이면 완전 완료 회고, 진행 중이면 부분 회고) */
    epicStatus: 'done' | 'in-progress' | 'unknown';
    /** 전체 task 수 (leaf) */
    totalTasks: number;
    /** 완료 task 수 */
    completedTasks: number;
    /** 진행 중 task 수 */
    inProgressTasks: number;
    /** 완료율 (%) */
    completionRate: number;
    /** 정시 완료율 (%) — 완료된 task 중 due 준수 */
    onTimeRate: number;
    /** 평균 cycle time (일, lead time 기반) */
    avgCycleTimeDays: number;
    /** P85 cycle time */
    p85CycleTimeDays: number;
    /** KPI 종합 점수 (kpiService.calculateKPI) */
    kpiScore: number;
    kpiGrade: 'S' | 'A' | 'B' | 'C' | 'D' | '—';
    /** 담당자별 task 분포 (프로젝트 현황 탭과 동일 수준의 상태 분해) */
    contributors: Array<{
        key: string;
        displayName: string;
        taskCount: number;
        completedCount: number;
        inProgressCount: number;
        todoCount: number;
        delayedCount: number;
    }>;
    /** 에픽 lead time (created → 마지막 task done) */
    epicLeadTimeDays: number | null;
    /** 결함 매핑이 있을 때만 채워짐 (v1.0.12: 심도 분석 필드 확장) */
    defectStats?: DefectStatsExtended;
}

/**
 * v1.0.12: 결함 회고 심도 분석 — 기존 3필드 + 신규 6필드.
 * 트렌드·타입 분포·집중 담당자·자동 권고 포함.
 */
export interface DefectStatsExtended {
    // 기존 필드
    defectCount: number;
    defectsPerCompletedTask: number; // %
    severityBreakdown: Array<{ name: string; count: number }>;

    // 신규 필드 (v1.0.12 F3-1)
    /** 결함 타입 분포 (issuetype.name — 버그/개선/보안 등) */
    typeBreakdown: Array<{ name: string; count: number }>;
    /** 주간 발생 추이 (최근 12주, 오래된 순) */
    weeklyTrend: Array<{ weekStart: string; count: number }>;
    /** 트렌드 방향 — 최근 4주 vs 이전 4주 비교 */
    trendDirection: 'improving' | 'stable' | 'worsening' | 'insufficient';
    /** 결함 집중 담당자 (상위 최대 3명, 등록자·assignee 기준) */
    topAffectedPeople: Array<{ name: string; count: number; pctOfEpic: number }>;
    /** 자동 생성된 권고 메시지 (최대 3건) */
    recommendations: string[];
    /**
     * 팀 평균 Defect Density 대비 델타(pct points).
     * 양수 = 평균보다 높음(나쁨), 음수 = 평균보다 낮음(좋음).
     * 팀 baseline 산출 불가 시 null.
     */
    densityVsTeamAvg: number | null;
}

export interface EpicComparisonRow extends EpicRetroSummary {
    /** 평균 대비 차이 (각 메트릭에 대해) */
    deltaFromAvg: {
        completionRate: number;
        onTimeRate: number;
        avgCycleTime: number;
        kpiScore: number;
    };
}

/** 개발자 강점 매트릭스 row */
export interface DeveloperStrengthRow {
    /** personKey */
    key: string;
    displayName: string;
    /** 담당 전체 task (leaf 기준 — 프로젝트 현황/에픽 회고와 동일 카운트 방법) */
    assignedTasks: number;
    /** 완료 task (cycle time 산출 대상) */
    completedTasks: number;
    /** type별 cell — cycle time 평균 (일). 완료 task만 포함 */
    byType: Map<string, { count: number; avgCycleTimeDays: number }>;
}
