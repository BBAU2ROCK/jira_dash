import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { jiraApi, type JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues } from '@/lib/jira-helpers';
import { Sidebar } from '@/components/layout/sidebar';
import { cn } from '@/lib/utils';
import { ManagerConsole, useManagerRiskCount } from '@/components/manager-console';
import { IssueList } from '@/components/issue-list';
import { IssueDetailDrawer } from '@/components/issue-detail-drawer';
import { ProjectStatsDialog } from '@/components/project-stats-dialog';
import { JiraSettingsDialog, type JiraConfig } from '@/components/jira-settings-dialog';
import { useKpiRulesStore } from '@/stores/kpiRulesStore';
import { resolveFields } from '@/lib/kpi-rules-resolver';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { BarChart3, RefreshCw, AlertCircle, Settings, Bug, Layers, Sparkles, MousePointerClick, Briefcase } from 'lucide-react';
import { useEpicMappingStore } from '@/stores/epicMappingStore';
import { DefectKpiDashboard } from '@/components/defect-kpi-dashboard';
import { useDefectKpiAggregation } from '@/hooks/useDefectKpiAggregation';

const isElectron = typeof window !== 'undefined' && !!window.ipcRenderer;

export function Dashboard() {
    const [selectedEpicIds, setSelectedEpicIds] = React.useState<string[]>([]);
    const [selectedIssue, setSelectedIssue] = React.useState<JiraIssue | null>(null);
    const [drawerOpen, setDrawerOpen] = React.useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
    const [statsOpen, setStatsOpen] = React.useState(false);
    const [settingsOpen, setSettingsOpen] = React.useState(false);
    /** 프로젝트 통계 담당자별 현황에서 난이도/이슈 클릭 시 이슈 목록에 표시할 키만 제한 */
    const [focusIssueKeys, setFocusIssueKeys] = React.useState<string[] | null>(null);
    const [defectKpiOpen, setDefectKpiOpen] = React.useState(false);
    // v1.0.28: Manager Console
    const [managerOpen, setManagerOpen] = React.useState(false);

    const epicMappings = useEpicMappingStore((s) => s.mappings);
    const mappingCount = epicMappings.length;
    const defectKpi = useDefectKpiAggregation();

    const { data: jiraConfig } = useQuery({
        queryKey: ['jira-config'],
        queryFn: async (): Promise<JiraConfig> => {
            const res = await window.ipcRenderer!.invoke('jira-config:get');
            return res as JiraConfig;
        },
        enabled: isElectron,
        staleTime: 60 * 1000,
    });

    React.useEffect(() => {
        if (!isElectron || settingsOpen) return;
        const email = jiraConfig?.jiraEmail?.trim();
        const token = jiraConfig?.jiraApiToken?.trim();
        if (jiraConfig !== undefined && !email && !token) {
            const opened = sessionStorage.getItem('jira-settings-opened-once');
            if (!opened) {
                sessionStorage.setItem('jira-settings-opened-once', '1');
                setSettingsOpen(true);
            }
        }
    }, [isElectron, jiraConfig, settingsOpen]);

    // v1.0.10 S2: store의 dashboardProjectKey 구독 — 설정 변경 시 자동 재요청
    const dashboardProjectKey = useKpiRulesStore((s) => s.rules.dashboardProjectKey);

    // Fetch all epics — v1.0.12 hotfix: projectKey를 queryFn에 명시 전달
    //   v1.0.27: staleTime / refetchInterval 명시 (장시간 idle 후에도 신선한 데이터 유지)
    const { data: epics, isLoading: epicsLoading, error: epicsError } = useQuery({
        queryKey: ['epics', dashboardProjectKey ?? 'IGMU'],
        queryFn: () => jiraApi.getEpics(dashboardProjectKey),
        refetchOnWindowFocus: true,           // focus 복귀 시 자동 새로고침
        refetchOnReconnect: true,              // 네트워크 복구 시 자동 재요청
        refetchInterval: 15 * 60 * 1000,      // 15분마다 백그라운드 갱신
        staleTime: 5 * 60 * 1000,             // 5분 fresh
        gcTime: 30 * 60 * 1000,               // 30분 캐시 보관
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    });

    // 필드 목록(필드명 '난이도' → id 매핑, 에픽 이슈 조회 시 난이도 필드 포함용)
    const { data: allFields = [] } = useQuery({
        queryKey: ['jiraFields'],
        queryFn: () => jiraApi.getFields(),
        enabled: selectedEpicIds.length > 0 || mappingCount > 0,
        staleTime: 15 * 60 * 1000,
    });
    const difficultyFieldId = React.useMemo(() => {
        const found = (allFields as Array<{ id: string; name: string }>).find(
            (f) => f.name === '난이도' || (f.name && f.name.trim() === '난이도')
        );
        return found?.id ?? undefined;
    }, [allFields]);

    // Fetch issues for all selected epics (난이도 필드 id 반영)
    // v1.0.27: keepalive — focus/reconnect/interval 모두 활성화
    const { data: allIssues, isLoading: issuesLoading, error: issuesError, refetch, isFetching } = useQuery({
        queryKey: ['issues', selectedEpicIds, difficultyFieldId],
        queryFn: async () => {
            if (selectedEpicIds.length === 0) return [];

            const issuesArrays = await Promise.all(
                selectedEpicIds.map(epicId => jiraApi.getIssuesForEpic(epicId, difficultyFieldId))
            );

            const mergedIssues = issuesArrays.flat();
            const uniqueIssues = Array.from(
                new Map(mergedIssues.map(issue => [issue.key, issue])).values()
            );
            return uniqueIssues;
        },
        enabled: selectedEpicIds.length > 0,
        refetchOnWindowFocus: true,           // focus 복귀 자동 새로고침
        refetchOnReconnect: true,              // 네트워크 복구 자동 재요청
        refetchInterval: 15 * 60 * 1000,      // 15분 백그라운드 갱신
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    });

    const issues = allIssues || [];
    // v1.0.28: 매니저 콘솔 위험 카운트 (헤더 배지)
    const managerRiskCount = useManagerRiskCount(issues);
    // 건수 규칙: 할 일만 있으면 카운트, 하위 작업 있으면 부모 제외·하위만 반영 (통계/KPI 동일)
    const workItems = filterLeafIssues(issues);
    // v1.0.49: STORY_POINT 필드 ID 하드코딩 제거 — resolveFields() 사용
    const storyPointField = resolveFields().STORY_POINT;
    const totalSP = workItems.reduce((sum, issue) => {
        const sp = (issue.fields as Record<string, unknown>)[storyPointField];
        return sum + (typeof sp === 'number' ? sp : 0);
    }, 0);
    const issueCount = workItems.length;

    // Toggle Epic selection
    const handleEpicToggle = (epicId: string | null) => {
        if (!epicId) {
            setSelectedEpicIds([]);
            return;
        }

        setSelectedEpicIds(prev => {
            if (prev.includes(epicId)) {
                return prev.filter(id => id !== epicId);
            } else {
                return [...prev, epicId];
            }
        });
    };

    // Get selected Epic titles for header
    const selectedEpicTitles = selectedEpicIds
        .map(id => epics?.find(e => e.key === id)?.fields.summary)
        .filter(Boolean)
        .join(', ');

    return (
        <div className="flex h-screen overflow-hidden bg-background relative">
            {/* v1.0.22: Subtle radial glow background — Linear/Vercel 스타일 depth */}
            <div
                className="pointer-events-none absolute inset-0 -z-0 opacity-[0.35] dark:opacity-[0.5]"
                style={{
                    background:
                        'radial-gradient(60% 50% at 80% 0%, hsl(var(--primary) / 0.12) 0%, transparent 60%), radial-gradient(50% 40% at 0% 100%, hsl(var(--chart-2) / 0.08) 0%, transparent 60%)',
                }}
                aria-hidden
            />

            {/* Sidebar */}
            <div className={cn('relative z-10', sidebarCollapsed ? 'flex-shrink-0' : 'w-[14%] min-w-[200px] flex-shrink-0')}>
                <Sidebar
                    epics={epics || []}
                    selectedEpicIds={selectedEpicIds}
                    onSelectEpic={handleEpicToggle}
                    isLoading={epicsLoading}
                    error={epicsError as Error | null}
                    isCollapsed={sidebarCollapsed}
                    onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
                    onOpenSettings={() => setSettingsOpen(true)}
                />
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden relative z-10">
                {/* Header — v1.0.22: glassmorphism + depth */}
                <header
                    className={cn(
                        'min-h-16 grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center px-6 py-2',
                        'border-b border-border',
                        'bg-card/80 supports-[backdrop-filter]:bg-card/60 supports-[backdrop-filter]:backdrop-blur-xl',
                        'shadow-[0_1px_0_0_hsl(var(--border)),0_4px_12px_-8px_hsl(var(--foreground)/0.1)]'
                    )}
                >
                    <div className="flex items-center gap-4 min-w-0">
                        <h1 className="text-lg font-semibold tracking-tight truncate min-w-0 text-foreground">
                            {selectedEpicIds.length > 0 ? selectedEpicTitles || '선택된 Epic' : '에픽을 선택하세요'}
                        </h1>
                        {selectedEpicIds.length > 0 && (
                            <div className="hidden md:flex items-center gap-4 text-sm border-l border-border pl-4 shrink-0">
                                <span className="flex items-baseline gap-1 text-muted-foreground">
                                    <span className="tabular-nums font-semibold text-foreground">{issueCount}</span>
                                    이슈
                                </span>
                                <span className="flex items-baseline gap-1 text-muted-foreground">
                                    <span className="tabular-nums font-semibold text-foreground">{totalSP}</span>
                                    SP
                                </span>
                                {selectedEpicIds.length > 1 && (
                                    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary tabular-nums">
                                        {selectedEpicIds.length}개 Epic
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 justify-self-end">
                        {/* v1.0.23: 메인 헤더 다크모드 토글 — 어디서든 접근 가능 */}
                        <ThemeToggle />
                        <span className="h-5 w-px bg-border" aria-hidden />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSettingsOpen(true)}
                            title="Jira 연결 설정"
                            className="h-8"
                        >
                            <Settings className="h-4 w-4 mr-1.5" />
                            <span className="hidden sm:inline">설정</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDefectKpiOpen(true)}
                            title="개발자별 중요 결함 KPI"
                            className="h-8"
                        >
                            <Bug className="h-4 w-4 mr-1.5" />
                            <span className="hidden sm:inline">결함 KPI</span>
                        </Button>
                        {/* v1.0.28: 매니저 콘솔 — 위험 카운트 배지 자동 표시
                            v1.0.33: data-manager-console-trigger — 진행 추이의 안내 카드에서 시각 강조용 */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setManagerOpen(true)}
                            disabled={!issues || issues.length === 0}
                            title="매니저 콘솔 — 일일 브리프·리스크 보드·1:1 미팅 준비·공수 & 예산"
                            className="h-8 relative"
                            data-manager-console-trigger
                        >
                            <Briefcase className="h-4 w-4 mr-1.5" />
                            <span className="hidden sm:inline">매니저</span>
                            {managerRiskCount > 0 && (
                                <span
                                    className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 dark:bg-red-600 text-white text-[10px] font-bold tabular-nums px-1 shadow-sm"
                                    aria-label={`위험 ${managerRiskCount}건`}
                                >
                                    {managerRiskCount > 99 ? '99+' : managerRiskCount}
                                </span>
                            )}
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            disabled={!issues || issues.length === 0}
                            onClick={() => setStatsOpen(true)}
                            className="h-8 shadow-[0_2px_8px_-2px_hsl(var(--primary)/0.4)]"
                        >
                            <BarChart3 className="h-4 w-4 mr-1.5" />
                            프로젝트 통계
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => refetch()}
                            disabled={selectedEpicIds.length === 0}
                            title="새로고침"
                            className="h-8 w-8"
                        >
                            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                        </Button>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {issuesError ? (
                        <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-center gap-2 border border-destructive/20">
                            <AlertCircle className="h-5 w-5" />
                            <div>
                                <h3 className="font-semibold">이슈를 불러오는 중 오류가 발생했습니다.</h3>
                                <p className="text-sm">{(issuesError as Error).message}</p>
                            </div>
                        </div>
                    ) : selectedEpicIds.length > 0 ? (
                        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                            <IssueList
                                issues={issues || []}
                                isLoading={issuesLoading}
                                focusIssueKeys={focusIssueKeys}
                                onClearFocusIssueKeys={() => setFocusIssueKeys(null)}
                                onIssueClick={(issue) => {
                                    setSelectedIssue(issue);
                                    setDrawerOpen(true);
                                }}
                            />
                        </div>
                    ) : (
                        // v1.0.22: Hero EmptyState — 일러스트 + CTA
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center max-w-md mx-auto">
                                {/* Animated icon stack */}
                                <div className="relative mx-auto mb-6 w-24 h-24">
                                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent blur-2xl" />
                                    <div className="relative w-full h-full rounded-2xl border border-border bg-card/60 supports-[backdrop-filter]:backdrop-blur-md flex items-center justify-center shadow-lg">
                                        <Layers className="h-10 w-10 text-primary" />
                                        <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                                            <Sparkles className="h-3 w-3" />
                                        </span>
                                    </div>
                                </div>
                                <h2 className="text-xl font-semibold tracking-tight text-foreground mb-2">
                                    분석할 에픽을 선택해주세요
                                </h2>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                                    좌측 사이드바에서 에픽을 선택하면 이슈 목록·KPI·진행 추이/예측·회고 분석을 한눈에 확인할 수 있습니다.
                                </p>
                                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                                    <MousePointerClick className="h-3.5 w-3.5 text-primary" />
                                    여러 에픽을 동시에 선택하여 비교 분석도 가능합니다
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Issue Detail Drawer */}
            <IssueDetailDrawer
                issue={selectedIssue}
                open={drawerOpen}
                onClose={() => {
                    setDrawerOpen(false);
                    setSelectedIssue(null);
                }}
            />

            <JiraSettingsDialog
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                initialConfig={jiraConfig ?? null}
            />

            <DefectKpiDashboard
                open={defectKpiOpen}
                onClose={() => setDefectKpiOpen(false)}
                rows={defectKpi.rows}
                isLoading={defectKpi.isLoading}
                error={defectKpi.error as Error | null}
                workerFieldResolved={defectKpi.workerFieldResolved}
                defectSeverityFieldResolved={defectKpi.defectSeverityFieldResolved}
                mappingCount={defectKpi.mappingCount}
                onRefresh={() => void defectKpi.refetch()}
            />

            {/* v1.0.28: 매니저 콘솔 — 일일 브리프 + 리스크 보드 + 1:1 준비 */}
            <ManagerConsole
                open={managerOpen}
                onClose={() => setManagerOpen(false)}
                issues={issues}
                selectedEpicCount={selectedEpicIds.length}
                onIssueClick={(issue) => {
                    setSelectedIssue(issue);
                    setDrawerOpen(true);
                }}
                onIssueKeysFocus={(keys) => setFocusIssueKeys(keys.length > 0 ? keys : null)}
            />

            <ProjectStatsDialog
                open={statsOpen}
                onClose={() => setStatsOpen(false)}
                issues={issues}
                epics={epics || []}
                selectedEpicIds={selectedEpicIds}
                defectKpiRows={defectKpi.rows}
                defectKpiLoading={defectKpi.isLoading}
                defectKpiWorkerOk={defectKpi.workerFieldResolved}
                defectKpiSeverityFieldOk={defectKpi.defectSeverityFieldResolved}
                defectKpiMappingCount={defectKpi.mappingCount}
                /* v1.0.31: 매핑 dev 에픽 issues — KPI 성과 탭이 매핑 모드로 분기할 때 사용 */
                mappingDevIssues={Array.from(defectKpi.devIssuesByEpic.values()).flat()}
                mappedDevEpicKeys={defectKpi.mappedDevEpicKeys}
                onShowIssuesInList={(keys) => {
                    setStatsOpen(false);
                    setFocusIssueKeys(keys.length > 0 ? keys : null);
                }}
            />

            {/* Blocking Overlay with Pendulum Animation */}
            {(isFetching && selectedEpicIds.length > 0) && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex flex-col items-center gap-8">
                        <div className="pendulum-container">
                            <div className="pendulum-string"></div>
                            <div className="pendulum-ball"></div>
                        </div>
                        <p className="text-white font-medium text-lg tracking-wide animate-pulse">
                            데이터 동기화 중...
                        </p>
                    </div>
                    <style>{`
                        @keyframes swing {
                            0% { transform: rotate(35deg); }
                            100% { transform: rotate(-35deg); }
                        }
                        .pendulum-container {
                            width: 2px;
                            height: 60px;
                            position: relative;
                            transform-origin: top center;
                            animation: swing 1s infinite ease-in-out alternate;
                        }
                        .pendulum-string {
                            width: 2px;
                            height: 100%;
                            background: rgba(255, 255, 255, 0.9);
                        }
                        .pendulum-ball {
                            width: 24px;
                            height: 24px;
                            background: #ffffff;
                            border-radius: 50%;
                            position: absolute;
                            bottom: -22px;
                            left: -11px;
                            box-shadow: 0 0 20px rgba(255, 255, 255, 0.6);
                        }
                    `}</style>
                </div>
            )}
        </div>
    );
}