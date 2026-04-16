/**
 * K4: KPI 툴팁 동적 텍스트 빌더.
 *
 * project-stats-dialog의 GradeCard 툴팁이 하드코딩된 "S: 95% 이상 ..."에서
 * kpiRulesStore의 실제 기준으로 동기화되도록 빌더 함수를 모았다.
 * UI 레이아웃·용어는 기존과 동일, 숫자만 store에서 읽어옴.
 */

import type { KpiRuleSet, GradeThresholds, EarlyBonusStep } from '@/stores/kpiRulesStore';

/** "S: 95% 이상  A: 90% 이상 ..." 한 줄 */
export function formatKpiGradeLine(grades: GradeThresholds): string {
    return `S: ${grades.S}% 이상  A: ${grades.A}% 이상  B: ${grades.B}% 이상  C: ${grades.C}% 이상  D: ${grades.C}% 미만`;
}

/** "S: 5% 이하  A: 10% 이하 ..." (결함 등급은 낮을수록 우수) */
export function formatDefectGradeLine(grades: GradeThresholds): string {
    return `S: ${grades.S}% 이하  A: ${grades.A}% 이하  B: ${grades.B}% 이하  C: ${grades.C}% 이하  D: 그 외`;
}

/** "50% 이상 → +5점  40% 이상 → +4점 ..." (내림차순 정렬) */
export function formatEarlyBonusLine(steps: EarlyBonusStep[]): string {
    return [...steps]
        .sort((a, b) => b.minRate - a.minRate)
        .map((s) => `${s.minRate}% 이상 → +${s.bonus}점`)
        .join('  ') + '  그 외 → 0점';
}

/** 기능 개발 완료율 툴팁 */
export function completionTooltip(rules: KpiRuleSet): string {
    return (
        '📌 지표 설명\n' +
        '계획된 기능(이슈) 중 실제로 완료된 비율입니다. 연기 합의 이슈는 분모·분자에서 제외해 공정하게 평가합니다.\n\n' +
        '📌 산정 기준\n' +
        '(완료된 이슈 / (전체 대상 - 합의된 연기)) × 100\n\n' +
        '📌 예외 조건\n' +
        `'${rules.labels.agreedDelay}' 라벨이 있는 이슈는 전체 대상에서 제외되어 불이익이 없습니다.\n\n` +
        '📌 등급 기준 (S·A·B·C·D)\n' +
        formatKpiGradeLine(rules.grades)
    );
}

/**
 * 일정 준수율 툴팁.
 * @param rules KPI 규칙셋
 * @param noDueDateCount K6 — 기한 미설정으로 "준수 카운트된" 이슈 수 (투명성용)
 */
export function complianceTooltip(rules: KpiRuleSet, noDueDateCount = 0): string {
    const noDueDateHint =
        noDueDateCount > 0
            ? `\n\n📌 기한 미설정 처리\n기한 또는 완료일이 없는 이슈 ${noDueDateCount}건은 "어긴 것도 아니다"는 규칙으로 준수에 카운트됩니다. (측정 불가가 아니라 준수로 집계)`
            : '';
    return (
        '📌 지표 설명\n' +
        '완료 예정일(Due Date) 안에 완료된 기능의 비율입니다. 기한 내 완료·검증 지연 인정 이슈를 합산해 일정 준수 성과를 측정합니다.\n\n' +
        '📌 산정 기준\n' +
        '(기한 내 완료 + 검증 지연) / 전체 이슈 × 100\n\n' +
        '📌 검증 지연(Verify Delay)이란?\n' +
        '개발은 기한 내 완료되었으나, 검증(QA) 과정에서 일정이 지연된 경우입니다.\n\n' +
        '📌 판단 기준\n' +
        `완료일이 늦더라도 '${rules.labels.verificationDelay}' 라벨이 있으면 준수로 인정합니다.\n\n` +
        '📌 등급 기준 (S·A·B·C·D)\n' +
        formatKpiGradeLine(rules.grades) +
        noDueDateHint
    );
}

/** 조기 종료 가점 툴팁 */
export function earlyBonusTooltip(rules: KpiRuleSet): string {
    return (
        '📌 지표 설명\n' +
        '완료 예정일보다 일찍 완료한 비율(조기 완료율)에 따라 가산점을 부여합니다. 종합 등급은 완료율·준수율 가중 평균에 이 가점을 더해 산출합니다.\n\n' +
        '📌 가중치\n' +
        `완료율 ${Math.round(rules.weights.completion * 100)}% · 준수율 ${Math.round(rules.weights.compliance * 100)}%\n\n` +
        '📌 가점 기준 (조기 완료율)\n' +
        formatEarlyBonusLine(rules.earlyBonus) +
        '\n\n' +
        '📌 종합 등급 (S·A·B·C·D)\n' +
        `S: ${rules.grades.S}점 이상  A: ${rules.grades.A}점 이상  B: ${rules.grades.B}점 이상  C: ${rules.grades.C}점 이상  D: ${rules.grades.C}점 미만 (가중 평균 + 조기 가점)`
    );
}

/** 팀 결함 밀도 툴팁 */
export function defectDensityTooltip(rules: KpiRuleSet): string {
    return (
        '📌 지표 설명\n' +
        '매핑된 개발·결함 에픽 기준으로, 팀 전체 담당 개발 이슈 대비 등록 결함 비율입니다.\n\n' +
        '📌 산정 기준\n' +
        '(팀 합계 결함 건수 ÷ 팀 합계 담당 개발 이슈) × 100\n\n' +
        '📌 등급 기준 (S·A·B·C·D)\n' +
        formatDefectGradeLine(rules.defectGrades)
    );
}
