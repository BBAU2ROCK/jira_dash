import { Clock, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import type { BacklogEffortReport, ConfidenceLevel, EffortSource } from '@/services/prediction/types';

// v1.0.16: 한글 단순화 + 영문 병기는 InfoTip에서
// v1.0.32: planned 추가 — 이슈 자체 정보 (계획기간 + 난이도)
const SOURCE_LABEL: Record<EffortSource, { name: string; tip: string }> = {
    worklog:      { name: '작업 기록',  tip: 'Worklog — Jira에 직접 기록된 작업 시간' },
    planned:      { name: '계획 일정',  tip: '계획시작일~완료예정일 영업일 × 난이도 가중치 (상×1.2 / 중×1.0 / 하×0.8)' },
    sp:           { name: 'SP 점수',    tip: 'Story Point — 이슈 크기 점수' },
    difficulty:   { name: '난이도',     tip: '상/중/하 난이도 라벨 평균' },
    'cycle-time': { name: '소요시간',   tip: 'Cycle time fallback — created→done 시간 평균. 정확도 가장 낮음' },
};

const CONFIDENCE_LABEL: Record<ConfidenceLevel, { label: string; color: string }> = {
    high:        { label: '높음',     color: 'bg-green-100 text-green-800 dark:text-green-300 border-green-200 dark:border-green-900/60' },
    medium:      { label: '중간',     color: 'bg-blue-100 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-900/60' },
    low:         { label: '낮음',     color: 'bg-amber-100 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/60' },
    unreliable:  { label: '데이터 부족', color: 'bg-red-100 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900/60' },
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
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    백로그 공수 추정
                </h3>
                <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', badge.color)}>
                    {badge.label}
                </span>
            </div>

            {totalCount === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">활성 백로그가 없습니다.</p>
            ) : (
                <>
                    {/* v1.0.16: 시간(인시) 단위 제거 — 일/월 기준 표시 */}
                    <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                            <div className="text-[11px] text-muted-foreground">
                                추정 작업량 (일수)
                                <InfoTip>
                                    <div className="space-y-2 max-w-sm">
                                        <div className="font-semibold text-foreground">총 추정 작업량 (Man-Days)</div>
                                        <p className="text-muted-foreground">
                                            활성 백로그(완료·취소·반려 제외) 모든 이슈의 예측 작업 시간을 합산한 후 1일=8시간 기준으로 환산.
                                        </p>
                                        <div className="border-t border-border/50 pt-1.5">
                                            <div className="font-medium text-foreground/90 mb-1">📐 단위 정의</div>
                                            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                                <li>1 인일(MD) = 작업자 1명이 하루 8시간 작업한 분량</li>
                                                <li>1 인월(MM) = 영업일 20일 (4주 × 5일, 한 달 표준)</li>
                                            </ul>
                                        </div>
                                        <div className="border-t border-border/50 pt-1.5">
                                            <div className="font-medium text-foreground/90 mb-1">📊 산출 데이터</div>
                                            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                                <li>각 이슈에 대해 5개 source 우선순위 적용 (worklog → planned → SP → 난이도 → cycle time)</li>
                                                <li>이슈별 mid-point + 신뢰구간(low~high)</li>
                                                <li>총합 = 모든 이슈 mid 합산</li>
                                                <li>범위 = 모든 이슈 low/high 합산</li>
                                            </ul>
                                        </div>
                                        <div className="border-t border-border/50 pt-1.5">
                                            <div className="font-medium text-foreground/90 mb-1">🎯 신뢰도 등급 (우측 배지)</div>
                                            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                                <li><strong>높음</strong>: worklog 비중 50%+</li>
                                                <li><strong>중간</strong>: worklog 비중 30~50%</li>
                                                <li><strong>낮음</strong>: 그 외</li>
                                                <li><strong>데이터 부족</strong>: 활성 이슈 0건 또는 cycle time만 사용</li>
                                            </ul>
                                        </div>
                                    </div>
                                </InfoTip>
                            </div>
                            <div className="text-2xl font-bold text-foreground tabular-nums">
                                {report.totalManDaysMid.toLocaleString('ko-KR')} <span className="text-base font-normal text-muted-foreground">일</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                                범위 {report.totalManDaysLow.toFixed(0)} ~ {report.totalManDaysHigh.toFixed(0)} 일
                            </div>
                        </div>
                        <div>
                            <div className="text-[11px] text-muted-foreground">
                                월 환산
                                <InfoTip>
                                    <div className="space-y-2 max-w-sm">
                                        <div className="font-semibold text-foreground">월 환산 + 팀 캘린더</div>
                                        <p className="text-muted-foreground">
                                            인일 환산을 인월(man-month)로, 팀 인원과 실작업 비율을 적용해 캘린더 기준 일수까지 산출.
                                        </p>
                                        <div className="border-t border-border/50 pt-1.5">
                                            <div className="font-medium text-foreground/90 mb-1">📐 환산 공식</div>
                                            <div className="text-[11px] text-muted-foreground font-mono bg-muted/40 p-1.5 rounded">
                                                인월(MM) = 인일(MD) ÷ 20<br/>
                                                팀 일수 = 인일 ÷ (인원 × utilization)<br/>
                                                팀 월수 = 팀 일수 ÷ 20
                                            </div>
                                        </div>
                                        <div className="border-t border-border/50 pt-1.5">
                                            <div className="font-medium text-foreground/90 mb-1">⚙️ 현재 가정값</div>
                                            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                                <li>팀 인원: <strong>{report.teamCapacityAssumption.headcount}명</strong></li>
                                                <li>실작업 비율 (utilization): <strong>{Math.round(report.teamCapacityAssumption.utilization * 100)}%</strong></li>
                                                <li>← 회의·휴식·컨텍스트 스위칭 등 100% 작업 못 함을 반영</li>
                                                <li>일반 IT 팀 권장값 60~70% (default 65%)</li>
                                            </ul>
                                        </div>
                                        <div className="border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">
                                            💡 매니저 콘솔의 "예산 시뮬레이터"에서 인원·utilization 슬라이더로 즉시 다른 가정 시뮬레이션 가능.
                                        </div>
                                    </div>
                                </InfoTip>
                            </div>
                            <div className="text-2xl font-bold text-foreground tabular-nums">
                                {report.totalManMonthsMid.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-base font-normal text-muted-foreground">월</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                                팀 {report.teamCapacityAssumption.headcount}명 →{' '}
                                <strong>{report.teamCapacityAssumption.teamDaysMid}일 ({report.teamCapacityAssumption.teamMonthsMid}월)</strong>
                            </div>
                        </div>
                    </div>

                    <div className="mt-3">
                        <div className="text-[11px] font-medium text-foreground/80 mb-1 inline-flex items-center gap-1">
                            데이터 출처 분포
                            <InfoTip>
                                <div className="space-y-2 max-w-sm">
                                    <div className="font-semibold text-foreground">데이터 출처 분포</div>
                                    <p className="text-muted-foreground">
                                        백로그 각 이슈가 어떤 데이터로 산정됐는지의 비율. 막대가 길수록 해당 source 의존도 높음.
                                    </p>
                                    <div className="border-t border-border/50 pt-1.5">
                                        <div className="font-medium text-foreground/90 mb-1">📊 우선순위 (위에서 아래)</div>
                                        <ol className="list-decimal pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                            <li><strong>작업 기록 (Worklog)</strong>: 실제 기록 — 가장 정확</li>
                                            <li><strong>계획 일정 (Planned)</strong>: 계획시작일+완료예정일+난이도 — 이슈 자체 정보</li>
                                            <li><strong>SP (Story Point)</strong>: SP × 과거 hoursPerSP 평균</li>
                                            <li><strong>난이도</strong>: 라벨별 cycle time 평균</li>
                                            <li><strong>소요시간 (Cycle)</strong>: created→done wall-clock fallback</li>
                                        </ol>
                                    </div>
                                    <div className="border-t border-border/50 pt-1.5">
                                        <div className="font-medium text-foreground/90 mb-1">💡 진단</div>
                                        <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                            <li>worklog 비중 ↑ → 신뢰도 ↑</li>
                                            <li>cycle-time 비중 ↑ → 데이터 부족 → 신뢰도 ↓</li>
                                            <li>planned 비중 ↑ → 일정 등록 잘 된 팀 (좋음)</li>
                                            <li>분포 개선 = 팀에 worklog/일정 등록 권장</li>
                                        </ul>
                                    </div>
                                </div>
                            </InfoTip>
                        </div>
                        <ul className="space-y-1">
                            {report.sourceMix.map((s) => {
                                const pct = totalCount > 0 ? Math.round((s.count / totalCount) * 100) : 0;
                                const meta = SOURCE_LABEL[s.source];
                                return (
                                    <li key={s.source} className="flex items-center gap-2 text-xs">
                                        <span className="w-28 text-foreground/90 inline-flex items-center gap-1">
                                            {meta.name}
                                            <InfoTip size="sm">{meta.tip}</InfoTip>
                                        </span>
                                        <div className="flex-1 h-2 bg-muted/60 rounded overflow-hidden">
                                            <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="w-24 text-right text-foreground/80 tabular-nums">
                                            {s.count}건 / {s.manDays.toFixed(1)}일
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {report.cycleTimeFallbackOnly && (
                        <div className="mt-3 rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-2 text-[11px] text-amber-900 dark:text-amber-300 flex items-start gap-1.5">
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
