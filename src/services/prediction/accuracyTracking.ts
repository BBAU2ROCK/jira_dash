/**
 * 예측 정확도 추적.
 *
 * - 예측 기록(forecastHistoryStore)에서 actual completion date가 채워진 항목으로 MAE 산출
 * - MAE = mean(|actual - predicted|)
 * - 백분위별 hit rate: P50/P85/P95 약속이 실제로 들어맞은 비율
 *
 * 정직성: 기록 5건 미만이면 'insufficient' — 단일 정확도 수치 미표시.
 */

import { differenceInCalendarDays } from 'date-fns';
import type { ForecastRecord } from '@/stores/forecastHistoryStore';

export interface AccuracyMetrics {
    sampleSize: number;
    /** 평균 절대 오차 (P85 기준, 영업일) */
    maeP85Days: number;
    /** P50 약속 hit rate (실제 ≤ predicted P50) */
    hitRateP50: number;
    /** P85 hit rate (목표 ≥ 85%) */
    hitRateP85: number;
    /** P95 hit rate (목표 ≥ 95%) */
    hitRateP95: number;
    /** 신뢰도: 'sufficient'면 표시 가능, 'insufficient'면 표본 부족 */
    status: 'sufficient' | 'insufficient';
    /** 보정 평가 — P85 hit rate가 80~90% 사이면 well-calibrated */
    calibration: 'well-calibrated' | 'over-confident' | 'under-confident' | 'insufficient';
}

const MIN_SAMPLE_SIZE = 5;

export function computeAccuracy(records: ForecastRecord[], projectKey?: string): AccuracyMetrics {
    const completed = records.filter(
        (r) => r.actualCompletionDate != null && (projectKey == null || r.projectKey === projectKey)
    );
    if (completed.length < MIN_SAMPLE_SIZE) {
        return {
            sampleSize: completed.length,
            maeP85Days: 0,
            hitRateP50: 0,
            hitRateP85: 0,
            hitRateP95: 0,
            status: 'insufficient',
            calibration: 'insufficient',
        };
    }
    let absErrSum = 0;
    let p50Hits = 0, p85Hits = 0, p95Hits = 0;
    for (const r of completed) {
        const recorded = new Date(r.recordedAt);
        const actual = new Date(r.actualCompletionDate!);
        const actualDays = Math.max(0, differenceInCalendarDays(actual, recorded));
        absErrSum += Math.abs(actualDays - r.p85Days);
        if (actualDays <= r.p50Days) p50Hits++;
        if (actualDays <= r.p85Days) p85Hits++;
        if (actualDays <= r.p95Days) p95Hits++;
    }
    const n = completed.length;
    const hitP85 = (p85Hits / n) * 100;
    let calibration: AccuracyMetrics['calibration'] = 'well-calibrated';
    if (hitP85 < 75) calibration = 'over-confident';
    else if (hitP85 > 92) calibration = 'under-confident';

    return {
        sampleSize: n,
        maeP85Days: +(absErrSum / n).toFixed(1),
        hitRateP50: +((p50Hits / n) * 100).toFixed(1),
        hitRateP85: +(hitP85.toFixed(1)),
        hitRateP95: +((p95Hits / n) * 100).toFixed(1),
        status: 'sufficient',
        calibration,
    };
}

/**
 * 백로그 0건 감지 — markCompleted 트리거 조건.
 * 정확히 0건이 되었거나 ≤ 임계값 (default 0)일 때 true.
 */
export function isBacklogCleared(activeCount: number, threshold = 0): boolean {
    return activeCount <= threshold;
}
