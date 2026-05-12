import { useCallback } from 'react';
import { TrendingUp, RotateCcw, DollarSign } from 'lucide-react';
import { InfoTip } from '@/components/ui/info-tip';
import {
    useBudgetSimulatorStore,
    DEFAULT_MD_RATE,
    DEFAULT_AI_TOOL_COST,
    DEFAULT_AI_USER_COUNT,
} from '@/stores/budgetSimulatorStore';
import { useAiSavingsConfigStore } from '@/stores/aiSavingsConfigStore';
import { aggregateAiSavings } from '@/services/prediction/aiSavingsEstimation';
import { BUSINESS_DAYS_PER_MONTH } from '@/services/prediction/types';
import type { BacklogEffortReport } from '@/services/prediction/types';

interface Props {
    report: BacklogEffortReport | null;
}

function formatKRW(amount: number): string {
    if (amount >= 1_0000_0000) return `${(amount / 1_0000_0000).toFixed(2)}억원`;
    if (amount >= 1_0000) return `${(amount / 1_0000).toFixed(0)}만원`;
    return `${amount.toLocaleString('ko-KR')}원`;
}

export function AiRoiCalculator({ report }: Props) {
    const config = useAiSavingsConfigStore((s) => s.config);

    const mdRate = useBudgetSimulatorStore((s) => s.mdRateKRW);
    const aiCost = useBudgetSimulatorStore((s) => s.aiToolMonthlyCostKRW);
    const userCount = useBudgetSimulatorStore((s) => s.aiToolUserCount);
    const setMdRate = useBudgetSimulatorStore((s) => s.setMdRate);
    const setAiCost = useBudgetSimulatorStore((s) => s.setAiToolMonthlyCost);
    const setUserCount = useBudgetSimulatorStore((s) => s.setAiToolUserCount);
    const headcount = useBudgetSimulatorStore((s) => s.headcount);
    const utilization = useBudgetSimulatorStore((s) => s.utilization);

    // v1.0.33 fix: 이전 버전은 selector 안에서 매 렌더마다 새 함수를 반환해 무한 렌더 발생.
    // useCallback으로 안정적인 참조 유지.
    const reset = useCallback(() => {
        setMdRate(DEFAULT_MD_RATE);
        setAiCost(DEFAULT_AI_TOOL_COST);
        setUserCount(DEFAULT_AI_USER_COUNT);
    }, [setMdRate, setAiCost, setUserCount]);

    if (!report || report.totalManDaysMid === 0) {
        return (
            <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    AI 도구 ROI 계산기
                </h3>
                <p className="mt-3 text-sm text-muted-foreground">활성 백로그가 없습니다.</p>
            </div>
        );
    }

    const ai = aggregateAiSavings(report, config);

    // 백로그 완료까지 캘린더 일수 (current 시뮬레이터 가정)
    const teamDays = report.totalManDaysMid / Math.max(0.1, headcount * utilization);
    const teamMonths = teamDays / BUSINESS_DAYS_PER_MONTH;

    // 시나리오별 ROI
    const calcRoi = (savedManDays: number) => {
        const savings = savedManDays * mdRate;
        const totalAiCost = aiCost * userCount * teamMonths;
        const netGain = savings - totalAiCost;
        const roiPct = totalAiCost > 0 ? (netGain / totalAiCost) * 100 : 0;
        return { savings, totalAiCost, netGain, roiPct };
    };

    const conservative = calcRoi(ai.scenarios.conservative.savedManDaysMid);
    const average = calcRoi(ai.scenarios.average.savedManDaysMid);
    const optimistic = calcRoi(ai.scenarios.optimistic.savedManDaysMid);

    return (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    AI 도구 ROI 계산기
                    <InfoTip>
                        <div className="space-y-2 max-w-sm">
                            <div className="font-semibold text-foreground text-sm">AI 도구 ROI (Return on Investment) 계산</div>
                            <p className="text-muted-foreground">
                                AI 시뮬레이션의 절감 인일을 금액으로 환산하고, AI 도구 구독 비용과 비교하여 순효과·ROI%를 산정.
                                도구 도입 의사결정의 핵심 데이터.
                            </p>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">📐 산정 공식</div>
                                <div className="text-[11px] text-muted-foreground font-mono bg-muted/40 p-1.5 rounded">
                                    절감액 = AI 절감 인일 × MD 단가<br/>
                                    도구 비용 = 월 비용 × 사용자 수 × 프로젝트 기간(월)<br/>
                                    순효과 = 절감액 - 도구 비용<br/>
                                    ROI% = (순효과 / 도구 비용) × 100<br/>
                                    프로젝트 기간 = 백로그 완료 캘린더 월수
                                </div>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">💵 입력 항목 의미</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li><strong>MD 단가</strong>: 1 인일(1명 8시간 작업)의 가치
                                        <ul className="list-disc pl-4 mt-0.5">
                                            <li>한국 IT 평균 80~150만원/MD (2025 기준)</li>
                                            <li>외주 기준: 100~200만원/MD</li>
                                            <li>회사 기본급+복지+간접비 환산</li>
                                        </ul>
                                    </li>
                                    <li><strong>AI 도구 월 비용 (1인당)</strong>: 구독료
                                        <ul className="list-disc pl-4 mt-0.5">
                                            <li>Cursor Pro / GitHub Copilot ~ 2~3만원/월</li>
                                            <li>Claude Pro ~ 3만원/월</li>
                                            <li>기업용 라이선스 ~ 5~10만원/월</li>
                                        </ul>
                                    </li>
                                    <li><strong>사용자 수</strong>: AI 도구를 실제 사용할 인원 (전 팀 X 가능)</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">🎯 ROI 해석</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>ROI 100% = 순효과가 비용과 동일 (2배 성과)</li>
                                    <li>ROI 500% = 비용 1원당 5원 가치</li>
                                    <li>ROI 1000%+ = 압도적 효과 (보통 AI 도구의 평균)</li>
                                    <li>ROI &lt; 0% = 비용 &gt; 절감 = 손해 (희귀)</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">⚠️ 한계 및 주의</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>절감 인일 = AI 시뮬레이션 추정치 (±20%)</li>
                                    <li>도입 비용 (학습 시간, 도구 셋업) 미반영</li>
                                    <li>품질 향상·번아웃 감소 등 정성 효과 미반영</li>
                                    <li>임원 보고에는 <strong>평균 시나리오</strong> 사용 권장</li>
                                    <li>한국 표준 단가 → 회사별 실제 단가로 조정 필요</li>
                                </ul>
                            </div>
                        </div>
                    </InfoTip>
                </h3>
                <button
                    type="button"
                    onClick={reset}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    title="기본값 복원"
                >
                    <RotateCcw className="h-3 w-3" />
                    기본값
                </button>
            </div>

            {/* 입력 영역 */}
            <div className="space-y-2 bg-muted/40 p-3 rounded border border-border/60">
                <div className="grid grid-cols-3 gap-2">
                    <div>
                        <label className="text-[11px] text-foreground/80 inline-flex items-center gap-1 mb-1">
                            <DollarSign className="h-3 w-3" />
                            MD 단가 (원)
                            <InfoTip size="sm">
                                <div className="space-y-1.5 max-w-xs">
                                    <div className="font-semibold text-foreground">1 인일 단가</div>
                                    <p className="text-muted-foreground text-xs">
                                        1명이 하루 8시간 작업한 가치 (KRW). 회사 기본급·복지·간접비 합산.
                                    </p>
                                    <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                        <li>중급 개발자 ~ 80만원/MD</li>
                                        <li>시니어 개발자 ~ 120만원/MD</li>
                                        <li>외주 단가 ~ 100~200만원/MD</li>
                                        <li>대기업 평균 ~ 150만원/MD</li>
                                    </ul>
                                </div>
                            </InfoTip>
                        </label>
                        <input
                            type="number"
                            value={mdRate}
                            onChange={(e) => setMdRate(Number(e.target.value))}
                            min={0}
                            step={100_000}
                            className="w-full text-xs px-2 py-1 border border-border rounded bg-card text-foreground tabular-nums"
                        />
                        <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                            = {formatKRW(mdRate)}
                        </div>
                    </div>
                    <div>
                        <label className="text-[11px] text-foreground/80 inline-flex items-center gap-1 mb-1">
                            도구 월 비용/인 (원)
                            <InfoTip size="sm">
                                <div className="space-y-1.5 max-w-xs">
                                    <div className="font-semibold text-foreground">AI 도구 월 비용 (1인당)</div>
                                    <p className="text-muted-foreground text-xs">
                                        AI 도구 구독료 (1명당 월 비용, KRW).
                                    </p>
                                    <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                        <li>GitHub Copilot ~ 2.5만원/월</li>
                                        <li>Cursor Pro ~ 3만원/월</li>
                                        <li>Claude Pro ~ 3만원/월</li>
                                        <li>Claude Code ~ 가격 다양</li>
                                        <li>기업용 라이선스 ~ 5~10만원/월</li>
                                    </ul>
                                </div>
                            </InfoTip>
                        </label>
                        <input
                            type="number"
                            value={aiCost}
                            onChange={(e) => setAiCost(Number(e.target.value))}
                            min={0}
                            step={10_000}
                            className="w-full text-xs px-2 py-1 border border-border rounded bg-card text-foreground tabular-nums"
                        />
                        <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                            = {formatKRW(aiCost)}
                        </div>
                    </div>
                    <div>
                        <label className="text-[11px] text-foreground/80 inline-flex items-center gap-1 mb-1">
                            사용자 수
                            <InfoTip size="sm">
                                <div className="space-y-1.5 max-w-xs">
                                    <div className="font-semibold text-foreground">AI 도구 사용자 수</div>
                                    <p className="text-muted-foreground text-xs">
                                        실제 도구를 사용할 인원수. 전 팀 X 가능 (예: 개발팀만, 시니어만).
                                    </p>
                                    <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                        <li>현재 팀 인원: {headcount}명 (시뮬레이터)</li>
                                        <li>예: 개발자만 사용 → 디자이너 제외</li>
                                        <li>예: 시범 운영 → 일부 인원만</li>
                                    </ul>
                                </div>
                            </InfoTip>
                        </label>
                        <input
                            type="number"
                            value={userCount}
                            onChange={(e) => setUserCount(Number(e.target.value))}
                            min={0}
                            max={100}
                            step={1}
                            className="w-full text-xs px-2 py-1 border border-border rounded bg-card text-foreground tabular-nums"
                        />
                        <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                            = 월 {formatKRW(aiCost * userCount)}
                        </div>
                    </div>
                </div>
            </div>

            {/* 결과 — 3 시나리오 */}
            <div className="grid grid-cols-3 gap-2">
                {[
                    { key: 'conservative', label: '보수', data: conservative, savedMD: ai.scenarios.conservative.savedManDaysMid, color: 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40' },
                    { key: 'average', label: '평균 (권장)', data: average, savedMD: ai.scenarios.average.savedManDaysMid, color: 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 ring-2 ring-blue-400 dark:ring-blue-600 ring-offset-1 ring-offset-card' },
                    { key: 'optimistic', label: '낙관', data: optimistic, savedMD: ai.scenarios.optimistic.savedManDaysMid, color: 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40' },
                ].map(({ key, label, data, savedMD, color }) => (
                    <div key={key} className={`rounded border p-2.5 ${color}`}>
                        <div className="text-[11px] font-medium text-foreground/80 text-center">{label}</div>
                        <div className="mt-1.5 space-y-1 text-[11px]">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">절감</span>
                                <span className="tabular-nums font-semibold text-foreground">{savedMD.toFixed(1)} MD</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">절감액</span>
                                <span className="tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">+{formatKRW(data.savings)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">도구 비용</span>
                                <span className="tabular-nums text-amber-600 dark:text-amber-400">-{formatKRW(data.totalAiCost)}</span>
                            </div>
                            <div className="border-t border-border/50 pt-1 flex justify-between">
                                <span className="font-medium text-foreground/90">순효과</span>
                                <span className={`tabular-nums font-bold ${data.netGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {data.netGain >= 0 ? '+' : ''}{formatKRW(data.netGain)}
                                </span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                                <span className="text-muted-foreground">ROI</span>
                                <span className={`tabular-nums font-semibold ${data.roiPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {data.roiPct >= 0 ? '+' : ''}{data.roiPct.toFixed(0)}%
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="text-[11px] text-muted-foreground bg-muted/40 px-2 py-1.5 rounded border border-border/60">
                💡 프로젝트 기간 가정: <strong>{teamMonths.toFixed(1)}개월</strong> (백로그 {report.totalManDaysMid.toFixed(0)} MD ÷ {headcount}명 ÷ {Math.round(utilization * 100)}% util ÷ 20).
                예산 시뮬레이터의 인원/utilization과 연동.
            </div>
        </div>
    );
}
