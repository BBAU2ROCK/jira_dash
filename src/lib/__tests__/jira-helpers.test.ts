import { describe, it, expect } from 'vitest';
import { filterLeafIssues, getStatusCategoryKey } from '../jira-helpers';
import type { JiraIssue } from '../../api/jiraClient';

function issue(key: string, opts: { parentKey?: string; subtaskKeys?: string[]; statusCategory?: string } = {}): JiraIssue {
    return {
        id: key,
        key,
        fields: {
            summary: key,
            status: {
                name: 'Open',
                statusCategory: { key: opts.statusCategory ?? 'new', colorName: 'gray' },
            },
            issuetype: { name: '할 일', iconUrl: '', subtask: !!opts.parentKey },
            parent: opts.parentKey
                ? { id: opts.parentKey, key: opts.parentKey, fields: { summary: opts.parentKey } }
                : undefined,
            subtasks: opts.subtaskKeys?.map((k) => ({
                id: k,
                key: k,
                fields: { summary: k },
            })) as JiraIssue[] | undefined,
            created: '2024-01-01T00:00:00.000+0900',
        },
    } as unknown as JiraIssue;
}

describe('filterLeafIssues', () => {
    it('빈 배열', () => {
        expect(filterLeafIssues([])).toEqual([]);
    });

    it('할 일만 있는 경우 모두 카운트', () => {
        const issues = [issue('A-1'), issue('A-2')];
        const result = filterLeafIssues(issues);
        expect(result.map((i) => i.key)).toEqual(['A-1', 'A-2']);
    });

    it('부모(subtasks 보유) 제외, 하위만 카운트', () => {
        const parent = issue('A-1', { subtaskKeys: ['A-2', 'A-3'] });
        const sub1 = issue('A-2', { parentKey: 'A-1' });
        const sub2 = issue('A-3', { parentKey: 'A-1' });
        const result = filterLeafIssues([parent, sub1, sub2]);
        expect(result.map((i) => i.key).sort()).toEqual(['A-2', 'A-3']);
    });

    it('parent.key로도 부모 식별 (subtasks 필드 미수신 케이스)', () => {
        // 부모 자체는 subtasks 필드가 비어 있지만 자식이 parent.key로 가리킴
        const parent = issue('A-1');
        const sub = issue('A-2', { parentKey: 'A-1' });
        const result = filterLeafIssues([parent, sub]);
        expect(result.map((i) => i.key)).toEqual(['A-2']);
    });

    it('혼합: 일부 부모는 자식 있음, 일부는 단독', () => {
        const issues = [
            issue('A-1', { subtaskKeys: ['A-2'] }), // 부모 → 제외
            issue('A-2', { parentKey: 'A-1' }), // 하위 → 포함
            issue('A-3'), // 단독 → 포함
            issue('A-4'), // 단독 → 포함
        ];
        const result = filterLeafIssues(issues);
        expect(result.map((i) => i.key).sort()).toEqual(['A-2', 'A-3', 'A-4']);
    });

    it('빈 subtasks 배열은 leaf로 처리', () => {
        const issue1 = issue('A-1', { subtaskKeys: [] });
        const result = filterLeafIssues([issue1]);
        expect(result).toHaveLength(1);
    });
});

describe('getStatusCategoryKey', () => {
    it('정상 케이스', () => {
        expect(getStatusCategoryKey(issue('A-1', { statusCategory: 'done' }))).toBe('done');
    });

    it('statusCategory 누락 시 undefined 반환 (크래시 방지)', () => {
        const broken = {
            id: 'A-1',
            key: 'A-1',
            fields: {
                summary: 'A-1',
                status: { name: 'Foo' }, // statusCategory 없음
                issuetype: { name: '할 일', iconUrl: '', subtask: false },
                created: '2024-01-01T00:00:00.000+0900',
            },
        } as unknown as JiraIssue;
        expect(getStatusCategoryKey(broken)).toBeUndefined();
    });
});
