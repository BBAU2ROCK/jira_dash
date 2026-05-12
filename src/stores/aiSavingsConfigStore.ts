/**
 * v1.0.32: AI 절감률 사용자 설정 — 카테고리별 슬라이더 값 persist.
 * 매니저가 팀 환경에 맞게 절감률 조정 가능.
 *
 * v1.0.46 (M7): categoryKeywords 추가 — 사용자가 카테고리별 매칭 키워드 추가/수정 가능.
 *   기본값(DEFAULT_CATEGORY_KEYWORDS)로 초기화, 사용자가 회사별 커스텀 이슈 타입 등록 가능.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
    DEFAULT_REDUCTION_BY_CATEGORY,
    DEFAULT_DIFFICULTY_MULTIPLIER,
    DEFAULT_CATEGORY_KEYWORDS,
    type CategoryKeywords,
} from '@/services/prediction/aiSavingsEstimation';
import type { AiSavingsConfig, IssueCategory } from '@/services/prediction/types';

interface AiSavingsConfigState {
    config: AiSavingsConfig;
    /** v1.0.46 (M7): 카테고리 매칭 키워드 — 사용자 정의 가능 */
    categoryKeywords: CategoryKeywords;
    /** 카테고리 절감률 변경 (0~1) */
    setCategoryReduction: (category: IssueCategory, value: number) => void;
    /** v1.0.46 (M7): 카테고리 키워드 변경 (배열 통째로 교체) */
    setCategoryKeywords: (category: Exclude<IssueCategory, 'default'>, keywords: string[]) => void;
    /** 기본값 복원 (절감률 + 키워드 모두) */
    resetToDefaults: () => void;
}

export const useAiSavingsConfigStore = create<AiSavingsConfigState>()(
    persist(
        (set) => ({
            config: {
                reductionByCategory: { ...DEFAULT_REDUCTION_BY_CATEGORY },
                difficultyMultiplier: { ...DEFAULT_DIFFICULTY_MULTIPLIER },
            },
            categoryKeywords: {
                test:    [...DEFAULT_CATEGORY_KEYWORDS.test],
                doc:     [...DEFAULT_CATEGORY_KEYWORDS.doc],
                bug:     [...DEFAULT_CATEGORY_KEYWORDS.bug],
                subtask: [...DEFAULT_CATEGORY_KEYWORDS.subtask],
                story:   [...DEFAULT_CATEGORY_KEYWORDS.story],
            },
            setCategoryReduction: (category, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        reductionByCategory: {
                            ...state.config.reductionByCategory,
                            [category]: Math.max(0, Math.min(0.8, value)),
                        },
                    },
                })),
            setCategoryKeywords: (category, keywords) =>
                set((state) => ({
                    categoryKeywords: {
                        ...state.categoryKeywords,
                        // 공백 제거 + 빈 문자열 필터 + 중복 제거 + 소문자 정규화
                        [category]: [...new Set(
                            keywords
                                .map((k) => k.trim().toLowerCase())
                                .filter((k) => k.length > 0)
                        )],
                    },
                })),
            resetToDefaults: () =>
                set({
                    config: {
                        reductionByCategory: { ...DEFAULT_REDUCTION_BY_CATEGORY },
                        difficultyMultiplier: { ...DEFAULT_DIFFICULTY_MULTIPLIER },
                    },
                    categoryKeywords: {
                        test:    [...DEFAULT_CATEGORY_KEYWORDS.test],
                        doc:     [...DEFAULT_CATEGORY_KEYWORDS.doc],
                        bug:     [...DEFAULT_CATEGORY_KEYWORDS.bug],
                        subtask: [...DEFAULT_CATEGORY_KEYWORDS.subtask],
                        story:   [...DEFAULT_CATEGORY_KEYWORDS.story],
                    },
                }),
        }),
        {
            name: 'jira-dash-ai-savings-config',
            storage: createJSONStorage(() =>
                typeof window !== 'undefined' && window.localStorage
                    ? window.localStorage
                    : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
            ),
        }
    )
);
