import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface DisplayPreferenceState {
    /** 익명화 모드: 인원명을 'A/B/C...' alias로 대체. 외부 공유·스크린샷 시 안전. */
    anonymizeMode: boolean;
    setAnonymizeMode: (v: boolean) => void;
    toggleAnonymizeMode: () => void;
}

export const useDisplayPreferenceStore = create<DisplayPreferenceState>()(
    persist(
        (set, get) => ({
            anonymizeMode: false,
            setAnonymizeMode: (v) => set({ anonymizeMode: v }),
            toggleAnonymizeMode: () => set({ anonymizeMode: !get().anonymizeMode }),
        }),
        {
            name: 'jira-dash-display-preference',
            storage: createJSONStorage(() =>
                typeof window !== 'undefined' && window.localStorage
                    ? window.localStorage
                    : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
            ),
        }
    )
);
