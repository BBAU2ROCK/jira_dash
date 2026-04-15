import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface DevDefectEpicMapping {
    id: string;
    devEpicKey: string;
    defectEpicKey: string;
}

export type AddMappingResult =
    | { ok: true; id: string }
    | { ok: false; reason: 'empty' | 'duplicate-pair' | 'dev-already-mapped' };

function newMappingId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `m-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeKey(s: string | null | undefined): string {
    return (s ?? '').trim().toUpperCase();
}

interface EpicMappingState {
    mappings: DevDefectEpicMapping[];
    /**
     * 매핑 추가. 다음 케이스는 거부:
     * - 빈 키 → 'empty'
     * - 동일 (dev, defect) 쌍 중복 → 'duplicate-pair'
     * - 동일 dev 에픽이 이미 다른 결함 에픽에 매핑됨 → 'dev-already-mapped'
     *   (결함 KPI 합산 시 dev 카운트 이중 합산을 막기 위해)
     */
    addMapping: (devEpicKey: string, defectEpicKey: string) => AddMappingResult;
    removeMapping: (id: string) => void;
    updateMapping: (
        id: string,
        patch: Partial<Pick<DevDefectEpicMapping, 'devEpicKey' | 'defectEpicKey'>>
    ) => void;
}

export const useEpicMappingStore = create<EpicMappingState>()(
    persist(
        (set, get) => ({
            mappings: [],
            addMapping: (devEpicKeyRaw, defectEpicKeyRaw) => {
                const dev = normalizeKey(devEpicKeyRaw);
                const def = normalizeKey(defectEpicKeyRaw);
                if (!dev || !def) return { ok: false, reason: 'empty' };

                const existing = get().mappings;
                if (existing.some((m) => m.devEpicKey === dev && m.defectEpicKey === def)) {
                    return { ok: false, reason: 'duplicate-pair' };
                }
                if (existing.some((m) => m.devEpicKey === dev)) {
                    return { ok: false, reason: 'dev-already-mapped' };
                }

                const id = newMappingId();
                set({
                    mappings: [...existing, { id, devEpicKey: dev, defectEpicKey: def }],
                });
                return { ok: true, id };
            },
            removeMapping: (id) =>
                set((s) => ({
                    mappings: s.mappings.filter((m) => m.id !== id),
                })),
            updateMapping: (id, patch) =>
                set((s) => ({
                    mappings: s.mappings.map((m) =>
                        m.id !== id
                            ? m
                            : {
                                  ...m,
                                  ...('devEpicKey' in patch && patch.devEpicKey != null
                                      ? { devEpicKey: normalizeKey(patch.devEpicKey) }
                                      : {}),
                                  ...('defectEpicKey' in patch && patch.defectEpicKey != null
                                      ? { defectEpicKey: normalizeKey(patch.defectEpicKey) }
                                      : {}),
                              }
                    ),
                })),
        }),
        {
            name: 'jira-dash-epic-mappings',
            storage: createJSONStorage(() =>
                typeof window !== 'undefined' && window.localStorage
                    ? window.localStorage
                    : {
                          getItem: () => null,
                          setItem: () => {},
                          removeItem: () => {},
                      }
            ),
        }
    )
);
