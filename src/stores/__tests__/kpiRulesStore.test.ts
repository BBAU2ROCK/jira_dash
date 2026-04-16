import { describe, it, expect, beforeEach } from 'vitest';
import {
    useKpiRulesStore,
    validateRuleSet,
    getGradeFromRules,
    getEarlyBonusFromRules,
    getDefectGradeFromRules,
    type KpiRuleSet,
} from '../kpiRulesStore';

function baseRules(overrides: Partial<KpiRuleSet> = {}): KpiRuleSet {
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
            storyPoint: 'customfield_10016',
            plannedStart: 'customfield_11400',
            actualStart: 'customfield_11499',
            actualDone: 'customfield_11485',
            difficulty: 'customfield_11304',
        },
        dashboardProjectKey: 'IGMU',
        projectKeys: ['IGMU', 'FO'],
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

describe('getGradeFromRules', () => {
    const g = { S: 95, A: 90, B: 80, C: 70 };
    it('경계값 포함 S', () => expect(getGradeFromRules(95, g)).toBe('S'));
    it('A', () => expect(getGradeFromRules(92, g)).toBe('A'));
    it('D (C 미만)', () => expect(getGradeFromRules(69, g)).toBe('D'));
});

describe('getDefectGradeFromRules', () => {
    const g = { S: 5, A: 10, B: 15, C: 20 };
    it('0% S', () => expect(getDefectGradeFromRules(0, g)).toBe('S'));
    it('경계값 5% S', () => expect(getDefectGradeFromRules(5, g)).toBe('S'));
    it('21% D', () => expect(getDefectGradeFromRules(21, g)).toBe('D'));
});

describe('getEarlyBonusFromRules', () => {
    const steps = [
        { minRate: 50, bonus: 5 },
        { minRate: 30, bonus: 3 },
        { minRate: 10, bonus: 1 },
    ];
    it('50% → 5점', () => expect(getEarlyBonusFromRules(50, steps)).toBe(5));
    it('29% → 1점', () => expect(getEarlyBonusFromRules(29, steps)).toBe(1));
    it('9% → 0점', () => expect(getEarlyBonusFromRules(9, steps)).toBe(0));
    it('배열 순서 뒤바뀌어도 정상 (내부 재정렬)', () => {
        const unsorted = [
            { minRate: 10, bonus: 1 },
            { minRate: 50, bonus: 5 },
            { minRate: 30, bonus: 3 },
        ];
        expect(getEarlyBonusFromRules(55, unsorted)).toBe(5);
    });
});

describe('validateRuleSet (K7 확장 검증)', () => {
    it('기본값 통과', () => {
        expect(validateRuleSet(baseRules())).toEqual([]);
    });

    it('KPI 등급 역순', () => {
        const r = baseRules({ grades: { S: 70, A: 80, B: 90, C: 95 } });
        const errs = validateRuleSet(r);
        expect(errs.some((e) => e.includes('S > A > B > C'))).toBe(true);
    });

    it('결함 등급 범위 초과', () => {
        const r = baseRules({ defectGrades: { S: 5, A: 10, B: 15, C: 150 } });
        const errs = validateRuleSet(r);
        expect(errs.some((e) => e.includes('0~100'))).toBe(true);
    });

    it('가중치 합 != 100%', () => {
        const r = baseRules({ weights: { completion: 0.6, compliance: 0.3 } });
        const errs = validateRuleSet(r);
        expect(errs.some((e) => e.includes('가중치 합'))).toBe(true);
    });

    it('가중치 음수', () => {
        const r = baseRules({ weights: { completion: 1.5, compliance: -0.5 } });
        const errs = validateRuleSet(r);
        expect(errs.some((e) => e.includes('0 이상'))).toBe(true);
    });

    it('earlyBonus 빈 배열', () => {
        const r = baseRules({ earlyBonus: [] });
        const errs = validateRuleSet(r);
        expect(errs.some((e) => e.includes('비어있'))).toBe(true);
    });

    it('earlyBonus minRate 중복', () => {
        const r = baseRules({
            earlyBonus: [
                { minRate: 50, bonus: 5 },
                { minRate: 50, bonus: 4 },
                { minRate: 30, bonus: 3 },
            ],
        });
        const errs = validateRuleSet(r);
        expect(errs.some((e) => e.includes('중복'))).toBe(true);
    });

    it('earlyBonus bonus 음수', () => {
        const r = baseRules({
            earlyBonus: [{ minRate: 50, bonus: -1 }],
        });
        const errs = validateRuleSet(r);
        expect(errs.some((e) => e.includes('0 이상'))).toBe(true);
    });

    it('Monte Carlo trials 범위 미만', () => {
        const r = baseRules({
            prediction: { ...baseRules().prediction, monteCarloTrials: 50 },
        });
        const errs = validateRuleSet(r);
        expect(errs.some((e) => e.includes('Monte Carlo'))).toBe(true);
    });

    it('history 일수 범위 초과', () => {
        const r = baseRules({
            prediction: { ...baseRules().prediction, defaultHistoryDays: 400 },
        });
        const errs = validateRuleSet(r);
        expect(errs.some((e) => e.includes('history'))).toBe(true);
    });

    it('utilization 0 초과 필수', () => {
        const r = baseRules({
            prediction: { ...baseRules().prediction, defaultUtilization: 0 },
        });
        const errs = validateRuleSet(r);
        expect(errs.some((e) => e.includes('가동률'))).toBe(true);
    });

    it('dashboardProjectKey 비어있음', () => {
        const r = baseRules({ dashboardProjectKey: '   ' });
        const errs = validateRuleSet(r);
        expect(errs.some((e) => e.includes('프로젝트 키'))).toBe(true);
    });
});

describe('importFromJson (K7 검증 반영)', () => {
    beforeEach(() => {
        useKpiRulesStore.getState().resetToDefault();
    });

    it('유효한 규칙 import → 빈 배열 + 반영', () => {
        const r = baseRules({ version: 'imported-2027', label: 'Imported' });
        const errs = useKpiRulesStore.getState().importFromJson(r);
        expect(errs).toEqual([]);
        expect(useKpiRulesStore.getState().rules.version).toBe('imported-2027');
    });

    it('잘못된 규칙 import → 에러 배열 + 미반영', () => {
        const before = useKpiRulesStore.getState().rules;
        const bad = baseRules({ weights: { completion: 0.6, compliance: 0.3 } });
        const errs = useKpiRulesStore.getState().importFromJson(bad);
        expect(errs.length).toBeGreaterThan(0);
        // 기존 rules 유지
        expect(useKpiRulesStore.getState().rules.version).toBe(before.version);
    });
});
