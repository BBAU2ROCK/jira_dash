import React from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { TeamForecast, ConfidenceLevel } from '@/services/prediction/types';
import { confidenceGuidance } from '@/services/prediction/confidence';

const CONFIDENCE_DOT: Record<ConfidenceLevel, { dots: string; color: string }> = {
    high: { dots: '●●●', color: 'text-green-600' },
    medium: { dots: '●●○', color: 'text-blue-600' },
    low: { dots: '●○○', color: 'text-amber-600' },
    unreliable: { dots: '○○○', color: 'text-slate-400' },
};

type SortKey = 'name' | 'remaining' | 'throughput' | 'eta';

/** 정렬 가능한 헤더 셀 — 컴포넌트 외부 정의 (react-hooks/static-components 준수) */
function SortableTh({
    k,
    label,
    align = 'left',
    currentKey,
    asc,
    onSort,
}: {
    k: SortKey;
    label: string;
    align?: 'left' | 'right' | 'center';
    currentKey: SortKey;
    asc: boolean;
    onSort: (k: SortKey) => void;
}) {
    return (
        <th
            scope="col"
            className={cn(
                'px-2 py-2 text-xs font-medium text-slate-600 cursor-pointer hover:bg-slate-100 select-none',
                align === 'right' && 'text-right',
                align === 'center' && 'text-center'
            )}
            onClick={() => onSort(k)}
        >
            {label} {currentKey === k ? (asc ? '▲' : '▼') : ''}
        </th>
    );
}

interface Props {
    team: TeamForecast | null;
}

export function PerAssigneeTable({ team }: Props) {
    const [sortKey, setSortKey] = React.useState<SortKey>('name');
    const [asc, setAsc] = React.useState(true);

    if (!team) return null;
    const rows = [...team.perAssignee];

    rows.sort((a, b) => {
        let cmp = 0;
        switch (sortKey) {
            case 'name': cmp = a.displayName.localeCompare(b.displayName, 'ko'); break;
            case 'remaining': cmp = a.remaining - b.remaining; break;
            case 'throughput': cmp = a.avgDailyThroughput - b.avgDailyThroughput; break;
            case 'eta': cmp = (a.forecast?.p85Days ?? Infinity) - (b.forecast?.p85Days ?? Infinity); break;
        }
        return asc ? cmp : -cmp;
    });

    const onSort = (key: SortKey) => {
        if (sortKey === key) setAsc(!asc);
        else { setSortKey(key); setAsc(true); }
    };

    return (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-800">담당자별 처리량 + ETA</h3>
                <span className="text-[11px] text-slate-500">미할당 {team.unassignedCount}건 / 보류 {team.onHoldCount}건은 별도</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <SortableTh k="name" label="담당자" currentKey={sortKey} asc={asc} onSort={onSort} />
                            <SortableTh k="remaining" label="잔여" align="right" currentKey={sortKey} asc={asc} onSort={onSort} />
                            <th className="px-2 py-2 text-xs font-medium text-slate-600 text-right">보류</th>
                            <th className="px-2 py-2 text-xs font-medium text-slate-600 text-right">활동일/30</th>
                            <SortableTh k="throughput" label="일평균" align="right" currentKey={sortKey} asc={asc} onSort={onSort} />
                            <SortableTh k="eta" label="ETA (P85)" align="right" currentKey={sortKey} asc={asc} onSort={onSort} />
                            <th className="px-2 py-2 text-xs font-medium text-slate-600 text-center">신뢰</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.length === 0 && (
                            <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">담당자 데이터 없음</td></tr>
                        )}
                        {rows.map((r) => {
                            const inactive = r.activeDays < 7;
                            const guidance = r.forecast ? confidenceGuidance(r.forecast.confidence) : null;
                            const dot = r.forecast ? CONFIDENCE_DOT[r.forecast.confidence] : CONFIDENCE_DOT.unreliable;
                            return (
                                <tr key={r.key} className={cn(inactive && 'bg-slate-50/50 text-slate-400')}>
                                    <td className="px-2 py-2 text-slate-800">{r.displayName}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{r.remaining}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{r.onHold || '-'}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{r.activeDays}일</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{r.avgDailyThroughput}건</td>
                                    <td className="px-2 py-2 text-right tabular-nums">
                                        {r.forecast && guidance?.showSingleEta
                                            ? format(r.forecast.p85Date, 'yyyy.MM.dd', { locale: ko })
                                            : r.forecast && guidance?.showRange
                                                ? `~ ${r.forecast.p95Days}d`
                                                : '—'}
                                    </td>
                                    <td className={cn('px-2 py-2 text-center text-xs', dot.color)} title={r.forecast?.confidence ?? 'no-data'}>
                                        {dot.dots}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="px-3 py-2 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-100">
                * 활동 7일 미만 인원은 회색. 휴가·specialization 미반영. 워크로드 균형 분석 용도 (성과 평가 X).
            </p>
        </div>
    );
}
