/**
 * useManagerBrief — v1.0.28
 *
 * 일일 브리프: 어제·오늘·내일 핵심 지표.
 * 모든 데이터는 기존 issues에서 합성. 추가 API 호출 없음.
 */
import { useMemo } from 'react';
import type { JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues, getStatusCategoryKey, isBusinessDone } from '@/lib/jira-helpers';
import { parseLocalDay } from '@/lib/date-utils';
import { resolveCancelledStatus, resolveRejectedStatus, resolveFields } from '@/lib/kpi-rules-resolver';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ManagerBrief {
    /** 어제 완료 건수 */
    yesterdayCompleted: number;
    /** 어제 신규 등록 건수 */
    yesterdayCreated: number;
    /** 오늘 진행 중 (status=indeterminate) */
    todayInProgress: number;
    /** 오늘이 마감 (D-0) */
    todayDue: number;
    /** 마감 임박 (D-1 ~ D-3) */
    dueSoonNext3Days: number;
    /** 오늘 시작 예정 (계획 시작일 = 오늘) */
    todayStarting: number;
    /** 내일 시작 예정 */
    tomorrowStarting: number;
    /** 7일 신규 등록 */
    weekCreated: number;
    /** 7일 완료 */
    weekCompleted: number;
    /** 7일간 진척률 (0~100) — 완료/총 */
    weekProgressRate: number;
    /** 어제 완료 이슈 (상세 클릭용) */
    yesterdayCompletedIssues: JiraIssue[];
    /** 오늘 마감 이슈 (D-0) */
    todayDueIssues: JiraIssue[];
    /** 오늘 시작 예정 이슈 */
    todayStartingIssues: JiraIssue[];
}

export function useManagerBrief(issues: JiraIssue[] | null | undefined, nowOpt?: Date): ManagerBrief {
    return useMemo(() => {
        const empty: ManagerBrief = {
            yesterdayCompleted: 0, yesterdayCreated: 0, todayInProgress: 0,
            todayDue: 0, dueSoonNext3Days: 0, todayStarting: 0, tomorrowStarting: 0,
            weekCreated: 0, weekCompleted: 0, weekProgressRate: 0,
            yesterdayCompletedIssues: [], todayDueIssues: [], todayStartingIssues: [],
        };
        if (!issues || issues.length === 0) return empty;

        const now = nowOpt ?? new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - DAY_MS);
        const tomorrow = new Date(today.getTime() + DAY_MS);
        const weekAgo = new Date(today.getTime() - 7 * DAY_MS);

        const cancelledName = resolveCancelledStatus();
        const rejectedName = resolveRejectedStatus();
        const plannedStartField = resolveFields().PLANNED_START;
        const actualDoneField = resolveFields().ACTUAL_DONE;

        const isCompleted = (i: JiraIssue) => {
            if (!isBusinessDone(i)) return false;
            const sn = i.fields.status?.name?.trim() ?? '';
            return sn !== cancelledName && sn !== rejectedName;
        };
        const sameDay = (a: Date, b: Date) =>
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();

        const leaf = filterLeafIssues(issues);

        const yesterdayCompletedIssues: JiraIssue[] = [];
        const todayDueIssues: JiraIssue[] = [];
        const todayStartingIssues: JiraIssue[] = [];
        let yesterdayCreated = 0;
        let todayInProgress = 0;
        let todayDue = 0;
        let dueSoonNext3Days = 0;
        let todayStarting = 0;
        let tomorrowStarting = 0;
        let weekCreated = 0;
        let weekCompleted = 0;

        for (const i of leaf) {
            const created = parseLocalDay(i.fields.created ?? null);
            const due = parseLocalDay(i.fields.duedate ?? null);
            // dynamic custom field access — JiraIssue.fields는 [key: string]: any 인덱스 시그니처 보유.
            const planStart = parseLocalDay(i.fields[plannedStartField] as string | undefined ?? null);
            const actualDone = parseLocalDay(i.fields[actualDoneField] as string | undefined ?? null)
                ?? parseLocalDay(i.fields.resolutiondate ?? null);

            // 어제 신규
            if (created && sameDay(created, yesterday)) yesterdayCreated++;
            // 7일 신규
            if (created && created >= weekAgo) weekCreated++;

            // 어제 완료
            if (isCompleted(i) && actualDone) {
                if (sameDay(actualDone, yesterday)) {
                    yesterdayCompletedIssues.push(i);
                }
                if (actualDone >= weekAgo) weekCompleted++;
            }

            // 오늘 진행 중
            if (getStatusCategoryKey(i) === 'indeterminate') todayInProgress++;

            // 오늘 마감
            if (due && sameDay(due, today) && !isCompleted(i)) {
                todayDue++;
                todayDueIssues.push(i);
            }

            // D-1~D-3
            if (due && !isCompleted(i)) {
                const days = Math.floor((due.getTime() - today.getTime()) / DAY_MS);
                if (days >= 1 && days <= 3) dueSoonNext3Days++;
            }

            // 오늘 시작 예정 (계획 시작 = 오늘)
            if (planStart && sameDay(planStart, today)) {
                todayStarting++;
                todayStartingIssues.push(i);
            }
            // 내일 시작 예정
            if (planStart && sameDay(planStart, tomorrow)) tomorrowStarting++;
        }

        const weekTotal = weekCreated + weekCompleted; // 분모로 활용
        const weekProgressRate = weekTotal > 0
            ? Math.round((weekCompleted / Math.max(weekTotal, weekCreated, 1)) * 100)
            : 0;

        return {
            yesterdayCompleted: yesterdayCompletedIssues.length,
            yesterdayCreated,
            todayInProgress,
            todayDue,
            dueSoonNext3Days,
            todayStarting,
            tomorrowStarting,
            weekCreated,
            weekCompleted,
            weekProgressRate,
            yesterdayCompletedIssues,
            todayDueIssues,
            todayStartingIssues,
        };
    }, [issues, nowOpt]);
}
