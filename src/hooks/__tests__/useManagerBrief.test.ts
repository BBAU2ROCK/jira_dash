import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useManagerBrief } from '../useManagerBrief';
import { useKpiRulesStore } from '../../stores/kpiRulesStore';
import type { JiraIssue } from '@/api/jiraClient';

const NOW = new Date(2026, 3, 30); // 2026-04-30 (수)

let nextKey = 200;
function makeIssue(opts: {
    key?: string;
    statusCategory?: 'done' | 'indeterminate' | 'new';
    statusName?: string;
    duedate?: string;
    created?: string;
    resolutiondate?: string;
    plannedStart?: string;
    actualDone?: string;
    assignee?: string;
} = {}): JiraIssue {
    const key = opts.key ?? `IGMU-${nextKey++}`;
    const fields: Record<string, unknown> = {
        summary: key,
        status: {
            name: opts.statusName ?? (opts.statusCategory === 'done' ? '완료' : 'Open'),
            statusCategory: { key: opts.statusCategory ?? 'new', colorName: 'gray' },
        },
        issuetype: { name: '할 일', iconUrl: '', subtask: false },
        assignee: opts.assignee
            ? { accountId: 'a', displayName: opts.assignee, avatarUrls: { '48x48': '' } }
            : undefined,
        created: opts.created ?? '2026-04-01',
        duedate: opts.duedate,
        resolutiondate: opts.resolutiondate,
        customfield_11481: opts.plannedStart,
        customfield_11485: opts.actualDone,
    };
    return { id: key, key, fields } as unknown as JiraIssue;
}

beforeEach(() => {
    nextKey = 200;
    useKpiRulesStore.getState().resetToDefault();
});

describe('useManagerBrief', () => {
    it('null/empty issues → 모든 0', () => {
        const { result: r1 } = renderHook(() => useManagerBrief(null, NOW));
        expect(r1.current.yesterdayCompleted).toBe(0);
        expect(r1.current.weekCompleted).toBe(0);
        const { result: r2 } = renderHook(() => useManagerBrief([], NOW));
        expect(r2.current.todayDue).toBe(0);
    });

    it('어제 완료 — resolutiondate가 어제(=2026-04-29)인 완료만 카운트', () => {
        const issues = [
            makeIssue({ statusCategory: 'done', statusName: '완료', resolutiondate: '2026-04-29' }),
            makeIssue({ statusCategory: 'done', statusName: '완료', resolutiondate: '2026-04-29' }),
            makeIssue({ statusCategory: 'done', statusName: '완료', resolutiondate: '2026-04-30' }),  // 오늘
            makeIssue({ statusCategory: 'done', statusName: '완료', resolutiondate: '2026-04-28' }),  // 그저께
        ];
        const { result } = renderHook(() => useManagerBrief(issues, NOW));
        expect(result.current.yesterdayCompleted).toBe(2);
        expect(result.current.yesterdayCompletedIssues).toHaveLength(2);
    });

    it('취소·반려는 어제 완료 카운트에서 제외', () => {
        const issues = [
            makeIssue({ statusCategory: 'done', statusName: '완료', resolutiondate: '2026-04-29' }),
            makeIssue({ statusCategory: 'done', statusName: '취소', resolutiondate: '2026-04-29' }),
            makeIssue({ statusCategory: 'done', statusName: '반려', resolutiondate: '2026-04-29' }),
        ];
        const { result } = renderHook(() => useManagerBrief(issues, NOW));
        expect(result.current.yesterdayCompleted).toBe(1);
    });

    it('어제 신규 등록', () => {
        const issues = [
            makeIssue({ created: '2026-04-29' }),
            makeIssue({ created: '2026-04-29' }),
            makeIssue({ created: '2026-04-30' }),
            makeIssue({ created: '2026-04-15' }),
        ];
        const { result } = renderHook(() => useManagerBrief(issues, NOW));
        expect(result.current.yesterdayCreated).toBe(2);
    });

    it('오늘 마감 (D-0) 미완료만', () => {
        const issues = [
            makeIssue({ duedate: '2026-04-30' }),  // 오늘 마감, 미완료
            makeIssue({ duedate: '2026-04-30' }),
            makeIssue({ duedate: '2026-04-30', statusCategory: 'done', statusName: '완료' }),  // 완료 → 제외
            makeIssue({ duedate: '2026-05-01' }),  // 내일 → 제외
        ];
        const { result } = renderHook(() => useManagerBrief(issues, NOW));
        expect(result.current.todayDue).toBe(2);
        expect(result.current.todayDueIssues).toHaveLength(2);
    });

    it('마감 임박 (D-1 ~ D-3)', () => {
        const issues = [
            makeIssue({ duedate: '2026-05-01' }),   // D-1
            makeIssue({ duedate: '2026-05-02' }),   // D-2
            makeIssue({ duedate: '2026-05-03' }),   // D-3
            makeIssue({ duedate: '2026-05-04' }),   // D-4 (제외)
            makeIssue({ duedate: '2026-04-30' }),   // D-0 (todayDue로 가고 dueSoon 제외)
        ];
        const { result } = renderHook(() => useManagerBrief(issues, NOW));
        expect(result.current.dueSoonNext3Days).toBe(3);
    });

    it('오늘/내일 시작 예정 (계획 시작일 = customfield_11481)', () => {
        const issues = [
            makeIssue({ plannedStart: '2026-04-30' }),  // 오늘
            makeIssue({ plannedStart: '2026-04-30' }),
            makeIssue({ plannedStart: '2026-05-01' }),  // 내일
            makeIssue({ plannedStart: '2026-04-29' }),  // 과거
        ];
        const { result } = renderHook(() => useManagerBrief(issues, NOW));
        expect(result.current.todayStarting).toBe(2);
        expect(result.current.tomorrowStarting).toBe(1);
        expect(result.current.todayStartingIssues).toHaveLength(2);
    });

    it('7일 신규/완료 합산', () => {
        const issues = [
            makeIssue({ created: '2026-04-25' }),  // 5일 전
            makeIssue({ created: '2026-04-30' }),
            makeIssue({ created: '2026-04-23' }),  // 7일 전
            makeIssue({ created: '2026-04-20' }),  // 10일 전 (제외)
            makeIssue({
                statusCategory: 'done', statusName: '완료',
                created: '2026-04-25', resolutiondate: '2026-04-28',
            }),  // 7일 신규 + 완료
        ];
        const { result } = renderHook(() => useManagerBrief(issues, NOW));
        expect(result.current.weekCreated).toBe(4);
        expect(result.current.weekCompleted).toBe(1);
    });

    it('진행 중 카운트 (status indeterminate)', () => {
        const issues = [
            makeIssue({ statusCategory: 'indeterminate' }),
            makeIssue({ statusCategory: 'indeterminate' }),
            makeIssue({ statusCategory: 'indeterminate', statusName: '보류' }),  // 보류도 indeterminate면 포함
            makeIssue({ statusCategory: 'new' }),
            makeIssue({ statusCategory: 'done' }),
        ];
        const { result } = renderHook(() => useManagerBrief(issues, NOW));
        expect(result.current.todayInProgress).toBe(3);
    });
});
