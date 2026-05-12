import { useMemo } from 'react';
import { Target, AlertTriangle, CheckCircle2, Trash2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { Button } from '@/components/ui/button';
import { useForecastExpectationStore } from '@/stores/forecastExpectationStore';
import { computePerIssueAccuracy } from '@/services/prediction/perIssueAccuracy';
import type { LeadTimeForecast } from '@/services/prediction/leadTimeForecast';

const CALIBRATION_LABEL = {
    'well-calibrated': { label: '보정 양호', color: 'bg-green-100 text-green-800 dark:text-green-300 border-green-200 dark:border-green-900/60', icon: CheckCircle2 },
    'over-confident': { label: '과신', color: 'bg-red-100 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900/60', icon: AlertTriangle },
    'under-confident': { label: '저신', color: 'bg-amber-100 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/60', icon: AlertTriangle },
    'insufficient': { label: '데이터 부족', color: 'bg-muted/60 text-foreground/90 border-border', icon: AlertTriangle },
} as const;

interface Props {
    projectKey: string;
    /** v1.0.45: Lead time forecast — 사후 분포 검증 데이터 제공 */
    leadTime?: LeadTimeForecast | null;
}

export function ForecastAccuracyCard({ projectKey, leadTime }: Props) {
    const expectations = useForecastExpectationStore((s) => s.expectations);
    const clear = useForecastExpectationStore((s) => s.clear);
    // v1.0.46 fix (M2): expectations 변경 시에만 재계산 — 250건 환경에서 매 렌더 순회 비용 회피
    const acc = useMemo(
        () => computePerIssueAccuracy(expectations, projectKey),
        [expectations, projectKey]
    );
    const distCheck = leadTime?.distributionCheck;
    const distMeta = distCheck ? CALIBRATION_LABEL[distCheck.calibration] : CALIBRATION_LABEL.insufficient;
    const accMeta = CALIBRATION_LABEL[acc.calibration];

    return (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    이슈별 예측 정확도 ({projectKey})
                    <InfoTip>
                        <div className="space-y-2 max-w-sm">
                            <div className="font-semibold text-foreground text-sm">두 종류의 정확도 (v1.0.45)</div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">📊 사후 분포 검증 (즉시 표시)</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>모든 완료 이슈의 lead time(created→completed)을 P50/P85/P95 약속과 비교</li>
                                    <li>self-consistency 측정 — 분포 안정성 검증</li>
                                    <li>정의상 P50≈50% / P85≈85% / P95≈95%여야 정상</li>
                                    <li>크게 벗어나면 이상치 多 또는 분포 변동 신호</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">🎯 실시간 Calibration (forwarding only)</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>이슈가 활성 상태로 처음 발견된 시점의 P85 약속 기록</li>
                                    <li>그 이슈가 done 처리되면 actualDays 측정</li>
                                    <li>약속 vs 실측 비교 — 진정한 forecast 정확도</li>
                                    <li>v1.0.36 설치 이후 새로 done된 이슈만 평가 가능 (시간 누적 필요)</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">⚖️ 두 metric 차이</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>사후 분포 = "현재 P85가 과거에 부합했나"</li>
                                    <li>실시간 = "내가 한 약속을 미래에 지켰나"</li>
                                    <li>사후는 즉시, 실시간은 시간 누적 후 더 신뢰도 ↑</li>
                                </ul>
                            </div>
                        </div>
                    </InfoTip>
                </h3>
            </div>

            {/* v1.0.45 섹션 1: 사후 분포 검증 (즉시 표시) */}
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
                        📊 사후 분포 검증
                        <span className="text-[10px] font-normal text-muted-foreground">(전체 완료 이슈)</span>
                        <InfoTip size="sm">
                            <div className="space-y-1.5 max-w-xs">
                                <div className="font-semibold text-foreground">사후 분포 검증</div>
                                <p className="text-muted-foreground text-xs">
                                    모든 완료 이슈의 lead time을 현재 P50/P85/P95 약속과 비교.
                                    self-consistency라 정의상 50/85/95%에 근접해야 정상.
                                </p>
                                <p className="text-muted-foreground text-xs">
                                    P85 적중률이 크게 벗어나면(75% 미만 = 과신 / 92% 초과 = 저신) 이상치 多 또는 분포 변동 신호.
                                </p>
                            </div>
                        </InfoTip>
                    </div>
                    {distCheck && distCheck.totalSamples >= 5 && (
                        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium flex items-center gap-1', distMeta.color)}>
                            <distMeta.icon className="h-3 w-3" />
                            {distMeta.label}
                        </span>
                    )}
                </div>
                {!leadTime || !distCheck || distCheck.totalSamples < 5 ? (
                    <p className="text-sm text-muted-foreground">
                        완료된 이슈 <strong className="text-foreground tabular-nums">{distCheck?.totalSamples ?? 0}건</strong>.
                        5건 이상 완료되면 분포 검증 표시.
                    </p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                                <div className="text-[10px] text-muted-foreground">완료 샘플</div>
                                <div className="text-lg font-bold text-foreground tabular-nums">{distCheck.totalSamples}건</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-muted-foreground">P50 적중률
                                    <InfoTip size="sm">
                                        <p className="text-xs text-muted-foreground">
                                            actual ≤ P50({leadTime.p50Days}일) 비율. 분포 정의상 ≈50%.
                                        </p>
                                    </InfoTip>
                                </div>
                                <div className="text-lg font-bold text-foreground tabular-nums">{distCheck.hitRateP50}%</div>
                                <div className="text-[10px] text-muted-foreground">목표 50%</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-muted-foreground">P85 적중률
                                    <InfoTip size="sm">
                                        <p className="text-xs text-muted-foreground">
                                            actual ≤ P85({leadTime.p85Days}일) 비율. 목표 85%.
                                            75% 미만 = 과신, 92% 초과 = 저신.
                                        </p>
                                    </InfoTip>
                                </div>
                                <div className={cn(
                                    'text-lg font-bold tabular-nums',
                                    distCheck.hitRateP85 >= 80 && distCheck.hitRateP85 <= 92 ? 'text-green-700 dark:text-green-300'
                                    : distCheck.hitRateP85 < 75 ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'
                                )}>
                                    {distCheck.hitRateP85}%
                                </div>
                                <div className="text-[10px] text-muted-foreground">목표 85%</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-muted-foreground">P95 적중률
                                    <InfoTip size="sm">
                                        <p className="text-xs text-muted-foreground">
                                            actual ≤ P95({leadTime.p95Days}일) 비율. 목표 95%.
                                        </p>
                                    </InfoTip>
                                </div>
                                <div className="text-lg font-bold text-foreground tabular-nums">{distCheck.hitRateP95}%</div>
                                <div className="text-[10px] text-muted-foreground">목표 95%</div>
                            </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            * 분포 통계: 평균 {leadTime.meanDays}일 / P50 {leadTime.p50Days}일 / P85 {leadTime.p85Days}일 / P95 {leadTime.p95Days}일 / 표준편차 ±{leadTime.stddevDays}일
                        </p>
                    </>
                )}
            </div>

            {/* v1.0.45 섹션 2: 실시간 Calibration (forwarding only) */}
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5 text-emerald-500" />
                        🎯 실시간 Calibration
                        <span className="text-[10px] font-normal text-muted-foreground">(추적 시작 이후 done)</span>
                        <InfoTip size="sm">
                            <div className="space-y-1.5 max-w-xs">
                                <div className="font-semibold text-foreground">실시간 Calibration</div>
                                <p className="text-muted-foreground text-xs">
                                    이슈가 활성 상태로 처음 보였을 때 P85 약속 기록 → done 시점에 실측 비교.
                                    진정한 forecast 정확도 측정.
                                </p>
                                <p className="text-muted-foreground text-xs">
                                    v1.0.36 설치 이후 새로 done된 이슈만 평가. 5건+ 누적 후 표시.
                                </p>
                            </div>
                        </InfoTip>
                    </div>
                    {acc.status === 'sufficient' && (
                        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium flex items-center gap-1', accMeta.color)}>
                            <accMeta.icon className="h-3 w-3" />
                            {accMeta.label}
                        </span>
                    )}
                </div>
                {acc.status === 'insufficient' ? (
                    <div className="text-sm text-muted-foreground space-y-1">
                        <p>
                            추적 완료된 이슈 <strong className="text-foreground tabular-nums">{acc.sampleSize}건</strong>.
                            5건 이상 완료되면 정확도 표시.
                        </p>
                        {acc.inProgressCount > 0 && (
                            <p className="text-[11px]">
                                현재 추적 중: <strong className="tabular-nums">{acc.inProgressCount}건</strong> (활성 이슈, done 시점에 자동 기록)
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                            <div className="text-[10px] text-muted-foreground">추적 완료
                                <InfoTip size="sm">
                                    <p className="text-xs text-muted-foreground">
                                        v1.0.36 이후 추적된 이슈 중 done 처리된 이슈 수.
                                        추적 중: {acc.inProgressCount}건.
                                    </p>
                                </InfoTip>
                            </div>
                            <div className="text-lg font-bold text-foreground tabular-nums">{acc.sampleSize}건</div>
                            <div className="text-[10px] text-muted-foreground">
                                추적 중 {acc.inProgressCount}건
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-muted-foreground">MAE</div>
                            <div className="text-lg font-bold text-foreground tabular-nums">±{acc.maeP85Days}일</div>
                            <div className="text-[10px] text-muted-foreground">평균 오차</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-muted-foreground">P85 적중률</div>
                            <div className={cn(
                                'text-lg font-bold tabular-nums',
                                acc.hitRateP85 >= 80 && acc.hitRateP85 <= 92 ? 'text-green-700 dark:text-green-300'
                                : acc.hitRateP85 < 75 ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'
                            )}>
                                {acc.hitRateP85}%
                            </div>
                            <div className="text-[10px] text-muted-foreground">목표 85%</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-muted-foreground">P95 적중률</div>
                            <div className="text-lg font-bold text-foreground tabular-nums">{acc.hitRateP95}%</div>
                            <div className="text-[10px] text-muted-foreground">목표 95%</div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex justify-end">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        if (confirm('실시간 추적 데이터를 초기화할까요?\n(사후 분포 검증은 lead time 데이터 기반이라 영향 없음)')) clear();
                    }}
                    className="text-xs text-muted-foreground hover:text-red-600"
                >
                    <Trash2 className="h-3 w-3 mr-1" />
                    실시간 추적 초기화
                </Button>
            </div>
        </div>
    );
}
