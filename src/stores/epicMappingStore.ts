import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DevDefectEpicMapping {
    id: string;
    devEpicKey: string;
    defectEpicKey: string;
}

function newMappingId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `m-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

interface EpicMappingState {
    mappings: DevDefectEpicMapping[];
    addMapping: (devEpicKey: string, defectEpicKey: string) => void;
    removeMapping: (id: string) => void;
    updateMapping: (id: string, patch: Partial<Pick<DevDefectEpicMapping, 'devEpicKey' | 'defectEpicKey'>>) => void;
}

export const useEpicMappingStore = create<EpicMappingState>()(
    persist(
        (set) => ({
            mappings: [],
            addMapping: (devEpicKey, defectEpicKey) =>
                set((s) => ({
                    mappings: [
                        ...s.mappings,
                        {
                            id: newMappingId(),
                            devEpicKey: devEpicKey.trim().toUpperCase(),
                            defectEpicKey: defectEpicKey.trim().toUpperCase(),
                        },
                    ],
                })),
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
                                      ? { devEpicKey: patch.devEpicKey.trim().toUpperCase() }
                                      : {}),
                                  ...('defectEpicKey' in patch && patch.defectEpicKey != null
                                      ? { defectEpicKey: patch.defectEpicKey.trim().toUpperCase() }
                                      : {}),
                              }
                    ),
                })),
        }),
        { name: 'jira-dash-epic-mappings' }
    )
);
