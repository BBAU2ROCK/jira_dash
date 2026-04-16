import React from 'react';
import { Bug, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDisplayPreferenceStore } from '@/stores/displayPreferenceStore';
import { buildAnonymizeMap, maybeAnonymize } from '@/lib/anonymize';
import type { DefectKpiDeveloperRow } from '@/lib/defect-kpi-utils';

const GRADE_COLOR: Record<DefectKpiDeveloperRow['grade'], string> = {
    S: 'bg-purple-100 text-purple-800 border-purple-300',
    A: 'bg-green-100 text-green-800 border-green-300',
    B: 'bg-blue-100 text-blue-800 border-blue-300',
    C: 'bg-amber-100 text-amber-800 border-amber-300',
    D: 'bg-red-100 text-red-800 border-red-300',
    '—': 'bg-slate-100 text-slate-600 border-slate-300',
};

interface Props {
    rows: DefectKpiDeveloperRow[];
    isLoading?: boolean;
    mappingCount: number;
    workerFieldResolved: boolean;
}

/**
 * 회고: 담당자별 결함 발생 패턴 (Defect Density per Developer).
 *
 * 이미 KPI 성과 탭의 DefectKpiDashboard와 동일한 데이터지만, 회고 영역에서
 * 다른 회고 메트릭과 함께 보기 위해 진행 추이/예측 탭에 통합 표시.
 */
export function DefectPatternCard({ rows, isLoading, mappingCount, workerFieldResolved }: Props) {
    const anonymizeMode = useDisplayPreferenceStore((s) => s.anonymizeMode);
    const anonMap = React.useMemo(
        () => buildAnonymizeMap(rows.map((r) => r.displayName)),
        [rows]
    );

    if (mappingCount === 0) {
        return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <div>
                    <p className="font-semibold">결함 매핑 미등록</p>
                    <p className="mt-0.5 text-xs">
                        KPI 성과 탭 → 결함 KPI → 「개발 ↔ 결함 에픽 매핑」에서 등록하면
                        담당자별 task당 결함 발생률이 회고에 표시됩니다.
                    </p>
                </div>
            </div>
        );
    }

    if (!workerFieldResolved && !isLoading) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                Jira에 「작업자」 필드를 찾지 못했습니다. defectKpiConfig.ts의 WORKER_FIELD_NAMES 확인 필요.
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                결함 데이터 분석 중...
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                매핑된 에픽에 결함 데이터가 없습니다.
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2">
                <Bug className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-semibold text-slate-800">담당자별 결함 패턴 (Task당 Defect Density)</h3>
                <span className="text-[11px] text-slate-500 ml-auto">{rows.length}명</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-left">담당자</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">담당 task</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">결함</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">비율 (Defect Density)</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-left">심각도 분포</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-center">등급</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map((r) => {
                            const displayName = maybeAnonymize(r.displayName, anonMap, anonymizeMode);
                            const gradeColor = GRADE_COLOR[r.grade];
                            return (
                                <tr key={r.key} className="hover:bg-slate-50">
                                    <td className="px-2 py-1.5 text-slate-800">{displayName}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{r.devIssueCount}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums text-red-600 font-medium">{r.defectCount}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">
                                        {r.defectRatePercent != null ? `${r.defectRatePercent}%` : '—'}
                                    </td>
                                    <td className="px-2 py-1.5 align-top">
                                        {r.severityBreakdown.length === 0 ? (
                                            <span className="text-slate-400 text-xs">—</span>
                                        ) : (
                                            <ul className="text-[11px] space-y-0.5">
                                                {r.severityBreakdown.slice(0, 3).map((s) => (
                                                    <li key={s.name} className="flex justify-between gap-2 tabular-nums">
                                                        <span className="truncate max-w-[120px]">{s.name}</span>
                                                        <span className="font-medium">{s.count}</span>
                                                    </li>
                                                ))}
                                                {r.severityBreakdown.length > 3 && (
                                                    <li className="text-slate-400">+{r.severityBreakdown.length - 3}</li>
                                                )}
                                            </ul>
                                        )}
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                        <span className={cn('inline-block rounded-full border px-2 py-0.5 text-xs font-bold', gradeColor)}>
                                            {r.grade}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="px-3 py-2 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-100">
                * 산식: 결함 등록 건수 ÷ 담당 task 수 × 100. 등급: S ≤5%, A ≤10%, B ≤15%, C ≤20%, D 그 외.{' '}
                <strong className="text-amber-700">결함은 시스템 신호 — 개인 책임 추궁 X.</strong>
            </p>
        </div>
    );
}
