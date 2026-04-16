import { type JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues } from '@/lib/jira-helpers';
import { DEFECT_KPI_CONFIG } from '@/config/defectKpiConfig';
import { UNASSIGNED_LABEL, UNKNOWN_LABEL } from '@/lib/jira-constants';

export interface DefectKpiDeveloperRow {
    /** personKey — account 우선 */
    key: string;
    displayName: string;
    /** 매핑된 개발 에픽 하위 리프 이슈 중 담당자(assignee) 기준 건수 */
    devIssueCount: number;
    /** 매핑된 결함 에픽 하위 리프 중「작업자」가 해당인원인 결함 등록 건수(전체) */
    defectCount: number;
    /** 결함 건수 ÷ 담당 개발 이슈 × 100, 개발 이슈 0건이면 null */
    defectRatePercent: number | null;
    /** 결함 심각도(커스텀 필드) 값별 건수 — 우선순위와 무관 */
    severityBreakdown: Array<{ name: string; count: number }>;
    grade: 'S' | 'A' | 'B' | 'C' | 'D' | '—';
}

function norm(s: string): string {
    return s.trim().toLowerCase();
}

/** 담당자·작업자 공통 키 (accountId 우선) — K8: UNASSIGNED_LABEL 상수 사용 */
export function personKeyFromAssignee(issue: JiraIssue): { key: string; label: string } {
    const a = issue.fields.assignee;
    if (!a) return { key: '__unassigned__', label: UNASSIGNED_LABEL };
    const id = 'accountId' in a && typeof a.accountId === 'string' ? a.accountId.trim() : '';
    if (id) return { key: `id:${id}`, label: a.displayName || id };
    return { key: `n:${norm(a.displayName || '')}`, label: a.displayName || UNKNOWN_LABEL };
}

export function extractWorkerPerson(
    issue: JiraIssue,
    workerFieldId: string
): { key: string; label: string } | null {
    const raw = issue.fields[workerFieldId] as unknown;
    if (raw == null) return null;

    if (typeof raw === 'string' && raw.trim()) {
        const label = raw.trim();
        return { key: `n:${norm(label)}`, label };
    }

    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        const o = raw as { accountId?: string; displayName?: string };
        const id = typeof o.accountId === 'string' ? o.accountId.trim() : '';
        const dn = typeof o.displayName === 'string' ? o.displayName.trim() : '';
        if (id) return { key: `id:${id}`, label: dn || id };
        if (dn) return { key: `n:${norm(dn)}`, label: dn };
    }

    if (Array.isArray(raw) && raw.length > 0) {
        const first = raw[0] as { accountId?: string; displayName?: string };
        if (first && typeof first === 'object') {
            const id = typeof first.accountId === 'string' ? first.accountId.trim() : '';
            const dn = typeof first.displayName === 'string' ? first.displayName.trim() : '';
            if (id) return { key: `id:${id}`, label: dn || id };
            if (dn) return { key: `n:${norm(dn)}`, label: dn };
        }
    }

    return null;
}

/** /field 에서「결함 심각도」필드 id를 찾지 못한 경우 집계용 라벨 */
export const DEFECT_SEVERITY_UNRESOLVED_FIELD = '(결함 심각도 필드 미연결)';

/** 이슈에 커스텀 값이 비어 있는 경우 */
export const DEFECT_SEVERITY_EMPTY = '(결함 심각도 없음)';

function optionLikeToString(o: Record<string, unknown>): string {
    const v = o.value;
    if (typeof v === 'string' && v.trim()) return v.trim();
    const n = o.name;
    if (typeof n === 'string' && n.trim()) return n.trim();
    const dn = o.displayName;
    if (typeof dn === 'string' && dn.trim()) return dn.trim();
    return '';
}

/**
 * Jira 이슈 **주요 세부 정보의「결함 심각도」커스텀 필드**만 사용합니다.
 * 우선순위(priority)는 사용하지 않습니다.
 */
export function extractDefectSeverityLabel(
    issue: JiraIssue,
    severityFieldId: string | undefined
): string {
    if (!severityFieldId) {
        return DEFECT_SEVERITY_UNRESOLVED_FIELD;
    }

    const raw = issue.fields[severityFieldId] as unknown;
    if (raw == null || raw === '') {
        return DEFECT_SEVERITY_EMPTY;
    }
    if (typeof raw === 'string') {
        const t = raw.trim();
        return t || DEFECT_SEVERITY_EMPTY;
    }
    if (typeof raw === 'number' || typeof raw === 'boolean') {
        return String(raw);
    }

    if (Array.isArray(raw)) {
        const parts: string[] = [];
        for (const item of raw) {
            if (item == null) continue;
            if (typeof item === 'string' && item.trim()) {
                parts.push(item.trim());
            } else if (typeof item === 'object' && !Array.isArray(item)) {
                const s = optionLikeToString(item as Record<string, unknown>);
                if (s) parts.push(s);
            }
        }
        if (parts.length > 0) {
            return [...new Set(parts)].join(', ');
        }
        return DEFECT_SEVERITY_EMPTY;
    }

    if (typeof raw === 'object' && raw !== null) {
        const o = raw as Record<string, unknown>;
        const child = o.child;
        const parent = optionLikeToString(o);
        if (child && typeof child === 'object' && !Array.isArray(child)) {
            const c = optionLikeToString(child as Record<string, unknown>);
            if (parent && c) return `${parent} › ${c}`;
            if (c) return c;
        }
        if (parent) return parent;
    }

    return DEFECT_SEVERITY_EMPTY;
}

import { useKpiRulesStore, getDefectGradeFromRules } from '../stores/kpiRulesStore';

/**
 * 결함 등급 산정 — store 규칙 참조 (PM이 설정에서 편집 가능).
 * store 초기화 전에는 기본값으로 fallback.
 */
export function defectRateToGrade(rate: number): 'S' | 'A' | 'B' | 'C' | 'D' {
    try {
        const defectGrades = useKpiRulesStore.getState().rules.defectGrades;
        return getDefectGradeFromRules(rate, defectGrades);
    } catch {
        // fallback
        if (rate <= 5) return 'S';
        if (rate <= 10) return 'A';
        if (rate <= 15) return 'B';
        if (rate <= 20) return 'C';
        return 'D';
    }
}

export function sortSeverityBreakdown(
    counts: Map<string, number>,
    order: readonly string[] = DEFECT_KPI_CONFIG.SEVERITY_DISPLAY_ORDER
): Array<{ name: string; count: number }> {
    const normOrder = order.map((x) => norm(String(x)));
    const metaRank = (name: string) => {
        if (name === DEFECT_SEVERITY_UNRESOLVED_FIELD) return 30000;
        return 0;
    };
    return [...counts.entries()]
        .filter(([, c]) => c > 0)
        .sort((a, b) => {
            const ma = metaRank(a[0]);
            const mb = metaRank(b[0]);
            if (ma !== mb) return ma - mb;
            const ia = normOrder.indexOf(norm(a[0]));
            const ib = normOrder.indexOf(norm(b[0]));
            const ra = ia === -1 ? 10000 : ia;
            const rb = ib === -1 ? 10000 : ib;
            if (ra !== rb) return ra - rb;
            if (b[1] !== a[1]) return b[1] - a[1];
            return a[0].localeCompare(b[0], 'ko');
        })
        .map(([name, count]) => ({ name, count }));
}

/**
 * 단일 매핑 쌍에 대한 담당자별 개발 이슈 수·결함 건수·심각도 분포·비율·등급.
 */
export function aggregateDefectKpiForPair(
    devIssues: JiraIssue[],
    defectIssues: JiraIssue[],
    workerFieldId: string,
    severityFieldId: string | undefined
): DefectKpiDeveloperRow[] {
    const devLeaf = filterLeafIssues(devIssues);
    const devByPerson = new Map<string, { label: string; count: number }>();
    for (const issue of devLeaf) {
        const { key, label } = personKeyFromAssignee(issue);
        const prev = devByPerson.get(key) ?? { label, count: 0 };
        devByPerson.set(key, { label: prev.label || label, count: prev.count + 1 });
    }

    const defectLeaf = filterLeafIssues(defectIssues);
    const defectsByPerson = new Map<
        string,
        { label: string; count: number; severity: Map<string, number> }
    >();
    for (const issue of defectLeaf) {
        const worker = extractWorkerPerson(issue, workerFieldId);
        if (!worker) continue;
        const sevLabel = extractDefectSeverityLabel(issue, severityFieldId);
        const prev = defectsByPerson.get(worker.key) ?? {
            label: worker.label,
            count: 0,
            severity: new Map<string, number>(),
        };
        prev.count += 1;
        prev.severity.set(sevLabel, (prev.severity.get(sevLabel) ?? 0) + 1);
        defectsByPerson.set(worker.key, {
            label: prev.label || worker.label,
            count: prev.count,
            severity: prev.severity,
        });
    }

    const keys = new Set<string>([...devByPerson.keys(), ...defectsByPerson.keys()]);

    const rows: DefectKpiDeveloperRow[] = [];
    for (const key of keys) {
        const devN = devByPerson.get(key)?.count ?? 0;
        const defAgg = defectsByPerson.get(key);
        const defectN = defAgg?.count ?? 0;
        const label = devByPerson.get(key)?.label ?? defAgg?.label ?? key;

        const severityBreakdown = defAgg
            ? sortSeverityBreakdown(defAgg.severity)
            : [];

        let defectRatePercent: number | null = null;
        let grade: DefectKpiDeveloperRow['grade'] = '—';
        if (devN > 0) {
            defectRatePercent = Math.round((defectN / devN) * 1000) / 10;
            grade = defectRateToGrade(defectRatePercent);
        } else if (defectN > 0) {
            grade = 'D';
        }

        rows.push({
            key,
            displayName: label,
            devIssueCount: devN,
            defectCount: defectN,
            defectRatePercent,
            severityBreakdown,
            grade,
        });
    }

    rows.sort(
        (a, b) => b.defectCount - a.defectCount || a.displayName.localeCompare(b.displayName, 'ko')
    );
    return rows;
}

/**
 * 여러 매핑 쌍 결과를 담당자 기준으로 합산.
 *
 * **⚠️ 사전조건**: 동일 dev 에픽이 여러 매핑에 등장하면 dev 카운트가 이중 합산됩니다.
 * 호출자(`useDefectKpiAggregation` → `useEpicMappingStore.addMapping`)에서 dev 에픽 중복을
 * 막아야 하며, 현재 store는 'dev-already-mapped' 거부로 이를 보장합니다.
 */
export function mergeDefectKpiRows(pairRowsList: DefectKpiDeveloperRow[][]): DefectKpiDeveloperRow[] {
    const map = new Map<
        string,
        {
            displayName: string;
            devIssueCount: number;
            defectCount: number;
            severity: Map<string, number>;
        }
    >();

    for (const rows of pairRowsList) {
        for (const r of rows) {
            const prev = map.get(r.key) ?? {
                displayName: r.displayName,
                devIssueCount: 0,
                defectCount: 0,
                severity: new Map<string, number>(),
            };
            for (const { name, count } of r.severityBreakdown) {
                prev.severity.set(name, (prev.severity.get(name) ?? 0) + count);
            }
            map.set(r.key, {
                displayName: r.displayName || prev.displayName,
                devIssueCount: prev.devIssueCount + r.devIssueCount,
                defectCount: prev.defectCount + r.defectCount,
                severity: prev.severity,
            });
        }
    }

    const merged: DefectKpiDeveloperRow[] = [];
    for (const [key, agg] of map) {
        let defectRatePercent: number | null = null;
        let grade: DefectKpiDeveloperRow['grade'] = '—';
        if (agg.devIssueCount > 0) {
            defectRatePercent =
                Math.round((agg.defectCount / agg.devIssueCount) * 1000) / 10;
            grade = defectRateToGrade(defectRatePercent);
        } else if (agg.defectCount > 0) {
            grade = 'D';
        }
        merged.push({
            key,
            displayName: agg.displayName,
            devIssueCount: agg.devIssueCount,
            defectCount: agg.defectCount,
            defectRatePercent,
            severityBreakdown: sortSeverityBreakdown(agg.severity),
            grade,
        });
    }

    merged.sort(
        (a, b) => b.defectCount - a.defectCount || a.displayName.localeCompare(b.displayName, 'ko')
    );
    return merged;
}

export function resolveFieldIdByNames(
    fields: Array<{ id: string; name: string }>,
    names: readonly string[]
): string | undefined {
    const set = new Set(names.map((n) => n.trim()).filter(Boolean));
    if (set.size === 0) return undefined;
    const found = fields.find((f) => f.name && set.has(f.name.trim()));
    return found?.id;
}

export function resolveWorkerFieldId(
    fields: Array<{ id: string; name: string }>,
    names: readonly string[] = DEFECT_KPI_CONFIG.WORKER_FIELD_NAMES
): string | undefined {
    return resolveFieldIdByNames(fields, names);
}

export function resolveDefectSeverityFieldId(
    fields: Array<{ id: string; name: string }>,
    names: readonly string[] = DEFECT_KPI_CONFIG.DEFECT_SEVERITY_FIELD_NAMES
): string | undefined {
    const exact = resolveFieldIdByNames(fields, names);
    if (exact) return exact;
    const found = fields.find((f) => {
        const n = (f.name ?? '').replace(/\s+/g, '');
        return n.includes('결함') && n.includes('심각도');
    });
    return found?.id;
}
