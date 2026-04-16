import { Input } from '@/components/ui/input';
import { InfoTip } from '@/components/ui/info-tip';
import { AlertTriangle } from 'lucide-react';
import type { KpiRuleSet } from '@/stores/kpiRulesStore';
import { cn } from '@/lib/utils';

type PredConfig = KpiRuleSet['prediction'];

interface Props {
    config: PredConfig;
    onChange: (config: PredConfig) => void;
}

/**
 * K13: NumRow 내부에서 범위 위반 즉시 감지.
 * validateRuleSet은 저장 시 한 번에 전체 검사 → 편집 중에는 느껴지지 않음 → 로컬 피드백 추가.
 */
function NumRow({ label, tip, value, onChange, min, max, step, unit }: {
    label: string; tip: string; value: number; onChange: (v: number) => void;
    min?: number; max?: number; step?: number; unit?: string;
}) {
    const outOfRange = (min != null && value < min) || (max != null && value > max);
    return (
        <div className="grid grid-cols-[180px_1fr] gap-2 items-start">
            <label className="text-xs text-slate-600 flex items-center gap-1 pt-1.5">
                {label}
                <InfoTip>{tip}</InfoTip>
            </label>
            <div>
                <div className="flex items-center gap-1">
                    <Input
                        type="number"
                        value={value}
                        onChange={(e) => {
                            const n = parseFloat(e.target.value);
                            if (!isNaN(n)) onChange(n);
                        }}
                        className={cn(
                            'h-7 text-xs w-24',
                            outOfRange && 'border-red-400 focus-visible:ring-red-400 text-red-700'
                        )}
                        min={min}
                        max={max}
                        step={step}
                        aria-invalid={outOfRange || undefined}
                    />
                    {unit && <span className="text-xs text-slate-500">{unit}</span>}
                </div>
                {outOfRange && (
                    <div className="mt-0.5 text-[11px] text-red-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {min != null && max != null
                            ? `허용 범위: ${min} ~ ${max}${unit ?? ''}`
                            : min != null
                              ? `최소값: ${min}${unit ?? ''}`
                              : `최대값: ${max}${unit ?? ''}`}
                    </div>
                )}
            </div>
        </div>
    );
}

export function PredictionConfigEditor({ config, onChange }: Props) {
    const update = (key: keyof PredConfig, value: number) => {
        onChange({ ...config, [key]: value });
    };

    return (
        <div>
            <div className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1">
                예측 파라미터 (고급)
                <InfoTip>Monte Carlo, 신뢰도, 공수 분석에 사용되는 임계값. 기본값 사용 권장.</InfoTip>
            </div>
            <div className="space-y-1.5">
                <NumRow label="참조 기간" tip="처리량 통계에 사용할 기간 (일)." value={config.defaultHistoryDays} onChange={(v) => update('defaultHistoryDays', v)} min={7} max={365} unit="일" />
                <NumRow label="MC 시뮬레이션 횟수" tip="Monte Carlo 시뮬레이션 trial 수. 클수록 정밀, 느림." value={config.monteCarloTrials} onChange={(v) => update('monteCarloTrials', v)} min={1000} max={100000} step={1000} unit="회" />
                <NumRow label="기본 가동률" tip="팀 capacity 계산: 인원 × 8h × 이 비율. 회의·대기 제외." value={Math.round(config.defaultUtilization * 100)} onChange={(v) => update('defaultUtilization', v / 100)} min={10} max={100} step={5} unit="%" />
                <NumRow label="ETA-공수 격차 임계" tip="이 비율 이상 격차 시 경고 표시." value={Math.round(config.etaEffortGapThreshold * 100)} onChange={(v) => update('etaEffortGapThreshold', v / 100)} min={10} max={80} step={5} unit="%" />
                <NumRow label="SP 커버리지 임계" tip="이 미만이면 SP 기반 공수 추정 비활성." value={Math.round(config.spCoverageThreshold * 100)} onChange={(v) => update('spCoverageThreshold', v / 100)} min={10} max={100} step={5} unit="%" />
                <NumRow label="Worklog 커버리지 임계" tip="이 미만이면 Worklog 기반 공수 추정 비활성." value={Math.round(config.worklogCoverageThreshold * 100)} onChange={(v) => update('worklogCoverageThreshold', v / 100)} min={10} max={100} step={5} unit="%" />
            </div>
        </div>
    );
}
