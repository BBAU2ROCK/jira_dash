import { Clock, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import type { BacklogEffortReport, ConfidenceLevel, EffortSource } from '@/services/prediction/types';

// v1.0.16: 한글 단순화 + 영문 병기는 InfoTip에서
const SOURCE_LABEL: Record<EffortSource, { name: string; tip: string }> = {
    worklog:      { name: '작업 기록',  tip: 'Worklog — Jira에 직접 기록된 작업 시간' },
    sp:           { name: 'SP 점수',    tip: 'Story Point — 이슈 크기 점수' },
    difficulty:   { name: '난이도',     tip: '상/중/하 난이도 라벨 평균' },
    'cycle-time': { name: '소요시간',   tip: 'Cycle time fallback — created→done 시간 평균. 정확도 가장 낮음' },
};

const CONFIDENCE_LABEL: Record<ConfidenceLevel, { label: string; color: string }> = {
    high:        { label: '높음',     color: 'bg-green-100 text-green-800 border-green-200' },
    medium:      { label: '중간',     color: 'bg-blue-100 text-blue-800 border-blue-200' },
    low:         { label: '낮음',     color: 'bg-amber-100 text-amber-800 border-amber-200' },
    unreliable:  { label: '데이터 부족', color: 'bg-red-100 text-red-800 border-red-200' },
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
                    {/* v1.0.16: 시간(인시) 단위 제거 — 일/월 기준 표시 */}
                    <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                            <div className="text-[11px] text-slate-500">
                                추정 작업량 (일수)
                                <InfoTip>
                                    1 인일(man-day) = 1명이 8시간 일한 만큼.
                                    여러 출처(작업기록/SP/난이도/소요시간)를 자동 선택해 합산. mid = 중앙값.
                                </InfoTip>
                            </div>
                            <div className="text-2xl font-bold text-slate-800 tabular-nums">
                                {report.totalManDaysMid.toLocaleString('ko-KR')} <span className="text-base font-normal text-slate-500">일</span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                                범위 {report.totalManDaysLow.toFixed(0)} ~ {report.totalManDaysHigh.toFixed(0)} 일
                            </div>
                        </div>
                        <div>
                            <div className="text-[11px] text-slate-500">
                                월 환산
                                <InfoTip>
                                    1 인월(man-month) = 영업일 20일 (4주 × 5일).
                                    팀 환산 = 일수 ÷ (인원수 × 실작업 비율 {Math.round(report.teamCapacityAssumption.utilization * 100)}%).
                                </InfoTip>
                            </div>
                            <div className="text-2xl font-bold text-slate-800 tabular-nums">
                                {report.totalManMonthsMid.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-base font-normal text-slate-500">월</span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                                팀 {report.teamCapacityAssumption.headcount}명 →{' '}
                                <strong>{report.teamCapacityAssumption.teamDaysMid}일 ({report.teamCapacityAssumption.teamMonthsMid}월)</strong>
                            </div>
                        </div>
                    </div>

                    <div className="mt-3">
                        <div className="text-[11px] font-medium text-slate-600 mb-1 inline-flex items-center gap-1">
                            데이터 출처 분포
                            <InfoTip>이슈마다 가장 정확한 데이터를 자동 선택. 작업 기록(Worklog) 우선 → SP → 난이도 → 소요시간(Cycle) 순.</InfoTip>
                        </div>
                        <ul className="space-y-1">
                            {report.sourceMix.map((s) => {
                                const pct = totalCount > 0 ? Math.round((s.count / totalCount) * 100) : 0;
                                const meta = SOURCE_LABEL[s.source];
                                return (
                                    <li key={s.source} className="flex items-center gap-2 text-xs">
                                        <span className="w-28 text-slate-700 inline-flex items-center gap-1">
                                            {meta.name}
                                            <InfoTip size="sm">{meta.tip}</InfoTip>
                                        </span>
                                        <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                                            <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="w-24 text-right text-slate-600 tabular-nums">
                                            {s.count}건 / {s.manDays.toFixed(1)}일
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
                                작업 기록·SP·난이도 데이터가 부족해 <strong>소요시간 추정만</strong> 사용. 정확도 낮음 — 신뢰 구간 넓음.
                            </span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
