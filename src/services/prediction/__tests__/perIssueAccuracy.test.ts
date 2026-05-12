import { describe, it, expect } from 'vitest';
import { computePerIssueAccuracy } from '../perIssueAccuracy';
import { useForecastExpectationStore, type IssueExpectation } from '@/stores/forecastExpectationStore';

function makeExp(opts: {
    key: string;
    projectKey?: string;
    p50: number;
    p85: number;
    p95: number;
    actualDays: number | null;
}): IssueExpectation {
    return {
        issueKey: opts.key,
        projectKey: opts.projectKey ?? 'IGMU',
        firstSeenAt: '2026-04-01T00:00:00Z',
        p50Days: opts.p50,
        p85Days: opts.p85,
        p95Days: opts.p95,
        teamCV: 0.4,
        completedAt: opts.actualDays != null ? '2026-04-15T00:00:00Z' : null,
        actualDays: opts.actualDays,
    };
}

function toMap(exps: IssueExpectation[]): Record<string, IssueExpectation> {
    return Object.fromEntries(exps.map((e) => [e.issueKey, e]));
}

describe('computePerIssueAccuracy', () => {
    it('완료 < 5건 → insufficient (진행 중 카운트 별도)', () => {
        const exps = toMap([
            makeExp({ key: 'A1', p50: 5, p85: 10, p95: 15, actualDays: 8 }),
            makeExp({ key: 'A2', p50: 5, p85: 10, p95: 15, actualDays: 12 }),
            makeExp({ key: 'A3', p50: 5, p85: 10, p95: 15, actualDays: null }),
            makeExp({ key: 'A4', p50: 5, p85: 10, p95: 15, actualDays: null }),
        ]);
        const m = computePerIssueAccuracy(exps);
        expect(m.status).toBe('insufficient');
        expect(m.sampleSize).toBe(2);
        expect(m.inProgressCount).toBe(2);
    });

    it('5건 이상 → P85 hit rate 산정', () => {
        // 5건 모두 actual ≤ p85 → 100% hit
        const exps = toMap(Array(5).fill(0).map((_, i) =>
            makeExp({ key: `K-${i}`, p50: 5, p85: 10, p95: 15, actualDays: 8 })
        ));
        const m = computePerIssueAccuracy(exps);
        expect(m.status).toBe('sufficient');
        expect(m.sampleSize).toBe(5);
        expect(m.hitRateP85).toBe(100);
    });

    it('보정 등급 — well-calibrated (P85 80~92%)', () => {
        // 9건 hit, 1건 miss (90%)
        const hits = Array(9).fill(0).map((_, i) =>
            makeExp({ key: `H-${i}`, p50: 5, p85: 10, p95: 15, actualDays: 8 })
        );
        const miss = makeExp({ key: 'M-1', p50: 5, p85: 10, p95: 15, actualDays: 12 });
        const m = computePerIssueAccuracy(toMap([...hits, miss]));
        expect(m.calibration).toBe('well-calibrated');
        expect(m.hitRateP85).toBe(90);
    });

    it('보정 등급 — over-confident (P85 < 75%)', () => {
        // 5건 중 1건 hit, 4건 miss (20%)
        const exps = toMap([
            makeExp({ key: 'H', p50: 5, p85: 10, p95: 15, actualDays: 8 }),
            makeExp({ key: 'M1', p50: 5, p85: 10, p95: 15, actualDays: 20 }),
            makeExp({ key: 'M2', p50: 5, p85: 10, p95: 15, actualDays: 25 }),
            makeExp({ key: 'M3', p50: 5, p85: 10, p95: 15, actualDays: 18 }),
            makeExp({ key: 'M4', p50: 5, p85: 10, p95: 15, actualDays: 22 }),
        ]);
        const m = computePerIssueAccuracy(exps);
        expect(m.calibration).toBe('over-confident');
    });

    it('MAE 산정 + 평균 actual / 평균 promised', () => {
        // P85=10, actual=[8, 12, 14, 6, 10] → |2,2,4,4,0| sum=12 / 5 = 2.4 평균 actual=10
        const exps = toMap([
            makeExp({ key: 'A', p50: 5, p85: 10, p95: 15, actualDays: 8 }),
            makeExp({ key: 'B', p50: 5, p85: 10, p95: 15, actualDays: 12 }),
            makeExp({ key: 'C', p50: 5, p85: 10, p95: 15, actualDays: 14 }),
            makeExp({ key: 'D', p50: 5, p85: 10, p95: 15, actualDays: 6 }),
            makeExp({ key: 'E', p50: 5, p85: 10, p95: 15, actualDays: 10 }),
        ]);
        const m = computePerIssueAccuracy(exps);
        expect(m.maeP85Days).toBe(2.4);
        expect(m.avgActualDays).toBe(10);
        expect(m.avgPromisedP85).toBe(10);
    });

    it('projectKey 필터링 적용', () => {
        const exps = toMap([
            makeExp({ key: 'I1', projectKey: 'IGMU', p50: 5, p85: 10, p95: 15, actualDays: 8 }),
            makeExp({ key: 'I2', projectKey: 'IGMU', p50: 5, p85: 10, p95: 15, actualDays: 9 }),
            makeExp({ key: 'O1', projectKey: 'OTHER', p50: 5, p85: 10, p95: 15, actualDays: 25 }),
            makeExp({ key: 'O2', projectKey: 'OTHER', p50: 5, p85: 10, p95: 15, actualDays: 30 }),
        ]);
        const igmu = computePerIssueAccuracy(exps, 'IGMU');
        expect(igmu.sampleSize).toBe(2);
        const other = computePerIssueAccuracy(exps, 'OTHER');
        expect(other.sampleSize).toBe(2);
    });
});

describe('forecastExpectationStore', () => {
    function fresh() {
        useForecastExpectationStore.getState().clear();
        return useForecastExpectationStore.getState();
    }

    it('recordExpectations — 신규 키만 추가, 기존 키는 firstSeenAt 보존', () => {
        const store = fresh();
        store.recordExpectations(['A', 'B'], {
            projectKey: 'IGMU',
            firstSeenAt: '2026-04-01T00:00:00Z',
            p50Days: 5, p85Days: 10, p95Days: 15, teamCV: 0.3,
        });
        // 다른 시점·다른 P85으로 다시 호출 (이미 존재한 A는 보존)
        store.recordExpectations(['A', 'C'], {
            projectKey: 'IGMU',
            firstSeenAt: '2026-04-10T00:00:00Z',
            p50Days: 8, p85Days: 16, p95Days: 24, teamCV: 0.5,
        });
        const exps = useForecastExpectationStore.getState().expectations;
        expect(exps.A.firstSeenAt).toBe('2026-04-01T00:00:00Z'); // 보존
        expect(exps.A.p85Days).toBe(10); // 보존
        expect(exps.B.firstSeenAt).toBe('2026-04-01T00:00:00Z');
        expect(exps.C.firstSeenAt).toBe('2026-04-10T00:00:00Z');
        expect(exps.C.p85Days).toBe(16);
    });

    it('markIssuesCompleted — 미완료만 채움, 완료된 건 재변경 안 함', () => {
        const store = fresh();
        store.recordExpectations(['X'], {
            projectKey: 'IGMU',
            firstSeenAt: '2026-04-01T00:00:00Z',
            p50Days: 5, p85Days: 10, p95Days: 15, teamCV: 0.3,
        });
        store.markIssuesCompleted([
            { issueKey: 'X', completedAt: '2026-04-08T00:00:00Z', actualDays: 5 },
        ]);
        // 두 번째 호출은 무시되어야 함
        store.markIssuesCompleted([
            { issueKey: 'X', completedAt: '2026-04-15T00:00:00Z', actualDays: 12 },
        ]);
        const exps = useForecastExpectationStore.getState().expectations;
        expect(exps.X.completedAt).toBe('2026-04-08T00:00:00Z');
        expect(exps.X.actualDays).toBe(5);
    });

    it('markIssuesCompleted — expectation 없는 키는 무시', () => {
        const store = fresh();
        store.markIssuesCompleted([
            { issueKey: 'GHOST', completedAt: '2026-04-08T00:00:00Z', actualDays: 5 },
        ]);
        const exps = useForecastExpectationStore.getState().expectations;
        expect(exps.GHOST).toBeUndefined();
    });

    it('clear — 모든 expectations 비움', () => {
        const store = fresh();
        store.recordExpectations(['A', 'B'], {
            projectKey: 'IGMU',
            firstSeenAt: '2026-04-01T00:00:00Z',
            p50Days: 5, p85Days: 10, p95Days: 15, teamCV: 0.3,
        });
        store.clear();
        expect(Object.keys(useForecastExpectationStore.getState().expectations)).toHaveLength(0);
    });
});
