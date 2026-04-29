import { describe, it, expect, afterEach } from 'vitest';
import { extractSubAssignees, buildSubAssigneeMap, SUB_ASSIGNEE_WEIGHT } from '../sub-assignee-utils';
import type { JiraIssue } from '@/api/jiraClient';
import { JIRA_CONFIG } from '@/config/jiraConfig';
import { useKpiRulesStore } from '@/stores/kpiRulesStore';

const SUB_FIELD = JIRA_CONFIG.FIELDS.SUB_ASSIGNEE; // customfield_11482

function makeIssue(opts: {
    key?: string;
    assignee?: { accountId?: string; displayName: string } | null;
    subAssignees?: Array<{ accountId?: string; displayName: string }>;
}): JiraIssue {
    const fields: Record<string, unknown> = {
        summary: opts.key ?? 'T',
        status: { name: 'Done', statusCategory: { key: 'done', colorName: 'green' } },
        issuetype: { name: '할 일', iconUrl: '', subtask: false },
        created: '2024-01-01T00:00:00Z',
        assignee: opts.assignee === undefined
            ? { accountId: 'main1', displayName: '홍길동' }
            : opts.assignee,
    };
    if (opts.subAssignees) fields[SUB_FIELD] = opts.subAssignees;
    return { id: opts.key ?? 'T', key: opts.key ?? 'T', fields } as unknown as JiraIssue;
}

describe('SUB_ASSIGNEE_WEIGHT', () => {
    it('기본값 0.5', () => {
        expect(SUB_ASSIGNEE_WEIGHT).toBe(0.5);
    });
});

describe('extractSubAssignees', () => {
    afterEach(() => {
        useKpiRulesStore.getState().resetToDefault();
    });

    it('서브담당자 없으면 빈 배열', () => {
        const issue = makeIssue({});
        expect(extractSubAssignees(issue)).toEqual([]);
    });

    it('빈 배열 필드면 빈 배열', () => {
        const issue = makeIssue({ subAssignees: [] });
        expect(extractSubAssignees(issue)).toEqual([]);
    });

    it('단일 서브 추출 — accountId 우선', () => {
        const issue = makeIssue({
            subAssignees: [{ accountId: 'sub1', displayName: '김철수' }],
        });
        const subs = extractSubAssignees(issue);
        expect(subs.length).toBe(1);
        expect(subs[0]).toEqual({ key: 'id:sub1', accountId: 'sub1', label: '김철수' });
    });

    it('다중 서브 추출 + 중복 key 제거', () => {
        const issue = makeIssue({
            subAssignees: [
                { accountId: 'sub1', displayName: '김철수' },
                { accountId: 'sub2', displayName: '이영희' },
                { accountId: 'sub1', displayName: '김철수' }, // 중복
            ],
        });
        const subs = extractSubAssignees(issue);
        expect(subs.length).toBe(2);
        expect(subs.map((s) => s.label)).toEqual(['김철수', '이영희']);
    });

    it('accountId 없이 displayName만 있으면 이름 기반 key', () => {
        const issue = makeIssue({
            subAssignees: [{ displayName: '박지수' }],
        });
        const subs = extractSubAssignees(issue);
        expect(subs.length).toBe(1);
        expect(subs[0].key).toBe('n:박지수');
        expect(subs[0].accountId).toBeUndefined();
    });

    it('store에서 SUB_ASSIGNEE 필드 ID 변경 시 다른 필드 사용', () => {
        useKpiRulesStore.setState({
            rules: {
                ...useKpiRulesStore.getState().rules,
                fields: {
                    ...useKpiRulesStore.getState().rules.fields,
                    subAssignee: 'customfield_99999',
                },
            },
        });
        // 기본 필드(11482)에 데이터가 있어도 store가 99999 가리키므로 무시
        const issue = makeIssue({
            subAssignees: [{ displayName: '심보현' }],
        });
        expect(extractSubAssignees(issue)).toEqual([]);
    });

    it('빈 문자열 SUB_ASSIGNEE 필드면 기능 비활성', () => {
        useKpiRulesStore.setState({
            rules: {
                ...useKpiRulesStore.getState().rules,
                fields: {
                    ...useKpiRulesStore.getState().rules.fields,
                    subAssignee: '',
                },
            },
        });
        const issue = makeIssue({
            subAssignees: [{ accountId: 'sub1', displayName: '김철수' }],
        });
        expect(extractSubAssignees(issue)).toEqual([]);
    });
});

describe('buildSubAssigneeMap', () => {
    afterEach(() => {
        useKpiRulesStore.getState().resetToDefault();
    });

    it('빈 이슈 배열 → 빈 Map', () => {
        const m = buildSubAssigneeMap([]);
        expect(m.size).toBe(0);
    });

    it('단일 이슈 단일 서브 → 1 entry', () => {
        const issues = [
            makeIssue({
                key: 'T-1',
                assignee: { accountId: 'main1', displayName: '이찬웅' },
                subAssignees: [{ accountId: 'sub1', displayName: '김휘령' }],
            }),
        ];
        const m = buildSubAssigneeMap(issues);
        expect(m.size).toBe(1);
        const entry = m.get('id:sub1');
        expect(entry?.displayName).toBe('김휘령');
        expect(entry?.issues.length).toBe(1);
        expect(entry?.mainPartners.get('이찬웅')).toBe(1);
        expect(entry?.coSubs.size).toBe(0);
    });

    it('다중 서브 → coSubs 카운트', () => {
        const issues = [
            makeIssue({
                key: 'T-1',
                assignee: { accountId: 'main1', displayName: '최준배' },
                subAssignees: [
                    { accountId: 'sub1', displayName: '강현' },
                    { accountId: 'sub2', displayName: '김태현' },
                ],
            }),
        ];
        const m = buildSubAssigneeMap(issues);
        const 강현 = m.get('id:sub1');
        const 김태현 = m.get('id:sub2');
        expect(강현?.coSubs.get('김태현')).toBe(1);
        expect(김태현?.coSubs.get('강현')).toBe(1);
    });

    it('동일 서브가 여러 메인과 협업 → mainPartners 누적', () => {
        const issues = [
            makeIssue({
                key: 'T-1',
                assignee: { accountId: 'A', displayName: '이찬웅' },
                subAssignees: [{ accountId: 'sub1', displayName: '김휘령' }],
            }),
            makeIssue({
                key: 'T-2',
                assignee: { accountId: 'B', displayName: '최준배' },
                subAssignees: [{ accountId: 'sub1', displayName: '김휘령' }],
            }),
            makeIssue({
                key: 'T-3',
                assignee: { accountId: 'A', displayName: '이찬웅' },
                subAssignees: [{ accountId: 'sub1', displayName: '김휘령' }],
            }),
        ];
        const m = buildSubAssigneeMap(issues);
        const 김휘령 = m.get('id:sub1');
        expect(김휘령?.issues.length).toBe(3);
        expect(김휘령?.mainPartners.get('이찬웅')).toBe(2);
        expect(김휘령?.mainPartners.get('최준배')).toBe(1);
    });

    it('서브담당자 없는 이슈는 무시', () => {
        const issues = [
            makeIssue({ key: 'T-1' }), // 서브 없음
            makeIssue({
                key: 'T-2',
                subAssignees: [{ accountId: 'sub1', displayName: '김철수' }],
            }),
        ];
        const m = buildSubAssigneeMap(issues);
        expect(m.size).toBe(1);
    });
});
