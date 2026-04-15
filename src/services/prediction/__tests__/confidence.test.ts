import { describe, it, expect } from 'vitest';
import { confidenceLevel, confidenceGuidance, buildConfidenceWarnings } from '../confidence';
import type { ThroughputStats } from '../types';

function stats(overrides: Partial<ThroughputStats> = {}): ThroughputStats {
    return {
        activeDays: 30,
        totalDays: 30,
        mean: 2.0,
        stddev: 0.4,
        cv: 0.2,
        scopeRatio: 0.8,
        ...overrides,
    };
}

describe('confidenceLevel', () => {
    it('활동일 < 7 → unreliable', () => {
        expect(confidenceLevel(stats({ activeDays: 5 }))).toBe('unreliable');
    });

    it('Scope ratio > 1.5 → unreliable (Phase 0 IPCON 케이스)', () => {
        expect(confidenceLevel(stats({ scopeRatio: 1.69 }))).toBe('unreliable');
    });

    it('CV > 0.8 → low (Phase 0 IGMU 케이스)', () => {
        expect(confidenceLevel(stats({ cv: 1.25, scopeRatio: 0.13 }))).toBe('low');
    });

    it('활동일 14~29 + CV 정상 → medium (high 조건 미달)', () => {
        expect(confidenceLevel(stats({ activeDays: 20, cv: 0.3 }))).toBe('medium');
    });

    it('활동일 < 14 → low', () => {
        expect(confidenceLevel(stats({ activeDays: 10, cv: 0.3 }))).toBe('low');
    });

    it('CV > 0.5 (≤ 0.8) → low', () => {
        expect(confidenceLevel(stats({ activeDays: 30, cv: 0.6 }))).toBe('low');
    });

    it('활동일 >= 30 + CV < 0.3 → high', () => {
        expect(confidenceLevel(stats({ activeDays: 35, cv: 0.25 }))).toBe('high');
    });

    it('그 외 → medium', () => {
        expect(confidenceLevel(stats({ activeDays: 30, cv: 0.4 }))).toBe('medium');
    });
});

describe('confidenceGuidance', () => {
    it('unreliable는 단일 ETA·범위·분포 모두 숨김', () => {
        const g = confidenceGuidance('unreliable');
        expect(g.showSingleEta).toBe(false);
        expect(g.showRange).toBe(false);
        expect(g.showDistribution).toBe(false);
    });

    it('low는 범위만 표시 (단일 ETA 숨김 — 정직성 핵심)', () => {
        const g = confidenceGuidance('low');
        expect(g.showSingleEta).toBe(false);
        expect(g.showRange).toBe(true);
        expect(g.showDistribution).toBe(false);
    });

    it('medium는 단일 + 범위', () => {
        const g = confidenceGuidance('medium');
        expect(g.showSingleEta).toBe(true);
        expect(g.showRange).toBe(true);
        expect(g.showDistribution).toBe(false);
    });

    it('high는 모두 표시', () => {
        const g = confidenceGuidance('high');
        expect(g.showSingleEta).toBe(true);
        expect(g.showRange).toBe(true);
        expect(g.showDistribution).toBe(true);
    });
});

describe('buildConfidenceWarnings', () => {
    it('통계 양호 → 경고 없음', () => {
        expect(buildConfidenceWarnings(stats())).toEqual([]);
    });

    it('활동일 부족 + 발산 + 변동 큼 → 다중 경고', () => {
        const w = buildConfidenceWarnings(stats({ activeDays: 5, scopeRatio: 1.8, cv: 1.0 }));
        expect(w.length).toBeGreaterThanOrEqual(2);
        expect(w.some((m) => m.includes('활동 일수 부족'))).toBe(true);
        expect(w.some((m) => m.includes('백로그 발산'))).toBe(true);
    });

    it('Scope creep (1.0~1.5) 단독 → growing 경고', () => {
        const w = buildConfidenceWarnings(stats({ scopeRatio: 1.2 }));
        expect(w.some((m) => m.includes('Scope creep'))).toBe(true);
    });
});
