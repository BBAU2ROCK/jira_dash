import { type JiraIssue } from '../api/jiraClient';
import { resolveFields } from './kpi-rules-resolver';

/** 일부 이슈/필드 조합에서 statusCategory가 없을 수 있음 — 옵셔널 체이닝으로 크래시 방지 */
export function getStatusCategoryKey(issue: JiraIssue): string | undefined {
    return issue.fields.status?.statusCategory?.key;
}

/**
 * v1.0.39: 비즈니스 완료 판정 (통일 정책).
 *
 * 다음 중 하나라도 만족하면 "완료"로 인정:
 *   1. status 카테고리가 'done'
 *   2. customfield_11485 (실제완료일, ACTUAL_DONE)이 직접 입력됨
 *
 * 적용 배경:
 *   - "최종검증요청"·"운영검증" 같은 검증 단계는 status 카테고리가 'indeterminate'
 *   - 그러나 사용자가 customfield_11485를 채우면 "비즈니스 완료(개발 완료)" 의미
 *   - KPI 산식 / 이슈 목록(v1.0.34) / 공수 산정 / 회고 / 처리량 모두 같은 룰로 통일
 *
 * 주의:
 *   - 취소·반려는 이 함수에서 처리하지 않음 (호출자가 별도 체크)
 *   - status name 비교(예: 한국어 '완료')는 워크플로우마다 달라서 사용하지 않음
 */
export function isBusinessDone(issue: JiraIssue): boolean {
    if (getStatusCategoryKey(issue) === 'done') return true;
    const actualField = resolveFields().ACTUAL_DONE;
    const actualDone = issue.fields[actualField];
    if (typeof actualDone === 'string' && actualDone.trim().length > 0) return true;
    return false;
}

/**
 * 이슈/검색 건수·통계·KPI 공통 규칙에 따라 "건수에 반영할 이슈"만 반환합니다.
 *
 * **건수 규칙**
 * 1. 할 일만 있는 경우: 해당 이슈를 건수에 포함한다.
 * 2. 하위 작업이 있는 경우: (부모) 할 일은 건수에 포함하지 않고, 하위 작업만 건수에 반영한다.
 * 3. 통계 및 KPI 분석 시에도 위와 동일한 조건으로 반영한다.
 *
 * **구현**: 부모이면서 자식(하위 작업)이 있는 이슈는 제외하고, 그 외(할 일만 있는 이슈 + 모든 하위 작업)만 반환.
 */
export function filterLeafIssues(issues: JiraIssue[]): JiraIssue[] {
    // Build a Set of parent keys that have children
    const parentsWithChildren = new Set<string>();

    issues.forEach(issue => {
        // If this issue has a parent, mark that parent as having children
        if (issue.fields.parent?.key) {
            parentsWithChildren.add(issue.fields.parent.key);
        }

        // Also check subtasks field (redundant but safe)
        if (issue.fields.subtasks && issue.fields.subtasks.length > 0) {
            parentsWithChildren.add(issue.key);
        }
    });

    // Filter: exclude parents that have children
    return issues.filter(issue => {
        // If this issue is a parent with children, exclude it
        if (parentsWithChildren.has(issue.key)) {
            return false;
        }

        // Otherwise, it's a leaf node (subtask or parent without children)
        return true;
    });
}
