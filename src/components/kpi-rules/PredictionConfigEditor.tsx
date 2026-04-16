import { Input } from '@/components/ui/input';
import { InfoTip } from '@/components/ui/info-tip';
import type { KpiRuleSet } from '@/stores/kpiRulesStore';

type PredConfig = KpiRuleSet['prediction'];

interface Props {
    config: PredConfig;
    onChange: (config: PredConfig) => void;
}

function NumRow({ label, tip, value, onChange, min, max, step, unit }: {
    label: string; tip: string; value: number; onChange: (v: number) => void;
    min?: number; max?: number; step?: number; unit?: string;
}) {
    return (
        <div className="grid grid-cols-[180px_1fr] gap-2 items-center">
            <label className="text-xs text-slate-600 flex items-center gap-1">
                {label}
                <InfoTip>{tip}</InfoTip>
            </label>
            <div className="flex items-center gap-1">
                <Input
                    type="number"
                    value={value}
                    onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        if (!isNaN(n)) onChange(n);
                    }}
                    className="h-7 text-xs w-24"
                    min={min}
                    max={max}
                    step={step}
                />
                {unit && <span className="text-xs text-slate-500">{unit}</span>}
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
