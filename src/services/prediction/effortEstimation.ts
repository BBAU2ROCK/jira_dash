/**
 * 백로그 공수 (man-hour) 추정.
 *
 * 분석 보고서 §5. Phase 0 측정 결과 반영:
 *   - SP 커버리지 0% → SP 모드 자동 비활성
 *   - 난이도 커버리지 0% → 난이도 모드 자동 비활성
 *   - Worklog: IGMU 57% (활성), IPCON 0% (비활성)
 *   - cycle time fallback이 default
 *
 * 우선순위: worklog > SP > 난이도 > cycle time fallback
 */

import { differenceInHours } from 'date-fns';
import type { JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues, getStatusCategoryKey } from '@/lib/jira-helpers';
import { parseLocalDay } from '@/lib/date-utils';
import type {
    BacklogEffortReport,
    ConfidenceLevel,
    EffortSource,
    IssueEffortPrediction,
} from './types';
import {
    resolveCancelledStatus,
    resolvePredictionConfig,
    resolveFields,
} from '@/lib/kpi-rules-resolver';

/**
 * v1.0.10: 모듈 스코프 C 제거 — 각 함수 진입 시 resolvePredictionConfig() 사용.
 */

interface CoverageStats {
    spCoverage: number;
    worklogCoverage: number;
    difficultyCoverage: number;
    spActive: boolean;
    worklogActive: boolean;
    difficultyActive: boolean;
}

interface HistoricalAverages {
    /** 1 SP의 평균 시간 (worklog 기준, SP 커버리지 충분 시) */
    hoursPerSp: number;
    /** 난이도 라벨별 평균 시간 */
    byDifficulty: Map<string, number>;
    /** 이슈 타입별 평균 시간 */
    byType: Map<string, number>;
    /** 전체 평균 (cycle time fallback) */
    globalAvg: number;
}

/**
 * 완료된 이슈에서 데이터 커버리지 측정 → 어느 모드를 활성화할지 자동 결정.
 */
export function measureCoverage(resolvedIssues: JiraIssue[]): CoverageStats {
    const C = resolvePredictionConfig();
    const F = resolveFields();
    const total = resolvedIssues.length;
    if (total === 0) {
        return {
            spCoverage: 0,
            worklogCoverage: 0,
            difficultyCoverage: 0,
            spActive: false,
            worklogActive: false,
            difficultyActive: false,
        };
    }
    const withSp = resolvedIssues.filter(
        (i) => typeof i.fields[F.STORY_POINT] === 'number' && (i.fields[F.STORY_POINT] as number) > 0
    ).length;
    const withWl = resolvedIssues.filter(
        (i) => typeof i.fields.timespent === 'number' && (i.fields.timespent as number) > 0
    ).length;
    const withDiff = resolvedIssues.filter(
        (i) => i.fields[F.DIFFICULTY] != null
    ).length;

    const spC = withSp / total;
    const wlC = withWl / total;
    const dfC = withDiff / total;

    return {
        spCoverage: spC,
        worklogCoverage: wlC,
        difficultyCoverage: dfC,
        spActive: spC >= C.SP_COVERAGE_THRESHOLD,
        worklogActive: wlC >= C.WORKLOG_COVERAGE_THRESHOLD,
        difficultyActive: dfC > 0, // 난이도는 임계 없음 — 있으면 사용
    };
}

/** 이슈의 cycle time (시간 단위) — 생성부터 완료까지 wall-clock */
function cycleTimeHours(issue: JiraIssue): number | null {
    const F = resolveFields();
    const created = parseLocalDay(issue.fields.created);
    const actualDone = issue.fields[F.ACTUAL_DONE] as string | undefined;
    const done = parseLocalDay(actualDone ?? null) ?? parseLocalDay(issue.fields.resolutiondate ?? null);
    if (!created || !done || done < created) return null;
    return Math.max(differenceInHours(done, created), 1);
}

/** 완료된 이슈에서 평균값 산출 */
export function computeHistoricalAverages(
    resolvedIssues: JiraIssue[],
    coverage: CoverageStats
): HistoricalAverages {
    const F = resolveFields();
    let totalHours = 0;
    let countCT = 0;
    const byDifficulty = new Map<string, { sum: number; n: number }>();
    const byType = new Map<string, { sum: number; n: number }>();
    let spHourSum = 0;
    let spCount = 0;

    for (const issue of resolvedIssues) {
        const ct = cycleTimeHours(issue);
        if (ct == null) continue;
        totalHours += ct;
        countCT++;

        // 타입별
        const typeName = issue.fields.issuetype?.name ?? '(unknown)';
        const t = byType.get(typeName) ?? { sum: 0, n: 0 };
        t.sum += ct;
        t.n++;
        byType.set(typeName, t);

        // 난이도별
        if (coverage.difficultyActive) {
            const diff = issue.fields[F.DIFFICULTY];
            if (diff != null) {
                const label = typeof diff === 'object' && diff !== null && 'value' in diff
                    ? String((diff as { value: unknown }).value)
                    : String(diff);
                const d = byDifficulty.get(label) ?? { sum: 0, n: 0 };
                d.sum += ct;
                d.n++;
                byDifficulty.set(label, d);
            }
        }

        // SP × hours (worklog 우선, 없으면 cycle time)
        if (coverage.spActive) {
            const sp = issue.fields[F.STORY_POINT];
            const hours = coverage.worklogActive && typeof issue.fields.timespent === 'number' && issue.fields.timespent > 0
                ? issue.fields.timespent / 3600
                : ct;
            if (typeof sp === 'number' && sp > 0) {
                spHourSum += hours / sp;
                spCount++;
            }
        }
    }

    return {
        hoursPerSp: spCount > 0 ? spHourSum / spCount : 0,
        byDifficulty: new Map(
            Array.from(byDifficulty.entries()).map(([k, v]) => [k, v.sum / v.n])
        ),
        byType: new Map(
            Array.from(byType.entries()).map(([k, v]) => [k, v.sum / v.n])
        ),
        globalAvg: countCT > 0 ? totalHours / countCT : 0,
    };
}

/**
 * 단일 이슈 공수 예측.
 * 우선순위: worklog (이미 기록된 시간) → SP × hoursPerSp → 난이도 → cycle time fallback
 */
export function predictIssueEffort(
    issue: JiraIssue,
    coverage: CoverageStats,
    avgs: HistoricalAverages
): IssueEffortPrediction {
    const F = resolveFields();
    const summary = issue.fields.summary ?? issue.key;
    const issueKey = issue.key;

    // 이미 기록된 worklog 시간이 있으면 그게 가장 정확
    const ts = issue.fields.timespent;
    if (coverage.worklogActive && typeof ts === 'number' && ts > 0) {
        const hours = ts / 3600;
        return {
            issueKey,
            summary,
            hours,
            hoursLow: hours * 0.9,
            hoursHigh: hours * 1.1,
            source: 'worklog',
            confidence: 'high',
        };
    }

    // SP × 평균 시간
    if (coverage.spActive) {
        const sp = issue.fields[F.STORY_POINT];
        if (typeof sp === 'number' && sp > 0 && avgs.hoursPerSp > 0) {
            const hours = sp * avgs.hoursPerSp;
            return {
                issueKey,
                summary,
                hours,
                hoursLow: hours * 0.7,
                hoursHigh: hours * 1.5,
                source: 'sp',
                confidence: 'medium',
            };
        }
    }

    // 난이도별 평균
    if (coverage.difficultyActive) {
        const diff = issue.fields[F.DIFFICULTY];
        if (diff != null) {
            const label = typeof diff === 'object' && diff !== null && 'value' in diff
                ? String((diff as { value: unknown }).value)
                : String(diff);
            const avg = avgs.byDifficulty.get(label);
            if (avg && avg > 0) {
                return {
                    issueKey,
                    summary,
                    hours: avg,
                    hoursLow: avg * 0.6,
                    hoursHigh: avg * 1.6,
                    source: 'difficulty',
                    confidence: 'medium',
                };
            }
        }
    }

    // Cycle time fallback (타입별 → 전체 평균)
    const typeName = issue.fields.issuetype?.name ?? '';
    const typeAvg = avgs.byType.get(typeName);
    const fallback = typeAvg && typeAvg > 0 ? typeAvg : avgs.globalAvg;
    return {
        issueKey,
        summary,
        hours: fallback,
        hoursLow: fallback * 0.5,
        hoursHigh: fallback * 2.0,
        source: 'cycle-time',
        confidence: 'low',
    };
}

/**
 * 백로그 전체 공수 보고서 생성.
 */
export function aggregateBacklogEffort(
    allIssues: JiraIssue[],
    options: {
        teamHeadcount?: number;
        utilization?: number;
        teamEtaDays?: number;
    } = {}
): BacklogEffortReport {
    const C = resolvePredictionConfig();
    const cancelledName = resolveCancelledStatus();
    const leaf = filterLeafIssues(allIssues);
    const resolved = leaf.filter((i) => getStatusCategoryKey(i) === 'done');
    const active = leaf.filter((i) => {
        const cat = getStatusCategoryKey(i);
        const name = i.fields.status?.name;
        return cat !== 'done' && name !== cancelledName;
    });

    const coverage = measureCoverage(resolved);
    const avgs = computeHistoricalAverages(resolved, coverage);

    const perIssue = active.map((i) => predictIssueEffort(i, coverage, avgs));
    const totalMid = perIssue.reduce((s, p) => s + p.hours, 0);
    const totalLow = perIssue.reduce((s, p) => s + p.hoursLow, 0);
    const totalHigh = perIssue.reduce((s, p) => s + p.hoursHigh, 0);

    // 출처별 집계
    const sourceMap = new Map<EffortSource, { count: number; hours: number }>();
    perIssue.forEach((p) => {
        const prev = sourceMap.get(p.source) ?? { count: 0, hours: 0 };
        prev.count++;
        prev.hours += p.hours;
        sourceMap.set(p.source, prev);
    });
    const sourceMix = Array.from(sourceMap.entries())
        .map(([source, v]) => ({ source, ...v }))
        .sort((a, b) => b.hours - a.hours);

    // Capacity 가정
    const headcount = options.teamHeadcount ?? Math.max(1, sourceMap.size); // 기본값 fallback
    const utilization = options.utilization ?? C.DEFAULT_UTILIZATION;
    const teamDaysMid = totalMid / Math.max(1, headcount * 8 * utilization);

    // ETA-공수 일관성 검증
    let consistencyWithEta: BacklogEffortReport['consistencyWithEta'];
    if (options.teamEtaDays != null && options.teamEtaDays > 0 && teamDaysMid > 0) {
        const gap = Math.abs(options.teamEtaDays - teamDaysMid) / Math.max(options.teamEtaDays, teamDaysMid);
        let warning: string | undefined;
        if (gap > C.ETA_EFFORT_GAP_THRESHOLD) {
            warning =
                teamDaysMid < options.teamEtaDays
                    ? `처리량(ETA ${options.teamEtaDays}일)이 공수(${teamDaysMid.toFixed(1)}일)보다 ${Math.round(gap * 100)}% 길음 — 블로커·대기 시간 의심`
                    : `공수(${teamDaysMid.toFixed(1)}일)가 ETA(${options.teamEtaDays}일)보다 큼 — worklog 미기록 가능성`;
        }
        consistencyWithEta = {
            teamEtaDays: options.teamEtaDays,
            effortEtaDays: +teamDaysMid.toFixed(1),
            gapPct: +(gap * 100).toFixed(1),
            warning,
        };
    }

    const cycleTimeFallbackOnly =
        !coverage.worklogActive && !coverage.spActive && !coverage.difficultyActive;

    return {
        totalHoursMid: +totalMid.toFixed(1),
        totalHoursLow: +totalLow.toFixed(1),
        totalHoursHigh: +totalHigh.toFixed(1),
        totalManDaysMid: +(totalMid / 8).toFixed(1),
        sourceMix,
        perIssue,
        teamCapacityAssumption: {
            headcount,
            utilization,
            teamDaysMid: +teamDaysMid.toFixed(1),
        },
        consistencyWithEta,
        cycleTimeFallbackOnly,
    };
}

/** 기본 confidence — 공수 자체의 (이슈별이 아닌 백로그 전체) */
export function effortReportConfidence(report: BacklogEffortReport): ConfidenceLevel {
    if (report.cycleTimeFallbackOnly) return 'low';
    const wlShare = report.sourceMix.find((s) => s.source === 'worklog')?.count ?? 0;
    const total = report.perIssue.length;
    if (total === 0) return 'unreliable';
    const wlRatio = wlShare / total;
    if (wlRatio >= 0.5) return 'high';
    if (wlRatio >= 0.3) return 'medium';
    return 'low';
}
