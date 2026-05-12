/**
 * v1.0.47: 백로그 진척 분석 카드 — 정적 모델 전용.
 *
 * 사용자 워크플로우 (초기 일괄 등록 + 정해진 일정 안에 처리)에 맞춰 신규 유입 분석 대체.
 * 표시 항목: 초기 백로그 / 완료 / 진척률 / 처리 속도 / 예측 완료일 / 마감 비교 / 번다운.
 */
import { TrendingDown, AlertTriangle, CheckCircle2, Clock, Calendar, Target } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import type { BacklogProgressAnalysis } from '@/services/prediction/backlogProgressAnalysis';

interface Props {
    analysis: BacklogProgressAnalysis;
}

export function BacklogProgressCard({ analysis }: Props) {
    if (analysis.initialBacklog === 0) {
        return (
            <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-indigo-500" />
                    백로그 진척 분석
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">유효한 leaf 이슈가 없습니다.</p>
            </div>
        );
    }

    const onTimeMeta = {
        'on-time':  { label: '✓ 정시 완료 가능',   color: 'bg-green-100 text-green-800 dark:text-green-300 border-green-200 dark:border-green-900/60' },
        'at-risk':  { label: '⚠️ 위험',              color: 'bg-amber-100 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/60' },
        'overdue':  { label: '🔴 지연 예상',        color: 'bg-red-100 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900/60' },
        'no-due':   { label: '마감 없음',           color: 'bg-muted/60 text-foreground/90 border-border' },
    }[analysis.onTimeStatus];

    // 번다운 sparkline용 max
    const maxRemaining = Math.max(1, ...analysis.burndown.map((b) => b.remaining));

    return (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            {/* 헤더 */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2 flex-wrap">
                    <TrendingDown className="h-4 w-4 text-indigo-500" />
                    백로그 진척 분석
                    <span className="text-[10px] font-normal text-muted-foreground inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5">
                        📊 정적 모델
                    </span>
                    <InfoTip>
                        <div className="space-y-2 max-w-sm">
                            <div className="font-semibold text-foreground text-sm">백로그 진척 분석 — 정적 모델 전용</div>
                            <p className="text-muted-foreground">
                                사용자 워크플로우: 초기 요구사항 → 일괄 등록(N건) → 정해진 일정 안에 처리.
                                신규 유입이 적은 환경에서 의미 있는 metric으로 재구성.
                            </p>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">📊 표시 metric</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li><strong>초기 백로그</strong>: 전체 leaf 이슈 (취소·반려 제외)</li>
                                    <li><strong>진척률</strong>: 완료 ÷ 초기 백로그 × 100%</li>
                                    <li><strong>처리 속도</strong>: 최근 4주 완료 평균 (주당 / 영업일당)</li>
                                    <li><strong>예측 완료일</strong>: 잔여 ÷ 일평균 처리속도 (영업일 환산)</li>
                                    <li><strong>마감 비교</strong>: 가장 늦은 활성 이슈 duedate vs 예측 완료일</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">🎯 정시 완료 평가</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li><strong>정시 완료 가능</strong>: 예측 ≤ 마감 + 영업일 5일 여유</li>
                                    <li><strong>위험</strong>: 예측 ≤ 마감 (여유 5일 미만)</li>
                                    <li><strong>지연 예상</strong>: 예측 &gt; 마감</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">🔄 자동 모델 감지</div>
                                <p className="text-muted-foreground text-[11px]">
                                    최근 30일 신규 비율이 전체의 5% 미만 AND 절대값 10건 미만 → 정적 모델.
                                    그 이상이면 활발 모델로 분류되어 ScopeInflowCard가 표시됩니다.
                                </p>
                            </div>
                            <div className="border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">
                                ⚠️ 한계: 단순 평균 처리 속도 가정 (가속/감속 미반영). 이슈 크기 차이 무시.
                            </div>
                        </div>
                    </InfoTip>
                </h3>
                <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', onTimeMeta.color)}>
                    {onTimeMeta.label}
                </span>
            </div>

            {/* Top 4 메트릭 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-md border border-border bg-muted/30 p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1 justify-center">
                        초기 백로그
                        <InfoTip size="sm">
                            <p className="text-xs text-muted-foreground">
                                전체 leaf 이슈 (취소·반려 제외). 이 프로젝트가 처리해야 할 총 작업량.
                            </p>
                        </InfoTip>
                    </div>
                    <div className="text-2xl font-bold text-foreground tabular-nums">{analysis.initialBacklog}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1 justify-center">
                        완료
                        <InfoTip size="sm">
                            <p className="text-xs text-muted-foreground">
                                status 'done' 카테고리 또는 customfield_11485 입력 (취소·반려 제외).
                            </p>
                        </InfoTip>
                    </div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{analysis.currentCompleted}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1 justify-center">
                        진척률
                        <InfoTip size="sm">
                            <p className="text-xs text-muted-foreground">
                                완료 ÷ 초기 백로그 × 100%.
                            </p>
                        </InfoTip>
                    </div>
                    <div className={cn(
                        'text-2xl font-bold tabular-nums',
                        analysis.progressPct >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                        analysis.progressPct >= 50 ? 'text-blue-600 dark:text-blue-400' :
                        analysis.progressPct >= 20 ? 'text-amber-600 dark:text-amber-400' :
                        'text-foreground'
                    )}>
                        {analysis.progressPct}%
                    </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2.5 text-center">
                    <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1 justify-center">
                        잔여
                        <InfoTip size="sm">
                            <p className="text-xs text-muted-foreground">
                                활성 백로그 (보류 포함, 취소·반려 제외).
                            </p>
                        </InfoTip>
                    </div>
                    <div className="text-2xl font-bold text-foreground tabular-nums">{analysis.currentActive}</div>
                </div>
            </div>

            {/* 진척률 progress bar */}
            <div>
                <div className="h-2 bg-muted/60 rounded overflow-hidden">
                    <div
                        className={cn(
                            'h-full transition-all',
                            analysis.progressPct >= 80 ? 'bg-emerald-500' :
                            analysis.progressPct >= 50 ? 'bg-blue-500' :
                            'bg-amber-500'
                        )}
                        style={{ width: `${Math.min(100, analysis.progressPct)}%` }}
                    />
                </div>
            </div>

            {/* 번다운 sparkline */}
            {analysis.burndown.length > 0 && (
                <div>
                    <div className="text-[11px] font-semibold text-foreground/90 mb-1.5 inline-flex items-center gap-1">
                        번다운 (최근 30일 잔여 추이)
                        <InfoTip size="sm">
                            <p className="text-xs text-muted-foreground max-w-xs">
                                지난 30일 잔여 백로그 추이. 우하향 = 정상 처리 중. 평탄 또는 우상향 = 처리 속도 저하 신호.
                            </p>
                        </InfoTip>
                    </div>
                    <div className="flex items-end gap-px h-12 bg-muted/20 rounded p-1">
                        {analysis.burndown.map((b) => {
                            const heightPct = (b.remaining / maxRemaining) * 100;
                            return (
                                <div
                                    key={b.date}
                                    className="flex-1 bg-indigo-500/70 dark:bg-indigo-600/70 transition-all"
                                    style={{ height: `${Math.max(2, heightPct)}%` }}
                                    title={`${b.date}: 잔여 ${b.remaining}건 / 완료 누적 ${b.cumulativeCompleted}건`}
                                />
                            );
                        })}
                    </div>
                    <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                        <span>{analysis.burndown[0]?.date}</span>
                        <span>오늘 ({analysis.currentActive}건)</span>
                    </div>
                </div>
            )}

            {/* 처리 속도 + 예측 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-md border border-border bg-muted/30 p-2.5">
                    <div className="text-[11px] font-semibold text-foreground/90 mb-1 inline-flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        처리 속도 (최근 4주)
                        <InfoTip size="sm">
                            <p className="text-xs text-muted-foreground max-w-xs">
                                지난 4주(28일) 동안 완료된 이슈 평균. 영업일당 = 4주 ÷ 20영업일.
                            </p>
                        </InfoTip>
                    </div>
                    <div className="text-xl font-bold text-foreground tabular-nums">
                        {analysis.weeklyVelocity}
                        <span className="text-sm font-normal text-muted-foreground ml-1">건/주</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        {analysis.dailyVelocity}건/영업일 · 총 {analysis.completedLast4Weeks}건 완료
                    </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2.5">
                    <div className="text-[11px] font-semibold text-foreground/90 mb-1 inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        예측 완료일
                        <InfoTip size="sm">
                            <div className="space-y-1 max-w-xs">
                                <p className="text-xs text-muted-foreground">
                                    잔여 ÷ 일평균 처리 속도 (영업일 환산).
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    잔여 {analysis.currentActive}건 ÷ {analysis.dailyVelocity}건/일 = {analysis.estimatedRemainingDays}영업일
                                </p>
                            </div>
                        </InfoTip>
                    </div>
                    {analysis.estimatedCompletionDate ? (
                        <>
                            <div className="text-xl font-bold text-foreground tabular-nums">
                                {format(analysis.estimatedCompletionDate, 'yyyy.MM.dd')}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                {analysis.estimatedRemainingDays}영업일 후
                            </div>
                        </>
                    ) : (
                        <div className="text-sm text-muted-foreground">처리 속도 부족 — 예측 불가</div>
                    )}
                </div>
            </div>

            {/* 마감 비교 */}
            {analysis.latestDueDate && (
                <div className={cn(
                    'rounded-md border p-2.5 text-xs',
                    analysis.onTimeStatus === 'on-time' && 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/60 text-green-900 dark:text-green-300',
                    analysis.onTimeStatus === 'at-risk' && 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-300',
                    analysis.onTimeStatus === 'overdue' && 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/60 text-red-900 dark:text-red-300',
                )}>
                    <div className="font-semibold mb-1 inline-flex items-center gap-1">
                        {analysis.onTimeStatus === 'on-time' && <CheckCircle2 className="h-3.5 w-3.5" />}
                        {analysis.onTimeStatus === 'at-risk' && <AlertTriangle className="h-3.5 w-3.5" />}
                        {analysis.onTimeStatus === 'overdue' && <AlertTriangle className="h-3.5 w-3.5" />}
                        <Clock className="h-3 w-3" />
                        마감 비교
                    </div>
                    <div className="text-[11px]">
                        가장 늦은 활성 이슈 마감: <strong>{format(analysis.latestDueDate, 'yyyy.MM.dd')}</strong>
                        {analysis.estimatedCompletionDate && (
                            <>
                                {' '}vs 예측 완료: <strong>{format(analysis.estimatedCompletionDate, 'yyyy.MM.dd')}</strong>
                                {' '}({analysis.bufferDays >= 0 ? `여유 ${analysis.bufferDays}영업일` : `지연 ${Math.abs(analysis.bufferDays)}영업일`})
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* 자동 감지 안내 */}
            <div className="text-[10px] text-muted-foreground bg-muted/30 px-2 py-1.5 rounded border border-border/60">
                ⓘ {analysis.detectionReason}
            </div>

            {/* Warnings */}
            {analysis.warnings.length > 0 && (
                <div className="rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-2 text-[11px] text-amber-900 dark:text-amber-300">
                    <ul className="space-y-0.5 list-disc list-inside">
                        {analysis.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
}
