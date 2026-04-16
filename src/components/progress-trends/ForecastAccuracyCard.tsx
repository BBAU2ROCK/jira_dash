import { Target, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { Button } from '@/components/ui/button';
import { useForecastHistoryStore } from '@/stores/forecastHistoryStore';
import { computeAccuracy } from '@/services/prediction/accuracyTracking';

const CALIBRATION_LABEL = {
    'well-calibrated': { label: '보정 양호', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle2 },
    'over-confident': { label: '과신', color: 'bg-red-100 text-red-800 border-red-200', icon: AlertTriangle },
    'under-confident': { label: '저신', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: AlertTriangle },
    'insufficient': { label: '데이터 부족', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: AlertTriangle },
} as const;

interface Props {
    projectKey: string;
}

export function ForecastAccuracyCard({ projectKey }: Props) {
    const records = useForecastHistoryStore((s) => s.records);
    const clear = useForecastHistoryStore((s) => s.clear);
    const acc = computeAccuracy(records, projectKey);
    const meta = CALIBRATION_LABEL[acc.calibration];
    const Icon = meta.icon;

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <Target className="h-4 w-4 text-slate-500" />
                    예측 정확도 추적 ({projectKey})
                </h3>
                <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium flex items-center gap-1', meta.color)}>
                    <Icon className="h-3 w-3" />
                    {meta.label}
                </span>
            </div>

            {acc.status === 'insufficient' ? (
                <p className="text-sm text-slate-500">
                    완료된 예측 기록이 {acc.sampleSize}건뿐입니다. 5건 이상 누적되면 정확도가 표시됩니다.
                </p>
            ) : (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                        <div>
                            <div className="text-[11px] text-slate-500">표본</div>
                            <div className="text-lg font-bold text-slate-800 tabular-nums">{acc.sampleSize}회</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-slate-500">MAE <InfoTip>Mean Absolute Error — 예측 P85일수와 실제 소요일의 평균 절대 차이. 작을수록 정확.</InfoTip></div>
                            <div className="text-lg font-bold text-slate-800 tabular-nums">±{acc.maeP85Days}일</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-slate-500">P85 적중률 <InfoTip>과거 예측 중 실제 완료일이 P85 이내에 들어온 비율. 85%면 잘 보정됨. 75% 미만이면 과신.</InfoTip></div>
                            <div className={cn(
                                'text-lg font-bold tabular-nums',
                                acc.hitRateP85 >= 80 && acc.hitRateP85 <= 92 ? 'text-green-700'
                                : acc.hitRateP85 < 75 ? 'text-red-700' : 'text-amber-700'
                            )}>
                                {acc.hitRateP85}%
                            </div>
                            <div className="text-[10px] text-slate-400">목표 85%</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-slate-500">P95 적중률</div>
                            <div className="text-lg font-bold text-slate-800 tabular-nums">{acc.hitRateP95}%</div>
                            <div className="text-[10px] text-slate-400">목표 95%</div>
                        </div>
                    </div>
                    <p className="mt-3 text-[11px] text-slate-500">
                        * 백로그 완료 시점이 자동 기록됨. 90일 지난 데이터는 자동 정리.
                    </p>
                </>
            )}

            <div className="mt-2 flex justify-end">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        if (confirm('모든 예측 기록을 삭제할까요?')) clear();
                    }}
                    className="text-xs text-slate-500 hover:text-red-600"
                >
                    <Trash2 className="h-3 w-3 mr-1" />
                    기록 초기화
                </Button>
            </div>
        </div>
    );
}
