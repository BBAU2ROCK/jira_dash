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
import { calculateKPI } from '@/services/kpiService';
import { JIRA_CONFIG } from '@/config/jiraConfig';
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
    const onHoldName = kpiRules.statusNames?.onHold ?? JIRA_CONFIG.STATUS_NAMES?.ON_HOLD ?? '보류';
    const cancelledName = kpiRules.statusNames?.cancelled ?? JIRA_CONFIG.STATUS_NAMES?.CANCELLED ?? '취소';
    const isOnHold = (i: JiraIssue) => (i.fields.status?.name?.trim() ?? '') === onHoldName;
    const isCancelled = (i: JiraIssue) => (i.fields.status?.name?.trim() ?? '') === cancelledName;

    // ── KPI 계산 ─────────────────────────────────────────────────────────────
    const kpiMetrics = calculateKPI(leafIssues);

    // ── 전체 통계 (5분할: 보류·취소·완료·진행·대기, 상호 배타) ─────────────────
    const onHold = leafIssues.filter(i => isOnHold(i));
    const cancelled = leafIssues.filter(i => isCancelled(i));
    const done = leafIssues.filter(i =>
        getStatusCategoryKey(i) === 'done' && !isOnHold(i) && !isCancelled(i)
    );
    const inProg = leafIssues.filter(i => getStatusCategoryKey(i) === 'indeterminate');
    const todo = leafIssues.filter(i =>
        !isOnHold(i) && !isCancelled(i) &&
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
    const completionRate = total > 0 ? Math.round((done.length / total) * 100) : 0;

    // v1.0.10 S5: store에서 필드 ID 참조 (커스텀 필드 변경 시 즉시 반영)
    const spField = kpiRules.fields?.storyPoint ?? JIRA_CONFIG.FIELDS.STORY_POINT;
    const totalSP = leafIssues.reduce((s, i) => s + ((i.fields[spField] as number | undefined) || 0), 0);
    const doneSP = done.reduce((s, i) => s + ((i.fields[spField] as number | undefined) || 0), 0);

    // ── 담당자별 통계 ─────────────────────────────────────────────────────────
    const assigneeMap = new Map<string, AssigneeStats>();

    // 리프만 담당자별 건수·업무로그 집계 (보류·취소는 완료로 포함, earlyDone/compliant는 실제 done만)
    const isDoneForAssignee = (issue: JiraIssue) =>
        getStatusCategoryKey(issue) === 'done' || isOnHold(issue) || isCancelled(issue);

    leafIssues.forEach(issue => {
        const name = issue.fields.assignee?.displayName ?? UNASSIGNED_LABEL;
        if (!assigneeMap.has(name)) {
            assigneeMap.set(name, {
                name, total: [], done: [], inProgress: [], todo: [], delayed: [],
                earlyDone: [], compliant: [], withWorklog: [], withoutWorklog: [], totalTimeSpent: 0
            });
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
            assigneeMap.set(name, {
                name, total: [], done: [], inProgress: [], todo: [], delayed: [],
                earlyDone: [], compliant: [], withWorklog: [], withoutWorklog: [], totalTimeSpent: 0
            });
        }
        assigneeMap.get(name)!.totalTimeSpent += timeSpent;
    });

    const assignees = Array.from(assigneeMap.values())
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

    // ── 파이차트 세그먼트 (5분할: 완료·진행·대기·보류·취소) ─────────────────────
    const overallSegments = [
        { value: done.length, color: '#22c55e', label: '완료' },
        { value: inProg.length, color: '#3b82f6', label: '진행' },
        { value: todo.length, color: '#cbd5e1', label: '대기' },
        { value: onHold.length, color: '#94a3b8', label: '보류' },
        { value: cancelled.length, color: '#64748b', label: '취소' },
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
                className="max-w-[1180px] max-h-[90vh] flex flex-col p-0 overflow-hidden"
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
                    <div className="px-6 pt-4 pb-0 bg-slate-50/50 border-b border-slate-200">
                        <div className="flex w-full justify-start gap-2 h-10 translate-y-[1px]">
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setCurrentTab('status')}
                                onKeyDown={(e) => e.key === 'Enter' && setCurrentTab('status')}
                                className={`flex items-center justify-center rounded-t-lg border-x border-t px-5 py-2 text-sm font-bold transition-all cursor-pointer select-none ${currentTab === 'status'
                                    ? 'bg-white border-slate-200 border-b-transparent text-blue-600 shadow-[0_-1px_2px_rgba(0,0,0,0.05)] z-10'
                                    : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50 border-b-transparent'
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
                                    ? 'bg-white border-slate-200 border-b-transparent text-blue-600 shadow-[0_-1px_2px_rgba(0,0,0,0.05)] z-10'
                                    : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50 border-b-transparent'
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
                                    ? 'bg-white border-slate-200 border-b-transparent text-blue-600 shadow-[0_-1px_2px_rgba(0,0,0,0.05)] z-10'
                                    : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50 border-b-transparent'
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

                                {/* 6개 카드: 전체·완료·진행·지연·보류·취소 */}
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                                    <StatCard icon={<Layers className="w-4 h-4 text-blue-500" />}
                                        label="전체 이슈" value={total} sub="개" color="blue"
                                        onClick={() => openGroup('전체 이슈', leafIssues, '#3b82f6')} />
                                    <StatCard icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
                                        label="완료" value={`${completionRate}%`} sub={`${done.length}/${total}`} color="green"
                                        onClick={() => openGroup('완료 이슈', done, '#22c55e')} />
                                    <StatCard icon={<Clock className="w-4 h-4 text-amber-500" />}
                                        label="진행 중" value={inProg.length} sub="개" color="amber"
                                        onClick={() => openGroup('진행 중 이슈', inProg, '#f59e0b')} />
                                    <StatCard icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
                                        label="지연" value={delayed.length} sub="개" color="red"
                                        onClick={() => openGroup('지연 이슈', delayed, '#ef4444')} />
                                    <StatCard icon={<Pause className="w-4 h-4 text-slate-500" />}
                                        label="보류" value={onHold.length} sub="개" color="slate"
                                        onClick={() => openGroup('보류 이슈', onHold, '#94a3b8')} />
                                    <StatCard icon={<CircleSlash className="w-4 h-4 text-slate-600" />}
                                        label="취소" value={cancelled.length} sub="개" color="slate"
                                        onClick={() => openGroup('취소 이슈', cancelled, '#64748b')} />
                                </div>

                                {/* 파이차트 + 범례 + 바 */}
                                <div className="grid grid-cols-3 gap-6 items-center">
                                    {/* 파이차트 */}
                                    <div className="flex flex-col items-center gap-3">
                                        <p className="text-xs font-semibold text-slate-600">이슈 분포</p>
                                        <PieChart segments={overallSegments} size={160} centerLabel={`${completionRate}%`} />
                                        <div className="flex flex-wrap justify-center gap-2 mt-3">
                                            {overallSegments.map(seg => (
                                                <button key={seg.label}
                                                    onClick={() => openGroup(seg.label, seg.label === '완료' ? done : seg.label === '진행' ? inProg : seg.label === '대기' ? todo : seg.label === '보류' ? onHold : cancelled, seg.color)}
                                                    style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9999, padding: '2px 8px', cursor: 'pointer' }}
                                                    className="flex items-center gap-1.5 text-[11px] hover:opacity-80 transition-opacity"
                                                >
                                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                                                    <span style={{ color: '#475569' }}>{seg.label}</span>
                                                    <span style={{ color: '#0f172a', fontWeight: 700, marginLeft: 2 }}>{seg.value}</span>
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
                                    </div>
                                </div>
                            </section>

                            {/* ── 섹션 2: 담당자별 통계 ──────────────────────────────── */}
                            <section className="space-y-4">
                                <SectionTitle>담당자별 현황</SectionTitle>

                                <div className="overflow-x-auto rounded-lg border">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                <th className="px-4 py-3 text-left w-36">담당자</th>
                                                <th className="px-3 py-3 text-center w-28">분포</th>
                                                <th className="px-3 py-3 text-center">전체</th>
                                                <th className="px-3 py-3 text-center" style={{ color: '#15803d' }}>완료</th>
                                                <th className="px-3 py-3 text-center" style={{ color: '#1d4ed8' }}>진행</th>
                                                <th className="px-3 py-3 text-center" style={{ color: '#475569' }}>대기</th>
                                                <th className="px-3 py-3 text-center" style={{ color: '#b91c1c' }}>지연</th>
                                                <th className="px-3 py-3 text-center" style={{ color: '#0e7490' }}>조기완료</th>
                                                <th className="px-3 py-3 text-center" style={{ color: '#2563eb' }}>로그 있음</th>
                                                <th className="px-3 py-3 text-center" style={{ color: '#64748b' }}>로그 없음</th>
                                                <th className="px-3 py-3 text-center" style={{ color: '#475569' }}>기록 시간</th>
                                                <th className="px-3 py-3 text-center">진척률</th>
                                                <th className="px-3 py-3 text-center" style={{ color: '#15803d' }}>준수율</th>
                                                <th className="px-3 py-3 text-center">지연율</th>
                                                <th className="px-3 py-3 text-center">조기완료율</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {assignees.map(a => {
                                                const t = a.total.length;
                                                const d = a.done.length;
                                                const progressRate = t > 0 ? Math.round((d / t) * 100) : 0;
                                                // K2: KPI 탭과 준수율 산식 통일 — calculateKPI 재사용 (agreed-delay 이중 제외)
                                                //   이전: a.compliant.length / t * 100 (합의지연 미제외 → KPI 탭과 불일치)
                                                //   현재: calculateKPI(a.total).complianceRate (합의지연 분모·분자 양쪽 차감)
                                                const assigneeKpi = calculateKPI(a.total);
                                                const complianceRate = assigneeKpi.complianceRate;
                                                const delayRate = t > 0 ? Math.round((a.delayed.length / t) * 100) : 0;
                                                const earlyRate = d > 0 ? Math.round((a.earlyDone.length / d) * 100) : 0;

                                                const segs = [
                                                    { value: a.done.length, color: '#22c55e', label: '완료' },
                                                    { value: a.inProgress.length, color: '#3b82f6', label: '진행' },
                                                    { value: a.todo.length, color: '#cbd5e1', label: '대기' },
                                                ];

                                                return (
                                                    <tr key={a.name}
                                                        style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: '#ffffff', transition: 'background-color 0.15s' }}
                                                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                                                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ffffff')}
                                                    >
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <User className="w-3.5 h-3.5 shrink-0" style={{ color: '#94a3b8' }} />
                                                                <span style={{ fontWeight: 500, color: '#1e293b', fontSize: 12 }}>{a.name}</span>
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
                                                                    className={`font-bold text-sm ${a.withWorklog.length === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors'}`}>
                                                                    {a.withWorklog.length}
                                                                </button>
                                                                <span className="text-[10px] text-slate-400 mt-0.5">{t > 0 ? Math.round((a.withWorklog.length / t) * 100) : 0}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <button onClick={() => openGroup(`${a.name} · 로그 없음`, a.withoutWorklog, '#64748b')}
                                                                    disabled={a.withoutWorklog.length === 0}
                                                                    className={`font-bold text-sm ${a.withoutWorklog.length === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-50 px-2 py-1 rounded transition-colors'}`}>
                                                                    {a.withoutWorklog.length}
                                                                </button>
                                                                <span className="text-[10px] text-slate-400 mt-0.5">{t > 0 ? Math.round((a.withoutWorklog.length / t) * 100) : 0}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <span className="font-semibold text-slate-700">{formatTime(a.totalTimeSpent)}</span>
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
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>

                        {/* ── 이슈 목록 슬라이드 패널 ──────────────────────────────── */}
                        {selectedGroup && (
                            <div style={{ borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', padding: '16px 24px' }}
                                className="sticky bottom-0 max-h-[340px] overflow-y-auto">
                                <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                                    <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, color: '#1e293b' }}>
                                        <ChevronRight className="w-4 h-4" style={{ color: selectedGroup.color }} />
                                        <span style={{ color: selectedGroup.color }}>{selectedGroup.title}</span>
                                        <span style={{ display: 'inline-block', backgroundColor: '#e2e8f0', color: '#475569', borderRadius: 9999, padding: '1px 8px', fontSize: 11, fontWeight: 500, marginLeft: 4 }}>
                                            {selectedGroup.issues.length}개
                                        </span>
                                    </h3>
                                    <button onClick={() => setSelectedGroup(null)}
                                        style={{ color: '#94a3b8', cursor: 'pointer', background: 'none', border: 'none', display: 'flex', alignItems: 'center' }}
                                        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#475569')}
                                        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#94a3b8')}>
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                {difficultyBreakdown.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginRight: 4 }}>난이도</span>
                                        {difficultyBreakdown.map(({ name, count, pct }) => {
                                            const keys = difficultyNameToKeys[name] ?? [];
                                            const handleClick = () => {
                                                if (onShowIssuesInList && keys.length > 0) {
                                                    onShowIssuesInList(keys);
                                                    onClose();
                                                }
                                            };
                                            return (
                                                <button
                                                    key={name}
                                                    type="button"
                                                    onClick={handleClick}
                                                    disabled={!onShowIssuesInList || keys.length === 0}
                                                    style={{
                                                        display: 'inline-block',
                                                        border: '1px solid #e2e8f0',
                                                        borderRadius: 6,
                                                        padding: '4px 10px',
                                                        fontSize: 12,
                                                        color: '#475569',
                                                        backgroundColor: '#fff',
                                                        whiteSpace: 'nowrap',
                                                        cursor: onShowIssuesInList && keys.length > 0 ? 'pointer' : 'default'
                                                    }}
                                                    className={onShowIssuesInList && keys.length > 0 ? 'hover:bg-slate-50 hover:border-slate-300 transition-colors' : ''}
                                                >
                                                    {name} {count}건 ({pct}%)
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 12, backgroundColor: '#ffffff',
                                                border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', fontSize: 13,
                                                cursor: onShowIssuesInList ? 'pointer' : 'default'
                                            }}
                                            onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.backgroundColor = onShowIssuesInList ? '#f1f5f9' : '#f8fafc')}
                                            onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.backgroundColor = '#ffffff')}>
                                            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: selectedGroup.color, whiteSpace: 'nowrap' }}>
                                                {issue.key}
                                            </span>
                                            <span style={{ color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                                {issue.fields.summary}
                                            </span>
                                            <span style={{
                                                display: 'inline-block', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 6px',
                                                fontSize: 11, color: '#475569', backgroundColor: '#f8fafc', whiteSpace: 'nowrap'
                                            }}>
                                                {issue.fields.status?.name ?? '—'}
                                            </span>
                                            {issue.fields.assignee && (
                                                <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                                    {issue.fields.assignee.displayName}
                                                </span>
                                            )}
                                            {issue.fields.duedate && (
                                                <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
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
                        <div className="px-6 py-6 space-y-8 text-[13px] leading-5 text-slate-700">
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
                                <div className="border rounded-lg overflow-hidden text-sm bg-white mt-4">
                                    <table className="w-full">
                                        <thead className="bg-slate-50 border-b">
                                            <tr>
                                                <th className="px-6 py-3 text-left font-medium text-slate-500">항목</th>
                                                <th className="px-6 py-3 text-right font-medium text-slate-500">값</th>
                                                <th className="px-6 py-3 text-left font-medium text-slate-500">비고</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            <tr>
                                                <td className="px-6 py-3 text-slate-700">전체 대상 이슈</td>
                                                <td className="px-6 py-3 text-right font-semibold">{kpiMetrics.totalIssues} 개</td>
                                                <td className="px-6 py-3 text-slate-400 text-xs">총 계획된 기능 수</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-slate-700">연기 합의 이슈</td>
                                                <td className="px-6 py-3 text-right font-semibold text-slate-500">{kpiMetrics.agreedDelayIssues} 개</td>
                                                <td className="px-6 py-3 text-slate-400 text-xs">완료율 계산 시 모수에서 제외</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-slate-700">개발 완료 (조정 후)</td>
                                                <td className="px-6 py-3 text-right font-semibold text-blue-600">{kpiMetrics.completedIssues} 개</td>
                                                <td className="px-6 py-3 text-slate-400 text-xs">최종 완료된 기능 수</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-slate-700">일정 준수 완료</td>
                                                <td className="px-6 py-3 text-right font-semibold text-green-600">{kpiMetrics.compliantIssues} 개</td>
                                                <td className="px-6 py-3 text-slate-400 text-xs">완료 예정일 이내 완료</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-slate-700">조기 완료</td>
                                                <td className="px-6 py-3 text-right font-semibold text-amber-600">{kpiMetrics.earlyIssues} 개</td>
                                                <td className="px-6 py-3 text-slate-400 text-xs">완료 예정일보다 하루 이상 빨리 완료</td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-slate-700">지연 완료</td>
                                                <td className="px-6 py-3 text-right font-semibold text-red-600">{kpiMetrics.delayedIssues} 개</td>
                                                <td className="px-6 py-3 text-slate-400 text-xs">완료 예정일을 초과하여 완료</td>
                                            </tr>
                                            <tr className="bg-slate-50/90">
                                                <td
                                                    colSpan={3}
                                                    className="px-6 py-2 text-xs font-semibold text-slate-600 border-t border-slate-200"
                                                >
                                                    결함 KPI (개발·결함 에픽 매핑 · 팀 합계)
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-slate-700">팀 담당 개발 이슈</td>
                                                <td className="px-6 py-3 text-right font-semibold tabular-nums">
                                                    {defectKpiLoading
                                                        ? '…'
                                                        : teamDefectKpiSummary != null
                                                          ? `${teamDefectKpiSummary.totalDev} 개`
                                                          : '—'}
                                                </td>
                                                <td className="px-6 py-3 text-slate-400 text-xs">
                                                    매핑 에픽 리프·assignee 기준 합계
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-slate-700">팀 결함 등록</td>
                                                <td className="px-6 py-3 text-right font-semibold text-rose-600 tabular-nums">
                                                    {defectKpiLoading
                                                        ? '…'
                                                        : teamDefectKpiSummary != null
                                                          ? `${teamDefectKpiSummary.totalDefect} 개`
                                                          : '—'}
                                                </td>
                                                <td className="px-6 py-3 text-slate-400 text-xs">
                                                    「작업자」매칭 결함 리프 합계
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-slate-700">팀 결함 비율</td>
                                                <td className="px-6 py-3 text-right font-semibold tabular-nums">
                                                    {defectKpiLoading
                                                        ? '…'
                                                        : teamDefectKpiSummary?.ratePercent != null
                                                          ? `${teamDefectKpiSummary.ratePercent}%`
                                                          : '—'}
                                                </td>
                                                <td className="px-6 py-3 text-slate-400 text-xs">
                                                    결함 ÷ 담당 개발 이슈 × 100 · 등급{' '}
                                                    {teamDefectKpiSummary && teamDefectKpiSummary.grade !== '—'
                                                        ? teamDefectKpiSummary.grade
                                                        : '—'}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="px-6 py-3 text-slate-700 align-top">팀 심각도 분포</td>
                                                <td className="px-6 py-3 text-right font-semibold tabular-nums text-slate-800 align-top">
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
                                                <td className="px-6 py-3 text-slate-400 text-xs align-top">
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
                                            <h4 className="text-sm font-semibold text-slate-700 m-0 shrink-0">
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
                                    <div className="border-b border-slate-200" />
                                    {defectKpiLoading && (
                                        <p className="text-[13px] text-slate-500 m-0">결함 KPI 불러오는 중…</p>
                                    )}
                                    {!defectKpiLoading && defectKpiMappingCount === 0 && (
                                        <p className="text-[13px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                                            등록된 에픽 매핑이 없습니다. 아래「에픽 매핑 편집」을 눌러 개발 에픽과 TQ 결함
                                            에픽을 추가하세요.
                                        </p>
                                    )}
                                    {!defectKpiLoading && defectKpiMappingCount > 0 && !defectKpiWorkerOk && (
                                        <p className="text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                                            Jira 필드「작업자」를 찾지 못했습니다. defectKpiConfig.ts 의
                                            WORKER_FIELD_NAMES 를 확인하세요.
                                        </p>
                                    )}
                                    {!defectKpiLoading &&
                                        defectKpiMappingCount > 0 &&
                                        defectKpiWorkerOk &&
                                        !defectKpiSeverityFieldOk && (
                                            <p className="text-[13px] text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                                                Jira에서「결함 심각도」커스텀 필드 id를 찾지 못했습니다. 차트에는「필드
                                                미연결」구간만 표시됩니다. defectKpiConfig 의 DEFECT_SEVERITY_FIELD_NAMES·Jira 필드
                                                이름을 확인하세요(우선순위와 별개).
                                            </p>
                                        )}
                                    {!defectKpiLoading &&
                                        defectKpiMappingCount > 0 &&
                                        defectKpiWorkerOk &&
                                        defectKpiRows.length === 0 && (
                                            <p className="text-[13px] text-slate-500">
                                                집계할 행이 없습니다. 개발·결함 에픽에 리프 이슈와 결함「작업자」입력을
                                                확인하세요.
                                            </p>
                                        )}
                                    {!defectKpiLoading && defectKpiRows.length > 0 && (
                                        <div className="border rounded-lg overflow-x-auto text-sm bg-white">
                                            <table className="w-full min-w-[720px] table-fixed border-collapse text-[13px] leading-5">
                                                <colgroup>
                                                    {Array.from({ length: 6 }, (_, i) => (
                                                        <col key={i} style={{ width: `${100 / 6}%` }} />
                                                    ))}
                                                </colgroup>
                                                <thead className="bg-slate-50 border-b">
                                                    <tr>
                                                        <th className="px-3 py-2.5 text-center font-semibold text-slate-500">
                                                            담당자
                                                        </th>
                                                        <th className="px-3 py-2.5 text-center font-semibold text-slate-500">
                                                            담당 개발 이슈
                                                        </th>
                                                        <th className="px-3 py-2.5 text-center font-semibold text-slate-500">
                                                            결함 등록
                                                        </th>
                                                        <th className="px-3 py-2.5 text-center font-semibold text-slate-500 whitespace-nowrap">
                                                            비율(%)
                                                        </th>
                                                        <th className="px-3 py-2.5 text-center font-semibold text-slate-500">
                                                            심각도
                                                        </th>
                                                        <th className="px-3 py-2.5 text-center font-semibold text-slate-500">
                                                            등급
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {defectKpiRows.map((r) => (
                                                        <tr key={r.key}>
                                                            <td className="px-3 py-2.5 text-center text-slate-700 align-middle min-w-0">
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
                                                            <td className="px-3 py-2.5 text-center align-middle text-slate-700 min-w-0">
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
                                <div className="border rounded-lg overflow-x-auto text-sm bg-white mt-4">
                                    <table className="w-full min-w-[1100px]">
                                        <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <tr style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                <th className="px-4 py-3 text-left font-medium">담당자</th>
                                                <th className="px-4 py-3 text-center font-bold text-indigo-700">종합 등급</th>
                                                <th className="px-4 py-3 text-center font-medium text-blue-700">기능 개발 완료율</th>
                                                <th className="px-4 py-3 text-center font-medium text-green-700">일정 준수율</th>
                                                <th className="px-4 py-3 text-center font-medium text-amber-700">조기 종료 가점</th>
                                                <th className="px-4 py-3 text-center font-medium text-slate-400">지연율 (참고)</th>
                                                <th className="px-3 py-3 text-center font-medium text-rose-700 whitespace-nowrap">
                                                    결함
                                                </th>
                                                <th className="px-3 py-3 text-center font-medium text-rose-700 whitespace-nowrap">
                                                    결함 비율
                                                </th>
                                                <th className="px-3 py-3 text-center font-medium text-rose-700 whitespace-nowrap">
                                                    결함 등급
                                                </th>
                                                <th className="px-2 py-3 text-left font-medium text-rose-700 w-auto min-w-[100px] max-w-[200px]">
                                                    심각도
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {assigneesWithKPI.map(a => {
                                                const kpi = a.kpi;
                                                const delayPct = kpi.totalIssues > 0 ? Math.round((kpi.delayedIssues / kpi.totalIssues) * 100) : 0;
                                                // K8: UNASSIGNED_LABEL 통일. 과거 '미할당'/'미배정' 분기 로직 제거.
                                                const dRow = defectKpiByDisplayName.get(a.name);
                                                return (
                                                    <tr key={a.name} style={{ backgroundColor: '#ffffff', transition: 'background-color 0.15s' }}
                                                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                                                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ffffff')}>
                                                        <td className="px-4 py-3 font-medium text-slate-700">
                                                            <div className="flex items-center gap-2">
                                                                <User className="w-3.5 h-3.5 shrink-0" style={{ color: '#94a3b8' }} />
                                                                {a.name}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span style={{ fontSize: 16, fontWeight: 800, color: kpi.grades.total === 'S' ? '#4f46e5' : kpi.grades.total === 'A' ? '#2563eb' : '#334155' }}>
                                                                    {kpi.grades.total}
                                                                </span>
                                                                <span style={{ fontSize: 11, color: '#64748b' }}>({kpi.totalScore}점)</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span style={{ fontSize: 14, fontWeight: 700, color: kpi.grades.completion === 'S' ? '#4f46e5' : kpi.grades.completion === 'A' ? '#2563eb' : '#475569' }}>
                                                                    {kpi.grades.completion}
                                                                </span>
                                                                <span style={{ fontSize: 11, color: '#64748b' }}>{kpi.completionRate}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span style={{ fontSize: 14, fontWeight: 700, color: kpi.grades.compliance === 'S' ? '#16a34a' : kpi.grades.compliance === 'A' ? '#15803d' : '#475569' }}>
                                                                    {kpi.grades.compliance}
                                                                </span>
                                                                <span style={{ fontSize: 11, color: '#64748b' }}>{kpi.complianceRate}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span style={{ fontSize: 14, fontWeight: 700, color: '#d97706' }}>
                                                                    +{kpi.grades.earlyBonus}
                                                                </span>
                                                                <span style={{ fontSize: 11, color: '#64748b' }}>{kpi.earlyRate}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-slate-400">
                                                            {delayPct > 0 ? `${delayPct}%` : '-'}
                                                        </td>
                                                        <td className="px-3 py-2 text-center tabular-nums text-slate-800">
                                                            {defectKpiLoading ? '…' : dRow != null ? dRow.defectCount : '—'}
                                                        </td>
                                                        <td className="px-3 py-2 text-center tabular-nums text-slate-800">
                                                            {defectKpiLoading
                                                                ? '…'
                                                                : dRow?.defectRatePercent != null
                                                                  ? `${dRow.defectRatePercent}%`
                                                                  : '—'}
                                                        </td>
                                                        <td className="px-3 py-2 text-center font-bold text-slate-800">
                                                            {defectKpiLoading ? '…' : dRow != null ? dRow.grade : '—'}
                                                        </td>
                                                        <td className="px-2 py-1 align-middle">
                                                            {defectKpiLoading ? (
                                                                <span className="text-slate-400 text-xs">…</span>
                                                            ) : dRow && dRow.severityBreakdown.length > 0 ? (
                                                                <DefectSeverityDonut breakdown={dRow.severityBreakdown} />
                                                            ) : (
                                                                <span className="text-slate-400 text-xs">—</span>
                                                            )}
                                                        </td>
                                                    </tr>
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
                        <Link2 className="h-5 w-5 text-slate-600 shrink-0" aria-hidden />
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
        return <span className="text-slate-400 text-xs">—</span>;
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
                    'text-[10px] leading-tight text-slate-600 min-w-0 m-0 p-0 list-none space-y-px',
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
                            <span className="tabular-nums shrink-0 font-medium text-slate-700">{s.count}</span>
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
            <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 transition-colors" />
            <div
                className={cn(
                    'absolute left-1/2 top-full mt-2 -translate-x-1/2 w-72 p-3 bg-slate-800 text-slate-50 text-xs rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none whitespace-pre-wrap leading-relaxed z-[9999]',
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
            <div className="rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-400"
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
        <div className="border-b border-slate-200 pb-2">
            <h2 className="m-0 text-[13px] font-semibold tracking-wide text-slate-600 uppercase">{children}</h2>
        </div>
    );
}

function StatCard({ icon, label, value, sub, color, onClick }: {
    icon: React.ReactNode; label: string; value: number | string; sub: string;
    color: 'blue' | 'green' | 'amber' | 'red' | 'slate'; onClick?: () => void;
}) {
    const cfg = {
        blue: { bg: '#eff6ff', hover: '#dbeafe', val: '#1d4ed8', border: '#bfdbfe' },
        green: { bg: '#f0fdf4', hover: '#dcfce7', val: '#15803d', border: '#bbf7d0' },
        amber: { bg: '#fffbeb', hover: '#fef3c7', val: '#b45309', border: '#fde68a' },
        red: { bg: '#fef2f2', hover: '#fee2e2', val: '#b91c1c', border: '#fecaca' },
        slate: { bg: '#f8fafc', hover: '#f1f5f9', val: '#475569', border: '#e2e8f0' },
    }[color];
    return (
        <button onClick={onClick}
            style={{
                backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 12, padding: '12px 16px',
                display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left', width: '100%', cursor: 'pointer', transition: 'filter 0.15s'
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = cfg.hover)}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = cfg.bg)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>{icon}{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: cfg.val }}>{value}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{sub}</div>
        </button>
    );
}

function BarStat({ label, pct, color, sub }: { label: string; pct: number; color: string; sub: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ fontWeight: 500, color: '#475569' }}>{label}</span>
                <span style={{ fontWeight: 700, color }}>{pct}%</span>
            </div>
            <div style={{ width: '100%', height: 8, borderRadius: 9999, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 9999, transition: 'width 0.3s', width: `${pct}%`, backgroundColor: color }} />
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>{sub}</p>
        </div>
    );
}

function ClickCell({ value, color, onClick }: { value: number; color: string; onClick: () => void }) {
    return (
        <td className="px-3 py-3 text-center">
            <button onClick={onClick}
                disabled={value === 0}
                style={{
                    backgroundColor: 'transparent', border: 'none', borderRadius: 6, padding: '4px 8px',
                    color: value === 0 ? '#cbd5e1' : color,
                    fontWeight: 700, fontSize: 14, cursor: value === 0 ? 'not-allowed' : 'pointer',
                    opacity: value === 0 ? 0.5 : 1, transition: 'background-color 0.15s'
                }}
                onMouseEnter={e => { if (value > 0) (e.currentTarget.style.backgroundColor = '#f1f5f9'); }}
                onMouseLeave={e => { (e.currentTarget.style.backgroundColor = 'transparent'); }}>
                {value}
            </button>
        </td>
    );
}

function RateBadge({ value, type }: { value: number; type: 'progress' | 'delay' | 'early' }) {
    const cfg = {
        progress: value >= 80
            ? { bg: '#dcfce7', color: '#15803d' }
            : value >= 50 ? { bg: '#dbeafe', color: '#1d4ed8' } : { bg: '#f1f5f9', color: '#475569' },
        delay: value === 0
            ? { bg: '#dcfce7', color: '#15803d' }
            : value <= 20 ? { bg: '#fef3c7', color: '#b45309' } : { bg: '#fee2e2', color: '#b91c1c' },
        early: value >= 50
            ? { bg: '#cffafe', color: '#0e7490' }
            : value > 0 ? { bg: '#dbeafe', color: '#1d4ed8' } : { bg: '#f1f5f9', color: '#94a3b8' },
    }[type];
    return (
        <span style={{
            display: 'inline-block', borderRadius: 9999, padding: '2px 8px',
            fontSize: 12, fontWeight: 600, backgroundColor: cfg.bg, color: cfg.color
        }}>
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
    const cfg = {
        blue: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
        green: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
        amber: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
        rose: { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
    }[color];

    const rateBracket = displayRate !== undefined ? displayRate : `${rate}%`;

    return (
        <div style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 12, padding: 20 }}>
            <div className="flex items-center mb-2">
                <h3 className="m-0 text-[13px] font-semibold text-slate-500">{title}</h3>
                {tooltip && <InfoTooltip content={tooltip} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: cfg.text }}>{grade}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: cfg.text }}>({rateBracket})</span>
            </div>
            <p className="m-0 text-[12px] leading-5 text-slate-400">{desc}</p>
        </div>
    );
}
