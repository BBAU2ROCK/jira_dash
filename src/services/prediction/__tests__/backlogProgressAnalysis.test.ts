import { describe, it, expect } from 'vitest';
import { analyzeBacklogProgress } from '../backlogProgressAnalysis';
import type { JiraIssue } from '@/api/jiraClient';

let nextKey = 1;
function makeIssue(opts: {
    key?: string;
    statusCategory?: 'done' | 'indeterminate' | 'new';
    statusName?: string;
    created: string;
    completed?: string;
    duedate?: string;
} = { created: '2026-04-01' }): JiraIssue {
    const key = opts.key ?? `BP-${nextKey++}`;
    const fields: Record<string, unknown> = {
        summary: key,
        status: {
            name: opts.statusName ?? (opts.statusCategory === 'done' ? 'Done' : 'Open'),
            statusCategory: { key: opts.statusCategory ?? 'new', colorName: 'gray' },
        },
        issuetype: { name: 'Story', iconUrl: '', subtask: false },
        created: opts.created,
    };
    if (opts.completed) fields.resolutiondate = opts.completed;
    if (opts.duedate) fields.duedate = opts.duedate;
    return { id: key, key, fields } as unknown as JiraIssue;
}

describe('analyzeBacklogProgress', () => {
    const now = new Date(2026, 4, 12); // 5월 12일

    it('빈 배열 → initialBacklog 0', () => {
        const r = analyzeBacklogProgress([], now);
        expect(r.initialBacklog).toBe(0);
        expect(r.warnings.some((w) => w.includes('유효한 leaf'))).toBe(true);
    });

    it('정적 모델 감지 — 최근 30일 신규 5% 미만 + 10건 미만', () => {
        // 100건 백로그 + 최근 30일 신규 2건 (2%)
        const issues = [
            ...Array(98).fill(0).map(() => makeIssue({ created: '2026-01-01' })),
            makeIssue({ created: '2026-05-01' }),  // 11일 전
            makeIssue({ created: '2026-05-05' }),  // 7일 전
        ];
        const r = analyzeBacklogProgress(issues, now);
        expect(r.projectMode).toBe('static');
        expect(r.inflowCount30d).toBe(2);
        expect(r.inflowRatio30d).toBeLessThan(0.05);
        expect(r.detectionReason).toContain('정적 백로그 모델');
    });

    it('활발 모델 — 최근 30일 신규 10건 이상', () => {
        // 50건 백로그 + 최근 30일 신규 15건 (30%)
        const issues = [
            ...Array(35).fill(0).map(() => makeIssue({ created: '2026-01-01' })),
            ...Array(15).fill(0).map((_, i) =>
                makeIssue({ created: `2026-04-${String(20 + (i % 10)).padStart(2, '0')}` })
            ),
        ];
        const r = analyzeBacklogProgress(issues, now);
        expect(r.projectMode).toBe('active');
        expect(r.inflowCount30d).toBeGreaterThanOrEqual(10);
        expect(r.detectionReason).toContain('활발 운영 모델');
    });

    it('진척률 산정 — 완료 / 초기 백로그', () => {
        const issues = [
            ...Array(20).fill(0).map(() => makeIssue({
                statusCategory: 'done',
                created: '2026-01-01',
                completed: '2026-04-01',
            })),
            ...Array(80).fill(0).map(() => makeIssue({
                statusCategory: 'indeterminate',
                created: '2026-01-01',
            })),
        ];
        const r = analyzeBacklogProgress(issues, now);
        expect(r.initialBacklog).toBe(100);
        expect(r.currentCompleted).toBe(20);
        expect(r.currentActive).toBe(80);
        expect(r.progressPct).toBe(20);
    });

    it('처리 속도 산정 — 최근 4주 평균', () => {
        // 최근 4주에 8건 완료 (주당 평균 2건)
        const issues = [
            ...Array(8).fill(0).map((_, i) => {
                const day = 14 + i; // 4월 14~21일
                return makeIssue({
                    statusCategory: 'done',
                    created: '2026-01-01',
                    completed: `2026-04-${String(day).padStart(2, '0')}`,
                });
            }),
            // 활성 50건
            ...Array(50).fill(0).map(() => makeIssue({
                statusCategory: 'indeterminate',
                created: '2026-01-01',
            })),
        ];
        const r = analyzeBacklogProgress(issues, now);
        expect(r.completedLast4Weeks).toBe(8);
        expect(r.weeklyVelocity).toBe(2.0);
    });

    it('예측 완료일 — 잔여 ÷ 일평균 처리속도', () => {
        // 처리속도 1건/영업일, 잔여 10건 → 예측 10영업일
        const issues = [
            // 4주에 20건 완료 = 일평균 1건/영업일 (20영업일)
            ...Array(20).fill(0).map((_, i) => {
                const date = new Date(2026, 3, 14 + Math.floor(i / 2)); // 4월 14~23일
                const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                return makeIssue({
                    statusCategory: 'done',
                    created: '2026-01-01',
                    completed: ds,
                });
            }),
            ...Array(10).fill(0).map(() => makeIssue({
                statusCategory: 'indeterminate',
                created: '2026-01-01',
            })),
        ];
        const r = analyzeBacklogProgress(issues, now);
        expect(r.currentActive).toBe(10);
        expect(r.dailyVelocity).toBe(1.0);
        expect(r.estimatedRemainingDays).toBe(10);
        expect(r.estimatedCompletionDate).not.toBeNull();
    });

    it('정시 완료 평가 — 마감 여유 5영업일 이상이면 on-time', () => {
        // 처리속도 1건/영업일, 잔여 5건 → 5영업일 후 완료
        // 마감 = 5영업일 + 10일 후 → 여유 충분
        const issues = [
            ...Array(20).fill(0).map((_, i) => {
                const date = new Date(2026, 3, 14 + Math.floor(i / 2));
                const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                return makeIssue({ statusCategory: 'done', created: '2026-01-01', completed: ds });
            }),
            ...Array(5).fill(0).map(() => makeIssue({
                statusCategory: 'indeterminate',
                created: '2026-01-01',
                duedate: '2026-06-30', // 충분한 여유
            })),
        ];
        const r = analyzeBacklogProgress(issues, now);
        expect(r.onTimeStatus).toBe('on-time');
        expect(r.bufferDays).toBeGreaterThanOrEqual(5);
    });

    it('마감 없음 → onTime no-due', () => {
        const issues = [
            ...Array(10).fill(0).map(() => makeIssue({
                statusCategory: 'indeterminate',
                created: '2026-01-01',
                // duedate 없음
            })),
        ];
        const r = analyzeBacklogProgress(issues, now);
        expect(r.onTimeStatus).toBe('no-due');
        expect(r.warnings.some((w) => w.includes('duedate'))).toBe(true);
    });

    it('취소·반려는 initialBacklog 제외', () => {
        const issues = [
            makeIssue({ created: '2026-01-01', statusName: '취소' }),
            makeIssue({ created: '2026-01-01', statusName: '반려' }),
            makeIssue({ statusCategory: 'indeterminate', created: '2026-01-01' }),
        ];
        const r = analyzeBacklogProgress(issues, now);
        expect(r.initialBacklog).toBe(1); // 취소·반려 제외
    });
});
