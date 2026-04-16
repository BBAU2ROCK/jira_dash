/**
 * Cycle Time per Issue Type 정밀 분석.
 *
 * 정의:
 *   - **Active Cycle Time** = changelog에서 'in progress' 첫 진입 → 'done' 완료 시간
 *   - **Total Lead Time** = created → done (단순 cycle time, 블로커 포함)
 *   - **Wait Time** = total - active (블로커·리뷰 대기 시간 추정)
 *
 * 한계: changelog는 이슈당 별도 fetch 필요. sampling 50개로 제한.
 *
 * Phase 0 측정 결과 worklog 0%인 IPCON 같은 환경에서 가장 정밀한 신호.
 */

import { differenceInHours } from 'date-fns';
import type { JiraIssue } from '@/api/jiraClient';
import { parseLocalDay } from '@/lib/date-utils';

export interface CycleTimeStats {
    type: string;
    sampleSize: number;
    /** active cycle time 평균 (시간) */
    activeMeanH: number;
    /** P50 active cycle time */
    activeP50H: number;
    /** P85 active cycle time */
    activeP85H: number;
    /** 단순 lead time 평균 */
    leadMeanH: number;
    /** wait ratio = (lead - active) / lead — 블로커·대기 비중 */
    waitRatio: number;
}

const IN_PROGRESS_STATUSES = new Set(['In Progress', '진행 중', '진행중', 'in progress']);
const DONE_STATUSES = new Set(['Done', '완료', 'done', 'Closed', 'Resolved']);

function isInProgressStatus(s: string | undefined): boolean {
    if (!s) return false;
    return IN_PROGRESS_STATUSES.has(s.trim());
}
function isDoneStatus(s: string | undefined): boolean {
    if (!s) return false;
    return DONE_STATUSES.has(s.trim());
}

/**
 * changelog에서 active cycle time(시간) 추출. 없거나 추정 불가 시 null.
 */
export function extractActiveCycleHours(issue: JiraIssue): number | null {
    const histories = issue.changelog?.histories;
    if (!histories || histories.length === 0) return null;
    let firstInProgressAt: Date | null = null;
    let doneAt: Date | null = null;
    for (const h of histories) {
        const created = parseLocalDay(h.created);
        if (!created) continue;
        for (const item of h.items) {
            if (item.field !== 'status') continue;
            if (!firstInProgressAt && isInProgressStatus(item.toString)) {
                firstInProgressAt = created;
            }
            if (isDoneStatus(item.toString)) {
                doneAt = created;
            }
        }
    }
    if (!firstInProgressAt || !doneAt) return null;
    if (doneAt < firstInProgressAt) return null;
    return Math.max(differenceInHours(doneAt, firstInProgressAt), 1);
}

function leadTimeHours(issue: JiraIssue): number | null {
    const created = parseLocalDay(issue.fields.created);
    const done = parseLocalDay(issue.fields.resolutiondate ?? null);
    if (!created || !done || done < created) return null;
    return Math.max(differenceInHours(done, created), 1);
}

function percentileH(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

/**
 * 이슈 type별 cycle time 통계 산출.
 *
 * @param issuesWithChangelog 이미 changelog가 fetch된 완료 이슈 (sampling 권장).
 *                            changelog 없는 이슈는 lead time만 계산됨.
 */
export function computeCycleTimeByType(issuesWithChangelog: JiraIssue[]): CycleTimeStats[] {
    const grouped = new Map<string, { actives: number[]; leads: number[] }>();
    for (const issue of issuesWithChangelog) {
        const type = issue.fields.issuetype?.name ?? '(unknown)';
        const active = extractActiveCycleHours(issue);
        const lead = leadTimeHours(issue);
        const g = grouped.get(type) ?? { actives: [], leads: [] };
        if (active != null) g.actives.push(active);
        if (lead != null) g.leads.push(lead);
        grouped.set(type, g);
    }
    const result: CycleTimeStats[] = [];
    for (const [type, { actives, leads }] of grouped) {
        if (actives.length === 0 && leads.length === 0) continue;
        const activeMean = actives.length > 0 ? actives.reduce((a, b) => a + b, 0) / actives.length : 0;
        const leadMean = leads.length > 0 ? leads.reduce((a, b) => a + b, 0) / leads.length : 0;
        result.push({
            type,
            sampleSize: Math.max(actives.length, leads.length),
            activeMeanH: +activeMean.toFixed(1),
            activeP50H: +percentileH(actives, 50).toFixed(1),
            activeP85H: +percentileH(actives, 85).toFixed(1),
            leadMeanH: +leadMean.toFixed(1),
            waitRatio: leadMean > 0 && activeMean > 0 ? +((leadMean - activeMean) / leadMean).toFixed(2) : 0,
        });
    }
    return result.sort((a, b) => b.sampleSize - a.sampleSize);
}
