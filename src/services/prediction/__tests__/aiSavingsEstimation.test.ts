import { describe, it, expect } from 'vitest';
import {
    categorizeIssue,
    calculateIssueSavings,
    aggregateAiSavings,
    DEFAULT_AI_SAVINGS_CONFIG,
} from '../aiSavingsEstimation';
import type { BacklogEffortReport, IssueEffortPrediction } from '../types';

function makePred(opts: {
    key?: string;
    hours: number;
    issueTypeName?: string;
    difficultyLabel?: string;
}): IssueEffortPrediction {
    return {
        issueKey: opts.key ?? 'X-1',
        summary: 'test',
        hours: opts.hours,
        hoursLow: opts.hours * 0.8,
        hoursHigh: opts.hours * 1.2,
        source: 'planned',
        confidence: 'medium',
        meta: {
            issueTypeName: opts.issueTypeName,
            difficultyLabel: opts.difficultyLabel,
        },
    };
}

describe('categorizeIssue', () => {
    it('Story / 스토리 / Task → story', () => {
        expect(categorizeIssue('Story')).toBe('story');
        expect(categorizeIssue('스토리')).toBe('story');
        expect(categorizeIssue('할 일')).toBe('story');
        expect(categorizeIssue('Task')).toBe('story');
    });

    it('Bug / 결함 / Defect → bug', () => {
        expect(categorizeIssue('Bug')).toBe('bug');
        expect(categorizeIssue('결함')).toBe('bug');
        expect(categorizeIssue('Defect')).toBe('bug');
    });

    it('Sub-task / 하위 작업 → subtask (task보다 우선)', () => {
        expect(categorizeIssue('Sub-task')).toBe('subtask');
        expect(categorizeIssue('하위 작업')).toBe('subtask');
        expect(categorizeIssue('Subtask')).toBe('subtask');
    });

    it('Test / QA → test', () => {
        expect(categorizeIssue('Test')).toBe('test');
        expect(categorizeIssue('테스트')).toBe('test');
        expect(categorizeIssue('QA Task')).toBe('test');
    });

    it('Documentation / 문서 → doc', () => {
        expect(categorizeIssue('Documentation')).toBe('doc');
        expect(categorizeIssue('문서 작업')).toBe('doc');
    });

    it('알 수 없는 타입 → default', () => {
        expect(categorizeIssue('Unknown Type')).toBe('default');
        expect(categorizeIssue(undefined)).toBe('default');
    });

    // v1.0.46 (M7): 사용자 정의 키워드 매핑
    it('customKeywords로 회사 전용 타입 매핑 가능', () => {
        const custom = {
            test: ['test', '테스트'],
            doc: ['doc'],
            bug: ['bug', '결함'],
            subtask: ['sub'],
            story: ['story', 'epic', 'feature', '기능'],  // 회사 전용 키워드 추가
        };
        expect(categorizeIssue('Feature', custom)).toBe('story');
        expect(categorizeIssue('Epic Task', custom)).toBe('story');
        expect(categorizeIssue('기능 추가', custom)).toBe('story');
    });

    it('customKeywords 빈 카테고리 → default fallback', () => {
        const custom = {
            test: [],
            doc: [],
            bug: ['bug'],
            subtask: [],
            story: ['story'],
        };
        expect(categorizeIssue('Test', custom)).toBe('default'); // test 키워드 없음
        expect(categorizeIssue('Bug', custom)).toBe('bug');
    });
});

describe('calculateIssueSavings', () => {
    it('평균 시나리오 + 카테고리 Story → 35% 절감 (난이도 없음)', () => {
        const pred = makePred({ hours: 100, issueTypeName: 'Story' });
        const r = calculateIssueSavings(pred, 'average');
        expect(r.category).toBe('story');
        expect(r.appliedReduction).toBeCloseTo(0.35, 2);
        expect(r.savedHours).toBeCloseTo(35, 1);
        expect(r.afterHours).toBeCloseTo(65, 1);
    });

    it('보수 시나리오 → 평균 -10%pt', () => {
        const pred = makePred({ hours: 100, issueTypeName: 'Story' });
        const r = calculateIssueSavings(pred, 'conservative');
        expect(r.appliedReduction).toBeCloseTo(0.25, 2); // 0.35 - 0.10
    });

    it('낙관 시나리오 → 평균 +15%pt', () => {
        const pred = makePred({ hours: 100, issueTypeName: 'Story' });
        const r = calculateIssueSavings(pred, 'optimistic');
        expect(r.appliedReduction).toBeCloseTo(0.50, 2); // 0.35 + 0.15
    });

    it('난이도 \'상\' 보정 → 절감률 × 0.7 (어려운 작업은 AI 효과 ↓)', () => {
        const pred = makePred({ hours: 100, issueTypeName: 'Story', difficultyLabel: '상' });
        const r = calculateIssueSavings(pred, 'average');
        expect(r.appliedReduction).toBeCloseTo(0.35 * 0.7, 2); // 0.245
    });

    it('난이도 \'하\' 보정 → 절감률 × 1.2 (쉬운 작업은 AI 효과 ↑)', () => {
        const pred = makePred({ hours: 100, issueTypeName: 'Test', difficultyLabel: '하' });
        const r = calculateIssueSavings(pred, 'average');
        // 0.50 * 1.2 = 0.60
        expect(r.appliedReduction).toBeCloseTo(0.60, 2);
    });

    it('80% cap — 낙관 + 난이도 하 + Test 같은 극단값에서도 80% 초과 X', () => {
        const pred = makePred({ hours: 100, issueTypeName: 'Test', difficultyLabel: '하' });
        const r = calculateIssueSavings(pred, 'optimistic');
        // 0.65 * 1.2 = 0.78 — 80% cap 미만이지만 cap 동작 확인
        expect(r.appliedReduction).toBeLessThanOrEqual(0.80);
    });
});

describe('aggregateAiSavings', () => {
    function makeReport(perIssue: IssueEffortPrediction[]): BacklogEffortReport {
        const totalHours = perIssue.reduce((s, p) => s + p.hours, 0);
        return {
            totalHoursMid: totalHours,
            totalHoursLow: totalHours * 0.7,
            totalHoursHigh: totalHours * 1.3,
            totalManDaysMid: totalHours / 8,
            totalManDaysLow: (totalHours * 0.7) / 8,
            totalManDaysHigh: (totalHours * 1.3) / 8,
            totalManMonthsMid: totalHours / 8 / 20,
            totalManMonthsLow: (totalHours * 0.7) / 8 / 20,
            totalManMonthsHigh: (totalHours * 1.3) / 8 / 20,
            sourceMix: [{ source: 'planned', count: perIssue.length, hours: totalHours, manDays: totalHours / 8 }],
            perIssue,
            teamCapacityAssumption: { headcount: 2, utilization: 0.65, teamDaysMid: totalHours / 8 / 1.3, teamMonthsMid: totalHours / 8 / 1.3 / 20 },
            cycleTimeFallbackOnly: false,
        };
    }

    it('보수 < 평균 < 낙관 시나리오 절감률 순서', () => {
        const preds = Array(20).fill(0).map((_, i) =>
            makePred({ key: `S-${i}`, hours: 16, issueTypeName: 'Story' })
        );
        const r = aggregateAiSavings(makeReport(preds));
        expect(r.scenarios.conservative.avgReductionPct)
            .toBeLessThan(r.scenarios.average.avgReductionPct);
        expect(r.scenarios.average.avgReductionPct)
            .toBeLessThan(r.scenarios.optimistic.avgReductionPct);
    });

    it('카테고리별 분해 — Story 6건 + Test 4건 → 2 카테고리 분해', () => {
        const preds = [
            ...Array(6).fill(0).map((_, i) => makePred({ key: `S-${i}`, hours: 16, issueTypeName: 'Story' })),
            ...Array(4).fill(0).map((_, i) => makePred({ key: `T-${i}`, hours: 8, issueTypeName: 'Test' })),
        ];
        const r = aggregateAiSavings(makeReport(preds));
        expect(r.byCategory.length).toBe(2);
        const story = r.byCategory.find(c => c.category === 'story');
        const test = r.byCategory.find(c => c.category === 'test');
        expect(story?.count).toBe(6);
        expect(test?.count).toBe(4);
        // Test 절감률(50%)이 Story(35%)보다 커야 함
        expect((test?.reductionPct ?? 0)).toBeGreaterThan((story?.reductionPct ?? 0));
    });

    it('Top 5 효과 이슈 — 절감 시간 큰 순 정렬', () => {
        const preds = [
            makePred({ key: 'BIG', hours: 200, issueTypeName: 'Test' }),     // 100h 절감
            makePred({ key: 'MED', hours: 80, issueTypeName: 'Story' }),     // ~28h
            makePred({ key: 'SMALL', hours: 16, issueTypeName: 'Bug' }),     // ~4h
            ...Array(20).fill(0).map((_, i) => makePred({ key: `X-${i}`, hours: 8, issueTypeName: 'Story' })),
        ];
        const r = aggregateAiSavings(makeReport(preds));
        expect(r.topImpactIssues.length).toBe(5);
        expect(r.topImpactIssues[0].issueKey).toBe('BIG');
        // 정렬 검증
        for (let i = 1; i < r.topImpactIssues.length; i++) {
            expect(r.topImpactIssues[i - 1].savedHours).toBeGreaterThanOrEqual(r.topImpactIssues[i].savedHours);
        }
    });

    it('백로그 10건 미만 → confidence unreliable', () => {
        const preds = Array(5).fill(0).map((_, i) => makePred({ key: `S-${i}`, hours: 8, issueTypeName: 'Story' }));
        const r = aggregateAiSavings(makeReport(preds));
        expect(r.confidence).toBe('unreliable');
    });

    it('사용자 설정 적용 — Story 절감률 변경 시 결과에 반영', () => {
        const preds = Array(20).fill(0).map((_, i) => makePred({ key: `S-${i}`, hours: 8, issueTypeName: 'Story' }));
        const customConfig = {
            ...DEFAULT_AI_SAVINGS_CONFIG,
            reductionByCategory: { ...DEFAULT_AI_SAVINGS_CONFIG.reductionByCategory, story: 0.10 },
        };
        const rDefault = aggregateAiSavings(makeReport(preds));
        const rCustom = aggregateAiSavings(makeReport(preds), customConfig);
        // Story 절감률을 35%→10%로 낮췄으니 절감 인일도 줄어야 함
        expect(rCustom.scenarios.average.savedManDaysMid)
            .toBeLessThan(rDefault.scenarios.average.savedManDaysMid);
    });
});
