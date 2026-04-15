import { useProjectSelectionStore } from '@/stores/projectSelectionStore';
import { useBacklogForecast } from '@/hooks/useBacklogForecast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    RefreshCw,
    AlertCircle,
    Loader2,
    Layers,
    CalendarRange,
    AlertTriangle,
    TrendingUp,
    Clock,
    Users,
} from 'lucide-react';
import { ProjectSelector } from './ProjectSelector';
import { CategorySection } from './CategorySection';
import { BacklogStateCards } from './BacklogStateCards';
import { TodayWeekCards } from './TodayWeekCards';
import { DelayCards } from './DelayCards';
import { DailyCompletionChart } from './DailyCompletionChart';
import { EtaScenarioCard } from './EtaScenarioCard';
import { ForecastFunnelChart } from './ForecastFunnelChart';
import { PerAssigneeTable } from './PerAssigneeTable';
import { EffortReportCard } from './EffortReportCard';
import { EtaEffortConsistency } from './EtaEffortConsistency';
import { MethodologyDialog } from './MethodologyDialog';
import { scopeStatusMeta } from '@/services/prediction';

/**
 * 진행 추이/예측 탭 — 6개 카테고리로 그룹화된 진입점.
 *
 * 카테고리 (좌→우, 위→아래 순서):
 *   1. 📊 현황 (Backlog State)
 *   2. 📅 일일 활동 (Daily Activity)
 *   3. ⚠ 지연 분석 (Delay Analysis)
 *   4. 🔮 완료 예측 (Forecast)
 *   5. 💼 공수 분석 (Effort Analysis)
 *   6. 👥 팀 분포 (Team Workload)
 */
export function ProgressTrends() {
    const projectKey = useProjectSelectionStore((s) => s.selectedProjectKey);
    const {
        counts,
        dailySeries,
        team,
        effort,
        effortConfidence,
        validation,
        isLoading,
        isFetching,
        error,
        refetch,
    } = useBacklogForecast(projectKey);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin mb-3" />
                <p className="text-sm">{projectKey} 프로젝트 데이터 로딩 중...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-semibold">데이터 로드 실패</p>
                        <p className="mt-0.5">{error.message}</p>
                        {String(error.message).includes('401') && (
                            <p className="mt-1 text-xs">우상단 [설정]에서 Jira 자격증명을 확인하세요.</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    const isBacklogEmpty = counts != null && counts.active === 0;
    const scopeMeta = team ? scopeStatusMeta(team.scopeStatus) : null;

    return (
        <div className="space-y-4">
            {/* ───── Header: ProjectSelector + 새로고침 + 방법론 ───── */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                <ProjectSelector />
                <div className="flex items-center gap-2">
                    <MethodologyDialog />
                    <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                        <RefreshCw className={cn('h-3.5 w-3.5 mr-1', isFetching && 'animate-spin')} />
                        새로고침
                    </Button>
                </div>
            </div>

            {/* ───── 1. 현황 ───── */}
            <CategorySection
                icon={Layers}
                title="현황"
                subtitle="백로그 전체 상태 — 잔여·활성·보류·미할당·완료·마감일 미설정"
                accent="blue"
            >
                <BacklogStateCards counts={counts} />
            </CategorySection>

            {/* 백로그 비어있음 안내 — IGMU 시나리오 */}
            {isBacklogEmpty && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                    🎉 활성 백로그가 비어 있습니다. 이번 화면의 예측·분석 항목은 표시할 데이터가 없습니다.
                </div>
            )}

            {/* ───── 2. 일일 활동 ───── */}
            <CategorySection
                icon={CalendarRange}
                title="일일 활동"
                subtitle="오늘·이번주 완료 + 최근 30일 일별 추이"
                accent="cyan"
            >
                <TodayWeekCards counts={counts} />
                {!isBacklogEmpty && <DailyCompletionChart series={dailySeries} />}
            </CategorySection>

            {/* ───── 3. 지연 분석 ───── */}
            <CategorySection
                icon={AlertTriangle}
                title="지연 분석"
                subtitle="미완료 지연(지금 처리 필요) · 완료 지연(회복 완료) · 마감일 미설정"
                accent="orange"
            >
                <DelayCards counts={counts} />
            </CategorySection>

            {/* ───── 4. 완료 예측 ───── */}
            {!isBacklogEmpty && (
                <CategorySection
                    icon={TrendingUp}
                    title="완료 예측"
                    subtitle="Monte Carlo 처리량 시뮬레이션 — 3 시나리오 + 확률 분포"
                    accent="indigo"
                    headerRight={
                        scopeMeta && team && (
                            <span
                                className={cn(
                                    'rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
                                    scopeMeta.color === 'red' && 'border-red-300 bg-red-100 text-red-800',
                                    scopeMeta.color === 'amber' && 'border-amber-300 bg-amber-100 text-amber-800',
                                    scopeMeta.color === 'green' && 'border-green-300 bg-green-100 text-green-800',
                                    scopeMeta.color === 'blue' && 'border-blue-300 bg-blue-100 text-blue-800'
                                )}
                                title={scopeMeta.description}
                            >
                                {scopeMeta.icon} Scope: {scopeMeta.label} ({team.scopeRatio.toFixed(2)}x)
                            </span>
                        )
                    }
                >
                    {/* Scope 상세 알림 (위기/성장 상태일 때만) */}
                    {scopeMeta && team && (scopeMeta.color === 'red' || scopeMeta.color === 'amber') && (
                        <div
                            className={cn(
                                'rounded-md border p-2 text-xs',
                                scopeMeta.color === 'red' && 'border-red-300 bg-red-50 text-red-900',
                                scopeMeta.color === 'amber' && 'border-amber-300 bg-amber-50 text-amber-900'
                            )}
                        >
                            <span className="font-semibold">{scopeMeta.icon} {scopeMeta.label}:</span> {scopeMeta.description}
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <EtaScenarioCard team={team} />
                        <ForecastFunnelChart team={team} />
                    </div>
                </CategorySection>
            )}

            {/* ───── 5. 공수 분석 ───── */}
            {!isBacklogEmpty && (
                <CategorySection
                    icon={Clock}
                    title="공수 분석"
                    subtitle="잔여 백로그 추정 공수 + 처리량 ETA와의 정합성 검증"
                    accent="purple"
                >
                    <EffortReportCard report={effort} confidence={effortConfidence} />
                    <EtaEffortConsistency validation={validation} />
                </CategorySection>
            )}

            {/* ───── 6. 팀 분포 ───── */}
            {!isBacklogEmpty && (
                <CategorySection
                    icon={Users}
                    title="팀 분포"
                    subtitle="담당자별 잔여·처리량·ETA — 워크로드 균형 분석 (성과 평가 X)"
                    accent="slate"
                >
                    <PerAssigneeTable team={team} />
                </CategorySection>
            )}
        </div>
    );
}
