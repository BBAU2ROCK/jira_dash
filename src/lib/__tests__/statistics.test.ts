import { describe, it, expect } from 'vitest';
import { percentile, mean, stddev, median } from '../statistics';

describe('percentile (linear interpolation)', () => {
    it('빈 배열 → 0', () => {
        expect(percentile([], 0.5)).toBe(0);
    });

    it('단일 값 → 그 값', () => {
        expect(percentile([5], 0.5)).toBe(5);
        expect(percentile([5], 0.85)).toBe(5);
    });

    it('P50 (median) — 5 elements', () => {
        expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    });

    it('P85 — boundary 처리 (4 elements)', () => {
        // idx = 3 * 0.85 = 2.55 → lo=2, hi=3, frac=0.55
        // [1,2,3,4][2] * 0.45 + [1,2,3,4][3] * 0.55 = 1.35 + 2.2 = 3.55
        expect(percentile([1, 2, 3, 4], 0.85)).toBeCloseTo(3.55, 2);
    });

    it('P0 = min, P100 = max', () => {
        expect(percentile([5, 10, 15], 0)).toBe(5);
        expect(percentile([5, 10, 15], 1)).toBe(15);
    });
});

describe('mean', () => {
    it('빈 배열 → 0', () => {
        expect(mean([])).toBe(0);
    });
    it('정상 평균', () => {
        expect(mean([1, 2, 3, 4, 5])).toBe(3);
    });
});

describe('stddev', () => {
    it('빈 배열 → 0', () => {
        expect(stddev([])).toBe(0);
    });
    it('동일 값 → 0', () => {
        expect(stddev([5, 5, 5])).toBe(0);
    });
    it('정상 표준편차 (n으로 나눔)', () => {
        // [1,2,3,4,5] mean=3, variance=(4+1+0+1+4)/5=2, stddev=√2
        expect(stddev([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2), 5);
    });
    it('avg 인자 받으면 그것 사용 (재계산 X)', () => {
        // mean을 잘못 전달해도 그것 기준 산출
        expect(stddev([1, 2, 3], 5)).toBeCloseTo(Math.sqrt(((-4) ** 2 + (-3) ** 2 + (-2) ** 2) / 3), 5);
    });
});

describe('median', () => {
    it('홀수 길이 — 중앙값', () => {
        expect(median([1, 2, 3, 4, 5])).toBe(3);
    });
    it('짝수 길이 — 가운데 두 값 평균', () => {
        // idx = 3 * 0.5 = 1.5, lo=1, hi=2, frac=0.5
        // 2 * 0.5 + 3 * 0.5 = 2.5
        expect(median([1, 2, 3, 4])).toBe(2.5);
    });
});
