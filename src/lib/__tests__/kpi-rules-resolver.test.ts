import { describe, it, expect, afterEach } from 'vitest';
import {
    getActiveRules,
    resolveAgreedDelayLabel,
    resolveVerificationDelayLabel,
    resolveOnHoldStatus,
    resolveCancelledStatus,
    resolveDashboardProjectKey,
    resolveWeekStartsOn,
    resolvePredictionConfig,
    resolveFields,
    resolveWeights,
    resolveGrades,
    resolveEarlyBonus,
} from '../kpi-rules-resolver';
import { useKpiRulesStore } from '../../stores/kpiRulesStore';
import { JIRA_CONFIG } from '../../config/jiraConfig';

describe('kpi-rules-resolver (v1.0.10)', () => {
    afterEach(() => {
        useKpiRulesStore.getState().resetToDefault();
    });

    describe('기본값은 store의 default + JIRA_CONFIG 와 일치', () => {
        it('resolveAgreedDelayLabel', () => {
            expect(resolveAgreedDelayLabel()).toBe(JIRA_CONFIG.LABELS.AGREED_DELAY);
        });
        it('resolveVerificationDelayLabel', () => {
            expect(resolveVerificationDelayLabel()).toBe(JIRA_CONFIG.LABELS.VERIFICATION_DELAY);
        });
        it('resolveOnHoldStatus', () => {
            expect(resolveOnHoldStatus()).toBe(JIRA_CONFIG.STATUS_NAMES.ON_HOLD);
        });
        it('resolveCancelledStatus', () => {
            expect(resolveCancelledStatus()).toBe(JIRA_CONFIG.STATUS_NAMES.CANCELLED);
        });
        it('resolveDashboardProjectKey', () => {
            expect(resolveDashboardProjectKey()).toBe(JIRA_CONFIG.DASHBOARD.PROJECT_KEY);
        });
        it('resolveWeekStartsOn', () => {
            expect(resolveWeekStartsOn()).toBe(JIRA_CONFIG.WEEK_STARTS_ON);
        });
    });

    describe('store 변경 시 즉시 반영', () => {
        it('statusNames.onHold 변경', () => {
            useKpiRulesStore.setState({
                rules: {
                    ...useKpiRulesStore.getState().rules,
                    statusNames: { onHold: '대기중', cancelled: '폐기' },
                },
            });
            expect(resolveOnHoldStatus()).toBe('대기중');
            expect(resolveCancelledStatus()).toBe('폐기');
        });

        it('dashboardProjectKey 변경', () => {
            useKpiRulesStore.setState({
                rules: { ...useKpiRulesStore.getState().rules, dashboardProjectKey: 'TEST' },
            });
            expect(resolveDashboardProjectKey()).toBe('TEST');
        });

        it('weekStartsOn 0 (일요일)', () => {
            useKpiRulesStore.setState({
                rules: { ...useKpiRulesStore.getState().rules, weekStartsOn: 0 },
            });
            expect(resolveWeekStartsOn()).toBe(0);
        });

        it('prediction 값들이 동시에 반영', () => {
            useKpiRulesStore.setState({
                rules: {
                    ...useKpiRulesStore.getState().rules,
                    prediction: {
                        ...useKpiRulesStore.getState().rules.prediction,
                        defaultHistoryDays: 60,
                        monteCarloTrials: 5000,
                        defaultUtilization: 0.8,
                    },
                },
            });
            const C = resolvePredictionConfig();
            expect(C.DEFAULT_HISTORY_DAYS).toBe(60);
            expect(C.MONTE_CARLO_TRIALS).toBe(5000);
            expect(C.DEFAULT_UTILIZATION).toBe(0.8);
            // store에 없는 필드는 JIRA_CONFIG 유지
            expect(C.MONTE_CARLO_MAX_DAYS).toBe(JIRA_CONFIG.PREDICTION.MONTE_CARLO_MAX_DAYS);
            expect(C.SCOPE_CRISIS_RATIO).toBe(JIRA_CONFIG.PREDICTION.SCOPE_CRISIS_RATIO);
        });

        it('labels 변경', () => {
            useKpiRulesStore.setState({
                rules: {
                    ...useKpiRulesStore.getState().rules,
                    labels: { agreedDelay: 'custom-agreed', verificationDelay: 'custom-verify' },
                },
            });
            expect(resolveAgreedDelayLabel()).toBe('custom-agreed');
            expect(resolveVerificationDelayLabel()).toBe('custom-verify');
        });

        it('fields 변경', () => {
            useKpiRulesStore.setState({
                rules: {
                    ...useKpiRulesStore.getState().rules,
                    fields: {
                        storyPoint: 'cf_sp',
                        plannedStart: 'cf_ps',
                        actualStart: 'cf_as',
                        actualDone: 'cf_ad',
                        difficulty: 'cf_df',
                    },
                },
            });
            const F = resolveFields();
            expect(F.STORY_POINT).toBe('cf_sp');
            expect(F.ACTUAL_DONE).toBe('cf_ad');
            expect(F.DIFFICULTY).toBe('cf_df');
        });
    });

    describe('v1.0.9 K1 재사용 헬퍼들', () => {
        it('resolveWeights default', () => {
            const w = resolveWeights();
            expect(w.completion).toBeCloseTo(0.5);
            expect(w.compliance).toBeCloseTo(0.5);
        });

        it('resolveGrades default', () => {
            const g = resolveGrades();
            expect(g.S).toBe(95);
            expect(g.A).toBe(90);
            expect(g.B).toBe(80);
            expect(g.C).toBe(70);
        });

        it('resolveEarlyBonus default — 5단계', () => {
            const b = resolveEarlyBonus();
            expect(b).toHaveLength(5);
            expect(b[0]).toEqual({ minRate: 50, bonus: 5 });
        });
    });

    describe('getActiveRules', () => {
        it('정상 store → rules 반환', () => {
            const r = getActiveRules();
            expect(r).not.toBeNull();
            expect(r?.version).toBe('2026');
        });
    });
});
