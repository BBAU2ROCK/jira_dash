/**
 * Monte Carlo Throughput Forecast.
 *
 * 분석 보고서 §3.4 기준. 분포 자유(distribution-free) bootstrap resampling.
 *
 * 핵심 아이디어:
 *   "과거 일별 완료 건수에서 무작위로 하루치를 뽑아 잔여가 0이 될 때까지 반복.
 *    10,000번 시뮬레이션 후 결과 분포에서 P50/P85/P95 추출."
 *
 * 산업 표준: Daniel Vacanti (Kanban University), Troy Magennis (Forecaster).
 */

export interface MonteCarloOptions {
    /** 시뮬레이션 횟수 (default 10,000) */
    trials?: number;
    /** 단일 trial 최대 일수 (안전장치, default 365) */
    maxDays?: number;
    /** 시드 가능한 RNG (테스트 재현성 위해) */
    rng?: () => number;
    /** Scope creep 보정 — 매 일 신규 이슈 유입 샘플링 */
    creationHistory?: number[];
}

export interface MonteCarloResult {
    daysToComplete: number[];
    /** 입력 잔여 0 또는 historical 빈 배열로 시뮬레이션 못한 경우 true */
    aborted: boolean;
    abortReason?: 'no-remaining' | 'no-history';
}

/**
 * Monte Carlo 시뮬레이션. trials × maxDays = 최대 약 600,000 연산 (50ms 미만).
 *
 * @param remainingCount 잔여 이슈 수
 * @param historicalThroughput 일별 완료 건수 history (예: [2, 0, 3, 1, ...])
 *   0이 포함되어야 정확 — "작업 없는 날"도 미래에 발생할 수 있음을 모델링.
 */
export function monteCarloForecast(
    remainingCount: number,
    historicalThroughput: number[],
    options: MonteCarloOptions = {}
): MonteCarloResult {
    const trials = options.trials ?? 10_000;
    const maxDays = options.maxDays ?? 365;
    const rng = options.rng ?? Math.random;
    const N = historicalThroughput.length;

    if (remainingCount <= 0) {
        return { daysToComplete: [], aborted: true, abortReason: 'no-remaining' };
    }
    if (N === 0) {
        return { daysToComplete: [], aborted: true, abortReason: 'no-history' };
    }

    const creationN = options.creationHistory?.length ?? 0;
    const useScope = !!options.creationHistory && creationN > 0;
    const creation = options.creationHistory ?? [];

    const results: number[] = new Array(trials);
    for (let t = 0; t < trials; t++) {
        let remaining = remainingCount;
        let days = 0;
        while (remaining > 0 && days < maxDays) {
            // Scope creep 보정: 매 일 신규 이슈 유입
            if (useScope) {
                remaining += creation[Math.floor(rng() * creationN)];
            }
            remaining -= historicalThroughput[Math.floor(rng() * N)];
            days++;
        }
        results[t] = days;
    }
    return { daysToComplete: results, aborted: false };
}

/**
 * 정렬되지 않은 배열에서 백분위 값 추출.
 * @param p 0~100 백분위
 */
export function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return NaN;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

/**
 * Mulberry32 시드 RNG — 단위 테스트의 재현성 보장.
 * 프로덕션에서는 Math.random 사용.
 */
export function seededRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
