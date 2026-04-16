import { Input } from '@/components/ui/input';
import { InfoTip } from '@/components/ui/info-tip';
import type { KpiWeights } from '@/stores/kpiRulesStore';

interface Props {
    weights: KpiWeights;
    onChange: (weights: KpiWeights) => void;
}

export function WeightEditor({ weights, onChange }: Props) {
    const sum = Math.round((weights.completion + weights.compliance) * 100);
    const isValid = Math.abs(sum - 100) <= 1;

    const handleChange = (key: keyof KpiWeights, value: string) => {
        const num = parseFloat(value) / 100;
        if (isNaN(num)) return;
        onChange({ ...weights, [key]: Math.max(0, Math.min(1, num)) });
    };

    return (
        <div>
            <div className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1">
                KPI 가중치
                <InfoTip>총점 = 완료율 × 가중치 + 준수율 × 가중치 + 조기 보너스. 합이 100%여야 합니다.</InfoTip>
            </div>
            <div className="grid grid-cols-3 gap-2 items-end">
                <div>
                    <label className="text-xs text-slate-600 block mb-1">완료율</label>
                    <div className="flex items-center gap-1">
                        <Input
                            type="number"
                            value={Math.round(weights.completion * 100)}
                            onChange={(e) => handleChange('completion', e.target.value)}
                            className="h-8 text-sm text-center"
                            min={0}
                            max={100}
                            step={5}
                        />
                        <span className="text-xs text-slate-500">%</span>
                    </div>
                </div>
                <div>
                    <label className="text-xs text-slate-600 block mb-1">준수율</label>
                    <div className="flex items-center gap-1">
                        <Input
                            type="number"
                            value={Math.round(weights.compliance * 100)}
                            onChange={(e) => handleChange('compliance', e.target.value)}
                            className="h-8 text-sm text-center"
                            min={0}
                            max={100}
                            step={5}
                        />
                        <span className="text-xs text-slate-500">%</span>
                    </div>
                </div>
                <div className="text-center pb-1">
                    <span className={`text-sm font-bold ${isValid ? 'text-green-700' : 'text-red-600'}`}>
                        합계 {sum}%
                    </span>
                    {!isValid && <div className="text-[10px] text-red-500">100% 필요</div>}
                </div>
            </div>
        </div>
    );
}
