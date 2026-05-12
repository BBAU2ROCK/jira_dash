/**
 * v1.0.43: Lead Time 기반 forecast.
 *
 * 사용자 통찰:
 *   "등록 시점부터 완료되는 시간을 계산 후 등록한 타스크의 종료 시점을 예측하는거지?
 *    샘플링은 대략 2~30개 정도면 가능하지 않아?"
 *
 * 현재 Throughput Monte Carlo의 한계:
 *   - 활동일 ≥ 7 필요 (시계열 분산 확보)
 *   - 활동일 < 7이면 무조건 unreliable → IGMU 같은 환경에서 ETA 불가
 *
 * Lead Time forecast의 강점:
 *   - 이슈 단위 lead time 분포 (created → completed)
 *   - 30+ 샘플이면 P50/P85 신뢰 가능 (CLT 발동)
 *   - 활동일 무관 (이슈만 있으면 OK)
 *   - 직관적: "이 이슈는 보통 N일 후 완료"
 *
 * 한계 (정직성 명시):
 *   - 병렬성: ceil(활성 / 활성 인원) × P85로 단순 보정 — 실제 할당 패턴은 다양
 *   - 이슈 크기 차이 무시 (P85 평균만)
 *   - 인력 변화 미반영
 *   - P95는 long-tail이라 100+ 샘플 권장 (낮을 때 warning)
 */
import type { JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues, isBusinessDone } from '@/lib/jira-helpers';
import { parseLocalDay, businessDaysBetween, addBusinessDays } from '@/lib/date-utils';
import { percentile } from '@/lib/statistics';
import {
    resolveCancelledStatus,
    resolveRejectedStatus,
    resolveFields,
    resolveOnHoldStatus,
} from '@/lib/kpi-rules-resolver';
import type { ConfidenceLevel } from './types';
import { isInBacklog } from './perAssigneeForecast';

/** 단일 이슈 lead time 정보 */
export interface IssueLeadTime {
    issueKey: string;
    createdAt: Date;
    completedAt: Date;
    /** 영업일 기준 */
    leadTimeBusinessDays: number;
}

/**
 * v1.0.45: Lead time 분포 사후 검증 (self-consistency check).
 *
 * 모든 완료 이슈의 lead time이 자신의 P50/P85/P95 약속에 얼마나 부합하는지.
 * 정의상 trivial (≈50/85/95%) 하지만 분포 안정성·이상치 검출에 가치 있음:
 *   - 정상 분포: 적중률이 목표(50/85/95)에 근접
 *   - 이상치 多: 적중률이 목표와 크게 다름 (예: P85 적중률 60% = over-confident)
 */
export interface LeadTimeDistributionCheck {
    /** 검증에 사용된 총 샘플 (= sampleSize와 동일) */
    totalSamples: number;
    /** P50 적중률 (%) — 분포 정의상 ≈50% */
    hitRateP50: number;
    /** P85 적중률 (%) — 분포 정의상 ≈85% */
    hitRateP85: number;
    /** P95 적중률 (%) — 분포 정의상 ≈95% */
    hitRateP95: number;
    /** 보정 등급 (P85 hit rate 기준) */
    calibration: 'well-calibrated' | 'over-confident' | 'under-confident' | 'insufficient';
}

/** 활성 이슈 ETA */
export interface ActiveIssueEta {
    issueKey: string;
    summary: string;
    assigneeName: string | null;
    createdAt: Date;
    /** 예상 잔여 영업일 (P85 기준) — 단순 가정 (모든 이슈 즉시 시작) */
    estimatedRemainingDays: number;
    /** 예상 완료일 (오늘 + 잔여) */
    estimatedCompletionDate: Date;
    /** ETA 초과 위험 (이미 P85 lead time 경과한 경우) */
    overdue: boolean;
}

export interface LeadTimeForecast {
    /** 샘플 수 — 완료된 이슈 중 valid lead time이 있는 것 */
    sampleSize: number;
    /** 백분위 (영업일) */
    p50Days: number;
    p85Days: number;
    p95Days: number;
    /** 평균 영업일 */
    meanDays: number;
    /** 표준편차 */
    stddevDays: number;

    /** 활성 백로그 건수 */
    activeCount: number;
    /** 활성 인원 (unique assignee) — 미할당 별도 카운트 안 함 */
    activeParallelism: number;
    /** 미할당 이슈 수 (병렬성에서 제외됨) */
    unassignedCount: number;

    /**
     * 팀 백로그 ETA (영업일) = ceil(활성 / 병렬성) × P85.
     * 단순 가정: 모든 활성 인원이 동시 진행, 각 이슈 P85일 소요.
     * v1.0.44: realistic 시나리오와 동일 (기준 ★ 권장 약속).
     */
    teamEtaBusinessDays: number;
    /** ETA 종료일 (오늘 + teamEtaBusinessDays 영업일) */
    teamEtaDate: Date;

    /**
     * v1.0.44: 3 시나리오 ETA (Throughput MC unreliable 시 낙관/기준/보수로 사용).
     *   optimistic    = ceil(active / parallelism) × P50  ("보통 50% 이하로 처리")
     *   realistic     = ceil(active / parallelism) × P85  ("85% 이내 완료 약속" — 기준)
     *   conservative  = ceil(active / parallelism) × P95  ("95% 이내 완료, 보수적")
     */
    scenarios: {
        optimistic: { days: number; date: Date };
        realistic: { days: number; date: Date };
        conservative: { days: number; date: Date };
    };

    /** 활성 이슈별 ETA (옵션 B) */
    perIssueEtas: ActiveIssueEta[];

    /** v1.0.45: 사후 분포 검증 — 완료 이슈 lead time이 자신의 P85에 얼마나 부합하는지 */
    distributionCheck: LeadTimeDistributionCheck;

    /** 신뢰도: 샘플 + 데이터 품질 종합 */
    confidence: ConfidenceLevel;
    /** 사용자에게 표시할 warning */
    warnings: string[];
}

/** 샘플 임계 — 사용자 결정 (v1.0.43)
 *  v1.0.46 fix (C1): 상수 중복 제거. MEDIUM_SAMPLE이 MIN_SAMPLE_RELIABLE와 같은 값(30)이라 혼란 유발.
 *  P95_WARN_THRESHOLD = 50 = P95 추정이 정밀해지는 임계 (long-tail 분포라 더 많은 샘플 필요).
 */
const MIN_SAMPLE_RELIABLE = 30;     // P50/P85 추정 가능 임계
const HIGH_SAMPLE = 100;             // high confidence + P95 신뢰 가능
const P95_WARN_THRESHOLD = 50;       // 30~49 구간에서 P95 warning 표시

/**
 * 완료된 이슈에서 lead time 추출.
 * - lead time = businessDaysBetween(created, completed)
 * - 0일 (당일 처리)도 포함
 * - completed = customfield_11485 OR resolutiondate (isBusinessDone 정의)
 */
export function extractLeadTimes(issues: JiraIssue[]): IssueLeadTime[] {
    const F = resolveFields();
    const cancelled = resolveCancelledStatus();
    const rejected = resolveRejectedStatus();

    const result: IssueLeadTime[] = [];
    for (const issue of issues) {
        if (!isBusinessDone(issue)) continue;
        const sn = issue.fields.status?.name?.trim() ?? '';
        if (sn === cancelled || sn === rejected) continue;

        const created = parseLocalDay(issue.fields.created);
        const completed = parseLocalDay(issue.fields[F.ACTUAL_DONE] as string | undefined ?? null)
            ?? parseLocalDay(issue.fields.resolutiondate ?? null);
        if (!created || !completed) continue;
        if (completed < created) continue; // 데이터 오류 방어

        const lead = businessDaysBetween(created, completed);
        result.push({
            issueKey: issue.key,
            createdAt: created,
            completedAt: completed,
            leadTimeBusinessDays: Math.max(0, lead),
        });
    }
    return result;
}

/**
 * Lead Time forecast 산정.
 * @param issues 모든 leaf 이슈 (filterLeafIssues 이전·이후 둘 다 OK — 내부 처리)
 * @param now 기준 시각
 */
export function computeLeadTimeForecast(issues: JiraIssue[], now: Date = new Date()): LeadTimeForecast {
    const leaf = filterLeafIssues(issues);

    // 1) 완료 이슈 lead time
    const leads = extractLeadTimes(leaf);
    const sampleSize = leads.length;
    const days = leads.map((l) => l.leadTimeBusinessDays).sort((a, b) => a - b);

    const p50 = percentile(days, 0.5);
    const p85 = percentile(days, 0.85);
    const p95 = percentile(days, 0.95);
    const mean = days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : 0;
    const variance = days.length > 0
        ? days.reduce((s, x) => s + (x - mean) ** 2, 0) / days.length
        : 0;
    const stddev = Math.sqrt(variance);

    // 2) 활성 백로그 + 병렬성 (활성 인원 자동 추출)
    const onHoldName = resolveOnHoldStatus();
    const active = leaf.filter((i) => isInBacklog(i) && i.fields.status?.name !== onHoldName);
    const activeCount = active.length;

    const assigneeSet = new Set<string>();
    let unassigned = 0;
    for (const i of active) {
        const a = i.fields.assignee;
        if (a) {
            // accountId 우선, 없으면 displayName
            const key = a.accountId || a.displayName;
            if (key) assigneeSet.add(key);
        } else {
            unassigned++;
        }
    }
    const activeParallelism = Math.max(1, assigneeSet.size);

    // 3) 팀 ETA = ceil(활성 / 병렬성) × P85 (영업일)
    const teamEtaBusinessDays = activeCount > 0 && p85 > 0
        ? Math.ceil(activeCount / activeParallelism) * p85
        : 0;
    const teamEtaDate = teamEtaBusinessDays > 0
        ? addBusinessDays(now, Math.ceil(teamEtaBusinessDays))
        : now;

    // v1.0.44: 3 시나리오 (낙관/기준/보수) — 같은 공식 백분위만 다름
    const buildScenario = (percentileDays: number) => {
        const days = activeCount > 0 && percentileDays > 0
            ? Math.ceil(Math.ceil(activeCount / activeParallelism) * percentileDays)
            : 0;
        const date = days > 0 ? addBusinessDays(now, days) : now;
        return { days, date };
    };
    const scenarios = {
        optimistic: buildScenario(p50),
        realistic: buildScenario(p85),
        conservative: buildScenario(p95),
    };

    // v1.0.45: 사후 분포 검증 — 모든 lead time 샘플이 자신의 P85에 얼마나 부합하는지
    let hitP50 = 0, hitP85 = 0, hitP95 = 0;
    for (const lt of days) {
        if (lt <= p50) hitP50++;
        if (lt <= p85) hitP85++;
        if (lt <= p95) hitP95++;
    }
    const sampleSizeForCheck = days.length;
    const hitRateP50 = sampleSizeForCheck > 0 ? +(100 * hitP50 / sampleSizeForCheck).toFixed(1) : 0;
    const hitRateP85 = sampleSizeForCheck > 0 ? +(100 * hitP85 / sampleSizeForCheck).toFixed(1) : 0;
    const hitRateP95 = sampleSizeForCheck > 0 ? +(100 * hitP95 / sampleSizeForCheck).toFixed(1) : 0;

    let distCalibration: LeadTimeDistributionCheck['calibration'] = 'insufficient';
    if (sampleSizeForCheck >= 5) {
        // 분포 정의상 trivial이지만, 이상치가 많으면 임계 벗어남
        if (hitRateP85 < 75) distCalibration = 'over-confident';
        else if (hitRateP85 > 92) distCalibration = 'under-confident';
        else distCalibration = 'well-calibrated';
    }

    const distributionCheck: LeadTimeDistributionCheck = {
        totalSamples: sampleSizeForCheck,
        hitRateP50,
        hitRateP85,
        hitRateP95,
        calibration: distCalibration,
    };

    // 4) 활성 이슈별 ETA — 각 이슈마다 createdAt 기준 잔여
    const perIssueEtas: ActiveIssueEta[] = active.map((i) => {
        const created = parseLocalDay(i.fields.created) ?? now;
        const elapsed = businessDaysBetween(created, now);
        const remaining = Math.max(0, p85 - elapsed);
        return {
            issueKey: i.key,
            summary: i.fields.summary ?? i.key,
            assigneeName: i.fields.assignee?.displayName ?? null,
            createdAt: created,
            estimatedRemainingDays: +remaining.toFixed(1),
            estimatedCompletionDate: addBusinessDays(now, Math.ceil(remaining)),
            overdue: elapsed > p85,
        };
    });

    // 5) 신뢰도 판정
    const warnings: string[] = [];
    let confidence: ConfidenceLevel = 'high';
    if (sampleSize < 10) {
        confidence = 'unreliable';
        warnings.push(`Lead time 샘플 ${sampleSize}건 — 최소 10건 필요`);
    } else if (sampleSize < MIN_SAMPLE_RELIABLE) {
        confidence = 'low';
        warnings.push(`Lead time 샘플 ${sampleSize}건 — 권장 ${MIN_SAMPLE_RELIABLE}건 미만 (P50/P85 추정 가능, P95는 부정확)`);
    } else if (sampleSize < HIGH_SAMPLE) {
        confidence = 'medium';
        if (sampleSize < P95_WARN_THRESHOLD) {
            warnings.push(`샘플 ${sampleSize}건 — P95 추정은 100건+ 권장 (long-tail 분포)`);
        }
    }

    // 병렬성 1 (단독 작업자) 경고
    if (activeParallelism === 1 && activeCount > 5) {
        warnings.push(`활성 인원 1명 — 모든 ${activeCount}건이 순차 처리되어야 함`);
    }
    if (unassigned > 0) {
        warnings.push(`미할당 ${unassigned}건 — ETA 산정에 포함 안 됨`);
    }
    if (activeCount === 0) {
        warnings.push('활성 백로그 0건 — ETA 산정 불필요');
    }

    return {
        sampleSize,
        p50Days: +p50.toFixed(1),
        p85Days: +p85.toFixed(1),
        p95Days: +p95.toFixed(1),
        meanDays: +mean.toFixed(1),
        stddevDays: +stddev.toFixed(1),
        activeCount,
        activeParallelism,
        unassignedCount: unassigned,
        teamEtaBusinessDays: Math.ceil(teamEtaBusinessDays),
        teamEtaDate,
        scenarios,
        perIssueEtas,
        distributionCheck,
        confidence,
        warnings,
    };
}
