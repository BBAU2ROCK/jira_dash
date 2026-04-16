import { describe, it, expect } from 'vitest';
import { generateDefectRecommendations, classifyTrend } from '../defectInsights';
import type { DefectInsightInput } from '../defectInsights';

const baseInput: DefectInsightInput = {
    defectCount: 10,
    defectsPerCompletedTask: 10,
    severityBreakdown: [],
    typeBreakdown: [],
    trendDirection: 'stable',
    topAffectedPeople: [],
    teamAvgDensity: null,
};

describe('generateDefectRecommendations (v1.0.12 F3-3)', () => {
    it('R1: Critical 3건 이상 → RCA 권고', () => {
        const recs = generateDefectRecommendations({
            ...baseInput,
            severityBreakdown: [{ name: 'Critical', count: 3 }],
        });
        expect(recs.some((r) => r.includes('RCA'))).toBe(true);
    });

    it('R1: Critical 2건은 트리거 X', () => {
        const recs = generateDefectRecommendations({
            ...baseInput,
            severityBreakdown: [{ name: 'Critical', count: 2 }],
        });
        expect(recs.some((r) => r.includes('RCA'))).toBe(false);
    });

    it('R2: 1인이 50%+ 집중 + 전체 4건 이상 → pair programming 권고', () => {
        const recs = generateDefectRecommendations({
            ...baseInput,
            defectCount: 10,
            topAffectedPeople: [{ name: '홍길동', count: 6, pctOfEpic: 60 }],
        });
        expect(recs.some((r) => r.includes('홍길동') && r.includes('pair programming'))).toBe(true);
    });

    it('R2: 집중도 50% 미만은 트리거 X', () => {
        const recs = generateDefectRecommendations({
            ...baseInput,
            defectCount: 10,
            topAffectedPeople: [{ name: '홍길동', count: 4, pctOfEpic: 40 }],
        });
        expect(recs.some((r) => r.includes('pair programming'))).toBe(false);
    });

    it('R3: 트렌드 악화 → QA 강화 권고', () => {
        const recs = generateDefectRecommendations({
            ...baseInput,
            trendDirection: 'worsening',
        });
        expect(recs.some((r) => r.includes('QA') || r.includes('회귀'))).toBe(true);
    });

    it('R4: 트렌드 개선 → 유지·확산 권고', () => {
        const recs = generateDefectRecommendations({
            ...baseInput,
            trendDirection: 'improving',
        });
        expect(recs.some((r) => r.includes('유지') && r.includes('확산'))).toBe(true);
    });

    it('R5: 팀 평균 대비 +5%p 초과 → 요구사항·설계 리뷰 권고', () => {
        const recs = generateDefectRecommendations({
            ...baseInput,
            defectsPerCompletedTask: 15,
            teamAvgDensity: 5,
        });
        expect(recs.some((r) => r.includes('요구사항') || r.includes('설계'))).toBe(true);
    });

    it('R5: 팀 평균 없으면(baseline 불가) 스킵', () => {
        const recs = generateDefectRecommendations({
            ...baseInput,
            defectsPerCompletedTask: 50,
            teamAvgDensity: null,
        });
        expect(recs.some((r) => r.includes('요구사항'))).toBe(false);
    });

    it('R6: 타입 편향 70%+ → 자동화 테스트 권고', () => {
        const recs = generateDefectRecommendations({
            ...baseInput,
            defectCount: 10,
            typeBreakdown: [
                { name: '버그', count: 8 },
                { name: '개선', count: 2 },
            ],
        });
        expect(recs.some((r) => r.includes('버그') && r.includes('자동화'))).toBe(true);
    });

    it('최대 3건만 반환', () => {
        const recs = generateDefectRecommendations({
            defectCount: 10,
            defectsPerCompletedTask: 50,
            severityBreakdown: [{ name: 'Critical', count: 5 }],
            typeBreakdown: [{ name: '버그', count: 9 }, { name: '개선', count: 1 }],
            trendDirection: 'worsening',
            topAffectedPeople: [{ name: 'A', count: 7, pctOfEpic: 70 }],
            teamAvgDensity: 5,
        });
        expect(recs.length).toBeLessThanOrEqual(3);
    });

    it('빈 입력 → 빈 배열', () => {
        const recs = generateDefectRecommendations(baseInput);
        expect(recs).toEqual([]);
    });
});

describe('classifyTrend', () => {
    it('8주 미만 → insufficient', () => {
        const trend = Array.from({ length: 7 }, (_, i) => ({
            weekStart: `2026-0${1 + Math.floor(i / 4)}-${String(1 + (i % 4) * 7).padStart(2, '0')}`,
            count: 2,
        }));
        expect(classifyTrend(trend)).toBe('insufficient');
    });

    it('최근 4주 합 << 이전 4주 합 → improving', () => {
        const trend = [
            { weekStart: '2026-01-01', count: 5 },
            { weekStart: '2026-01-08', count: 6 },
            { weekStart: '2026-01-15', count: 4 },
            { weekStart: '2026-01-22', count: 5 }, // prior: 20
            { weekStart: '2026-01-29', count: 1 },
            { weekStart: '2026-02-05', count: 1 },
            { weekStart: '2026-02-12', count: 2 },
            { weekStart: '2026-02-19', count: 1 }, // recent: 5
        ];
        expect(classifyTrend(trend)).toBe('improving'); // 5/20 = 0.25 < 0.7
    });

    it('최근 4주 합 >> 이전 4주 합 → worsening', () => {
        const trend = [
            { weekStart: '2026-01-01', count: 1 },
            { weekStart: '2026-01-08', count: 1 },
            { weekStart: '2026-01-15', count: 0 },
            { weekStart: '2026-01-22', count: 1 }, // prior: 3
            { weekStart: '2026-01-29', count: 3 },
            { weekStart: '2026-02-05', count: 4 },
            { weekStart: '2026-02-12', count: 2 },
            { weekStart: '2026-02-19', count: 3 }, // recent: 12
        ];
        expect(classifyTrend(trend)).toBe('worsening');
    });

    it('비슷하면 stable', () => {
        const trend = Array.from({ length: 8 }, (_, i) => ({
            weekStart: `2026-0${1 + Math.floor(i / 4)}-${String(1 + (i % 4) * 7).padStart(2, '0')}`,
            count: 3,
        }));
        expect(classifyTrend(trend)).toBe('stable');
    });

    it('모두 0 → stable', () => {
        const trend = Array.from({ length: 8 }, (_, i) => ({
            weekStart: `2026-0${1 + Math.floor(i / 4)}-${String(1 + (i % 4) * 7).padStart(2, '0')}`,
            count: 0,
        }));
        expect(classifyTrend(trend)).toBe('stable');
    });
});
