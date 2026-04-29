import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { type JiraIssue, jiraApi } from '@/api/jiraClient';
import { DEFECT_KPI_CONFIG } from '@/config/defectKpiConfig';
import { EpicMappingEditor } from '@/components/epic-mapping-editor';
import { filterLeafIssues, getStatusCategoryKey } from '@/lib/jira-helpers';
import {
    BarChart3, CheckCircle2, Clock, AlertTriangle,
    Layers, X, ChevronRight, User, Trophy, HelpCircle, Pause, CircleSlash, Link2, TrendingUp,
} from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { calculateKPI, calculateWeightedKPI } from '@/services/kpiService';
import { JIRA_CONFIG } from '@/config/jiraConfig';
import { buildMainCollaborations, SUB_ASSIGNEE_WEIGHT, type MainCollaboration } from '@/lib/sub-assignee-utils';
import { defectRateToGrade, type DefectKpiDeveloperRow } from '@/lib/defect-kpi-utils';
import { cn } from '@/lib/utils';
import { DifficultyMiniPie } from '@/components/ui/difficulty-mini-pie';
import { ProgressTrends } from '@/components/progress-trends';
import { useKpiRulesStore } from '@/stores/kpiRulesStore';
import {
    completionTooltip,
    complianceTooltip,
    earlyBonusTooltip,
    defectDensityTooltip,
} from '@/lib/kpi-tooltip';
import { UNASSIGNED_LABEL } from '@/lib/jira-constants';
import { endOfLocalDay } from '@/lib/date-utils';

interface ProjectStatsDialogProps {
    open: boolean;
    onClose: () => void;
    issues: JiraIssue[];
    epics: JiraIssue[];
    selectedEpicIds: string[];
    /** 담당자별 현황 패널에서 난이도/이슈 클릭 시 이슈 목록에 해당 건만 표시하도록 호출 */
    onShowIssuesInList?: (issueKeys: string[]) => void;
    /** 에픽 매핑 기반 결함 KPI (대시보드 훅에서 전달) */
    defectKpiRows?: DefectKpiDeveloperRow[];
    defectKpiLoading?: boolean;
    defectKpiWorkerOk?: boolean;
    /** false이면 Jira에서「결함 심각도」커스텀 필드 id를 찾지 못함(우선순위와 무관) */
    defectKpiSeverityFieldOk?: boolean;
    defectKpiMappingCount?: number;
}

interface IssueGroup {
    title: string;
    issues: JiraIssue[];
    color: string;
}

interface AssigneeStats {
    name: string;
    total: JiraIssue[];
    done: JiraIssue[];
    inProgress: JiraIssue[];
    todo: JiraIssue[];
    delayed: JiraIssue[];
    earlyDone: JiraIssue[];
    compliant: JiraIssue[];
    withWorklog: JiraIssue[];
    withoutWorklog: JiraIssue[];
    totalTimeSpent: number; // seconds
    /** v1.0.15: 메인 X와 함께한 서브 인원들의 협업 정보 (메인 시점) */
    collaborations: MainCollaboration[];
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export function ProjectStatsDialog({
    open,
    onClose,
    issues,
    epics,
    selectedEpicIds,
    onShowIssuesInList,
    defectKpiRows = [],
    defectKpiLoading = false,
    defectKpiWorkerOk = false,
    defectKpiSeverityFieldOk = true,
    defectKpiMappingCount = 0,
}: ProjectStatsDialogProps) {
    // K4: kpiRulesStore 구독 — 규칙 변경 시 GradeCard 툴팁 자동 재렌더
    const kpiRules = useKpiRulesStore((s) => s.rules);

    const [selectedGroup, setSelectedGroup] = React.useState<IssueGroup | null>(null);
    const [currentTab, setCurrentTab] = React.useState('status');
    const [epicMappingDialogOpen, setEpicMappingDialogOpen] = React.useState(false);
    /** 에픽 매핑 Dialog 열림 — ref는 setState와 동시에 갱신(중첩 Dialog로 부모가 닫히는 현상 방지) */
    const epicMappingOpenRef = React.useRef(false);
    const setEpicMappingOpen = React.useCallback((next: boolean) => {
        epicMappingOpenRef.current = next;
        setEpicMappingDialogOpen(next);
    }, []);

    const defectProjectKey = DEFECT_KPI_CONFIG.DEFECT_PROJECT_KEY_HINT;
    const {
        data: tqDefectEpics = [],
        isLoading: tqEpicsLoading,
        error: tqEpicsError,
    } = useQuery({
        queryKey: ['jiraEpics', defectProjectKey],
        queryFn: () => jiraApi.getEpicsForProject(defectProjectKey),
        enabled: open,
        staleTime: 5 * 60 * 1000,
    });

    const today = new Date();
    const selectedEpics = epics.filter(e => selectedEpicIds.includes(e.key));

    // 건수 규칙: 할 일만 있으면 카운트, 하위 작업 있으면 부모 제외·하위만 반영 (통계/KPI 동일)
    const leafIssues = React.useMemo(() => filterLeafIssues(issues), [issues]);

    // v1.0.10 S1: store 우선 — kpiRules 구독값으로 status명 참조 (설정 변경 시 즉시 반영)
    // v1.0.18: rejected status 추가 — KPI/통계에서 cancelled와 동일하게 제외
    const onHoldName = kpiRules.statusNames?.onHold ?? JIRA_CONFIG.STATUS_NAMES?.ON_HOLD ?? '보류';
    const cancelledName = kpiRules.statusNames?.cancelled ?? JIRA_CONFIG.STATUS_NAMES?.CANCELLED ?? '취소';
    const rejectedName = kpiRules.statusNames?.rejected ?? JIRA_CONFIG.STATUS_NAMES?.REJECTED ?? '반려';
    const isOnHold = (i: JiraIssue) => (i.fields.status?.name?.trim() ?? '') === onHoldName;
    const isCancelled = (i: JiraIssue) => (i.fields.status?.name?.trim() ?? '') === cancelledName;
    const isRejected = (i: JiraIssue) => (i.fields.status?.name?.trim() ?? '') === rejectedName;

    // ── KPI 계산 ─────────────────────────────────────────────────────────────
    const kpiMetrics = calculateKPI(leafIssues);

    // ── 전체 통계 (6분할: 보류·취소·반려·완료·진행·대기, 상호 배타) ────────────
    const onHold = leafIssues.filter(i => isOnHold(i));
    const cancelled = leafIssues.filter(i => isCancelled(i));
    const rejected = leafIssues.filter(i => isRejected(i));
    // v1.0.18: 완료 = statusCategory='done' AND NOT(보류·취소·반려)
    const done = leafIssues.filter(i =>
        getStatusCategoryKey(i) === 'done' && !isOnHold(i) && !isCancelled(i) && !isRejected(i)
    );
    const inProg = leafIssues.filter(i => getStatusCategoryKey(i) === 'indeterminate');
    const todo = leafIssues.filter(i =>
        !isOnHold(i) && !isCancelled(i) && !isRejected(i) &&
        getStatusCategoryKey(i) !== 'done' &&
        getStatusCategoryKey(i) !== 'indeterminate'
    );
    const delayed = leafIssues.filter(i =>
        i.fields.duedate && new Date(i.fields.duedate) < today &&
        getStatusCategoryKey(i) !== 'done'
    );
    const earlyDone = done.filter(i =>
        i.fields.duedate && i.fields.resolutiondate &&
        new Date(i.fields.resolutiondate) < new Date(i.fields.duedate)
    );

    const total = leafIssues.length;
    // v1.0.18: 완료율 분모는 취소·반려 제외 (KPI와 일관성)
    const completionDenom = total - cancelled.length - rejected.length;
    const completionRate = completionDenom > 0 ? Math.round((done.length / completionDenom) * 100) : 0;

    // v1.0.10 S5: store에서 필드 ID 참조 (커스텀 필드 변경 시 즉시 반영)
    const spField = kpiRules.fields?.storyPoint ?? JIRA_CONFIG.FIELDS.STORY_POINT;
    const totalSP = leafIssues.reduce((s, i) => s + ((i.fields[spField] as number | undefined) || 0), 0);
    const doneSP = done.reduce((s, i) => s + ((i.fields[spField] as number | undefined) || 0), 0);

    // ── 담당자별 통계 ─────────────────────────────────────────────────────────
    const assigneeMap = new Map<string, AssigneeStats>();

    // 리프만 담당자별 건수·업무로그 집계.
    // v1.0.18: 보류는 "처리 끝남"으로 포함, 취소·반려는 done에서 제외 (KPI 정책과 일치).
    //   earlyDone/compliant는 실제 done(statusCategory)만.
    const isDoneForAssignee = (issue: JiraIssue) =>
        (getStatusCategoryKey(issue) === 'done' && !isCancelled(issue) && !isRejected(issue)) || isOnHold(issue);

    function newStats(name: string): AssigneeStats {
        return {
            name,
            total: [], done: [], inProgress: [], todo: [], delayed: [],
            earlyDone: [], compliant: [], withWorklog: [], withoutWorklog: [],
            totalTimeSpent: 0,
            collaborations: [],
        };
    }

    leafIssues.forEach(issue => {
        const name = issue.fields.assignee?.displayName ?? UNASSIGNED_LABEL;
        if (!assigneeMap.has(name)) {
            assigneeMap.set(name, newStats(name));
        }
        const s = assigneeMap.get(name)!;
        s.total.push(issue);
        const cat = getStatusCategoryKey(issue);
        if (isDoneForAssignee(issue)) {
            s.done.push(issue);
            // 조기완료·준수는 실제 완료(statusCategory done)인 경우만
            if (cat === 'done') {
                if (issue.fields.duedate && issue.fields.resolutiondate &&
                    new Date(issue.fields.resolutiondate) < new Date(issue.fields.duedate)) {
                    s.earlyDone.push(issue);
                }
                const isVerificationDelay = issue.fields.labels?.includes(JIRA_CONFIG.LABELS.VERIFICATION_DELAY);
                if (issue.fields.duedate && issue.fields.resolutiondate) {
                    // K10: endOfLocalDay 헬퍼 — kpiService와 동일 규칙
                    const due = endOfLocalDay(issue.fields.duedate);
                    const resolved = new Date(issue.fields.resolutiondate);
                    if ((due && resolved <= due) || isVerificationDelay) {
                        s.compliant.push(issue);
                    }
                } else {
                    s.compliant.push(issue);
                }
            }
        } else if (cat === 'indeterminate') {
            s.inProgress.push(issue);
        } else {
            s.todo.push(issue);
        }
        if (issue.fields.duedate && new Date(issue.fields.duedate) < today && !isDoneForAssignee(issue)) {
            s.delayed.push(issue);
        }

        // 업무로그 통계 (리프 이슈 기준)
        const timeSpent = issue.fields.timespent || 0;
        if (timeSpent > 0) {
            s.withWorklog.push(issue);
            s.totalTimeSpent += timeSpent;
        } else {
            s.withoutWorklog.push(issue);
        }
    });

    // 할 일(부모)에만 업무로그가 있고 하위 작업에는 없는 경우: 담당자별 기록 시간에만 반영
    // (filterLeafIssues와 동일한 규칙으로 "리프에서 제외되는 부모" 집합 사용)
    const parentsWithChildren = new Set<string>();
    issues.forEach(i => {
        if (i.fields.parent?.key) parentsWithChildren.add(i.fields.parent.key);
        if ((i.fields.subtasks?.length ?? 0) > 0) parentsWithChildren.add(i.key);
    });
    issues.forEach(issue => {
        if (!parentsWithChildren.has(issue.key)) return;
        const timeSpent = issue.fields.timespent || 0;
        if (timeSpent <= 0) return;
        const name = issue.fields.assignee?.displayName ?? UNASSIGNED_LABEL;
        if (!assigneeMap.has(name)) {
            assigneeMap.set(name, newStats(name));
        }
        assigneeMap.get(name)!.totalTimeSpent += timeSpent;
    });

    // v1.0.15: 메인 시점 협업 그래프
    //   - 메인 X의 task 중 서브가 등록된 것을 → 서브 인원별 그룹
    //   - 메인 행 아래에 인라인 sub-row로 표시 (펼침 토글 X)
    const mainCollabsMap = buildMainCollaborations(leafIssues);
    for (const [mainName, collabs] of mainCollabsMap) {
        const stats = assigneeMap.get(mainName);
        if (stats) {
            stats.collaborations = collabs;
        }
    }

    const assignees = Array.from(assigneeMap.values())
        // 기존 정렬 유지 — 메인 task 수 기준
        .sort((a, b) => b.total.length - a.total.length);

    // KPI 성과용 정렬된 담당자 목록 (점수 높은 순)
    const assigneesWithKPI = React.useMemo(() => {
        return assignees.map(a => ({
            ...a,
            kpi: calculateKPI(a.total)
        })).sort((a, b) => b.kpi.totalScore - a.kpi.totalScore);
    }, [assignees]);

    const defectKpiByDisplayName = React.useMemo(() => {
        const m = new Map<string, DefectKpiDeveloperRow>();
        for (const r of defectKpiRows) {
            m.set(r.displayName, r);
        }
        return m;
    }, [defectKpiRows]);

    const teamDefectKpiSummary = React.useMemo(() => {
        if (defectKpiRows.length === 0) return null;
        let totalDev = 0;
        let totalDefect = 0;
        const severity = new Map<string, number>();
        for (const r of defectKpiRows) {
            totalDev += r.devIssueCount;
            totalDefect += r.defectCount;
            for (const { name, count } of r.severityBreakdown) {
                severity.set(name, (severity.get(name) ?? 0) + count);
            }
        }
        const ratePercent =
            totalDev > 0 ? Math.round((totalDefect / totalDev) * 1000) / 10 : null;
        const grade: DefectKpiDeveloperRow['grade'] =
            ratePercent != null ? defectRateToGrade(ratePercent) : totalDefect > 0 ? 'D' : '—';
        return { totalDev, totalDefect, ratePercent, grade, severity };
    }, [defectKpiRows]);

    /** 상세 산출 표 — 팀 심각도 분포용 (건수 내림차순·이름 가나다) */
    const teamSeveritySorted = React.useMemo(() => {
        if (!teamDefectKpiSummary || teamDefectKpiSummary.totalDefect <= 0) return [];
        return Array.from(teamDefectKpiSummary.severity.entries())
            .map(([name, count]) => ({ name, count }))
            .filter((x) => x.count > 0)
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
    }, [teamDefectKpiSummary]);

    const openGroup = (title: string, grpIssues: JiraIssue[], color: string) => {
        if (grpIssues.length > 0) setSelectedGroup({ title, issues: grpIssues, color });
    };

    // 난이도 필드 id: 필드명 '난이도'로 조회 (이슈 상세와 동일), 없으면 config 폴백
    const { data: statsFields = [] } = useQuery({
        queryKey: ['jiraFields'],
        queryFn: () => jiraApi.getFields(),
        enabled: open,
        staleTime: 15 * 60 * 1000,
    });
    const difficultyFieldId = React.useMemo(() => {
        const found = (statsFields as Array<{ id: string; name: string }>).find(
            (f) => f.name === '난이도' || (f.name && f.name.trim() === '난이도')
        );
        // v1.0.10 S5: 1순위 Jira 메타데이터, 2순위 store, 3순위 JIRA_CONFIG
        return found?.id ?? kpiRules.fields?.difficulty ?? JIRA_CONFIG.FIELDS.DIFFICULTY;
    }, [statsFields, kpiRules.fields?.difficulty]);

    // 난이도별 건수·% (하단 패널 리스트 최상단 표시용, 순서 고정: 상·중·하·미지정)
    const difficultyBreakdown = React.useMemo(() => {
        if (!selectedGroup || selectedGroup.issues.length === 0) return [];
        const DIFFICULTY_ORDER = ['상', '중', '하', '미지정'];
        const orderIndex = (name: string) => {
            const i = DIFFICULTY_ORDER.indexOf(name);
            return i >= 0 ? i : DIFFICULTY_ORDER.length;
        };
        const total = selectedGroup.issues.length;
        const byLabel: Record<string, number> = {};
        selectedGroup.issues.forEach(issue => {
            const raw = issue.fields[difficultyFieldId];
            const label = raw == null ? '미지정' : (typeof raw === 'object' ? (raw.value ?? raw.name ?? '미지정') : String(raw));
            byLabel[label] = (byLabel[label] ?? 0) + 1;
        });
        return Object.entries(byLabel)
            .map(([name, count]) => ({ name, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
            .sort((a, b) => orderIndex(a.name) - orderIndex(b.name));
    }, [selectedGroup, difficultyFieldId]);

    // 난이도별 이슈 키 목록 (난이도 클릭 시 이슈 목록에 해당 건만 표시용)
    const difficultyNameToKeys = React.useMemo(() => {
        if (!selectedGroup || selectedGroup.issues.length === 0) return {} as Record<string, string[]>;
        const map: Record<string, string[]> = {};
        selectedGroup.issues.forEach(issue => {
            const raw = issue.fields[difficultyFieldId];
            const name = raw == null ? '미지정' : (typeof raw === 'object' ? (raw.value ?? raw.name ?? '미지정') : String(raw));
            if (!map[name]) map[name] = [];
            map[name].push(issue.key);
        });
        return map;
    }, [selectedGroup, difficultyFieldId]);

    const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours === 0 && minutes === 0) return '-';
        if (hours === 0) return `${minutes}m`;
        if (minutes === 0) return `${hours}h`;
        return `${hours}h ${minutes}m`;
    };

    // ── 파이차트 세그먼트 (v1.0.18: 6분할 — 완료·진행·대기·보류·취소·반려) ────
    const overallSegments = [
        { value: done.length, color: '#22c55e', label: '완료' },
        { value: inProg.length, color: '#3b82f6', label: '진행' },
        { value: todo.length, color: '#cbd5e1', label: '대기' },
        { value: onHold.length, color: '#94a3b8', label: '보류' },
        { value: cancelled.length, color: '#64748b', label: '취소' },
        { value: rejected.length, color: '#a855f7', label: '반려' },
    ];

    const handleStatsDialogOpenChange = (next: boolean) => {
        if (!next && epicMappingOpenRef.current) {
            return;
        }
        if (!next) {
            onClose();
        }
    };

    return (
        <>
        <Dialog open={open} onOpenChange={handleStatsDialogOpenChange}>
            <DialogContent
                // v1.0.24: 다이얼로그 폭 확장 — 1180 → 95vw / max 1600px (시원한 화면)
                className="w-[95vw] max-w-[1600px] max-h-[92vh] flex flex-col p-0 overflow-hidden"
                onInteractOutside={(e) => {
                    if (epicMappingOpenRef.current) {
                        e.preventDefault();
                    }
                }}
                onPointerDownOutside={(e) => {
                    if (epicMappingOpenRef.current) {
                        e.preventDefault();
                    }
                }}
            >
                <DialogHeader className="px-6 py-4 border-b shrink-0 bg-background z-10">
                    <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                        <BarChart3 className="w-5 h-5 text-blue-500" />
                        프로젝트 통계
                        {selectedEpics.length > 0 && (
                            <span className="text-sm font-normal text-muted-foreground ml-1 truncate">
                                — {selectedEpics.map(e => e.fields.summary).join(', ')}
                            </span>
                        )}
                    </DialogTitle>
                </DialogHeader>

                <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-6 pt-4 pb-0 bg-muted/30 border-b border-border">
                        <div className="flex w-full justify-start gap-2 h-10 translate-y-[1px]">
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setCurrentTab('status')}
                                onKeyDown={(e) => e.key === 'Enter' && setCurrentTab('status')}
                                className={`flex items-center justify-center rounded-t-lg border-x border-t px-5 py-2 text-sm font-bold transition-all cursor-pointer select-none ${currentTab === 'status'
                                    ? 'bg-card border-border border-b-transparent text-blue-600 shadow-[0_-1px_2px_rgba(0,0,0,0.05)] z-10'
                                    : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground/90 hover:bg-muted/40 border-b-transparent'
                                    }`}
                            >
                                <Layers className="w-4 h-4 mr-2" />
                                프로젝트 현황
                            </div>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setCurrentTab('kpi')}
                                onKeyDown={(e) => e.key === 'Enter' && setCurrentTab('kpi')}
                                className={`flex items-center justify-center rounded-t-lg border-x border-t px-5 py-2 text-sm font-bold transition-all cursor-pointer select-none ${currentTab === 'kpi'
                                    ? 'bg-card border-border border-b-transparent text-blue-600 shadow-[0_-1px_2px_rgba(0,0,0,0.05)] z-10'
                                    : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground/90 hover:bg-muted/40 border-b-transparent'
                                    }`}
                            >
                                <Trophy className="w-4 h-4 mr-2" />
                                KPI 성과
                            </div>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setCurrentTab('trends')}
                                onKeyDown={(e) => e.key === 'Enter' && setCurrentTab('trends')}
                                className={`flex items-center justify-center rounded-t-lg border-x border-t px-5 py-2 text-sm font-bold transition-all cursor-pointer select-none ${currentTab === 'trends'
                                    ? 'bg-card border-border border-b-transparent text-blue-600 shadow-[0_-1px_2px_rgba(0,0,0,0.05)] z-10'
                                    : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground/90 hover:bg-muted/40 border-b-transparent'
                                    }`}
                            >
                                <TrendingUp className="w-4 h-4 mr-2" />
                                진행 추이/예측
                            </div>
                        </div>
                    </div>

                    <TabsContent value="status" className="flex-1 overflow-y-auto p-0 m-0 border-0 focus-visible:ring-0 focus-visible:outline-none relative">
                        <div className="px-6 py-5 space-y-8 pb-20">
                            {/* ── 섹션 1: 전체 통계 ─────────────────────────────────── */}
                            <section className="space-y-4">
                                <SectionTitle>전체 현황</SectionTitle>

                                {/* v1.0.24: 7개 카드 한 줄 (전체·완료·진행·지연·보류·취소·반려) — grid-cols-7 */}
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
                                    <StatCard icon={<Layers className="w-4 h-4 text-blue-500 dark:text-blue-400" />}
                                        label="전체 이슈" value={total} sub="개" color="blue"
                                        onClick={() => openGroup('전체 이슈', leafIssues, '#3b82f6')} />
                                    <StatCard icon={<CheckCircle2 className="w-4 h-4 text-green-500 dark:text-green-400" />}
                                        label="완료" value={`${completionRate}%`} sub={`${done.length}/${total}`} color="green"
                                        onClick={() => openGroup('완료 이슈', done, '#22c55e')} />
                                    <StatCard icon={<Clock className="w-4 h-4 text-amber-500 dark:text-amber-400" />}
                                        label="진행 중" value={inProg.length} sub="개" color="amber"
                                        onClick={() => openGroup('진행 중 이슈', inProg, '#f59e0b')} />
                                    <StatCard icon={<AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" />}
                                        label="지연" value={delayed.length} sub="개" color="red"
                                        onClick={() => openGroup('지연 이슈', delayed, '#ef4444')} />
                                    <StatCard icon={<Pause className="w-4 h-4 text-muted-foreground" />}
                                        label="보류" value={onHold.length} sub="개" color="slate"
                                        onClick={() => openGroup('보류 이슈', onHold, '#94a3b8')} />
                                    <StatCard icon={<CircleSlash className="w-4 h-4 text-foreground/80" />}
                                        label="취소" value={cancelled.length} sub="개" color="slate"
                                        onClick={() => openGroup('취소 이슈', cancelled, '#64748b')} />
                                    {/* v1.0.18: 반려 카드 — KPI에서 제외 */}
                                    <StatCard icon={<CircleSlash className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
                                        label="반려" value={rejected.length} sub="개" color="purple"
                                        onClick={() => openGroup('반려 이슈', rejected, '#a855f7')} />
                                </div>

                                {/* 파이차트 + 범례 + 바 */}
                                <div className="grid grid-cols-3 gap-6 items-center">
                                    {/* 파이차트 */}
                                    <div className="flex flex-col items-center gap-3">
                                        <p className="text-xs font-semibold text-foreground/80">이슈 분포</p>
                                        <PieChart segments={overallSegments} size={160} centerLabel={`${completionRate}%`} />
                                        <div className="flex flex-wrap justify-center gap-2 mt-3">
                                            {overallSegments.map(seg => (
                                                <button key={seg.label}
                                                    onClick={() => openGroup(seg.label, seg.label === '완료' ? done : seg.label === '진행' ? inProg : seg.label === '대기' ? todo : seg.label === '보류' ? onHold : seg.label === '취소' ? cancelled : rejected, seg.color)}
                                                    className="flex items-center gap-1.5 text-[11px] rounded-full px-2 py-0.5 bg-muted/40 border border-border hover:bg-accent hover:border-accent-foreground/20 cursor-pointer transition-colors"
                                                >
                                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                                                    <span className="text-foreground/80">{seg.label}</span>
                                                    <span className="text-foreground font-bold ml-0.5 tabular-nums">{seg.value}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 이슈 진행 바 */}
                                    <div className="col-span-2 space-y-3">
                                        <BarStat label="이슈 완료율" pct={completionRate} color="#22c55e"
                                            sub={`${done.length} / ${total}개`} />
                                        {totalSP > 0 && (
                                            <BarStat label="SP 완료율"
                                                pct={totalSP > 0 ? Math.round((doneSP / totalSP) * 100) : 0}
                                                color="#a855f7"
                                                sub={`${doneSP} / ${totalSP} SP`} />
                                        )}
                                        <BarStat label="지연율"
                                            pct={total > 0 ? Math.round((delayed.length / total) * 100) : 0}
                                            color="#ef4444"
                                            sub={`${delayed.length} / ${total}개`} />
                                        <BarStat label="조기 완료율"
                                            pct={done.length > 0 ? Math.round((earlyDone.length / done.length) * 100) : 0}
                                            color="#06b6d4"
                                            sub={`${earlyDone.length} / ${done.length}개 (완료 대비)`} />
                                        <BarStat label="보류율"
                                            pct={total > 0 ? Math.round((onHold.length / total) * 100) : 0}
                                            color="#94a3b8"
                                            sub={`${onHold.length} / ${total}개`} />
                                        <BarStat label="취소율"
                                            pct={total > 0 ? Math.round((cancelled.length / total) * 100) : 0}
                                            color="#64748b"
                                            sub={`${cancelled.length} / ${total}개`} />
                                        <BarStat label="반려율"
                                            pct={total > 0 ? Math.round((rejected.length / total) * 100) : 0}
                                            color="#a855f7"
                                            sub={`${rejected.length} / ${total}개`} />
                                    </div>
                                </div>
                            </section>

                            {/* ── 섹션 2: 담당자별 통계 ──────────────────────────────── */}
                            <section className="space-y-4">
                                <SectionTitle>담당자별 현황</SectionTitle>

                                <div className="overflow-x-auto rounded-lg border border-border">
                                    <table className="w-full text-sm">
                                        <thead>
                                            {/* v1.0.25: thead inline hex → Tailwind 토큰 (다크 자동 대응) */}
                                            <tr className="bg-muted/40 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                                                <th className="px-4 py-3 text-left w-36">담당자</th>
                                                <th className="px-3 py-3 text-center w-28">분포</th>
                                                <th className="px-3 py-3 text-center">전체</th>
                                                <th className="px-3 py-3 text-center text-green-700 dark:text-green-400">완료</th>
                                                <th className="px-3 py-3 text-center text-blue-700 dark:text-blue-400">진행</th>
                                                <th className="px-3 py-3 text-center text-foreground/80">대기</th>
                                                <th className="px-3 py-3 text-center text-red-700 dark:text-red-400">지연</th>
                                                <th className="px-3 py-3 text-center text-cyan-700 dark:text-cyan-400">조기완료</th>
                                                <th className="px-3 py-3 text-center text-blue-700 dark:text-blue-400">로그 있음</th>
                                                <th className="px-3 py-3 text-center text-muted-foreground">로그 없음</th>
                                                <th className="px-3 py-3 text-center text-foreground/80">기록 시간</th>
                                                <th className="px-3 py-3 text-center">진척률</th>
                                                <th className="px-3 py-3 text-center text-green-700 dark:text-green-400">준수율</th>
                                                <th className="px-3 py-3 text-center">지연율</th>
                                                <th className="px-3 py-3 text-center">조기완료율</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {assignees.map(a => {
                                                const t = a.total.length;
                                                const d = a.done.length;
                                                const progressRate = t > 0 ? Math.round((d / t) * 100) : 0;
                                                // 메인 담당자 KPI는 본인 메인 task만 기준 (sub-row가 별도 표시이므로 가중 X)
                                                const mainKpi = calculateKPI(a.total);
                                                const complianceRate = mainKpi.complianceRate;
                                                const delayRate = t > 0 ? Math.round((a.delayed.length / t) * 100) : 0;
                                                const earlyRate = d > 0 ? Math.round((a.earlyDone.length / d) * 100) : 0;

                                                const segs = [
                                                    { value: a.done.length, color: '#22c55e', label: '완료' },
                                                    { value: a.inProgress.length, color: '#3b82f6', label: '진행' },
                                                    { value: a.todo.length, color: '#cbd5e1', label: '대기' },
                                                ];

                                                return (
                                                    <React.Fragment key={a.name}>
                                                    {/* 메인 담당자 행 — v1.0.25: inline hex → Tailwind 토큰 */}
                                                    <tr className="border-b border-border/50 bg-card hover:bg-accent/40 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <User className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                                                <span className="font-medium text-foreground text-xs">{a.name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex justify-center items-center gap-1.5">
                                                                <PieChart segments={segs} size={52} />
                                                                <DifficultyMiniPie issues={a.total} size={32} />
                                                            </div>
                                                        </td>
                                                        <ClickCell value={t} color="#64748b"
                                                            onClick={() => openGroup(`${a.name} · 전체`, a.total, '#64748b')} />
                                                        <ClickCell value={a.done.length} color="#22c55e"
                                                            onClick={() => openGroup(`${a.name} · 완료`, a.done, '#22c55e')} />
                                                        <ClickCell value={a.inProgress.length} color="#3b82f6"
                                                            onClick={() => openGroup(`${a.name} · 진행 중`, a.inProgress, '#3b82f6')} />
                                                        <ClickCell value={a.todo.length} color="#94a3b8"
                                                            onClick={() => openGroup(`${a.name} · 대기`, a.todo, '#94a3b8')} />
                                                        <ClickCell value={a.delayed.length} color="#ef4444"
                                                            onClick={() => openGroup(`${a.name} · 지연`, a.delayed, '#ef4444')} />
                                                        <ClickCell value={a.earlyDone.length} color="#06b6d4"
                                                            onClick={() => openGroup(`${a.name} · 조기완료`, a.earlyDone, '#06b6d4')} />
                                                        <td className="px-3 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <button onClick={() => openGroup(`${a.name} · 로그 있음`, a.withWorklog, '#2563eb')}
                                                                    disabled={a.withWorklog.length === 0}
                                                                    className={`font-bold text-sm ${a.withWorklog.length === 0 ? 'text-muted-foreground cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded transition-colors'}`}>
                                                                    {a.withWorklog.length}
                                                                </button>
                                                                <span className="text-[10px] text-muted-foreground mt-0.5">{t > 0 ? Math.round((a.withWorklog.length / t) * 100) : 0}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <button onClick={() => openGroup(`${a.name} · 로그 없음`, a.withoutWorklog, '#64748b')}
                                                                    disabled={a.withoutWorklog.length === 0}
                                                                    className={`font-bold text-sm ${a.withoutWorklog.length === 0 ? 'text-muted-foreground cursor-not-allowed' : 'text-foreground/80 hover:bg-muted/40 px-2 py-1 rounded transition-colors'}`}>
                                                                    {a.withoutWorklog.length}
                                                                </button>
                                                                <span className="text-[10px] text-muted-foreground mt-0.5">{t > 0 ? Math.round((a.withoutWorklog.length / t) * 100) : 0}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <span className="font-semibold text-foreground/90">{formatTime(a.totalTimeSpent)}</span>
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <RateBadge value={progressRate} type="progress" />
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <RateBadge value={complianceRate} type="progress" />
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <RateBadge value={delayRate} type="delay" />
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <RateBadge value={earlyRate} type="early" />
                                                        </td>
                                                    </tr>
                                                    {/* v1.0.15: 인라인 sub-row — 메인 X와 함께한 서브 협업자들 */}
                                                    {a.collaborations.map((c) => {
                                                        // K-A: 협업 task만의 가중 KPI (그 메인 X 관점)
                                                        const collabKpi = calculateWeightedKPI({
                                                            mainIssues: [],
                                                            subIssues: c.sharedIssues,
                                                            subWeight: SUB_ASSIGNEE_WEIGHT,
                                                        });
                                                        const sharedN = c.sharedIssues.length;
                                                        return (
                                                            <tr key={`${a.name}__sub__${c.subKey}`} className="border-b border-border/50 bg-violet-50 dark:bg-violet-950/30">
                                                                <td className="pl-7 pr-2 py-1">
                                                                    <div className="flex items-center gap-1 whitespace-nowrap">
                                                                        <span className="text-violet-400 dark:text-violet-500 text-[10px] leading-none">└</span>
                                                                        <span className="text-[8px] leading-none text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-900/60 rounded px-1 py-px font-semibold tracking-tight">서브</span>
                                                                        <span className="text-[10px] text-foreground/80 truncate" title={c.subDisplayName}>{c.subDisplayName}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-2 py-1 text-center text-[9px] text-muted-foreground whitespace-nowrap">
                                                                    가중 {(sharedN * SUB_ASSIGNEE_WEIGHT).toFixed(1)}
                                                                </td>
                                                                {/* 협업 카운트 */}
                                                                <td className="px-3 py-2 text-center">
                                                                    <button
                                                                        onClick={() => openGroup(`${a.name} ↔ ${c.subDisplayName} · 협업 ${sharedN}건`, c.sharedIssues, '#7c3aed')}
                                                                        className="font-bold text-xs text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:bg-violet-950/30 px-1.5 py-0.5 rounded"
                                                                        title="협업 task 목록"
                                                                    >
                                                                        {sharedN}
                                                                    </button>
                                                                </td>
                                                                <td className="px-3 py-2 text-center text-xs text-green-700 dark:text-green-300 tabular-nums">{collabKpi.completedIssues || '-'}</td>
                                                                <td className="px-3 py-2 text-center text-xs text-blue-700 dark:text-blue-300 tabular-nums">{collabKpi.delayedIssues > 0 ? '-' : (sharedN - (collabKpi.completedIssues + collabKpi.delayedIssues) || '-')}</td>
                                                                <td className="px-3 py-2 text-center text-xs text-muted-foreground">-</td>
                                                                <td className="px-3 py-2 text-center text-xs text-red-600 tabular-nums">{collabKpi.delayedIssues || '-'}</td>
                                                                <td className="px-3 py-2 text-center text-xs text-cyan-700 dark:text-cyan-300 tabular-nums">{collabKpi.earlyIssues || '-'}</td>
                                                                <td className="px-3 py-2 text-center text-xs text-muted-foreground">-</td>
                                                                <td className="px-3 py-2 text-center text-xs text-muted-foreground">-</td>
                                                                <td className="px-3 py-2 text-center text-xs text-muted-foreground">-</td>
                                                                <td className="px-3 py-2 text-center">
                                                                    <RateBadge value={sharedN > 0 ? Math.round((collabKpi.completedIssues / sharedN) * 100) : 0} type="progress" />
                                                                </td>
                                                                <td className="px-3 py-2 text-center">
                                                                    <RateBadge value={collabKpi.complianceRate} type="progress" />
                                                                </td>
                                                                <td className="px-3 py-2 text-center text-xs text-muted-foreground">-</td>
                                                                <td className="px-3 py-2 text-center text-xs text-muted-foreground">-</td>
                                                            </tr>
                                                        );
                                                    })}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>

                        {/* ── 이슈 목록 슬라이드 패널 ──────────────────────────────── */}
                        {selectedGroup && (
                            <div className="sticky bottom-0 max-h-[340px] overflow-y-auto border-t border-border bg-muted/40 px-6 py-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="m-0 text-[13px] font-semibold flex items-center gap-2 text-foreground">
                                        <ChevronRight className="w-4 h-4" style={{ color: selectedGroup.color }} />
                                        <span style={{ color: selectedGroup.color }}>{selectedGroup.title}</span>
                                        <span className="inline-block bg-muted text-foreground/80 rounded-full px-2 py-0.5 text-[11px] font-medium ml-1 tabular-nums">
                                            {selectedGroup.issues.length}개
                                        </span>
                                    </h3>
                                    <button
                                        onClick={() => setSelectedGroup(null)}
                                        className="text-muted-foreground hover:text-foreground transition-colors flex items-center bg-transparent border-0 cursor-pointer"
                                        aria-label="닫기"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                {difficultyBreakdown.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mb-2.5 items-center">
                                        <span className="text-[11px] font-semibold text-muted-foreground mr-1">난이도</span>
                                        {difficultyBreakdown.map(({ name, count, pct }) => {
                                            const keys = difficultyNameToKeys[name] ?? [];
                                            const handleClick = () => {
                                                if (onShowIssuesInList && keys.length > 0) {
                                                    onShowIssuesInList(keys);
                                                    onClose();
                                                }
                                            };
                                            const enabled = !!onShowIssuesInList && keys.length > 0;
                                            return (
                                                <button
                                                    key={name}
                                                    type="button"
                                                    onClick={handleClick}
                                                    disabled={!enabled}
                                                    className={cn(
                                                        'inline-block rounded-md border border-border px-2.5 py-1 text-xs text-foreground/80 bg-card whitespace-nowrap',
                                                        enabled ? 'cursor-pointer hover:bg-accent hover:border-accent-foreground/20 transition-colors' : 'cursor-default opacity-70'
                                                    )}
                                                >
                                                    {name} <span className="tabular-nums">{count}</span>건 (<span className="tabular-nums">{pct}</span>%)
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                <div className="flex flex-col gap-1.5">
                                    {selectedGroup.issues.map(issue => {
                                        const handleIssueClick = () => {
                                            if (onShowIssuesInList) {
                                                onShowIssuesInList([issue.key]);
                                                onClose();
                                            }
                                        };
                                        return (
                                        <div
                                            key={issue.key}
                                            role={onShowIssuesInList ? 'button' : undefined}
                                            tabIndex={onShowIssuesInList ? 0 : undefined}
                                            onClick={onShowIssuesInList ? handleIssueClick : undefined}
                                            onKeyDown={onShowIssuesInList ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleIssueClick(); } } : undefined}
                                            className={cn(
                                                'flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-[13px]',
                                                onShowIssuesInList ? 'cursor-pointer hover:bg-accent/40 hover:border-accent-foreground/20 transition-colors' : 'cursor-default'
                                            )}
                                        >
                                            <span className="font-mono text-[11px] font-bold whitespace-nowrap tabular-nums" style={{ color: selectedGroup.color }}>
                                                {issue.key}
                                            </span>
                                            <span className="text-foreground/90 truncate flex-1">
                                                {issue.fields.summary}
                                            </span>
                                            <span className="inline-block border border-border rounded px-1.5 py-px text-[11px] text-foreground/80 bg-muted/40 whitespace-nowrap">
                                                {issue.fields.status?.name ?? '—'}
                                            </span>
                                            {issue.fields.assignee && (
                                                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                                    {issue.fields.assignee.displayName}
                                                </span>
                                            )}
                                            {issue.fields.duedate && (
                                                <span className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
                                                    ~{issue.fields.duedate.slice(0, 10).replace(/-/g, '.')}
                                                </span>
                                            )}
                                        </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="kpi" className="flex-1 overflow-y-auto p-0 m-0 border-0 focus-visible:ring-0 focus-visible:outline-none">
                        <div className="px-6 py-6 space-y-8 text-[13px] leading-5 text-foreground/90">
                            <section>
                                <SectionTitle>KPI 등급 평가는 팀 전체 기준입니다</SectionTitle>
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
                                    {/* K4: 툴팁은 kpiRules 구독 → store 변경 시 즉시 동적 반영 */}
                                    <GradeCard title="기능 개발 완료율" grade={kpiMetrics.grades.completion}
                                        rate={kpiMetrics.completionRate} color="blue"
                                        desc="계획 대비 완료된 기능 수 (연기 합의 제외)"
                                        tooltip={completionTooltip(kpiRules)} />
                                    <GradeCard title="일정 준수율" grade={kpiMetrics.grades.compliance}
                                        rate={kpiMetrics.complianceRate} color="green"
                                        desc={
                                            kpiMetrics.noDueDateCount > 0
                                                ? `기한 내 완료 비율 (기한 미설정 ${kpiMetrics.noDueDateCount}건 준수 처리)`
                                                : '총 계획 기능 중 기한 내 완료된 기능의 비율'
                                        }
                                        tooltip={complianceTooltip(kpiRules, kpiMetrics.noDueDateCount)} />
                                    <GradeCard title="조기 종료 가점" grade={`+${kpiMetrics.grades.earlyBonus}`}
                                        rate={kpiMetrics.earlyRate} color="amber"
                                        desc={`조기 완료율 ${kpiMetrics.earlyRate}% 달성`}
                                        tooltip={earlyBonusTooltip(kpiRules)} />
                                    <GradeCard
                                        title="팀 결함 밀도"
                                        grade={teamDefectKpiSummary ? teamDefectKpiSummary.grade : '—'}
                                        rate={teamDefectKpiSummary?.ratePercent ?? 0}
                                        displayRate={
                                            teamDefectKpiSummary?.ratePercent != null
                                                ? `${teamDefectKpiSummary.ratePercent}%`
                                                : '—'
                                        }
                                        color="rose"
                                        desc={
                                            teamDefectKpiSummary
                                                ? `결함 ${teamDefectKpiSummary.totalDefect}건 / 담당 개발 이슈 ${teamDefectKpiSummary.totalDev}건 (에픽 매핑)`
                                                : '에픽 매핑·결함 KPI 집계가 없습니다'
                                        }
                                        tooltip={defectDensityTooltip(kpiRules)}
                                    />
                                </div>
                            </section>

                            <section>
                                <SectionTitle>상세 산출 내역</SectionTitle>
                                <div className="border rounded-lg overflow-hidden text-sm bg-card mt-4">
                                    <table className="w-full">
                                        <thead className="bg-muted/40 border-b">
                                            <tr>
                                                <th className="px-6 py-3 text-left font-medium text-muted-foreground">항목</th>
                                                <th className="px-6 py-3 text-right font-medium text-muted-foreground">값</th>
                                                <th className="px-6 py-3 text-left font-medium text-muted-foreground">비고</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            <tr>
                                                <td className="px-6 py-3 text-foreground/90">전체 대상 이슈</td>
                                                <td className="px-6 py-3 text-right font-semibold">{kpiMetrics.totalIssues} 개</td>
                                                <td className="px-6 py-3 text-muted-foreground text-xs">총 계획된 기능 수</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-foreground/90">연기 합의 이슈</td>
                                                <td className="px-6 py-3 text-right font-semibold text-muted-foreground">{kpiMetrics.agreedDelayIssues} 개</td>
                                                <td className="px-6 py-3 text-muted-foreground text-xs">완료율 계산 시 모수에서 제외</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-foreground/90">개발 완료 (조정 후)</td>
                                                <td className="px-6 py-3 text-right font-semibold text-blue-600">{kpiMetrics.completedIssues} 개</td>
                                                <td className="px-6 py-3 text-muted-foreground text-xs">최종 완료된 기능 수</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-foreground/90">일정 준수 완료</td>
                                                <td className="px-6 py-3 text-right font-semibold text-green-600">{kpiMetrics.compliantIssues} 개</td>
                                                <td className="px-6 py-3 text-muted-foreground text-xs">완료 예정일 이내 완료</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-foreground/90">조기 완료</td>
                                                <td className="px-6 py-3 text-right font-semibold text-amber-600">{kpiMetrics.earlyIssues} 개</td>
                                                <td className="px-6 py-3 text-muted-foreground text-xs">완료 예정일보다 하루 이상 빨리 완료</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-foreground/90">지연 완료</td>
                                                <td className="px-6 py-3 text-right font-semibold text-red-600">{kpiMetrics.delayedIssues} 개</td>
                                                <td className="px-6 py-3 text-muted-foreground text-xs">완료 예정일을 초과하여 완료</td>
                                            </tr>
                                            <tr className="bg-muted/40/90">
                                                <td
                                                    colSpan={3}
                                                    className="px-6 py-2 text-xs font-semibold text-foreground/80 border-t border-border"
                                                >
                                                    결함 KPI (개발·결함 에픽 매핑 · 팀 합계)
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-foreground/90">팀 담당 개발 이슈</td>
                                                <td className="px-6 py-3 text-right font-semibold tabular-nums">
                                                    {defectKpiLoading
                                                        ? '…'
                                                        : teamDefectKpiSummary != null
                                                          ? `${teamDefectKpiSummary.totalDev} 개`
                                                          : '—'}
                                                </td>
                                                <td className="px-6 py-3 text-muted-foreground text-xs">
                                                    매핑 에픽 리프·assignee 기준 합계
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-foreground/90">팀 결함 등록</td>
                                                <td className="px-6 py-3 text-right font-semibold text-rose-600 tabular-nums">
                                                    {defectKpiLoading
                                                        ? '…'
                                                        : teamDefectKpiSummary != null
                                                          ? `${teamDefectKpiSummary.totalDefect} 개`
                                                          : '—'}
                                                </td>
                                                <td className="px-6 py-3 text-muted-foreground text-xs">
                                                    「작업자」매칭 결함 리프 합계
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-foreground/90">팀 결함 비율</td>
                                                <td className="px-6 py-3 text-right font-semibold tabular-nums">
                                                    {defectKpiLoading
                                                        ? '…'
                                                        : teamDefectKpiSummary?.ratePercent != null
                                                          ? `${teamDefectKpiSummary.ratePercent}%`
                                                          : '—'}
                                                </td>
                                                <td className="px-6 py-3 text-muted-foreground text-xs">
                                                    결함 ÷ 담당 개발 이슈 × 100 · 등급{' '}
                                                    {teamDefectKpiSummary && teamDefectKpiSummary.grade !== '—'
                                                        ? teamDefectKpiSummary.grade
                                                        : '—'}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-foreground/90 align-top">팀 심각도 분포</td>
                                                <td className="px-6 py-3 text-right font-semibold tabular-nums text-foreground align-top">
                                                    {defectKpiLoading ? (
                                                        '…'
                                                    ) : teamSeveritySorted.length > 0 ? (
                                                        <div className="flex flex-col items-end gap-0.5 leading-snug">
                                                            {teamSeveritySorted.map((s) => (
                                                                <span key={s.name}>{`${s.name} ${s.count}건`}</span>
                                                            ))}
                                                        </div>
                                                    ) : teamDefectKpiSummary != null && teamDefectKpiSummary.totalDefect > 0 ? (
                                                        `총 ${teamDefectKpiSummary.totalDefect}건`
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                                <td className="px-6 py-3 text-muted-foreground text-xs align-top">
                                                    {defectKpiLoading ? (
                                                        ''
                                                    ) : !teamDefectKpiSummary ? (
                                                        '매핑·집계 데이터가 없습니다.'
                                                    ) : teamDefectKpiSummary.totalDefect <= 0 ? (
                                                        '매핑·집계 데이터가 없거나 결함 0건입니다.'
                                                    ) : teamSeveritySorted.length > 0 ? (
                                                        '「결함 심각도」커스텀 필드별 건수 합계'
                                                    ) : (
                                                        '심각도 필드 미연결 또는 값 없음 — 건수만 집계됨'
                                                    )}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <div className="mt-6 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <h4 className="text-sm font-semibold text-foreground/90 m-0 shrink-0">
                                                결함 KPI (개발·결함 에픽 매핑)
                                            </h4>
                                            <InfoTooltip
                                                className="ml-0 shrink-0"
                                                panelClassName="w-[min(22rem,calc(100vw-2.5rem))] whitespace-normal text-left"
                                                content={
                                                    <div className="space-y-2">
                                                        <p className="m-0">
                                                            담당 개발 이슈(매핑된 개발 에픽 하위 리프·assignee)와 결함 등록(TQ
                                                            등 매핑 결함 에픽 하위 리프·「작업자」)을{' '}
                                                            <strong>사람별</strong>로 맞춥니다.
                                                        </p>
                                                        <p className="m-0">
                                                            비율은 <strong>(결함 ÷ 담당 개발 이슈) × 100</strong>이며, 등급은 이
                                                            비율로 산정합니다.
                                                        </p>
                                                        <p className="m-0">
                                                            표의「심각도」는 Jira 필드 <strong>「결함 심각도」</strong> 커스텀
                                                            필드만 사용합니다(우선순위와 별개). 원형 차트로 묶어 표시합니다.
                                                        </p>
                                                        <p className="m-0">
                                                            에픽 매핑은「에픽 매핑 편집」버튼으로 팝업에서 지정합니다. 설정은{' '}
                                                            <strong>localStorage</strong>에 저장됩니다.
                                                        </p>
                                                    </div>
                                                }
                                            />
                                        </div>
                                        {!defectKpiLoading && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="gap-1.5 shrink-0"
                                                onClick={() => setEpicMappingOpen(true)}
                                            >
                                                <Link2 className="h-4 w-4" aria-hidden />
                                                에픽 매핑 편집
                                            </Button>
                                        )}
                                    </div>
                                    <div className="border-b border-border" />
                                    {defectKpiLoading && (
                                        <p className="text-[13px] text-muted-foreground m-0">결함 KPI 불러오는 중…</p>
                                    )}
                                    {!defectKpiLoading && defectKpiMappingCount === 0 && (
                                        <p className="text-[13px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 rounded-md px-3 py-2">
                                            등록된 에픽 매핑이 없습니다. 아래「에픽 매핑 편집」을 눌러 개발 에픽과 TQ 결함
                                            에픽을 추가하세요.
                                        </p>
                                    )}
                                    {!defectKpiLoading && defectKpiMappingCount > 0 && !defectKpiWorkerOk && (
                                        <p className="text-[13px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-100 rounded-md px-3 py-2">
                                            Jira 필드「작업자」를 찾지 못했습니다. defectKpiConfig.ts 의
                                            WORKER_FIELD_NAMES 를 확인하세요.
                                        </p>
                                    )}
                                    {!defectKpiLoading &&
                                        defectKpiMappingCount > 0 &&
                                        defectKpiWorkerOk &&
                                        !defectKpiSeverityFieldOk && (
                                            <p className="text-[13px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 rounded-md px-3 py-2">
                                                Jira에서「결함 심각도」커스텀 필드 id를 찾지 못했습니다. 차트에는「필드
                                                미연결」구간만 표시됩니다. defectKpiConfig 의 DEFECT_SEVERITY_FIELD_NAMES·Jira 필드
                                                이름을 확인하세요(우선순위와 별개).
                                            </p>
                                        )}
                                    {!defectKpiLoading &&
                                        defectKpiMappingCount > 0 &&
                                        defectKpiWorkerOk &&
                                        defectKpiRows.length === 0 && (
                                            <p className="text-[13px] text-muted-foreground">
                                                집계할 행이 없습니다. 개발·결함 에픽에 리프 이슈와 결함「작업자」입력을
                                                확인하세요.
                                            </p>
                                        )}
                                    {!defectKpiLoading && defectKpiRows.length > 0 && (
                                        <div className="border rounded-lg overflow-x-auto text-sm bg-card">
                                            <table className="w-full min-w-[720px] table-fixed border-collapse text-[13px] leading-5">
                                                <colgroup>
                                                    {Array.from({ length: 6 }, (_, i) => (
                                                        <col key={i} style={{ width: `${100 / 6}%` }} />
                                                    ))}
                                                </colgroup>
                                                <thead className="bg-muted/40 border-b">
                                                    <tr>
                                                        <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">
                                                            담당자
                                                        </th>
                                                        <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">
                                                            담당 개발 이슈
                                                        </th>
                                                        <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">
                                                            결함 등록
                                                        </th>
                                                        <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap">
                                                            비율(%)
                                                        </th>
                                                        <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">
                                                            심각도
                                                        </th>
                                                        <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">
                                                            등급
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border/50">
                                                    {defectKpiRows.map((r) => (
                                                        <tr key={r.key}>
                                                            <td className="px-3 py-2.5 text-center text-foreground/90 align-middle min-w-0">
                                                                <span
                                                                    className="inline-block max-w-full truncate align-middle"
                                                                    title={r.displayName}
                                                                >
                                                                    {r.displayName}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center tabular-nums align-middle">
                                                                {r.devIssueCount}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center tabular-nums text-red-600 font-medium align-middle">
                                                                {r.defectCount}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center tabular-nums align-middle">
                                                                {r.defectRatePercent != null
                                                                    ? `${r.defectRatePercent}%`
                                                                    : '—'}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center align-middle text-foreground/90 min-w-0">
                                                                <DefectSeverityDonut
                                                                    breakdown={r.severityBreakdown}
                                                                    centeredInCell
                                                                />
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center font-bold align-middle">{r.grade}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section>
                                <SectionTitle>담당자별 성과 분석</SectionTitle>
                                <div className="border rounded-lg overflow-x-auto text-sm bg-card mt-4">
                                    <table className="w-full min-w-[1100px]">
                                        {/* v1.0.25: KPI 탭 thead inline hex → Tailwind 토큰 */}
                                        <thead className="bg-muted/40 border-b border-border">
                                            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                                <th className="px-4 py-3 text-left font-medium">담당자</th>
                                                <th className="px-4 py-3 text-center font-bold text-indigo-700 dark:text-indigo-300">종합 등급</th>
                                                <th className="px-4 py-3 text-center font-medium text-blue-700 dark:text-blue-300">기능 개발 완료율</th>
                                                <th className="px-4 py-3 text-center font-medium text-green-700 dark:text-green-300">일정 준수율</th>
                                                <th className="px-4 py-3 text-center font-medium text-amber-700 dark:text-amber-300">조기 종료 가점</th>
                                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">지연율 (참고)</th>
                                                <th className="px-3 py-3 text-center font-medium text-rose-700 dark:text-rose-300 whitespace-nowrap">
                                                    결함
                                                </th>
                                                <th className="px-3 py-3 text-center font-medium text-rose-700 dark:text-rose-300 whitespace-nowrap">
                                                    결함 비율
                                                </th>
                                                <th className="px-3 py-3 text-center font-medium text-rose-700 dark:text-rose-300 whitespace-nowrap">
                                                    결함 등급
                                                </th>
                                                <th className="px-2 py-3 text-left font-medium text-rose-700 dark:text-rose-300 w-auto min-w-[100px] max-w-[200px]">
                                                    심각도
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/50">
                                            {assigneesWithKPI.map(a => {
                                                const kpi = a.kpi;
                                                const delayPct = kpi.totalIssues > 0 ? Math.round((kpi.delayedIssues / kpi.totalIssues) * 100) : 0;
                                                // K8: UNASSIGNED_LABEL 통일. 과거 '미할당'/'미배정' 분기 로직 제거.
                                                const dRow = defectKpiByDisplayName.get(a.name);
                                                return (
                                                    <React.Fragment key={a.name}>
                                                    {/* v1.0.25: KPI 본 row inline → Tailwind 토큰 + 등급별 색은 헬퍼 함수로 */}
                                                    <tr className="bg-card hover:bg-accent/40 transition-colors">
                                                        <td className="px-4 py-3 font-medium text-foreground/90">
                                                            <div className="flex items-center gap-2">
                                                                <User className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                                                {a.name}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span className={cn('text-base font-extrabold tabular-nums', gradeTextClass(kpi.grades.total, 'total'))}>
                                                                    {kpi.grades.total}
                                                                </span>
                                                                <span className="text-[11px] text-muted-foreground tabular-nums">({kpi.totalScore}점)</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span className={cn('text-sm font-bold tabular-nums', gradeTextClass(kpi.grades.completion, 'completion'))}>
                                                                    {kpi.grades.completion}
                                                                </span>
                                                                <span className="text-[11px] text-muted-foreground tabular-nums">{kpi.completionRate}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span className={cn('text-sm font-bold tabular-nums', gradeTextClass(kpi.grades.compliance, 'compliance'))}>
                                                                    {kpi.grades.compliance}
                                                                </span>
                                                                <span className="text-[11px] text-muted-foreground tabular-nums">{kpi.complianceRate}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                                                                    +{kpi.grades.earlyBonus}
                                                                </span>
                                                                <span className="text-[11px] text-muted-foreground tabular-nums">{kpi.earlyRate}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-muted-foreground">
                                                            {delayPct > 0 ? `${delayPct}%` : '-'}
                                                        </td>
                                                        <td className="px-3 py-2 text-center tabular-nums text-foreground">
                                                            {defectKpiLoading ? '…' : dRow != null ? dRow.defectCount : '—'}
                                                        </td>
                                                        <td className="px-3 py-2 text-center tabular-nums text-foreground">
                                                            {defectKpiLoading
                                                                ? '…'
                                                                : dRow?.defectRatePercent != null
                                                                  ? `${dRow.defectRatePercent}%`
                                                                  : '—'}
                                                        </td>
                                                        <td className="px-3 py-2 text-center font-bold text-foreground">
                                                            {defectKpiLoading ? '…' : dRow != null ? dRow.grade : '—'}
                                                        </td>
                                                        <td className="px-2 py-1 align-middle">
                                                            {defectKpiLoading ? (
                                                                <span className="text-muted-foreground text-xs">…</span>
                                                            ) : dRow && dRow.severityBreakdown.length > 0 ? (
                                                                <DefectSeverityDonut breakdown={dRow.severityBreakdown} />
                                                            ) : (
                                                                <span className="text-muted-foreground text-xs">—</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                    {/* v1.0.15: KPI 탭 sub-row — 메인 X와 함께한 서브 협업자별 가중 KPI */}
                                                    {a.collaborations.map((c) => {
                                                        const collabKpi = calculateWeightedKPI({
                                                            mainIssues: [],
                                                            subIssues: c.sharedIssues,
                                                            subWeight: SUB_ASSIGNEE_WEIGHT,
                                                        });
                                                        const sharedN = c.sharedIssues.length;
                                                        return (
                                                            <tr key={`${a.name}__kpi_sub__${c.subKey}`} className="bg-violet-50 dark:bg-violet-950/30 border-b border-border/50">
                                                                <td className="pl-7 pr-2 py-1">
                                                                    <div className="flex items-center gap-1 whitespace-nowrap">
                                                                        <span className="text-violet-400 dark:text-violet-500 text-[10px] leading-none">└</span>
                                                                        <span className="text-[8px] leading-none text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-900/60 rounded px-1 py-px font-semibold tracking-tight">서브</span>
                                                                        <span className="text-[10px] text-foreground/80 truncate max-w-[80px]" title={c.subDisplayName}>{c.subDisplayName}</span>
                                                                        <span className="text-[9px] text-muted-foreground" title={`${a.name}와 함께한 task ${sharedN}건 (가중 ${(sharedN * SUB_ASSIGNEE_WEIGHT).toFixed(1)}점)`}>
                                                                            ({sharedN}×{SUB_ASSIGNEE_WEIGHT})
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2 text-center">
                                                                    <div className="flex flex-col items-center">
                                                                        <span className={cn('text-sm font-bold tabular-nums', collabKpi.grades.total === 'S' ? 'text-indigo-600 dark:text-indigo-400' : collabKpi.grades.total === 'A' ? 'text-blue-600 dark:text-blue-400' : 'text-violet-600 dark:text-violet-400')}>
                                                                            {collabKpi.grades.total}
                                                                        </span>
                                                                        <span className="text-[10px] text-violet-600 dark:text-violet-400 tabular-nums">({collabKpi.totalScore}점)</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2 text-center">
                                                                    <div className="flex flex-col items-center">
                                                                        <span className="text-xs font-semibold text-foreground/90">{collabKpi.grades.completion}</span>
                                                                        <span className="text-[10px] text-muted-foreground">{collabKpi.completionRate}%</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2 text-center">
                                                                    <div className="flex flex-col items-center">
                                                                        <span className="text-xs font-semibold text-foreground/90">{collabKpi.grades.compliance}</span>
                                                                        <span className="text-[10px] text-muted-foreground">{collabKpi.complianceRate}%</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2 text-center">
                                                                    <span className="text-[10px] text-amber-700 dark:text-amber-300">+{collabKpi.grades.earlyBonus}</span>
                                                                </td>
                                                                <td className="px-4 py-2 text-center text-[10px] text-muted-foreground">
                                                                    {collabKpi.totalIssues > 0 && collabKpi.delayedIssues > 0
                                                                        ? `${Math.round((collabKpi.delayedIssues / collabKpi.totalIssues) * 100)}%`
                                                                        : '-'}
                                                                </td>
                                                                <td colSpan={4} className="px-3 py-2 text-[10px] text-violet-600 italic">
                                                                    협업 KPI · 결함 분석은 메인 행 참조
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>
                    </TabsContent>

                    {/* 진행 추이/예측 — 사이드바 선택 에픽 기준 (IGMU 한정) */}
                    <TabsContent value="trends" className="flex-1 overflow-y-auto p-0 m-0 border-0 focus-visible:ring-0 focus-visible:outline-none">
                        <div className="px-6 py-5 pb-20">
                            <ProgressTrends issues={issues} selectedEpicIds={selectedEpicIds} epics={epics} />
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>

        <Dialog open={epicMappingDialogOpen} onOpenChange={setEpicMappingOpen}>
            <DialogContent className="z-[200] sm:max-w-lg max-h-[85vh] flex flex-col gap-0 overflow-hidden p-0">
                <DialogHeader className="px-6 pt-6 pb-2 shrink-0 border-b">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Link2 className="h-5 w-5 text-foreground/80 shrink-0" aria-hidden />
                        개발 에픽 ↔ 결함 에픽 매핑
                    </DialogTitle>
                </DialogHeader>
                <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
                    <EpicMappingEditor
                        devEpics={epics}
                        defectEpics={tqDefectEpics}
                        defectEpicsLoading={tqEpicsLoading}
                        defectEpicsError={tqEpicsError as Error | null}
                    />
                </div>
                <DialogFooter className="px-6 py-3 border-t shrink-0">
                    <Button type="button" variant="outline" onClick={() => setEpicMappingOpen(false)}>
                        닫기
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    );
}

// ── 하위 컴포넌트 ─────────────────────────────────────────────────────────────

/** 심각도 도넛·범례 — 색상환상 간격을 넓히고 채도를 높여 구간 구분이 뚜렷하도록 함 */
const SEVERITY_DONUT_COLORS = [
    '#dc2626', // red-600
    '#7c3aed', // violet-600
    '#2563eb', // blue-600
    '#0891b2', // cyan-600
    '#16a34a', // green-600
    '#ca8a04', // amber-600
    '#ea580c', // orange-600
    '#db2777', // pink-600
    '#4f46e5', // indigo-600
    '#0f766e', // teal-700
];

/** 결함 심각도 분포 — 도넛 + 컴팩트 범례 (한 덩어리로 표시) */
function DefectSeverityDonut({
    breakdown,
    centeredInCell = false,
}: {
    breakdown: Array<{ name: string; count: number }>;
    /** 동일 너비 열 가운데 정렬용(결함 KPI 표) */
    centeredInCell?: boolean;
}) {
    const total = breakdown.reduce((s, x) => s + x.count, 0);
    if (total === 0) {
        return <span className="text-muted-foreground text-xs">—</span>;
    }
    const segments = breakdown.map((item, i) => ({
        value: item.count,
        color: SEVERITY_DONUT_COLORS[i % SEVERITY_DONUT_COLORS.length],
        label: item.name,
    }));
    return (
        <div
            className={cn(
                'flex items-center gap-1 min-w-0',
                centeredInCell && 'inline-flex w-max max-w-full justify-center',
            )}
        >
            <PieChart
                segments={segments}
                size={52}
                centerLabel={total > 99 ? '99+' : String(total)}
                whiteSliceOutline
            />
            <ul
                className={cn(
                    'text-[10px] leading-tight text-foreground/80 min-w-0 m-0 p-0 list-none space-y-px',
                    centeredInCell ? 'shrink text-left' : 'flex-1',
                )}
            >
                {breakdown.map((s, i) => (
                    <li
                        key={`${s.name}-${i}`}
                        className="flex items-center gap-0.5 min-w-0"
                        title={`${s.name}: ${s.count}`}
                    >
                        <span
                            className="w-2 h-2 rounded-full shrink-0 shadow-[0_0_0_1px_rgba(15,23,42,0.18)]"
                            style={{ backgroundColor: SEVERITY_DONUT_COLORS[i % SEVERITY_DONUT_COLORS.length] }}
                        />
                        <span className="inline-flex min-w-0 items-baseline gap-0.5">
                            <span className="truncate">{s.name}</span>
                            <span className="tabular-nums shrink-0 font-medium text-foreground/90">{s.count}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** 툴팁 컴포넌트 (CSS Only) */
function InfoTooltip({
    content,
    className,
    panelClassName,
}: {
    content: React.ReactNode;
    className?: string;
    panelClassName?: string;
}) {
    return (
        <div className={cn('group relative flex items-center ml-1.5 cursor-help z-50', className)}>
            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground/80 transition-colors" />
            <div
                className={cn(
                    'absolute left-1/2 top-full mt-2 -translate-x-1/2 w-72 p-3 bg-slate-800 text-foreground text-xs rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none whitespace-pre-wrap leading-relaxed z-[9999]',
                    panelClassName,
                )}
            >
                {content}
                <div className="absolute left-1/2 bottom-full -translate-x-1/2 border-4 border-transparent border-b-slate-800" />
            </div>
        </div>
    );
}

/** SVG 도넛 파이차트 */
function PieChart({
    segments,
    size = 120,
    centerLabel,
    /** 결함 심각도 등 인접 색 구간을 흰 테두리로 분리 */
    whiteSliceOutline = false,
}: {
    segments: { value: number; color: string; label: string }[];
    size?: number;
    centerLabel?: string;
    whiteSliceOutline?: boolean;
}) {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (total === 0) {
        return (
            <div className="rounded-full bg-muted/60 flex items-center justify-center text-xs text-muted-foreground"
                style={{ width: size, height: size }}>
                —
            </div>
        );
    }

    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.42;
    const ir = size * 0.28;

    let startAngle = -90;
    const paths: { d: string; color: string }[] = [];

    segments.filter(s => s.value > 0).forEach(seg => {
        const pct = seg.value / total;
        const sweep = pct * 360;
        const gap = whiteSliceOutline ? 0.65 : 0.3;
        const endAngle = startAngle + sweep - gap;

        const toRad = (deg: number) => (deg * Math.PI) / 180;
        const x1 = cx + r * Math.cos(toRad(startAngle));
        const y1 = cy + r * Math.sin(toRad(startAngle));
        const x2 = cx + r * Math.cos(toRad(endAngle));
        const y2 = cy + r * Math.sin(toRad(endAngle));
        const ix1 = cx + ir * Math.cos(toRad(endAngle));
        const iy1 = cy + ir * Math.sin(toRad(endAngle));
        const ix2 = cx + ir * Math.cos(toRad(startAngle));
        const iy2 = cy + ir * Math.sin(toRad(startAngle));
        const largeArc = sweep > 180 ? 1 : 0;

        paths.push({
            d: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${largeArc} 0 ${ix2} ${iy2} Z`,
            color: seg.color,
        });
        startAngle += sweep;
    });

    const sliceStroke = whiteSliceOutline ? Math.max(1, size * 0.03) : 0;

    return (
        <svg width={size} height={size} style={{ overflow: 'visible' }}>
            {paths.map((p, i) => (
                <path
                    key={i}
                    d={p.d}
                    fill={p.color}
                    stroke={whiteSliceOutline ? '#ffffff' : 'none'}
                    strokeWidth={sliceStroke}
                    strokeLinejoin="round"
                />
            ))}
            {centerLabel && (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                    style={{ fontSize: size * 0.14, fontWeight: 700, fill: '#1e293b' }}>
                    {centerLabel}
                </text>
            )}
        </svg>
    );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <div className="border-b border-border pb-2">
            <h2 className="m-0 text-[13px] font-semibold tracking-wide text-foreground/80 uppercase">{children}</h2>
        </div>
    );
}

/**
 * KPI 등급 → Tailwind 텍스트 색 (다크 자동 대응).
 * v1.0.25: 등급별 색을 헬퍼로 추출. 'total'/'completion'은 indigo·blue, 'compliance'는 green 계열.
 */
function gradeTextClass(grade: string, type: 'total' | 'completion' | 'compliance'): string {
    if (type === 'compliance') {
        if (grade === 'S') return 'text-green-600 dark:text-green-400';
        if (grade === 'A') return 'text-green-700 dark:text-green-400';
        return 'text-foreground/80';
    }
    // total / completion
    if (grade === 'S') return 'text-indigo-600 dark:text-indigo-400';
    if (grade === 'A') return 'text-blue-600 dark:text-blue-400';
    if (type === 'total') return 'text-foreground';
    return 'text-foreground/80';
}

/**
 * StatCard — v1.0.24: inline hex 색상 → Tailwind 토큰 (다크 모드 자동 대응).
 * KPI 대시보드 / 프로젝트 현황 카드.
 */
function StatCard({ icon, label, value, sub, color, onClick }: {
    icon: React.ReactNode; label: string; value: number | string; sub: string;
    color: 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'purple'; onClick?: () => void;
}) {
    const cfg = {
        blue:   { bg: 'bg-blue-50 dark:bg-blue-950/30',     border: 'border-blue-200 dark:border-blue-900/60',     val: 'text-blue-700 dark:text-blue-300',     hover: 'hover:bg-blue-100 dark:hover:bg-blue-950/50' },
        green:  { bg: 'bg-green-50 dark:bg-green-950/30',   border: 'border-green-200 dark:border-green-900/60',   val: 'text-green-700 dark:text-green-300',   hover: 'hover:bg-green-100 dark:hover:bg-green-950/50' },
        amber:  { bg: 'bg-amber-50 dark:bg-amber-950/30',   border: 'border-amber-200 dark:border-amber-900/60',   val: 'text-amber-700 dark:text-amber-300',   hover: 'hover:bg-amber-100 dark:hover:bg-amber-950/50' },
        red:    { bg: 'bg-red-50 dark:bg-red-950/30',       border: 'border-red-200 dark:border-red-900/60',       val: 'text-red-700 dark:text-red-300',       hover: 'hover:bg-red-100 dark:hover:bg-red-950/50' },
        purple: { bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-900/60', val: 'text-purple-700 dark:text-purple-300', hover: 'hover:bg-purple-100 dark:hover:bg-purple-950/50' },
        slate:  { bg: 'bg-muted/40',                        border: 'border-border',                                val: 'text-foreground',                       hover: 'hover:bg-muted/60' },
    }[color];
    return (
        <button
            onClick={onClick}
            className={cn(
                'group rounded-xl border px-4 py-3 flex flex-col gap-1 text-left w-full cursor-pointer card-hover',
                cfg.bg, cfg.border, cfg.hover
            )}
        >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {icon}
                <span className="font-medium">{label}</span>
            </div>
            <div className={cn('text-2xl font-bold tabular-nums leading-none', cfg.val)}>{value}</div>
            <div className="text-xs text-muted-foreground tabular-nums">{sub}</div>
        </button>
    );
}

/**
 * BarStat — 진행률 바 (라벨 + 퍼센트 + 트랙). 다크 모드 토큰 사용.
 */
function BarStat({ label, pct, color, sub }: { label: string; pct: number; color: string; sub: string }) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
                <span className="font-medium text-foreground/80">{label}</span>
                <span className="font-bold tabular-nums" style={{ color }}>{pct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden">
                <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums m-0">{sub}</p>
        </div>
    );
}

/**
 * ClickCell — 표 안 클릭 가능한 숫자 셀. 다크 hover 토큰 사용.
 */
function ClickCell({ value, color, onClick }: { value: number; color: string; onClick: () => void }) {
    return (
        <td className="px-3 py-3 text-center">
            <button
                onClick={onClick}
                disabled={value === 0}
                className={cn(
                    'rounded-md px-2 py-1 font-bold text-sm tabular-nums transition-colors',
                    value === 0
                        ? 'text-muted-foreground/50 cursor-not-allowed'
                        : 'cursor-pointer hover:bg-accent'
                )}
                style={value > 0 ? { color } : undefined}
            >
                {value}
            </button>
        </td>
    );
}

/**
 * RateBadge — v1.0.24: 등급 색을 Tailwind 토큰화. 다크 모드 자동 대응.
 */
function RateBadge({ value, type }: { value: number; type: 'progress' | 'delay' | 'early' }) {
    const cls =
        type === 'progress'
            ? value >= 80
                ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300'
                : value >= 50
                    ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                    : 'bg-muted/60 text-foreground/80'
            : type === 'delay'
                ? value === 0
                    ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300'
                    : value <= 20
                        ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                        : 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                : value >= 50
                    ? 'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300'
                    : value > 0
                        ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                        : 'bg-muted/60 text-muted-foreground';
    return (
        <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', cls)}>
            {value}%
        </span>
    );
}

function GradeCard({
    title,
    grade,
    rate,
    displayRate,
    color,
    desc,
    tooltip,
}: {
    title: string;
    grade: string | number;
    rate: number;
    /** 있으면 괄호 안 비율 표시를 대체 (예: "12.5%" 또는 "—") */
    displayRate?: string;
    color: 'blue' | 'green' | 'amber' | 'rose';
    desc: string;
    tooltip?: string;
}) {
    // v1.0.25: GradeCard inline hex → Tailwind 토큰
    const cfg = {
        blue:  { bg: 'bg-blue-50 dark:bg-blue-950/30',   border: 'border-blue-200 dark:border-blue-900/60',   text: 'text-blue-700 dark:text-blue-300' },
        green: { bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-900/60', text: 'text-green-700 dark:text-green-300' },
        amber: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-900/60', text: 'text-amber-700 dark:text-amber-300' },
        rose:  { bg: 'bg-rose-50 dark:bg-rose-950/30',   border: 'border-rose-200 dark:border-rose-900/60',   text: 'text-rose-700 dark:text-rose-300' },
    }[color];

    const rateBracket = displayRate !== undefined ? displayRate : `${rate}%`;

    return (
        <div className={cn('rounded-xl border p-5', cfg.bg, cfg.border)}>
            <div className="flex items-center mb-2">
                <h3 className="m-0 text-[13px] font-semibold text-muted-foreground">{title}</h3>
                {tooltip && <InfoTooltip content={tooltip} />}
            </div>
            <div className="flex items-baseline gap-2 mb-1">
                <span className={cn('text-[32px] font-extrabold tabular-nums leading-none', cfg.text)}>{grade}</span>
                <span className={cn('text-sm font-semibold tabular-nums', cfg.text)}>({rateBracket})</span>
            </div>
            <p className="m-0 text-[12px] leading-5 text-muted-foreground">{desc}</p>
        </div>
    );
}
