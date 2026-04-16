import { describe, it, expect, afterEach } from 'vitest';
import { buildEpicRetroSummary, analyzeEpicsRetrospective } from '../epicRetro';
import type { JiraIssue } from '../../../api/jiraClient';
import { JIRA_CONFIG } from '../../../config/jiraConfig';
import { useKpiRulesStore } from '../../../stores/kpiRulesStore';

type IssueOpts = {
    key?: string;
    summary?: string;
    statusKey?: 'done' | 'indeterminate' | 'new';
    statusName?: string;
    duedate?: string;
    resolutiondate?: string;
    actualDone?: string;
    labels?: string[];
    parentKey?: string;
    issueType?: string;
    assignee?: { accountId?: string; displayName?: string } | null;
    created?: string;
};

let nextKey = 1;
function makeIssue(opts: IssueOpts = {}): JiraIssue {
    const key = opts.key ?? `T-${nextKey++}`;
    const fields: Record<string, unknown> = {
        summary: opts.summary ?? key,
        status: {
            name: opts.statusName ?? 'Done',
            statusCategory: { key: opts.statusKey ?? 'done', colorName: 'green' },
        },
        issuetype: { name: opts.issueType ?? '할 일', iconUrl: '', subtask: false },
        labels: opts.labels,
        created: opts.created ?? '2024-01-01T00:00:00.000+0900',
        duedate: opts.duedate,
        resolutiondate: opts.resolutiondate,
        assignee: opts.assignee === undefined
            ? { accountId: 'u1', displayName: '홍길동' }
            : opts.assignee,
        parent: opts.parentKey ? { key: opts.parentKey } : undefined,
    };
    if (opts.actualDone) fields[JIRA_CONFIG.FIELDS.ACTUAL_DONE] = opts.actualDone;
    return { id: key, key, fields } as unknown as JiraIssue;
}

function makeEpic(opts: IssueOpts = {}): JiraIssue {
    return makeIssue({
        ...opts,
        issueType: 'Epic',
        statusKey: opts.statusKey ?? 'done',
        assignee: opts.assignee === undefined ? null : opts.assignee,
    });
}

describe('epicRetro — K3: ACTUAL_DONE 우선 on-time 판정', () => {
    afterEach(() => {
        useKpiRulesStore.getState().resetToDefault();
    });

    it('resolutiondate는 지연이나 ACTUAL_DONE은 준수 → on-time 인정', () => {
        const epic = makeEpic({ key: 'E-1', summary: 'Epic 1', created: '2024-01-01T00:00:00.000+0900' });
        const tasks = [
            makeIssue({
                statusKey: 'done',
                duedate: '2024-06-30',
                // resolutiondate는 지연 — 단순 회고에서는 late
                resolutiondate: '2024-07-10T00:00:00Z',
                // 그러나 실제 완료는 기한 내 (ACTUAL_DONE 우선)
                actualDone: '2024-06-25T00:00:00Z',
                parentKey: 'E-1',
            }),
        ];
        const s = buildEpicRetroSummary(epic, tasks);
        // K3 이전: resolutiondate 지연으로 onTimeRate=0
        // K3 이후: actualDone 준수로 onTimeRate=100
        expect(s.onTimeRate).toBe(100);
    });

    it('ACTUAL_DONE 없으면 resolutiondate fallback — 기존 동작 유지', () => {
        const epic = makeEpic({ key: 'E-1', created: '2024-01-01T00:00:00.000+0900' });
        const tasks = [
            makeIssue({
                statusKey: 'done',
                duedate: '2024-06-30',
                resolutiondate: '2024-07-10T00:00:00Z', // 지연
                parentKey: 'E-1',
            }),
        ];
        const s = buildEpicRetroSummary(epic, tasks);
        expect(s.onTimeRate).toBe(0);
    });

    it('cycle time도 ACTUAL_DONE 기반으로 산출', () => {
        const epic = makeEpic({ key: 'E-1', created: '2024-01-01T00:00:00.000+0900' });
        const tasks = [
            makeIssue({
                statusKey: 'done',
                created: '2024-06-01T00:00:00.000+0900',
                // resolutiondate: 6/20 (20일)
                resolutiondate: '2024-06-20T00:00:00Z',
                // actualDone: 6/10 (10일) — 실제로는 더 빠르게 완료
                actualDone: '2024-06-10T00:00:00Z',
                parentKey: 'E-1',
            }),
        ];
        const s = buildEpicRetroSummary(epic, tasks);
        // K3: actualDone 기반 → 약 9~10일
        expect(s.avgCycleTimeDays).toBeLessThanOrEqual(10);
        expect(s.avgCycleTimeDays).toBeGreaterThan(0);
    });

    it('kpiGrade와 onTimeRate가 동일 날짜 소스 사용 (에픽 회고 정합성)', () => {
        const epic = makeEpic({ key: 'E-1', created: '2024-01-01T00:00:00.000+0900' });
        const tasks = [
            makeIssue({
                statusKey: 'done',
                duedate: '2024-06-30',
                resolutiondate: '2024-07-10T00:00:00Z',
                actualDone: '2024-06-25T00:00:00Z', // 기한 내
                parentKey: 'E-1',
            }),
            makeIssue({
                statusKey: 'done',
                duedate: '2024-06-30',
                resolutiondate: '2024-07-15T00:00:00Z',
                actualDone: '2024-06-28T00:00:00Z', // 기한 내
                parentKey: 'E-1',
            }),
        ];
        const s = buildEpicRetroSummary(epic, tasks);
        // 둘 다 ACTUAL_DONE 기준으로 준수 → onTimeRate 100, KPI 준수율도 100
        expect(s.onTimeRate).toBe(100);
        expect(s.kpiGrade).toBe('S'); // 완료 100 + 준수 100 → S
    });
});

describe('analyzeEpicsRetrospective 통합', () => {
    it('선택 에픽의 task를 leaf filter 적용 후 그룹핑', () => {
        const epic = makeEpic({ key: 'E-1' });
        const tasks = [
            makeIssue({ key: 'T-1', parentKey: 'E-1', statusKey: 'done' }),
            makeIssue({ key: 'T-2', parentKey: 'E-1', statusKey: 'indeterminate' }),
        ];
        const r = analyzeEpicsRetrospective([epic, ...tasks], ['E-1']);
        expect(r.perEpic).toHaveLength(1);
        expect(r.perEpic[0].epicKey).toBe('E-1');
        expect(r.perEpic[0].totalTasks).toBe(2);
    });
});
