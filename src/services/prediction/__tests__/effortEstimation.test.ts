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
    plannedStart?: string;
    duedate?: string;
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
    if (opts.plannedStart) fields.customfield_11481 = opts.plannedStart;
    if (opts.duedate) fields.duedate = opts.duedate;
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

describe('planned source (v1.0.32)', () => {
    it('계획시작일+duedate 30%+ 활성 이슈 → plannedActive true', () => {
        const resolved = [makeIssue({ statusCategory: 'done', created: '2026-04-01', actualDone: '2026-04-02' })];
        const active = [
            // 5건 중 2건 (40%) 계획·예정일 있음
            makeIssue({ statusCategory: 'indeterminate', plannedStart: '2026-04-01', duedate: '2026-04-08' }),
            makeIssue({ statusCategory: 'indeterminate', plannedStart: '2026-04-01', duedate: '2026-04-15' }),
            makeIssue({ statusCategory: 'indeterminate' }),
            makeIssue({ statusCategory: 'indeterminate' }),
            makeIssue({ statusCategory: 'indeterminate' }),
        ];
        const cov = measureCoverage(resolved, active);
        expect(cov.plannedCoverage).toBeCloseTo(0.4, 1);
        expect(cov.plannedActive).toBe(true);
    });

    it('planned 모드에서 난이도 \'상\' → high confidence + 1.2배 가중', () => {
        const resolved = [makeIssue({ statusCategory: 'done', created: '2026-04-01', actualDone: '2026-04-02' })];
        // 계획 5영업일 (월~금) + 난이도 상 = 5 × 8 × 1.2 = 48시간
        const active = [
            makeIssue({ statusCategory: 'indeterminate', plannedStart: '2026-04-06', duedate: '2026-04-13', difficulty: '상' }),
            makeIssue({ statusCategory: 'indeterminate', plannedStart: '2026-04-06', duedate: '2026-04-13' }),
            makeIssue({ statusCategory: 'indeterminate', plannedStart: '2026-04-06', duedate: '2026-04-13' }),
        ];
        const cov = measureCoverage(resolved, active);
        const avgs = computeHistoricalAverages(resolved, cov);
        const r = predictIssueEffort(active[0], cov, avgs);
        expect(r.source).toBe('planned');
        expect(r.confidence).toBe('high');
        expect(r.hours).toBeCloseTo(5 * 8 * 1.2, 1);
        expect(r.meta?.difficultyLabel).toBe('상');
        expect(r.meta?.plannedDays).toBe(5);
    });

    it('planned 모드 + 난이도 없음 → medium confidence + 가중치 1.0', () => {
        const resolved = [makeIssue({ statusCategory: 'done', created: '2026-04-01', actualDone: '2026-04-02' })];
        const active = [
            makeIssue({ statusCategory: 'indeterminate', plannedStart: '2026-04-06', duedate: '2026-04-13' }),
            makeIssue({ statusCategory: 'indeterminate', plannedStart: '2026-04-06', duedate: '2026-04-13' }),
            makeIssue({ statusCategory: 'indeterminate', plannedStart: '2026-04-06', duedate: '2026-04-13' }),
        ];
        const cov = measureCoverage(resolved, active);
        const avgs = computeHistoricalAverages(resolved, cov);
        const r = predictIssueEffort(active[0], cov, avgs);
        expect(r.source).toBe('planned');
        expect(r.confidence).toBe('medium');
        expect(r.hours).toBeCloseTo(5 * 8 * 1.0, 1);
        // 신뢰구간: ±25% (난이도 없을 때)
        expect(r.hoursLow).toBeCloseTo(5 * 8 * 0.75, 1);
        expect(r.hoursHigh).toBeCloseTo(5 * 8 * 1.25, 1);
    });

    it('planned 60일 초과 outlier → 비활성화 → fallback 사용', () => {
        const resolved = [makeIssue({ statusCategory: 'done', created: '2026-04-01', actualDone: '2026-04-02' })];
        // 90일짜리는 outlier로 판단 → planned 안 씀
        const active = [
            makeIssue({ statusCategory: 'indeterminate', plannedStart: '2026-04-01', duedate: '2026-08-01' }),
            makeIssue({ statusCategory: 'indeterminate', plannedStart: '2026-04-01', duedate: '2026-08-01' }),
            makeIssue({ statusCategory: 'indeterminate', plannedStart: '2026-04-01', duedate: '2026-08-01' }),
        ];
        const cov = measureCoverage(resolved, active);
        const avgs = computeHistoricalAverages(resolved, cov);
        // outlier만 있으므로 plannedCoverage 0
        expect(cov.plannedCoverage).toBe(0);
        expect(cov.plannedActive).toBe(false);
        const r = predictIssueEffort(active[0], cov, avgs);
        expect(r.source).not.toBe('planned'); // cycle-time fallback
    });

    it('worklog 우선순위가 planned보다 높음', () => {
        const resolved = [
            makeIssue({ statusCategory: 'done', timespent: 3600 * 8, created: '2026-04-01', actualDone: '2026-04-02' }),
            makeIssue({ statusCategory: 'done', timespent: 3600 * 4, created: '2026-04-01', actualDone: '2026-04-02' }),
            makeIssue({ statusCategory: 'done', timespent: 3600 * 6, created: '2026-04-01', actualDone: '2026-04-02' }),
        ];
        const active = [
            makeIssue({
                statusCategory: 'indeterminate',
                timespent: 3600 * 10, // worklog 있음
                plannedStart: '2026-04-06',
                duedate: '2026-04-13',
                difficulty: '상',
            }),
        ];
        const cov = measureCoverage(resolved, active);
        const avgs = computeHistoricalAverages(resolved, cov);
        const r = predictIssueEffort(active[0], cov, avgs);
        expect(r.source).toBe('worklog'); // planned 무시, worklog 우선
        expect(r.hours).toBe(10);
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
