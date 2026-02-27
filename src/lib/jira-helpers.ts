import { type JiraIssue } from '../api/jiraClient';

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
