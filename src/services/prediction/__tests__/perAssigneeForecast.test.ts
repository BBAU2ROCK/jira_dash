import { describe, it, expect } from 'vitest';
import {
    dailyThroughput,
    dailyCreations,
    computeThroughputStats,
    buildForecast,
    perAssigneeForecast,
    teamForecast,
    isInBacklog,
} from '../perAssigneeForecast';
import type { JiraIssue } from '@/api/jiraClient';

let nextKey = 1;
function makeIssue(opts: {
    key?: string;
    statusCategory?: 'done' | 'indeterminate' | 'new';
    statusName?: string;
    assignee?: { id?: string; name: string } | null;
    resolutiondate?: string;
    actualDone?: string;
    created?: string;
} = {}): JiraIssue {
    const key = opts.key ?? `T-${nextKey++}`;
    const fields: Record<string, unknown> = {
        summary: key,
        status: {
            name: opts.statusName ?? (opts.statusCategory === 'done' ? 'Done' : 'Open'),
            statusCategory: { key: opts.statusCategory ?? 'new', colorName: 'gray' },
        },
        issuetype: { name: '할 일', iconUrl: '', subtask: false },
        assignee: opts.assignee
            ? { accountId: opts.assignee.id ?? '', displayName: opts.assignee.name, avatarUrls: { '48x48': '' } }
            : undefined,
        created: opts.created ?? '2026-03-01',
        resolutiondate: opts.resolutiondate,
        customfield_11485: opts.actualDone,
    };
    return { id: key, key, fields } as unknown as JiraIssue;
}

describe('isInBacklog', () => {
    it('done는 false', () => {
        expect(isInBacklog(makeIssue({ statusCategory: 'done' }))).toBe(false);
    });
    it('취소는 false', () => {
        expect(isInBacklog(makeIssue({ statusName: '취소' }))).toBe(false);
    });
    it('진행 중·보류는 true (보류는 별도 카운트지만 백로그에 포함)', () => {
        expect(isInBacklog(makeIssue({ statusCategory: 'indeterminate' }))).toBe(true);
        expect(isInBacklog(makeIssue({ statusName: '보류' }))).toBe(true);
    });
});

describe('dailyThroughput', () => {
    const now = new Date(2026, 3, 15);
    it('완료된 이슈만 카운트, 활동 없는 날은 0', () => {
        const issues = [
            makeIssue({ statusCategory: 'done', resolutiondate: '2026-04-13' }),
            makeIssue({ statusCategory: 'done', resolutiondate: '2026-04-13' }),
            makeIssue({ statusCategory: 'done', resolutiondate: '2026-04-15' }),
        ];
        const result = dailyThroughput(issues, 5, now);
        expect(result.length).toBe(5);
        // 4/11 4/12 4/13 4/14 4/15
        expect(result).toEqual([0, 0, 2, 0, 1]);
    });
    it('범위 밖 이슈는 무시', () => {
        const issues = [makeIssue({ statusCategory: 'done', resolutiondate: '2025-01-01' })];
        const result = dailyThroughput(issues, 5, now);
        expect(result.every((c) => c === 0)).toBe(true);
    });
    it('actualDone 우선', () => {
        const issues = [makeIssue({ statusCategory: 'done', resolutiondate: '2026-04-10', actualDone: '2026-04-15' })];
        const result = dailyThroughput(issues, 5, now);
        expect(result[result.length - 1]).toBe(1);
    });
});

describe('dailyCreations', () => {
    const now = new Date(2026, 3, 15);
    it('생성일 기준 카운트', () => {
        const issues = [
            makeIssue({ created: '2026-04-13' }),
            makeIssue({ created: '2026-04-15' }),
        ];
        expect(dailyCreations(issues, 5, now)).toEqual([0, 0, 1, 0, 1]);
    });
});

describe('computeThroughputStats', () => {
    it('기본 통계', () => {
        const stats = computeThroughputStats([2, 0, 3, 1, 0, 4, 0], 5);
        expect(stats.totalDays).toBe(7);
        expect(stats.activeDays).toBe(4);
        // mean = (2+3+1+4)/4 = 2.5
        expect(stats.mean).toBe(2.5);
        // scopeRatio = 5 / 10 = 0.5
        expect(stats.scopeRatio).toBe(0.5);
    });
    it('완료 0이면 scope ratio 0', () => {
        const stats = computeThroughputStats([0, 0, 0], 10);
        expect(stats.scopeRatio).toBe(0);
        expect(stats.mean).toBe(0);
    });
});

describe('buildForecast', () => {
    const now = new Date(2026, 3, 15);
    it('잔여 0 → 즉시 unreliable', () => {
        const r = buildForecast(0, [1, 2, 3], 5, now, { rngSeed: 1 });
        expect(r.confidence).toBe('unreliable');
    });
    it('빈 history → unreliable', () => {
        const r = buildForecast(10, [], 0, now, { rngSeed: 1 });
        expect(r.confidence).toBe('unreliable');
        expect(r.warnings.some((w) => w.includes('과거 데이터 없음'))).toBe(true);
    });
    it('정상 케이스: P50 ≤ P85 ≤ P95, 영업일 변환된 Date 반환', () => {
        // 30일 throughput, 균일하게 일평균 2건
        const tp = Array(30).fill(0).map((_, i) => (i % 3 === 0 ? 0 : 2)); // mix
        const r = buildForecast(20, tp, 50, now, { rngSeed: 42 });
        expect(r.p50Days).toBeLessThanOrEqual(r.p85Days);
        expect(r.p85Days).toBeLessThanOrEqual(r.p95Days);
        expect(r.p85Date).toBeInstanceOf(Date);
        expect(r.p85Date.getTime()).toBeGreaterThan(now.getTime());
    });
});

describe('perAssigneeForecast', () => {
    const now = new Date(2026, 3, 15);
    it('담당자별 그룹핑 + 미할당 별도 카운트', () => {
        const issues = [
            // 활성 백로그
            makeIssue({ statusCategory: 'indeterminate', assignee: { id: 'a', name: '김XX' } }),
            makeIssue({ statusCategory: 'indeterminate', assignee: { id: 'a', name: '김XX' } }),
            makeIssue({ statusCategory: 'indeterminate', assignee: { id: 'b', name: '이YY' } }),
            makeIssue({ statusCategory: 'indeterminate', assignee: null }), // 미할당
            // 완료 history (김XX만 활동)
            makeIssue({ statusCategory: 'done', assignee: { id: 'a', name: '김XX' }, resolutiondate: '2026-04-10' }),
            makeIssue({ statusCategory: 'done', assignee: { id: 'a', name: '김XX' }, resolutiondate: '2026-04-12' }),
        ];
        const r = perAssigneeForecast(issues, 30, now, { rngSeed: 1 });
        expect(r.unassignedCount).toBe(1);
        expect(r.perAssignee.length).toBe(2); // 김XX + 이YY (미할당 제외)
        const kim = r.perAssignee.find((p) => p.displayName === '김XX')!;
        expect(kim.remaining).toBe(2);
        const lee = r.perAssignee.find((p) => p.displayName === '이YY')!;
        expect(lee.remaining).toBe(1);
        expect(lee.activeDays).toBe(0); // history 없음
        expect(lee.forecast?.confidence).toBe('unreliable');
    });

    it('보류 이슈는 별도 카운트 (remaining 미포함)', () => {
        const issues = [
            makeIssue({ statusName: '보류', assignee: { id: 'a', name: '김XX' } }),
            makeIssue({ statusCategory: 'indeterminate', assignee: { id: 'a', name: '김XX' } }),
        ];
        const r = perAssigneeForecast(issues, 30, now, { rngSeed: 1 });
        const kim = r.perAssignee.find((p) => p.displayName === '김XX')!;
        expect(kim.remaining).toBe(1);
        expect(kim.onHold).toBe(1);
    });

    it('정렬: 가나다 default', () => {
        const issues = [
            makeIssue({ statusCategory: 'indeterminate', assignee: { id: 'z', name: '장XX' } }),
            makeIssue({ statusCategory: 'indeterminate', assignee: { id: 'g', name: '김XX' } }),
            makeIssue({ statusCategory: 'indeterminate', assignee: { id: 'a', name: '안XX' } }),
        ];
        const r = perAssigneeForecast(issues, 30, now, { rngSeed: 1 });
        expect(r.perAssignee.map((p) => p.displayName)).toEqual(['김XX', '안XX', '장XX']);
    });
});

describe('teamForecast', () => {
    const now = new Date(2026, 3, 15);
    it('3 시나리오 모두 산출', () => {
        const issues = [
            makeIssue({ statusCategory: 'indeterminate', assignee: { id: 'a', name: '김XX' } }),
            makeIssue({ statusCategory: 'indeterminate', assignee: { id: 'a', name: '김XX' } }),
            makeIssue({ statusCategory: 'indeterminate', assignee: { id: 'b', name: '이YY' } }),
            // history
            ...Array(10).fill(0).map((_, i) => makeIssue({
                statusCategory: 'done',
                assignee: { id: 'a', name: '김XX' },
                resolutiondate: `2026-04-${String(5 + i).padStart(2, '0')}`,
            })),
        ];
        const tf = teamForecast(issues, 30, now, { rngSeed: 7 });
        expect(tf.optimistic).toBeDefined();
        expect(tf.realistic).toBeDefined();
        expect(tf.perAssignee.length).toBeGreaterThan(0);
        expect(tf.unassignedCount).toBe(0);
        expect(tf.scopeStatus).toBeDefined();
    });

    it('활성 0건 → optimistic ETA = unreliable (no-remaining)', () => {
        const issues = [
            makeIssue({ statusCategory: 'done', assignee: { id: 'a', name: '김XX' }, resolutiondate: '2026-04-10' }),
        ];
        const tf = teamForecast(issues, 30, now, { rngSeed: 1 });
        expect(tf.optimistic.confidence).toBe('unreliable');
    });
});
