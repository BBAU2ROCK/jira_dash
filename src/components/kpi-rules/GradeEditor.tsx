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
    S: 'border-purple-300 dark:border-purple-900/60 bg-purple-50 dark:bg-purple-950/30',
    A: 'border-green-300 dark:border-green-900/60 bg-green-50 dark:bg-green-950/30',
    B: 'border-blue-300 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30',
    C: 'border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30',
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
            <div className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1">
                {title}
                <InfoTip>{tip}</InfoTip>
            </div>
            <div className="grid grid-cols-4 gap-2">
                {GRADE_KEYS.map((key) => (
                    <div key={key} className={`rounded-lg border p-2 ${GRADE_COLOR[key]}`}>
                        <label className="text-xs font-bold text-foreground/90 block mb-1">
                            {key} {symbol}
                        </label>
                        <div className="flex items-center gap-1">
                            <Input
                                type="number"
                                value={grades[key]}
                                onChange={(e) => handleChange(key, e.target.value)}
                                className="h-8 text-sm text-center bg-card"
                                min={0}
                                max={100}
                                step={1}
                            />
                            <span className="text-xs text-muted-foreground">{unit}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
