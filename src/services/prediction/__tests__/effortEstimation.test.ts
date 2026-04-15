import { describe, it, expect } from 'vitest';
import {
    measureCoverage,
    computeHistoricalAverages,
    predictIssueEffort,
    aggregateBacklogEffort,
    effortReportConfidence,
} from '../effortEstimation';
import type { JiraIssue } from '@/api/jiraClient';
import { JIRA_CONFIG } from '@/config/jiraConfig';

const SP_FIELD = JIRA_CONFIG.FIELDS.STORY_POINT;
const DIFF_FIELD = JIRA_CONFIG.FIELDS.DIFFICULTY;

let nextKey = 1;
function makeIssue(opts: {
    key?: string;
    statusCategory?: 'done' | 'indeterminate' | 'new';
    type?: string;
    sp?: number;
    timespent?: number; // seconds
    difficulty?: string;
    created?: string;
    actualDone?: string;
    resolutiondate?: string;
} = {}): JiraIssue {
    const key = opts.key ?? `E-${nextKey++}`;
    const fields: Record<string, unknown> = {
        summary: key,
        status: {
            name: opts.statusCategory === 'done' ? 'Done' : 'Open',
            statusCategory: { key: opts.statusCategory ?? 'new', colorName: 'gray' },
        },
        issuetype: { name: opts.type ?? '할 일', iconUrl: '', subtask: false },
        created: opts.created ?? '2026-04-01',
    };
    if (opts.sp != null) fields[SP_FIELD] = opts.sp;
    if (opts.timespent != null) fields.timespent = opts.timespent;
    if (opts.difficulty != null) fields[DIFF_FIELD] = { value: opts.difficulty };
    if (opts.actualDone) fields.customfield_11485 = opts.actualDone;
    if (opts.resolutiondate) fields.resolutiondate = opts.resolutiondate;
    return { id: key, key, fields } as unknown as JiraIssue;
}

describe('measureCoverage', () => {
    it('빈 배열 → 모두 0% / 모두 비활성', () => {
        const c = measureCoverage([]);
        expect(c.spActive).toBe(false);
        expect(c.worklogActive).toBe(false);
    });

    it('SP 70% 이상 → spActive (Phase 0 측정 임계값)', () => {
        const issues = [
            ...Array(7).fill(0).map(() => makeIssue({ sp: 3 })),
            ...Array(3).fill(0).map(() => makeIssue({})),
        ];
        const c = measureCoverage(issues);
        expect(c.spActive).toBe(true);
    });

    it('SP < 70% → 비활성 (Phase 0 IGMU/IPCON 0% 케이스)', () => {
        const issues = [
            ...Array(3).fill(0).map(() => makeIssue({ sp: 3 })),
            ...Array(7).fill(0).map(() => makeIssue({})),
        ];
        expect(measureCoverage(issues).spActive).toBe(false);
    });

    it('Worklog 30% 이상 → worklogActive (Phase 0 IGMU 57% 케이스)', () => {
        const issues = [
            ...Array(4).fill(0).map(() => makeIssue({ timespent: 3600 })),
            ...Array(6).fill(0).map(() => makeIssue({})),
        ];
        expect(measureCoverage(issues).worklogActive).toBe(true);
    });

    it('Worklog 0% → 비활성 (Phase 0 IPCON 케이스)', () => {
        const issues = Array(10).fill(0).map(() => makeIssue({}));
        expect(measureCoverage(issues).worklogActive).toBe(false);
    });
});

describe('computeHistoricalAverages', () => {
    it('cycle time 평균', () => {
        const resolved = [
            makeIssue({ statusCategory: 'done', created: '2026-04-01', actualDone: '2026-04-02' }), // 24h
            makeIssue({ statusCategory: 'done', created: '2026-04-01', actualDone: '2026-04-03' }), // 48h
        ];
        const cov = measureCoverage(resolved);
        const avgs = computeHistoricalAverages(resolved, cov);
        expect(avgs.globalAvg).toBe(36); // (24 + 48) / 2
    });

    it('타입별 분류', () => {
        const resolved = [
            makeIssue({ statusCategory: 'done', type: '할 일', created: '2026-04-01', actualDone: '2026-04-02' }),
            makeIssue({ statusCategory: 'done', type: '결함', created: '2026-04-01', actualDone: '2026-04-05' }),
        ];
        const avgs = computeHistoricalAverages(resolved, measureCoverage(resolved));
        expect(avgs.byType.get('할 일')).toBe(24);
        expect(avgs.byType.get('결함')).toBe(96);
    });
});

describe('predictIssueEffort', () => {
    const resolved = [
        makeIssue({ statusCategory: 'done', timespent: 3600 * 8, created: '2026-04-01', actualDone: '2026-04-02' }),
        makeIssue({ statusCategory: 'done', timespent: 3600 * 4, created: '2026-04-01', actualDone: '2026-04-02' }),
    ];

    it('worklog 우선 — high confidence', () => {
        const cov = measureCoverage(resolved);
        const avgs = computeHistoricalAverages(resolved, cov);
        const target = makeIssue({ timespent: 3600 * 6 });
        const r = predictIssueEffort(target, cov, avgs);
        expect(r.source).toBe('worklog');
        expect(r.hours).toBe(6);
        expect(r.confidence).toBe('high');
    });

    it('worklog 없으면 cycle time fallback (Phase 0 IPCON 시나리오)', () => {
        const cov = measureCoverage(resolved);
        const avgs = computeHistoricalAverages(resolved, cov);
        const target = makeIssue({}); // 어떤 데이터도 없음
        const r = predictIssueEffort(target, cov, avgs);
        expect(r.source).toBe('cycle-time');
        expect(r.confidence).toBe('low');
        expect(r.hours).toBeGreaterThan(0);
    });
});

describe('aggregateBacklogEffort', () => {
    it('전체 백로그 공수 + 출처 분포', () => {
        const issues = [
            // 완료 history (worklog 있음 — IGMU 시나리오)
            makeIssue({ statusCategory: 'done', timespent: 3600 * 8, created: '2026-04-01', actualDone: '2026-04-02' }),
            makeIssue({ statusCategory: 'done', timespent: 3600 * 4, created: '2026-04-01', actualDone: '2026-04-02' }),
            makeIssue({ statusCategory: 'done', timespent: 3600 * 6, created: '2026-04-01', actualDone: '2026-04-02' }),
            makeIssue({ statusCategory: 'done', timespent: 3600 * 5, created: '2026-04-01', actualDone: '2026-04-02' }),
            // 활성 백로그
            makeIssue({ statusCategory: 'indeterminate' }),
            makeIssue({ statusCategory: 'indeterminate' }),
        ];
        const r = aggregateBacklogEffort(issues, { teamHeadcount: 2, utilization: 0.65 });
        expect(r.perIssue.length).toBe(2); // 활성만
        expect(r.totalHoursMid).toBeGreaterThan(0);
        expect(r.sourceMix.length).toBeGreaterThan(0);
        // worklog 없는 활성 이슈는 cycle time fallback
        expect(r.cycleTimeFallbackOnly).toBe(false); // worklog active (>30%)
    });

    it('worklog 0% → cycleTimeFallbackOnly true', () => {
        const issues = [
            makeIssue({ statusCategory: 'done', created: '2026-04-01', actualDone: '2026-04-02' }),
            makeIssue({ statusCategory: 'indeterminate' }),
        ];
        const r = aggregateBacklogEffort(issues, { teamHeadcount: 1 });
        expect(r.cycleTimeFallbackOnly).toBe(true);
    });
});

describe('effortReportConfidence', () => {
    it('cycle time만 사용 → low', () => {
        const issues = [
            makeIssue({ statusCategory: 'done', created: '2026-04-01', actualDone: '2026-04-02' }),
            makeIssue({ statusCategory: 'indeterminate' }),
        ];
        const r = aggregateBacklogEffort(issues, { teamHeadcount: 1 });
        expect(effortReportConfidence(r)).toBe('low');
    });

    it('worklog 50% 이상 → high', () => {
        const issues = [
            ...Array(5).fill(0).map(() => makeIssue({ statusCategory: 'done', timespent: 3600 * 4, created: '2026-04-01', actualDone: '2026-04-02' })),
            ...Array(2).fill(0).map(() => makeIssue({ statusCategory: 'indeterminate', timespent: 3600 * 6 })),
        ];
        const r = aggregateBacklogEffort(issues, { teamHeadcount: 2 });
        expect(effortReportConfidence(r)).toBe('high');
    });
});
