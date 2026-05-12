/**
 * v1.0.33: 매니저 콘솔 - 예산 시뮬레이터 사용자 설정.
 *   - headcount: 가정 인원수
 *   - utilization: 실작업 비율 (0~1)
 *   - mdRateKRW: 1 인일 단가 (한국 IT 평균 ~ 100만원/인일, 회사별 차이)
 *   - aiToolMonthlyCostKRW: AI 도구 월 비용 (사용자 1인당)
 *   - aiToolUserCount: AI 도구 활용 인원수
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface BudgetSimulatorState {
    headcount: number;
    utilization: number;
    /** 1 인일 단가 (KRW). default 100만원 */
    mdRateKRW: number;
    /** AI 도구 월 비용 (KRW, 사용자 1인당). default 5만원 (Cursor Pro 등) */
    aiToolMonthlyCostKRW: number;
    /** AI 도구 활용 인원수. default headcount와 동일 */
    aiToolUserCount: number;
    setHeadcount: (v: number) => void;
    setUtilization: (v: number) => void;
    setMdRate: (v: number) => void;
    setAiToolMonthlyCost: (v: number) => void;
    setAiToolUserCount: (v: number) => void;
    resetToDefaults: () => void;
}

export const DEFAULT_HEADCOUNT = 5;
export const DEFAULT_UTILIZATION = 0.65;
export const DEFAULT_MD_RATE = 1_000_000;       // 1 인일 100만원 (한국 IT 평균)
export const DEFAULT_AI_TOOL_COST = 50_000;     // 1인당 월 5만원 (Cursor Pro 등)
export const DEFAULT_AI_USER_COUNT = 5;

export const useBudgetSimulatorStore = create<BudgetSimulatorState>()(
    persist(
        (set) => ({
            headcount: DEFAULT_HEADCOUNT,
            utilization: DEFAULT_UTILIZATION,
            mdRateKRW: DEFAULT_MD_RATE,
            aiToolMonthlyCostKRW: DEFAULT_AI_TOOL_COST,
            aiToolUserCount: DEFAULT_AI_USER_COUNT,
            setHeadcount: (v) => set({ headcount: Math.max(1, Math.min(100, Math.round(v))) }),
            setUtilization: (v) => set({ utilization: Math.max(0.1, Math.min(1.0, v)) }),
            setMdRate: (v) => set({ mdRateKRW: Math.max(0, v) }),
            setAiToolMonthlyCost: (v) => set({ aiToolMonthlyCostKRW: Math.max(0, v) }),
            setAiToolUserCount: (v) => set({ aiToolUserCount: Math.max(0, Math.round(v)) }),
            resetToDefaults: () =>
                set({
                    headcount: DEFAULT_HEADCOUNT,
                    utilization: DEFAULT_UTILIZATION,
                    mdRateKRW: DEFAULT_MD_RATE,
                    aiToolMonthlyCostKRW: DEFAULT_AI_TOOL_COST,
                    aiToolUserCount: DEFAULT_AI_USER_COUNT,
                }),
        }),
        {
            name: 'jira-dash-budget-simulator',
            storage: createJSONStorage(() =>
                typeof window !== 'undefined' && window.localStorage
                    ? window.localStorage
                    : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
            ),
        }
    )
);
