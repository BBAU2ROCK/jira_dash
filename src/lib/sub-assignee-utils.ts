/**
 * v1.0.14: 서브담당자 (다중 사용자 array) 추출 + 카운트 헬퍼.
 *
 * Jira 인스턴스의 customfield_11482 (또는 store에서 변경 가능한 필드)에서
 * 다중 사용자 정보를 안전하게 평탄화한다.
 *
 * 설계 원칙:
 *   - 빈 배열·null·잘못된 형식 모두 빈 결과로 안전 처리
 *   - 메인 담당자와 동일한 personKey 규칙 (defect-kpi-utils 의 personKeyFromAssignee와 일관성)
 *   - 가중치 0.5 (사용자 결정 — 코칭 도구 원칙: 메인 주도 책임 인정 + 서브 기여도 절반 반영)
 */

import type { JiraIssue } from '@/api/jiraClient';
import { resolveFields } from '@/lib/kpi-rules-resolver';
import { UNKNOWN_LABEL } from '@/lib/jira-constants';

/** 서브담당자 가중치 (사용자 결정 — KPI 산정 시 task 1건당 부여) */
export const SUB_ASSIGNEE_WEIGHT = 0.5 as const;

export interface SubAssigneeRef {
    /** personKey — 메인 담당자와 동일 규칙 (id 우선, 이름 fallback) */
    key: string;
    /** Jira accountId (있을 때) */
    accountId?: string;
    /** displayName */
    label: string;
}

function norm(s: string): string {
    return s.trim().toLowerCase();
}

/** Jira user 객체 → personKey + label */
function userToRef(u: unknown): SubAssigneeRef | null {
    if (!u || typeof u !== 'object') return null;
    const obj = u as { accountId?: string; displayName?: string };
    const id = typeof obj.accountId === 'string' ? obj.accountId.trim() : '';
    const dn = typeof obj.displayName === 'string' ? obj.displayName.trim() : '';
    if (id) return { key: `id:${id}`, accountId: id, label: dn || id };
    if (dn) return { key: `n:${norm(dn)}`, label: dn };
    return null;
}

/**
 * 이슈에서 서브담당자 배열 추출.
 * store의 fields.subAssignee 필드 ID 기준. 빈 문자열·null이면 빈 배열.
 */
export function extractSubAssignees(issue: JiraIssue): SubAssigneeRef[] {
    const fieldId = resolveFields().SUB_ASSIGNEE;
    if (!fieldId) return [];
    const raw = issue.fields[fieldId] as unknown;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const result: SubAssigneeRef[] = [];
    const seenKeys = new Set<string>();
    for (const u of raw) {
        const ref = userToRef(u);
        if (ref && !seenKeys.has(ref.key)) {
            seenKeys.add(ref.key);
            result.push(ref);
        }
    }
    return result;
}

/**
 * 서브담당자 → 본인이 서브로 등록된 이슈 매핑.
 *
 * @returns Map<personKey, { displayName, issues, mainPartners (메인 담당자별 카운트) }>
 */
export interface SubInvolvement {
    key: string;
    displayName: string;
    /** 본인이 서브로 등록된 이슈 (메인 담당자가 다른 경우 포함) */
    issues: JiraIssue[];
    /** 메인 담당자별 협업 횟수 (this person이 서브로 함께한 횟수) */
    mainPartners: Map<string, number>;
    /** 같이 서브로 등록된 동료 카운트 */
    coSubs: Map<string, number>;
}

export function buildSubAssigneeMap(issues: JiraIssue[]): Map<string, SubInvolvement> {
    const map = new Map<string, SubInvolvement>();
    for (const issue of issues) {
        const subs = extractSubAssignees(issue);
        if (subs.length === 0) continue;
        const mainName = issue.fields.assignee?.displayName ?? UNKNOWN_LABEL;
        for (const sub of subs) {
            const prev = map.get(sub.key) ?? {
                key: sub.key,
                displayName: sub.label,
                issues: [],
                mainPartners: new Map<string, number>(),
                coSubs: new Map<string, number>(),
            };
            prev.issues.push(issue);
            prev.mainPartners.set(mainName, (prev.mainPartners.get(mainName) ?? 0) + 1);
            // 같이 등록된 다른 서브 카운트
            for (const other of subs) {
                if (other.key === sub.key) continue;
                prev.coSubs.set(other.label, (prev.coSubs.get(other.label) ?? 0) + 1);
            }
            map.set(sub.key, prev);
        }
    }
    return map;
}
