import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { jiraApi, type JiraIssue } from '@/api/jiraClient';
import {
    aggregateDefectKpiForPair,
    extractWorkerPerson,
    mergeDefectKpiRows,
    personKeyFromAssignee,
    resolveDefectSeverityFieldId,
    resolveWorkerFieldId,
    type DefectKpiDeveloperRow,
} from '@/lib/defect-kpi-utils';
import { filterLeafIssues } from '@/lib/jira-helpers';
import { useEpicMappingStore } from '@/stores/epicMappingStore';
import { parseLocalDay, startOfKoreanWeek, dayKey } from '@/lib/date-utils';
import { addDays } from 'date-fns';
import { classifyTrend } from '@/services/retrospective/defectInsights';

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

    // v1.0.12 F3-1 — 심도 분석 필드
    /** 결함 이슈의 issuetype.name 분포 */
    typeBreakdown: Array<{ name: string; count: number }>;
    /** 주간 결함 발생 추이 (최근 12주, 오래된 순) */
    weeklyTrend: Array<{ weekStart: string; count: number }>;
    /** 트렌드 방향 — classifyTrend 결과 */
    trendDirection: 'improving' | 'stable' | 'worsening' | 'insufficient';
    /** 결함 집중 담당자 (상위 3명) — worker 필드 기준, 없으면 assignee */
    topAffectedPeople: Array<{ name: string; count: number; pctOfEpic: number }>;
}

/** 결함 이슈 배열 → 주간 추이 (최근 12주) */
function buildWeeklyTrend(defectLeaf: JiraIssue[], now: Date): Array<{ weekStart: string; count: number }> {
    const weekMap = new Map<string, number>();
    const earliest = addDays(now, -7 * 12);
    for (const issue of defectLeaf) {
        const created = parseLocalDay(issue.fields.created);
        if (!created || created < earliest || created > now) continue;
        const wkStart = startOfKoreanWeek(created);
        const key = dayKey(wkStart) ?? '';
        if (!key) continue;
        weekMap.set(key, (weekMap.get(key) ?? 0) + 1);
    }
    // 12주 모두 포함 (count=0 포함) — 시각화 시 빈 주 표시
    const result: Array<{ weekStart: string; count: number }> = [];
    for (let i = 11; i >= 0; i--) {
        const weekDate = startOfKoreanWeek(addDays(now, -7 * i));
        const key = dayKey(weekDate) ?? '';
        if (key) result.push({ weekStart: key, count: weekMap.get(key) ?? 0 });
    }
    return result;
}

/** 결함 이슈 배열 → 타입 분포 */
function buildTypeBreakdown(defectLeaf: JiraIssue[]): Array<{ name: string; count: number }> {
    const map = new Map<string, number>();
    for (const issue of defectLeaf) {
        const name = issue.fields.issuetype?.name ?? '(미분류)';
        map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
}

/** 결함 이슈 배열 → 집중 담당자 (worker 우선, 없으면 assignee) */
function buildTopAffectedPeople(
    defectLeaf: JiraIssue[],
    workerFieldId: string
): Array<{ name: string; count: number; pctOfEpic: number }> {
    const total = defectLeaf.length;
    if (total === 0) return [];
    const map = new Map<string, { name: string; count: number }>();
    for (const issue of defectLeaf) {
        // worker 우선
        const worker = extractWorkerPerson(issue, workerFieldId);
        const person = worker ?? (issue.fields.assignee ? personKeyFromAssignee(issue) : null);
        if (!person) continue;
        const prev = map.get(person.key) ?? { name: person.label, count: 0 };
        map.set(person.key, { name: prev.name || person.label, count: prev.count + 1 });
    }
    return Array.from(map.values())
        .map((p) => ({ ...p, pctOfEpic: Math.round((p.count / total) * 100) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
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
                    // v1.0.12 F3-1: 심도 분석 필드 생성
                    const now = new Date();
                    const weeklyTrend = buildWeeklyTrend(defectLeaf, now);
                    const typeBreakdown = buildTypeBreakdown(defectLeaf);
                    const topAffectedPeople = workerFieldId
                        ? buildTopAffectedPeople(defectLeaf, workerFieldId)
                        : [];
                    const trendDirection = classifyTrend(weeklyTrend);

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
                        typeBreakdown,
                        weeklyTrend,
                        trendDirection,
                        topAffectedPeople,
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
