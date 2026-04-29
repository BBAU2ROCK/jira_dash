import React from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BacklogEffortReport, EffortSource, ConfidenceLevel } from '@/services/prediction/types';

// v1.0.16: 한글 라벨 + InfoTip 병기 가능
const SOURCE_BADGE: Record<EffortSource, { label: string; full: string; color: string }> = {
    worklog:      { label: '기록', full: '작업 기록 (Worklog)',     color: 'bg-green-100 text-green-800 dark:text-green-300 border-green-200 dark:border-green-900/60' },
    sp:           { label: 'SP',   full: 'Story Point',              color: 'bg-blue-100 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-900/60' },
    difficulty:   { label: '난이도', full: '난이도 라벨 (상/중/하)', color: 'bg-purple-100 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-900/60' },
    'cycle-time': { label: '추정', full: '소요시간 추정 (Cycle Time fallback)', color: 'bg-muted/60 text-foreground/90 border-border' },
};

const CONFIDENCE_DOT: Record<ConfidenceLevel, string> = {
    high: 'text-green-600',
    medium: 'text-blue-600',
    low: 'text-amber-600',
    unreliable: 'text-muted-foreground',
};

const JIRA_BASE = 'https://okestro.atlassian.net/browse';

interface Props {
    report: BacklogEffortReport | null;
}

export function PerIssueEffortTable({ report }: Props) {
    const [showAll, setShowAll] = React.useState(false);
    const [sortDesc, setSortDesc] = React.useState(true);

    if (!report || report.perIssue.length === 0) return null;

    const sorted = [...report.perIssue].sort((a, b) =>
        sortDesc ? b.hours - a.hours : a.hours - b.hours
    );
    const visible = showAll ? sorted : sorted.slice(0, 50);
    const hidden = sorted.length - visible.length;

    return (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-foreground">이슈별 공수 (백로그 그루밍)</h3>
                <div className="text-[11px] text-muted-foreground">
                    {sorted.length}건 · 표시 {visible.length}건
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b border-border">
                        <tr>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-foreground/80 text-left">키</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-foreground/80 text-left">제목</th>
                            <th
                                scope="col"
                                className="px-2 py-2 text-xs font-medium text-foreground/80 text-right cursor-pointer hover:bg-muted/60 select-none"
                                onClick={() => setSortDesc(!sortDesc)}
                                title="작업량 정렬 토글"
                            >
                                추정 작업 (일) {sortDesc ? '▼' : '▲'}
                            </th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-foreground/80 text-right">범위 (일)</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-foreground/80 text-center">출처</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-foreground/80 text-center">신뢰</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {visible.map((p) => {
                            const badge = SOURCE_BADGE[p.source];
                            const dot = CONFIDENCE_DOT[p.confidence];
                            // v1.0.16: 시간 → 일 환산 (8시간 = 1일)
                            const days = p.hours / 8;
                            const daysLow = p.hoursLow / 8;
                            const daysHigh = p.hoursHigh / 8;
                            return (
                                <tr key={p.issueKey} className="hover:bg-muted/40">
                                    <td className="px-2 py-1.5">
                                        <a
                                            href={`${JIRA_BASE}/${p.issueKey}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs font-mono text-blue-600 hover:underline inline-flex items-center gap-1"
                                        >
                                            {p.issueKey}
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </td>
                                    <td className="px-2 py-1.5 max-w-[400px] truncate text-foreground/90" title={p.summary}>
                                        {p.summary}
                                    </td>
                                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                                        {days < 0.1 ? days.toFixed(2) : days.toFixed(1)}
                                    </td>
                                    <td className="px-2 py-1.5 text-right tabular-nums text-xs text-muted-foreground">
                                        {daysLow < 0.1 ? daysLow.toFixed(2) : daysLow.toFixed(1)} ~ {daysHigh < 0.1 ? daysHigh.toFixed(2) : daysHigh.toFixed(1)}
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                        <span
                                            className={cn('inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium', badge.color)}
                                            title={badge.full}
                                        >
                                            {badge.label}
                                        </span>
                                    </td>
                                    <td className={cn('px-2 py-1.5 text-center text-xs', dot)} title={p.confidence}>
                                        ●
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {hidden > 0 && (
                <div className="px-3 py-2 border-t border-border/50 text-center">
                    <button
                        type="button"
                        onClick={() => setShowAll(true)}
                        className="text-xs text-blue-600 hover:underline"
                    >
                        나머지 {hidden}건 더 보기
                    </button>
                </div>
            )}
            <p className="px-3 py-2 text-[11px] text-muted-foreground bg-muted/40 border-t border-border/50">
                * 1일 = 작업자 1명 8시간. 키 클릭 → Jira 새 탭. 출처: 기록=Worklog / SP=Story Point / 추정=Cycle time fallback.
            </p>
        </div>
    );
}
