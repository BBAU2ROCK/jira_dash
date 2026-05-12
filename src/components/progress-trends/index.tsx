import React from 'react';
import { useDisplayPreferenceStore } from '@/stores/displayPreferenceStore';
import { useBacklogForecast } from '@/hooks/useBacklogForecast';
import { useDefectKpiAggregation } from '@/hooks/useDefectKpiAggregation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';
import {
    AlertCircle,
    Layers,
    CalendarRange,
    AlertTriangle,
    TrendingUp,
    Users,
    EyeOff,
    Eye,
    Folder,
    Telescope,
    History,
    Trophy,
    Scale,
    Award,
    Bug,
} from 'lucide-react';
import { CategorySection } from './CategorySection';
import { SectionDivider } from './SectionDivider';
import { EpicRetroCard } from './EpicRetroCard';
import { EpicDefectCard } from './EpicDefectCard';
import { MultiEpicCompare } from './MultiEpicCompare';
import { DeveloperStrengthMatrix } from './DeveloperStrengthMatrix';
import { DefectPatternCard } from './DefectPatternCard';
import { analyzeEpicsRetrospective } from '@/services/retrospective/epicRetro';
import { BacklogStateCards } from './BacklogStateCards';
import { TodayWeekCards } from './TodayWeekCards';
import { DelayCards } from './DelayCards';
import { DailyCompletionChart } from './DailyCompletionChart';
import { EtaScenarioCard } from './EtaScenarioCard';
import { ForecastGlossaryTip } from './ForecastGlossaryTip';
import { DataReadinessCard } from './DataReadinessCard';
import { ScopeInflowCard } from './ScopeInflowCard';
import { BacklogProgressCard } from './BacklogProgressCard';
import { analyzeInflow } from '@/services/prediction/scopeInflowAnalysis';
import { ForecastFunnelChart } from './ForecastFunnelChart';
import { ForecastAccuracyCard } from './ForecastAccuracyCard';
import { SprintForecastCard } from './SprintForecastCard';
import { PerAssigneeTable } from './PerAssigneeTable';
import { WorkloadScatter } from './WorkloadScatter';
import { MethodologyDialog } from './MethodologyDialog';
import { ExportMenu } from './ExportMenu';
import { scopeStatusMeta } from '@/services/prediction';
import { useKpiRulesStore } from '@/stores/kpiRulesStore';
import type { JiraIssue } from '@/api/jiraClient';

interface ProgressTrendsProps {
    /** dashboard에서 사이드바 선택 에픽 기반으로 fetch한 이슈 (raw, filterLeafIssues 미적용) */
    issues: JiraIssue[];
    /** 선택된 에픽 키 목록 — 헤더 표시용 */
    selectedEpicIds: string[];
    /** 선택된 에픽 객체 (제목 표시용) */
    epics: JiraIssue[];
}

/**
 * 진행 추이/예측 탭 — 사이드바에서 선택된 에픽 기준 분석.
 *
 * 데이터 소스: dashboard.tsx의 ['issues', selectedEpicIds] useQuery 결과
 *   → ProjectStatsDialog → ProgressTrends(issues, ...) 로 전달
 *
 * 정직성 원칙 (Tier 2):
 *   - 활성 백로그 0건이라도 완료·공수·담당자별 통계는 표시 (사용자 의도)
 *   - ETA·Funnel·Sprint는 잔여 의존이라 활성 0건일 때 안내로 대체
 */
export function ProgressTrends({ issues, selectedEpicIds, epics }: ProgressTrendsProps) {
    // v1.0.10 S2: store에서 구독 — 설정 변경 시 자동 반영
    const projectKey = useKpiRulesStore((s) => s.rules.dashboardProjectKey);
    const anonymizeMode = useDisplayPreferenceStore((s) => s.anonymizeMode);
    const toggleAnonymize = useDisplayPreferenceStore((s) => s.toggleAnonymizeMode);

    // v1.0.33: 공수 카드 자체는 매니저 콘솔로 이전. effort는 ExportMenu에 prop으로만 전달.
    // v1.0.43: leadTimeForecast 추가 — Throughput MC 보완 ETA + 개별 이슈 ETA용
    // v1.0.47: backlogProgress 추가 — 정적 모델 감지 + 진척률
    const {
        counts,
        dailySeries,
        team,
        effort,
        leadTimeForecast,
        backlogProgress,
    } = useBacklogForecast(issues, { projectKey });

    // 결함 KPI (KPI 성과 탭과 동일 데이터, 회고에 통합) — early return 전에 호출 (Hook 규칙)
    const defectKpi = useDefectKpiAggregation();

    // v1.0.42: 신규 유입 분석 — DataReadinessCard / ScopeInflowCard 공유.
    // 두 카드가 같은 inflow 결과를 보도록 useMemo로 단일 산정.
    const inflowAnalysis = React.useMemo(
        () => (issues ? analyzeInflow(issues, 30) : null),
        [issues]
    );

    if (selectedEpicIds.length === 0) {
        return (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-300">
                <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-semibold">에픽을 선택하세요</p>
                        <p className="mt-0.5">사이드바에서 분석 대상 에픽을 1개 이상 선택해야 진행 추이/예측을 볼 수 있습니다.</p>
                    </div>
                </div>
            </div>
        );
    }

    const selectedEpicTitles = selectedEpicIds
        .map((id) => epics.find((e) => e.key === id)?.fields.summary ?? id)
        .join(', ');

    const hasActiveBacklog = (counts?.active ?? 0) > 0;
    const hasCompletionData = (counts?.completed90d ?? 0) > 0;
    const scopeMeta = team ? scopeStatusMeta(team.scopeStatus) : null;

    // v1.0.31: 회고 영역도 KPI 성과 탭과 동일 원칙 — 매핑이 있으면 매핑 dev 에픽 기반.
    //   매핑 없을 때만 사이드바 선택 기반.
    //   사용자 의도: "KPI 성과 탭과 회고 영역은 매핑 정보가 있으면 그 매핑 정보 기반"
    const retroMode: 'mapping' | 'sidebar' = defectKpi.mappingCount > 0 ? 'mapping' : 'sidebar';
    const retroEpicKeys = retroMode === 'mapping' ? defectKpi.mappedDevEpicKeys : selectedEpicIds;
    const retroIssues = retroMode === 'mapping'
        ? Array.from(defectKpi.devIssuesByEpic.values()).flat()
        : issues;
    const retro = analyzeEpicsRetrospective(retroIssues, retroEpicKeys, defectKpi.defectStatsByDevEpic);

    return (
        <div className="space-y-4">
            {/* ───── Header: 컨텍스트 + 익명화 + Export + 방법론 ───── */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                    <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-semibold text-foreground/90">{projectKey}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-xs text-foreground/80 truncate" title={selectedEpicTitles}>
                        에픽 <strong>{selectedEpicIds.length}</strong>개 선택 ({selectedEpicTitles.slice(0, 60)}{selectedEpicTitles.length > 60 ? '…' : ''})
                    </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <ThemeToggle />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={toggleAnonymize}
                        title={anonymizeMode ? '실명 모드로 전환' : '익명 모드로 전환 (외부 공유 시)'}
                        className={cn(anonymizeMode && 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-200')}
                    >
                        {anonymizeMode ? (
                            <><EyeOff className="h-3.5 w-3.5 mr-1" /> 익명</>
                        ) : (
                            <><Eye className="h-3.5 w-3.5 mr-1" /> 실명</>
                        )}
                    </Button>
                    <ExportMenu
                        projectKey={projectKey}
                        counts={counts}
                        team={team}
                        effort={effort}
                        dailySeries={dailySeries}
                    />
                    <MethodologyDialog />
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ═══ A. 예측 (Forecast) — 현재 상태 + 미래 ETA ═══              */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <SectionDivider
                tone="forecast"
                icon={Telescope}
                label="A. 예측"
                subtitle="현재 상태 + 미래 ETA + 처리량 분석 — 진행 중인 작업의 가시성"
            />

            {/* ───── 1. 현황 ───── */}
            <CategorySection
                icon={Layers}
                title="현황"
                subtitle="선택한 에픽 내 이슈 — 잔여·활성·보류·미배정·완료·마감일 미설정"
                accent="blue"
            >
                <BacklogStateCards counts={counts} />
            </CategorySection>

            {/* 백로그 비어있을 때 안내 (분석은 계속 진행) */}
            {!hasActiveBacklog && hasCompletionData && (
                <EmptyState
                    variant="success"
                    title="🎉 활성 백로그가 없습니다"
                    description="미래 예측(ETA·Funnel·Sprint)은 표시할 데이터가 없지만, 완료 데이터 기반 분석(일별 추이·공수·담당자별·정확도)은 그대로 제공됩니다."
                />
            )}
            {!hasActiveBacklog && !hasCompletionData && (
                <EmptyState
                    title="선택한 에픽에 활성/완료 이슈가 모두 없습니다"
                    description="다른 에픽을 선택해 보세요."
                />
            )}

            {/* ───── 2. 일일 활동 (완료 데이터 — 활성 0이어도 표시) ───── */}
            <CategorySection
                icon={CalendarRange}
                title="일일 활동"
                subtitle="오늘·이번주 완료 + 최근 30일 일별 추이"
                accent="cyan"
            >
                <TodayWeekCards counts={counts} />
                <DailyCompletionChart series={dailySeries} />
            </CategorySection>

            {/* ───── 3. 지연 분석 ─────
                v1.0.37: 매니저 콘솔의 Risk Board (즉시 액션 6 카드)와 차별 명시 — 여기는 통계, 거기는 액션. */}
            <CategorySection
                icon={AlertTriangle}
                title="지연 분석"
                subtitle="미완료 지연(지금 처리 필요) · 완료 지연(회복 완료) · 마감일 미설정 — 통계 보기. 즉시 액션은 매니저 콘솔의 🔥 리스크 보드"
                accent="orange"
            >
                <DelayCards counts={counts} />
            </CategorySection>

            {/* ───── 4. 완료 예측 (활성 잔여 의존) ───── */}
            <CategorySection
                icon={TrendingUp}
                title="완료 예측"
                titleAfter={<ForecastGlossaryTip />}
                subtitle="Monte Carlo 처리량 시뮬레이션 — 3 시나리오 + 확률 분포"
                accent="indigo"
                headerRight={
                    scopeMeta && team && hasActiveBacklog && (
                        <span
                            className={cn(
                                'rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
                                scopeMeta.color === 'red' && 'border-red-300 dark:border-red-900/60 bg-red-100 text-red-800 dark:text-red-300',
                                scopeMeta.color === 'amber' && 'border-amber-300 dark:border-amber-900/60 bg-amber-100 text-amber-800 dark:text-amber-300',
                                scopeMeta.color === 'green' && 'border-green-300 dark:border-green-900/60 bg-green-100 text-green-800 dark:text-green-300',
                                scopeMeta.color === 'blue' && 'border-blue-300 dark:border-blue-900/60 bg-blue-100 text-blue-800 dark:text-blue-300'
                            )}
                            title={scopeMeta.description}
                        >
                            {scopeMeta.icon} Scope: {scopeMeta.label} ({team.scopeRatio.toFixed(2)}x)
                        </span>
                    )
                }
            >
                {!hasActiveBacklog ? (
                    <>
                        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground/80">
                            활성 잔여가 0건이라 미래 ETA 예측은 의미가 없습니다. 정확도 기록은 아래에서 확인.
                        </div>
                        <ForecastAccuracyCard projectKey={projectKey} leadTime={leadTimeForecast} />
                    </>
                ) : (
                    <>
                        {scopeMeta && team && (scopeMeta.color === 'red' || scopeMeta.color === 'amber') && (
                            <div
                                className={cn(
                                    'rounded-md border p-2 text-xs',
                                    scopeMeta.color === 'red' && 'border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-300',
                                    scopeMeta.color === 'amber' && 'border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300'
                                )}
                            >
                                <span className="font-semibold">{scopeMeta.icon} {scopeMeta.label}:</span> {scopeMeta.description}
                            </div>
                        )}
                        {/* v1.0.16: 데이터 충족 현황 — 다음 등급까지 필요한 조건
                            v1.0.40: scope + bottleneckName 전달 → "이 stats가 어떤 시나리오 기반인지" 즉시 명시 */}
                        <DataReadinessCard
                            stats={team?.realistic.stats ?? null}
                            scope={team?.bottleneck ? 'bottleneck' : 'team'}
                            bottleneckName={team?.bottleneck?.displayName}
                            projectStage={inflowAnalysis?.projectStage}
                            projectMode={backlogProgress?.projectMode}
                        />
                        {/* v1.0.47: 모델별 카드 분기.
                            정적 모델(초기 일괄 등록 + 처리) → BacklogProgressCard (진척률·예측 완료일)
                            활발 모델(신규 유입 + 완료 병행) → ScopeInflowCard (scope ratio·마이그레이션 분석)
                            한 시점에 한 카드만 표시 — 사용자 혼란 방지. */}
                        {backlogProgress?.projectMode === 'static' ? (
                            <BacklogProgressCard analysis={backlogProgress} />
                        ) : (
                            team && (team.scopeRatio > 1.0 || inflowAnalysis?.projectStage === 'early') && (
                                <ScopeInflowCard issues={issues} windowDays={30} />
                            )
                        )}
                        <SprintForecastCard projectKey={projectKey} team={team} />
                        {/* v1.0.37: ETA(약속) 옆에 정확도(약속의 신뢰도) 같은 row → "이 ETA를 얼마나 믿어야 하나" 즉시 판단
                            v1.0.43: leadTimeForecast 전달 — Throughput MC unreliable 시 보완 ETA 시나리오 */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <EtaScenarioCard team={team} leadTime={leadTimeForecast} projectMode={backlogProgress?.projectMode} />
                            <ForecastAccuracyCard projectKey={projectKey} leadTime={leadTimeForecast} />
                        </div>
                        <ForecastFunnelChart team={team} />
                    </>
                )}
            </CategorySection>

            {/* v1.0.33: 공수 & 예산 카테고리 전체 매니저 콘솔로 이전. 진행 추이 탭에는 안내 미표시. */}

            {/* ───── 6. 팀 분포 (담당자별 — 완료 데이터 기반 활동도 표시) ───── */}
            <CategorySection
                icon={Users}
                title="팀 분포"
                subtitle="담당자별 잔여·처리량·ETA — 워크로드 균형 분석 (성과 평가 X)"
                accent="slate"
            >
                {hasActiveBacklog && <WorkloadScatter team={team} />}
                <PerAssigneeTable team={team} issues={issues} />
            </CategorySection>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ═══ B. 회고 (Retrospective) — 완료된 작업 학습 + 패턴 분석 ═══ */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <SectionDivider
                tone="retrospective"
                icon={History}
                label="B. 회고"
                subtitle="완료된 작업 학습 + 에픽 비교 + 개발자 강점 매핑 — 코칭 도구 (성과 평가 X)"
            />

            {/* ───── 7. 에픽별 회고 — v1.0.31: KPI 성과 탭과 동일 원칙 (매핑 모드 자동 전환) ───── */}
            <CategorySection
                icon={Trophy}
                title="에픽 회고 + 결함 회고"
                subtitle={
                    retroMode === 'mapping'
                        ? '매핑된 dev 에픽 기준 분석 — 당시의 평가 내용 확인'
                        : '사이드바 선택 에픽 기준 — 좌: KPI · 우: 결함 회고 (매핑 시)'
                }
                accent="indigo"
                headerRight={
                    retroMode === 'mapping' ? (
                        <span
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-300"
                            title={`매핑된 ${defectKpi.mappingCount}개 에픽 기반 분석 — KPI 성과 탭과 동일 원칙`}
                        >
                            🔗 매핑 기반 ({defectKpi.mappedDevEpicKeys.slice(0, 2).join(', ')}{defectKpi.mappedDevEpicKeys.length > 2 ? ` 외 ${defectKpi.mappedDevEpicKeys.length - 2}` : ''})
                        </span>
                    ) : (
                        <span
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium bg-muted/40 border-border text-muted-foreground"
                            title="결함 매핑 미등록 — 사이드바 선택 에픽 기반 분석. KPI 탭에서 매핑 등록 시 자동 매핑 모드 전환."
                        >
                            📂 사이드바 선택 기반
                        </span>
                    )
                }
            >
                {retro.perEpic.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">
                        {retroMode === 'mapping'
                            ? '매핑된 에픽이 없습니다. KPI 성과 탭에서 매핑을 등록하세요.'
                            : '선택된 에픽이 없습니다.'}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {retro.perEpic.map((s) => (
                            <div key={s.epicKey} className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-3">
                                <EpicRetroCard summary={s} />
                                <EpicDefectCard
                                    summary={s}
                                    mappingDiag={{
                                        mappingCount: defectKpi.mappingCount,
                                        mappedDevEpicKeys: defectKpi.mappedDevEpicKeys,
                                        isLoading: defectKpi.isLoading,
                                        hasError: !!defectKpi.error,
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </CategorySection>

            {/* ───── 8. 다중 에픽 비교 (2개 이상 선택 시) ───── */}
            {retro.comparison.length >= 2 && (
                <CategorySection
                    icon={Scale}
                    title="다중 에픽 비교"
                    subtitle="평균 대비 KPI · 완료율 · 정시율 · cycle time delta — 벤치마킹"
                    accent="purple"
                >
                    <MultiEpicCompare rows={retro.comparison} />
                </CategorySection>
            )}

            {/* ───── 9. 개발자 강점 매트릭스 ───── */}
            <CategorySection
                icon={Award}
                title="개발자 강점 매트릭스"
                subtitle="인원 × 이슈 type cycle time heatmap — 강점·약점 매핑 (코칭 도구)"
                accent="slate"
                headerRight={
                    !anonymizeMode && (
                        <span className="rounded-full border border-amber-300 dark:border-amber-900/60 bg-amber-100 text-amber-800 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap">
                            ⚠ 외부 공유 시 익명 모드 권장
                        </span>
                    )
                }
            >
                <DeveloperStrengthMatrix rows={retro.strengthMatrix} />
            </CategorySection>

            {/* ───── 10. 담당자별 결함 패턴 (Defect Density) ───── */}
            <CategorySection
                icon={Bug}
                title="담당자별 결함 패턴"
                subtitle="Task당 결함 발생률 (Defect Density) + 심각도 분포 — KPI 성과 탭의 결함 KPI와 동일 데이터, 회고 맥락"
                accent="orange"
                headerRight={
                    !anonymizeMode && (
                        <span className="rounded-full border border-amber-300 dark:border-amber-900/60 bg-amber-100 text-amber-800 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap">
                            ⚠ 외부 공유 시 익명 모드 권장
                        </span>
                    )
                }
            >
                <DefectPatternCard
                    rows={defectKpi.rows}
                    isLoading={defectKpi.isLoading}
                    mappingCount={defectKpi.mappingCount}
                    workerFieldResolved={defectKpi.workerFieldResolved}
                    strengthRows={retro.strengthMatrix}
                />
            </CategorySection>
        </div>
    );
}
