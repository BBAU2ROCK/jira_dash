import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { jiraApi } from '@/api/jiraClient';
import {
    aggregateDefectKpiForPair,
    mergeDefectKpiRows,
    resolveDefectSeverityFieldId,
    resolveWorkerFieldId,
    type DefectKpiDeveloperRow,
} from '@/lib/defect-kpi-utils';
import { filterLeafIssues } from '@/lib/jira-helpers';
import { useEpicMappingStore } from '@/stores/epicMappingStore';

/** 매핑된 단일 dev 에픽의 결함 통계 (회고에서 에픽별 결함 표시용) */
export interface DefectStatsByDevEpic {
    devEpicKey: string;
    defectEpicKey: string;
    /** dev 에픽의 leaf task 수 */
    devTaskCount: number;
    /** 결함 에픽의 leaf 결함 수 */
    defectCount: number;
    /** task 당 결함율 (%) */
    defectsPerTaskPct: number;
    /** 결함 심각도 분포 (담당자 기준 합계) */
    severityBreakdown: Array<{ name: string; count: number }>;
    /** 결함 담당자별 row */
    perAssignee: DefectKpiDeveloperRow[];
}

export function useDefectKpiAggregation() {
    const mappings = useEpicMappingStore((s) => s.mappings);

    const { data: fields = [], isLoading: fieldsLoading } = useQuery({
        queryKey: ['jiraFields'],
        queryFn: () => jiraApi.getFields(),
        enabled: mappings.length > 0,
        staleTime: 15 * 60 * 1000,
    });

    const workerFieldId = resolveWorkerFieldId(fields as Array<{ id: string; name: string }>);
    const severityFieldId = resolveDefectSeverityFieldId(fields as Array<{ id: string; name: string }>);

    const query = useQuery({
        queryKey: ['defect-kpi', mappings, workerFieldId, severityFieldId],
        enabled: mappings.length > 0 && !!workerFieldId,
        queryFn: async (): Promise<{
            merged: DefectKpiDeveloperRow[];
            byDevEpic: Map<string, DefectStatsByDevEpic>;
        }> => {
            const extra = [workerFieldId, severityFieldId].filter(Boolean) as string[];
            // H1: 매핑별 fetch를 병렬 처리
            const perMapping = await Promise.all(
                mappings.map(async (m) => {
                    const [devIssues, defectIssues] = await Promise.all([
                        jiraApi.getIssuesForEpic(m.devEpicKey, undefined, extra),
                        jiraApi.getIssuesForEpic(m.defectEpicKey, undefined, extra),
                    ]);
                    const perAssignee = aggregateDefectKpiForPair(
                        devIssues,
                        defectIssues,
                        workerFieldId!,
                        severityFieldId
                    );
                    const devLeaf = filterLeafIssues(devIssues);
                    const defectLeaf = filterLeafIssues(defectIssues);
                    // severity 합계
                    const sevMap = new Map<string, number>();
                    for (const row of perAssignee) {
                        for (const s of row.severityBreakdown) {
                            sevMap.set(s.name, (sevMap.get(s.name) ?? 0) + s.count);
                        }
                    }
                    const stats: DefectStatsByDevEpic = {
                        devEpicKey: m.devEpicKey,
                        defectEpicKey: m.defectEpicKey,
                        devTaskCount: devLeaf.length,
                        defectCount: defectLeaf.length,
                        defectsPerTaskPct: devLeaf.length > 0
                            ? +(Math.round((defectLeaf.length / devLeaf.length) * 1000) / 10).toFixed(1)
                            : 0,
                        severityBreakdown: Array.from(sevMap.entries())
                            .map(([name, count]) => ({ name, count }))
                            .sort((a, b) => b.count - a.count),
                        perAssignee,
                    };
                    return { perAssigneeRows: perAssignee, stats };
                })
            );
            const byDevEpic = new Map<string, DefectStatsByDevEpic>();
            for (const r of perMapping) {
                byDevEpic.set(r.stats.devEpicKey, r.stats);
            }
            const merged = mergeDefectKpiRows(perMapping.map((r) => r.perAssigneeRows));
            return { merged, byDevEpic };
        },
        staleTime: 2 * 60 * 1000,
    });

    // 에러 발생 시 1회만 토스트
    useEffect(() => {
        if (query.error) {
            const msg = query.error instanceof Error ? query.error.message : '결함 KPI 조회 실패';
            toast.error(`결함 KPI 조회 실패: ${msg}`);
        }
    }, [query.error]);

    return {
        rows: query.data?.merged ?? [],
        defectStatsByDevEpic: query.data?.byDevEpic ?? new Map<string, DefectStatsByDevEpic>(),
        isLoading: fieldsLoading || query.isLoading,
        isFetching: query.isFetching,
        error: query.error,
        refetch: query.refetch,
        workerFieldResolved: !!workerFieldId,
        defectSeverityFieldResolved: !!severityFieldId,
        mappingCount: mappings.length,
    };
}
