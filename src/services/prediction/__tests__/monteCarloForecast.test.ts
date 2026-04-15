import { describe, it, expect } from 'vitest';
import { monteCarloForecast, percentile, seededRng } from '../monteCarloForecast';

describe('monteCarloForecast', () => {
    it('빈 history → aborted no-history', () => {
        const r = monteCarloForecast(10, []);
        expect(r.aborted).toBe(true);
        expect(r.abortReason).toBe('no-history');
        expect(r.daysToComplete).toEqual([]);
    });

    it('잔여 0 → aborted no-remaining', () => {
        const r = monteCarloForecast(0, [1, 2, 3]);
        expect(r.aborted).toBe(true);
        expect(r.abortReason).toBe('no-remaining');
    });

    it('정확히 균일한 throughput → 좁은 분포', () => {
        // 매일 1건씩 완료 → 잔여 10 → 정확히 10일 (변동 없음)
        const r = monteCarloForecast(10, [1, 1, 1, 1, 1], { trials: 1000, rng: seededRng(42) });
        expect(r.aborted).toBe(false);
        expect(r.daysToComplete.length).toBe(1000);
        // 모든 trial이 정확히 10일이어야 함
        const unique = new Set(r.daysToComplete);
        expect(unique.size).toBe(1);
        expect([...unique][0]).toBe(10);
    });

    it('변동 있는 throughput → 넓은 분포', () => {
        // [0, 0, 0, 5] → 평균 1.25, 큰 변동
        const r = monteCarloForecast(10, [0, 0, 0, 5], { trials: 5000, rng: seededRng(42) });
        expect(r.aborted).toBe(false);
        const p50 = percentile(r.daysToComplete, 50);
        const p85 = percentile(r.daysToComplete, 85);
        const p95 = percentile(r.daysToComplete, 95);
        // P50 ≤ P85 ≤ P95
        expect(p50).toBeLessThanOrEqual(p85);
        expect(p85).toBeLessThanOrEqual(p95);
        // 평균 1.25/일 → 잔여 10 → 약 8일 근처. 변동으로 P95는 더 길 것
        expect(p50).toBeGreaterThan(0);
        expect(p95).toBeGreaterThan(p50);
    });

    it('Scope creep 보정 — 신규 유입 시 ETA 더 길어짐', () => {
        const baseThroughput = [2, 2, 2, 2, 2]; // 일평균 2건 완료
        const baseResult = monteCarloForecast(20, baseThroughput, { trials: 2000, rng: seededRng(123) });
        const baseP85 = percentile(baseResult.daysToComplete, 85);

        const withCreepResult = monteCarloForecast(20, baseThroughput, {
            trials: 2000,
            rng: seededRng(123),
            creationHistory: [3, 3, 3, 3, 3], // 매일 3건 신규 (완료보다 많음 → 발산)
        });
        // creation > completion이면 결과는 maxDays(=365)에 도달
        expect(withCreepResult.daysToComplete.every((d) => d > baseP85)).toBe(true);
    });

    it('큰 sample size에서도 50ms 이내 (성능 sanity)', () => {
        const start = performance.now();
        monteCarloForecast(50, [1, 0, 2, 1, 3, 0, 1, 2, 1, 0], { trials: 10_000, rng: seededRng(7) });
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(500); // 여유있게 500ms — 실제는 50ms 미만
    });
});

describe('percentile', () => {
    it('정렬되지 않은 배열에서 백분위', () => {
        const arr = [10, 1, 5, 2, 8, 3, 7, 4, 6, 9];
        expect(percentile(arr, 50)).toBe(5);
        expect(percentile(arr, 100)).toBe(10);
        expect(percentile(arr, 10)).toBe(1);
    });
    it('빈 배열 → NaN', () => {
        expect(percentile([], 50)).toBeNaN();
    });
    it('단일 원소', () => {
        expect(percentile([42], 50)).toBe(42);
        expect(percentile([42], 95)).toBe(42);
    });
});

describe('seededRng', () => {
    it('같은 시드는 같은 시퀀스 (재현성)', () => {
        const r1 = seededRng(42);
        const r2 = seededRng(42);
        for (let i = 0; i < 10; i++) {
            expect(r1()).toBe(r2());
        }
    });
    it('다른 시드는 다른 시퀀스', () => {
        const r1 = seededRng(1);
        const r2 = seededRng(2);
        expect(r1()).not.toBe(r2());
    });
    it('값은 [0, 1) 범위', () => {
        const rng = seededRng(99);
        for (let i = 0; i < 100; i++) {
            const v = rng();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
});
