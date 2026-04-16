/**
 * Scope Change 분석 — 백로그 발산/수렴 감지.
 *
 * 분석 보고서 §3.5. 일별 신규 vs 완료 비교로 다음 4상태 분류:
 *   - 'stable'     : 0.7 ~ 1.0  (신규 ≤ 완료)
 *   - 'growing'    : 1.0 ~ 1.5  (백로그 약간 증가, scope creep)
 *   - 'crisis'     : > 1.5      (백로그 발산, 예측 의미 없음)
 *   - 'converging' : < 0.7      (마무리 단계)
 *
 * Phase 0 측정 결과:
 *   - IGMU: 0.13 → 'converging' (마무리)
 *   - IPCON: 1.69 → 'crisis' (발산)
 */

import type { ScopeStatus } from './types';
import { resolvePredictionConfig } from '@/lib/kpi-rules-resolver';

/** v1.0.10: 모듈 스코프 const C 제거 — 함수 진입 시 resolve */

/**
 * 신규/완료 비율 계산.
 * @returns 0 (완료가 0인 경우 분류 불가)
 */
export function scopeChangeRatio(createdCount: number, resolvedCount: number): number {
    if (resolvedCount <= 0) return 0;
    return createdCount / resolvedCount;
}

/**
 * 비율로부터 상태 분류.
 */
export function classifyScopeStatus(ratio: number): ScopeStatus {
    const C = resolvePredictionConfig();
    if (ratio <= 0) return 'converging'; // 완료만 있는 경우도 수렴으로 분류
    if (ratio > C.SCOPE_CRISIS_RATIO) return 'crisis';
    if (ratio > C.SCOPE_GROWING_RATIO) return 'growing';
    if (ratio < 0.7) return 'converging';
    return 'stable';
}

/**
 * UI 표시용 상태 메타 정보.
 */
export function scopeStatusMeta(status: ScopeStatus): {
    label: string;
    color: 'green' | 'amber' | 'red' | 'blue';
    icon: '✅' | '⚠' | '⛔' | 'ℹ';
    description: string;
} {
    switch (status) {
        case 'stable':
            return {
                label: '안정',
                color: 'green',
                icon: '✅',
                description: '신규 유입과 완료가 균형. 예측 신뢰 가능',
            };
        case 'growing':
            return {
                label: 'Scope Creep',
                color: 'amber',
                icon: '⚠',
                description: '신규가 완료보다 많음. 예측 ETA가 매주 후퇴할 수 있음',
            };
        case 'crisis':
            return {
                label: '백로그 발산',
                color: 'red',
                icon: '⛔',
                description: '신규 유입 속도가 처리 능력을 크게 초과. ETA 의미 없음. 신규 차단 또는 인력 보강 필요',
            };
        case 'converging':
            return {
                label: '마무리 단계',
                color: 'blue',
                icon: 'ℹ',
                description: '신규 유입이 적음. 백로그 소진 중',
            };
    }
}
