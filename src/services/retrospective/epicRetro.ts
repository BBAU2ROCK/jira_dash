/**
 * 완료/진행 에픽 회고 분석.
 *
 * Phase 0 측정: IGMU 완료 에픽 0개 → "완료된 에픽만"이 아닌 "선택 에픽 안의 완료 task" 회고.
 * 활성 에픽이라도 그 안의 완료 task 통계는 회고 가치 있음.
 *
 * 결함 통계는 epicMappingStore에 매핑이 있을 때만 산출 (별도 fetch 필요).
 */

import { differenceInDays } from 'date-fns';
import type { JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues, getStatusCategoryKey } from '@/lib/jira-helpers';
import { parseLocalDay } from '@/lib/date-utils';
import { calculateKPI } from '@/services/kpiService';
import { personKeyFromAssignee } from '@/lib/defect-kpi-utils';
import type { EpicRetroSummary, EpicComparisonRow, DeveloperStrengthRow } from './types';

function isDone(issue: JiraIssue): boolean {
    return getStatusCategoryKey(issue) === 'done';
}

function isInProgress(issue: JiraIssue): boolean {
    return getStatusCategoryKey(issue) === 'indeterminate';
}

function getEpicKey(issue: JiraIssue): string | null {
    // Jira의 epic link는 customfield 또는 parent. 우리는 parent.key 사용 (subtask가 아닌 task의 parent = epic)
    const parentKey = issue.fields.parent?.key;
    if (parentKey) return parentKey;
    return null;
}

function cycleTimeDays(issue: JiraIssue): number | null {
    const created = parseLocalDay(issue.fields.created);
    const done = parseLocalDay(issue.fields.resolutiondate ?? null);
    if (!created || !done || done < created) return null;
    return Math.max(differenceInDays(done, created), 1);
}

function isOnTime(issue: JiraIssue): boolean {
    const due = parseLocalDay(issue.fields.duedate ?? null);
    const done = parseLocalDay(issue.fields.resolutiondate ?? null);
    if (!due || !done) return true; // 마감일 없으면 준수로 간주 (KPI 룰과 동일)
    const dueEnd = new Date(due);
    dueEnd.setHours(23, 59, 59, 999);
    return done <= dueEnd;
}

function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

/**
 * 단일 에픽 회고 통계.
 *
 * @param epic 에픽 이슈 자체 (상태·summary 추출용)
 * @param tasks 그 에픽 안의 task들 (parent.key 기준 필터된)
 */
export function buildEpicRetroSummary(epic: JiraIssue, tasks: JiraIssue[]): EpicRetroSummary {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(isDone).length;
    const inProgressTasks = tasks.filter(isInProgress).length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const completed = tasks.filter(isDone);
    const onTimeCount = completed.filter(isOnTime).length;
    const onTimeRate = completed.length > 0 ? Math.round((onTimeCount / completed.length) * 100) : 0;

    const cycleTimes = completed.map(cycleTimeDays).filter((v): v is number => v != null);
    const avgCycleTimeDays = cycleTimes.length > 0
        ? +(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length).toFixed(1)
        : 0;
    const p85CycleTimeDays = +percentile(cycleTimes, 85).toFixed(1);

    // KPI 점수 (kpiService 재사용)
    const kpi = calculateKPI(tasks);

    // 담당자별 분포 (프로젝트 현황 탭과 동일 수준 분해)
    const contributorMap = new Map<string, {
        displayName: string;
        taskCount: number;
        completedCount: number;
        inProgressCount: number;
        todoCount: number;
        delayedCount: number;
    }>();
    for (const t of tasks) {
        if (!t.fields.assignee) continue;
        const { key, label } = personKeyFromAssignee(t);
        const prev = contributorMap.get(key) ?? {
            displayName: label, taskCount: 0, completedCount: 0,
            inProgressCount: 0, todoCount: 0, delayedCount: 0,
        };
        prev.taskCount++;
        if (isDone(t)) {
            prev.completedCount++;
        } else if (isInProgress(t)) {
            prev.inProgressCount++;
        } else {
            prev.todoCount++;
        }
        // 지연 (미완료 + due 초과)
        if (!isDone(t)) {
            const due = parseLocalDay(t.fields.duedate ?? null);
            if (due && due < new Date()) prev.delayedCount++;
        }
        if (!prev.displayName || prev.displayName === key) prev.displayName = label;
        contributorMap.set(key, prev);
    }
    const contributors = Array.from(contributorMap.entries())
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.taskCount - a.taskCount);

    // 에픽 lead time
    const epicCreated = parseLocalDay(epic.fields.created);
    const lastDoneTask = completed
        .map((t) => parseLocalDay(t.fields.resolutiondate ?? null))
        .filter((d): d is Date => d != null)
        .reduce<Date | null>((max, d) => (max == null || d > max ? d : max), null);
    const epicLeadTimeDays = epicCreated && lastDoneTask
        ? Math.max(differenceInDays(lastDoneTask, epicCreated), 0)
        : null;

    return {
        epicKey: epic.key,
        epicSummary: epic.fields.summary ?? epic.key,
        epicStatus: isDone(epic) ? 'done' : isInProgress(epic) ? 'in-progress' : 'unknown',
        totalTasks,
        completedTasks,
        inProgressTasks,
        completionRate,
        onTimeRate,
        avgCycleTimeDays,
        p85CycleTimeDays,
        kpiScore: kpi.totalScore,
        kpiGrade: kpi.grades.total,
        contributors,
        epicLeadTimeDays,
    };
}

/**
 * 다중 에픽 비교 — 평균 대비 delta 계산.
 */
export function buildEpicComparison(summaries: EpicRetroSummary[]): EpicComparisonRow[] {
    if (summaries.length === 0) return [];
    const avg = {
        completionRate: summaries.reduce((s, e) => s + e.completionRate, 0) / summaries.length,
        onTimeRate: summaries.reduce((s, e) => s + e.onTimeRate, 0) / summaries.length,
        avgCycleTime: summaries.reduce((s, e) => s + e.avgCycleTimeDays, 0) / summaries.length,
        kpiScore: summaries.reduce((s, e) => s + e.kpiScore, 0) / summaries.length,
    };
    return summaries.map((e) => ({
        ...e,
        deltaFromAvg: {
            completionRate: +(e.completionRate - avg.completionRate).toFixed(1),
            onTimeRate: +(e.onTimeRate - avg.onTimeRate).toFixed(1),
            avgCycleTime: +(e.avgCycleTimeDays - avg.avgCycleTime).toFixed(1),
            kpiScore: +(e.kpiScore - avg.kpiScore).toFixed(1),
        },
    }));
}

/**
 * 개발자 강점 매트릭스 — 인원 × type cycle time.
 *
 * assignedTasks = 그 인원의 전체 leaf task (프로젝트 현황과 동일 카운트)
 * completedTasks = 완료 task (cycle time 산출 대상)
 */
export function buildDeveloperStrengthMatrix(tasks: JiraIssue[]): DeveloperStrengthRow[] {
    // 인원별 전체 task 수 (카운트 일관성 — 프로젝트 현황과 동일)
    const assignedCount = new Map<string, { displayName: string; count: number }>();
    for (const t of tasks) {
        if (!t.fields.assignee) continue;
        const { key, label } = personKeyFromAssignee(t);
        const prev = assignedCount.get(key) ?? { displayName: label, count: 0 };
        prev.count++;
        if (!prev.displayName || prev.displayName === key) prev.displayName = label;
        assignedCount.set(key, prev);
    }

    // 완료 task만 cycle time 분석 (type별)
    const completedMap = new Map<string, { displayName: string; byType: Map<string, { count: number; sumCT: number }> }>();
    for (const t of tasks) {
        if (!isDone(t)) continue;
        if (!t.fields.assignee) continue;
        const ct = cycleTimeDays(t);
        if (ct == null) continue;
        const { key, label } = personKeyFromAssignee(t);
        const typeName = t.fields.issuetype?.name ?? '(unknown)';
        const personEntry = completedMap.get(key) ?? { displayName: label, byType: new Map() };
        if (!personEntry.displayName || personEntry.displayName === key) personEntry.displayName = label;
        const typeEntry = personEntry.byType.get(typeName) ?? { count: 0, sumCT: 0 };
        typeEntry.count++;
        typeEntry.sumCT += ct;
        personEntry.byType.set(typeName, typeEntry);
        completedMap.set(key, personEntry);
    }

    // 모든 인원 합산 (assigned에 있지만 completed에 없는 인원도 포함)
    const allKeys = new Set([...assignedCount.keys(), ...completedMap.keys()]);
    const rows: DeveloperStrengthRow[] = [];
    for (const key of allKeys) {
        const assigned = assignedCount.get(key);
        const completed = completedMap.get(key);
        const byTypeMap = new Map<string, { count: number; avgCycleTimeDays: number }>();
        let completedTotal = 0;
        if (completed) {
            for (const [type, t] of completed.byType) {
                byTypeMap.set(type, { count: t.count, avgCycleTimeDays: +(t.sumCT / t.count).toFixed(1) });
                completedTotal += t.count;
            }
        }
        rows.push({
            key,
            displayName: assigned?.displayName ?? completed?.displayName ?? key,
            assignedTasks: assigned?.count ?? 0,
            completedTasks: completedTotal,
            byType: byTypeMap,
        });
    }
    return rows.sort((a, b) => b.assignedTasks - a.assignedTasks);
}

/** 외부에서 주입할 에픽별 결함 통계 (useDefectKpiAggregation 결과의 일부) */
export interface DefectStatsLite {
    defectCount: number;
    defectsPerTaskPct: number;
    severityBreakdown: Array<{ name: string; count: number }>;
}

/**
 * 사이드바에서 선택된 에픽들과 그 안의 task들로부터 회고 데이터 산출.
 *
 * @param issues dashboard에서 fetch된 모든 이슈 (에픽 + 그 안의 task들)
 * @param selectedEpicKeys 사이드바에서 선택된 에픽 키 목록
 * @param defectStatsByDevEpic 매핑된 dev 에픽별 결함 통계 (useDefectKpiAggregation 결과)
 */
export function analyzeEpicsRetrospective(
    issues: JiraIssue[],
    selectedEpicKeys: string[],
    defectStatsByDevEpic?: Map<string, DefectStatsLite>
): { perEpic: EpicRetroSummary[]; comparison: EpicComparisonRow[]; strengthMatrix: DeveloperStrengthRow[] } {
    // 에픽 객체 vs task 분리
    // ✱ 중요: 프로젝트 현황 탭과 동일하게 filterLeafIssues 적용 — 부모(할 일)+하위 작업 둘 다
    //   카운트되어 한 사람이 중복으로 잡히는 문제 방지. 룰: "할 일만 있으면 카운트, 하위 있으면 부모 제외".
    const epicByKey = new Map<string, JiraIssue>();
    const allNonEpicTasks: JiraIssue[] = [];

    for (const issue of issues) {
        if (selectedEpicKeys.includes(issue.key)) {
            epicByKey.set(issue.key, issue);
        } else {
            allNonEpicTasks.push(issue);
        }
    }

    // leaf 적용 (KPI·통계 룰과 일관성)
    const leafTasks = filterLeafIssues(allNonEpicTasks);

    // 에픽별 grouping (leaf 적용된 task만)
    const tasksByEpic = new Map<string, JiraIssue[]>();
    for (const task of leafTasks) {
        const epicKey = getEpicKey(task);
        if (epicKey && selectedEpicKeys.includes(epicKey)) {
            const arr = tasksByEpic.get(epicKey) ?? [];
            arr.push(task);
            tasksByEpic.set(epicKey, arr);
        }
    }

    const perEpic: EpicRetroSummary[] = [];
    for (const epicKey of selectedEpicKeys) {
        const epic = epicByKey.get(epicKey);
        const tasks = tasksByEpic.get(epicKey) ?? [];
        const summary = !epic
            ? buildEpicRetroSummary(
                  {
                      id: epicKey,
                      key: epicKey,
                      fields: { summary: epicKey, created: '', issuetype: { name: 'Epic', iconUrl: '', subtask: false } } as unknown,
                  } as JiraIssue,
                  tasks
              )
            : buildEpicRetroSummary(epic, tasks);

        // 결함 통계 attach (매핑 있을 때만)
        const defectStats = defectStatsByDevEpic?.get(epicKey);
        if (defectStats) {
            summary.defectStats = {
                defectCount: defectStats.defectCount,
                defectsPerCompletedTask: defectStats.defectsPerTaskPct,
                severityBreakdown: defectStats.severityBreakdown,
            };
        }
        perEpic.push(summary);
    }

    const comparison = buildEpicComparison(perEpic);
    // 강점 매트릭스는 모든 task 합쳐서
    const allTasks = Array.from(tasksByEpic.values()).flat();
    const strengthMatrix = buildDeveloperStrengthMatrix(allTasks);

    return { perEpic, comparison, strengthMatrix };
}
