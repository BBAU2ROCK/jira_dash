import React from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BacklogEffortReport, EffortSource, ConfidenceLevel } from '@/services/prediction/types';

const SOURCE_BADGE: Record<EffortSource, { label: string; color: string }> = {
    worklog: { label: 'WL', color: 'bg-green-100 text-green-800 border-green-200' },
    sp: { label: 'SP', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    difficulty: { label: '난이도', color: 'bg-purple-100 text-purple-800 border-purple-200' },
    'cycle-time': { label: 'CT', color: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const CONFIDENCE_DOT: Record<ConfidenceLevel, string> = {
    high: 'text-green-600',
    medium: 'text-blue-600',
    low: 'text-amber-600',
    unreliable: 'text-slate-400',
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
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-800">이슈별 공수 (백로그 그루밍)</h3>
                <div className="text-[11px] text-slate-500">
                    {sorted.length}건 · 표시 {visible.length}건
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-left">키</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-left">제목</th>
                            <th
                                scope="col"
                                className="px-2 py-2 text-xs font-medium text-slate-600 text-right cursor-pointer hover:bg-slate-100 select-none"
                                onClick={() => setSortDesc(!sortDesc)}
                                title="공수 정렬 토글"
                            >
                                공수 (인시) {sortDesc ? '▼' : '▲'}
                            </th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">범위</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-center">출처</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-center">신뢰</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {visible.map((p) => {
                            const badge = SOURCE_BADGE[p.source];
                            const dot = CONFIDENCE_DOT[p.confidence];
                            return (
                                <tr key={p.issueKey} className="hover:bg-slate-50">
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
                                    <td className="px-2 py-1.5 max-w-[400px] truncate text-slate-700" title={p.summary}>
                                        {p.summary}
                                    </td>
                                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                                        {p.hours.toFixed(1)}
                                    </td>
                                    <td className="px-2 py-1.5 text-right tabular-nums text-xs text-slate-500">
                                        {p.hoursLow.toFixed(0)} ~ {p.hoursHigh.toFixed(0)}
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                        <span className={cn('inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium', badge.color)}>
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
                <div className="px-3 py-2 border-t border-slate-100 text-center">
                    <button
                        type="button"
                        onClick={() => setShowAll(true)}
                        className="text-xs text-blue-600 hover:underline"
                    >
                        나머지 {hidden}건 더 보기
                    </button>
                </div>
            )}
            <p className="px-3 py-2 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-100">
                * 키 클릭 → Jira 새 탭으로 이동. 출처: WL=Worklog · SP=Story Point · CT=Cycle time fallback.
            </p>
        </div>
    );
}
