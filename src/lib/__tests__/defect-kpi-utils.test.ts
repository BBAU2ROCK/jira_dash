import { describe, it, expect } from 'vitest';
import {
    aggregateDefectKpiForPair,
    mergeDefectKpiRows,
    defectRateToGrade,
    extractDefectSeverityLabel,
    extractWorkerPerson,
    personKeyFromAssignee,
    resolveWorkerFieldId,
    resolveDefectSeverityFieldId,
    DEFECT_SEVERITY_EMPTY,
    DEFECT_SEVERITY_UNRESOLVED_FIELD,
} from '../defect-kpi-utils';
import type { JiraIssue } from '../../api/jiraClient';

const WORKER_FIELD = 'customfield_99001';
const SEVERITY_FIELD = 'customfield_99002';

function devIssue(key: string, assignee?: { id?: string; name: string }): JiraIssue {
    return {
        id: key,
        key,
        fields: {
            summary: key,
            status: { name: 'Done', statusCategory: { key: 'done', colorName: 'green' } },
            issuetype: { name: '할 일', iconUrl: '', subtask: false },
            assignee: assignee
                ? {
                      accountId: assignee.id ?? '',
                      displayName: assignee.name,
                      avatarUrls: { '48x48': '' },
                  }
                : undefined,
            created: '2024-01-01T00:00:00.000+0900',
        },
    } as unknown as JiraIssue;
}

function defectIssue(
    key: string,
    worker: { id?: string; name: string } | string | null,
    severity?: string
): JiraIssue {
    const fields: Record<string, unknown> = {
        summary: key,
        status: { name: 'Open', statusCategory: { key: 'new', colorName: 'gray' } },
        issuetype: { name: '결함', iconUrl: '', subtask: false },
        created: '2024-01-01T00:00:00.000+0900',
    };
    if (typeof worker === 'string') {
        fields[WORKER_FIELD] = worker;
    } else if (worker) {
        fields[WORKER_FIELD] = {
            accountId: worker.id ?? '',
            displayName: worker.name,
        };
    }
    if (severity != null) fields[SEVERITY_FIELD] = { value: severity };
    return { id: key, key, fields } as unknown as JiraIssue;
}

describe('personKeyFromAssignee', () => {
    it('accountId 우선', () => {
        const i = devIssue('A-1', { id: 'acc-1', name: 'Alice' });
        const r = personKeyFromAssignee(i);
        expect(r.key).toBe('id:acc-1');
        expect(r.label).toBe('Alice');
    });

    it('accountId 없으면 정규화된 이름 사용', () => {
        const i = devIssue('A-1', { name: 'Alice' });
        const r = personKeyFromAssignee(i);
        expect(r.key).toBe('n:alice');
    });

    it('미배정 처리', () => {
        const i = devIssue('A-1');
        const r = personKeyFromAssignee(i);
        expect(r.key).toBe('__unassigned__');
        expect(r.label).toBe('미배정');
    });
});

describe('extractWorkerPerson', () => {
    it('객체 + accountId', () => {
        const i = defectIssue('B-1', { id: 'acc-1', name: 'Bob' });
        const r = extractWorkerPerson(i, WORKER_FIELD);
        expect(r).toEqual({ key: 'id:acc-1', label: 'Bob' });
    });

    it('문자열 형태 작업자', () => {
        const i = defectIssue('B-1', 'Charlie');
        const r = extractWorkerPerson(i, WORKER_FIELD);
        expect(r).toEqual({ key: 'n:charlie', label: 'Charlie' });
    });

    it('null 작업자는 null 반환', () => {
        const i = defectIssue('B-1', null);
        expect(extractWorkerPerson(i, WORKER_FIELD)).toBeNull();
    });
});

describe('extractDefectSeverityLabel', () => {
    it('필드 미연결', () => {
        const i = defectIssue('B-1', null);
        expect(extractDefectSeverityLabel(i, undefined)).toBe(DEFECT_SEVERITY_UNRESOLVED_FIELD);
    });

    it('값 비어 있음', () => {
        const i = defectIssue('B-1', null);
        expect(extractDefectSeverityLabel(i, SEVERITY_FIELD)).toBe(DEFECT_SEVERITY_EMPTY);
    });

    it('option 객체 value 사용', () => {
        const i = defectIssue('B-1', null, 'Critical');
        expect(extractDefectSeverityLabel(i, SEVERITY_FIELD)).toBe('Critical');
    });
});

describe('defectRateToGrade', () => {
    it.each([
        [0, 'S'],
        [5, 'S'],
        [5.1, 'A'],
        [10, 'A'],
        [10.1, 'B'],
        [15, 'B'],
        [15.1, 'C'],
        [20, 'C'],
        [20.1, 'D'],
        [50, 'D'],
    ])('rate %s → grade %s', (rate, expected) => {
        expect(defectRateToGrade(rate)).toBe(expected);
    });
});

describe('aggregateDefectKpiForPair', () => {
    it('담당자별 dev/defect 카운트와 비율 계산', () => {
        const dev = [
            devIssue('A-1', { id: 'alice', name: 'Alice' }),
            devIssue('A-2', { id: 'alice', name: 'Alice' }),
            devIssue('A-3', { id: 'bob', name: 'Bob' }),
        ];
        const def = [
            defectIssue('B-1', { id: 'alice', name: 'Alice' }, 'Critical'),
            defectIssue('B-2', { id: 'alice', name: 'Alice' }, 'High'),
            defectIssue('B-3', { id: 'bob', name: 'Bob' }, 'Critical'),
        ];
        const rows = aggregateDefectKpiForPair(dev, def, WORKER_FIELD, SEVERITY_FIELD);
        const alice = rows.find((r) => r.key === 'id:alice')!;
        const bob = rows.find((r) => r.key === 'id:bob')!;
        expect(alice.devIssueCount).toBe(2);
        expect(alice.defectCount).toBe(2);
        expect(alice.defectRatePercent).toBe(100);
        expect(alice.grade).toBe('D');
        expect(bob.devIssueCount).toBe(1);
        expect(bob.defectCount).toBe(1);
        expect(bob.grade).toBe('D');
    });

    it('dev 0 + defect 있으면 등급 D', () => {
        const def = [defectIssue('B-1', { id: 'x', name: 'X' }, 'Critical')];
        const rows = aggregateDefectKpiForPair([], def, WORKER_FIELD, SEVERITY_FIELD);
        expect(rows[0].defectRatePercent).toBeNull();
        expect(rows[0].grade).toBe('D');
    });
});

describe('mergeDefectKpiRows', () => {
    it('서로 다른 매핑의 같은 담당자 합산', () => {
        const pair1 = aggregateDefectKpiForPair(
            [devIssue('A-1', { id: 'alice', name: 'Alice' })],
            [defectIssue('B-1', { id: 'alice', name: 'Alice' }, 'Critical')],
            WORKER_FIELD,
            SEVERITY_FIELD
        );
        const pair2 = aggregateDefectKpiForPair(
            [devIssue('C-1', { id: 'alice', name: 'Alice' })],
            [defectIssue('D-1', { id: 'alice', name: 'Alice' }, 'High')],
            WORKER_FIELD,
            SEVERITY_FIELD
        );
        const merged = mergeDefectKpiRows([pair1, pair2]);
        const alice = merged.find((r) => r.key === 'id:alice')!;
        expect(alice.devIssueCount).toBe(2);
        expect(alice.defectCount).toBe(2);
        expect(alice.severityBreakdown.map((s) => s.name).sort()).toEqual(['Critical', 'High']);
    });
});

describe('field id resolution', () => {
    it('이름으로 작업자 필드 id 매칭', () => {
        const fields = [
            { id: 'customfield_1', name: '담당자' },
            { id: 'customfield_2', name: '작업자' },
        ];
        expect(resolveWorkerFieldId(fields)).toBe('customfield_2');
    });

    it('결함 심각도 보조 매칭(부분 문자열)', () => {
        const fields = [{ id: 'customfield_99', name: '결함의 심각도 등급' }];
        expect(resolveDefectSeverityFieldId(fields)).toBe('customfield_99');
    });
});
