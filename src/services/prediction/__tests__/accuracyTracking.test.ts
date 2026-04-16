import { describe, it, expect } from 'vitest';
import { computeAccuracy, isBacklogCleared } from '../accuracyTracking';
import type { ForecastRecord } from '@/stores/forecastHistoryStore';

function makeRec(opts: {
    daysAgo: number;
    p50: number;
    p85: number;
    p95: number;
    actualDaysAfterRecord: number | null;
    projectKey?: string;
}): ForecastRecord {
    const recorded = new Date();
    recorded.setDate(recorded.getDate() - opts.daysAgo);
    const actual = opts.actualDaysAfterRecord != null
        ? new Date(recorded.getTime() + opts.actualDaysAfterRecord * 24 * 60 * 60 * 1000).toISOString()
        : null;
    return {
        id: `r-${Math.random()}`,
        projectKey: opts.projectKey ?? 'IGMU',
        recordedAt: recorded.toISOString(),
        p50Days: opts.p50,
        p85Days: opts.p85,
        p95Days: opts.p95,
        remainingAtTime: 50,
        teamCV: 0.4,
        teamMean: 1.5,
        activeDays: 25,
        actualCompletionDate: actual,
        actualRemaining: actual ? 0 : null,
    };
}

describe('computeAccuracy', () => {
    it('표본 < 5 → insufficient', () => {
        const recs = Array(3).fill(0).map(() => makeRec({ daysAgo: 30, p50: 10, p85: 20, p95: 30, actualDaysAfterRecord: 18 }));
        const m = computeAccuracy(recs);
        expect(m.status).toBe('insufficient');
        expect(m.sampleSize).toBe(3);
    });

    it('완료 안 된 기록 제외', () => {
        const recs = [
            ...Array(3).fill(0).map(() => makeRec({ daysAgo: 30, p50: 10, p85: 20, p95: 30, actualDaysAfterRecord: 18 })),
            ...Array(5).fill(0).map(() => makeRec({ daysAgo: 30, p50: 10, p85: 20, p95: 30, actualDaysAfterRecord: null })),
        ];
        const m = computeAccuracy(recs);
        expect(m.sampleSize).toBe(3); // 완료된 것만
        expect(m.status).toBe('insufficient');
    });

    it('정확히 P85대로 완료 → MAE 0, hit rate 100%', () => {
        const recs = Array(5).fill(0).map(() => makeRec({ daysAgo: 30, p50: 10, p85: 20, p95: 30, actualDaysAfterRecord: 20 }));
        const m = computeAccuracy(recs);
        expect(m.status).toBe('sufficient');
        expect(m.maeP85Days).toBe(0);
        expect(m.hitRateP85).toBe(100);
        expect(m.hitRateP95).toBe(100);
        // 20 = P85, P50(10) 미달 → hitP50 0
        expect(m.hitRateP50).toBe(0);
        expect(m.calibration).toBe('under-confident'); // 100% > 92%
    });

    it('잘 보정된 케이스 — P85 hit rate ~85%', () => {
        // 5건 중 4건 P85 안에, 1건은 초과
        const recs = [
            ...Array(4).fill(0).map(() => makeRec({ daysAgo: 30, p50: 10, p85: 20, p95: 30, actualDaysAfterRecord: 18 })),
            makeRec({ daysAgo: 30, p50: 10, p85: 20, p95: 30, actualDaysAfterRecord: 35 }),
        ];
        const m = computeAccuracy(recs);
        expect(m.hitRateP85).toBe(80); // 4/5
        expect(m.calibration).toBe('well-calibrated'); // 75~92
    });

    it('과신 케이스 — hit rate < 75%', () => {
        // 5건 중 1건만 P85 안에
        const recs = [
            makeRec({ daysAgo: 30, p50: 10, p85: 20, p95: 30, actualDaysAfterRecord: 18 }),
            ...Array(4).fill(0).map(() => makeRec({ daysAgo: 30, p50: 10, p85: 20, p95: 30, actualDaysAfterRecord: 40 })),
        ];
        const m = computeAccuracy(recs);
        expect(m.hitRateP85).toBe(20);
        expect(m.calibration).toBe('over-confident');
    });

    it('projectKey 필터링', () => {
        const recs = [
            ...Array(5).fill(0).map(() => makeRec({ daysAgo: 30, p50: 10, p85: 20, p95: 30, actualDaysAfterRecord: 18, projectKey: 'A' })),
            ...Array(3).fill(0).map(() => makeRec({ daysAgo: 30, p50: 10, p85: 20, p95: 30, actualDaysAfterRecord: 18, projectKey: 'B' })),
        ];
        const mA = computeAccuracy(recs, 'A');
        const mB = computeAccuracy(recs, 'B');
        expect(mA.sampleSize).toBe(5);
        expect(mB.sampleSize).toBe(3);
        expect(mA.status).toBe('sufficient');
        expect(mB.status).toBe('insufficient');
    });
});

describe('isBacklogCleared', () => {
    it('0건이면 true', () => {
        expect(isBacklogCleared(0)).toBe(true);
    });
    it('임계값 이하면 true', () => {
        expect(isBacklogCleared(2, 5)).toBe(true);
        expect(isBacklogCleared(5, 5)).toBe(true);
    });
    it('초과면 false', () => {
        expect(isBacklogCleared(10, 5)).toBe(false);
    });
});
