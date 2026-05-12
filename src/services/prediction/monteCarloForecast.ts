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
 *
 * 1000+ 이슈에서는 monteCarloForecastAsync()를 사용하여 Web Worker로 offload — main thread freeze 방지.
 */

/** Web Worker 사용 임계값. 이를 넘으면 monteCarloForecastAsync()가 worker로 분기. */
export const MONTE_CARLO_WORKER_THRESHOLD = 50_000;

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
    /**
     * v1.0.50 (H10): maxDays 한계에 도달한 trial 비율 (0~1).
     *   - 0이면 모든 trial이 정상 종료
     *   - >0.5 이면 시뮬레이션이 사실상 "끝나지 않음" — UI는 "예측 불가" 표시 권장
     *   - aborted=true 인 경우 0
     */
    cappedRate: number;
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
        return { daysToComplete: [], aborted: true, abortReason: 'no-remaining', cappedRate: 0 };
    }
    if (N === 0) {
        return { daysToComplete: [], aborted: true, abortReason: 'no-history', cappedRate: 0 };
    }

    const creationN = options.creationHistory?.length ?? 0;
    const useScope = !!options.creationHistory && creationN > 0;
    const creation = options.creationHistory ?? [];

    const results: number[] = new Array(trials);
    let cappedTrials = 0;
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
        if (days >= maxDays && remaining > 0) cappedTrials++;
        results[t] = days;
    }
    return {
        daysToComplete: results,
        aborted: false,
        cappedRate: trials > 0 ? cappedTrials / trials : 0,
    };
}

/**
 * 정렬되지 않은 배열에서 백분위 값 추출.
 * @param p 0~100 백분위
 *
 * v1.0.50: 내부적으로 `lib/statistics.percentile`(linear interpolation, 0~1)을 호출.
 *   - 빈 배열은 NaN 반환 (legacy 호환 — lib/statistics는 0 반환).
 *   - p=100/0 경계는 양쪽 동일.
 *   - 중간값은 linear 보간 결과로 통일 (기존 nearest-rank 대비 약간의 부드러움).
 *
 * **신규 코드는 `lib/statistics.percentile(sorted, p∈[0,1])` 직접 사용 권장.**
 * 이 함수는 deprecated 별칭이지만 MC 결과 컨슈머 호환을 위해 보존.
 */
import { percentile as percentileLinear } from '@/lib/statistics';
export function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return NaN;
    const sorted = [...arr].sort((a, b) => a - b);
    return percentileLinear(sorted, p / 100);
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

/**
 * Web Worker 분기 dispatcher.
 * - 작은 입력(< MONTE_CARLO_WORKER_THRESHOLD) → main thread 동기 (worker overhead 회피)
 * - 큰 입력 → Web Worker로 offload (UI freeze 방지)
 *
 * 시드 RNG는 worker로 전달 불가 (함수 직렬화 X). seededRng는 main thread에서만 사용.
 */
export async function monteCarloForecastAsync(
    remainingCount: number,
    historicalThroughput: number[],
    options: Omit<MonteCarloOptions, 'rng'> = {}
): Promise<MonteCarloResult> {
    const trials = options.trials ?? 10_000;
    const maxDays = options.maxDays ?? 365;
    // v1.0.50 (H9): worker 분기 비용 추정을 실제 부하 비례로 변경.
    //   기존: remaining × history.length × trials/1000 — 실제 비용과 무관한 식
    //   신규: trials × expectedDays — expectedDays = min(maxDays, remaining/max(mean,1))
    //   throughput mean이 0에 가까우면 expectedDays = maxDays로 cap.
    const histSum = historicalThroughput.reduce((a, b) => a + b, 0);
    const histMean = historicalThroughput.length > 0 ? histSum / historicalThroughput.length : 0;
    const expectedDays = histMean > 0
        ? Math.min(maxDays, Math.ceil(remainingCount / histMean))
        : maxDays;
    const workSize = trials * expectedDays;
    if (workSize < MONTE_CARLO_WORKER_THRESHOLD || typeof Worker === 'undefined') {
        return monteCarloForecast(remainingCount, historicalThroughput, options);
    }
    try {
        // dynamic import of Vite ?worker — 빌드 타임에만 처리
        const WorkerModule = await import('./monteCarloForecast.worker?worker');
        const worker = new WorkerModule.default();
        return await new Promise<MonteCarloResult>((resolve, reject) => {
            worker.onmessage = (e: MessageEvent<MonteCarloResult>) => {
                resolve(e.data);
                worker.terminate();
            };
            worker.onerror = (err) => {
                reject(err);
                worker.terminate();
            };
            worker.postMessage({ remainingCount, historicalThroughput, options });
        });
    } catch (err) {
        // Web Worker 실패 시 main thread fallback
        console.warn('[MC] Worker dispatch failed, fallback to main thread:', err);
        return monteCarloForecast(remainingCount, historicalThroughput, options);
    }
}
