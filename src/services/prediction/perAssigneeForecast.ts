/**
 * 담당자별 처리량 분석 + 3 시나리오 ETA.
 *
 * 분석 보고서 §4 기준.
 *   - 시나리오 ① 낙관 (자유 재할당) → optimistic
 *   - 시나리오 ② 기준 (현재 할당 유지) → realistic = max(개인 ETA)
 *   - 시나리오 ③ 병목 식별 → bottleneck = max ETA 인원
 *
 * 한국 사내 환경 가드: 휴가 미반영 → 활동일 표시, 7일 미만 회색 처리 (UI 책임).
 */

import { addDays } from 'date-fns';
import type { JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues, getStatusCategoryKey } from '@/lib/jira-helpers';
import { addBusinessDays, dayKey, parseLocalDay } from '@/lib/date-utils';
import { personKeyFromAssignee } from '@/lib/defect-kpi-utils';
import { monteCarloForecast, percentile, seededRng } from './monteCarloForecast';
import { buildConfidenceWarnings, confidenceLevel } from './confidence';
import type {
    ForecastResult,
    PerAssigneeForecast,
    TeamForecast,
    ThroughputStats,
    WorkloadQuadrant,
} from './types';
import { classifyScopeStatus, scopeChangeRatio } from './scopeAnalysis';
import {
    resolveOnHoldStatus,
    resolveCancelledStatus,
    resolveFields,
    resolvePredictionConfig,
} from '@/lib/kpi-rules-resolver';

/**
 * v1.0.10: 모듈-스코프 `const C` 를 함수 진입 시 resolve로 대체.
 * store 변경이 다음 호출부터 반영된다.
 */

/**
 * Jira 이슈에서 완료일 추출 (KPI와 동일 룰: ACTUAL_DONE 우선, fallback resolutiondate)
 */
function getCompletionDate(issue: JiraIssue): Date | null {
    const actualField = resolveFields().ACTUAL_DONE;
    const actual = issue.fields[actualField] as string | undefined;
    return parseLocalDay(actual ?? null) ?? parseLocalDay(issue.fields.resolutiondate ?? null);
}

function getCreationDate(issue: JiraIssue): Date | null {
    return parseLocalDay(issue.fields.created ?? null);
}

function isDone(issue: JiraIssue): boolean {
    return getStatusCategoryKey(issue) === 'done';
}

function isOnHold(issue: JiraIssue): boolean {
    return issue.fields.status?.name === resolveOnHoldStatus();
}

function isCancelled(issue: JiraIssue): boolean {
    return issue.fields.status?.name === resolveCancelledStatus();
}

/** 백로그 정의 (analysis.md §16.1) */
export function isInBacklog(issue: JiraIssue): boolean {
    if (isDone(issue)) return false;
    if (isCancelled(issue)) return false;
    return true;
}

/**
 * N일치 일별 throughput 배열 생성 (오래된 순). 활동 없는 날은 0.
 */
export function dailyThroughput(issues: JiraIssue[], days: number, now = new Date()): number[] {
    const start = addDays(now, -days + 1);
    const counts: Record<string, number> = {};
    for (const issue of issues) {
        if (!isDone(issue)) continue;
        const d = getCompletionDate(issue);
        if (!d) continue;
        if (d < start || d > now) continue;
        const key = dayKey(d);
        if (key) counts[key] = (counts[key] ?? 0) + 1;
    }
    const result: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const key = dayKey(addDays(now, -i));
        result.push(counts[key ?? ''] ?? 0);
    }
    return result;
}

export function dailyCreations(issues: JiraIssue[], days: number, now = new Date()): number[] {
    const start = addDays(now, -days + 1);
    const counts: Record<string, number> = {};
    for (const issue of issues) {
        const d = getCreationDate(issue);
        if (!d) continue;
        if (d < start || d > now) continue;
        const key = dayKey(d);
        if (key) counts[key] = (counts[key] ?? 0) + 1;
    }
    const result: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const key = dayKey(addDays(now, -i));
        result.push(counts[key ?? ''] ?? 0);
    }
    return result;
}

/** 통계 산출: mean, stddev, cv, scope ratio */
export function computeThroughputStats(
    throughput: number[],
    creationCount: number
): ThroughputStats {
    const totalDays = throughput.length;
    const activeDays = throughput.filter((c) => c > 0).length;
    const sum = throughput.reduce((a, b) => a + b, 0);
    // 활동일 기준 평균 (0 일은 휴일·블로커 가능성 큼)
    const mean = activeDays > 0 ? sum / activeDays : 0;
    // 표준편차도 활동일 기준
    const activeValues = throughput.filter((c) => c > 0);
    const variance =
        activeValues.length > 0
            ? activeValues.reduce((s, x) => s + (x - mean) ** 2, 0) / activeValues.length
            : 0;
    const stddev = Math.sqrt(variance);
    const cv = mean > 0 ? stddev / mean : 0;
    return {
        activeDays,
        totalDays,
        mean,
        stddev,
        cv,
        scopeRatio: scopeChangeRatio(creationCount, sum),
    };
}

/**
 * 단일 forecast 생성 — Monte Carlo + 백분위 + 영업일 환산 + 신뢰도.
 */
export function buildForecast(
    remaining: number,
    throughput: number[],
    creationCount: number,
    now = new Date(),
    options: { rngSeed?: number } = {}
): ForecastResult {
    const C = resolvePredictionConfig();
    const stats = computeThroughputStats(throughput, creationCount);
    const confidence = confidenceLevel(stats);
    const warnings = buildConfidenceWarnings(stats);

    const rng = options.rngSeed != null ? seededRng(options.rngSeed) : Math.random;
    const mc = monteCarloForecast(remaining, throughput, {
        trials: C.MONTE_CARLO_TRIALS,
        maxDays: C.MONTE_CARLO_MAX_DAYS,
        rng,
    });

    if (mc.aborted) {
        // 데이터 부족 시 일수 0 + warning 추가
        const reason = mc.abortReason === 'no-history' ? '과거 데이터 없음' : '잔여 작업 없음';
        return {
            p50Days: 0,
            p85Days: 0,
            p95Days: 0,
            p50Date: now,
            p85Date: now,
            p95Date: now,
            confidence: 'unreliable',
            warnings: [...warnings, reason],
            stats,
            remainingCount: remaining,
        };
    }

    const p50 = Math.round(percentile(mc.daysToComplete, 50));
    const p85 = Math.round(percentile(mc.daysToComplete, 85));
    const p95 = Math.round(percentile(mc.daysToComplete, 95));

    return {
        p50Days: p50,
        p85Days: p85,
        p95Days: p95,
        p50Date: addBusinessDays(now, p50),
        p85Date: addBusinessDays(now, p85),
        p95Date: addBusinessDays(now, p95),
        confidence,
        warnings,
        stats,
        remainingCount: remaining,
    };
}

/**
 * 워크로드 4분위 분류.
 */
function classifyQuadrant(remaining: number, throughput: number, medianRemaining: number, medianThroughput: number): WorkloadQuadrant {
    const aboveRem = remaining > medianRemaining;
    const aboveThr = throughput > medianThroughput;
    if (aboveRem && !aboveThr) return 'overload';
    if (aboveRem && aboveThr) return 'focus';
    if (!aboveRem && !aboveThr) return 'capacity';
    return 'fast';
}

/**
 * 담당자별 ETA + 워크로드. 미할당은 별도 처리.
 */
export function perAssigneeForecast(
    issues: JiraIssue[],
    historyDays?: number,
    now = new Date(),
    options: { rngSeed?: number } = {}
): {
    perAssignee: PerAssigneeForecast[];
    unassignedCount: number;
    onHoldCount: number;
} {
    const C = resolvePredictionConfig();
    const histDays = historyDays ?? C.DEFAULT_HISTORY_DAYS;
    const leaf = filterLeafIssues(issues);
    const active = leaf.filter(isInBacklog);
    const onHoldCount = active.filter(isOnHold).length;
    const unassignedCount = active.filter((i) => !i.fields.assignee).length;

    // 담당자별 그룹 (활성 백로그)
    const remainingByPerson = new Map<string, { displayName: string; count: number; onHold: number }>();
    for (const issue of active) {
        if (!issue.fields.assignee) continue;
        const { key, label } = personKeyFromAssignee(issue);
        const prev = remainingByPerson.get(key) ?? { displayName: label, count: 0, onHold: 0 };
        if (isOnHold(issue)) prev.onHold++;
        else prev.count++;
        remainingByPerson.set(key, prev);
    }

    // 담당자별 history (완료 이슈만) — displayName도 함께 저장하여 활성 잔여 없는 인원도 이름 표시 가능
    const completedByPerson = new Map<string, { displayName: string; issues: JiraIssue[] }>();
    for (const issue of leaf) {
        if (!isDone(issue)) continue;
        if (!issue.fields.assignee) continue;
        const { key, label } = personKeyFromAssignee(issue);
        const prev = completedByPerson.get(key) ?? { displayName: label, issues: [] };
        prev.issues.push(issue);
        completedByPerson.set(key, prev);
    }

    const allKeys = new Set([...remainingByPerson.keys(), ...completedByPerson.keys()]);
    const rows: PerAssigneeForecast[] = [];

    for (const key of allKeys) {
        const remInfo = remainingByPerson.get(key);
        const completedInfo = completedByPerson.get(key);
        const remaining = remInfo?.count ?? 0;
        const onHold = remInfo?.onHold ?? 0;
        const completed = completedInfo?.issues ?? [];
        const throughput = dailyThroughput(completed, histDays, now);
        const stats = computeThroughputStats(throughput, 0);
        // 우선순위: remaining의 이름 → completed의 이름 → key (id) 폴백
        const displayName = remInfo?.displayName ?? completedInfo?.displayName ?? key;

        let forecast: ForecastResult | null = null;
        if (remaining > 0 && stats.activeDays >= C.MIN_ACTIVE_DAYS_RELIABLE) {
            forecast = buildForecast(remaining, throughput, 0, now, options);
        } else if (remaining > 0) {
            // 활동 부족이면 unreliable forecast 노출하되 warning 강조
            forecast = buildForecast(remaining, throughput, 0, now, options);
            forecast.confidence = 'unreliable';
            forecast.warnings.unshift(`개인 활동 ${stats.activeDays}일 — 통계적으로 신뢰 불가`);
        }

        rows.push({
            key,
            displayName,
            remaining,
            onHold,
            activeDays: stats.activeDays,
            avgDailyThroughput: +stats.mean.toFixed(2),
            forecast,
            quadrant: 'capacity', // 임시, 아래에서 재계산
        });
    }

    // 4분위 계산 (median 기준)
    const remainings = rows.map((r) => r.remaining).sort((a, b) => a - b);
    const throughputs = rows.map((r) => r.avgDailyThroughput).sort((a, b) => a - b);
    const medianRem = remainings[Math.floor(remainings.length / 2)] ?? 0;
    const medianThr = throughputs[Math.floor(throughputs.length / 2)] ?? 0;
    rows.forEach((r) => {
        r.quadrant = classifyQuadrant(r.remaining, r.avgDailyThroughput, medianRem, medianThr);
    });

    rows.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'));
    return { perAssignee: rows, unassignedCount, onHoldCount };
}

/**
 * 팀 forecast — 3 시나리오 종합.
 */
export function teamForecast(
    issues: JiraIssue[],
    historyDays?: number,
    now = new Date(),
    options: { rngSeed?: number } = {}
): TeamForecast {
    const C = resolvePredictionConfig();
    const histDays = historyDays ?? C.DEFAULT_HISTORY_DAYS;
    const leaf = filterLeafIssues(issues);
    const active = leaf.filter(isInBacklog).filter((i) => !isOnHold(i));
    const teamThroughput = dailyThroughput(leaf, histDays, now);
    const teamCreations = dailyCreations(leaf, histDays, now);
    const totalCreations = teamCreations.reduce((a, b) => a + b, 0);
    const totalCompletions = teamThroughput.reduce((a, b) => a + b, 0);

    const optimistic = buildForecast(active.length, teamThroughput, totalCreations, now, options);

    const { perAssignee, unassignedCount, onHoldCount } = perAssigneeForecast(
        issues,
        histDays,
        now,
        options
    );

    // realistic = max(개인 ETA P85)
    let bottleneck: PerAssigneeForecast | null = null;
    let maxP85 = -1;
    for (const row of perAssignee) {
        if (row.forecast && row.forecast.p85Days > maxP85) {
            maxP85 = row.forecast.p85Days;
            bottleneck = row;
        }
    }

    const realistic: ForecastResult = bottleneck?.forecast
        ? { ...bottleneck.forecast, warnings: [...bottleneck.forecast.warnings, `병목 인원: ${bottleneck.displayName}`] }
        : optimistic;

    const scopeRatio = totalCompletions > 0 ? totalCreations / totalCompletions : 0;

    return {
        optimistic,
        realistic,
        bottleneck,
        perAssignee,
        unassignedCount,
        onHoldCount,
        scopeRatio,
        scopeStatus: classifyScopeStatus(scopeRatio),
    };
}
