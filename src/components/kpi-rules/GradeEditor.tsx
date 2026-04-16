import { Input } from '@/components/ui/input';
import { InfoTip } from '@/components/ui/info-tip';
import type { GradeThresholds } from '@/stores/kpiRulesStore';

interface Props {
    title: string;
    tip: string;
    grades: GradeThresholds;
    /** true면 "이하" 기준 (결함 등급: S ≤ 5%), false면 "이상" 기준 (KPI: S ≥ 95%) */
    invertLabel?: boolean;
    onChange: (grades: GradeThresholds) => void;
}

const GRADE_KEYS: (keyof GradeThresholds)[] = ['S', 'A', 'B', 'C'];
const GRADE_COLOR: Record<string, string> = {
    S: 'border-purple-300 bg-purple-50',
    A: 'border-green-300 bg-green-50',
    B: 'border-blue-300 bg-blue-50',
    C: 'border-amber-300 bg-amber-50',
};

export function GradeEditor({ title, tip, grades, invertLabel, onChange }: Props) {
    const symbol = invertLabel ? '≤' : '≥';
    const unit = invertLabel ? '%' : '%';

    const handleChange = (key: keyof GradeThresholds, value: string) => {
        const num = parseFloat(value);
        if (isNaN(num)) return;
        onChange({ ...grades, [key]: num });
    };

    return (
        <div>
            <div className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1">
                {title}
                <InfoTip>{tip}</InfoTip>
            </div>
            <div className="grid grid-cols-4 gap-2">
                {GRADE_KEYS.map((key) => (
                    <div key={key} className={`rounded-lg border p-2 ${GRADE_COLOR[key]}`}>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                            {key} {symbol}
                        </label>
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                value={grades[key]}
                                onChange={(e) => handleChange(key, e.target.value)}
                                className="h-8 text-sm text-center bg-white"
                                min={0}
                                max={100}
                                step={1}
                            />
                            <span className="text-xs text-slate-500">{unit}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
