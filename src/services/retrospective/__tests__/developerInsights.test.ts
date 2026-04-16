import { describe, it, expect } from 'vitest';
import {
    analyzeDeveloperProfile,
    computeTeamBaseline,
    profileMeta,
} from '../developerInsights';
import type { DefectKpiDeveloperRow } from '@/lib/defect-kpi-utils';
import type { DeveloperStrengthRow } from '../types';

function makeDefectRow(overrides: Partial<DefectKpiDeveloperRow> = {}): DefectKpiDeveloperRow {
    return {
        key: 'u1',
        displayName: '홍길동',
        devIssueCount: 20,
        defectCount: 2,
        defectRatePercent: 10,
        severityBreakdown: [],
        grade: 'A',
        ...overrides,
    };
}

function makeStrengthRow(byType: Record<string, { count: number; avgCycleTimeDays: number }>): DeveloperStrengthRow {
    const map = new Map<string, { count: number; avgCycleTimeDays: number }>();
    for (const [k, v] of Object.entries(byType)) {
        map.set(k, v);
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v.count, 0);
    return {
        key: 'u1',
        displayName: '홍길동',
        assignedTasks: total,
        completedTasks: total,
        byType: map,
    };
}

describe('computeTeamBaseline', () => {
    it('결함 rates가 없으면 중앙값 0', () => {
        const b = computeTeamBaseline([], []);
        expect(b.medianDefectRate).toBe(0);
        expect(b.sampleSize).toBe(0);
    });

    it('홀수 개수면 정확히 가운데 값', () => {
        const rows = [
            makeDefectRow({ defectRatePercent: 5 }),
            makeDefectRow({ defectRatePercent: 10 }),
            makeDefectRow({ defectRatePercent: 20 }),
        ];
        const b = computeTeamBaseline(rows, []);
        expect(b.medianDefectRate).toBe(10);
    });

    it('짝수 개수면 중간 두 값의 평균', () => {
        const rows = [
            makeDefectRow({ defectRatePercent: 5 }),
            makeDefectRow({ defectRatePercent: 10 }),
            makeDefectRow({ defectRatePercent: 20 }),
            makeDefectRow({ defectRatePercent: 30 }),
        ];
        const b = computeTeamBaseline(rows, []);
        expect(b.medianDefectRate).toBe(15);
    });

    it('null rate는 제외', () => {
        const rows = [
            makeDefectRow({ defectRatePercent: 10 }),
            makeDefectRow({ defectRatePercent: null }),
            makeDefectRow({ defectRatePercent: 20 }),
        ];
        const b = computeTeamBaseline(rows, []);
        expect(b.medianDefectRate).toBe(15); // 10과 20 평균
    });
});

describe('analyzeDeveloperProfile', () => {
    const baseline = { medianDefectRate: 10, medianCycleTime: 5, sampleSize: 5 };

    it('mentor: 강점 2+ 개선점 0', () => {
        const defect = makeDefectRow({
            defectRatePercent: 3, // 중앙값의 30% → 강점 S1
            defectCount: 3,
            severityBreakdown: [{ name: 'Minor', count: 3 }], // Critical 0 → 강점 S2
        });
        const strength = makeStrengthRow({
            버그: { count: 5, avgCycleTimeDays: 2 }, // 중앙값 5의 40% → 강점 S3
        });
        const r = analyzeDeveloperProfile(defect, strength, baseline, [3, 10, 15]);
        expect(r.strengths.length).toBeGreaterThanOrEqual(2);
        expect(r.improvements.length).toBe(0);
        expect(r.profile).toBe('mentor');
    });

    it('needs-support: 개선점 2+', () => {
        const defect = makeDefectRow({
            defectRatePercent: 25, // 중앙값 10의 2.5배 → 개선 I1
            defectCount: 5,
            severityBreakdown: [
                { name: 'Critical', count: 2 }, // 개선 I2
                { name: 'Major', count: 2 },
            ],
        });
        const strength = makeStrengthRow({
            버그: { count: 5, avgCycleTimeDays: 10 }, // 중앙값 5의 2배 → 개선 I3
        });
        const r = analyzeDeveloperProfile(defect, strength, baseline, [5, 10, 25]);
        expect(r.improvements.length).toBeGreaterThanOrEqual(2);
        expect(r.profile).toBe('needs-support');
    });

    it('new-joiner: task 5건 미만', () => {
        const defect = makeDefectRow({ devIssueCount: 3, defectRatePercent: 0 });
        const r = analyzeDeveloperProfile(defect, undefined, baseline, [0, 10]);
        expect(r.profile).toBe('new-joiner');
    });

    it('specialized: 강점 1 + 개선 0 + 주력 타입 있음', () => {
        const defect = makeDefectRow({
            defectRatePercent: 3, // 강점 S1만 (2건이라 S2 조건 불충족)
            defectCount: 1,
            severityBreakdown: [{ name: 'Minor', count: 1 }],
        });
        const strength = makeStrengthRow({
            개선: { count: 10, avgCycleTimeDays: 6 }, // 속도는 평균적 — S3 불충족
        });
        const r = analyzeDeveloperProfile(defect, strength, baseline, [3, 10, 15]);
        expect(r.strengths.length).toBe(1);
        expect(r.improvements.length).toBe(0);
        expect(r.primaryIssueType).toBe('개선');
        expect(r.profile).toBe('specialized');
    });

    it('balanced: 강점 1 + 개선 1', () => {
        const defect = makeDefectRow({
            defectRatePercent: 3, // 강점 S1
            defectCount: 2,
            severityBreakdown: [{ name: 'Critical', count: 2 }], // 개선 I2
        });
        const r = analyzeDeveloperProfile(defect, undefined, baseline, [3, 10, 15]);
        expect(r.strengths.length).toBeGreaterThanOrEqual(1);
        expect(r.improvements.length).toBeGreaterThanOrEqual(1);
        expect(r.profile).toBe('balanced');
    });

    it('severityWeightedScore: Critical=5, Medium=2, Minor=1', () => {
        const defect = makeDefectRow({
            severityBreakdown: [
                { name: 'Critical', count: 1 },
                { name: 'Medium', count: 2 },
                { name: 'Minor', count: 3 },
            ],
        });
        const r = analyzeDeveloperProfile(defect, undefined, baseline, []);
        expect(r.severityWeightedScore).toBe(5 + 2 * 2 + 1 * 3); // 12
    });

    it('defectRatePercentile: 표본 3 미만이면 null', () => {
        const defect = makeDefectRow({ defectRatePercent: 10 });
        const smallBaseline = { ...baseline, sampleSize: 2 };
        const r = analyzeDeveloperProfile(defect, undefined, smallBaseline, [5, 10]);
        expect(r.defectRatePercentile).toBeNull();
    });
});

describe('profileMeta', () => {
    it('5개 페르소나 모두 유효한 메타 반환', () => {
        const profiles = ['mentor', 'balanced', 'specialized', 'needs-support', 'new-joiner'] as const;
        for (const p of profiles) {
            const meta = profileMeta(p);
            expect(meta.label).toBeTruthy();
            expect(meta.description).toBeTruthy();
            expect(['purple', 'blue', 'green', 'amber', 'slate']).toContain(meta.color);
        }
    });
});
