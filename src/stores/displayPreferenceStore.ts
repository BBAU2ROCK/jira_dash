import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';

interface DisplayPreferenceState {
    /** 익명화 모드: 인원명을 'A/B/C...' alias로 대체. 외부 공유·스크린샷 시 안전. */
    anonymizeMode: boolean;
    setAnonymizeMode: (v: boolean) => void;
    toggleAnonymizeMode: () => void;

    /** v1.0.21: 테마 — 'system'은 OS 설정 따라감 */
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
    /** light → dark → system → light 순환 */
    cycleTheme: () => void;
}

export const useDisplayPreferenceStore = create<DisplayPreferenceState>()(
    persist(
        (set, get) => ({
            anonymizeMode: false,
            setAnonymizeMode: (v) => set({ anonymizeMode: v }),
            toggleAnonymizeMode: () => set({ anonymizeMode: !get().anonymizeMode }),

            // v1.0.27: default 'dark' (전 'system')
            theme: 'dark',
            setTheme: (theme) => set({ theme }),
            cycleTheme: () => {
                const order: ThemeMode[] = ['light', 'dark', 'system'];
                const cur = get().theme;
                const next = order[(order.indexOf(cur) + 1) % order.length];
                set({ theme: next });
            },
        }),
        {
            name: 'jira-dash-display-preference',
            storage: createJSONStorage(() =>
                typeof window !== 'undefined' && window.localStorage
                    ? window.localStorage
                    : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
            ),
            // v1.0.50: theme(v1.0.21 추가) 누락 시 'dark' 백필
            version: 1,
            migrate: (persistedState: unknown, _oldVersion: number) => {
                const s = (persistedState ?? {}) as Partial<DisplayPreferenceState>;
                return {
                    ...s,
                    anonymizeMode: s.anonymizeMode ?? false,
                    theme: s.theme ?? 'dark',
                };
            },
        }
    )
);

/**
 * 테마 적용 — document.documentElement.classList 조작.
 * App 부팅 + theme 변경 시 호출.
 *
 * 'system'이면 prefers-color-scheme 미디어 쿼리 따라감.
 * 다른 테마는 명시적으로 'dark' / 'light' 클래스 부여 ('.dark' selector 활성화).
 */
export function applyTheme(theme: ThemeMode): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const isDark =
        theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', isDark);
    // 메타 theme-color 동기화 (브라우저 chrome bar 색)
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.setAttribute('content', isDark ? '#0f172a' : '#ffffff');
    }
}
