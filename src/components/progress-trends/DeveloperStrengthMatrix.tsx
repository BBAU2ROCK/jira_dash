import React from 'react';
import { Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { useDisplayPreferenceStore } from '@/stores/displayPreferenceStore';
import { buildAnonymizeMap, maybeAnonymize } from '@/lib/anonymize';
import type { DeveloperStrengthRow } from '@/services/retrospective/types';

interface Props {
    rows: DeveloperStrengthRow[];
}

/**
 * 인원 × type cycle time heatmap — 강점·약점 매핑.
 * 같은 type 내에서 인원별 cycle time을 색으로 비교 (낮을수록 빠름 = 강점).
 */
export function DeveloperStrengthMatrix({ rows }: Props) {
    const anonymizeMode = useDisplayPreferenceStore((s) => s.anonymizeMode);
    const anonMap = React.useMemo(
        () => buildAnonymizeMap(rows.map((r) => r.displayName)),
        [rows]
    );

    if (rows.length === 0) {
        return (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                완료 task 데이터 부족 — 강점 매트릭스 산출 불가.
            </div>
        );
    }

    // 모든 type 수집
    const allTypes = new Set<string>();
    rows.forEach((r) => r.byType.forEach((_, t) => allTypes.add(t)));
    const types = Array.from(allTypes).sort();

    // type별 min/max cycle time (heatmap 색상 정규화)
    const typeRange = new Map<string, { min: number; max: number }>();
    types.forEach((t) => {
        const values = rows
            .map((r) => r.byType.get(t)?.avgCycleTimeDays)
            .filter((v): v is number => v != null);
        if (values.length > 0) {
            typeRange.set(t, { min: Math.min(...values), max: Math.max(...values) });
        }
    });

    function cellColor(value: number, type: string): string {
        const range = typeRange.get(type);
        if (!range) return 'bg-slate-50';
        if (range.max === range.min) return 'bg-blue-100 text-blue-900'; // 단일 인원
        const ratio = (value - range.min) / (range.max - range.min);
        if (ratio < 0.33) return 'bg-green-100 text-green-900'; // 빠름 = 강점
        if (ratio < 0.67) return 'bg-amber-50 text-amber-900';
        return 'bg-red-100 text-red-900'; // 느림 = 약점
    }

    return (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2">
                <Award className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-800">개발자 강점 매트릭스 (type × cycle time)</h3>
                <span className="text-[11px] text-slate-500 ml-auto">{rows.length}명 · {types.length} 타입</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-left sticky left-0 bg-slate-50">담당자</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">전체 <InfoTip>담당 전체 leaf task 수. 프로젝트 현황·에픽 회고와 동일 카운트 규칙.</InfoTip></th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-green-700 text-right">완료 <InfoTip>cycle time 산출 대상 (완료된 task만). type별 셀의 (N)과 일치.</InfoTip></th>
                            {types.map((t) => (
                                <th key={t} scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-center min-w-[80px]">{t}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map((r) => {
                            const displayName = maybeAnonymize(r.displayName, anonMap, anonymizeMode);
                            return (
                                <tr key={r.key}>
                                    <td className="px-2 py-1.5 text-slate-800 sticky left-0 bg-white">{displayName}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{r.assignedTasks}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums text-green-700">{r.completedTasks}</td>
                                    {types.map((t) => {
                                        const cell = r.byType.get(t);
                                        if (!cell) return <td key={t} className="px-2 py-1.5 text-center text-slate-300">-</td>;
                                        return (
                                            <td
                                                key={t}
                                                className={cn('px-2 py-1.5 text-center tabular-nums text-xs font-semibold', cellColor(cell.avgCycleTimeDays, t))}
                                                title={`${cell.count}건 평균 ${cell.avgCycleTimeDays}일`}
                                            >
                                                {cell.avgCycleTimeDays}d
                                                <div className="text-[9px] font-normal opacity-70">({cell.count})</div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="px-3 py-2 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-100">
                * 색상: 초록(빠름·강점) / 노랑(중간) / 빨강(느림). type별 동일 인원 풀 안에서 정규화. 활동 task 수가 적으면 통계적 신뢰 ↓.
                <strong className="text-amber-700"> 코칭 도구 — 성과 평가 X.</strong>
            </p>
        </div>
    );
}
