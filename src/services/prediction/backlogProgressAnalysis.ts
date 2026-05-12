/**
 * v1.0.47: 백로그 진척 분석 (정적 모델 전용).
 *
 * 사용자 워크플로우:
 *   1. 프로젝트 시작 → 초기 요구사항 분석 → 할 일 일괄 등록 (N건)
 *   2. 정해진 일정 안에 처리
 *   3. 신규 유입 거의 없음 (가끔 변경 요청)
 *   4. 완료 → 프로젝트 종료
 *
 * 이 환경에서 의미 있는 metric:
 *   - 초기 백로그 크기 (일괄 등록 시점 누적 created)
 *   - 진척률 (완료 / 초기 백로그)
 *   - 처리 속도 (매주 평균 완료)
 *   - 예측 완료일 (잔여 ÷ 처리 속도)
 *   - 마감 비교 (정시 완료 가능성)
 *
 * 의미 없어지는 것 (기존 ScopeInflow):
 *   - scope ratio (신규/완료) — 신규 거의 0
 *   - 마이그레이션 의심 — 정상이 일괄 등록
 */
import { addDays, differenceInCalendarDays, startOfWeek } from 'date-fns';
import type { JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues, isBusinessDone } from '@/lib/jira-helpers';
import { parseLocalDay, businessDaysBetween, addBusinessDays } from '@/lib/date-utils';
import {
    resolveCancelledStatus,
    resolveRejectedStatus,
    resolveFields,
} from '@/lib/kpi-rules-resolver';

/**
 * 프로젝트 운영 모델.
 *   - 'static': 초기 일괄 등록 + 처리 (waterfall-like)
 *   - 'active': 신규 유입 + 완료 동시 진행 (kanban-like)
 */
export type ProjectMode = 'static' | 'active';

/** 정시 완료 가능성 평가 */
export type OnTimeStatus = 'on-time' | 'at-risk' | 'overdue' | 'no-due';

/** 번다운 차트 포인트 (일별 잔여) */
export interface BurndownPoint {
    /** 'YYYY-MM-DD' */
    date: string;
    /** 그날 종료 시점의 잔여 백로그 */
    remaining: number;
    /** 그날까지 누적 완료 */
    cumulativeCompleted: number;
}

export interface BacklogProgressAnalysis {
    /** 자동 감지된 프로젝트 모델 */
    projectMode: ProjectMode;
    /** 감지 근거 (UI 안내용) */
    detectionReason: string;
    /** 최근 30일 신규 비율 (전체 leaf 대비) */
    inflowRatio30d: number;
    /** 최근 30일 신규 절대 건수 */
    inflowCount30d: number;

    // ===== 백로그 크기 =====
    /** 초기 백로그 크기 (lifetime 누적 created — 취소·반려 제외) */
    initialBacklog: number;
    /** 현재까지 완료 (취소·반려 제외) */
    currentCompleted: number;
    /** 현재 활성 백로그 */
    currentActive: number;
    /** 진척률 % (0~100) */
    progressPct: number;

    // ===== 처리 속도 =====
    /** 최근 4주 완료 건수 */
    completedLast4Weeks: number;
    /** 주당 평균 완료 (최근 4주 기준) */
    weeklyVelocity: number;
    /** 일평균 완료 (영업일 기준) */
    dailyVelocity: number;

    // ===== 예측 =====
    /** 잔여 처리 영업일 (활성 ÷ 일평균 — 정수) */
    estimatedRemainingDays: number;
    /** 예측 완료일 (오늘 + 잔여 영업일) */
    estimatedCompletionDate: Date | null;

    // ===== 마감 비교 =====
    /** 가장 늦은 활성 이슈 duedate (또는 null) */
    latestDueDate: Date | null;
    /** 정시 완료 가능성 */
    onTimeStatus: OnTimeStatus;
    /** 마감 - 예측 완료일 (영업일, 음수면 지연) */
    bufferDays: number;

    // ===== 시각화 =====
    /** 번다운 데이터 (시작 → 현재) */
    burndown: BurndownPoint[];

    /** UI에서 표시할 warning */
    warnings: string[];
}

/** v1.0.47: 정적 모드 감지 임계값 (사용자 선택: 5% / 10건) */
const STATIC_MODE_INFLOW_RATIO = 0.05;  // 5%
const STATIC_MODE_INFLOW_ABS = 10;       // 10건
const WINDOW_DAYS = 30;
const VELOCITY_WINDOW_WEEKS = 4;

/**
 * 백로그 진척 분석.
 *
 * @param issues  전체 leaf 이슈
 * @param now     기준 시각
 */
export function analyzeBacklogProgress(
    issues: JiraIssue[],
    now: Date = new Date()
): BacklogProgressAnalysis {
    const F = resolveFields();
    const cancelled = resolveCancelledStatus();
    const rejected = resolveRejectedStatus();
    const leaf = filterLeafIssues(issues);
    const since30d = addDays(now, -WINDOW_DAYS + 1);

    // ===== 신규/완료 분류 =====
    let inflowCount30d = 0;
    const completedAll: Array<{ date: Date }> = [];
    let initialBacklog = 0;
    let currentCompleted = 0;
    let currentActive = 0;
    const completionDates: Date[] = []; // 모든 완료 날짜 (번다운용)
    let latestDueDate: Date | null = null;

    for (const i of leaf) {
        const created = parseLocalDay(i.fields.created);
        const sn = i.fields.status?.name?.trim() ?? '';
        const isExcluded = sn === cancelled || sn === rejected;
        if (isExcluded) continue;

        // initialBacklog = 모든 leaf (취소·반려 제외)
        initialBacklog++;

        // 최근 30일 신규
        if (created && created >= since30d && created <= now) {
            inflowCount30d++;
        }

        const completed = isBusinessDone(i);
        if (completed) {
            currentCompleted++;
            const completedAt =
                parseLocalDay(i.fields[F.ACTUAL_DONE] as string | undefined ?? null)
                ?? parseLocalDay(i.fields.resolutiondate ?? null);
            if (completedAt) {
                completedAll.push({ date: completedAt });
                completionDates.push(completedAt);
            }
        } else {
            currentActive++;
            // 활성 이슈의 duedate 중 가장 늦은 것
            const due = parseLocalDay(i.fields.duedate ?? null);
            if (due && (!latestDueDate || due > latestDueDate)) {
                latestDueDate = due;
            }
        }
    }

    // ===== 정적 모델 감지 =====
    const inflowRatio30d = initialBacklog > 0 ? inflowCount30d / initialBacklog : 0;
    const isStatic =
        inflowRatio30d < STATIC_MODE_INFLOW_RATIO
        && inflowCount30d < STATIC_MODE_INFLOW_ABS;
    const projectMode: ProjectMode = isStatic ? 'static' : 'active';
    const detectionReason = isStatic
        ? `최근 30일 신규 ${inflowCount30d}건 (${(inflowRatio30d * 100).toFixed(1)}%) — 정적 백로그 모델 (일괄 등록 + 처리)`
        : `최근 30일 신규 ${inflowCount30d}건 (${(inflowRatio30d * 100).toFixed(1)}%) — 활발 운영 모델 (신규 + 완료 병행)`;

    // ===== 진척률 =====
    const progressPct = initialBacklog > 0
        ? +(100 * currentCompleted / initialBacklog).toFixed(1)
        : 0;

    // ===== 처리 속도 (최근 4주) =====
    const velocityWindowStart = addDays(now, -VELOCITY_WINDOW_WEEKS * 7);
    const completedLast4Weeks = completedAll.filter(
        (c) => c.date >= velocityWindowStart && c.date <= now
    ).length;
    const weeklyVelocity = +(completedLast4Weeks / VELOCITY_WINDOW_WEEKS).toFixed(1);
    // 영업일 기준 일평균 (4주 = 20영업일)
    const dailyVelocity = +(completedLast4Weeks / (VELOCITY_WINDOW_WEEKS * 5)).toFixed(2);

    // ===== 예측 완료일 =====
    let estimatedRemainingDays = 0;
    let estimatedCompletionDate: Date | null = null;
    if (dailyVelocity > 0 && currentActive > 0) {
        estimatedRemainingDays = Math.ceil(currentActive / dailyVelocity);
        estimatedCompletionDate = addBusinessDays(now, estimatedRemainingDays);
    }

    // ===== 마감 비교 =====
    let onTimeStatus: OnTimeStatus;
    let bufferDays = 0;
    if (!latestDueDate) {
        onTimeStatus = 'no-due';
    } else if (!estimatedCompletionDate) {
        onTimeStatus = currentActive > 0 ? 'at-risk' : 'on-time';
    } else {
        bufferDays = businessDaysBetween(estimatedCompletionDate, latestDueDate);
        const isBeforeDue = estimatedCompletionDate <= latestDueDate;
        if (isBeforeDue && bufferDays >= 5) onTimeStatus = 'on-time';
        else if (isBeforeDue) onTimeStatus = 'at-risk'; // 마감 < 5영업일 여유
        else onTimeStatus = 'overdue';
        // bufferDays: 양수 = 여유, 음수 = 지연 (businessDaysBetween은 항상 양수라 보정)
        if (!isBeforeDue) {
            bufferDays = -businessDaysBetween(latestDueDate, estimatedCompletionDate);
        }
    }

    // ===== 번다운 (지난 30일 + 미래 예측) =====
    // 시작 시점 = 가장 오래된 created (initialBacklog 시작)
    // 단순화: 최근 30일만 시각화 (이전은 너무 많을 수 있음)
    const burndown: BurndownPoint[] = [];
    const burndownStart = addDays(now, -WINDOW_DAYS + 1);
    let cumulativeCompletedUpTo = currentCompleted; // 오늘 기준
    // 역산: 오늘부터 과거로 가면서 완료된 이슈를 빼며 그날의 잔여 계산
    const completedSorted = completionDates
        .filter((d) => d >= burndownStart)
        .sort((a, b) => b.getTime() - a.getTime()); // 최신 → 과거
    // 오늘 기준 cumulative 시작 후, 윈도우 안 완료를 차감하면서 과거 시점 산출
    let runningCompleted = cumulativeCompletedUpTo;
    let runningActive = currentActive;
    const futureCompletions = [...completedSorted]; // 윈도우 안 완료

    // 30일 전부터 오늘까지 일별
    const days = differenceInCalendarDays(now, burndownStart);
    // 오늘부터 과거로 가면서 그날 종료 시점의 누적 완료를 산출
    const pointsByDate = new Map<string, BurndownPoint>();
    // 먼저 모든 일자에 대해 today의 stat로 초기화 (과거로 갈수록 줄어듦)
    for (let dayBack = 0; dayBack <= days; dayBack++) {
        const date = addDays(now, -dayBack);
        // 그날 이후 완료된 것 = 잔여로 복귀
        while (futureCompletions.length > 0 && futureCompletions[0].getTime() > date.getTime()) {
            runningCompleted--;
            runningActive++;
            futureCompletions.shift();
        }
        const dKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        pointsByDate.set(dKey, {
            date: dKey,
            remaining: runningActive,
            cumulativeCompleted: runningCompleted,
        });
    }
    // 시간 순서로 정렬
    const sortedKeys = Array.from(pointsByDate.keys()).sort();
    for (const k of sortedKeys) {
        const p = pointsByDate.get(k);
        if (p) burndown.push(p);
    }

    // ===== Warnings =====
    const warnings: string[] = [];
    if (dailyVelocity === 0) {
        warnings.push(`최근 ${VELOCITY_WINDOW_WEEKS}주 완료 0건 — 처리 속도 산정 불가, 예측 표시 X`);
    }
    if (currentActive === 0) {
        warnings.push('활성 백로그 0건 — 프로젝트 완료');
    }
    if (!latestDueDate && currentActive > 0) {
        warnings.push('활성 이슈에 duedate 설정 없음 — 마감 비교 불가');
    }
    if (initialBacklog === 0) {
        warnings.push('유효한 leaf 이슈 없음');
    }

    return {
        projectMode,
        detectionReason,
        inflowRatio30d: +inflowRatio30d.toFixed(3),
        inflowCount30d,
        initialBacklog,
        currentCompleted,
        currentActive,
        progressPct,
        completedLast4Weeks,
        weeklyVelocity,
        dailyVelocity,
        estimatedRemainingDays,
        estimatedCompletionDate,
        latestDueDate,
        onTimeStatus,
        bufferDays,
        burndown,
        warnings,
    };
}

// startOfWeek import (currently unused but useful for future weekly aggregation)
void startOfWeek;
