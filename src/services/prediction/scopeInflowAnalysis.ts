/**
 * v1.0.41: 신규 유입 분석 — Scope 발산 원인 진단.
 *
 * 백그라운드:
 *   Scope ratio (신규 / 완료) > 1.5 일 때 ETA 예측 의미 없음 (정직성 원칙).
 *   그러나 사용자는 "왜 신규가 이렇게 많은지" 진단이 필요함.
 *   - 진짜 발산 (인력 부족 / 기능 폭증)인가?
 *   - 마이그레이션 / 기존 이슈 일괄 등록인가?
 *   - 단일 작성자 일괄 생성?
 *
 * 이 service는 최근 N일 신규 이슈를 분해하여 진단 데이터 제공.
 * 운영 액션 결정에 사용.
 */
import { addDays } from 'date-fns';
import type { JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues, isBusinessDone } from '@/lib/jira-helpers';
import { parseLocalDay, dayKey } from '@/lib/date-utils';
import { resolveCancelledStatus, resolveRejectedStatus, resolveFields } from '@/lib/kpi-rules-resolver';

export interface InflowTypeBreakdown {
    typeName: string;
    count: number;
    percentage: number;
}

export interface InflowDayPoint {
    /** 'YYYY-MM-DD' */
    date: string;
    count: number;
}

export interface InflowReporterBreakdown {
    displayName: string;
    count: number;
    percentage: number;
}

/** 마이그레이션 의심 신호 */
export interface MigrationSignals {
    /** 일별 중앙값 대비 5배 이상 폭증한 일자 */
    spikeDays: Array<{ date: string; count: number; multiplierVsMedian: number }>;
    /** 신규 중 단일 작성자 비중이 50% 초과면 표시 */
    dominantReporter: InflowReporterBreakdown | null;
    /** 의심도 (0~1). 높을수록 마이그레이션 가능성 큼 */
    suspicionScore: number;
    /** 사용자에게 보여줄 의심 사유 (한국어) */
    reasons: string[];
}

/**
 * v1.0.42: 프로젝트 단계.
 *   - 'early'  : 초기 백로그 구축 단계 (백로그 70%+ 가 윈도우 내 created + 첫 이슈 60일 이내)
 *               신규 유입 = "스코프 정의"라 의미 약함. scope ratio 발산은 정상.
 *   - 'active' : 정상 운영 단계 (default)
 */
export type ProjectStage = 'early' | 'active';

export interface InflowAnalysis {
    /** 분석 윈도우 (일) */
    windowDays: number;
    /** 윈도우 내 신규(created) 건수 — leaf 기준 */
    totalNew: number;
    /** 윈도우 내 완료(isBusinessDone) 건수 — leaf, 취소·반려 제외 */
    totalCompleted: number;
    /** 신규 / 완료 비율 (totalCompleted 0이면 Infinity → 별도 분기) */
    scopeRatio: number;
    /** 이슈 타입별 신규 분포 (count 큰 순) */
    byIssueType: InflowTypeBreakdown[];
    /** 일별 신규 (오래된 순, sparkline용) */
    byDay: InflowDayPoint[];
    /** 작성자(reporter)별 신규 분포 — Top 5 */
    topReporters: InflowReporterBreakdown[];
    /** 마이그레이션 의심 신호 */
    migrationSignals: MigrationSignals;
    /** 마이그레이션 의심 제외 시 추정 "정상 신규" */
    estimatedRealNew: number;
    /** 마이그레이션 제외 시 ratio */
    estimatedRealRatio: number;
    /** v1.0.42: 프로젝트 단계 분류 */
    projectStage: ProjectStage;
    /** v1.0.42: projectStage 판정 근거 (UI 디버깅·안내용) */
    projectStageRationale: string;
    /** v1.0.42: 백로그(leaf 전체) 중 윈도우 내 created 비율 (0~1) */
    inWindowRatio: number;
    /** v1.0.42: 가장 오래된 이슈가 몇 일 전인지 (프로젝트 시작 추정) */
    projectAgeDays: number;
}

const MIGRATION_SPIKE_MULTIPLIER = 5; // 일별 중앙값 × 5 이상이면 폭증
const MIGRATION_DOMINANT_REPORTER_THRESHOLD = 0.5; // 단일 작성자 50% 초과

/** v1.0.42: 초기 구축 단계 감지 임계 */
const EARLY_STAGE_IN_WINDOW_RATIO = 0.7;  // 백로그 70%+ 가 윈도우 안 created
const EARLY_STAGE_MAX_PROJECT_AGE_DAYS = 60;  // 첫 이슈 60일 이내

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}

/**
 * 신규 유입 분석.
 * @param issues 전체 leaf 이슈 (filterLeafIssues 처리됨)
 * @param windowDays 분석 윈도우 (default 30일)
 * @param now 기준 시각 (테스트용)
 */
export function analyzeInflow(
    issues: JiraIssue[],
    windowDays: number = 30,
    now: Date = new Date()
): InflowAnalysis {
    const leaf = filterLeafIssues(issues);
    const since = addDays(now, -windowDays + 1);
    const cancelled = resolveCancelledStatus();
    const rejected = resolveRejectedStatus();
    const F = resolveFields();

    // 1) 윈도우 내 신규 (created) + 윈도우 내 완료(completed)
    // v1.0.46 fix (C4): 이전 버전은 totalCompleted가 lifetime 완료를 카운트해
    // perAssigneeForecast의 scopeRatio(둘 다 윈도우 내)와 의미 불일치.
    // 통일: 완료일이 윈도우 안인 것만 카운트.
    const newIssues: JiraIssue[] = [];
    const completedKeys = new Set<string>();
    for (const i of leaf) {
        const created = parseLocalDay(i.fields.created);
        if (created && created >= since && created <= now) {
            newIssues.push(i);
        }
        // 완료 카운트 (취소·반려 제외 + 완료일이 윈도우 안)
        if (isBusinessDone(i)) {
            const sn = i.fields.status?.name?.trim() ?? '';
            if (sn === cancelled || sn === rejected) continue;
            const completedAt =
                parseLocalDay(i.fields[F.ACTUAL_DONE] as string | undefined ?? null)
                ?? parseLocalDay(i.fields.resolutiondate ?? null);
            if (completedAt && completedAt >= since && completedAt <= now) {
                completedKeys.add(i.key);
            }
        }
    }

    // 2) 이슈 타입별 분포
    const typeMap = new Map<string, number>();
    for (const i of newIssues) {
        const t = i.fields.issuetype?.name ?? '(unknown)';
        typeMap.set(t, (typeMap.get(t) ?? 0) + 1);
    }
    const totalNew = newIssues.length;
    const byIssueType: InflowTypeBreakdown[] = Array.from(typeMap.entries())
        .map(([typeName, count]) => ({
            typeName,
            count,
            percentage: totalNew > 0 ? +(100 * count / totalNew).toFixed(1) : 0,
        }))
        .sort((a, b) => b.count - a.count);

    // 3) 일별 신규
    const dayMap: Record<string, number> = {};
    for (const i of newIssues) {
        const created = parseLocalDay(i.fields.created);
        if (!created) continue;
        const k = dayKey(created);
        if (k) dayMap[k] = (dayMap[k] ?? 0) + 1;
    }
    const byDay: InflowDayPoint[] = [];
    for (let i = windowDays - 1; i >= 0; i--) {
        const k = dayKey(addDays(now, -i));
        byDay.push({ date: k ?? '', count: dayMap[k ?? ''] ?? 0 });
    }

    // 4) 작성자별 분포
    const reporterMap = new Map<string, number>();
    for (const i of newIssues) {
        const r = i.fields.reporter?.displayName?.trim() ?? '(unknown)';
        reporterMap.set(r, (reporterMap.get(r) ?? 0) + 1);
    }
    const topReporters: InflowReporterBreakdown[] = Array.from(reporterMap.entries())
        .map(([displayName, count]) => ({
            displayName,
            count,
            percentage: totalNew > 0 ? +(100 * count / totalNew).toFixed(1) : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // 5) 마이그레이션 휴리스틱
    const reasons: string[] = [];

    // 5a) 일별 폭증
    const dayCounts = byDay.map((d) => d.count).filter((c) => c > 0);
    const med = median(dayCounts);
    const spikeDays = byDay
        .filter((d) => d.count > 0 && med > 0 && d.count >= med * MIGRATION_SPIKE_MULTIPLIER)
        .map((d) => ({
            date: d.date,
            count: d.count,
            multiplierVsMedian: +(d.count / med).toFixed(1),
        }));
    if (spikeDays.length > 0) {
        const totalSpike = spikeDays.reduce((s, d) => s + d.count, 0);
        const pct = Math.round(100 * totalSpike / Math.max(1, totalNew));
        reasons.push(
            `일별 폭증 ${spikeDays.length}일 — 신규 총 ${totalSpike}건(${pct}%)이 일자 중앙값(${med}건) 대비 ${MIGRATION_SPIKE_MULTIPLIER}배 이상 몰림`
        );
    }

    // 5b) 단일 작성자 비중
    let dominantReporter: InflowReporterBreakdown | null = null;
    if (topReporters.length > 0 && totalNew >= 10) {
        const top = topReporters[0];
        if (top.percentage > MIGRATION_DOMINANT_REPORTER_THRESHOLD * 100) {
            dominantReporter = top;
            reasons.push(
                `단일 작성자 비중 ${top.percentage}% — '${top.displayName}'이 신규 ${top.count}건 중 다수 등록`
            );
        }
    }

    // 5c) 의심도 계산 (heuristic, 0~1)
    let suspicionScore = 0;
    if (spikeDays.length > 0) {
        const spikeCount = spikeDays.reduce((s, d) => s + d.count, 0);
        suspicionScore += Math.min(0.6, 0.6 * spikeCount / Math.max(1, totalNew)); // 폭증 비중
    }
    if (dominantReporter) {
        suspicionScore += Math.min(0.4, (dominantReporter.percentage / 100 - 0.5) * 0.8);
    }
    suspicionScore = +Math.min(1, suspicionScore).toFixed(2);

    // 6) 마이그레이션 의심 제외 시 정상 신규
    const suspectedMigrationCount = spikeDays.reduce((s, d) => s + d.count, 0);
    const estimatedRealNew = Math.max(0, totalNew - suspectedMigrationCount);
    const totalCompleted = completedKeys.size;
    const scopeRatio = totalCompleted > 0 ? +(totalNew / totalCompleted).toFixed(2) : (totalNew > 0 ? Infinity : 0);
    const estimatedRealRatio = totalCompleted > 0
        ? +(estimatedRealNew / totalCompleted).toFixed(2)
        : (estimatedRealNew > 0 ? Infinity : 0);

    // 7) v1.0.42: 프로젝트 단계 분류 (early vs active)
    const allLeafCreatedDays = leaf
        .map((i) => parseLocalDay(i.fields.created))
        .filter((d): d is Date => d !== null);
    const earliestCreated = allLeafCreatedDays.length > 0
        ? new Date(Math.min(...allLeafCreatedDays.map((d) => d.getTime())))
        : null;
    const projectAgeDays = earliestCreated
        ? Math.floor((now.getTime() - earliestCreated.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
    const inWindowCreatedCount = allLeafCreatedDays.filter((d) => d >= since).length;
    const inWindowRatio = leaf.length > 0
        ? +(inWindowCreatedCount / leaf.length).toFixed(2)
        : 0;

    let projectStage: ProjectStage = 'active';
    let projectStageRationale = '정상 운영 단계 (active)';
    if (
        leaf.length > 0
        && inWindowRatio >= EARLY_STAGE_IN_WINDOW_RATIO
        && projectAgeDays <= EARLY_STAGE_MAX_PROJECT_AGE_DAYS
    ) {
        projectStage = 'early';
        projectStageRationale =
            `백로그 ${Math.round(inWindowRatio * 100)}%가 최근 ${windowDays}일 안 등록 + `
            + `프로젝트 시작 ${projectAgeDays}일 → 초기 구축 단계 (스코프 정의 중)`;
    }

    return {
        windowDays,
        totalNew,
        totalCompleted,
        scopeRatio,
        byIssueType,
        byDay,
        topReporters,
        migrationSignals: {
            spikeDays,
            dominantReporter,
            suspicionScore,
            reasons,
        },
        estimatedRealNew,
        estimatedRealRatio,
        projectStage,
        projectStageRationale,
        inWindowRatio,
        projectAgeDays,
    };
}
