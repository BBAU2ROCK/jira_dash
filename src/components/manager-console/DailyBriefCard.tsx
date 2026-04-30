/**
 * DailyBriefCard — v1.0.28
 *
 * 일일 브리프: 어제·오늘·내일 핵심 지표 한눈에.
 */
import { CheckCircle2, ListChecks, Clock, AlertTriangle, Plus, Sparkles, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ManagerBrief } from '@/hooks/useManagerBrief';
import type { JiraIssue } from '@/api/jiraClient';
import { format } from 'date-fns';

interface Props {
    brief: ManagerBrief;
    onIssueClick?: (issue: JiraIssue) => void;
    onIssueKeysFocus?: (keys: string[]) => void;
}

interface KpiCardProps {
    title: string;
    Icon: React.ElementType;
    accent: 'green' | 'blue' | 'amber' | 'red' | 'purple';
    primaryValue: number | string;
    primaryLabel?: string;
    secondaryValue?: string;
    onClick?: () => void;
}

const ACCENT: Record<KpiCardProps['accent'], { bg: string; border: string; iconText: string; primary: string }> = {
    green:  { bg: 'bg-green-50 dark:bg-green-950/30',   border: 'border-green-200 dark:border-green-900/60',   iconText: 'text-green-600 dark:text-green-400',   primary: 'text-green-700 dark:text-green-300' },
    blue:   { bg: 'bg-blue-50 dark:bg-blue-950/30',     border: 'border-blue-200 dark:border-blue-900/60',     iconText: 'text-blue-600 dark:text-blue-400',     primary: 'text-blue-700 dark:text-blue-300' },
    amber:  { bg: 'bg-amber-50 dark:bg-amber-950/30',   border: 'border-amber-200 dark:border-amber-900/60',   iconText: 'text-amber-600 dark:text-amber-400',   primary: 'text-amber-700 dark:text-amber-300' },
    red:    { bg: 'bg-red-50 dark:bg-red-950/30',       border: 'border-red-200 dark:border-red-900/60',       iconText: 'text-red-600 dark:text-red-400',       primary: 'text-red-700 dark:text-red-300' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-900/60', iconText: 'text-purple-600 dark:text-purple-400', primary: 'text-purple-700 dark:text-purple-300' },
};

function KpiCard({ title, Icon, accent, primaryValue, primaryLabel, secondaryValue, onClick }: KpiCardProps) {
    const c = ACCENT[accent];
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className={cn(
                'rounded-xl border p-4 flex flex-col gap-1 text-left w-full',
                onClick && 'card-hover cursor-pointer',
                !onClick && 'cursor-default',
                c.bg, c.border
            )}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <Icon className={cn('h-4 w-4', c.iconText)} aria-hidden />
                    <span className="text-xs font-medium text-foreground/90 tracking-tight">{title}</span>
                </div>
                {onClick && <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden />}
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
                <span className={cn('text-3xl font-extrabold tabular-nums leading-none', c.primary)}>
                    {primaryValue}
                </span>
                {primaryLabel && <span className="text-xs text-muted-foreground">{primaryLabel}</span>}
            </div>
            {secondaryValue && (
                <span className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{secondaryValue}</span>
            )}
        </button>
    );
}

export function DailyBriefCard({ brief, onIssueClick, onIssueKeysFocus }: Props) {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd (EEE)', { locale: undefined });

    const focusKeys = (issues: JiraIssue[]) => onIssueKeysFocus?.(issues.map((i) => i.key));

    return (
        <div className="space-y-4">
            {/* 헤더 */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                    <div>
                        <h2 className="text-base font-semibold text-foreground tracking-tight">📅 오늘의 브리프</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">{todayStr} — 어제·오늘·내일 한눈에</p>
                    </div>
                </div>
            </div>

            {/* 어제 — 회고 */}
            <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">📜 어제</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <KpiCard
                        title="완료한 이슈"
                        Icon={CheckCircle2}
                        accent="green"
                        primaryValue={brief.yesterdayCompleted}
                        primaryLabel="건"
                        secondaryValue={brief.yesterdayCompletedIssues.length > 0 ? `목록 보기` : undefined}
                        onClick={brief.yesterdayCompletedIssues.length > 0 ? () => focusKeys(brief.yesterdayCompletedIssues) : undefined}
                    />
                    <KpiCard
                        title="신규 등록"
                        Icon={Plus}
                        accent="blue"
                        primaryValue={brief.yesterdayCreated}
                        primaryLabel="건"
                        secondaryValue={`완료 ${brief.yesterdayCompleted}건 대비 ${brief.yesterdayCreated - brief.yesterdayCompleted >= 0 ? '+' : ''}${brief.yesterdayCreated - brief.yesterdayCompleted}`}
                    />
                    <KpiCard
                        title="이번 주 진척"
                        Icon={ListChecks}
                        accent="purple"
                        primaryValue={`${brief.weekProgressRate}%`}
                        secondaryValue={`완료 ${brief.weekCompleted} / 신규 ${brief.weekCreated}`}
                    />
                </div>
            </section>

            {/* 오늘 — 액션 */}
            <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">⚡ 오늘</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <KpiCard
                        title="진행 중"
                        Icon={ListChecks}
                        accent="blue"
                        primaryValue={brief.todayInProgress}
                        primaryLabel="건"
                    />
                    <KpiCard
                        title="오늘 마감 (D-0)"
                        Icon={AlertTriangle}
                        accent="red"
                        primaryValue={brief.todayDue}
                        primaryLabel="건"
                        secondaryValue={brief.todayDueIssues.length > 0 ? '즉시 점검 필요' : '마감 없음'}
                        onClick={brief.todayDueIssues.length > 0 ? () => focusKeys(brief.todayDueIssues) : undefined}
                    />
                    <KpiCard
                        title="오늘 시작 예정"
                        Icon={Clock}
                        accent="amber"
                        primaryValue={brief.todayStarting}
                        primaryLabel="건"
                        secondaryValue={brief.todayStartingIssues.length > 0 ? '계획 시작일 = 오늘' : '신규 시작 없음'}
                        onClick={brief.todayStartingIssues.length > 0 ? () => focusKeys(brief.todayStartingIssues) : undefined}
                    />
                </div>
            </section>

            {/* 다음 — 미리보기 */}
            <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">🔜 다음 3일</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <KpiCard
                        title="마감 임박"
                        Icon={AlertTriangle}
                        accent="amber"
                        primaryValue={brief.dueSoonNext3Days}
                        primaryLabel="건"
                        secondaryValue="D-1 ~ D-3"
                    />
                    <KpiCard
                        title="내일 시작 예정"
                        Icon={Clock}
                        accent="blue"
                        primaryValue={brief.tomorrowStarting}
                        primaryLabel="건"
                    />
                </div>
            </section>

            {/* 어제 완료 이슈 미니 리스트 (있을 때) */}
            {brief.yesterdayCompletedIssues.length > 0 && (
                <section className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-foreground/90">✓ 어제 완료된 이슈 ({brief.yesterdayCompletedIssues.length}건)</h3>
                        <button
                            type="button"
                            onClick={() => focusKeys(brief.yesterdayCompletedIssues)}
                            className="text-[11px] text-primary hover:underline"
                        >
                            전체 IssueList에서 보기 →
                        </button>
                    </div>
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {brief.yesterdayCompletedIssues.slice(0, 10).map((i) => (
                            <button
                                key={i.key}
                                type="button"
                                onClick={() => onIssueClick?.(i)}
                                className="w-full flex items-center gap-2 rounded-md border border-border/60 hover:bg-accent/40 px-2 py-1.5 text-left transition-colors"
                            >
                                <span className="font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                                    {i.key}
                                </span>
                                <span className="text-xs text-foreground/90 truncate flex-1">{i.fields.summary}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0">{i.fields.assignee?.displayName ?? '미배정'}</span>
                            </button>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
