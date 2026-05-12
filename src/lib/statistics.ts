/**
 * v1.0.46: 통계 유틸 공통 모듈.
 *
 * 분산되어 있던 percentile/평균/표준편차 등의 산정 함수를 한 곳에 모음.
 * 사용처: leadTimeForecast, monteCarloForecast 등 분포 분석 모듈 공유.
 *
 * 모든 함수는 pure (입력 → 출력, 부수 효과 X).
 */

/**
 * 백분위 산정 (linear interpolation).
 *
 * @param sorted  오름차순 정렬된 숫자 배열 (호출자 책임)
 * @param p       0~1 범위의 백분위 (0.5 = P50, 0.85 = P85)
 * @returns       보간된 백분위 값. 빈 배열이면 0.
 *
 * 알고리즘: NumPy 'linear' interpolation 방식
 *   idx = (n-1) * p
 *   lo, hi = floor(idx), ceil(idx)
 *   result = sorted[lo] * (1 - frac) + sorted[hi] * frac
 */
export function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    const frac = idx - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** 산술 평균. 빈 배열이면 0. */
export function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 표본 표준편차 (모집단이 아닌 sample stddev — n으로 나눔). */
export function stddev(values: number[], avg?: number): number {
    if (values.length === 0) return 0;
    const m = avg ?? mean(values);
    const variance = values.reduce((s, x) => s + (x - m) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

/** 중앙값 (= percentile(sorted, 0.5)). 편의 함수. */
export function median(sorted: number[]): number {
    return percentile(sorted, 0.5);
}
