import { useMemo } from 'react';
import { addDays } from 'date-fns';
import type { JiraIssue } from '@/api/jiraClient';
import { JIRA_CONFIG } from '@/config/jiraConfig';
import { filterLeafIssues, getStatusCategoryKey } from '@/lib/jira-helpers';
import {
    isToday,
    isThisWeek,
    parseLocalDay,
    dayKey,
    lastNDayKeys,
} from '@/lib/date-utils';
import {
    teamForecast,
    aggregateBacklogEffort,
    crossValidate,
    isInBacklog,
    type TeamForecast,
    type BacklogEffortReport,
    type BacklogStateCounts,
    type DailyPoint,
    type ConfidenceLevel,
} from '@/services/prediction';
import { effortReportConfidence } from '@/services/prediction/effortEstimation';
import type { CrossValidationResult } from '@/services/prediction/crossValidation';
import { useProjectIssues } from './useProjectIssues';

interface UseBacklogForecastResult {
    /** 원본 이슈 (디버깅·드릴다운 용) */
    issues: JiraIssue[];
    /** 백로그 6 카드용 카운트 */
    counts: BacklogStateCounts | null;
    /** 일별 완료 추이 (최근 N일) */
    dailySeries: DailyPoint[] | null;
    /** 팀 forecast — 3 시나리오 */
    team: TeamForecast | null;
    /** 백로그 공수 보고서 */
    effort: BacklogEffortReport | null;
    /** 공수 자체의 신뢰도 */
    effortConfidence: ConfidenceLevel | null;
    /** ETA-공수 상호 검증 */
    validation: CrossValidationResult | null;
    isLoading: boolean;
    isFetching: boolean;
    error: Error | null;
    refetch: () => void;
}

/**
 * 진행 추이/예측 탭 — 통합 forecast hook.
 * useProjectIssues + 모든 prediction service를 useMemo chain으로 조합.
 */
export function useBacklogForecast(projectKey: string, options?: {
    historyDays?: number;
    teamHeadcount?: number;
    utilization?: number;
    rngSeed?: number;
    now?: Date;
}): UseBacklogForecastResult {
    const historyDays = options?.historyDays ?? JIRA_CONFIG.PREDICTION.DEFAULT_HISTORY_DAYS;
    // now를 useMemo로 고정하여 매 렌더마다 새 Date로 인한 useMemo deps 변경 방지
    const now = useMemo(() => options?.now ?? new Date(), [options?.now]);

    const { data: issues, isLoading, isFetching, error, refetch } = useProjectIssues(projectKey);

    const counts = useMemo<BacklogStateCounts | null>(() => {
        if (!issues) return null;
        const leaf = filterLeafIssues(issues);
        const total = leaf.length;
        const active = leaf.filter(isInBacklog);
        const onHold = active.filter((i) => i.fields.status?.name === JIRA_CONFIG.STATUS_NAMES.ON_HOLD);
        const unassigned = active.filter((i) => !i.fields.assignee);
        const since = addDays(now, -90);
        const completed90d = leaf.filter((i) => {
            if (getStatusCategoryKey(i) !== 'done') return false;
            const d = parseLocalDay(i.fields[JIRA_CONFIG.FIELDS.ACTUAL_DONE] as string | undefined ?? null) ?? parseLocalDay(i.fields.resolutiondate ?? null);
            return d ? d >= since : false;
        });
        const completedToday = leaf.filter((i) => {
            if (getStatusCategoryKey(i) !== 'done') return false;
            const d = parseLocalDay(i.fields[JIRA_CONFIG.FIELDS.ACTUAL_DONE] as string | undefined ?? null) ?? parseLocalDay(i.fields.resolutiondate ?? null);
            return isToday(d, now);
        });
        const completedThisWeek = leaf.filter((i) => {
            if (getStatusCategoryKey(i) !== 'done') return false;
            const d = parseLocalDay(i.fields[JIRA_CONFIG.FIELDS.ACTUAL_DONE] as string | undefined ?? null) ?? parseLocalDay(i.fields.resolutiondate ?? null);
            return isThisWeek(d, now);
        });
        // 미완료 지연 (overdue in progress)
        const overdueInProgress = active.filter((i) => {
            const due = parseLocalDay(i.fields.duedate ?? null);
            if (!due) return false;
            return due < now;
        });
        // 완료 지연 (late completion)
        const lateCompletion = leaf.filter((i) => {
            if (getStatusCategoryKey(i) !== 'done') return false;
            const due = parseLocalDay(i.fields.duedate ?? null);
            const done = parseLocalDay(i.fields[JIRA_CONFIG.FIELDS.ACTUAL_DONE] as string | undefined ?? null) ?? parseLocalDay(i.fields.resolutiondate ?? null);
            if (!due || !done) return false;
            return done > due;
        });
        const noDueDate = active.filter((i) => !i.fields.duedate);

        return {
            total,
            active: active.length,
            onHold: onHold.length,
            unassigned: unassigned.length,
            completed90d: completed90d.length,
            overdueInProgress: overdueInProgress.length,
            lateCompletion: lateCompletion.length,
            noDueDate: noDueDate.length,
            completedToday: completedToday.length,
            completedThisWeek: completedThisWeek.length,
        };
    }, [issues, now]);

    const dailySeries = useMemo<DailyPoint[] | null>(() => {
        if (!issues) return null;
        const leaf = filterLeafIssues(issues);
        const counts: Record<string, number> = {};
        const since = addDays(now, -historyDays + 1);
        for (const issue of leaf) {
            if (getStatusCategoryKey(issue) !== 'done') continue;
            const d = parseLocalDay(issue.fields[JIRA_CONFIG.FIELDS.ACTUAL_DONE] as string | undefined ?? null) ?? parseLocalDay(issue.fields.resolutiondate ?? null);
            if (!d || d < since || d > now) continue;
            const k = dayKey(d);
            if (k) counts[k] = (counts[k] ?? 0) + 1;
        }
        return lastNDayKeys(historyDays, now).map((date) => ({ date, count: counts[date] ?? 0 }));
    }, [issues, historyDays, now]);

    const team = useMemo<TeamForecast | null>(() => {
        if (!issues) return null;
        return teamForecast(issues, historyDays, now, { rngSeed: options?.rngSeed });
    }, [issues, historyDays, now, options?.rngSeed]);

    const effort = useMemo<BacklogEffortReport | null>(() => {
        if (!issues) return null;
        const headcount = options?.teamHeadcount ?? Math.max(1, team?.perAssignee.length ?? 1);
        return aggregateBacklogEffort(issues, {
            teamHeadcount: headcount,
            utilization: options?.utilization,
            teamEtaDays: team?.realistic?.p85Days,
        });
    }, [issues, team, options?.teamHeadcount, options?.utilization]);

    const effortConfidence = useMemo(() => (effort ? effortReportConfidence(effort) : null), [effort]);

    const validation = useMemo<CrossValidationResult | null>(() => {
        if (!team || !effort) return null;
        return crossValidate(team, effort);
    }, [team, effort]);

    return {
        issues: issues ?? [],
        counts,
        dailySeries,
        team,
        effort,
        effortConfidence,
        validation,
        isLoading,
        isFetching,
        error: error as Error | null,
        refetch,
    };
}
