/**
 * 예측 신뢰도 등급 산정.
 *
 * 분석 보고서 §3.6, §7. Phase 0 측정으로 검증된 임계값:
 *   - IGMU (CV 1.25, scope 0.13) → 'low' (단일 ETA 숨김)
 *   - IPCON (CV 0.53, scope 1.69) → 'unreliable' (강한 경고)
 *
 * 정직성 원칙: 낮은 신뢰도일 때 단일 날짜를 보여주는 게 가장 큰 거짓말.
 */

import { JIRA_CONFIG } from '@/config/jiraConfig';
import type { ConfidenceLevel, ThroughputStats } from './types';

const C = JIRA_CONFIG.PREDICTION;

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
