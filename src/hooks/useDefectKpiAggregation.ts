import { useQuery } from '@tanstack/react-query';
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
            const pairLists: ReturnType<typeof aggregateDefectKpiForPair>[] = [];
            const extra = [workerFieldId, severityFieldId].filter(Boolean) as string[];
            for (const m of mappings) {
                const [devIssues, defectIssues] = await Promise.all([
                    jiraApi.getIssuesForEpic(m.devEpicKey, undefined, extra),
                    jiraApi.getIssuesForEpic(m.defectEpicKey, undefined, extra),
                ]);
                pairLists.push(
                    aggregateDefectKpiForPair(devIssues, defectIssues, workerFieldId!, severityFieldId)
                );
            }
            return mergeDefectKpiRows(pairLists);
        },
        staleTime: 2 * 60 * 1000,
    });

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
