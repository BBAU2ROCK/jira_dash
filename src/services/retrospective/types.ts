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
    /** 결함 매핑이 있을 때만 채워짐 */
    defectStats?: {
        defectCount: number;
        defectsPerCompletedTask: number; // %
        severityBreakdown: Array<{ name: string; count: number }>;
    };
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
