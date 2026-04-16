import { describe, it, expect, afterEach } from 'vitest';
import { calculateKPI, getCompletionDate } from '../kpiService';
import type { JiraIssue } from '../../api/jiraClient';
import { JIRA_CONFIG } from '../../config/jiraConfig';
import { useKpiRulesStore } from '../../stores/kpiRulesStore';

type IssueOpts = {
    key?: string;
    statusKey?: 'done' | 'indeterminate' | 'new';
    statusName?: string;
    duedate?: string;
    resolutiondate?: string;
    actualDone?: string;
    labels?: string[];
};

let nextKey = 1;
function makeIssue(opts: IssueOpts = {}): JiraIssue {
    const key = opts.key ?? `T-${nextKey++}`;
    const fields: Record<string, unknown> = {
        summary: key,
        status: {
            name: opts.statusName ?? 'Done',
            statusCategory: { key: opts.statusKey ?? 'done', colorName: 'green' },
        },
        issuetype: { name: '할 일', iconUrl: '', subtask: false },
        labels: opts.labels,
        created: '2024-01-01T00:00:00.000+0900',
        duedate: opts.duedate,
        resolutiondate: opts.resolutiondate,
    };
    if (opts.actualDone) fields[JIRA_CONFIG.FIELDS.ACTUAL_DONE] = opts.actualDone;
    return { id: key, key, fields } as unknown as JiraIssue;
}

describe('calculateKPI', () => {
    it('빈 배열은 모든 값 0 + 측정 불가', () => {
        const m = calculateKPI([]);
        expect(m.totalIssues).toBe(0);
        expect(m.measurable).toBe(false);
        expect(m.grades.total).toBe('—');
    });

    it('정상 케이스: 3건 중 2건 완료(준수)·1건 진행', () => {
        // 주의: dueDate는 'YYYY-MM-DD' → new Date()로 UTC 자정으로 파싱됨.
        // setHours(23,59,59,999)는 로컬 시각 기준이므로 KST 환경에선 6/30 14:59:59Z가 마감.
        // 따라서 actualEnd는 6/30 14:00:00Z(KST 23:00) 이내여야 안전하게 준수.
        const issues = [
            makeIssue({ statusKey: 'done', duedate: '2024-06-30', resolutiondate: '2024-06-25T00:00:00Z' }),
            makeIssue({ statusKey: 'done', duedate: '2024-06-30', resolutiondate: '2024-06-30T05:00:00Z' }),
            makeIssue({ statusKey: 'indeterminate' }),
        ];
        const m = calculateKPI(issues);
        expect(m.totalIssues).toBe(3);
        expect(m.completedIssues).toBe(2);
        expect(m.compliantIssues).toBe(2);
        expect(m.delayedIssues).toBe(0);
        expect(m.earlyIssues).toBe(1); // 6/25는 6/30 자정 이전 = 조기
        expect(m.completionRate).toBe(67); // 2/3
        expect(m.measurable).toBe(true);
    });

    it('지연 1건 + 합의지연 라벨 1건 → 합의지연은 분모/분자에서 빠짐', () => {
        const issues = [
            makeIssue({ statusKey: 'done', duedate: '2024-06-30', resolutiondate: '2024-07-05T10:00:00Z' }), // 일반 지연
            makeIssue({
                statusKey: 'done',
                duedate: '2024-06-30',
                resolutiondate: '2024-07-10T10:00:00Z',
                labels: [JIRA_CONFIG.LABELS.AGREED_DELAY],
            }), // 합의지연 (분모/분자에서 모두 빠짐)
        ];
        const m = calculateKPI(issues);
        expect(m.totalIssues).toBe(2);
        expect(m.agreedDelayIssues).toBe(1);
        expect(m.delayedIssues).toBe(1);
        // kpiTotal=1 (2-1), kpiCompleted=1 (2-1), 완료율 100
        expect(m.completionRate).toBe(100);
        // 준수 1건(원래 1건), 합의지연-준수 0건 → kpiCompliant=1, 준수율=0/1? 합의지연-지연이라 compliant가 안 카운트됨
        // compliantIssues=0 (합의지연인데 지연 → 둘 다 카운트 안 됨), kpiCompliant=0
        expect(m.compliantIssues).toBe(0);
        expect(m.complianceRate).toBe(0);
    });

    it('모든 이슈가 합의지연이면 측정 불가 (C1 회귀 박제)', () => {
        const issues = [
            makeIssue({ statusKey: 'done', duedate: '2024-06-30', resolutiondate: '2024-06-25T00:00:00Z', labels: [JIRA_CONFIG.LABELS.AGREED_DELAY] }),
            makeIssue({ statusKey: 'done', duedate: '2024-06-30', resolutiondate: '2024-07-05T00:00:00Z', labels: [JIRA_CONFIG.LABELS.AGREED_DELAY] }),
        ];
        const m = calculateKPI(issues);
        expect(m.totalIssues).toBe(2);
        expect(m.agreedDelayIssues).toBe(2);
        expect(m.measurable).toBe(false);
        expect(m.completionRate).toBe(0); // 측정 불가 시 0
        expect(m.grades.total).toBe('—');
        expect(m.grades.completion).toBe('—');
        // 이전 버그: kpiTotal=1로 강제되어 100%·S 등급으로 부풀려졌음
    });

    it('검증지연 라벨은 지연이어도 준수로 흡수', () => {
        const issues = [
            makeIssue({
                statusKey: 'done',
                duedate: '2024-06-30',
                resolutiondate: '2024-07-05T10:00:00Z',
                labels: [JIRA_CONFIG.LABELS.VERIFICATION_DELAY],
            }),
        ];
        const m = calculateKPI(issues);
        expect(m.delayedIssues).toBe(0);
        expect(m.compliantIssues).toBe(1);
        expect(m.complianceRate).toBe(100);
    });

    it('조기완료율은 합의지연 분자도 차감 (H5 회귀 박제)', () => {
        const issues = [
            // 일반 조기완료
            makeIssue({ statusKey: 'done', duedate: '2024-06-30', resolutiondate: '2024-06-20T00:00:00Z' }),
            // 합의지연 + 조기완료 (실무에서는 이상하지만 이론적으로 가능)
            makeIssue({
                statusKey: 'done',
                duedate: '2024-06-30',
                resolutiondate: '2024-06-20T00:00:00Z',
                labels: [JIRA_CONFIG.LABELS.AGREED_DELAY],
            }),
        ];
        const m = calculateKPI(issues);
        // earlyIssues 자체는 2건 (집계용)
        expect(m.earlyIssues).toBe(2);
        // 그러나 earlyRate는 합의지연 차감 후 분자 1건 / kpiTotal 1건 = 100
        expect(m.earlyRate).toBe(100);
    });

    it('마감일 없는 완료는 준수로 카운트', () => {
        const issues = [
            makeIssue({ statusKey: 'done', resolutiondate: '2024-06-25T00:00:00Z' }),
        ];
        const m = calculateKPI(issues);
        expect(m.compliantIssues).toBe(1);
        expect(m.complianceRate).toBe(100);
        expect(m.earlyIssues).toBe(0);
    });

    it('actualDone 커스텀 필드가 resolutiondate보다 우선', () => {
        const issues = [
            // resolutiondate는 늦지만 actualDone은 조기 → 조기완료로 카운트
            makeIssue({
                statusKey: 'done',
                duedate: '2024-06-30',
                resolutiondate: '2024-07-10T00:00:00Z',
                actualDone: '2024-06-20T00:00:00Z',
            }),
        ];
        const m = calculateKPI(issues);
        expect(m.compliantIssues).toBe(1);
        expect(m.earlyIssues).toBe(1);
    });

    it('등급 경계값', () => {
        // 95% → S
        const issues95 = Array.from({ length: 20 }, (_, i) =>
            makeIssue({ statusKey: i < 19 ? 'done' : 'indeterminate', duedate: '2024-06-30', resolutiondate: '2024-06-25T00:00:00Z' })
        );
        const m95 = calculateKPI(issues95);
        expect(m95.completionRate).toBe(95);
        expect(m95.grades.completion).toBe('S');
    });
});

// K1 — Store 완전 연동 검증
describe('calculateKPI — kpiRulesStore 연동 (K1)', () => {
    // 각 테스트 후 기본값 복구
    afterEach(() => {
        useKpiRulesStore.getState().resetToDefault();
    });

    it('store의 agreedDelay 라벨을 변경하면 커스텀 라벨이 인식됨', () => {
        // 커스텀 라벨 설정
        useKpiRulesStore.setState({
            rules: {
                ...useKpiRulesStore.getState().rules,
                labels: { agreedDelay: 'custom-agreed', verificationDelay: 'verification-delay' },
            },
        });

        const issues = [
            makeIssue({
                statusKey: 'done',
                duedate: '2024-06-30',
                resolutiondate: '2024-07-05T10:00:00Z',
                labels: ['custom-agreed'],
            }),
            makeIssue({
                statusKey: 'done',
                duedate: '2024-06-30',
                resolutiondate: '2024-07-05T10:00:00Z',
                labels: [JIRA_CONFIG.LABELS.AGREED_DELAY], // 기본 라벨 — 이제 무시돼야 함
            }),
        ];
        const m = calculateKPI(issues);
        expect(m.agreedDelayIssues).toBe(1); // custom-agreed만 인식
        expect(m.delayedIssues).toBe(1); // 기본 라벨은 일반 지연으로 집계
    });

    it('store의 verificationDelay 라벨 변경이 준수 흡수에 반영', () => {
        useKpiRulesStore.setState({
            rules: {
                ...useKpiRulesStore.getState().rules,
                labels: { agreedDelay: 'agreed-delay', verificationDelay: 'custom-verify' },
            },
        });

        const issues = [
            makeIssue({
                statusKey: 'done',
                duedate: '2024-06-30',
                resolutiondate: '2024-07-05T10:00:00Z',
                labels: ['custom-verify'],
            }),
        ];
        const m = calculateKPI(issues);
        expect(m.delayedIssues).toBe(0);
        expect(m.compliantIssues).toBe(1);
    });

    it('store의 가중치 변경이 totalScore에 반영 (완료 70% + 준수 30%)', () => {
        useKpiRulesStore.setState({
            rules: {
                ...useKpiRulesStore.getState().rules,
                weights: { completion: 0.7, compliance: 0.3 },
            },
        });

        // 완료 100% + 준수 50% → 가중점수 70*1.0 + 30*0.5 = 85
        const issues = [
            makeIssue({ statusKey: 'done', duedate: '2024-06-30', resolutiondate: '2024-06-25T00:00:00Z' }), // 준수+조기
            makeIssue({ statusKey: 'done', duedate: '2024-06-30', resolutiondate: '2024-07-05T10:00:00Z' }), // 지연
        ];
        const m = calculateKPI(issues);
        expect(m.completionRate).toBe(100);
        expect(m.complianceRate).toBe(50);
        // 가중점수 = 100*0.7 + 50*0.3 = 85
        // earlyRate = 1/2 = 50% → 50% 이상이면 +5점
        expect(m.totalScore).toBe(90); // 85 + 5
    });

    it('store의 등급 기준 변경이 즉시 반영 (S=80으로 완화)', () => {
        useKpiRulesStore.setState({
            rules: {
                ...useKpiRulesStore.getState().rules,
                grades: { S: 80, A: 70, B: 60, C: 50 },
            },
        });

        // 완료 80% → 완화된 기준에서는 S
        const issues = Array.from({ length: 5 }, (_, i) =>
            makeIssue({
                statusKey: i < 4 ? 'done' : 'indeterminate',
                duedate: '2024-06-30',
                resolutiondate: '2024-06-25T00:00:00Z',
            })
        );
        const m = calculateKPI(issues);
        expect(m.completionRate).toBe(80);
        expect(m.grades.completion).toBe('S');
    });
});

// K5 — earlyRate 100% 상한
describe('calculateKPI — earlyRate cap (K5)', () => {
    afterEach(() => {
        useKpiRulesStore.getState().resetToDefault();
    });

    it('earlyRate는 100% 상한 적용 (합의지연 차감 시 과대 계산 방지)', () => {
        const issues = [
            // 일반 조기완료 2건
            makeIssue({ statusKey: 'done', duedate: '2024-06-30', resolutiondate: '2024-06-20T00:00:00Z' }),
            makeIssue({ statusKey: 'done', duedate: '2024-06-30', resolutiondate: '2024-06-20T00:00:00Z' }),
            // 합의지연 조기완료 1건 (분모에서 제외)
            makeIssue({
                statusKey: 'done',
                duedate: '2024-06-30',
                resolutiondate: '2024-06-20T00:00:00Z',
                labels: [JIRA_CONFIG.LABELS.AGREED_DELAY],
            }),
        ];
        const m = calculateKPI(issues);
        // kpiTotal=2, kpiEarly=2 → 100%. 상한 없으면 계산상 (2/2)*100=100이라 동일하나
        // 상한 적용 자체로 회귀 방지
        expect(m.earlyRate).toBeLessThanOrEqual(100);
        expect(m.earlyRate).toBe(100);
    });
});

// K6 — 기한 없음 이슈 분리 카운트
describe('calculateKPI — noDueDateCount (K6)', () => {
    afterEach(() => {
        useKpiRulesStore.getState().resetToDefault();
    });

    it('기한 없는 완료 이슈는 compliant + noDueDateCount 동시 증가', () => {
        const issues = [
            makeIssue({ statusKey: 'done', resolutiondate: '2024-06-25T00:00:00Z' }), // 기한 없음
            makeIssue({ statusKey: 'done', duedate: '2024-06-30', resolutiondate: '2024-06-25T00:00:00Z' }), // 기한 있음
        ];
        const m = calculateKPI(issues);
        expect(m.compliantIssues).toBe(2);
        expect(m.noDueDateCount).toBe(1); // 기한 없는 1건만 노출
    });

    it('완료일 없는 완료 이슈도 noDueDateCount 증가', () => {
        const issues = [
            makeIssue({ statusKey: 'done', duedate: '2024-06-30' }), // resolutiondate 없음
        ];
        const m = calculateKPI(issues);
        expect(m.compliantIssues).toBe(1);
        expect(m.noDueDateCount).toBe(1);
    });

    it('모두 기한 있을 때 noDueDateCount 0', () => {
        const issues = [
            makeIssue({ statusKey: 'done', duedate: '2024-06-30', resolutiondate: '2024-06-25T00:00:00Z' }),
            makeIssue({ statusKey: 'done', duedate: '2024-06-30', resolutiondate: '2024-07-05T00:00:00Z' }),
        ];
        const m = calculateKPI(issues);
        expect(m.noDueDateCount).toBe(0);
    });
});

// getCompletionDate 헬퍼
describe('getCompletionDate (K1 헬퍼)', () => {
    it('ACTUAL_DONE 필드 우선', () => {
        const issue = makeIssue({
            resolutiondate: '2024-07-10T00:00:00Z',
            actualDone: '2024-06-20T00:00:00Z',
        });
        const d = getCompletionDate(issue);
        expect(d?.toISOString()).toBe('2024-06-20T00:00:00.000Z');
    });

    it('ACTUAL_DONE 없으면 resolutiondate', () => {
        const issue = makeIssue({ resolutiondate: '2024-07-10T00:00:00Z' });
        const d = getCompletionDate(issue);
        expect(d?.toISOString()).toBe('2024-07-10T00:00:00.000Z');
    });

    it('둘 다 없으면 null', () => {
        const issue = makeIssue({ statusKey: 'indeterminate' });
        expect(getCompletionDate(issue)).toBeNull();
    });
});
