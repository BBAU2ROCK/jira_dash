import { useEffect, useMemo, useRef } from 'react';
import { addDays } from 'date-fns';
import type { JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues, getStatusCategoryKey } from '@/lib/jira-helpers';
import {
    resolveOnHoldStatus,
    resolveDashboardProjectKey,
    resolveFields,
    resolvePredictionConfig,
} from '@/lib/kpi-rules-resolver';
import {
    isToday,
    isThisWeek,
    parseLocalDay,
    dayKey,
    lastNDayKeys,
} from '@/lib/date-utils';
import { useForecastHistoryStore } from '@/stores/forecastHistoryStore';
import { isBacklogCleared } from '@/services/prediction/accuracyTracking';
import { computeCycleTimeByType, type CycleTimeStats } from '@/services/prediction/cycleTimeAnalysis';
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

interface UseBacklogForecastResult {
    /** 입력 이슈 그대로 반환 (디버깅·드릴다운 용) */
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
    /** 이슈 타입별 cycle time 통계 */
    cycleTimeStats: CycleTimeStats[] | null;
}

/**
 * 진행 추이/예측 탭 — 통합 forecast hook.
 * 외부에서 fetch한 issues 배열을 받아 모든 prediction service를 useMemo chain으로 조합.
 *
 * 데이터 소스 결정: dashboard에서 사이드바 선택 에픽 기반 issues를 props로 전달받아 분석.
 * 프로젝트 단위 fetch는 사용 안 함 (사용자 의도: 선택 에픽 한정 분석).
 */
export function useBacklogForecast(issues: JiraIssue[], options?: {
    historyDays?: number;
    teamHeadcount?: number;
    utilization?: number;
    rngSeed?: number;
    now?: Date;
    /** Forecast 기록·정확도 추적용 (default IGMU) */
    projectKey?: string;
}): UseBacklogForecastResult {
    // v1.0.10: store 우선 참조. options 명시값 > store 값 > JIRA_CONFIG 순.
    const historyDays = options?.historyDays ?? resolvePredictionConfig().DEFAULT_HISTORY_DAYS;
    const projectKey = options?.projectKey ?? resolveDashboardProjectKey();
    // now를 useMemo로 고정하여 매 렌더마다 새 Date로 인한 useMemo deps 변경 방지
    const now = useMemo(() => options?.now ?? new Date(), [options?.now]);

    const counts = useMemo<BacklogStateCounts | null>(() => {
        if (!issues) return null;
        const leaf = filterLeafIssues(issues);
        const total = leaf.length;
        const active = leaf.filter(isInBacklog);
        const onHoldName = resolveOnHoldStatus();
        const actualDoneField = resolveFields().ACTUAL_DONE;
        const onHold = active.filter((i) => i.fields.status?.name === onHoldName);
        const unassigned = active.filter((i) => !i.fields.assignee);
        const since = addDays(now, -90);
        const completed90d = leaf.filter((i) => {
            if (getStatusCategoryKey(i) !== 'done') return false;
            const d = parseLocalDay(i.fields[actualDoneField] as string | undefined ?? null) ?? parseLocalDay(i.fields.resolutiondate ?? null);
            return d ? d >= since : false;
        });
        const completedToday = leaf.filter((i) => {
            if (getStatusCategoryKey(i) !== 'done') return false;
            const d = parseLocalDay(i.fields[actualDoneField] as string | undefined ?? null) ?? parseLocalDay(i.fields.resolutiondate ?? null);
            return isToday(d, now);
        });
        const completedThisWeek = leaf.filter((i) => {
            if (getStatusCategoryKey(i) !== 'done') return false;
            const d = parseLocalDay(i.fields[actualDoneField] as string | undefined ?? null) ?? parseLocalDay(i.fields.resolutiondate ?? null);
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
            const done = parseLocalDay(i.fields[actualDoneField] as string | undefined ?? null) ?? parseLocalDay(i.fields.resolutiondate ?? null);
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
        const actualDoneField = resolveFields().ACTUAL_DONE;
        const counts: Record<string, number> = {};
        const since = addDays(now, -historyDays + 1);
        for (const issue of leaf) {
            if (getStatusCategoryKey(issue) !== 'done') continue;
            const d = parseLocalDay(issue.fields[actualDoneField] as string | undefined ?? null) ?? parseLocalDay(issue.fields.resolutiondate ?? null);
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

    const cycleTimeStats = useMemo<CycleTimeStats[] | null>(() => {
        if (!issues) return null;
        const resolved = filterLeafIssues(issues).filter((i) => getStatusCategoryKey(i) === 'done');
        // changelog 없는 이슈도 lead time만으로 통계 산출됨
        // 50개 sample (성능 + rate limit 고려)
        const sample = resolved.slice(0, 50);
        return computeCycleTimeByType(sample);
    }, [issues]);

    // B1: 예측 정확도 추적 — 자동 기록 + 백로그 0건 감지
    const addRecord = useForecastHistoryStore((s) => s.addRecord);
    const markCompleted = useForecastHistoryStore((s) => s.markCompleted);
    const pruneStale = useForecastHistoryStore((s) => s.pruneStale);
    const lastRecordedRef = useRef<{ projectKey: string; p85: number } | null>(null);

    useEffect(() => {
        if (!team || !counts) return;
        // 백로그 비어있으면 미완료 기록에 actual 채움
        if (isBacklogCleared(counts.active)) {
            markCompleted(projectKey, new Date().toISOString());
            return;
        }
        // 신뢰도가 충분하고 P85가 의미 있으면 기록
        const r = team.realistic;
        if (r.confidence === 'unreliable' || r.p85Days <= 0) return;
        // 최근에 같은 P85로 이미 기록했으면 중복 회피 (변동 없음)
        const last = lastRecordedRef.current;
        if (last && last.projectKey === projectKey && Math.abs(last.p85 - r.p85Days) < 2) return;
        addRecord({
            projectKey,
            recordedAt: new Date().toISOString(),
            p50Days: r.p50Days,
            p85Days: r.p85Days,
            p95Days: r.p95Days,
            remainingAtTime: counts.active,
            teamCV: +r.stats.cv.toFixed(2),
            teamMean: +r.stats.mean.toFixed(2),
            activeDays: r.stats.activeDays,
        });
        lastRecordedRef.current = { projectKey, p85: r.p85Days };
        pruneStale();
    }, [team, counts, projectKey, addRecord, markCompleted, pruneStale]);

    return {
        issues: issues ?? [],
        counts,
        dailySeries,
        team,
        effort,
        effortConfidence,
        validation,
        cycleTimeStats,
    };
}
