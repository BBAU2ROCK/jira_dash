/**
 * RiskBoard — v1.0.28
 *
 * 6 위험 카드 grid. 각 카드 클릭 → 이슈 목록 펼침.
 */
import React from 'react';
import { Clock, Ghost, UserMinus, PauseCircle, Flame, TrendingUp, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RiskAnalysis, RiskItem, OverloadPerson } from '@/hooks/useRiskAnalysis';
import type { JiraIssue } from '@/api/jiraClient';

interface Props {
    risk: RiskAnalysis;
    /** 이슈 클릭 시 호출 (Issue Detail Drawer 또는 list focus) */
    onIssueClick?: (issue: JiraIssue) => void;
    /** 이슈 키 그룹 클릭 — IssueList focus용 */
    onIssueKeysFocus?: (keys: string[]) => void;
}

interface CardConfig {
    title: string;
    Icon: React.ElementType;
    accent: 'red' | 'amber' | 'orange' | 'purple' | 'rose' | 'blue';
    count: number;
    subtitle?: string;
    items?: RiskItem[];
    overloadItems?: OverloadPerson[];
    /** 카드 단위 액션 (전체 보기) */
    onViewAll?: () => void;
}

const ACCENT: Record<CardConfig['accent'], { bg: string; border: string; iconBg: string; iconText: string; count: string }> = {
    red:    { bg: 'bg-red-50 dark:bg-red-950/30',       border: 'border-red-200 dark:border-red-900/60',     iconBg: 'bg-red-100 dark:bg-red-900/40',     iconText: 'text-red-600 dark:text-red-400',     count: 'text-red-700 dark:text-red-300' },
    amber:  { bg: 'bg-amber-50 dark:bg-amber-950/30',   border: 'border-amber-200 dark:border-amber-900/60', iconBg: 'bg-amber-100 dark:bg-amber-900/40', iconText: 'text-amber-600 dark:text-amber-400', count: 'text-amber-700 dark:text-amber-300' },
    orange: { bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-900/60', iconBg: 'bg-orange-100 dark:bg-orange-900/40', iconText: 'text-orange-600 dark:text-orange-400', count: 'text-orange-700 dark:text-orange-300' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-900/60', iconBg: 'bg-purple-100 dark:bg-purple-900/40', iconText: 'text-purple-600 dark:text-purple-400', count: 'text-purple-700 dark:text-purple-300' },
    rose:   { bg: 'bg-rose-50 dark:bg-rose-950/30',     border: 'border-rose-200 dark:border-rose-900/60',     iconBg: 'bg-rose-100 dark:bg-rose-900/40',     iconText: 'text-rose-600 dark:text-rose-400',     count: 'text-rose-700 dark:text-rose-300' },
    blue:   { bg: 'bg-blue-50 dark:bg-blue-950/30',     border: 'border-blue-200 dark:border-blue-900/60',     iconBg: 'bg-blue-100 dark:bg-blue-900/40',     iconText: 'text-blue-600 dark:text-blue-400',     count: 'text-blue-700 dark:text-blue-300' },
};

function RiskCard({
    title, Icon, accent, count, subtitle, items, overloadItems, onIssueClick, onIssueKeysFocus, onViewAll,
}: CardConfig & { onIssueClick?: Props['onIssueClick']; onIssueKeysFocus?: Props['onIssueKeysFocus'] }) {
    const c = ACCENT[accent];
    const [expanded, setExpanded] = React.useState(false);

    const handleViewAll = () => {
        if (onViewAll) onViewAll();
        if (items && onIssueKeysFocus) {
            onIssueKeysFocus(items.map((it) => it.issue.key));
        }
    };

    return (
        <div className={cn('rounded-xl border p-4 card-hover', c.bg, c.border)}>
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                    <div className={cn('rounded-md p-1.5 shrink-0', c.iconBg)}>
                        <Icon className={cn('h-4 w-4', c.iconText)} aria-hidden />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground tracking-tight truncate">{title}</h3>
                </div>
                <span className={cn('text-2xl font-extrabold tabular-nums leading-none', c.count)}>{count}</span>
            </div>
            {subtitle && (
                <p className="text-xs text-muted-foreground mb-3 leading-snug">{subtitle}</p>
            )}
            {/* 이슈/인원 목록 */}
            {count > 0 && (items || overloadItems) && (
                <div className="space-y-1">
                    {/* 이슈 카드 */}
                    {items && items.slice(0, expanded ? 50 : 3).map((item) => (
                        <button
                            key={item.issue.key}
                            type="button"
                            onClick={() => onIssueClick?.(item.issue)}
                            className="w-full flex items-center gap-2 rounded-md border border-border/60 bg-card hover:bg-accent/40 px-2 py-1.5 text-left transition-colors"
                        >
                            <span className="font-mono text-[10px] font-bold text-primary tabular-nums shrink-0">
                                {item.issue.key}
                            </span>
                            <span className="text-xs text-foreground/90 truncate flex-1">
                                {item.issue.fields.summary}
                            </span>
                            {item.meta && (
                                <span className={cn('text-[10px] tabular-nums shrink-0', c.count, 'font-semibold')}>
                                    {item.meta}
                                </span>
                            )}
                        </button>
                    ))}
                    {/* 인원 카드 (overload용) */}
                    {overloadItems && overloadItems.slice(0, expanded ? 50 : 3).map((p) => (
                        <button
                            key={p.displayName}
                            type="button"
                            onClick={() => onIssueKeysFocus?.(p.issues.map((i) => i.key))}
                            className="w-full flex items-center gap-2 rounded-md border border-border/60 bg-card hover:bg-accent/40 px-2 py-1.5 text-left transition-colors"
                        >
                            <span className="text-xs font-medium text-foreground truncate flex-1">{p.displayName}</span>
                            <span className={cn('text-xs tabular-nums font-bold', c.count)}>
                                동시 {p.inProgress}건
                            </span>
                        </button>
                    ))}
                    {(items?.length ?? overloadItems?.length ?? 0) > 3 && (
                        <button
                            type="button"
                            onClick={() => {
                                if (!expanded) setExpanded(true);
                                else handleViewAll();
                            }}
                            className="w-full text-[11px] text-muted-foreground hover:text-foreground py-1 flex items-center justify-center gap-1 transition-colors"
                        >
                            {expanded
                                ? `전체 ${items?.length ?? overloadItems?.length}건 IssueList로`
                                : `+ ${(items?.length ?? overloadItems?.length ?? 0) - 3}건 더 보기`}
                            <ChevronRight className="h-3 w-3" />
                        </button>
                    )}
                </div>
            )}
            {count === 0 && (
                <p className="text-xs text-muted-foreground italic">위험 없음 ✓</p>
            )}
        </div>
    );
}

export function RiskBoard({ risk, onIssueClick, onIssueKeysFocus }: Props) {
    return (
        <div className="space-y-4">
            {/* 헤더 요약 */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-base font-semibold text-foreground tracking-tight">🔥 리스크 보드</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">현재 즉시 조치 필요한 항목 — 카드 클릭 시 펼침</p>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 tabular-nums leading-none">
                        {risk.totalCount}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">총 위험</div>
                </div>
            </div>

            {/* 6 카드 grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <RiskCard
                    title="마감 임박"
                    subtitle="D-3 이내 미완료"
                    Icon={Clock}
                    accent="red"
                    count={risk.dueSoon.length}
                    items={risk.dueSoon}
                    onIssueClick={onIssueClick}
                    onIssueKeysFocus={onIssueKeysFocus}
                />
                <RiskCard
                    title="활동 정체 (Stale)"
                    subtitle="7일간 변동 없음"
                    Icon={Ghost}
                    accent="amber"
                    count={risk.stale.length}
                    items={risk.stale}
                    onIssueClick={onIssueClick}
                    onIssueKeysFocus={onIssueKeysFocus}
                />
                <RiskCard
                    title="미배정 방치"
                    subtitle="3일 이상 담당자 없음"
                    Icon={UserMinus}
                    accent="orange"
                    count={risk.unassigned.length}
                    items={risk.unassigned}
                    onIssueClick={onIssueClick}
                    onIssueKeysFocus={onIssueKeysFocus}
                />
                <RiskCard
                    title="보류 장기"
                    subtitle="7일 이상 보류 상태"
                    Icon={PauseCircle}
                    accent="purple"
                    count={risk.longOnHold.length}
                    items={risk.longOnHold}
                    onIssueClick={onIssueClick}
                    onIssueKeysFocus={onIssueKeysFocus}
                />
                <RiskCard
                    title="과부하 인원"
                    subtitle="동시 5건 이상 진행"
                    Icon={Flame}
                    accent="rose"
                    count={risk.overload.length}
                    overloadItems={risk.overload}
                    onIssueKeysFocus={onIssueKeysFocus}
                />
                <RiskCard
                    title="범위 변동 (Scope creep)"
                    subtitle={`최근 7일 신규/완료 비율 ${risk.scopeCreepRatio === Infinity ? '∞' : risk.scopeCreepRatio.toFixed(1)}`}
                    Icon={TrendingUp}
                    accent="blue"
                    count={risk.isScopeCreep ? 1 : 0}
                />
            </div>
        </div>
    );
}
