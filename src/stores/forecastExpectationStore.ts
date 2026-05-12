/**
 * v1.0.36: 이슈별 예측 정확도 추적.
 *
 * 이전 v1.0.35의 snapshot 기반 (50~100건 한꺼번에 추적)은 IGMU 같은 큰 백로그에서
 * snapshot 모두 done까지 6개월+ 걸려 사실상 작동 X.
 *
 * 새 방식: 각 이슈가 처음 활성으로 발견된 시점에 그 시점의 P50/P85/P95 약속 기록.
 * 이슈 done 시점에 실제 영업일 측정. 매 이슈마다 1 데이터 포인트 → 빠른 calibration.
 *
 * 정직성: 5건 미만이면 'insufficient'.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface IssueExpectation {
    issueKey: string;
    projectKey: string;
    /** 처음 활성으로 발견한 시점 (ISO timestamp) */
    firstSeenAt: string;
    /** 발견 시점의 forecast P50 (영업일) */
    p50Days: number;
    /** 발견 시점의 forecast P85 (영업일) — 약속 기준 */
    p85Days: number;
    /** 발견 시점의 forecast P95 (영업일) */
    p95Days: number;
    /** 발견 시점의 처리량 변동계수 (calibration 분석용) */
    teamCV: number;
    /** done 처리된 시점 (ISO). null이면 아직 진행 중. */
    completedAt: string | null;
    /** 실제 소요 영업일. null이면 아직 진행 중. */
    actualDays: number | null;
}

interface ForecastExpectationState {
    expectations: Record<string, IssueExpectation>;
    /** 신규 활성 이슈들에 대해 일괄로 expectation 등록 (이미 존재하는 키는 건너뜀) */
    recordExpectations: (
        keys: string[],
        common: Omit<IssueExpectation, 'issueKey' | 'completedAt' | 'actualDays'>
    ) => void;
    /** 신규 done 이슈들에 대해 일괄로 actualDays 기록 (expectation 없거나 이미 완료된 건 건너뜀) */
    markIssuesCompleted: (
        completions: Array<{ issueKey: string; completedAt: string; actualDays: number }>
    ) => void;
    /** 90일 이상 done된 + 5000건 초과 정리 */
    pruneStale: () => void;
    clear: () => void;
}

const MAX_EXPECTATIONS = 5000;
const MAX_AGE_DAYS = 90;

export const useForecastExpectationStore = create<ForecastExpectationState>()(
    persist(
        (set) => ({
            expectations: {},
            recordExpectations: (keys, common) => {
                set((s) => {
                    const next = { ...s.expectations };
                    let changed = false;
                    for (const key of keys) {
                        if (next[key]) continue; // 이미 추적 중
                        next[key] = {
                            issueKey: key,
                            projectKey: common.projectKey,
                            firstSeenAt: common.firstSeenAt,
                            p50Days: common.p50Days,
                            p85Days: common.p85Days,
                            p95Days: common.p95Days,
                            teamCV: common.teamCV,
                            completedAt: null,
                            actualDays: null,
                        };
                        changed = true;
                    }
                    return changed ? { expectations: next } : s;
                });
            },
            markIssuesCompleted: (completions) => {
                set((s) => {
                    const next = { ...s.expectations };
                    let changed = false;
                    for (const { issueKey, completedAt, actualDays } of completions) {
                        const exp = next[issueKey];
                        if (!exp) continue; // expectation 없음 (legacy)
                        if (exp.completedAt !== null) continue; // 이미 완료
                        next[issueKey] = { ...exp, completedAt, actualDays };
                        changed = true;
                    }
                    return changed ? { expectations: next } : s;
                });
            },
            pruneStale: () => {
                const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
                set((s) => {
                    const filtered: Record<string, IssueExpectation> = {};
                    let changed = false;
                    for (const [k, exp] of Object.entries(s.expectations)) {
                        // 90일 이상 done된 것 정리
                        if (exp.completedAt) {
                            const t = new Date(exp.completedAt).getTime();
                            if (t < cutoff) {
                                changed = true;
                                continue;
                            }
                        }
                        filtered[k] = exp;
                    }
                    // 5000건 초과 시 oldest firstSeenAt 정리
                    const entries = Object.entries(filtered);
                    if (entries.length > MAX_EXPECTATIONS) {
                        entries.sort(
                            ([, a], [, b]) =>
                                new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime()
                        );
                        const trimmed = entries.slice(0, MAX_EXPECTATIONS);
                        return { expectations: Object.fromEntries(trimmed) };
                    }
                    // v1.0.46 fix (M1): 변경 없으면 원본 반환 — 불필요한 리렌더 회피 (Zustand shallow equality)
                    return changed ? { expectations: filtered } : s;
                });
            },
            clear: () => set({ expectations: {} }),
        }),
        {
            name: 'jira-dash-forecast-expectations',
            storage: createJSONStorage(() =>
                typeof window !== 'undefined' && window.localStorage
                    ? window.localStorage
                    : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
            ),
        }
    )
);
