/**
 * v1.0.36: 이슈별 정확도 산정.
 *
 * 각 이슈 expectation의 (실제 영업일 vs 약속 P85/P95) 비교.
 * 매 이슈 done = 1 데이터 포인트 → 빠른 calibration.
 *
 * 정직성: 5건 미만이면 'insufficient'.
 */
import type { IssueExpectation } from '@/stores/forecastExpectationStore';

export interface PerIssueAccuracyMetrics {
    /** 완료된(actualDays 있는) expectation 수 */
    sampleSize: number;
    /** 추적 중(미완료) expectation 수 — 진행 표시용 */
    inProgressCount: number;
    /** Mean Absolute Error (P85 기준 영업일) */
    maeP85Days: number;
    /** P50 hit rate (실제 ≤ p50) */
    hitRateP50: number;
    /** P85 hit rate (목표 ≥ 85%) */
    hitRateP85: number;
    /** P95 hit rate (목표 ≥ 95%) */
    hitRateP95: number;
    status: 'sufficient' | 'insufficient';
    calibration: 'well-calibrated' | 'over-confident' | 'under-confident' | 'insufficient';
    /** 평균 실제 소요 영업일 */
    avgActualDays: number;
    /** 평균 P85 약속 영업일 */
    avgPromisedP85: number;
}

const MIN_SAMPLE_SIZE = 5;

export function computePerIssueAccuracy(
    expectations: Record<string, IssueExpectation>,
    projectKey?: string
): PerIssueAccuracyMetrics {
    const all = Object.values(expectations).filter(
        (e) => projectKey == null || e.projectKey === projectKey
    );
    const completed = all.filter((e) => e.completedAt != null && e.actualDays != null);
    const inProgress = all.filter((e) => e.completedAt == null);

    if (completed.length < MIN_SAMPLE_SIZE) {
        return {
            sampleSize: completed.length,
            inProgressCount: inProgress.length,
            maeP85Days: 0,
            hitRateP50: 0,
            hitRateP85: 0,
            hitRateP95: 0,
            status: 'insufficient',
            calibration: 'insufficient',
            avgActualDays: 0,
            avgPromisedP85: 0,
        };
    }

    let absErrSum = 0;
    let actualSum = 0;
    let p85PromisedSum = 0;
    let p50Hits = 0,
        p85Hits = 0,
        p95Hits = 0;

    for (const e of completed) {
        const actual = e.actualDays!;
        absErrSum += Math.abs(actual - e.p85Days);
        actualSum += actual;
        p85PromisedSum += e.p85Days;
        if (actual <= e.p50Days) p50Hits++;
        if (actual <= e.p85Days) p85Hits++;
        if (actual <= e.p95Days) p95Hits++;
    }
    const n = completed.length;
    const hitP85 = (p85Hits / n) * 100;
    let calibration: PerIssueAccuracyMetrics['calibration'] = 'well-calibrated';
    if (hitP85 < 75) calibration = 'over-confident';
    else if (hitP85 > 92) calibration = 'under-confident';

    return {
        sampleSize: n,
        inProgressCount: inProgress.length,
        maeP85Days: +(absErrSum / n).toFixed(1),
        hitRateP50: +((p50Hits / n) * 100).toFixed(1),
        hitRateP85: +hitP85.toFixed(1),
        hitRateP95: +((p95Hits / n) * 100).toFixed(1),
        status: 'sufficient',
        calibration,
        avgActualDays: +(actualSum / n).toFixed(1),
        avgPromisedP85: +(p85PromisedSum / n).toFixed(1),
    };
}
