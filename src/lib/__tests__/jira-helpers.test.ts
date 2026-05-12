import { describe, it, expect } from 'vitest';
import { filterLeafIssues, getStatusCategoryKey, isBusinessDone } from '../jira-helpers';
import type { JiraIssue } from '../../api/jiraClient';
import { JIRA_CONFIG } from '@/config/jiraConfig';

const ACTUAL_DONE = JIRA_CONFIG.FIELDS.ACTUAL_DONE; // customfield_11485

function issue(
    key: string,
    opts: {
        parentKey?: string;
        subtaskKeys?: string[];
        statusCategory?: string;
        actualDone?: string | null;
    } = {}
): JiraIssue {
    const fields: Record<string, unknown> = {
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
        })),
        created: '2024-01-01T00:00:00.000+0900',
    };
    if (opts.actualDone !== undefined) fields[ACTUAL_DONE] = opts.actualDone;
    return { id: key, key, fields } as unknown as JiraIssue;
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

describe('isBusinessDone (v1.0.39 통일 정책)', () => {
    it('status 카테고리 done → true', () => {
        expect(isBusinessDone(issue('A-1', { statusCategory: 'done' }))).toBe(true);
    });

    it('status 카테고리 done + customfield_11485 없음 → true', () => {
        expect(isBusinessDone(issue('A-1', { statusCategory: 'done', actualDone: null }))).toBe(true);
    });

    it('status 카테고리 indeterminate + customfield_11485 채워짐 → true (검증 단계 시나리오)', () => {
        const i = issue('A-1', { statusCategory: 'indeterminate', actualDone: '2026-04-28' });
        expect(isBusinessDone(i)).toBe(true);
    });

    it('status 카테고리 indeterminate + customfield_11485 비어있음 → false', () => {
        const i = issue('A-1', { statusCategory: 'indeterminate', actualDone: '' });
        expect(isBusinessDone(i)).toBe(false);
    });

    it('status 카테고리 indeterminate + customfield_11485 공백만 → false (trim 처리)', () => {
        const i = issue('A-1', { statusCategory: 'indeterminate', actualDone: '   ' });
        expect(isBusinessDone(i)).toBe(false);
    });

    it('status 카테고리 new + customfield_11485 채워짐 → true', () => {
        const i = issue('A-1', { statusCategory: 'new', actualDone: '2026-04-28' });
        expect(isBusinessDone(i)).toBe(true);
    });

    it('status 카테고리 new + customfield_11485 없음 → false', () => {
        const i = issue('A-1', { statusCategory: 'new' });
        expect(isBusinessDone(i)).toBe(false);
    });
});
