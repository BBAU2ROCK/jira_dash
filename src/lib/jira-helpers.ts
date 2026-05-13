import { type JiraIssue } from '../api/jiraClient';
import { resolveFields, resolveCancelledStatus, resolveOnHoldStatus, resolveRejectedStatus } from './kpi-rules-resolver';
import { parseLocalDay } from './date-utils';

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
 * v1.0.51: 완료일 추출 통합 헬퍼.
 *
 * "실제완료일(ACTUAL_DONE customfield)이 있으면 우선, 없으면 resolutiondate"
 * 패턴이 useBacklogForecast / kpiService / effortEstimation / scopeInflowAnalysis 등
 * 6곳 이상 반복되던 것을 일원화. resolveFields()로 필드 ID는 store 우선.
 *
 * @returns parseLocalDay 결과 (시간을 0:00으로 truncate한 Date) 또는 null
 */
export function getCompletionDate(issue: JiraIssue): Date | null {
    const actualField = resolveFields().ACTUAL_DONE;
    const actual = issue.fields[actualField];
    if (typeof actual === 'string' && actual.trim().length > 0) {
        const parsed = parseLocalDay(actual);
        if (parsed) return parsed;
    }
    return parseLocalDay(issue.fields.resolutiondate ?? null);
}

/**
 * v1.0.51: 완료일 ISO 문자열 추출 (date 비교 없이 사용처용).
 */
export function getCompletionDateStr(issue: JiraIssue): string | null {
    const actualField = resolveFields().ACTUAL_DONE;
    const actual = issue.fields[actualField];
    if (typeof actual === 'string' && actual.trim().length > 0) return actual;
    return issue.fields.resolutiondate ?? null;
}

// ─── 상태 분류 헬퍼 (v1.0.55) ─────────────────────────────────────────────────
//
// 워크플로우 의미 (사용자 환경 기준):
//   - 취소(Cancelled): 작업 폐기. 끝낼 의도 없음.
//   - 반려(Rejected) : 리더가 '개발완료' 검증 후 추가 수정 지시 → **재작업 필요 = active**.
//                     ⚠️ v1.0.18~v1.0.54에서 cancelled와 동일 처리하던 부분이 일부 잘못된 가정.
//                     본 헬퍼는 반려를 active로 분류하여 지연·진행 카운트에 포함.
//   - 보류(On Hold) : 현재 진행 의사는 없으나 향후 진행 가능. 능동적 정지. **지연 카운트 제외**.

export function isCancelled(issue: JiraIssue): boolean {
    const sn = issue.fields.status?.name?.trim() ?? '';
    return sn === resolveCancelledStatus();
}

export function isRejected(issue: JiraIssue): boolean {
    const sn = issue.fields.status?.name?.trim() ?? '';
    return sn === resolveRejectedStatus();
}

export function isOnHold(issue: JiraIssue): boolean {
    const sn = issue.fields.status?.name?.trim() ?? '';
    return sn === resolveOnHoldStatus();
}

/**
 * v1.0.55: 능동 처리해야 하는 active 이슈 판정.
 *
 * **active 정의** (모두 만족):
 *   - 비즈니스 완료 아님 (`!isBusinessDone`)
 *   - 취소 아님
 *   - 보류 아님
 *   - **반려는 active 포함** (재작업 필요)
 *
 * "지연" / "마감 임박" / "지연율 분모" 등 모집단 정의의 공통 기준.
 */
export function isActive(issue: JiraIssue): boolean {
    if (isBusinessDone(issue)) return false;
    if (isCancelled(issue)) return false;
    if (isOnHold(issue)) return false;
    // 반려는 active로 포함 (재작업 active 상태)
    return true;
}

/**
 * v1.0.55: 마감 지연 판정 — 모든 통계/UI 공통 헬퍼.
 *
 * **지연 정의** = `duedate < now` AND `isActive(issue)`.
 *   - 취소·보류·완료 이슈는 마감 지나도 지연 아님 (능동적 작업 의무 없음).
 *   - 반려는 재작업이 필요하므로 마감 지나면 진짜 지연.
 *
 * @param issue Jira 이슈
 * @param now   기준 시각 (default new Date())
 */
export function isDelayed(issue: JiraIssue, now: Date = new Date()): boolean {
    if (!issue.fields.duedate) return false;
    if (!isActive(issue)) return false;
    return new Date(issue.fields.duedate) < now;
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
