import { describe, it, expect } from 'vitest';
import { extractLeadTimes, computeLeadTimeForecast } from '../leadTimeForecast';
import type { JiraIssue } from '@/api/jiraClient';

let nextKey = 1;
function makeIssue(opts: {
    key?: string;
    statusCategory?: 'done' | 'indeterminate' | 'new';
    statusName?: string;
    assigneeId?: string;
    assigneeName?: string;
    created: string;
    completed?: string;
    actualDone?: string;
} = { created: '2026-04-01' }): JiraIssue {
    const key = opts.key ?? `LT-${nextKey++}`;
    const fields: Record<string, unknown> = {
        summary: key,
        status: {
            name: opts.statusName ?? (opts.statusCategory === 'done' ? 'Done' : 'Open'),
            statusCategory: { key: opts.statusCategory ?? 'new', colorName: 'gray' },
        },
        issuetype: { name: 'Story', iconUrl: '', subtask: false },
        created: opts.created,
        assignee: opts.assigneeId
            ? { accountId: opts.assigneeId, displayName: opts.assigneeName ?? opts.assigneeId, avatarUrls: { '48x48': '' } }
            : undefined,
    };
    if (opts.completed) fields.resolutiondate = opts.completed;
    if (opts.actualDone) fields.customfield_11485 = opts.actualDone;
    return { id: key, key, fields } as unknown as JiraIssue;
}

describe('extractLeadTimes', () => {
    it('완료 이슈만 lead time 추출', () => {
        const issues = [
            makeIssue({ statusCategory: 'done', created: '2026-04-01', completed: '2026-04-08' }), // 5 영업일
            makeIssue({ statusCategory: 'indeterminate', created: '2026-04-01' }), // 미완료 → 제외
        ];
        const leads = extractLeadTimes(issues);
        expect(leads).toHaveLength(1);
        expect(leads[0].leadTimeBusinessDays).toBe(5); // 4/1 화 → 4/8 수: 영업일 5일
    });

    it('취소·반려 제외', () => {
        const issues = [
            makeIssue({ statusCategory: 'done', statusName: '취소', created: '2026-04-01', completed: '2026-04-08' }),
            makeIssue({ statusCategory: 'done', statusName: '반려', created: '2026-04-01', completed: '2026-04-08' }),
            makeIssue({ statusCategory: 'done', created: '2026-04-01', completed: '2026-04-08' }),
        ];
        expect(extractLeadTimes(issues)).toHaveLength(1);
    });

    it('customfield_11485 (실제완료일) 우선', () => {
        const issues = [
            makeIssue({
                statusCategory: 'indeterminate', // 카테고리 X
                statusName: '최종검증요청',
                created: '2026-04-01',
                actualDone: '2026-04-08', // customfield 채워짐
            }),
        ];
        const leads = extractLeadTimes(issues);
        expect(leads).toHaveLength(1);
    });

    it('completed < created 데이터 오류 방어', () => {
        const issues = [
            makeIssue({ statusCategory: 'done', created: '2026-04-10', completed: '2026-04-01' }), // 완료가 더 빠름
        ];
        expect(extractLeadTimes(issues)).toHaveLength(0);
    });
});

describe('computeLeadTimeForecast', () => {
    const now = new Date(2026, 3, 30); // 4월 30일

    it('샘플 < 10 → unreliable', () => {
        const issues = Array(5).fill(0).map((_, i) =>
            makeIssue({ statusCategory: 'done', created: '2026-04-01', completed: '2026-04-08', key: `D-${i}` })
        );
        const r = computeLeadTimeForecast(issues, now);
        expect(r.confidence).toBe('unreliable');
        expect(r.sampleSize).toBe(5);
    });

    it('샘플 10~29 → low (P50/P85 사용 가능)', () => {
        const issues = Array(15).fill(0).map((_, i) =>
            makeIssue({ statusCategory: 'done', created: '2026-04-01', completed: '2026-04-08', key: `D-${i}` })
        );
        const r = computeLeadTimeForecast(issues, now);
        expect(r.confidence).toBe('low');
        expect(r.sampleSize).toBe(15);
    });

    it('샘플 30+ → medium', () => {
        // 30건의 다양한 lead time
        const issues = Array(30).fill(0).map((_, i) =>
            makeIssue({
                statusCategory: 'done',
                created: '2026-04-01',
                completed: i % 2 === 0 ? '2026-04-08' : '2026-04-15', // 5 또는 10 영업일
                key: `D-${i}`,
            })
        );
        const r = computeLeadTimeForecast(issues, now);
        expect(r.confidence).toBe('medium');
        expect(r.sampleSize).toBe(30);
        expect(r.p50Days).toBeGreaterThan(0);
        expect(r.p85Days).toBeGreaterThan(0);
    });

    it('병렬성 자동 추출 — unique assignee', () => {
        const issues = [
            ...Array(30).fill(0).map((_, i) =>
                makeIssue({ statusCategory: 'done', created: '2026-04-01', completed: '2026-04-08', key: `D-${i}` })
            ),
            // 활성 5건, 담당자 3명
            makeIssue({ statusCategory: 'indeterminate', created: '2026-04-20', assigneeId: 'a', key: 'A-1' }),
            makeIssue({ statusCategory: 'indeterminate', created: '2026-04-20', assigneeId: 'a', key: 'A-2' }),
            makeIssue({ statusCategory: 'indeterminate', created: '2026-04-20', assigneeId: 'b', key: 'A-3' }),
            makeIssue({ statusCategory: 'indeterminate', created: '2026-04-20', assigneeId: 'c', key: 'A-4' }),
            makeIssue({ statusCategory: 'indeterminate', created: '2026-04-20', key: 'A-5' }), // 미할당
        ];
        const r = computeLeadTimeForecast(issues, now);
        expect(r.activeParallelism).toBe(3); // a, b, c
        expect(r.unassignedCount).toBe(1);
        expect(r.activeCount).toBe(5);
    });

    it('팀 ETA = ceil(활성 / 병렬성) × P85', () => {
        const issues = [
            ...Array(30).fill(0).map((_, i) =>
                // 모든 lead time = 5일
                makeIssue({ statusCategory: 'done', created: '2026-04-01', completed: '2026-04-08', key: `D-${i}` })
            ),
            // 활성 10건, 담당자 2명 → ceil(10/2)=5 × P85 5일 = 25일
            ...Array(10).fill(0).map((_, i) =>
                makeIssue({
                    statusCategory: 'indeterminate',
                    created: '2026-04-20',
                    assigneeId: i % 2 === 0 ? 'a' : 'b',
                    key: `A-${i}`,
                })
            ),
        ];
        const r = computeLeadTimeForecast(issues, now);
        expect(r.activeParallelism).toBe(2);
        expect(r.activeCount).toBe(10);
        expect(r.p85Days).toBe(5);
        expect(r.teamEtaBusinessDays).toBe(25); // ceil(10/2) * 5
    });

    it('개별 이슈 ETA — created로부터 P85 잔여', () => {
        const issues = [
            ...Array(30).fill(0).map((_, i) =>
                makeIssue({ statusCategory: 'done', created: '2026-04-01', completed: '2026-04-08', key: `D-${i}` })
            ),
            // 4월 20일 created (now 4월 30일 → 8영업일 경과), P85 5일 → overdue
            makeIssue({ statusCategory: 'indeterminate', created: '2026-04-20', assigneeId: 'a', key: 'OLD-1' }),
            // 4월 29일 created (1영업일 경과), 잔여 = 5-1 = 4
            makeIssue({ statusCategory: 'indeterminate', created: '2026-04-29', assigneeId: 'b', key: 'NEW-1' }),
        ];
        const r = computeLeadTimeForecast(issues, now);
        const old1 = r.perIssueEtas.find((e) => e.issueKey === 'OLD-1');
        const new1 = r.perIssueEtas.find((e) => e.issueKey === 'NEW-1');
        expect(old1?.overdue).toBe(true);
        expect(new1?.overdue).toBe(false);
        expect(new1?.estimatedRemainingDays).toBeGreaterThan(0);
        expect(new1?.estimatedRemainingDays).toBeLessThanOrEqual(5);
    });

    it('v1.0.45: distributionCheck — 사후 분포 적중률 산정 + calibration 등급', () => {
        // 균등 분포: 30건 lead time = [1..30] 일 → P50=15, P85≈25.65, P95≈28.55
        const issues = Array(30).fill(0).map((_, i) => {
            const dayOffset = i + 1; // 1~30
            const completedDate = `2026-04-${String(dayOffset).padStart(2, '0')}`;
            return makeIssue({
                statusCategory: 'done',
                created: '2026-04-01',
                completed: completedDate,
                key: `S-${i}`,
            });
        });
        const r = computeLeadTimeForecast(issues, now);
        expect(r.distributionCheck.totalSamples).toBe(30);
        // 분포 정의상 P50 적중률 ≈ 50%, P85 ≈ 85%, P95 ≈ 95% 근방
        expect(r.distributionCheck.hitRateP50).toBeGreaterThanOrEqual(40);
        expect(r.distributionCheck.hitRateP50).toBeLessThanOrEqual(60);
        expect(r.distributionCheck.hitRateP85).toBeGreaterThanOrEqual(75);
        expect(r.distributionCheck.hitRateP85).toBeLessThanOrEqual(92);
        expect(r.distributionCheck.calibration).toBe('well-calibrated');
    });

    it('v1.0.45: distributionCheck — 샘플 < 5 → insufficient', () => {
        const issues = Array(3).fill(0).map((_, i) =>
            makeIssue({ statusCategory: 'done', created: '2026-04-01', completed: '2026-04-08', key: `S-${i}` })
        );
        const r = computeLeadTimeForecast(issues, now);
        expect(r.distributionCheck.totalSamples).toBe(3);
        expect(r.distributionCheck.calibration).toBe('insufficient');
    });

    it('v1.0.44: 3 시나리오 ETA — P50/P85/P95 기반', () => {
        // lead time 분포: P50≈3, P85≈7, P95≈10 (P50<P85<P95 보장)
        const issues = [
            ...Array(20).fill(0).map((_, i) =>
                makeIssue({ statusCategory: 'done', created: '2026-04-01', completed: '2026-04-04', key: `S-${i}` }) // 3일
            ),
            ...Array(8).fill(0).map((_, i) =>
                makeIssue({ statusCategory: 'done', created: '2026-04-01', completed: '2026-04-10', key: `M-${i}` }) // 7일
            ),
            ...Array(2).fill(0).map((_, i) =>
                makeIssue({ statusCategory: 'done', created: '2026-04-01', completed: '2026-04-15', key: `L-${i}` }) // 10일
            ),
            // 활성 10건, 담당자 2명 → 5 사이클
            ...Array(10).fill(0).map((_, i) =>
                makeIssue({
                    statusCategory: 'indeterminate',
                    created: '2026-04-20',
                    assigneeId: i % 2 === 0 ? 'a' : 'b',
                    key: `A-${i}`,
                })
            ),
        ];
        const r = computeLeadTimeForecast(issues, now);
        expect(r.scenarios.optimistic.days).toBeLessThanOrEqual(r.scenarios.realistic.days);
        expect(r.scenarios.realistic.days).toBeLessThanOrEqual(r.scenarios.conservative.days);
        expect(r.scenarios.realistic.days).toBe(r.teamEtaBusinessDays); // realistic = 기존 팀 ETA
    });

    it('병렬성 1 + 활성 5건 초과 → warning', () => {
        const issues = [
            ...Array(30).fill(0).map((_, i) =>
                makeIssue({ statusCategory: 'done', created: '2026-04-01', completed: '2026-04-08', key: `D-${i}` })
            ),
            // 활성 10건, 담당자 1명
            ...Array(10).fill(0).map((_, i) =>
                makeIssue({ statusCategory: 'indeterminate', created: '2026-04-20', assigneeId: 'a', key: `A-${i}` })
            ),
        ];
        const r = computeLeadTimeForecast(issues, now);
        expect(r.activeParallelism).toBe(1);
        const hasWarn = r.warnings.some(w => w.includes('활성 인원 1명'));
        expect(hasWarn).toBe(true);
    });
});
