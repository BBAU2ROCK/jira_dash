import { Input } from '@/components/ui/input';
import { InfoTip } from '@/components/ui/info-tip';
import type { KpiRuleSet } from '@/stores/kpiRulesStore';

interface Props {
    labels: KpiRuleSet['labels'];
    statusNames: KpiRuleSet['statusNames'];
    fields: KpiRuleSet['fields'];
    onLabelsChange: (labels: KpiRuleSet['labels']) => void;
    onStatusNamesChange: (statusNames: KpiRuleSet['statusNames']) => void;
    onFieldsChange: (fields: KpiRuleSet['fields']) => void;
}

function FieldRow({ label, tip, value, onChange }: { label: string; tip: string; value: string; onChange: (v: string) => void }) {
    return (
        <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
            <label className="text-xs text-slate-600 flex items-center gap-1">
                {label}
                <InfoTip>{tip}</InfoTip>
            </label>
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-7 text-xs font-mono"
            />
        </div>
    );
}

export function JiraFieldsEditor({ labels, statusNames, fields, onLabelsChange, onStatusNamesChange, onFieldsChange }: Props) {
    return (
        <div className="space-y-4">
            <div>
                <div className="text-sm font-semibold text-slate-800 mb-2">Jira 라벨</div>
                <div className="space-y-1.5">
                    <FieldRow label="합의지연" tip="이 라벨이 있는 이슈는 KPI 분모/분자에서 제외." value={labels.agreedDelay} onChange={(v) => onLabelsChange({ ...labels, agreedDelay: v })} />
                    <FieldRow label="검증지연" tip="이 라벨이 있으면 지연이어도 준수로 흡수." value={labels.verificationDelay} onChange={(v) => onLabelsChange({ ...labels, verificationDelay: v })} />
                </div>
            </div>
            <div>
                <div className="text-sm font-semibold text-slate-800 mb-2">Jira 상태 이름</div>
                <div className="space-y-1.5">
                    <FieldRow label="보류" tip="이 status name의 이슈는 '보류'로 분류. ETA에서 제외." value={statusNames.onHold} onChange={(v) => onStatusNamesChange({ ...statusNames, onHold: v })} />
                    <FieldRow label="취소" tip="이 status name의 이슈는 '취소'로 분류. 백로그에서 제외." value={statusNames.cancelled} onChange={(v) => onStatusNamesChange({ ...statusNames, cancelled: v })} />
                </div>
            </div>
            <div>
                <div className="text-sm font-semibold text-slate-800 mb-2">커스텀 필드 ID</div>
                <div className="space-y-1.5">
                    <FieldRow label="Story Point" tip="Jira의 SP 커스텀 필드 ID." value={fields.storyPoint} onChange={(v) => onFieldsChange({ ...fields, storyPoint: v })} />
                    <FieldRow label="난이도" tip="이슈 난이도 (상/중/하) 커스텀 필드 ID." value={fields.difficulty} onChange={(v) => onFieldsChange({ ...fields, difficulty: v })} />
                    <FieldRow label="계획 시작" tip="계획 시작일 커스텀 필드 ID." value={fields.plannedStart} onChange={(v) => onFieldsChange({ ...fields, plannedStart: v })} />
                    <FieldRow label="실제 시작" tip="실제 시작일 커스텀 필드 ID." value={fields.actualStart} onChange={(v) => onFieldsChange({ ...fields, actualStart: v })} />
                    <FieldRow label="실제 완료" tip="실제 완료일 커스텀 필드 ID. resolutiondate보다 우선 사용." value={fields.actualDone} onChange={(v) => onFieldsChange({ ...fields, actualDone: v })} />
                </div>
            </div>
        </div>
    );
}
