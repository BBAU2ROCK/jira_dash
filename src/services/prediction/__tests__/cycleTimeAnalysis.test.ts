import { describe, it, expect } from 'vitest';
import { extractActiveCycleHours, computeCycleTimeByType } from '../cycleTimeAnalysis';
import type { JiraIssue } from '@/api/jiraClient';

interface ChangelogEntry {
    created: string;
    items: { field: string; fromString?: string; toString?: string }[];
}

function makeIssue(opts: {
    type?: string;
    created?: string;
    resolutiondate?: string;
    histories?: ChangelogEntry[];
} = {}): JiraIssue & { changelog?: { histories: ChangelogEntry[] } } {
    return {
        id: 'I',
        key: 'I-1',
        fields: {
            summary: 'I-1',
            issuetype: { name: opts.type ?? '할 일', iconUrl: '', subtask: false },
            status: { name: 'Done', statusCategory: { key: 'done', colorName: 'green' } },
            created: opts.created ?? '2026-04-01',
            resolutiondate: opts.resolutiondate,
        },
        changelog: opts.histories ? { histories: opts.histories } : undefined,
    } as unknown as JiraIssue & { changelog?: { histories: ChangelogEntry[] } };
}

describe('extractActiveCycleHours', () => {
    it('changelog 없음 → null', () => {
        expect(extractActiveCycleHours(makeIssue({}))).toBeNull();
    });

    it('In Progress → Done 단순 케이스', () => {
        const issue = makeIssue({
            histories: [
                { created: '2026-04-01T10:00:00Z', items: [{ field: 'status', toString: 'In Progress' }] },
                { created: '2026-04-03T10:00:00Z', items: [{ field: 'status', toString: 'Done' }] },
            ],
        });
        expect(extractActiveCycleHours(issue)).toBe(48);
    });

    it('한국어 상태명 인식 (진행 중·완료)', () => {
        const issue = makeIssue({
            histories: [
                { created: '2026-04-01T00:00:00Z', items: [{ field: 'status', toString: '진행 중' }] },
                { created: '2026-04-02T00:00:00Z', items: [{ field: 'status', toString: '완료' }] },
            ],
        });
        expect(extractActiveCycleHours(issue)).toBe(24);
    });

    it('In Progress → 다른 상태 → 다시 In Progress → Done — 첫 시점 사용', () => {
        const issue = makeIssue({
            histories: [
                { created: '2026-04-01T00:00:00Z', items: [{ field: 'status', toString: 'In Progress' }] },
                { created: '2026-04-02T00:00:00Z', items: [{ field: 'status', toString: 'Blocked' }] },
                { created: '2026-04-03T00:00:00Z', items: [{ field: 'status', toString: 'In Progress' }] },
                { created: '2026-04-05T00:00:00Z', items: [{ field: 'status', toString: 'Done' }] },
            ],
        });
        // 첫 In Progress (4/1) → Done (4/5) = 96h
        expect(extractActiveCycleHours(issue)).toBe(96);
    });

    it('done 상태 도달 안 함 → null', () => {
        const issue = makeIssue({
            histories: [
                { created: '2026-04-01T00:00:00Z', items: [{ field: 'status', toString: 'In Progress' }] },
            ],
        });
        expect(extractActiveCycleHours(issue)).toBeNull();
    });
});

describe('computeCycleTimeByType', () => {
    it('타입별 그룹핑 + sample size 정렬', () => {
        const issues = [
            ...Array(3).fill(0).map((_, i) =>
                makeIssue({
                    type: '할 일',
                    created: '2026-04-01T00:00:00Z',
                    resolutiondate: `2026-04-0${2 + i}T00:00:00Z`,
                    histories: [
                        { created: '2026-04-01T00:00:00Z', items: [{ field: 'status', toString: 'In Progress' }] },
                        { created: `2026-04-0${2 + i}T00:00:00Z`, items: [{ field: 'status', toString: 'Done' }] },
                    ],
                })
            ),
            makeIssue({
                type: '결함',
                created: '2026-04-01T00:00:00Z',
                resolutiondate: '2026-04-04T00:00:00Z',
                histories: [
                    { created: '2026-04-01T00:00:00Z', items: [{ field: 'status', toString: 'In Progress' }] },
                    { created: '2026-04-04T00:00:00Z', items: [{ field: 'status', toString: 'Done' }] },
                ],
            }),
        ];
        const stats = computeCycleTimeByType(issues);
        expect(stats[0].type).toBe('할 일'); // sample 큰 순
        expect(stats[0].sampleSize).toBe(3);
        expect(stats[1].type).toBe('결함');
        expect(stats[1].activeMeanH).toBe(72);
    });

    it('빈 입력', () => {
        expect(computeCycleTimeByType([])).toEqual([]);
    });

    it('changelog 없는 이슈도 lead time만으로 통계 가능', () => {
        const issues = [
            makeIssue({ type: '할 일', created: '2026-04-01T00:00:00Z', resolutiondate: '2026-04-03T00:00:00Z' }),
        ];
        const stats = computeCycleTimeByType(issues);
        expect(stats[0].leadMeanH).toBe(48);
        expect(stats[0].activeMeanH).toBe(0);
    });
});
