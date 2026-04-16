import { describe, it, expect } from 'vitest';
import {
    formatKpiGradeLine,
    formatDefectGradeLine,
    formatEarlyBonusLine,
    completionTooltip,
    complianceTooltip,
    earlyBonusTooltip,
    defectDensityTooltip,
} from '../kpi-tooltip';
import type { KpiRuleSet } from '../../stores/kpiRulesStore';

function makeRules(overrides: Partial<KpiRuleSet> = {}): KpiRuleSet {
    return {
        version: '2026',
        label: 'Test',
        updatedAt: new Date().toISOString(),
        grades: { S: 95, A: 90, B: 80, C: 70 },
        defectGrades: { S: 5, A: 10, B: 15, C: 20 },
        weights: { completion: 0.5, compliance: 0.5 },
        earlyBonus: [
            { minRate: 50, bonus: 5 },
            { minRate: 40, bonus: 4 },
            { minRate: 30, bonus: 3 },
            { minRate: 20, bonus: 2 },
            { minRate: 10, bonus: 1 },
        ],
        labels: { agreedDelay: 'agreed-delay', verificationDelay: 'verification-delay' },
        statusNames: { onHold: '보류', cancelled: '취소' },
        fields: {
            storyPoint: 'sp',
            plannedStart: 'ps',
            actualStart: 'as',
            actualDone: 'ad',
            difficulty: 'df',
        },
        dashboardProjectKey: 'IGMU',
        projectKeys: ['IGMU'],
        weekStartsOn: 1,
        prediction: {
            defaultHistoryDays: 30,
            monteCarloTrials: 10000,
            defaultUtilization: 0.6,
            etaEffortGapThreshold: 0.5,
            spCoverageThreshold: 0.6,
            worklogCoverageThreshold: 0.6,
        },
        ...overrides,
    };
}

describe('kpi-tooltip (K4)', () => {
    it('formatKpiGradeLine — 기본값', () => {
        const line = formatKpiGradeLine({ S: 95, A: 90, B: 80, C: 70 });
        expect(line).toContain('S: 95%');
        expect(line).toContain('A: 90%');
        expect(line).toContain('C: 70%');
    });

    it('formatKpiGradeLine — 변경된 기준 반영', () => {
        const line = formatKpiGradeLine({ S: 80, A: 70, B: 60, C: 50 });
        expect(line).toContain('S: 80%');
        expect(line).toContain('D: 50% 미만');
    });

    it('formatDefectGradeLine — 낮을수록 우수', () => {
        const line = formatDefectGradeLine({ S: 5, A: 10, B: 15, C: 20 });
        expect(line).toContain('S: 5% 이하');
        expect(line).toContain('D: 그 외');
    });

    it('formatEarlyBonusLine — 내림차순 정렬', () => {
        const line = formatEarlyBonusLine([
            { minRate: 10, bonus: 1 },
            { minRate: 50, bonus: 5 },
            { minRate: 30, bonus: 3 },
        ]);
        const idx50 = line.indexOf('50%');
        const idx30 = line.indexOf('30%');
        const idx10 = line.indexOf('10%');
        expect(idx50).toBeLessThan(idx30);
        expect(idx30).toBeLessThan(idx10);
    });

    it('completionTooltip — agreedDelay 라벨 변경 반영', () => {
        const rules = makeRules({ labels: { agreedDelay: 'custom-agreed', verificationDelay: 'verification-delay' } });
        const txt = completionTooltip(rules);
        expect(txt).toContain("'custom-agreed'");
        expect(txt).not.toContain("'agreed-delay'");
    });

    it('complianceTooltip — verificationDelay 라벨 변경 반영', () => {
        const rules = makeRules({ labels: { agreedDelay: 'agreed-delay', verificationDelay: 'custom-verify' } });
        const txt = complianceTooltip(rules);
        expect(txt).toContain("'custom-verify'");
    });

    it('earlyBonusTooltip — 가중치 표시', () => {
        const rules = makeRules({ weights: { completion: 0.7, compliance: 0.3 } });
        const txt = earlyBonusTooltip(rules);
        expect(txt).toContain('완료율 70%');
        expect(txt).toContain('준수율 30%');
    });

    it('defectDensityTooltip — 결함 등급 동적 반영', () => {
        const rules = makeRules({ defectGrades: { S: 3, A: 7, B: 12, C: 18 } });
        const txt = defectDensityTooltip(rules);
        expect(txt).toContain('S: 3% 이하');
        expect(txt).toContain('A: 7% 이하');
    });
});
