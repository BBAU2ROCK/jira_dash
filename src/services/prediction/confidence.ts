/**
 * 예측 신뢰도 등급 산정.
 *
 * 분석 보고서 §3.6, §7. Phase 0 측정으로 검증된 임계값:
 *   - IGMU (CV 1.25, scope 0.13) → 'low' (단일 ETA 숨김)
 *   - IPCON (CV 0.53, scope 1.69) → 'unreliable' (강한 경고)
 *
 * 정직성 원칙: 낮은 신뢰도일 때 단일 날짜를 보여주는 게 가장 큰 거짓말.
 */

import type { ConfidenceLevel, ThroughputStats } from './types';
import { resolvePredictionConfig } from '@/lib/kpi-rules-resolver';

/**
 * v1.0.10: 모듈-스코프 `const C` 제거. 함수 진입 시 resolve로 변경 → store 변경 즉시 반영.
 */

/**
 * 통계 입력으로 신뢰도 등급 결정.
 *
 * 우선순위 (가장 보수적인 등급이 이김):
 *   1. 활동일 < MIN_ACTIVE_DAYS_RELIABLE (7) → 'unreliable'
 *   2. scope ratio > SCOPE_CRISIS_RATIO (1.5) → 'unreliable' (백로그 발산)
 *   3. CV > UNRELIABLE_CV (0.8) → 'low' (정상 분포 가정 깨짐)
 *   4. 활동일 < HIGH_CONFIDENCE_ACTIVE_DAYS (30) 또는 CV > LOW_CONFIDENCE_CV (0.5) → 'low'
 *   5. 활동일 >= 30 + CV < 0.3 → 'high'
 *   6. 그 외 → 'medium'
 */
export function confidenceLevel(stats: ThroughputStats): ConfidenceLevel {
    const C = resolvePredictionConfig();
    if (stats.activeDays < C.MIN_ACTIVE_DAYS_RELIABLE) return 'unreliable';
    if (stats.scopeRatio > C.SCOPE_CRISIS_RATIO) return 'unreliable';
    if (stats.cv > C.UNRELIABLE_CV) return 'low';
    if (stats.activeDays < 14 || stats.cv > C.LOW_CONFIDENCE_CV) return 'low';
    if (stats.activeDays >= C.HIGH_CONFIDENCE_ACTIVE_DAYS && stats.cv < 0.3) return 'high';
    return 'medium';
}

/**
 * 등급별 사용자 표시 권장 동작.
 * UI 컴포넌트가 이 정보로 표시 분기.
 */
export function confidenceGuidance(level: ConfidenceLevel): {
    showSingleEta: boolean;
    showRange: boolean;
    showDistribution: boolean;
    label: string;
    description: string;
} {
    switch (level) {
        case 'high':
            return {
                showSingleEta: true,
                showRange: true,
                showDistribution: true,
                label: '높음',
                description: '데이터 충분, P50/P85/P95 모두 신뢰 가능',
            };
        case 'medium':
            return {
                showSingleEta: true,
                showRange: true,
                showDistribution: false,
                label: '중간',
                description: 'P85 권장 약속일 + 신뢰 구간만 표시',
            };
        case 'low':
            return {
                showSingleEta: false,
                showRange: true,
                showDistribution: false,
                label: '낮음',
                description: '단일 날짜는 부정확. 범위만 표시',
            };
        case 'unreliable':
            return {
                showSingleEta: false,
                showRange: false,
                showDistribution: false,
                label: '예측 불가',
                description: '데이터 부족 또는 백로그 발산 — 진단 정보만 표시',
            };
    }
}

/**
 * 통계로부터 사용자 경고 메시지 목록 생성.
 */
export function buildConfidenceWarnings(stats: ThroughputStats): string[] {
    const C = resolvePredictionConfig();
    const warnings: string[] = [];
    if (stats.activeDays < C.MIN_ACTIVE_DAYS_RELIABLE) {
        warnings.push(`활동 일수 부족 (${stats.activeDays}일 < ${C.MIN_ACTIVE_DAYS_RELIABLE}일 권장)`);
    }
    if (stats.scopeRatio > C.SCOPE_CRISIS_RATIO) {
        warnings.push(
            `백로그 발산 — 신규/완료 비율 ${stats.scopeRatio.toFixed(2)}x (${C.SCOPE_CRISIS_RATIO}x 초과). 예측 의미 없음`
        );
    } else if (stats.scopeRatio > C.SCOPE_GROWING_RATIO) {
        warnings.push(`Scope creep — 신규가 완료보다 많음 (${stats.scopeRatio.toFixed(2)}x). 예측 ETA가 후퇴할 수 있음`);
    }
    if (stats.cv > C.UNRELIABLE_CV) {
        warnings.push(`처리량 변동 매우 큼 (CV ${stats.cv.toFixed(2)}). 일괄 처리·블로커 영향 의심`);
    } else if (stats.cv > C.LOW_CONFIDENCE_CV) {
        warnings.push(`처리량 변동 큼 (CV ${stats.cv.toFixed(2)})`);
    }
    return warnings;
}

// ──────────────────────────────────────────────────────────────────
// v1.0.16: 데이터 충족 현황 — 임계값 진행 + 다음 등급 요건
// ──────────────────────────────────────────────────────────────────

export interface ReadinessMetric {
    /** 화면 표시 라벨 (한글 단순화) */
    label: string;
    /** InfoTip 영문/풀네임 */
    tip: string;
    /** 현재 값 */
    current: number;
    /** 표시 형식 */
    format: 'days' | 'ratio' | 'cv' | 'pct';
    /** 충족 임계값들 (낮은 → 높은 등급 순) */
    targets: Array<{ level: ConfidenceLevel; threshold: number; comparator: '<' | '>' | '<=' | '>='; meet: boolean }>;
    /** 진행 바 정규화 (0~1) */
    progress: number;
    /** 사용자 친화 상태 ("충족" / "부족" / "안정") */
    status: 'good' | 'warn' | 'bad';
}

/** 다음 등급까지 필요한 항목 */
export interface NextLevelRequirement {
    /** 도달 대상 등급 */
    target: ConfidenceLevel;
    /** 어떤 조건을 충족해야 하는가 (사용자 친화 텍스트) */
    items: Array<{ name: string; met: boolean; need: string }>;
    /** 모두 충족되었는가 */
    achievable: boolean;
}

/**
 * 통계로부터 데이터 충족 진행 현황 + 다음 등급 요건 산출.
 * UI(DataReadinessCard)에서 진행 바·다음 단계 안내 렌더링에 사용.
 */
export function computeReadiness(stats: ThroughputStats): {
    currentLevel: ConfidenceLevel;
    metrics: ReadinessMetric[];
    nextRequirements: NextLevelRequirement[];
} {
    const C = resolvePredictionConfig();
    const currentLevel = confidenceLevel(stats);

    // 1. 활동일 metric
    const activeDays: ReadinessMetric = {
        label: '활동 일수',
        tip: '최근 30일 중 완료 활동이 있었던 일수. 7일↑ 예측 가능, 14일↑ "중간", 30일↑ "높음" 등급 가능.',
        current: stats.activeDays,
        format: 'days',
        targets: [
            { level: 'low',    threshold: C.MIN_ACTIVE_DAYS_RELIABLE,    comparator: '>=', meet: stats.activeDays >= C.MIN_ACTIVE_DAYS_RELIABLE },
            { level: 'medium', threshold: 14,                              comparator: '>=', meet: stats.activeDays >= 14 },
            { level: 'high',   threshold: C.HIGH_CONFIDENCE_ACTIVE_DAYS,  comparator: '>=', meet: stats.activeDays >= C.HIGH_CONFIDENCE_ACTIVE_DAYS },
        ],
        progress: Math.min(stats.activeDays / C.HIGH_CONFIDENCE_ACTIVE_DAYS, 1),
        status: stats.activeDays >= C.HIGH_CONFIDENCE_ACTIVE_DAYS ? 'good'
              : stats.activeDays >= 14 ? 'warn' : 'bad',
    };

    // 2. CV (변동성) metric — 낮을수록 좋음 (역방향)
    const cvProgress = stats.cv === 0 ? 1 : Math.max(0, Math.min(1, 1 - stats.cv / C.UNRELIABLE_CV));
    const variability: ReadinessMetric = {
        label: '처리량 변동성',
        tip: 'CV (변동계수) = 표준편차 ÷ 평균. 낮을수록 안정적. 0.3 이하 = "높음" 등급 가능.',
        current: stats.cv,
        format: 'cv',
        targets: [
            { level: 'low',    threshold: C.UNRELIABLE_CV,    comparator: '<=', meet: stats.cv <= C.UNRELIABLE_CV },
            { level: 'medium', threshold: C.LOW_CONFIDENCE_CV, comparator: '<=', meet: stats.cv <= C.LOW_CONFIDENCE_CV },
            { level: 'high',   threshold: 0.3,                 comparator: '<=', meet: stats.cv <= 0.3 },
        ],
        progress: cvProgress,
        status: stats.cv <= 0.3 ? 'good'
              : stats.cv <= C.LOW_CONFIDENCE_CV ? 'warn' : 'bad',
    };

    // 3. Scope ratio (유입/완료) metric — 1.5 이하 안정
    const scopeProgress = Math.max(0, Math.min(1, 1 - stats.scopeRatio / C.SCOPE_CRISIS_RATIO));
    const scope: ReadinessMetric = {
        label: '유입/완료 비율',
        tip: '신규 task 유입 ÷ 완료 비율. 1.0 ≤ 안정, 1.0~1.5 = scope creep, 1.5 초과 = 백로그 발산 (예측 불가).',
        current: stats.scopeRatio,
        format: 'ratio',
        targets: [
            { level: 'low',    threshold: C.SCOPE_CRISIS_RATIO,  comparator: '<=', meet: stats.scopeRatio <= C.SCOPE_CRISIS_RATIO },
            { level: 'medium', threshold: C.SCOPE_GROWING_RATIO, comparator: '<=', meet: stats.scopeRatio <= C.SCOPE_GROWING_RATIO },
            { level: 'high',   threshold: 0.7,                    comparator: '<=', meet: stats.scopeRatio <= 0.7 },
        ],
        progress: scopeProgress,
        status: stats.scopeRatio <= 0.7 ? 'good'
              : stats.scopeRatio <= C.SCOPE_GROWING_RATIO ? 'warn' : 'bad',
    };

    const metrics = [activeDays, variability, scope];

    // 다음 등급 요건 — 현재 등급에서 한 단계 위
    const nextRequirements: NextLevelRequirement[] = [];

    if (currentLevel === 'unreliable') {
        const items = [];
        if (stats.activeDays < C.MIN_ACTIVE_DAYS_RELIABLE) {
            items.push({
                name: '활동 일수',
                met: false,
                need: `${C.MIN_ACTIVE_DAYS_RELIABLE - stats.activeDays}일 더 (현재 ${stats.activeDays}/${C.MIN_ACTIVE_DAYS_RELIABLE}일)`,
            });
        }
        if (stats.scopeRatio > C.SCOPE_CRISIS_RATIO) {
            items.push({
                name: '백로그 안정화',
                met: false,
                need: `유입/완료 비율 ${stats.scopeRatio.toFixed(2)}x → ${C.SCOPE_CRISIS_RATIO} 이하로 (신규 task 차단 또는 인력 보강)`,
            });
        }
        if (items.length === 0) items.push({ name: '데이터 신선도', met: true, need: '조건 충족' });
        nextRequirements.push({ target: 'low', items, achievable: items.every((i) => i.met) });
    }
    if (currentLevel === 'unreliable' || currentLevel === 'low') {
        const items = [];
        if (stats.activeDays < 14) {
            items.push({ name: '활동 일수', met: false, need: `${14 - stats.activeDays}일 더 (현재 ${stats.activeDays}/14일)` });
        } else {
            items.push({ name: '활동 일수', met: true, need: `${stats.activeDays}/14일 ✓` });
        }
        if (stats.cv > C.LOW_CONFIDENCE_CV) {
            items.push({ name: '변동성', met: false, need: `CV ${stats.cv.toFixed(2)} → ${C.LOW_CONFIDENCE_CV} 이하 (안정적 처리 패턴 필요)` });
        } else {
            items.push({ name: '변동성', met: true, need: `CV ${stats.cv.toFixed(2)} ✓` });
        }
        if (stats.scopeRatio > C.SCOPE_CRISIS_RATIO) {
            items.push({ name: '백로그', met: false, need: '발산 상태 해소 우선' });
        }
        nextRequirements.push({ target: 'medium', items, achievable: items.every((i) => i.met) });
    }
    if (currentLevel === 'low' || currentLevel === 'medium') {
        const items = [];
        if (stats.activeDays < C.HIGH_CONFIDENCE_ACTIVE_DAYS) {
            items.push({
                name: '활동 일수',
                met: false,
                need: `${C.HIGH_CONFIDENCE_ACTIVE_DAYS - stats.activeDays}일 더 (현재 ${stats.activeDays}/${C.HIGH_CONFIDENCE_ACTIVE_DAYS}일)`,
            });
        } else {
            items.push({ name: '활동 일수', met: true, need: `${stats.activeDays}/${C.HIGH_CONFIDENCE_ACTIVE_DAYS}일 ✓` });
        }
        if (stats.cv >= 0.3) {
            items.push({ name: '변동성', met: false, need: `CV ${stats.cv.toFixed(2)} → 0.3 미만으로 (매우 안정적 처리 패턴)` });
        } else {
            items.push({ name: '변동성', met: true, need: `CV ${stats.cv.toFixed(2)} ✓` });
        }
        nextRequirements.push({ target: 'high', items, achievable: items.every((i) => i.met) });
    }

    return { currentLevel, metrics, nextRequirements };
}
