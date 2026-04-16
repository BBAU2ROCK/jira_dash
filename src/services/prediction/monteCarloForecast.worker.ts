/**
 * Monte Carlo Web Worker — main thread offload.
 *
 * 1000+ 이슈 + 30일 history (50,000+ 연산) 시 main thread를 막지 않도록 분리.
 * 사용 패턴 (Vite):
 *   import MCWorker from './monteCarloForecast.worker?worker';
 *   const worker = new MCWorker();
 *   worker.postMessage({ remainingCount, historicalThroughput, options });
 *   worker.onmessage = (e) => { e.data: MonteCarloResult }
 */

import { monteCarloForecast, type MonteCarloOptions, type MonteCarloResult } from './monteCarloForecast';

interface WorkerInput {
    remainingCount: number;
    historicalThroughput: number[];
    options?: Omit<MonteCarloOptions, 'rng'>;
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
    const { remainingCount, historicalThroughput, options } = e.data;
    const result: MonteCarloResult = monteCarloForecast(remainingCount, historicalThroughput, options);
    self.postMessage(result);
};

// TypeScript: this file is a module
export {};
