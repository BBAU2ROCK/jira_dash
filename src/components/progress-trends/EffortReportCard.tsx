import { Clock, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import type { BacklogEffortReport, ConfidenceLevel, EffortSource } from '@/services/prediction/types';

const SOURCE_LABEL: Record<EffortSource, string> = {
    worklog: 'Worklog',
    sp: 'Story Point',
    difficulty: '난이도',
    'cycle-time': 'Cycle time (추정)',
};

const CONFIDENCE_LABEL: Record<ConfidenceLevel, { label: string; color: string }> = {
    high: { label: '높음', color: 'bg-green-100 text-green-800 border-green-200' },
    medium: { label: '중간', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    low: { label: '낮음', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    unreliable: { label: '예측 불가', color: 'bg-red-100 text-red-800 border-red-200' },
};

interface Props {
    report: BacklogEffortReport | null;
    confidence: ConfidenceLevel | null;
}

export function EffortReportCard({ report, confidence }: Props) {
    if (!report) return null;
    const conf = confidence ?? 'unreliable';
    const badge = CONFIDENCE_LABEL[conf];
    const totalCount = report.perIssue.length;

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-500" />
                    백로그 공수 추정
                </h3>
                <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', badge.color)}>
                    {badge.label}
                </span>
            </div>

            {totalCount === 0 ? (
                <p className="mt-3 text-sm text-slate-500">활성 백로그가 없습니다.</p>
            ) : (
                <>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                            <div className="text-[11px] text-slate-500">총 공수 (mid) <InfoTip>Worklog→SP→난이도→Cycle time 순으로 자동 선택된 hybrid 추정. mid = 중앙값, 범위는 아래 표시.</InfoTip></div>
                            <div className="text-2xl font-bold text-slate-800 tabular-nums">
                                {report.totalHoursMid.toLocaleString('ko-KR')} 인시
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                                범위 {report.totalHoursLow.toFixed(0)} ~ {report.totalHoursHigh.toFixed(0)} 인시
                            </div>
                        </div>
                        <div>
                            <div className="text-[11px] text-slate-500">인일 환산 <InfoTip>총 인시 ÷ 8h = 인일. 팀 환산 = 인일 ÷ (인원수 × 가동률 65%).</InfoTip></div>
                            <div className="text-2xl font-bold text-slate-800 tabular-nums">
                                {report.totalManDaysMid.toLocaleString('ko-KR')} 인일
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                                팀 {report.teamCapacityAssumption.headcount}명 × 가동률{' '}
                                {Math.round(report.teamCapacityAssumption.utilization * 100)}% →{' '}
                                <strong>{report.teamCapacityAssumption.teamDaysMid}일</strong>
                            </div>
                        </div>
                    </div>

                    <div className="mt-3">
                        <div className="text-[11px] font-medium text-slate-600 mb-1">데이터 출처 분포</div>
                        <ul className="space-y-1">
                            {report.sourceMix.map((s) => {
                                const pct = totalCount > 0 ? Math.round((s.count / totalCount) * 100) : 0;
                                return (
                                    <li key={s.source} className="flex items-center gap-2 text-xs">
                                        <span className="w-28 text-slate-700">{SOURCE_LABEL[s.source]}</span>
                                        <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                                            <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="w-20 text-right text-slate-600 tabular-nums">
                                            {s.count}건 / {Math.round(s.hours)}시
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {report.cycleTimeFallbackOnly && (
                        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 flex items-start gap-1.5">
                            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>
                                Worklog/SP/난이도 데이터가 부족해 cycle time 추정만 사용. 정확도 낮음 — 신뢰 구간이 큼.
                            </span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
