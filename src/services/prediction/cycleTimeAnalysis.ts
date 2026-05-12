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
import { percentile as percentileLinear } from '@/lib/statistics';

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

/**
 * v1.0.50 (H5): status name → statusCategoryKey 매핑 빌더.
 *
 * changelog의 history item에는 status name만 있고 category 정보가 없다.
 * 따라서 입력 이슈 집합 전체에서 현재 status name과 category 쌍을 수집해
 * cache로 사용한다. 사용자 워크플로우(영문/한글/커스텀)에 자동 적응.
 *
 * fallback (cache에 없는 status name): 알려진 영문/한글 명칭 휴리스틱.
 */
const KNOWN_IN_PROGRESS = new Set(['In Progress', '진행 중', '진행중', 'in progress', 'doing', '진행', '작업 중']);
const KNOWN_DONE = new Set(['Done', '완료', 'done', 'Closed', 'Resolved', '해결', '종료', '완료됨']);

type StatusCategoryKey = 'new' | 'indeterminate' | 'done';

function buildStatusCategoryMap(issues: JiraIssue[]): Map<string, StatusCategoryKey> {
    const map = new Map<string, StatusCategoryKey>();
    for (const i of issues) {
        const name = i.fields.status?.name?.trim();
        const cat = i.fields.status?.statusCategory?.key;
        if (name && (cat === 'new' || cat === 'indeterminate' || cat === 'done')) {
            map.set(name, cat as StatusCategoryKey);
        }
    }
    return map;
}

function classifyStatus(
    statusName: string | undefined,
    categoryMap: Map<string, StatusCategoryKey>
): StatusCategoryKey | null {
    if (!statusName) return null;
    const name = statusName.trim();
    const cached = categoryMap.get(name);
    if (cached) return cached;
    // fallback heuristics (워크플로우 못 본 경우)
    if (KNOWN_IN_PROGRESS.has(name)) return 'indeterminate';
    if (KNOWN_DONE.has(name)) return 'done';
    return null;
}

/**
 * changelog에서 active cycle time(시간) 추출. 없거나 추정 불가 시 null.
 *
 * @param issue              changelog 포함 이슈
 * @param categoryMap        status name → category 매핑 (computeCycleTimeByType이 빌드해 전달).
 *                           단독 호출 시 빈 Map 가능 (휴리스틱 fallback만 사용).
 */
export function extractActiveCycleHours(
    issue: JiraIssue,
    categoryMap: Map<string, StatusCategoryKey> = new Map()
): number | null {
    const histories = issue.changelog?.histories;
    if (!histories || histories.length === 0) return null;
    let firstInProgressAt: Date | null = null;
    let doneAt: Date | null = null;
    for (const h of histories) {
        const created = parseLocalDay(h.created);
        if (!created) continue;
        for (const item of h.items) {
            if (item.field !== 'status') continue;
            const cat = classifyStatus(item.toString, categoryMap);
            if (cat === 'indeterminate' && !firstInProgressAt) {
                firstInProgressAt = created;
            }
            if (cat === 'done') {
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

/**
 * v1.0.50 (C5): 로컬 nearest-rank percentile을 lib/statistics.percentile(linear, 0-1)로 통일.
 * 의미: P50은 정확한 중앙값, P85는 보간 추정. 통계 산출 일관성↑.
 */
function percentileH(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    return percentileLinear(sorted, p / 100);
}

/**
 * 이슈 type별 cycle time 통계 산출.
 *
 * @param issuesWithChangelog 이미 changelog가 fetch된 완료 이슈 (sampling 권장).
 *                            changelog 없는 이슈는 lead time만 계산됨.
 */
export function computeCycleTimeByType(issuesWithChangelog: JiraIssue[]): CycleTimeStats[] {
    // v1.0.50 (H5): status name → category 매핑을 입력 이슈에서 1회 빌드 (워크플로우 자동 학습)
    const categoryMap = buildStatusCategoryMap(issuesWithChangelog);
    const grouped = new Map<string, { actives: number[]; leads: number[] }>();
    for (const issue of issuesWithChangelog) {
        const type = issue.fields.issuetype?.name ?? '(unknown)';
        const active = extractActiveCycleHours(issue, categoryMap);
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
