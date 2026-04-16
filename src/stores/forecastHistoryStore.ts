import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ForecastRecord {
    id: string;
    projectKey: string;
    /** ISO timestamp */
    recordedAt: string;
    p50Days: number;
    p85Days: number;
    p95Days: number;
    /** 기록 시점의 잔여 이슈 수 */
    remainingAtTime: number;
    /** 기록 시점의 처리량 통계 (calibration 분석용) */
    teamCV: number;
    teamMean: number;
    activeDays: number;
    /** 백로그가 0건이 됐을 때 채워짐 */
    actualCompletionDate: string | null;
    /** 실제 완료 시점의 잔여 (보통 0) */
    actualRemaining: number | null;
}

interface ForecastHistoryState {
    records: ForecastRecord[];
    addRecord: (rec: Omit<ForecastRecord, 'id' | 'actualCompletionDate' | 'actualRemaining'>) => void;
    /** 백로그 0건 감지 시 호출 — 미완료 기록에 actual* 채움 */
    markCompleted: (projectKey: string, completionDate: string) => void;
    /** 90일 이상·1000건 초과 정리 */
    pruneStale: () => void;
    clear: () => void;
}

const MAX_RECORDS = 1000;
const MAX_AGE_DAYS = 90;

function newId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `f-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export const useForecastHistoryStore = create<ForecastHistoryState>()(
    persist(
        (set, get) => ({
            records: [],
            addRecord: (rec) => {
                const newRec: ForecastRecord = {
                    ...rec,
                    id: newId(),
                    actualCompletionDate: null,
                    actualRemaining: null,
                };
                const records = [newRec, ...get().records].slice(0, MAX_RECORDS);
                set({ records });
            },
            markCompleted: (projectKey, completionDate) => {
                set((s) => ({
                    records: s.records.map((r) =>
                        r.projectKey === projectKey && r.actualCompletionDate === null
                            ? { ...r, actualCompletionDate: completionDate, actualRemaining: 0 }
                            : r
                    ),
                }));
            },
            pruneStale: () => {
                const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
                set((s) => ({
                    records: s.records.filter((r) => new Date(r.recordedAt).getTime() >= cutoff),
                }));
            },
            clear: () => set({ records: [] }),
        }),
        {
            name: 'jira-dash-forecast-history',
            storage: createJSONStorage(() =>
                typeof window !== 'undefined' && window.localStorage
                    ? window.localStorage
                    : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
            ),
        }
    )
);
