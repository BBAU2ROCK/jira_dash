import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { type JiraIssue, jiraApi } from '@/api/jiraClient';
import { filterLeafIssues } from '@/lib/jira-helpers';
import {
    BarChart3, CheckCircle2, Clock, AlertTriangle,
    Layers, X, ChevronRight, User, Trophy, HelpCircle, Pause, CircleSlash
} from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { calculateKPI } from '@/services/kpiService';
import { JIRA_CONFIG } from '@/config/jiraConfig';

interface ProjectStatsDialogProps {
    open: boolean;
    onClose: () => void;
    issues: JiraIssue[];
    epics: JiraIssue[];
    selectedEpicIds: string[];
    /** 담당자별 현황 패널에서 난이도/이슈 클릭 시 이슈 목록에 해당 건만 표시하도록 호출 */
    onShowIssuesInList?: (issueKeys: string[]) => void;
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
export function ProjectStatsDialog({ open, onClose, issues, epics, selectedEpicIds, onShowIssuesInList }: ProjectStatsDialogProps) {
    const [selectedGroup, setSelectedGroup] = React.useState<IssueGroup | null>(null);
    const [currentTab, setCurrentTab] = React.useState('status');

    const today = new Date();
    const selectedEpics = epics.filter(e => selectedEpicIds.includes(e.key));

    // 건수 규칙: 할 일만 있으면 카운트, 하위 작업 있으면 부모 제외·하위만 반영 (통계/KPI 동일)
    const leafIssues = React.useMemo(() => filterLeafIssues(issues), [issues]);

    // 보류·취소 식별 (status.name 기준, jiraConfig.STATUS_NAMES)
    const isOnHold = (i: JiraIssue) => (i.fields.status?.name?.trim() ?? '') === (JIRA_CONFIG.STATUS_NAMES?.ON_HOLD ?? '보류');
    const isCancelled = (i: JiraIssue) => (i.fields.status?.name?.trim() ?? '') === (JIRA_CONFIG.STATUS_NAMES?.CANCELLED ?? '취소');

    // ── KPI 계산 ─────────────────────────────────────────────────────────────
    const kpiMetrics = calculateKPI(leafIssues);

    // ── 전체 통계 (5분할: 보류·취소·완료·진행·대기, 상호 배타) ─────────────────
    const onHold = leafIssues.filter(i => isOnHold(i));
    const cancelled = leafIssues.filter(i => isCancelled(i));
    const done = leafIssues.filter(i =>
        i.fields.status.statusCategory.key === 'done' && !isOnHold(i) && !isCancelled(i)
    );
    const inProg = leafIssues.filter(i => i.fields.status.statusCategory.key === 'indeterminate');
    const todo = leafIssues.filter(i =>
        !isOnHold(i) && !isCancelled(i) &&
        i.fields.status.statusCategory.key !== 'done' &&
        i.fields.status.statusCategory.key !== 'indeterminate'
    );
    const delayed = leafIssues.filter(i =>
        i.fields.duedate && new Date(i.fields.duedate) < today &&
        i.fields.status.statusCategory.key !== 'done'
    );
    const earlyDone = done.filter(i =>
        i.fields.duedate && i.fields.resolutiondate &&
        new Date(i.fields.resolutiondate) < new Date(i.fields.duedate)
    );

    const total = leafIssues.length;
    const completionRate = total > 0 ? Math.round((done.length / total) * 100) : 0;

    const totalSP = leafIssues.reduce((s, i) => s + (i.fields[JIRA_CONFIG.FIELDS.STORY_POINT] || 0), 0);
    const doneSP = done.reduce((s, i) => s + (i.fields[JIRA_CONFIG.FIELDS.STORY_POINT] || 0), 0);

    // ── 담당자별 통계 ─────────────────────────────────────────────────────────
    const assigneeMap = new Map<string, AssigneeStats>();

    // 리프만 담당자별 건수·업무로그 집계 (보류·취소는 완료로 포함, earlyDone/compliant는 실제 done만)
    const isDoneForAssignee = (issue: JiraIssue) =>
        issue.fields.status.statusCategory.key === 'done' || isOnHold(issue) || isCancelled(issue);

    leafIssues.forEach(issue => {
        const name = issue.fields.assignee?.displayName ?? '미할당';
        if (!assigneeMap.has(name)) {
            assigneeMap.set(name, {
                name, total: [], done: [], inProgress: [], todo: [], delayed: [],
                earlyDone: [], compliant: [], withWorklog: [], withoutWorklog: [], totalTimeSpent: 0
            });
        }
        const s = assigneeMap.get(name)!;
        s.total.push(issue);
        const cat = issue.fields.status.statusCategory.key;
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
                    const due = new Date(issue.fields.duedate); due.setHours(23, 59, 59, 999);
                    const resolved = new Date(issue.fields.resolutiondate);
                    if (resolved <= due || isVerificationDelay) {
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
        const name = issue.fields.assignee?.displayName ?? '미할당';
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
        return found?.id ?? JIRA_CONFIG.FIELDS.DIFFICULTY;
    }, [statsFields]);

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

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-[1180px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
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
                                                // 준수율: 완료된 것 중 준수 건수 비율 (Project Compliance Rate와 동일 기준)
                                                // 분모: 완료된 이슈 - 합의 연기 (여기서는 단순화하여 완료 전체 기준)
                                                // KPI A와 일치시키려면: (compliant / (total - agreed)) * 100?
                                                // 여기서는 심플하게: compliant / total * 100 (전체 대비 준수율)
                                                // KPI B: (Compliant / Total) * 100
                                                const complianceRate = t > 0 ? Math.round((a.compliant.length / t) * 100) : 0;
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
                                                            <div className="flex justify-center">
                                                                <PieChart segments={segs} size={52} />
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
                                                {issue.fields.status.name}
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
                        <div className="px-6 py-8 space-y-10">
                            <section>
                                <SectionTitle>KPI 등급 평가는 팀 전체 기준입니다</SectionTitle>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                                    <GradeCard title="기능 개발 완료율" grade={kpiMetrics.grades.completion}
                                        rate={kpiMetrics.completionRate} color="blue"
                                        desc="계획 대비 완료된 기능 수 (연기 합의 제외)"
                                        tooltip={`📌 지표 설명\n계획된 기능(이슈) 중 실제로 완료된 비율입니다. 연기 합의 이슈는 분모·분자에서 제외해 공정하게 평가합니다.\n\n📌 산정 기준\n(완료된 이슈 / (전체 대상 - 합의된 연기)) × 100\n\n📌 예외 조건\n'합의된 연기(agreed-delay)' 라벨이 있는 이슈는 전체 대상에서 제외되어 불이익이 없습니다.\n\n📌 등급 기준 (S·A·B·C·D)\nS: 95% 이상  A: 90% 이상  B: 80% 이상  C: 70% 이상  D: 70% 미만`} />
                                    <GradeCard title="일정 준수율" grade={kpiMetrics.grades.compliance}
                                        rate={kpiMetrics.complianceRate} color="green"
                                        desc="총 계획 기능 중 기한 내 완료된 기능의 비율"
                                        tooltip={`📌 지표 설명\n완료 예정일(Due Date) 안에 완료된 기능의 비율입니다. 기한 내 완료·검증 지연 인정 이슈를 합산해 일정 준수 성과를 측정합니다.\n\n📌 산정 기준\n(기한 내 완료 + 검증 지연) / 전체 이슈 × 100\n\n📌 검증 지연(Verify Delay)이란?\n개발은 기한 내 완료되었으나, 검증(QA) 과정에서 일정이 지연된 경우입니다.\n\n📌 판단 기준\n완료일이 늦더라도 'verification-delay' 라벨이 있으면 준수로 인정합니다.\n\n📌 등급 기준 (S·A·B·C·D)\nS: 95% 이상  A: 90% 이상  B: 80% 이상  C: 70% 이상  D: 70% 미만`} />
                                    <GradeCard title="조기 종료 가점" grade={`+${kpiMetrics.grades.earlyBonus}`}
                                        rate={kpiMetrics.earlyRate} color="amber"
                                        desc={`조기 완료율 ${kpiMetrics.earlyRate}% 달성`}
                                        tooltip={`📌 지표 설명\n완료 예정일보다 일찍 완료한 비율(조기 완료율)에 따라 가산점을 부여합니다. 종합 등급은 완료율·준수율 평균에 이 가점을 더해 산출합니다.\n\n📌 가점 기준 (조기 완료율)\n50% 이상 → +5점  40% 이상 → +4점  30% 이상 → +3점  20% 이상 → +2점  10% 이상 → +1점  10% 미만 → 0점\n\n📌 종합 등급 (S·A·B·C·D)\nS: 95점 이상  A: 90점 이상  B: 80점 이상  C: 70점 이상  D: 70점 미만 (완료율·준수율 평균 + 조기 가점)`} />
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
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section>
                                <SectionTitle>담당자별 성과 분석</SectionTitle>
                                <div className="border rounded-lg overflow-hidden text-sm bg-white mt-4">
                                    <table className="w-full">
                                        <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <tr style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                <th className="px-6 py-3 text-left font-medium">담당자</th>
                                                <th className="px-6 py-3 text-center font-bold text-indigo-700">종합 등급</th>
                                                <th className="px-6 py-3 text-center font-medium text-blue-700">기능 개발 완료율</th>
                                                <th className="px-6 py-3 text-center font-medium text-green-700">일정 준수율</th>
                                                <th className="px-6 py-3 text-center font-medium text-amber-700">조기 종료 가점</th>
                                                <th className="px-6 py-3 text-center font-medium text-slate-400">지연율 (참고)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {assigneesWithKPI.map(a => {
                                                const kpi = a.kpi;
                                                const delayPct = kpi.totalIssues > 0 ? Math.round((kpi.delayedIssues / kpi.totalIssues) * 100) : 0;
                                                return (
                                                    <tr key={a.name} style={{ backgroundColor: '#ffffff', transition: 'background-color 0.15s' }}
                                                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                                                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ffffff')}>
                                                        <td className="px-6 py-3 font-medium text-slate-700">
                                                            <div className="flex items-center gap-2">
                                                                <User className="w-3.5 h-3.5 shrink-0" style={{ color: '#94a3b8' }} />
                                                                {a.name}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span style={{ fontSize: 16, fontWeight: 800, color: kpi.grades.total === 'S' ? '#4f46e5' : kpi.grades.total === 'A' ? '#2563eb' : '#334155' }}>
                                                                    {kpi.grades.total}
                                                                </span>
                                                                <span style={{ fontSize: 11, color: '#64748b' }}>({kpi.totalScore}점)</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span style={{ fontSize: 14, fontWeight: 700, color: kpi.grades.completion === 'S' ? '#4f46e5' : kpi.grades.completion === 'A' ? '#2563eb' : '#475569' }}>
                                                                    {kpi.grades.completion}
                                                                </span>
                                                                <span style={{ fontSize: 11, color: '#64748b' }}>{kpi.completionRate}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span style={{ fontSize: 14, fontWeight: 700, color: kpi.grades.compliance === 'S' ? '#16a34a' : kpi.grades.compliance === 'A' ? '#15803d' : '#475569' }}>
                                                                    {kpi.grades.compliance}
                                                                </span>
                                                                <span style={{ fontSize: 11, color: '#64748b' }}>{kpi.complianceRate}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span style={{ fontSize: 14, fontWeight: 700, color: '#d97706' }}>
                                                                    +{kpi.grades.earlyBonus}
                                                                </span>
                                                                <span style={{ fontSize: 11, color: '#64748b' }}>{kpi.earlyRate}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 text-center text-slate-400">
                                                            {delayPct > 0 ? `${delayPct}%` : '-'}
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
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

// ── 하위 컴포넌트 ─────────────────────────────────────────────────────────────

/** 툴팁 컴포넌트 (CSS Only) */
function InfoTooltip({ content }: { content: React.ReactNode }) {
    return (
        <div className="group relative flex items-center ml-1.5 cursor-help z-50">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 transition-colors" />
            <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 w-72 p-3 bg-slate-800 text-slate-50 text-xs rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none whitespace-pre-wrap leading-relaxed z-[9999]">
                {content}
                <div className="absolute left-1/2 bottom-full -translate-x-1/2 border-4 border-transparent border-b-slate-800" />
            </div>
        </div>
    );
}

/** SVG 도넛 파이차트 */
function PieChart({ segments, size = 120, centerLabel }: {
    segments: { value: number; color: string; label: string }[];
    size?: number;
    centerLabel?: string;
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
        const endAngle = startAngle + sweep - 0.3; // small gap

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

    return (
        <svg width={size} height={size} style={{ overflow: 'visible' }}>
            {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} />)}
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
        <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 8, marginBottom: 4 }}>
            <h2 style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{children}</h2>
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

function GradeCard({ title, grade, rate, color, desc, tooltip }: { title: string; grade: string | number; rate: number; color: 'blue' | 'green' | 'amber'; desc: string; tooltip?: string }) {
    const cfg = {
        blue: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
        green: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
        amber: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
    }[color];

    return (
        <div style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 12, padding: 20 }}>
            <div className="flex items-center mb-2">
                <h3 style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{title}</h3>
                {tooltip && <InfoTooltip content={tooltip} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: cfg.text }}>{grade}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: cfg.text }}>({rate}%)</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>{desc}</p>
        </div>
    );
}
