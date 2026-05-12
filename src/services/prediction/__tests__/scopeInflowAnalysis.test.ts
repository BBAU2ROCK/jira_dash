import { describe, it, expect } from 'vitest';
import { analyzeInflow } from '../scopeInflowAnalysis';
import type { JiraIssue } from '@/api/jiraClient';

let nextKey = 1;
function makeIssue(opts: {
    key?: string;
    statusCategory?: 'done' | 'indeterminate' | 'new';
    statusName?: string;
    type?: string;
    reporterName?: string;
    created: string; // 'YYYY-MM-DD'
    actualDone?: string;
} = { created: '2026-04-15' }): JiraIssue {
    const key = opts.key ?? `S-${nextKey++}`;
    const fields: Record<string, unknown> = {
        summary: key,
        status: {
            name: opts.statusName ?? (opts.statusCategory === 'done' ? 'Done' : 'Open'),
            statusCategory: { key: opts.statusCategory ?? 'new', colorName: 'gray' },
        },
        issuetype: { name: opts.type ?? 'Story', iconUrl: '', subtask: false },
        reporter: opts.reporterName
            ? { displayName: opts.reporterName, accountId: opts.reporterName, avatarUrls: { '48x48': '' } }
            : undefined,
        created: opts.created,
    };
    if (opts.actualDone) fields.customfield_11485 = opts.actualDone;
    return { id: key, key, fields } as unknown as JiraIssue;
}

describe('analyzeInflow', () => {
    const now = new Date(2026, 3, 30); // 4월 30일

    it('빈 배열 → totalNew 0', () => {
        const r = analyzeInflow([], 30, now);
        expect(r.totalNew).toBe(0);
        expect(r.totalCompleted).toBe(0);
        expect(r.scopeRatio).toBe(0);
    });

    it('정상 분산 — 마이그레이션 의심 X', () => {
        // 30일 동안 매일 1건씩 신규 (정상 분산)
        const issues = Array(30).fill(0).map((_, i) => {
            const d = new Date(2026, 3, i + 1); // 4월 1일 ~ 30일
            const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return makeIssue({ created: ds, reporterName: `R-${i % 5}` });
        });
        const r = analyzeInflow(issues, 30, now);
        expect(r.totalNew).toBe(30);
        expect(r.migrationSignals.spikeDays).toEqual([]);
        expect(r.migrationSignals.dominantReporter).toBeNull();
        expect(r.migrationSignals.suspicionScore).toBeLessThan(0.2);
    });

    it('일별 폭증 감지 — spike day 식별', () => {
        // 29일 동안 매일 1건, 1일에 50건 폭증
        const issues = [
            ...Array(29).fill(0).map((_, i) => {
                const d = new Date(2026, 3, i + 2);
                const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return makeIssue({ created: ds, reporterName: `R-${i % 5}` });
            }),
            ...Array(50).fill(0).map(() => makeIssue({ created: '2026-04-15', reporterName: 'BulkBot' })),
        ];
        const r = analyzeInflow(issues, 30, now);
        // 29일 매일 1건 + 4월 15일 추가 50건 = 79건 (그중 4월 15일은 51건)
        expect(r.totalNew).toBe(79);
        expect(r.migrationSignals.spikeDays.length).toBeGreaterThan(0);
        expect(r.migrationSignals.spikeDays[0].date).toBe('2026-04-15');
        expect(r.migrationSignals.spikeDays[0].count).toBe(51);
        expect(r.migrationSignals.suspicionScore).toBeGreaterThan(0);
        // 정상 신규 추정 = 79 - 51 = 28
        expect(r.estimatedRealNew).toBe(28);
    });

    it('단일 작성자 다수 — dominantReporter 식별', () => {
        // 작성자 A 80%, 나머지 20%
        const issues = [
            ...Array(16).fill(0).map(() => makeIssue({ created: '2026-04-15', reporterName: 'A' })),
            ...Array(4).fill(0).map(() => makeIssue({ created: '2026-04-15', reporterName: 'B' })),
        ];
        const r = analyzeInflow(issues, 30, now);
        expect(r.migrationSignals.dominantReporter?.displayName).toBe('A');
        expect(r.migrationSignals.dominantReporter?.percentage).toBe(80);
        expect(r.migrationSignals.suspicionScore).toBeGreaterThan(0.2);
    });

    it('이슈 타입별 분포 산정', () => {
        const issues = [
            ...Array(10).fill(0).map(() => makeIssue({ created: '2026-04-15', type: 'Story' })),
            ...Array(5).fill(0).map(() => makeIssue({ created: '2026-04-15', type: 'Bug' })),
            ...Array(3).fill(0).map(() => makeIssue({ created: '2026-04-15', type: 'Task' })),
        ];
        const r = analyzeInflow(issues, 30, now);
        expect(r.byIssueType[0].typeName).toBe('Story');
        expect(r.byIssueType[0].count).toBe(10);
        expect(r.byIssueType[0].percentage).toBeCloseTo(55.6, 1);
    });

    it('Scope ratio 산정 (신규/완료)', () => {
        const issues = [
            // 신규 6건
            ...Array(6).fill(0).map((_, i) => makeIssue({
                key: `N-${i}`,
                created: `2026-04-${String(10 + i).padStart(2, '0')}`,
            })),
            // 완료 1건 (이전부터 있던 이슈, customfield_11485로 완료 처리)
            makeIssue({
                key: 'D-1',
                created: '2026-03-01',
                statusCategory: 'indeterminate',
                actualDone: '2026-04-20',
            }),
        ];
        const r = analyzeInflow(issues, 30, now);
        expect(r.totalNew).toBe(6);
        expect(r.totalCompleted).toBe(1);
        expect(r.scopeRatio).toBe(6);
    });

    it('윈도우 밖 created → 신규 카운트 X', () => {
        const issues = [
            makeIssue({ created: '2026-01-01' }), // 90일 전
            makeIssue({ created: '2026-04-15' }), // 윈도우 안
        ];
        const r = analyzeInflow(issues, 30, now);
        expect(r.totalNew).toBe(1);
    });

    // v1.0.42: 프로젝트 단계 자동 감지
    describe('projectStage (v1.0.42)', () => {
        it('초기 구축 단계 — 백로그 70%+ 윈도우 내 + 프로젝트 < 60일', () => {
            // 신규 50건 모두 윈도우 안 (최근 30일) + 프로젝트 시작 30일 전
            const issues = Array(50).fill(0).map((_, i) => {
                const d = new Date(2026, 3, (i % 30) + 1);
                const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return makeIssue({ created: ds });
            });
            const r = analyzeInflow(issues, 30, now);
            expect(r.projectStage).toBe('early');
            expect(r.inWindowRatio).toBeGreaterThanOrEqual(0.7);
            expect(r.projectAgeDays).toBeLessThanOrEqual(60);
            expect(r.projectStageRationale).toContain('초기 구축 단계');
        });

        it('정상 운영 — 백로그 대부분이 윈도우 밖 (오래된 프로젝트)', () => {
            // 백로그 대부분 90일 전 + 최근 30일 일부 신규
            const issues = [
                ...Array(20).fill(0).map(() => makeIssue({ created: '2026-01-15' })), // 90일 전
                ...Array(5).fill(0).map(() => makeIssue({ created: '2026-04-15' })),  // 윈도우 안
            ];
            const r = analyzeInflow(issues, 30, now);
            expect(r.projectStage).toBe('active');
            expect(r.inWindowRatio).toBe(0.2);
            expect(r.projectStageRationale).toContain('정상 운영 단계');
        });

        it('프로젝트 60일 초과 → early 아님 (오래된 프로젝트는 active)', () => {
            // 모든 이슈가 윈도우 안이지만 첫 이슈가 70일 전 → 일부 90일 전
            const issues = [
                makeIssue({ created: '2026-02-09' }), // 80일 전
                ...Array(20).fill(0).map(() => makeIssue({ created: '2026-04-15' })),
            ];
            const r = analyzeInflow(issues, 30, now);
            // 80일 전 이슈 있으니 active
            expect(r.projectAgeDays).toBeGreaterThan(60);
            expect(r.projectStage).toBe('active');
        });

        it('빈 leaf → active (default)', () => {
            const r = analyzeInflow([], 30, now);
            expect(r.projectStage).toBe('active');
        });
    });
});
