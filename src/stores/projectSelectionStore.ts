import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { JIRA_CONFIG } from '@/config/jiraConfig';

interface ProjectSelectionState {
    selectedProjectKey: string;
    setSelectedProjectKey: (key: string) => void;
}

/**
 * 진행 추이/예측 탭 — 프로젝트 선택 영속 스토어.
 * default = JIRA_CONFIG.DASHBOARD.PROJECT_KEY.
 */
export const useProjectSelectionStore = create<ProjectSelectionState>()(
    persist(
        (set) => ({
            selectedProjectKey: JIRA_CONFIG.DASHBOARD.PROJECT_KEY,
            setSelectedProjectKey: (key) => set({ selectedProjectKey: key.trim().toUpperCase() }),
        }),
        {
            name: 'jira-dash-project-selection',
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
