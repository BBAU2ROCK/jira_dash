import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InfoTip } from '@/components/ui/info-tip';
import { Plus, Trash2 } from 'lucide-react';
import type { EarlyBonusStep } from '@/stores/kpiRulesStore';

interface Props {
    steps: EarlyBonusStep[];
    onChange: (steps: EarlyBonusStep[]) => void;
}

export function EarlyBonusEditor({ steps, onChange }: Props) {
    const handleStepChange = (index: number, field: 'minRate' | 'bonus', value: string) => {
        const num = parseFloat(value);
        if (isNaN(num)) return;
        const next = [...steps];
        next[index] = { ...next[index], [field]: num };
        onChange(next);
    };

    const addStep = () => {
        const lowest = steps.length > 0 ? steps[steps.length - 1].minRate - 10 : 10;
        onChange([...steps, { minRate: Math.max(0, lowest), bonus: 0 }]);
    };

    const removeStep = (index: number) => {
        onChange(steps.filter((_, i) => i !== index));
    };

    return (
        <div>
            <div className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1">
                조기 보너스
                <InfoTip>조기완료율이 기준 이상이면 총점에 보너스 가산. 높은 기준부터 매칭.</InfoTip>
            </div>
            <div className="space-y-1.5">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-slate-500 px-1">
                    <span>조기완료율 ≥</span>
                    <span>보너스 점수</span>
                    <span className="w-8"></span>
                </div>
                {steps.map((step, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                value={step.minRate}
                                onChange={(e) => handleStepChange(i, 'minRate', e.target.value)}
                                className="h-7 text-sm text-center"
                                min={0}
                                max={100}
                            />
                            <span className="text-xs text-slate-500">%</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500">+</span>
                            <Input
                                type="number"
                                value={step.bonus}
                                onChange={(e) => handleStepChange(i, 'bonus', e.target.value)}
                                className="h-7 text-sm text-center"
                                min={0}
                                max={20}
                            />
                            <span className="text-xs text-slate-500">점</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => removeStep(i)}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                ))}
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={addStep}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                단계 추가
            </Button>
        </div>
    );
}
