/**
 * OneOnOnePrep — v1.0.28
 *
 * 담당자 선택 → 자동 요약 (최근 활동 / KPI 등급 / 격려·코칭 포인트).
 */
import React from 'react';
import { User, Sparkles, ThumbsUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JiraIssue } from '@/api/jiraClient';
import { calculateKPI } from '@/services/kpiService';
import { filterLeafIssues, getStatusCategoryKey, isBusinessDone } from '@/lib/jira-helpers';
import { parseLocalDay } from '@/lib/date-utils';
import { resolveCancelledStatus, resolveRejectedStatus, resolveOnHoldStatus, resolveFields } from '@/lib/kpi-rules-resolver';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

const DAY_MS = 24 * 60 * 60 * 1000;

interface Props {
    issues: JiraIssue[];
    onIssueClick?: (issue: JiraIssue) => void;
    onIssueKeysFocus?: (keys: string[]) => void;
}

export function OneOnOnePrep({ issues, onIssueClick, onIssueKeysFocus }: Props) {
    // 후보 담당자 추출
    const assignees = React.useMemo(() => {
        const set = new Set<string>();
        for (const i of issues) {
            const n = i.fields.assignee?.displayName;
            if (n) set.add(n);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
    }, [issues]);

    const [selected, setSelected] = React.useState<string>('');
    const [popOpen, setPopOpen] = React.useState(false);

    // 첫 진입 자동 선택
    React.useEffect(() => {
        if (!selected && assignees.length > 0) {
            setSelected(assignees[0]);
        }
    }, [assignees, selected]);

    const summary = React.useMemo(() => {
        if (!selected) return null;

        const cancelledName = resolveCancelledStatus();
        const rejectedName = resolveRejectedStatus();
        const onHoldName = resolveOnHoldStatus();
        const difficultyField = resolveFields().DIFFICULTY;  // v1.0.49: customfield 하드코딩 제거

        const isCompleted = (i: JiraIssue) => {
            if (!isBusinessDone(i)) return false;
            const sn = i.fields.status?.name?.trim() ?? '';
            return sn !== cancelledName && sn !== rejectedName;
        };

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const twoWeeksAgo = today.getTime() - 14 * DAY_MS;

        const leaf = filterLeafIssues(issues);
        const own = leaf.filter((i) => i.fields.assignee?.displayName === selected);

        const recentDone: JiraIssue[] = [];
        const recentInProgress: JiraIssue[] = [];
        const recentDelayed: JiraIssue[] = [];
        const recentOnHold: JiraIssue[] = [];

        for (const i of own) {
            const status = i.fields.status?.name?.trim() ?? '';
            const completed = isCompleted(i);
            const done = parseLocalDay(i.fields.resolutiondate ?? null);
            const due = parseLocalDay(i.fields.duedate ?? null);

            if (completed && done && done.getTime() >= twoWeeksAgo) recentDone.push(i);
            if (getStatusCategoryKey(i) === 'indeterminate' && status !== onHoldName) recentInProgress.push(i);
            if (status === onHoldName) recentOnHold.push(i);
            if (!completed && due && due.getTime() < today.getTime()) recentDelayed.push(i);
        }

        const kpi = calculateKPI(own);

        // 격려 포인트
        const praises: string[] = [];
        if (recentDone.length >= 5) praises.push(`최근 2주간 ${recentDone.length}건 완료 — 안정적 처리량`);
        if (kpi.earlyIssues > 0) praises.push(`조기 완료 ${kpi.earlyIssues}건 — 일정 여유 확보`);
        if (kpi.complianceRate >= 80) praises.push(`일정 준수율 ${kpi.complianceRate}% — 매우 우수`);
        if (recentDone.some((i) => {
            const v = (i.fields as Record<string, unknown>)[difficultyField] as { value?: string } | undefined;
            return v?.value === '상';
        })) {
            praises.push('난이도 \'상\' task 완료 — 도전 영역 진행 중');
        }

        // 코칭 포인트
        const coaching: string[] = [];
        if (recentDelayed.length >= 3) coaching.push(`지연 ${recentDelayed.length}건 — 일정 관리 점검 필요`);
        if (recentOnHold.length >= 2) coaching.push(`보류 ${recentOnHold.length}건 — 차단 요인 확인 필요`);
        if (recentInProgress.length >= 5) coaching.push(`동시 진행 ${recentInProgress.length}건 — 우선순위 정리 권고`);
        if (kpi.complianceRate < 50 && kpi.totalIssues >= 3) coaching.push(`일정 준수율 ${kpi.complianceRate}% — 추정 정확도 개선 필요`);
        if (recentDone.length === 0 && recentInProgress.length > 0) coaching.push('최근 2주 완료 0건 — 차단 요인 확인 권고');

        return {
            kpi,
            recentDone,
            recentInProgress,
            recentDelayed,
            recentOnHold,
            praises,
            coaching,
            ownTotal: own.length,
        };
    }, [selected, issues]);

    return (
        <div className="space-y-4">
            {/* 헤더 */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" aria-hidden />
                    <div>
                        <h2 className="text-base font-semibold text-foreground tracking-tight">👤 1:1 미팅 준비</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">담당자 선택 시 최근 2주 활동·KPI·격려/코칭 포인트 자동 추출</p>
                    </div>
                </div>
                {/* 담당자 선택 */}
                <Popover open={popOpen} onOpenChange={setPopOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="min-w-[180px] justify-between">
                            <span className="truncate">{selected || '담당자 선택…'}</span>
                            <ChevronDown className="h-4 w-4 ml-2 text-muted-foreground" aria-hidden />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[220px] p-0" align="end">
                        <div className="p-2 border-b border-border bg-muted/40">
                            <span className="text-[11px] font-semibold text-muted-foreground">담당자 ({assignees.length}명)</span>
                        </div>
                        {/* v1.0.33: Radix ScrollArea → native overflow.
                            Dialog 안 Popover에서 wheel event가 부모로 propagate되어 스크롤 안 되는 문제 → onWheel stopPropagation. */}
                        <div
                            className="max-h-[280px] overflow-y-auto overscroll-contain"
                            onWheel={(e) => e.stopPropagation()}
                        >
                            <div className="p-1">
                                {assignees.map((name) => (
                                    <button
                                        key={name}
                                        type="button"
                                        onClick={() => { setSelected(name); setPopOpen(false); }}
                                        className={cn(
                                            'w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors',
                                            name === selected
                                                ? 'bg-primary/10 text-primary font-medium'
                                                : 'text-foreground/90 hover:bg-accent/40'
                                        )}
                                    >
                                        {name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {!summary && (
                <div className="rounded-lg border border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                    담당자를 선택하세요
                </div>
            )}

            {summary && (
                <>
                    {/* 핵심 KPI 4 카드 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-border bg-card p-3">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">담당 task</div>
                            <div className="text-2xl font-bold tabular-nums text-foreground mt-1">{summary.ownTotal}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-3">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">완료율</div>
                            <div className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400 mt-1">{summary.kpi.completionRate}%</div>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-3">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">준수율</div>
                            <div className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400 mt-1">{summary.kpi.complianceRate}%</div>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-3">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">종합 등급</div>
                            <div className="text-2xl font-extrabold tabular-nums text-indigo-600 dark:text-indigo-400 mt-1">{summary.kpi.grades.total}</div>
                        </div>
                    </div>

                    {/* 격려 / 코칭 */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {/* 격려 */}
                        <div className="rounded-lg border border-green-200 dark:border-green-900/60 bg-green-50 dark:bg-green-950/30 p-4">
                            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-green-800 dark:text-green-300 mb-2">
                                <ThumbsUp className="h-4 w-4" aria-hidden /> 격려 포인트
                            </h3>
                            {summary.praises.length === 0 ? (
                                <p className="text-xs text-green-700/70 dark:text-green-400/70 italic">자동 추출된 항목 없음 — 직접 발견한 강점 공유</p>
                            ) : (
                                <ul className="text-xs text-green-900 dark:text-green-200 space-y-1.5 list-disc pl-4">
                                    {summary.praises.map((p, i) => <li key={i}>{p}</li>)}
                                </ul>
                            )}
                        </div>
                        {/* 코칭 */}
                        <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4">
                            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
                                <Sparkles className="h-4 w-4" aria-hidden /> 코칭 포인트
                            </h3>
                            {summary.coaching.length === 0 ? (
                                <p className="text-xs text-amber-700/70 dark:text-amber-400/70 italic">개선 영역 자동 감지 없음 — 본인 의견 청취 권장</p>
                            ) : (
                                <ul className="text-xs text-amber-900 dark:text-amber-200 space-y-1.5 list-disc pl-4">
                                    {summary.coaching.map((c, i) => <li key={i}>{c}</li>)}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* 활동 요약 (최근 2주) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <ActivityList
                            title="✅ 최근 2주 완료"
                            color="text-green-600 dark:text-green-400"
                            issues={summary.recentDone}
                            onIssueClick={onIssueClick}
                            onIssueKeysFocus={onIssueKeysFocus}
                        />
                        <ActivityList
                            title="🔄 진행 중"
                            color="text-blue-600 dark:text-blue-400"
                            issues={summary.recentInProgress}
                            onIssueClick={onIssueClick}
                            onIssueKeysFocus={onIssueKeysFocus}
                        />
                        <ActivityList
                            title="⏰ 지연"
                            color="text-red-600 dark:text-red-400"
                            issues={summary.recentDelayed}
                            onIssueClick={onIssueClick}
                            onIssueKeysFocus={onIssueKeysFocus}
                        />
                        <ActivityList
                            title="⏸️ 보류"
                            color="text-purple-600 dark:text-purple-400"
                            issues={summary.recentOnHold}
                            onIssueClick={onIssueClick}
                            onIssueKeysFocus={onIssueKeysFocus}
                        />
                    </div>
                </>
            )}
        </div>
    );
}

function ActivityList({
    title, color, issues, onIssueClick, onIssueKeysFocus,
}: {
    title: string;
    color: string;
    issues: JiraIssue[];
    onIssueClick?: (i: JiraIssue) => void;
    onIssueKeysFocus?: (keys: string[]) => void;
}) {
    return (
        <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-foreground/90">{title}</h4>
                <span className={cn('text-base font-bold tabular-nums', color)}>{issues.length}</span>
            </div>
            {issues.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic py-1">없음</p>
            ) : (
                <div className="space-y-1 max-h-[180px] overflow-y-auto">
                    {issues.slice(0, 8).map((i) => (
                        <button
                            key={i.key}
                            type="button"
                            onClick={() => onIssueClick?.(i)}
                            className="w-full text-left flex items-start gap-1.5 hover:bg-accent/40 rounded px-1 py-0.5 transition-colors"
                        >
                            <span className="font-mono text-[10px] font-bold text-primary tabular-nums shrink-0 mt-0.5">{i.key}</span>
                            <span className="text-[11px] text-foreground/90 line-clamp-2">{i.fields.summary}</span>
                        </button>
                    ))}
                    {issues.length > 8 && (
                        <button
                            type="button"
                            onClick={() => onIssueKeysFocus?.(issues.map((i) => i.key))}
                            className="w-full text-[10px] text-primary hover:underline text-center pt-1"
                        >
                            전체 {issues.length}건 IssueList →
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
