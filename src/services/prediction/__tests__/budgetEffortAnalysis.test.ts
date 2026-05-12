import { describe, it, expect } from 'vitest';
import { getMonthlyEffortTrend, getTeamEffortHeatmap } from '../budgetEffortAnalysis';
import type { JiraIssue } from '@/api/jiraClient';
import type { BacklogEffortReport, IssueEffortPrediction } from '../types';

let nextKey = 1;
function makeIssue(opts: {
    key?: string;
    statusCategory?: 'done' | 'indeterminate' | 'new';
    type?: string;
    timespent?: number;
    created?: string;
    actualDone?: string;
    resolutiondate?: string;
    assigneeName?: string;
} = {}): JiraIssue {
    const key = opts.key ?? `B-${nextKey++}`;
    const fields: Record<string, unknown> = {
        summary: key,
        status: {
            name: opts.statusCategory === 'done' ? 'Done' : 'Open',
            statusCategory: { key: opts.statusCategory ?? 'indeterminate', colorName: 'gray' },
        },
        issuetype: { name: opts.type ?? 'Story', iconUrl: '', subtask: false },
        created: opts.created ?? '2026-01-01',
    };
    if (opts.timespent != null) fields.timespent = opts.timespent;
    if (opts.actualDone) fields.customfield_11485 = opts.actualDone;
    if (opts.resolutiondate) fields.resolutiondate = opts.resolutiondate;
    if (opts.assigneeName) fields.assignee = { displayName: opts.assigneeName, accountId: opts.assigneeName };
    return { id: key, key, fields } as unknown as JiraIssue;
}

function makePred(opts: {
    key: string;
    hours: number;
    issueTypeName?: string;
}): IssueEffortPrediction {
    return {
        issueKey: opts.key,
        summary: opts.key,
        hours: opts.hours,
        hoursLow: opts.hours * 0.8,
        hoursHigh: opts.hours * 1.2,
        source: 'planned',
        confidence: 'medium',
        meta: { issueTypeName: opts.issueTypeName },
    };
}

describe('getMonthlyEffortTrend', () => {
    it('빈 배열 → 모든 월 0', () => {
        const trend = getMonthlyEffortTrend([], 6, new Date('2026-04-15'));
        expect(trend.length).toBe(6);
        trend.forEach((p) => expect(p.completedIssues).toBe(0));
    });

    it('월별 완료 이슈 카운트 정확', () => {
        const issues = [
            // 2026-02 완료 2건
            makeIssue({ statusCategory: 'done', created: '2026-01-15', actualDone: '2026-02-05' }),
            makeIssue({ statusCategory: 'done', created: '2026-01-20', actualDone: '2026-02-15' }),
            // 2026-03 완료 1건
            makeIssue({ statusCategory: 'done', created: '2026-02-15', actualDone: '2026-03-10' }),
            // 2026-04 완료 1건
            makeIssue({ statusCategory: 'done', created: '2026-03-25', actualDone: '2026-04-05' }),
        ];
        const trend = getMonthlyEffortTrend(issues, 6, new Date('2026-04-15'));
        const feb = trend.find((p) => p.month === '2026-02');
        const mar = trend.find((p) => p.month === '2026-03');
        const apr = trend.find((p) => p.month === '2026-04');
        expect(feb?.completedIssues).toBe(2);
        expect(mar?.completedIssues).toBe(1);
        expect(apr?.completedIssues).toBe(1);
    });

    it('worklog 인일 환산', () => {
        const issues = [
            makeIssue({
                statusCategory: 'done',
                timespent: 3600 * 16, // 16시간 = 2 MD
                created: '2026-03-25',
                actualDone: '2026-04-05',
            }),
            makeIssue({
                statusCategory: 'done',
                timespent: 3600 * 8, // 8시간 = 1 MD
                created: '2026-03-25',
                actualDone: '2026-04-10',
            }),
        ];
        const trend = getMonthlyEffortTrend(issues, 1, new Date('2026-04-15'));
        const apr = trend[0];
        expect(apr.worklogHours).toBeCloseTo(24, 0);
        expect(apr.worklogManDays).toBeCloseTo(3, 1);
    });

    it('cycle time 평균 산정', () => {
        const issues = [
            makeIssue({ statusCategory: 'done', created: '2026-04-01T00:00', actualDone: '2026-04-02T00:00' }), // 24h
            makeIssue({ statusCategory: 'done', created: '2026-04-01T00:00', actualDone: '2026-04-04T00:00' }), // 72h
        ];
        const trend = getMonthlyEffortTrend(issues, 1, new Date('2026-04-15'));
        const apr = trend[0];
        // 평균 (24+72)/2 = 48h
        expect(apr.avgCycleHours).toBeCloseTo(48, 0);
    });

    it('순서 = 과거 → 현재', () => {
        const trend = getMonthlyEffortTrend([], 3, new Date('2026-04-15'));
        expect(trend[0].month).toBe('2026-02');
        expect(trend[1].month).toBe('2026-03');
        expect(trend[2].month).toBe('2026-04');
    });
});

describe('getTeamEffortHeatmap', () => {
    function makeReport(perIssue: IssueEffortPrediction[]): BacklogEffortReport {
        const totalHours = perIssue.reduce((s, p) => s + p.hours, 0);
        return {
            totalHoursMid: totalHours, totalHoursLow: totalHours * 0.7, totalHoursHigh: totalHours * 1.3,
            totalManDaysMid: totalHours / 8, totalManDaysLow: totalHours * 0.7 / 8, totalManDaysHigh: totalHours * 1.3 / 8,
            totalManMonthsMid: totalHours / 8 / 20, totalManMonthsLow: totalHours * 0.7 / 8 / 20, totalManMonthsHigh: totalHours * 1.3 / 8 / 20,
            sourceMix: [], perIssue,
            teamCapacityAssumption: { headcount: 1, utilization: 0.65, teamDaysMid: 0, teamMonthsMid: 0 },
            cycleTimeFallbackOnly: false,
        };
    }

    it('담당자별 행 + 카테고리별 열 산정', () => {
        const issues = [
            makeIssue({ key: 'A1', statusCategory: 'indeterminate', type: 'Story', assigneeName: '김철수' }),
            makeIssue({ key: 'A2', statusCategory: 'indeterminate', type: 'Bug', assigneeName: '김철수' }),
            makeIssue({ key: 'B1', statusCategory: 'indeterminate', type: 'Story', assigneeName: '이영희' }),
        ];
        const preds = [
            makePred({ key: 'A1', hours: 16, issueTypeName: 'Story' }),       // 김철수 / story / 2 MD
            makePred({ key: 'A2', hours: 8, issueTypeName: 'Bug' }),          // 김철수 / bug / 1 MD
            makePred({ key: 'B1', hours: 24, issueTypeName: 'Story' }),       // 이영희 / story / 3 MD
        ];
        const heatmap = getTeamEffortHeatmap(issues, makeReport(preds));
        // 담당자 정렬: 이영희(3 MD) > 김철수(3 MD) — 동률이지만 순서 안정성
        expect(heatmap.assignees.length).toBe(2);
        expect(heatmap.categories).toContain('story');
        expect(heatmap.categories).toContain('bug');

        const kim = heatmap.cells.find((c) => c.assignee === '김철수' && c.category === 'story');
        const lee = heatmap.cells.find((c) => c.assignee === '이영희' && c.category === 'story');
        expect(kim?.manDays).toBeCloseTo(2, 1);
        expect(lee?.manDays).toBeCloseTo(3, 1);
    });

    it('미할당 이슈 → 미할당 행', () => {
        const issues = [
            makeIssue({ key: 'A1', statusCategory: 'indeterminate', type: 'Story' }), // assignee 없음
        ];
        const preds = [makePred({ key: 'A1', hours: 8, issueTypeName: 'Story' })];
        const heatmap = getTeamEffortHeatmap(issues, makeReport(preds));
        expect(heatmap.assignees).toContain('미할당');
    });

    it('rowTotals + colTotals + maxCellManDays', () => {
        const issues = [
            makeIssue({ key: 'A1', statusCategory: 'indeterminate', type: 'Story', assigneeName: '김' }),
            makeIssue({ key: 'A2', statusCategory: 'indeterminate', type: 'Bug', assigneeName: '김' }),
        ];
        const preds = [
            makePred({ key: 'A1', hours: 16, issueTypeName: 'Story' }), // 2 MD
            makePred({ key: 'A2', hours: 8, issueTypeName: 'Bug' }),    // 1 MD
        ];
        const heatmap = getTeamEffortHeatmap(issues, makeReport(preds));
        expect(heatmap.rowTotals.get('김')).toBeCloseTo(3, 1);
        expect(heatmap.colTotals.get('story')).toBeCloseTo(2, 1);
        expect(heatmap.colTotals.get('bug')).toBeCloseTo(1, 1);
        expect(heatmap.maxCellManDays).toBeCloseTo(2, 1);
    });

    it('카테고리 표준 순서 유지 (story → bug → subtask → ...)', () => {
        const issues = [
            makeIssue({ key: 'X1', statusCategory: 'indeterminate', type: 'Test', assigneeName: '김' }),
            makeIssue({ key: 'X2', statusCategory: 'indeterminate', type: 'Story', assigneeName: '김' }),
            makeIssue({ key: 'X3', statusCategory: 'indeterminate', type: 'Bug', assigneeName: '김' }),
        ];
        const preds = [
            makePred({ key: 'X1', hours: 8, issueTypeName: 'Test' }),
            makePred({ key: 'X2', hours: 8, issueTypeName: 'Story' }),
            makePred({ key: 'X3', hours: 8, issueTypeName: 'Bug' }),
        ];
        const heatmap = getTeamEffortHeatmap(issues, makeReport(preds));
        // story가 첫 번째, bug 두 번째, test가 마지막
        expect(heatmap.categories[0]).toBe('story');
        expect(heatmap.categories[1]).toBe('bug');
        expect(heatmap.categories[2]).toBe('test');
    });
});
