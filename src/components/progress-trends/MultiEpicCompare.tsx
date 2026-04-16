import { Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EpicComparisonRow } from '@/services/retrospective/types';

interface Props {
    rows: EpicComparisonRow[];
}

function deltaSpan(value: number, suffix = '', invertColor = false): React.ReactNode {
    if (value === 0) return <span className="text-slate-400">±0{suffix}</span>;
    const positive = value > 0;
    const goodColor = invertColor ? !positive : positive;
    return (
        <span className={cn('text-[10px] tabular-nums', goodColor ? 'text-green-700' : 'text-red-700')}>
            {positive ? '+' : ''}{value}{suffix}
        </span>
    );
}

export function MultiEpicCompare({ rows }: Props) {
    if (rows.length < 2) return null; // 1개만 선택했을 때는 비교 X

    return (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2">
                <Scale className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-800">다중 에픽 비교 (평균 대비)</h3>
                <span className="text-[11px] text-slate-500 ml-auto">{rows.length}개 에픽</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-left">에픽</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">KPI</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">완료율</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">정시</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">Avg CT</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">담당자</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map((r) => (
                            <tr key={r.epicKey} className="hover:bg-slate-50">
                                <td className="px-2 py-1.5">
                                    <div className="font-mono text-[11px] text-slate-700">{r.epicKey}</div>
                                    <div className="text-xs text-slate-600 truncate max-w-[300px]" title={r.epicSummary}>{r.epicSummary}</div>
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums">
                                    <div className="font-bold">{r.kpiScore}</div>
                                    <div>{deltaSpan(r.deltaFromAvg.kpiScore)}</div>
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums">
                                    <div>{r.completionRate}%</div>
                                    <div>{deltaSpan(r.deltaFromAvg.completionRate, '%')}</div>
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums">
                                    <div>{r.onTimeRate}%</div>
                                    <div>{deltaSpan(r.deltaFromAvg.onTimeRate, '%')}</div>
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums">
                                    <div>{r.avgCycleTimeDays}d</div>
                                    <div>{deltaSpan(r.deltaFromAvg.avgCycleTime, 'd', true)}</div>
                                </td>
                                <td className="px-2 py-1.5 text-right text-slate-700">{r.contributors.length}명</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="px-3 py-2 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-100">
                * 평균 대비 delta — 좋음(녹) / 나쁨(적). Cycle time은 짧을수록 좋음(반전 색상).
            </p>
        </div>
    );
}
