/**
 * v1.0.33: 매니저 콘솔 "공수 & 예산" 탭 컨테이너.
 *
 * 구성:
 *   1. EffortReportCard — 백로그 공수 추정 (요약)
 *   2. PerIssueEffortTable — 이슈별 그루밍 표 (default 10줄, 펼침 가능)
 *   3. AiSavingsCard — AI 도구 절감 시뮬레이션 (3 시나리오 + 슬라이더)
 *   4. AiRoiCalculator — AI 도구 ROI (도구 비용 입력 → 순효과)
 *   5. BudgetSimulatorCard — 예산 시뮬레이터 (인원/utilization → 캘린더)
 *   6. QuarterlyEffortTrendCard — 월별 공수 트렌드 (line chart)
 *   7. TeamEffortHeatmap — 담당자 × 카테고리 히트맵
 *
 * 데이터: useBacklogForecast(issues) — 진행 추이/예측 탭과 동일 hook 호출.
 *   별도 인스턴스이지만 React useMemo가 잘 동작하면 비용 작음.
 */
import { useMemo } from 'react';
import { useBacklogForecast } from '@/hooks/useBacklogForecast';
import { filterLeafIssues, getStatusCategoryKey } from '@/lib/jira-helpers';
import { resolveCancelledStatus, resolveRejectedStatus } from '@/lib/kpi-rules-resolver';
import { EffortReportCard } from '@/components/progress-trends/EffortReportCard';
import { PerIssueEffortTable } from '@/components/progress-trends/PerIssueEffortTable';
import { AiSavingsCard } from '@/components/progress-trends/AiSavingsCard';
import { EtaEffortConsistency } from '@/components/progress-trends/EtaEffortConsistency';
import { CycleTimeCard } from '@/components/progress-trends/CycleTimeCard';
import { PerIssueEtaCard } from './PerIssueEtaCard';
import { QuarterlyEffortTrendCard } from './QuarterlyEffortTrendCard';
import { TeamEffortHeatmap } from './TeamEffortHeatmap';
import { BudgetSimulatorCard } from './BudgetSimulatorCard';
import { AiRoiCalculator } from './AiRoiCalculator';
import type { JiraIssue } from '@/api/jiraClient';

interface Props {
    issues: JiraIssue[];
}

export function BudgetEffortPanel({ issues }: Props) {
    const { effort, effortConfidence, validation, cycleTimeStats, leadTimeForecast } = useBacklogForecast(issues);

    const hasActiveBacklog = effort && effort.perIssue.length > 0;

    // active 이슈 (heatmap에서 assignee 매칭용)
    const activeIssues = useMemo(() => {
        const cancelled = resolveCancelledStatus();
        const rejected = resolveRejectedStatus();
        const leaf = filterLeafIssues(issues);
        return leaf.filter((i) => {
            const cat = getStatusCategoryKey(i);
            const name = i.fields.status?.name;
            return cat !== 'done' && name !== cancelled && name !== rejected;
        });
    }, [issues]);

    if (issues.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground text-sm">
                선택된 에픽이 없습니다. 사이드바에서 에픽을 선택하세요.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Row 1: 백로그 공수 (요약) + 예산 시뮬레이터 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <EffortReportCard report={effort} confidence={effortConfidence} />
                <BudgetSimulatorCard report={effort} />
            </div>

            {/* Row 2: ETA-공수 정합성 + Cycle time 분포 */}
            {hasActiveBacklog && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <EtaEffortConsistency validation={validation} />
                    <CycleTimeCard
                        stats={cycleTimeStats}
                        sampleNote="첫 50건 sampling — 정밀 분석은 이슈 상세를 한 번 이상 열어 changelog 캐시 후."
                    />
                </div>
            )}

            {/* Row 3: 이슈별 공수 (그루밍) */}
            <PerIssueEffortTable report={effort} />

            {/* v1.0.43 Row 3.5: 개별 이슈 ETA (Lead Time 기반) — overdue 이슈 즉시 식별 */}
            {hasActiveBacklog && <PerIssueEtaCard leadTime={leadTimeForecast} />}

            {/* Row 4: AI 절감 시뮬레이션 + ROI */}
            <AiSavingsCard report={effort} />
            <AiRoiCalculator report={effort} />

            {/* Row 5: 트렌드 + 히트맵 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <QuarterlyEffortTrendCard issues={issues} months={6} />
                <TeamEffortHeatmap activeIssues={activeIssues} report={effort} />
            </div>
        </div>
    );
}
