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
import { useEpicMappingStore } from '@/stores/epicMappingStore';

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
        queryFn: async (): Promise<DefectKpiDeveloperRow[]> => {
            const extra = [workerFieldId, severityFieldId].filter(Boolean) as string[];
            // H1: 매핑별 fetch를 병렬 처리 (이전: 순차)
            const pairLists = await Promise.all(
                mappings.map(async (m) => {
                    const [devIssues, defectIssues] = await Promise.all([
                        jiraApi.getIssuesForEpic(m.devEpicKey, undefined, extra),
                        jiraApi.getIssuesForEpic(m.defectEpicKey, undefined, extra),
                    ]);
                    return aggregateDefectKpiForPair(
                        devIssues,
                        defectIssues,
                        workerFieldId!,
                        severityFieldId
                    );
                })
            );
            return mergeDefectKpiRows(pairLists);
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
        rows: query.data ?? [],
        isLoading: fieldsLoading || query.isLoading,
        isFetching: query.isFetching,
        error: query.error,
        refetch: query.refetch,
        workerFieldResolved: !!workerFieldId,
        defectSeverityFieldResolved: !!severityFieldId,
        mappingCount: mappings.length,
    };
}
