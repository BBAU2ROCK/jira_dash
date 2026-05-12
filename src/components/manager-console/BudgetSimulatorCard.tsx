import { Calculator, RotateCcw, Calendar, Users } from 'lucide-react';
import { format } from 'date-fns';
import { addBusinessDays as addBizDays } from '@/lib/date-utils';
import { InfoTip } from '@/components/ui/info-tip';
import {
    useBudgetSimulatorStore,
    DEFAULT_HEADCOUNT,
    DEFAULT_UTILIZATION,
} from '@/stores/budgetSimulatorStore';
import { BUSINESS_DAYS_PER_MONTH } from '@/services/prediction/types';
import type { BacklogEffortReport } from '@/services/prediction/types';

interface Props {
    report: BacklogEffortReport | null;
}

export function BudgetSimulatorCard({ report }: Props) {
    const headcount = useBudgetSimulatorStore((s) => s.headcount);
    const utilization = useBudgetSimulatorStore((s) => s.utilization);
    const setHeadcount = useBudgetSimulatorStore((s) => s.setHeadcount);
    const setUtilization = useBudgetSimulatorStore((s) => s.setUtilization);
    const resetToDefaults = useBudgetSimulatorStore((s) => s.resetToDefaults);

    if (!report || report.totalManDaysMid === 0) {
        return (
            <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-orange-500" />
                    예산 시뮬레이터
                </h3>
                <p className="mt-3 text-sm text-muted-foreground">활성 백로그가 없습니다.</p>
            </div>
        );
    }

    const totalMD = report.totalManDaysMid;
    const totalMDLow = report.totalManDaysLow;
    const totalMDHigh = report.totalManDaysHigh;

    // 팀 캘린더 환산
    const teamCapacity = headcount * utilization;
    const teamDays = totalMD / Math.max(0.1, teamCapacity);
    const teamDaysLow = totalMDLow / Math.max(0.1, teamCapacity);
    const teamDaysHigh = totalMDHigh / Math.max(0.1, teamCapacity);
    const teamMonths = teamDays / BUSINESS_DAYS_PER_MONTH;

    // 시작일 = 오늘. 완료 예상일 = 오늘 + 영업일 ceil(teamDays)
    const today = new Date();
    const etaP50 = addBizDays(today, Math.ceil(teamDays));
    const etaP85 = addBizDays(today, Math.ceil(teamDaysHigh));

    // 현재 보고서 가정값과 변경 차이
    const baseHeadcount = report.teamCapacityAssumption.headcount;
    const baseUtilization = report.teamCapacityAssumption.utilization;
    const baseDays = report.teamCapacityAssumption.teamDaysMid;
    const diffDays = teamDays - baseDays;

    return (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-orange-500" />
                    예산 시뮬레이터
                    <InfoTip>
                        <div className="space-y-2 max-w-sm">
                            <div className="font-semibold text-foreground text-sm">예산 시뮬레이터 — What-if 분석</div>
                            <p className="text-muted-foreground">
                                팀 인원수와 실작업 비율(utilization)을 가상 조정하여 백로그 완료까지 캘린더 일수가 어떻게 바뀌는지 즉시 확인.
                            </p>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">📐 환산 공식</div>
                                <div className="text-[11px] text-muted-foreground font-mono bg-muted/40 p-1.5 rounded">
                                    팀 영업일 = 총 인일(MD) ÷ (인원 × utilization)<br/>
                                    팀 월수 = 팀 영업일 ÷ 20<br/>
                                    완료 예정일 = 오늘 + 팀 영업일 (영업일 기준)<br/>
                                    공휴일 자동 제외 (date-holidays)
                                </div>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">🎚️ 슬라이더 의미</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li><strong>인원수 (headcount)</strong>: 가상 팀 크기. 1~20명 범위 권장</li>
                                    <li><strong>utilization</strong>: 실작업 비율 (0.10~1.00)
                                        <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                                            <li>0.6~0.7: 일반 IT 팀 (회의·휴식·컨텍스트 스위칭)</li>
                                            <li>0.8~0.9: 전담 개발 위주 (회의 적은 스타트업)</li>
                                            <li>0.4~0.5: 운영·고객 지원 병행 팀</li>
                                            <li>1.0: 풀 프로덕션 — 비현실적</li>
                                        </ul>
                                    </li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">💡 활용 사례</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li><strong>채용 ROI</strong>: 인원 +1 → 완료 일수 -N → 가치 추정</li>
                                    <li><strong>회의 줄이기</strong>: utilization 0.65→0.75 → 일수 단축 측정</li>
                                    <li><strong>외주 검토</strong>: "외주 3명 추가 시 ETA 얼마나 빨라지나"</li>
                                    <li><strong>임원 보고</strong>: "현재 팀 vs 이상 팀 ETA 비교"</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">
                                ⚠️ 단순 산술 모델 — 인원 추가 시 onboarding 비용·커뮤니케이션 오버헤드는 미반영.
                                "인원 2배 = 시간 절반" 가정은 현실과 다를 수 있음 (Brooks's Law).
                                현재 보고서 가정값(<strong>{baseHeadcount}명, {Math.round(baseUtilization * 100)}%</strong>)과 비교 가능.
                            </div>
                            <div className="border-t border-border/50 pt-1.5 text-[10px] text-muted-foreground/80">
                                📅 한국 공휴일 데이터: <a href="https://github.com/commenthol/date-holidays" target="_blank" rel="noopener noreferrer" className="underline">date-holidays</a> (CC BY 3.0)
                            </div>
                        </div>
                    </InfoTip>
                </h3>
                <button
                    type="button"
                    onClick={resetToDefaults}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    title={`기본값 (${DEFAULT_HEADCOUNT}명, ${Math.round(DEFAULT_UTILIZATION * 100)}%)`}
                >
                    <RotateCcw className="h-3 w-3" />
                    기본값
                </button>
            </div>

            {/* 슬라이더 영역 */}
            <div className="space-y-3 bg-muted/40 p-3 rounded border border-border/60">
                <div className="flex items-center gap-3 text-xs">
                    <span className="w-28 shrink-0 inline-flex items-center gap-1 text-foreground/90">
                        <Users className="h-3.5 w-3.5" />
                        인원수
                        <InfoTip size="sm">
                            <div className="space-y-1.5 max-w-xs">
                                <div className="font-semibold text-foreground">팀 인원수 (headcount)</div>
                                <p className="text-muted-foreground text-xs">
                                    이 백로그를 처리할 가상 팀 인원. 슬라이더 1~20명 (드물게 20+ 필요시 input 직접 입력 가능).
                                </p>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>현재 가정값: <strong>{baseHeadcount}명</strong> (보고서 기본)</li>
                                    <li>1명 → 1인 작업 ETA (가장 보수적)</li>
                                    <li>인원 ↑ → 캘린더 일수 ↓</li>
                                    <li>주의: Brooks's Law (인원 2배 ≠ 시간 절반)</li>
                                </ul>
                            </div>
                        </InfoTip>
                    </span>
                    <input
                        type="range"
                        min={1}
                        max={20}
                        step={1}
                        value={headcount}
                        onChange={(e) => setHeadcount(Number(e.target.value))}
                        className="flex-1 accent-orange-500 cursor-pointer"
                    />
                    <span className="w-16 shrink-0 text-right tabular-nums font-mono font-semibold text-foreground">
                        {headcount}명
                    </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                    <span className="w-28 shrink-0 inline-flex items-center gap-1 text-foreground/90">
                        실작업 비율
                        <InfoTip size="sm">
                            <div className="space-y-1.5 max-w-xs">
                                <div className="font-semibold text-foreground">Utilization (실작업 비율)</div>
                                <p className="text-muted-foreground text-xs">
                                    하루 8시간 중 실제 작업 시간 비율. 회의·휴식·컨텍스트 스위칭으로 100% 작업 불가능.
                                </p>
                                <div className="text-[11px] text-muted-foreground font-mono bg-muted/40 p-1.5 rounded mt-1">
                                    예시: utilization 0.65<br/>
                                    → 8h × 0.65 = 5.2h 실작업/일<br/>
                                    → 인원 5명 × 5.2h = 26h 팀 작업/일<br/>
                                    → 100 MD ÷ 5명 ÷ 0.65 = 30.8일 (캘린더)
                                </div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px] mt-1">
                                    <li>현재 가정값: <strong>{Math.round(baseUtilization * 100)}%</strong></li>
                                    <li>일반 IT 팀 권장: 60~70%</li>
                                    <li>전담 개발팀: 70~80%</li>
                                    <li>운영 병행: 40~50%</li>
                                </ul>
                            </div>
                        </InfoTip>
                    </span>
                    <input
                        type="range"
                        min={0.1}
                        max={1.0}
                        step={0.05}
                        value={utilization}
                        onChange={(e) => setUtilization(Number(e.target.value))}
                        className="flex-1 accent-orange-500 cursor-pointer"
                    />
                    <span className="w-16 shrink-0 text-right tabular-nums font-mono font-semibold text-foreground">
                        {Math.round(utilization * 100)}%
                    </span>
                </div>
            </div>

            {/* 결과 */}
            <div className="grid grid-cols-3 gap-2">
                <div className="rounded border border-border p-2.5 text-center bg-card">
                    <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1 justify-center">
                        팀 영업일
                        <InfoTip size="sm">
                            <p className="text-muted-foreground text-xs">
                                백로그 완료까지 영업일(주말·공휴일 제외) 수.
                                {teamDaysLow.toFixed(0)}일(low) ~ {teamDaysHigh.toFixed(0)}일(high) 범위.
                            </p>
                        </InfoTip>
                    </div>
                    <div className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
                        {teamDays.toFixed(0)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        {teamDaysLow.toFixed(0)} ~ {teamDaysHigh.toFixed(0)}일
                    </div>
                </div>
                <div className="rounded border border-border p-2.5 text-center bg-card">
                    <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1 justify-center">
                        팀 월수
                        <InfoTip size="sm">
                            <p className="text-muted-foreground text-xs">
                                팀 영업일 ÷ 20 (1 인월 표준).
                                임원 보고용 단위. {teamMonths.toFixed(2)}개월.
                            </p>
                        </InfoTip>
                    </div>
                    <div className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
                        {teamMonths.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        ≈ {Math.round(teamMonths * 4.3)}주
                    </div>
                </div>
                <div className="rounded border border-border p-2.5 text-center bg-card">
                    <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1 justify-center">
                        <Calendar className="h-2.5 w-2.5" />
                        완료 예정일
                        <InfoTip size="sm">
                            <div className="space-y-1.5 max-w-xs">
                                <div className="font-semibold text-foreground">완료 예정일 (P50)</div>
                                <p className="text-muted-foreground text-xs">
                                    오늘({format(today, 'yyyy-MM-dd')})부터 영업일 {Math.ceil(teamDays)}일 후의 캘린더 날짜.
                                    공휴일·주말 자동 제외.
                                </p>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>P50 (mid): {format(etaP50, 'yyyy-MM-dd (E)')}</li>
                                    <li>P85 (high): {format(etaP85, 'yyyy-MM-dd (E)')}</li>
                                    <li>P50 = 50% 확률로 이날까지 완료</li>
                                    <li>P85 = 85% 확률로 이날까지 완료 (보수적 약속)</li>
                                </ul>
                            </div>
                        </InfoTip>
                    </div>
                    <div className="text-base font-bold text-foreground tabular-nums mt-0.5">
                        {format(etaP50, 'M/d')}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        P85 ~{format(etaP85, 'M/d')}
                    </div>
                </div>
            </div>

            {/* 비교 */}
            {Math.abs(diffDays) > 1 && (
                <div className={`text-[11px] px-2 py-1.5 rounded border ${
                    diffDays < 0
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-300'
                        : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-300'
                }`}>
                    💡 보고서 기본 가정({baseHeadcount}명, {Math.round(baseUtilization * 100)}%, {baseDays.toFixed(0)}일) 대비{' '}
                    <strong className="tabular-nums">
                        {diffDays > 0 ? '+' : ''}{diffDays.toFixed(0)}일
                    </strong>{' '}
                    {diffDays < 0 ? '단축' : '늘어남'}.
                </div>
            )}
        </div>
    );
}
