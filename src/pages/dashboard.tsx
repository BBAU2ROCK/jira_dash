import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { jiraApi, type JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues } from '@/lib/jira-helpers';
import { Sidebar } from '@/components/layout/sidebar';
import { IssueList } from '@/components/issue-list';
import { IssueDetailDrawer } from '@/components/issue-detail-drawer';
import { ProjectStatsDialog } from '@/components/project-stats-dialog';
import { JiraSettingsDialog, type JiraConfig } from '@/components/jira-settings-dialog';
import { Button } from '@/components/ui/button';
import { BarChart3, RefreshCw, AlertCircle, Settings } from 'lucide-react';

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

    // Fetch all epics
    const { data: epics, isLoading: epicsLoading, error: epicsError } = useQuery({
        queryKey: ['epics'],
        queryFn: jiraApi.getEpics,
        refetchOnWindowFocus: false,
    });

    // 필드 목록(필드명 '난이도' → id 매핑, 에픽 이슈 조회 시 난이도 필드 포함용)
    const { data: allFields = [] } = useQuery({
        queryKey: ['jiraFields'],
        queryFn: () => jiraApi.getFields(),
        enabled: selectedEpicIds.length > 0,
        staleTime: 15 * 60 * 1000,
    });
    const difficultyFieldId = React.useMemo(() => {
        const found = (allFields as Array<{ id: string; name: string }>).find(
            (f) => f.name === '난이도' || (f.name && f.name.trim() === '난이도')
        );
        return found?.id ?? undefined;
    }, [allFields]);

    // Fetch issues for all selected epics (난이도 필드 id 반영)
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
        refetchOnWindowFocus: false,
    });

    const issues = allIssues || [];
    // 건수 규칙: 할 일만 있으면 카운트, 하위 작업 있으면 부모 제외·하위만 반영 (통계/KPI 동일)
    const workItems = filterLeafIssues(issues);
    const totalSP = workItems.reduce((sum, issue) => sum + (issue.fields.customfield_10016 || 0), 0);
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
        <div className="flex h-screen overflow-hidden bg-background">
            {/* Sidebar */}
            <div className={sidebarCollapsed ? 'flex-shrink-0' : 'w-[14%] min-w-[175px] flex-shrink-0'}>
                <Sidebar
                    epics={epics || []}
                    selectedEpicIds={selectedEpicIds}
                    onSelectEpic={handleEpicToggle}
                    isLoading={epicsLoading}
                    error={epicsError as Error | null}
                    isCollapsed={sidebarCollapsed}
                    onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
                    onOpenSettings={isElectron ? () => setSettingsOpen(true) : undefined}
                />
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 border-b flex items-center justify-between px-6 bg-card">
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg font-semibold tracking-tight">
                            {selectedEpicIds.length > 0 ? selectedEpicTitles || '선택된 Epic' : '에픽을 선택하세요'}
                        </h1>
                        {selectedEpicIds.length > 0 && (
                            <div className="flex gap-4 text-sm text-muted-foreground border-l pl-4">
                                <span className="font-medium text-foreground">{issueCount} 이슈</span>
                                <span>{totalSP} SP</span>
                                {selectedEpicIds.length > 1 && (
                                    <span className="text-blue-600 font-medium">({selectedEpicIds.length}개 Epic)</span>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {isElectron && (
                            <Button
                                variant="outline"
                                size="default"
                                onClick={() => setSettingsOpen(true)}
                                title="Jira 연결 설정"
                            >
                                <Settings className="h-4 w-4 mr-2" />
                                설정
                            </Button>
                        )}
                        <Button
                            variant="default"
                            size="default"
                            disabled={!issues || issues.length === 0}
                            onClick={() => setStatsOpen(true)}
                            style={{
                                backgroundColor: '#3b82f6',
                                color: '#ffffff',
                            }}
                            className="shadow-sm hover:opacity-90"
                        >
                            <BarChart3 className="h-4 w-4 mr-2" style={{ color: '#ffffff' }} />
                            <span style={{ color: '#ffffff' }}>프로젝트 통계</span>
                        </Button>
                        <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => refetch()}
                            disabled={selectedEpicIds.length === 0}
                            title="새로고침"
                            style={{
                                backgroundColor: '#6b7280',
                                color: '#ffffff',
                            }}
                            className="shadow-sm hover:opacity-90"
                        >
                            <RefreshCw
                                className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
                                style={{ color: '#ffffff' }}
                            />
                        </Button>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6 bg-muted/10">
                    {issuesError ? (
                        <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-center gap-2 border border-destructive/20">
                            <AlertCircle className="h-5 w-5" />
                            <div>
                                <h3 className="font-semibold">이슈를 불러오는 중 오류가 발생했습니다.</h3>
                                <p className="text-sm">{(issuesError as Error).message}</p>
                            </div>
                        </div>
                    ) : selectedEpicIds.length > 0 ? (
                        <div className="bg-background rounded-lg border shadow-sm overflow-hidden">
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
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            에픽을 선택하여 이슈를 확인하세요.
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

            {/* Project Stats Dialog */}
            <ProjectStatsDialog
                open={statsOpen}
                onClose={() => setStatsOpen(false)}
                issues={issues}
                epics={epics || []}
                selectedEpicIds={selectedEpicIds}
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