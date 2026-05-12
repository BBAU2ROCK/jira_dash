import React from 'react';
import { Sparkles, RotateCcw, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { useAiSavingsConfigStore } from '@/stores/aiSavingsConfigStore';
import { aggregateAiSavings, CATEGORY_LABEL } from '@/services/prediction/aiSavingsEstimation';
import type {
    BacklogEffortReport,
    AiSavingsScenario,
    IssueCategory,
    ConfidenceLevel,
} from '@/services/prediction/types';

const CONFIDENCE_BADGE: Record<ConfidenceLevel, { label: string; color: string }> = {
    high:        { label: '높음',     color: 'bg-green-100 text-green-800 dark:text-green-300 border-green-200 dark:border-green-900/60' },
    medium:      { label: '중간',     color: 'bg-blue-100 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-900/60' },
    low:         { label: '낮음',     color: 'bg-amber-100 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/60' },
    unreliable:  { label: '데이터 부족', color: 'bg-red-100 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900/60' },
};

interface ScenarioMeta {
    label: string;
    color: string;
    tipTitle: string;
    tipBody: React.ReactNode;
}

const SCENARIO_META: Record<AiSavingsScenario, ScenarioMeta> = {
    conservative: {
        label: '보수적',
        color: 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40',
        tipTitle: '보수적 시나리오 (평균 -10%pt)',
        tipBody: (
            <>
                <p className="text-muted-foreground">
                    AI 도구를 도입한 지 얼마 안 되어 팀이 적응 중인 단계. 또는 도메인 복잡도가 높아 AI 도움이 제한적인 환경.
                </p>
                <ul className="list-disc pl-4 space-y-0.5 mt-1.5">
                    <li>모든 카테고리 절감률에서 -10%pt 차감</li>
                    <li>예: Story 35% → 25%, Test 50% → 40%</li>
                    <li>적용 권장: 도구 도입 초기 3~6개월</li>
                    <li>의미: "최소한 이 정도는 절감 가능" 의 lower bound</li>
                </ul>
            </>
        ),
    },
    average: {
        label: '평균',
        color: 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40',
        tipTitle: '평균 시나리오 (권장 약속)',
        tipBody: (
            <>
                <p className="text-muted-foreground">
                    업계 평균 데이터 기준. 외부 보고·임원 약속에 사용 권장.
                </p>
                <ul className="list-disc pl-4 space-y-0.5 mt-1.5">
                    <li>GitHub Copilot 2023 연구: 26~46% 생산성 향상</li>
                    <li>Cursor / Claude Code 사용자 조사: 30~40% 평균</li>
                    <li>슬라이더에서 직접 조정한 값이 이 시나리오</li>
                    <li>보수~낙관 사이가 ±20% 신뢰구간으로 작용</li>
                </ul>
            </>
        ),
    },
    optimistic: {
        label: '낙관',
        color: 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40',
        tipTitle: '낙관 시나리오 (평균 +15%pt)',
        tipBody: (
            <>
                <p className="text-muted-foreground">
                    숙련된 팀이 정형화된 작업 위주로 진행하고, AI 도구가 기존 워크플로에 잘 통합된 환경.
                </p>
                <ul className="list-disc pl-4 space-y-0.5 mt-1.5">
                    <li>모든 카테고리 절감률에서 +15%pt 가산</li>
                    <li>예: Story 35% → 50%, Test 50% → 65%</li>
                    <li>최대 절감률 80% cap 적용 (cap 80% 초과 X)</li>
                    <li>의미: "최선의 경우 이 정도까지 가능" 의 upper bound</li>
                    <li>주의: 임원 약속에는 평균 시나리오 사용 권장</li>
                </ul>
            </>
        ),
    },
};

interface CategoryTip {
    title: string;
    body: React.ReactNode;
}

const CATEGORY_TIPS: Record<IssueCategory, CategoryTip> = {
    story: {
        title: 'Story (신규 개발) — 평균 35%',
        body: (
            <>
                <p className="text-muted-foreground">신규 기능 개발 작업. 비즈니스 로직 + UI + 테스트 통합.</p>
                <ul className="list-disc pl-4 space-y-0.5 mt-1.5">
                    <li>매칭 키워드: Story, 스토리, Task, 할 일</li>
                    <li>업계 데이터: Copilot 26~46% (평균 35%)</li>
                    <li>난이도 보정: 상 ×0.7 / 중 ×1.0 / 하 ×1.2</li>
                    <li>설계는 AI 도움 ↓, 구현은 ↑ → 평균값으로 균형</li>
                </ul>
            </>
        ),
    },
    bug: {
        title: 'Bug (버그 수정) — 평균 25%',
        body: (
            <>
                <p className="text-muted-foreground">버그 수정 작업. 디버깅 + 원인 분석 + 패치.</p>
                <ul className="list-disc pl-4 space-y-0.5 mt-1.5">
                    <li>매칭 키워드: Bug, 결함, Defect, Error</li>
                    <li>도메인·기존 코드 이해 필요 → AI 효과 제한적</li>
                    <li>패치 자체는 AI 도움 가능, 원인 진단은 사람 영역</li>
                    <li>보수적 추정 25%로 설정 (Story 35%보다 낮음)</li>
                </ul>
            </>
        ),
    },
    subtask: {
        title: 'Sub-task (하위 작업) — 평균 40%',
        body: (
            <>
                <p className="text-muted-foreground">잘 분할된 작업 단위. 정형화·반복 패턴 多.</p>
                <ul className="list-disc pl-4 space-y-0.5 mt-1.5">
                    <li>매칭 키워드: Sub-task, Subtask, 하위, 하위 작업</li>
                    <li>스코프가 명확하므로 AI 효과 큰 편</li>
                    <li>CRUD·반복 패턴·boilerplate 위주</li>
                    <li>매칭 우선: 'task'를 포함하지만 sub 매칭이 우선</li>
                </ul>
            </>
        ),
    },
    test: {
        title: 'Test (테스트 코드) — 평균 50%',
        body: (
            <>
                <p className="text-muted-foreground">단위 테스트 / 통합 테스트 / E2E 테스트 작성.</p>
                <ul className="list-disc pl-4 space-y-0.5 mt-1.5">
                    <li>매칭 키워드: Test, 테스트, QA, qa</li>
                    <li>AI 도구 가장 강한 영역 (case 자동 생성)</li>
                    <li>패턴이 정형화되어 있고 검증 가능</li>
                    <li>edge case 추출도 AI 활용 효과 큼</li>
                    <li>주의: 시나리오 설계는 사람 영역</li>
                </ul>
            </>
        ),
    },
    doc: {
        title: 'Documentation (문서) — 평균 45%',
        body: (
            <>
                <p className="text-muted-foreground">README, API 문서, 주석, 릴리즈 노트, 사용자 가이드.</p>
                <ul className="list-disc pl-4 space-y-0.5 mt-1.5">
                    <li>매칭 키워드: Doc, Documentation, 문서, manual</li>
                    <li>자연어 생성 = LLM의 핵심 강점</li>
                    <li>코드 → 문서 자동 추출 가능</li>
                    <li>번역·한영 변환도 AI 효과 ↑</li>
                    <li>최종 검수·일관성은 사람 필요</li>
                </ul>
            </>
        ),
    },
    default: {
        title: '기타 (분류 불명) — 평균 30%',
        body: (
            <>
                <p className="text-muted-foreground">위 5개 카테고리에 매칭되지 않은 작업.</p>
                <ul className="list-disc pl-4 space-y-0.5 mt-1.5">
                    <li>매칭 키워드 외의 모든 타입 (예: Spike, Research, ...)</li>
                    <li>보수적 fallback (평균 35%보다 낮음)</li>
                    <li>업계 평균 30% (Copilot lower bound 26%와 유사)</li>
                </ul>
            </>
        ),
    },
};

interface Props {
    report: BacklogEffortReport | null;
}

export function AiSavingsCard({ report }: Props) {
    const config = useAiSavingsConfigStore((s) => s.config);
    const categoryKeywords = useAiSavingsConfigStore((s) => s.categoryKeywords);
    const setCategoryReduction = useAiSavingsConfigStore((s) => s.setCategoryReduction);
    const resetToDefaults = useAiSavingsConfigStore((s) => s.resetToDefaults);
    const [expanded, setExpanded] = React.useState(false);

    if (!report || report.perIssue.length === 0) return null;

    // v1.0.46 (M7): 사용자 정의 categoryKeywords 사용 — 커스텀 이슈 타입 지원
    const ai = aggregateAiSavings(report, config, { categoryKeywords });
    const baseManDays = report.totalManDaysMid;
    const baseManMonths = report.totalManMonthsMid;
    const confBadge = CONFIDENCE_BADGE[ai.confidence];

    return (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            {/* 헤더 */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    AI 도구 활용 시뮬레이션
                    <InfoTip>
                        <div className="space-y-2 max-w-sm">
                            <div className="font-semibold text-foreground text-sm">AI 도구 절감 시뮬레이션 산정 방법</div>
                            <p className="text-muted-foreground">
                                백로그 각 이슈에 대해 (카테고리 절감률) × (난이도 보정) 적용하여 절감 시간 산출.
                                3 시나리오로 신뢰구간 표시.
                            </p>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">📊 산정 공식</div>
                                <div className="text-[11px] text-muted-foreground font-mono bg-muted/40 p-1.5 rounded">
                                    절감률 = base[category] × multiplier[difficulty]<br/>
                                    절감 시간 = 이슈 시간 × 절감률<br/>
                                    AI 후 시간 = 이슈 시간 - 절감 시간<br/>
                                    cap: 절감률은 [0%, 80%] 범위
                                </div>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">📚 업계 데이터 출처</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>GitHub Copilot 2023 사용자 연구 (Cornell 등)<br/>→ 코드 작성에서 26~46% 생산성 향상</li>
                                    <li>Cursor / Claude Code 사용자 조사 (2024-2025)<br/>→ 평균 30~40% 시간 절감</li>
                                    <li>도구별 차이 무시 (단순 통합 추정)</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">⚠️ 한계 및 주의</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>실제 효과는 ±20% 변동 가능</li>
                                    <li>팀 숙련도·도구 통합도·작업 특성 영향 큼</li>
                                    <li>최대 80% cap (지나친 낙관 방지)</li>
                                    <li>백로그 10건 미만 → 신뢰도 unreliable</li>
                                    <li>worklog 데이터 적으면 신뢰도 저하</li>
                                    <li>임원 보고에는 <strong>평균 시나리오</strong> 사용 권장</li>
                                </ul>
                            </div>
                        </div>
                    </InfoTip>
                </h3>
                <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', confBadge.color)}>
                    {confBadge.label}
                </span>
            </div>

            {/* 결과 — 3 시나리오 */}
            <div className="space-y-2">
                <div className="text-xs text-muted-foreground">
                    기존 산정: <span className="font-semibold text-foreground tabular-nums">{baseManDays.toFixed(1)} MD</span> / <span className="font-semibold text-foreground tabular-nums">{baseManMonths.toFixed(2)} MM</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {(['conservative', 'average', 'optimistic'] as AiSavingsScenario[]).map((scenario) => {
                        const s = ai.scenarios[scenario];
                        const meta = SCENARIO_META[scenario];
                        const isAverage = scenario === 'average';
                        return (
                            <div
                                key={scenario}
                                className={cn(
                                    'rounded border p-2 text-center',
                                    meta.color,
                                    isAverage && 'ring-2 ring-blue-400 dark:ring-blue-600 ring-offset-1 ring-offset-card'
                                )}
                            >
                                <div className="text-[11px] font-medium text-foreground/80 inline-flex items-center gap-1 justify-center">
                                    {meta.label}
                                    <InfoTip size="sm">
                                        <div className="space-y-1.5 max-w-xs">
                                            <div className="font-semibold text-foreground">{meta.tipTitle}</div>
                                            {meta.tipBody}
                                        </div>
                                    </InfoTip>
                                </div>
                                <div className="mt-1 text-base font-bold tabular-nums text-foreground">
                                    {s.afterManDaysMid.toFixed(1)} MD
                                </div>
                                <div className="text-[11px] text-muted-foreground tabular-nums">
                                    {s.afterManMonthsMid.toFixed(2)} MM
                                </div>
                                <div className={cn('mt-1 text-xs font-semibold tabular-nums',
                                    s.avgReductionPct >= 30 ? 'text-emerald-600 dark:text-emerald-400' :
                                    s.avgReductionPct >= 15 ? 'text-blue-600 dark:text-blue-400' :
                                    'text-muted-foreground'
                                )}>
                                    -{s.avgReductionPct}%
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                    절감 {s.savedManDaysMid.toFixed(1)} MD
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="text-[11px] text-muted-foreground bg-muted/40 px-2 py-1.5 rounded border border-border/60">
                    💡 권장 약속은 <span className="font-medium text-blue-600">평균 시나리오</span>. 보수~낙관 사이가 ±20% 신뢰구간.
                </div>
            </div>

            {/* 펼침 버튼 */}
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-center justify-center gap-1 text-xs text-blue-600 hover:underline py-1"
            >
                {expanded ? '접기' : '카테고리별 절감률 조정 / 분해 보기'}
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {expanded && (
                <div className="space-y-3 border-t border-border pt-3">
                    {/* 카테고리별 슬라이더 */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-foreground inline-flex items-center gap-1">
                                카테고리별 평균 절감률
                                <InfoTip>
                                    <div className="space-y-2 max-w-sm">
                                        <div className="font-semibold text-foreground">카테고리별 절감률 슬라이더</div>
                                        <p className="text-muted-foreground text-xs">
                                            슬라이더 값은 <strong>평균 시나리오</strong>의 카테고리별 절감률.
                                            팀 환경·도구·작업 특성에 맞게 조정.
                                        </p>
                                        <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                            <li>범위: 0% ~ 80% (5%p 단위)</li>
                                            <li>저장: 브라우저 localStorage (`aiSavingsConfigStore`)</li>
                                            <li>적용: 즉시 — 위쪽 3 시나리오 카드에 즉시 반영</li>
                                            <li>보수 시나리오: 슬라이더값 -10%pt 자동 산출</li>
                                            <li>낙관 시나리오: 슬라이더값 +15%pt 자동 산출</li>
                                            <li>난이도 보정: 슬라이더값 × {`{상×0.7, 중×1.0, 하×1.2}`}</li>
                                            <li>최종 cap: [0%, 80%] (지나친 낙관 방지)</li>
                                        </ul>
                                        <div className="border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">
                                            💡 [기본값] 버튼: 사내 데이터로 변경한 슬라이더를 업계 평균값으로 복원.
                                        </div>
                                    </div>
                                </InfoTip>
                            </h4>
                            <button
                                type="button"
                                onClick={resetToDefaults}
                                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                                title="기본값 복원"
                            >
                                <RotateCcw className="h-3 w-3" />
                                기본값
                            </button>
                        </div>
                        <div className="space-y-1.5">
                            {(['story', 'bug', 'subtask', 'test', 'doc', 'default'] as IssueCategory[]).map((cat) => {
                                const value = config.reductionByCategory[cat];
                                return (
                                    <div key={cat} className="flex items-center gap-2 text-xs">
                                        <span className="w-32 shrink-0 inline-flex items-center gap-1">
                                            <span className="text-foreground/90">{CATEGORY_LABEL[cat]}</span>
                                            <InfoTip size="sm">
                                                <div className="space-y-1.5 max-w-xs">
                                                    <div className="font-semibold text-foreground">{CATEGORY_TIPS[cat].title}</div>
                                                    {CATEGORY_TIPS[cat].body}
                                                </div>
                                            </InfoTip>
                                        </span>
                                        <input
                                            type="range"
                                            min={0}
                                            max={0.8}
                                            step={0.05}
                                            value={value}
                                            onChange={(e) => setCategoryReduction(cat, Number(e.target.value))}
                                            className="flex-1 accent-blue-500 cursor-pointer"
                                        />
                                        <span className="w-12 shrink-0 text-right tabular-nums font-mono text-foreground/90">
                                            {Math.round(value * 100)}%
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 카테고리별 분해 표 */}
                    {ai.byCategory.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold text-foreground mb-1.5 inline-flex items-center gap-1">
                                카테고리별 분해 (평균 시나리오)
                                <InfoTip size="sm">
                                    <div className="space-y-1.5 max-w-xs">
                                        <div className="font-semibold text-foreground">카테고리별 분해 표</div>
                                        <p className="text-muted-foreground text-xs">
                                            평균 시나리오 기준, 백로그 이슈를 타입별로 분류 후 카테고리당 합계.
                                        </p>
                                        <div className="text-[11px] text-muted-foreground space-y-1">
                                            <div><strong className="text-foreground/90">건수</strong>: 카테고리에 속한 활성 이슈 수</div>
                                            <div><strong className="text-foreground/90">기존</strong>: AI 미사용 시 인일(MD) 합계</div>
                                            <div><strong className="text-foreground/90">AI 후</strong>: 평균 시나리오 적용 후 인일 합계</div>
                                            <div><strong className="text-foreground/90">절감</strong>: 기존 - AI 후 (인일)</div>
                                            <div><strong className="text-foreground/90">비율</strong>: 절감 / 기존 × 100% (가중 평균, 난이도 보정 포함)</div>
                                        </div>
                                        <div className="border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">
                                            정렬: 절감 인일 큰 순. 효과 큰 카테고리부터 우선 도구 적용 검토.
                                        </div>
                                    </div>
                                </InfoTip>
                            </h4>
                            <div className="overflow-x-auto rounded border border-border/60">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/40 border-b border-border">
                                        <tr>
                                            <th scope="col" className="px-2 py-1 text-left font-medium text-foreground/80">카테고리</th>
                                            <th scope="col" className="px-2 py-1 text-right font-medium text-foreground/80">건수</th>
                                            <th scope="col" className="px-2 py-1 text-right font-medium text-foreground/80">기존</th>
                                            <th scope="col" className="px-2 py-1 text-right font-medium text-foreground/80">AI 후</th>
                                            <th scope="col" className="px-2 py-1 text-right font-medium text-foreground/80">절감</th>
                                            <th scope="col" className="px-2 py-1 text-right font-medium text-foreground/80">비율</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {ai.byCategory.map((row) => (
                                            <tr key={row.category} className="hover:bg-muted/30">
                                                <td className="px-2 py-1 text-foreground/90">{row.label}</td>
                                                <td className="px-2 py-1 text-right tabular-nums">{row.count}</td>
                                                <td className="px-2 py-1 text-right tabular-nums">{row.baseManDays.toFixed(1)} MD</td>
                                                <td className="px-2 py-1 text-right tabular-nums font-semibold">{row.afterManDays.toFixed(1)} MD</td>
                                                <td className="px-2 py-1 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                                                    -{row.savedManDays.toFixed(1)} MD
                                                </td>
                                                <td className="px-2 py-1 text-right tabular-nums">-{row.reductionPct}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Top 5 효과 이슈 */}
                    {ai.topImpactIssues.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold text-foreground mb-1.5 inline-flex items-center gap-1">
                                효과 큰 이슈 Top {ai.topImpactIssues.length}
                                <InfoTip size="sm">
                                    <div className="space-y-1.5 max-w-xs">
                                        <div className="font-semibold text-foreground">Top 5 효과 이슈</div>
                                        <p className="text-muted-foreground text-xs">
                                            평균 시나리오 기준, 절감 시간(인시) 큰 순서로 백로그에서 추출한 5건.
                                        </p>
                                        <div className="text-[11px] text-muted-foreground space-y-1">
                                            <div><strong className="text-foreground/90">활용 사례</strong>:</div>
                                            <ul className="list-disc pl-4 space-y-0.5">
                                                <li>그루밍 회의: 이 이슈들부터 AI 도구 적용 시범 운영</li>
                                                <li>예산 검토: AI 도구 비용 대비 절감 효과 큰 작업 우선</li>
                                                <li>스프린트 계획: 효과 큰 이슈를 다음 스프린트에 배치</li>
                                            </ul>
                                        </div>
                                        <div className="border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">
                                            키 클릭 → Jira 새 탭 열림. 행 우측의 -% 는 적용된 절감률.
                                        </div>
                                    </div>
                                </InfoTip>
                            </h4>
                            <ul className="space-y-1 text-xs">
                                {ai.topImpactIssues.map((s) => (
                                    <li key={s.issueKey} className="flex items-center gap-2 px-2 py-1 rounded bg-muted/30 hover:bg-muted/50">
                                        <a
                                            href={`https://okestro.atlassian.net/browse/${s.issueKey}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-mono text-blue-600 hover:underline shrink-0 inline-flex items-center gap-0.5"
                                        >
                                            {s.issueKey}
                                            <ExternalLink className="h-2.5 w-2.5" />
                                        </a>
                                        <span className="flex-1 truncate text-foreground/90" title={s.summary}>
                                            {s.summary}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                            {CATEGORY_LABEL[s.category].split(' ')[0]}
                                        </span>
                                        <span className="tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0 font-semibold">
                                            -{(s.savedHours / 8).toFixed(1)} MD
                                        </span>
                                        <span className="tabular-nums text-muted-foreground shrink-0 w-10 text-right">
                                            -{Math.round(s.appliedReduction * 100)}%
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
