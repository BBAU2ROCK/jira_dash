import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { type DefectKpiDeveloperRow } from '@/lib/defect-kpi-utils';
import { DEFECT_KPI_CONFIG } from '@/config/defectKpiConfig';
import { BarChart3, RefreshCw, AlertCircle } from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';

interface DefectKpiDashboardProps {
    open: boolean;
    onClose: () => void;
    rows: DefectKpiDeveloperRow[];
    isLoading: boolean;
    error: Error | null;
    workerFieldResolved: boolean;
    /** false이면 Jira「결함 심각도」필드 id 미매칭(우선순위로 대체하지 않음) */
    defectSeverityFieldResolved?: boolean;
    mappingCount: number;
    onRefresh: () => void;
}

export function DefectKpiDashboard({
    open,
    onClose,
    rows,
    isLoading,
    error,
    workerFieldResolved,
    defectSeverityFieldResolved = true,
    mappingCount,
    onRefresh,
}: DefectKpiDashboardProps) {
    const chartData = React.useMemo(
        () =>
            rows.map((r) => ({
                name: r.displayName.length > 12 ? `${r.displayName.slice(0, 12)}…` : r.displayName,
                fullName: r.displayName,
                결함: r.defectCount,
                비율: r.defectRatePercent ?? 0,
                등급: r.grade,
            })),
        [rows]
    );

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        개발자별 결함 KPI (담당 이슈 대비 결함·심각도)
                    </DialogTitle>
                    <DialogDescription asChild>
                        <div className="text-sm text-muted-foreground space-y-1 pt-1">
                            <p>
                                산식: <strong>(결함 등록 건수 ÷ 담당 개발 이슈 수) × 100</strong> — 개발 이슈는 매핑된
                                개발 에픽 하위 <strong>리프 이슈</strong>의 담당자(assignee) 기준 건수입니다.
                            </p>
                            <p>
                                결함 건수: 매핑된 결함 에픽 하위 리프 중「작업자」가 해당 개발자와 일치하는{' '}
                                <strong>전체 결함</strong>입니다. 표의 심각도 분포는 Jira 필드{' '}
                                <strong>「결함 심각도」</strong> 커스텀 필드만 사용합니다(우선순위와 별개).
                            </p>
                            <p>
                                결함 측 담당: Jira 필드 <strong>「작업자」</strong> (필드 id는 /field API로 자동
                                매칭).
                            </p>
                            <p>
                                등급: S ≤5%, A ≤10%, B ≤15%, C ≤20%, D 그 외 (
                                {DEFECT_KPI_CONFIG.DEFECT_PROJECT_KEY_HINT} 결함 에픽과 개발 에픽 매핑 필요).
                            </p>
                        </div>
                    </DialogDescription>
                </DialogHeader>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => onRefresh()} disabled={isLoading}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        새로고침
                    </Button>
                </div>

                {mappingCount === 0 && (
                    <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <AlertCircle className="h-5 w-5 shrink-0" />
                        에픽 매핑이 없습니다. 프로젝트 통계 → KPI 성과 → 결함 KPI 아래「개발 ↔ 결함 에픽 매핑」에서
                        등록하세요.
                    </div>
                )}

                {mappingCount > 0 && !workerFieldResolved && !isLoading && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                        <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                        Jira에「작업자」이름의 필드를 찾지 못했습니다. 인스턴스 필드명을
                        defectKpiConfig.ts의 WORKER_FIELD_NAMES에 맞게 추가하세요.
                    </div>
                )}

                {mappingCount > 0 && workerFieldResolved && !defectSeverityFieldResolved && !isLoading && (
                    <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <AlertCircle className="h-5 w-5 shrink-0" />
                        「결함 심각도」커스텀 필드 id를 찾지 못했습니다. 차트는「필드 미연결」만 표시됩니다.
                        DEFECT_SEVERITY_FIELD_NAMES·Jira 필드 이름을 확인하세요(우선순위와 별개).
                    </div>
                )}

                {error && (
                    <div className="text-sm text-destructive">
                        {(error as Error).message || '데이터를 불러오지 못했습니다.'}
                    </div>
                )}

                {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">불러오는 중…</p>}

                {!isLoading && rows.length > 0 && (
                    <>
                        <div className="h-[280px] w-full mt-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fontSize: 11 }}
                                        angle={-25}
                                        textAnchor="end"
                                        height={60}
                                    />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        formatter={(value, name) => [value ?? 0, name]}
                                        labelFormatter={(_, p) =>
                                            (p?.[0]?.payload as { fullName?: string })?.fullName ?? ''
                                        }
                                    />
                                    <Legend />
                                    <Bar dataKey="결함" fill="#ef4444" name="결함 등록 건수" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="border rounded-lg overflow-x-auto text-sm">
                            <table className="w-full min-w-[640px]">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="text-left p-2 font-medium">담당자</th>
                                        <th className="text-right p-2 font-medium whitespace-nowrap">담당 개발 이슈</th>
                                        <th className="text-right p-2 font-medium whitespace-nowrap">결함 등록</th>
                                        <th className="text-right p-2 font-medium whitespace-nowrap">비율 %</th>
                                        <th className="text-left p-2 font-medium min-w-[160px]">결함 심각도별 건수</th>
                                        <th className="text-center p-2 font-medium">등급</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.key} className="border-t">
                                            <td className="p-2">{r.displayName}</td>
                                            <td className="p-2 text-right tabular-nums">{r.devIssueCount}</td>
                                            <td className="p-2 text-right tabular-nums text-red-600 font-medium">
                                                {r.defectCount}
                                            </td>
                                            <td className="p-2 text-right tabular-nums">
                                                {r.defectRatePercent != null ? `${r.defectRatePercent}%` : '—'}
                                            </td>
                                            <td className="p-2 align-top">
                                                {r.severityBreakdown.length === 0 ? (
                                                    <span className="text-muted-foreground">—</span>
                                                ) : (
                                                    <ul className="text-xs space-y-0.5">
                                                        {r.severityBreakdown.map((s) => (
                                                            <li
                                                                key={s.name}
                                                                className="flex justify-between gap-3 tabular-nums"
                                                            >
                                                                <span className="truncate max-w-[120px]" title={s.name}>
                                                                    {s.name}
                                                                </span>
                                                                <span className="shrink-0 font-medium">{s.count}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </td>
                                            <td className="p-2 text-center font-bold">{r.grade}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {!isLoading && mappingCount > 0 && workerFieldResolved && rows.length === 0 && !error && (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                        집계 결과가 없습니다. 매핑된 개발·결함 에픽에 리프 이슈와 결함「작업자」지정이 있는지
                        확인하세요.
                    </p>
                )}

                <div className="flex justify-end pt-2">
                    <Button variant="outline" onClick={onClose}>
                        닫기
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
