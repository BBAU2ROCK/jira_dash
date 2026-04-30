import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRiskAnalysis } from '../useRiskAnalysis';
import { useKpiRulesStore } from '../../stores/kpiRulesStore';
import type { JiraIssue } from '@/api/jiraClient';

const NOW = new Date(2026, 3, 30); // 2026-04-30 (수)

let nextKey = 100;
function makeIssue(opts: {
    key?: string;
    statusCategory?: 'done' | 'indeterminate' | 'new';
    statusName?: string;
    assignee?: { name: string } | null;
    duedate?: string;
    created?: string;
    updated?: string;
    resolutiondate?: string;
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
            ? { accountId: 'a', displayName: opts.assignee.name, avatarUrls: { '48x48': '' } }
            : undefined,
        created: opts.created ?? '2026-04-01',
        updated: opts.updated ?? opts.created ?? '2026-04-30',
        duedate: opts.duedate,
        resolutiondate: opts.resolutiondate,
    };
    return { id: key, key, fields } as unknown as JiraIssue;
}

beforeEach(() => {
    nextKey = 100;
    useKpiRulesStore.getState().resetToDefault();
});

describe('useRiskAnalysis', () => {
    it('null/empty issues → 모든 카운트 0', () => {
        const { result: r1 } = renderHook(() => useRiskAnalysis(null));
        expect(r1.current.totalCount).toBe(0);
        const { result: r2 } = renderHook(() => useRiskAnalysis([]));
        expect(r2.current.totalCount).toBe(0);
        expect(r2.current.dueSoon).toHaveLength(0);
        expect(r2.current.overload).toHaveLength(0);
    });

    describe('카드 1: 마감 임박 (D-3 이내)', () => {
        it('D-0/D-1/D-3은 포함, D-4는 제외, 음수(이미 지남)는 제외', () => {
            const issues = [
                makeIssue({ duedate: '2026-04-30' }),  // D-0
                makeIssue({ duedate: '2026-05-01' }),  // D-1
                makeIssue({ duedate: '2026-05-03' }),  // D-3
                makeIssue({ duedate: '2026-05-04' }),  // D-4 (제외)
                makeIssue({ duedate: '2026-04-29' }),  // 지남 (제외)
            ];
            const { result } = renderHook(() => useRiskAnalysis(issues, { now: NOW }));
            expect(result.current.dueSoon).toHaveLength(3);
            const metas = result.current.dueSoon.map((i) => i.meta);
            expect(metas).toContain('D-0 (오늘)');
            expect(metas).toContain('D-1');
            expect(metas).toContain('D-3');
        });
        it('완료된 이슈는 제외', () => {
            const issues = [
                makeIssue({ duedate: '2026-04-30', statusCategory: 'done', statusName: '완료' }),
                makeIssue({ duedate: '2026-04-30', statusCategory: 'indeterminate' }),
            ];
            const { result } = renderHook(() => useRiskAnalysis(issues, { now: NOW }));
            expect(result.current.dueSoon).toHaveLength(1);
        });
    });

    describe('카드 2: Stale (7일 무변동)', () => {
        it('updated 7일 이상이면 stale', () => {
            const issues = [
                makeIssue({ updated: '2026-04-23' }),  // 7일 전 = stale
                makeIssue({ updated: '2026-04-22' }),  // 8일 전 = stale
                makeIssue({ updated: '2026-04-25' }),  // 5일 전 = OK
                makeIssue({ updated: '2026-04-30' }),  // 오늘 = OK
            ];
            const { result } = renderHook(() => useRiskAnalysis(issues, { now: NOW }));
            expect(result.current.stale).toHaveLength(2);
        });
        it('완료된 이슈는 제외', () => {
            const issues = [
                makeIssue({ updated: '2026-04-20', statusCategory: 'done', statusName: '완료' }),
                makeIssue({ updated: '2026-04-20', statusCategory: 'indeterminate' }),
            ];
            const { result } = renderHook(() => useRiskAnalysis(issues, { now: NOW }));
            expect(result.current.stale).toHaveLength(1);
        });
        it('내림차순 정렬 (가장 오래된 stale이 위)', () => {
            const issues = [
                makeIssue({ key: 'A', updated: '2026-04-23' }),  // 7일
                makeIssue({ key: 'B', updated: '2026-04-15' }),  // 15일
                makeIssue({ key: 'C', updated: '2026-04-20' }),  // 10일
            ];
            const { result } = renderHook(() => useRiskAnalysis(issues, { now: NOW }));
            const keys = result.current.stale.map((i) => i.issue.key);
            expect(keys).toEqual(['B', 'C', 'A']);
        });
    });

    describe('카드 3: 미배정 방치', () => {
        it('assignee 없음 + created 3일 초과', () => {
            const issues = [
                makeIssue({ assignee: null, created: '2026-04-26' }),  // 4일 = 방치
                makeIssue({ assignee: null, created: '2026-04-28' }),  // 2일 = OK
                makeIssue({ assignee: { name: '심보현' }, created: '2026-04-15' }),  // 배정됨
            ];
            const { result } = renderHook(() => useRiskAnalysis(issues, { now: NOW }));
            expect(result.current.unassigned).toHaveLength(1);
        });
    });

    describe('카드 4: 보류 장기', () => {
        it('status=보류 + updated 7일 초과', () => {
            const issues = [
                makeIssue({ statusName: '보류', updated: '2026-04-20' }),  // 10일 = 장기
                makeIssue({ statusName: '보류', updated: '2026-04-28' }),  // 2일 = OK
                makeIssue({ statusName: 'Open', updated: '2026-04-15' }),  // 보류 아님
            ];
            const { result } = renderHook(() => useRiskAnalysis(issues, { now: NOW }));
            expect(result.current.longOnHold).toHaveLength(1);
        });
    });

    describe('카드 5: 과부하 인원', () => {
        it('1인 동시 진행 5건 이상', () => {
            const issues = [
                ...Array.from({ length: 5 }, () =>
                    makeIssue({ statusCategory: 'indeterminate', assignee: { name: '심보현' } })
                ),
                ...Array.from({ length: 4 }, () =>
                    makeIssue({ statusCategory: 'indeterminate', assignee: { name: '김영재' } })
                ),
            ];
            const { result } = renderHook(() => useRiskAnalysis(issues, { now: NOW }));
            expect(result.current.overload).toHaveLength(1);
            expect(result.current.overload[0].displayName).toBe('심보현');
            expect(result.current.overload[0].inProgress).toBe(5);
        });
        it('보류는 in-progress에서 제외', () => {
            const issues = [
                makeIssue({ statusCategory: 'indeterminate', assignee: { name: '심보현' } }),
                makeIssue({ statusCategory: 'indeterminate', assignee: { name: '심보현' } }),
                makeIssue({ statusCategory: 'indeterminate', assignee: { name: '심보현' } }),
                makeIssue({ statusCategory: 'indeterminate', assignee: { name: '심보현' } }),
                makeIssue({ statusCategory: 'indeterminate', statusName: '보류', assignee: { name: '심보현' } }),
                makeIssue({ statusCategory: 'indeterminate', statusName: '보류', assignee: { name: '심보현' } }),
            ];
            const { result } = renderHook(() => useRiskAnalysis(issues, { now: NOW }));
            // 보류 2건 제외 → 4건만 in-progress → 임계값 5 미달 → overload 0
            expect(result.current.overload).toHaveLength(0);
        });
    });

    describe('카드 6: Scope creep', () => {
        it('최근 7일 신규/완료 비율 1.5 초과 시 경고', () => {
            const issues = [
                ...Array.from({ length: 10 }, () =>
                    makeIssue({ created: '2026-04-28' })  // 신규 10
                ),
                makeIssue({
                    statusCategory: 'done',
                    statusName: '완료',
                    resolutiondate: '2026-04-28',
                }),  // 완료 1
            ];
            const { result } = renderHook(() => useRiskAnalysis(issues, { now: NOW }));
            // 7일 안 신규 11건 (완료 이슈도 created), 완료 1건 → 비율 11
            expect(result.current.scopeCreepRatio).toBeGreaterThan(1.5);
            expect(result.current.isScopeCreep).toBe(true);
        });
        it('완료가 더 많으면 경고 X', () => {
            const issues = Array.from({ length: 5 }, () =>
                makeIssue({
                    statusCategory: 'done',
                    statusName: '완료',
                    created: '2026-04-26',
                    resolutiondate: '2026-04-28',
                })
            );
            const { result } = renderHook(() => useRiskAnalysis(issues, { now: NOW }));
            expect(result.current.scopeCreepRatio).toBe(1);
            expect(result.current.isScopeCreep).toBe(false);
        });
    });

    describe('totalCount 합산', () => {
        it('각 카드 카운트 + scope creep boolean', () => {
            const issues = [
                makeIssue({ duedate: '2026-04-30' }),                  // dueSoon 1
                makeIssue({ updated: '2026-04-15' }),                   // stale 1
                makeIssue({ assignee: null, created: '2026-04-20' }),  // unassigned 1
            ];
            const { result } = renderHook(() => useRiskAnalysis(issues, { now: NOW }));
            // dueSoon 1건의 issue도 stale에 포함될 수 있음 (updated 명시 안 했으면 created 사용)
            // 정확한 카운트보단 totalCount 가 sum 인지 확인
            const sum =
                result.current.dueSoon.length +
                result.current.stale.length +
                result.current.unassigned.length +
                result.current.longOnHold.length +
                result.current.overload.length +
                (result.current.isScopeCreep ? 1 : 0);
            expect(result.current.totalCount).toBe(sum);
        });
    });
});
