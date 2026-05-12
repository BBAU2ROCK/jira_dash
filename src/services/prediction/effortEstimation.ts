/**
 * 백로그 공수 (man-hour) 추정.
 *
 * 분석 보고서 §5. Phase 0 측정 결과 반영:
 *   - SP 커버리지 0% → SP 모드 자동 비활성
 *   - 난이도 커버리지 0% → 난이도 모드 자동 비활성
 *   - Worklog: IGMU 57% (활성), IPCON 0% (비활성)
 *   - cycle time fallback이 default
 *
 * v1.0.32: planned source 추가 — 이슈 자체에 등록된 계획시작일·완료예정일·난이도 활용.
 *
 * 우선순위: worklog > planned > SP > 난이도 > cycle time fallback
 */

import { differenceInHours } from 'date-fns';
import type { JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues, getStatusCategoryKey, isBusinessDone } from '@/lib/jira-helpers';
import { parseLocalDay, businessDaysBetween } from '@/lib/date-utils';
import type {
    BacklogEffortReport,
    ConfidenceLevel,
    EffortSource,
    IssueEffortPrediction,
} from './types';
import { BUSINESS_DAYS_PER_MONTH } from './types';
import {
    resolveCancelledStatus,
    resolveRejectedStatus,
    resolvePredictionConfig,
    resolveFields,
} from '@/lib/kpi-rules-resolver';

/**
 * v1.0.32: 난이도 라벨 → 가중치 매핑.
 * - 다국어/표기 변형 모두 수용 (한글 상/중/하, 영어 High/Medium/Low, 보조 표기)
 * - 일반 평균 cycle time보다 짧을 거란 가정 (하) / 길어질 거란 가정 (상)
 */
export const DIFFICULTY_WEIGHT: Record<string, number> = {
    '상': 1.2, 'High': 1.2, '높음': 1.2, '어려움': 1.2,
    '중': 1.0, 'Medium': 1.0, '보통': 1.0, '중간': 1.0,
    '하': 0.8, 'Low': 0.8, '낮음': 0.8, '쉬움': 0.8,
};

/** 계획 영업일 outlier 필터 (1일 미만 또는 60일 초과는 비현실적) */
const PLANNED_DAYS_MIN = 1;
const PLANNED_DAYS_MAX = 60;

/** 난이도 라벨 추출 (객체/문자 둘 다 처리). 없으면 null. */
function readDifficultyLabel(issue: JiraIssue, diffField: string): string | null {
    const diff = issue.fields[diffField];
    if (diff == null) return null;
    if (typeof diff === 'object' && 'value' in diff) {
        return String((diff as { value: unknown }).value ?? '').trim() || null;
    }
    return String(diff).trim() || null;
}

/**
 * v1.0.10: 모듈 스코프 C 제거 — 각 함수 진입 시 resolvePredictionConfig() 사용.
 */

interface CoverageStats {
    spCoverage: number;
    worklogCoverage: number;
    difficultyCoverage: number;
    /** v1.0.32: 활성 이슈 중 계획시작일+duedate 모두 있는 비율 */
    plannedCoverage: number;
    spActive: boolean;
    worklogActive: boolean;
    difficultyActive: boolean;
    /** v1.0.32: planned 모드 활성 (활성 이슈에서 30%+ 가용 시) */
    plannedActive: boolean;
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
 *
 * v1.0.32: activeIssues 인자 추가 — planned source 가용성 측정 (계획시작일+duedate).
 *   resolved 통계와 active 통계가 다른 차원이라 별도 인자로 받음.
 */
export function measureCoverage(
    resolvedIssues: JiraIssue[],
    activeIssues: JiraIssue[] = []
): CoverageStats {
    const C = resolvePredictionConfig();
    const F = resolveFields();
    const total = resolvedIssues.length;

    // planned 가용성: active 이슈에서 측정
    const activeTotal = activeIssues.length;
    const withPlanned = activeIssues.filter((i) => {
        const start = parseLocalDay(i.fields.customfield_11481 ?? null);
        const due = parseLocalDay(i.fields.duedate ?? null);
        if (!start || !due) return false;
        const bd = businessDaysBetween(start, due);
        return bd >= PLANNED_DAYS_MIN && bd <= PLANNED_DAYS_MAX;
    }).length;
    const plannedC = activeTotal > 0 ? withPlanned / activeTotal : 0;
    const PLANNED_THRESHOLD = 0.3; // 활성 이슈 30%+에 계획·예정일 있어야 활성화

    if (total === 0) {
        return {
            spCoverage: 0,
            worklogCoverage: 0,
            difficultyCoverage: 0,
            plannedCoverage: plannedC,
            spActive: false,
            worklogActive: false,
            difficultyActive: false,
            plannedActive: plannedC >= PLANNED_THRESHOLD,
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
        plannedCoverage: plannedC,
        spActive: spC >= C.SP_COVERAGE_THRESHOLD,
        worklogActive: wlC >= C.WORKLOG_COVERAGE_THRESHOLD,
        difficultyActive: dfC > 0, // 난이도는 임계 없음 — 있으면 사용
        plannedActive: plannedC >= PLANNED_THRESHOLD,
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
 * 우선순위: worklog (실제 기록) → planned (계획시작일+duedate+난이도) → SP → 난이도 평균 → cycle time fallback
 *
 * v1.0.32: planned source 추가.
 *   - 활성 모드 + 이슈에 계획시작일+duedate 모두 있고 영업일 1~60일 범위 내
 *   - 난이도 라벨 있으면 ±15% 범위 (high), 없으면 ±25% 범위 (medium)
 *   - 난이도 가중치: 상×1.2 / 중×1.0 / 하×0.8
 */
export function predictIssueEffort(
    issue: JiraIssue,
    coverage: CoverageStats,
    avgs: HistoricalAverages
): IssueEffortPrediction {
    const F = resolveFields();
    const summary = issue.fields.summary ?? issue.key;
    const issueKey = issue.key;
    const issueTypeName = issue.fields.issuetype?.name;

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
            meta: { issueTypeName },
        };
    }

    // v1.0.32: planned — 이슈에 등록된 계획기간 + 난이도 (자체 약속된 정보)
    if (coverage.plannedActive) {
        const plannedStart = parseLocalDay(issue.fields.customfield_11481 ?? null);
        const due = parseLocalDay(issue.fields.duedate ?? null);
        if (plannedStart && due && due > plannedStart) {
            const businessDays = businessDaysBetween(plannedStart, due);
            if (businessDays >= PLANNED_DAYS_MIN && businessDays <= PLANNED_DAYS_MAX) {
                const diffLabel = readDifficultyLabel(issue, F.DIFFICULTY);
                const weight = diffLabel != null ? (DIFFICULTY_WEIGHT[diffLabel] ?? 1.0) : 1.0;
                const hasKnownDifficulty = diffLabel != null && diffLabel in DIFFICULTY_WEIGHT;
                const hours = businessDays * 8 * weight;
                return {
                    issueKey,
                    summary,
                    hours,
                    hoursLow: hasKnownDifficulty ? hours * 0.85 : hours * 0.75,
                    hoursHigh: hasKnownDifficulty ? hours * 1.15 : hours * 1.25,
                    source: 'planned',
                    confidence: hasKnownDifficulty ? 'high' : 'medium',
                    meta: {
                        plannedDays: businessDays,
                        difficultyLabel: diffLabel ?? undefined,
                        issueTypeName,
                    },
                };
            }
        }
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
                meta: { issueTypeName },
            };
        }
    }

    // 난이도별 평균 (과거 cycle time 평균)
    if (coverage.difficultyActive) {
        const label = readDifficultyLabel(issue, F.DIFFICULTY);
        if (label != null) {
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
                    meta: { difficultyLabel: label, issueTypeName },
                };
            }
        }
    }

    // Cycle time fallback (타입별 → 전체 평균)
    const typeName = issueTypeName ?? '';
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
        meta: { issueTypeName },
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
    const rejectedName = resolveRejectedStatus();
    const leaf = filterLeafIssues(allIssues);
    // v1.0.18: 취소·반려는 done에서 제외 (cycle time 통계 왜곡 방지)
    const resolved = leaf.filter((i) => {
        if (!isBusinessDone(i)) return false;
        const sn = i.fields.status?.name?.trim() ?? '';
        return sn !== cancelledName && sn !== rejectedName;
    });
    const active = leaf.filter((i) => {
        const cat = getStatusCategoryKey(i);
        const name = i.fields.status?.name;
        return cat !== 'done' && name !== cancelledName && name !== rejectedName;
    });

    // v1.0.32: planned 가용성 측정을 위해 active 이슈도 전달
    const coverage = measureCoverage(resolved, active);
    const avgs = computeHistoricalAverages(resolved, coverage);

    const perIssue = active.map((i) => predictIssueEffort(i, coverage, avgs));
    const totalMid = perIssue.reduce((s, p) => s + p.hours, 0);
    const totalLow = perIssue.reduce((s, p) => s + p.hoursLow, 0);
    const totalHigh = perIssue.reduce((s, p) => s + p.hoursHigh, 0);

    // 출처별 집계 (v1.0.16: manDays 함께 산출)
    const sourceMap = new Map<EffortSource, { count: number; hours: number }>();
    perIssue.forEach((p) => {
        const prev = sourceMap.get(p.source) ?? { count: 0, hours: 0 };
        prev.count++;
        prev.hours += p.hours;
        sourceMap.set(p.source, prev);
    });
    const sourceMix = Array.from(sourceMap.entries())
        .map(([source, v]) => ({ source, ...v, manDays: +(v.hours / 8).toFixed(1) }))
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

    // v1.0.16: 일·월 단위 표시 — 시간(인시)은 내부만, UI는 일/월
    const manDaysMid = totalMid / 8;
    const manDaysLow = totalLow / 8;
    const manDaysHigh = totalHigh / 8;

    return {
        totalHoursMid: +totalMid.toFixed(1),
        totalHoursLow: +totalLow.toFixed(1),
        totalHoursHigh: +totalHigh.toFixed(1),
        totalManDaysMid: +manDaysMid.toFixed(1),
        totalManDaysLow: +manDaysLow.toFixed(1),
        totalManDaysHigh: +manDaysHigh.toFixed(1),
        totalManMonthsMid: +(manDaysMid / BUSINESS_DAYS_PER_MONTH).toFixed(2),
        totalManMonthsLow: +(manDaysLow / BUSINESS_DAYS_PER_MONTH).toFixed(2),
        totalManMonthsHigh: +(manDaysHigh / BUSINESS_DAYS_PER_MONTH).toFixed(2),
        sourceMix,
        perIssue,
        teamCapacityAssumption: {
            headcount,
            utilization,
            teamDaysMid: +teamDaysMid.toFixed(1),
            teamMonthsMid: +(teamDaysMid / BUSINESS_DAYS_PER_MONTH).toFixed(2),
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
