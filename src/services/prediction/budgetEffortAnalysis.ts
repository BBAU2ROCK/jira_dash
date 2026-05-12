/**
 * v1.0.33: 매니저 콘솔 "공수 & 예산" 탭 데이터 분석.
 *   - 월별 공수 트렌드 (완료 이슈 worklog/cycle time 기반)
 *   - 담당자 × 카테고리 히트맵
 */
import type { JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues, isBusinessDone } from '@/lib/jira-helpers';
import { parseLocalDay } from '@/lib/date-utils';
import { resolveCancelledStatus, resolveRejectedStatus, resolveFields } from '@/lib/kpi-rules-resolver';
import { differenceInHours, format, startOfMonth, subMonths } from 'date-fns';
import { categorizeIssue } from './aiSavingsEstimation';
import type { BacklogEffortReport, IssueCategory } from './types';

/** 월별 공수 트렌드 단일 포인트 */
export interface MonthlyEffortPoint {
    /** 'YYYY-MM' */
    month: string;
    /** 표시 라벨 (예: '11월') */
    label: string;
    /** 해당 월에 완료된 이슈 수 */
    completedIssues: number;
    /** 해당 월 worklog 합계 (시간) — worklog 있는 이슈만 */
    worklogHours: number;
    /** 해당 월 worklog 인일 환산 */
    worklogManDays: number;
    /** 해당 월 cycle time 평균 (시간) */
    avgCycleHours: number;
    /** worklog 데이터 비율 (0~1) */
    worklogCoverage: number;
}

/**
 * 최근 N개월 공수 트렌드.
 * 데이터 출처:
 *   - worklog 있는 이슈 → 실제 기록 사용 (정확)
 *   - 없는 이슈 → cycle time 산정 보조
 * 정렬: 과거 → 현재
 */
export function getMonthlyEffortTrend(
    issues: JiraIssue[],
    months: number = 6,
    now: Date = new Date()
): MonthlyEffortPoint[] {
    const F = resolveFields();
    const cancelledName = resolveCancelledStatus();
    const rejectedName = resolveRejectedStatus();
    const leaf = filterLeafIssues(issues);

    // 완료(done) 이슈 + 취소/반려 제외
    const resolved = leaf.filter((i) => {
        if (!isBusinessDone(i)) return false;
        const sn = i.fields.status?.name?.trim() ?? '';
        return sn !== cancelledName && sn !== rejectedName;
    });

    // 월별 버킷
    const points: MonthlyEffortPoint[] = [];
    for (let m = months - 1; m >= 0; m--) {
        const target = startOfMonth(subMonths(now, m));
        const monthKey = format(target, 'yyyy-MM');
        points.push({
            month: monthKey,
            label: format(target, 'M월'),
            completedIssues: 0,
            worklogHours: 0,
            worklogManDays: 0,
            avgCycleHours: 0,
            worklogCoverage: 0,
        });
    }

    // 누적 cycle time 합 (avg 산출용)
    const monthCycleSum = new Map<string, { sum: number; count: number; wlCount: number }>();

    for (const issue of resolved) {
        const actual = issue.fields[F.ACTUAL_DONE] as string | undefined;
        const completed = parseLocalDay(actual ?? null) ?? parseLocalDay(issue.fields.resolutiondate ?? null);
        if (!completed) continue;
        const monthKey = format(startOfMonth(completed), 'yyyy-MM');
        const point = points.find((p) => p.month === monthKey);
        if (!point) continue;

        point.completedIssues++;

        // Worklog
        const ts = issue.fields.timespent;
        if (typeof ts === 'number' && ts > 0) {
            const hours = ts / 3600;
            point.worklogHours += hours;
            const cur = monthCycleSum.get(monthKey) ?? { sum: 0, count: 0, wlCount: 0 };
            cur.wlCount++;
            monthCycleSum.set(monthKey, cur);
        }

        // Cycle time
        const created = parseLocalDay(issue.fields.created);
        if (created && completed > created) {
            const hours = Math.max(differenceInHours(completed, created), 1);
            const cur = monthCycleSum.get(monthKey) ?? { sum: 0, count: 0, wlCount: 0 };
            cur.sum += hours;
            cur.count++;
            monthCycleSum.set(monthKey, cur);
        }
    }

    points.forEach((p) => {
        const data = monthCycleSum.get(p.month);
        if (data && data.count > 0) {
            p.avgCycleHours = +(data.sum / data.count).toFixed(1);
        }
        if (p.completedIssues > 0 && data) {
            p.worklogCoverage = +(data.wlCount / p.completedIssues).toFixed(2);
        }
        p.worklogManDays = +(p.worklogHours / 8).toFixed(1);
        p.worklogHours = +p.worklogHours.toFixed(1);
    });

    return points;
}

/** 담당자 × 카테고리 히트맵 셀 */
export interface HeatmapCell {
    assignee: string;
    category: IssueCategory;
    manDays: number;
    issueCount: number;
}

/** 담당자 × 카테고리 히트맵 데이터 */
export interface HeatmapData {
    assignees: string[]; // 정렬된 (총 MD 큰 순)
    categories: IssueCategory[];
    cells: HeatmapCell[];
    /** 행 합계 (담당자별 총 MD) */
    rowTotals: Map<string, number>;
    /** 열 합계 (카테고리별 총 MD) */
    colTotals: Map<IssueCategory, number>;
    /** 단일 셀 max값 (색 강도 normalize용) */
    maxCellManDays: number;
}

/**
 * 활성 백로그의 담당자 × 카테고리 부하 히트맵.
 * - 미할당 이슈는 '미할당'으로 묶음
 * - 빈 카테고리는 자동 제외 (모든 셀 0인 컬럼)
 */
export function getTeamEffortHeatmap(
    activeIssues: JiraIssue[],
    report: BacklogEffortReport
): HeatmapData {
    // 이슈 키 → 담당자 매핑
    const assigneeByKey = new Map<string, string>();
    activeIssues.forEach((i) => {
        const name = i.fields.assignee?.displayName?.trim() || '미할당';
        assigneeByKey.set(i.key, name);
    });

    // 셀 누적: { assignee:category → { manDays, count } }
    const cellMap = new Map<string, { manDays: number; count: number }>();
    const rowTotals = new Map<string, number>();
    const colTotals = new Map<IssueCategory, number>();
    const assigneeSet = new Set<string>();
    const categorySet = new Set<IssueCategory>();

    report.perIssue.forEach((p) => {
        const assignee = assigneeByKey.get(p.issueKey) ?? '미할당';
        const category = categorizeIssue(p.meta?.issueTypeName);
        const manDays = p.hours / 8;
        const cellKey = `${assignee}|${category}`;
        const cur = cellMap.get(cellKey) ?? { manDays: 0, count: 0 };
        cur.manDays += manDays;
        cur.count++;
        cellMap.set(cellKey, cur);
        rowTotals.set(assignee, (rowTotals.get(assignee) ?? 0) + manDays);
        colTotals.set(category, (colTotals.get(category) ?? 0) + manDays);
        assigneeSet.add(assignee);
        categorySet.add(category);
    });

    // 정렬: 행은 총 MD 큰 순, 열은 고정 순서 (story → bug → ...)
    const assignees = Array.from(assigneeSet).sort((a, b) =>
        (rowTotals.get(b) ?? 0) - (rowTotals.get(a) ?? 0)
    );
    const categoryOrder: IssueCategory[] = ['story', 'bug', 'subtask', 'test', 'doc', 'default'];
    const categories = categoryOrder.filter((c) => categorySet.has(c));

    const cells: HeatmapCell[] = [];
    let maxCellManDays = 0;
    assignees.forEach((a) => {
        categories.forEach((c) => {
            const cellKey = `${a}|${c}`;
            const data = cellMap.get(cellKey);
            const manDays = +(data?.manDays ?? 0).toFixed(1);
            const issueCount = data?.count ?? 0;
            cells.push({ assignee: a, category: c, manDays, issueCount });
            if (manDays > maxCellManDays) maxCellManDays = manDays;
        });
    });

    return {
        assignees,
        categories,
        cells,
        rowTotals,
        colTotals,
        maxCellManDays,
    };
}
