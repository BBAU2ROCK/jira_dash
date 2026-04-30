/**
 * useRiskAnalysis — v1.0.28
 *
 * 매니저 콘솔의 리스크 보드 6 카드 산정. 순수 함수 (useMemo) — Jira API 추가 호출 0건.
 *
 * 6 카드:
 *   1. 마감 임박     — duedate 3일 이내 + 미완료
 *   2. Stale         — updated 7일 무변동 + 미완료
 *   3. 미배정 방치   — assignee 없음 + created 3일 초과
 *   4. 보류 장기     — status=보류 + updated 7일 초과
 *   5. 과부하 인원   — 1인당 동시 진행(in-progress) 5건 이상
 *   6. Scope creep   — 최근 7일 신규/완료 비율 > 1.5
 */
import { useMemo } from 'react';
import type { JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues, getStatusCategoryKey } from '@/lib/jira-helpers';
import { parseLocalDay } from '@/lib/date-utils';
import { resolveOnHoldStatus, resolveCancelledStatus, resolveRejectedStatus } from '@/lib/kpi-rules-resolver';
import { UNASSIGNED_LABEL } from '@/lib/jira-constants';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RiskItem {
    issue: JiraIssue;
    /** 카드별 부가 정보 (예: 며칠 stale, D-N) */
    meta?: string;
}

export interface OverloadPerson {
    displayName: string;
    inProgress: number;
    issues: JiraIssue[];
}

export interface RiskAnalysis {
    /** 카드 1: 마감 임박 (D-3 이내) */
    dueSoon: RiskItem[];
    /** 카드 2: Stale (7일 무변동) */
    stale: RiskItem[];
    /** 카드 3: 미배정 방치 (3일 초과) */
    unassigned: RiskItem[];
    /** 카드 4: 보류 장기 (7일 초과) */
    longOnHold: RiskItem[];
    /** 카드 5: 과부하 인원 (5+ 동시 진행) */
    overload: OverloadPerson[];
    /** 카드 6: Scope creep — 최근 7일 신규/완료 비율 */
    scopeCreepRatio: number;
    /** 임계값 초과 여부 (1.5 초과면 경고) */
    isScopeCreep: boolean;
    /** 전체 위험 카운트 (헤더 배지용) */
    totalCount: number;
}

interface Options {
    /** D-N 임계값 (default 3) */
    dueSoonDays?: number;
    /** Stale 임계값 (default 7) */
    staleDays?: number;
    /** 미배정 방치 임계값 (default 3) */
    unassignedDays?: number;
    /** 보류 장기 임계값 (default 7) */
    longOnHoldDays?: number;
    /** 과부하 임계값 (default 5) */
    overloadThreshold?: number;
    /** Scope creep 임계 비율 (default 1.5) */
    scopeCreepThreshold?: number;
    /** 기준 시각 (default new Date()). 테스트용 */
    now?: Date;
}

export function useRiskAnalysis(issues: JiraIssue[] | null | undefined, opts: Options = {}): RiskAnalysis {
    const {
        dueSoonDays = 3,
        staleDays = 7,
        unassignedDays = 3,
        longOnHoldDays = 7,
        overloadThreshold = 5,
        scopeCreepThreshold = 1.5,
        now: nowOpt,
    } = opts;

    return useMemo(() => {
        const now = nowOpt ?? new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        if (!issues || issues.length === 0) {
            return {
                dueSoon: [], stale: [], unassigned: [], longOnHold: [], overload: [],
                scopeCreepRatio: 0, isScopeCreep: false, totalCount: 0,
            };
        }

        const onHoldName = resolveOnHoldStatus();
        const cancelledName = resolveCancelledStatus();
        const rejectedName = resolveRejectedStatus();

        const leaf = filterLeafIssues(issues);

        const isCompleted = (i: JiraIssue) => {
            if (getStatusCategoryKey(i) !== 'done') return false;
            const sn = i.fields.status?.name?.trim() ?? '';
            return sn !== cancelledName && sn !== rejectedName;
        };
        const isCancelled = (i: JiraIssue) => {
            const sn = i.fields.status?.name?.trim() ?? '';
            return sn === cancelledName || sn === rejectedName;
        };
        const isOnHold = (i: JiraIssue) => i.fields.status?.name?.trim() === onHoldName;
        const isInProgress = (i: JiraIssue) => getStatusCategoryKey(i) === 'indeterminate' && !isOnHold(i);

        // active = not done + not cancelled/rejected
        const active = leaf.filter((i) => !isCompleted(i) && !isCancelled(i));

        // ── 카드 1: 마감 임박 (D-N 이내, 미완료) ──
        const dueSoon: RiskItem[] = [];
        for (const i of active) {
            const due = parseLocalDay(i.fields.duedate ?? null);
            if (!due) continue;
            const daysToDue = Math.floor((due.getTime() - today) / DAY_MS);
            if (daysToDue >= 0 && daysToDue <= dueSoonDays) {
                dueSoon.push({ issue: i, meta: daysToDue === 0 ? 'D-0 (오늘)' : `D-${daysToDue}` });
            }
        }
        dueSoon.sort((a, b) => {
            const da = parseLocalDay(a.issue.fields.duedate ?? null)?.getTime() ?? Infinity;
            const db = parseLocalDay(b.issue.fields.duedate ?? null)?.getTime() ?? Infinity;
            return da - db;
        });

        // ── 카드 2: Stale (updated N일 무변동) ──
        const stale: RiskItem[] = [];
        for (const i of active) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updatedRaw = (i.fields as any).updated as string | undefined;
            const updated = parseLocalDay(updatedRaw ?? null) ?? parseLocalDay(i.fields.created ?? null);
            if (!updated) continue;
            const daysSince = Math.floor((today - updated.getTime()) / DAY_MS);
            if (daysSince >= staleDays) {
                stale.push({ issue: i, meta: `${daysSince}일 무변동` });
            }
        }
        stale.sort((a, b) => {
            const ma = parseInt(a.meta?.match(/\d+/)?.[0] ?? '0', 10);
            const mb = parseInt(b.meta?.match(/\d+/)?.[0] ?? '0', 10);
            return mb - ma;
        });

        // ── 카드 3: 미배정 방치 (created N일 초과 + assignee 없음) ──
        const unassigned: RiskItem[] = [];
        for (const i of active) {
            if (i.fields.assignee) continue;
            const created = parseLocalDay(i.fields.created ?? null);
            if (!created) continue;
            const daysSince = Math.floor((today - created.getTime()) / DAY_MS);
            if (daysSince >= unassignedDays) {
                unassigned.push({ issue: i, meta: `${daysSince}일 방치` });
            }
        }
        unassigned.sort((a, b) => {
            const ma = parseInt(a.meta?.match(/\d+/)?.[0] ?? '0', 10);
            const mb = parseInt(b.meta?.match(/\d+/)?.[0] ?? '0', 10);
            return mb - ma;
        });

        // ── 카드 4: 보류 장기 ──
        const longOnHold: RiskItem[] = [];
        for (const i of leaf) {
            if (!isOnHold(i)) continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updatedRaw = (i.fields as any).updated as string | undefined;
            const updated = parseLocalDay(updatedRaw ?? null) ?? parseLocalDay(i.fields.created ?? null);
            if (!updated) continue;
            const daysSince = Math.floor((today - updated.getTime()) / DAY_MS);
            if (daysSince >= longOnHoldDays) {
                longOnHold.push({ issue: i, meta: `${daysSince}일 보류` });
            }
        }
        longOnHold.sort((a, b) => {
            const ma = parseInt(a.meta?.match(/\d+/)?.[0] ?? '0', 10);
            const mb = parseInt(b.meta?.match(/\d+/)?.[0] ?? '0', 10);
            return mb - ma;
        });

        // ── 카드 5: 과부하 인원 (in-progress 5+) ──
        const inProgressByPerson = new Map<string, JiraIssue[]>();
        for (const i of leaf) {
            if (!isInProgress(i)) continue;
            const name = i.fields.assignee?.displayName ?? UNASSIGNED_LABEL;
            if (!inProgressByPerson.has(name)) inProgressByPerson.set(name, []);
            inProgressByPerson.get(name)!.push(i);
        }
        const overload: OverloadPerson[] = [];
        for (const [name, list] of inProgressByPerson) {
            if (list.length >= overloadThreshold) {
                overload.push({ displayName: name, inProgress: list.length, issues: list });
            }
        }
        overload.sort((a, b) => b.inProgress - a.inProgress);

        // ── 카드 6: Scope creep (최근 7일 신규/완료 비율) ──
        const SEVEN_DAYS = 7;
        const since = today - SEVEN_DAYS * DAY_MS;
        let recentCreated = 0;
        let recentCompleted = 0;
        for (const i of leaf) {
            const created = parseLocalDay(i.fields.created ?? null);
            if (created && created.getTime() >= since) recentCreated++;
            if (isCompleted(i)) {
                const done = parseLocalDay(i.fields.resolutiondate ?? null);
                if (done && done.getTime() >= since) recentCompleted++;
            }
        }
        const scopeCreepRatio = recentCompleted > 0
            ? +(recentCreated / recentCompleted).toFixed(2)
            : (recentCreated > 0 ? Infinity : 0);
        const isScopeCreep = scopeCreepRatio > scopeCreepThreshold && recentCreated > 0;

        const totalCount =
            dueSoon.length +
            stale.length +
            unassigned.length +
            longOnHold.length +
            overload.length +
            (isScopeCreep ? 1 : 0);

        return {
            dueSoon, stale, unassigned, longOnHold, overload,
            scopeCreepRatio, isScopeCreep, totalCount,
        };
    }, [issues, dueSoonDays, staleDays, unassignedDays, longOnHoldDays, overloadThreshold, scopeCreepThreshold, nowOpt]);
}
