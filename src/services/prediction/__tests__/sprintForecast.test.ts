import { describe, it, expect } from 'vitest';
import { classifySprintRisk } from '../sprintForecast';
import type { JiraSprint } from '@/api/jiraClient';
import type { ForecastResult } from '../types';

function makeSprint(endDate: string | null): JiraSprint {
    return { id: 1, name: 'Sprint 1', state: 'active', endDate: endDate ?? undefined };
}

function makeForecast(p50: number, p85: number): ForecastResult {
    return {
        p50Days: p50, p85Days: p85, p95Days: p85 + 10,
        p50Date: new Date(), p85Date: new Date(), p95Date: new Date(),
        confidence: 'medium', warnings: [],
        stats: { activeDays: 20, totalDays: 30, mean: 2, stddev: 0.5, cv: 0.25, scopeRatio: 0.8 },
        remainingCount: 20,
    };
}

describe('classifySprintRisk', () => {
    const now = new Date(2026, 3, 15); // 2026-04-15 수

    it('P85가 종료일 안이면 on-track', () => {
        // 2026-04-29 수 — 2주(영업일 ~10일) 후
        const r = classifySprintRisk(makeSprint('2026-04-29'), makeForecast(3, 6), now);
        expect(r.status).toBe('on-track');
        expect(r.sprintRemainingDays).toBeGreaterThan(0);
    });

    it('P50은 안전, P85는 위험 → at-risk', () => {
        // 5 영업일 잔여 (4/22 수까지)
        const r = classifySprintRisk(makeSprint('2026-04-22'), makeForecast(3, 10), now);
        expect(r.status).toBe('at-risk');
    });

    it('P50도 종료일 이후 → overrun', () => {
        const r = classifySprintRisk(makeSprint('2026-04-22'), makeForecast(15, 25), now);
        expect(r.status).toBe('overrun');
        expect(r.message).toContain('범위 축소');
    });

    it('endDate 없음 → no-data', () => {
        const r = classifySprintRisk(makeSprint(null), makeForecast(3, 6), now);
        expect(r.status).toBe('no-data');
    });
});
