import React from 'react';
import { Activity, Info, HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CycleTimeStats } from '@/services/prediction/cycleTimeAnalysis';

interface Props {
    stats: CycleTimeStats[] | null;
    isFetching?: boolean;
    sampleNote?: string;
}

function fmtHours(h: number): string {
    if (h <= 0) return '-';
    if (h < 24) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)}d`;
}

function HelpTooltip({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = React.useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center text-slate-400 hover:text-slate-600"
                    aria-label="설명 보기"
                >
                    <HelpCircle className="h-3.5 w-3.5" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3 text-xs text-slate-700 bg-white border border-slate-200" align="start">
                {children}
            </PopoverContent>
        </Popover>
    );
}

export function CycleTimeCard({ stats, isFetching, sampleNote }: Props) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-slate-500" />
                    Cycle Time (이슈 타입별)
                    <HelpTooltip>
                        <p className="font-semibold mb-1">Cycle Time이 무엇?</p>
                        <p>이슈가 시작된 시점부터 완료된 시점까지의 경과 시간입니다.</p>
                        <ul className="mt-2 space-y-1 list-disc list-inside">
                            <li><strong>Active</strong>: 'in progress' 진입 → 'done'. 실제 작업 기간 (changelog 필요)</li>
                            <li><strong>Lead</strong>: created → done. 등록부터 완료까지 (백로그 대기 포함)</li>
                            <li><strong>P85</strong>: 이 type 이슈의 85%가 N일 안에 끝남 (약속용 보수 추정치)</li>
                            <li><strong>대기 비중</strong>: (Lead − Active) / Lead — 블로커·코드리뷰·QA 대기 비율</li>
                        </ul>
                        <p className="mt-2 text-slate-500">type별로 비교하면 "결함은 평균 1일, 새 기능은 5일" 같은 패턴 인식 가능.</p>
                    </HelpTooltip>
                </h3>
                {isFetching && <span className="text-[11px] text-slate-500">분석 중...</span>}
            </div>

            {!stats || stats.length === 0 ? (
                <div className="text-sm text-slate-500 py-4 flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                        Changelog 데이터를 분석 중이거나 없습니다. 이슈 상세를 한 번 이상 열어 changelog가 캐시되어야 정밀 분석이 가능합니다.
                    </span>
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-left">타입</th>
                                    <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">표본</th>
                                    <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">Active 평균</th>
                                    <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">Active P85</th>
                                    <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">Lead 평균</th>
                                    <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right" title="Wait/Lead — 블로커·리뷰 대기 비중">대기 비중</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {stats.map((s) => (
                                    <tr key={s.type} className="hover:bg-slate-50">
                                        <td className="px-2 py-1.5 text-slate-800">{s.type}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{s.sampleSize}건</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtHours(s.activeMeanH)}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmtHours(s.activeP85H)}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtHours(s.leadMeanH)}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums text-amber-700">
                                            {s.waitRatio > 0 ? `${Math.round(s.waitRatio * 100)}%` : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="px-1 py-2 text-[11px] text-slate-500">
                        * <strong>Active</strong>(in-progress→done) · <strong>Lead</strong>(created→done) · <strong>P85</strong>(85% 이슈가 N일 안에 끝남, 약속 권장) · <strong>대기 비중</strong>(Lead−Active)/Lead — 블로커/리뷰 대기 비율.
                        {sampleNote && ` ${sampleNote}`}
                    </p>
                </>
            )}
        </div>
    );
}
