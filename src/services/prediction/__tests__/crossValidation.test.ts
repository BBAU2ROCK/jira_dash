import { describe, it, expect } from 'vitest';
import { crossValidate } from '../crossValidation';
import type { TeamForecast, BacklogEffortReport, ForecastResult } from '../types';

function makeForecast(p85: number, confidence: ForecastResult['confidence'] = 'medium'): ForecastResult {
    return {
        p50Days: p85 * 0.7,
        p85Days: p85,
        p95Days: p85 * 1.3,
        p50Date: new Date(),
        p85Date: new Date(),
        p95Date: new Date(),
        confidence,
        warnings: [],
        stats: {
            activeDays: 30, totalDays: 30, mean: 2, stddev: 0.4, cv: 0.2, scopeRatio: 0.8,
        },
        remainingCount: 20,
    };
}

function makeTeam(p85: number, confidence: ForecastResult['confidence'] = 'medium'): TeamForecast {
    const fc = makeForecast(p85, confidence);
    return {
        optimistic: fc, realistic: fc, bottleneck: null, perAssignee: [],
        unassignedCount: 0, onHoldCount: 0, scopeRatio: 0.8, scopeStatus: 'stable',
    };
}

function makeEffort(teamDays: number): BacklogEffortReport {
    return {
        totalHoursMid: teamDays * 8 * 5 * 0.65, // backwards
        totalHoursLow: 0, totalHoursHigh: 0, totalManDaysMid: 0,
        sourceMix: [], perIssue: [],
        teamCapacityAssumption: { headcount: 5, utilization: 0.65, teamDaysMid: teamDays },
        cycleTimeFallbackOnly: false,
    };
}

describe('crossValidate', () => {
    it('두 ETA가 일치 (격차 < 30%) → aligned', () => {
        const team = makeTeam(10);
        const effort = makeEffort(11); // 10% 격차
        const r = crossValidate(team, effort);
        expect(r.available).toBe(true);
        expect(r.interpretation).toBe('aligned');
        expect(r.warning).toBeUndefined();
    });

    it('공수 ETA << 처리량 ETA → process-inefficiency 경고', () => {
        const team = makeTeam(30);
        const effort = makeEffort(10); // 67% 격차, 공수가 짧음
        const r = crossValidate(team, effort);
        expect(r.interpretation).toBe('process-inefficiency');
        expect(r.warning).toContain('블로커');
    });

    it('공수 ETA > 처리량 ETA → effort-undercount 경고', () => {
        const team = makeTeam(10);
        const effort = makeEffort(30); // 67% 격차, 공수가 김
        const r = crossValidate(team, effort);
        expect(r.interpretation).toBe('effort-undercount');
        expect(r.warning).toContain('Worklog');
    });

    it('ETA unreliable → available false', () => {
        const team = makeTeam(0, 'unreliable');
        const effort = makeEffort(10);
        const r = crossValidate(team, effort);
        expect(r.available).toBe(false);
        expect(r.reason).toBe('eta-unreliable');
    });
});
