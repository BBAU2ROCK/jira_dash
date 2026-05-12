import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import React from 'react';
import { Sparkles, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import type { TeamForecast, ConfidenceLevel } from '@/services/prediction/types';
import { confidenceGuidance } from '@/services/prediction/confidence';
import { useDisplayPreferenceStore } from '@/stores/displayPreferenceStore';
import { buildAnonymizeMap, maybeAnonymize } from '@/lib/anonymize';

const CONFIDENCE_BADGE: Record<ConfidenceLevel, { label: string; color: string }> = {
    high:        { label: '높음',        color: 'bg-green-100 text-green-800 dark:text-green-300 border-green-200 dark:border-green-900/60' },
    medium:      { label: '중간',        color: 'bg-blue-100 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-900/60' },
    low:         { label: '낮음',        color: 'bg-amber-100 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/60' },
    unreliable:  { label: '데이터 부족',  color: 'bg-red-100 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900/60' },
};

function formatDateRange(d?: Date) {
    if (!d) return '-';
    return format(d, 'yyyy.MM.dd (E)', { locale: ko });
}

function ScenarioRow({ label, labelTip, days, date, icon: Icon, accent, note, guidance }: {
    label: string;
    labelTip?: string;
    days: number;
    date: Date;
    icon: React.ElementType;
    accent: 'blue' | 'green' | 'red';
    note?: string;
    guidance: ReturnType<typeof confidenceGuidance>;
}) {
    const accentClass = {
        blue: 'text-blue-700 dark:text-blue-300',
        green: 'text-green-700 dark:text-green-300',
        red: 'text-red-700 dark:text-red-300',
    }[accent];

    const labelEl = (
        <span className="text-sm font-medium text-foreground/90 w-32 inline-flex items-center gap-1">
            {label}
            {labelTip && <InfoTip size="sm">{labelTip}</InfoTip>}
        </span>
    );

    if (!guidance.showRange && !guidance.showSingleEta) {
        return (
            <div className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                <Icon className={cn('h-4 w-4 shrink-0', accentClass)} />
                {labelEl}
                <span className="text-sm text-muted-foreground italic">예측 불가 — 진단 정보 참조</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
            <Icon className={cn('h-4 w-4 shrink-0', accentClass)} />
            {labelEl}
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                    {guidance.showSingleEta ? (
                        <span className={cn('text-base font-bold tabular-nums', accentClass)}>
                            {formatDateRange(date)}
                        </span>
                    ) : (
                        <span className="text-sm text-muted-foreground">단일 날짜 표시 안함 (신뢰도 낮음)</span>
                    )}
                    {days > 0 && (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            ({days} 영업일
                            <InfoTip size="sm">주말 + 한국 공휴일 제외 기준. 휴가·병가는 미반영 — 참고값.</InfoTip>
                            )
                        </span>
                    )}
                </div>
                {note && <div className="text-[11px] text-muted-foreground mt-0.5">{note}</div>}
            </div>
        </div>
    );
}

interface Props {
    team: TeamForecast | null;
    /** v1.0.43: Lead time 기반 보완 forecast — Throughput MC가 unreliable일 때 fallback */
    leadTime?: import('@/services/prediction/leadTimeForecast').LeadTimeForecast | null;
    /** v1.0.47: 정적 모델 (초기 일괄 등록 + 처리)이면 Throughput MC 시도 X — Lead Time을 메인으로 */
    projectMode?: 'static' | 'active';
}

/**
 * v1.0.46 (M5): IIFE를 헬퍼 컴포넌트로 추출 — 100줄 IIFE 가독성 개선.
 * Throughput MC가 reliable이면 기존 3 시나리오(낙관/기준/병목) 렌더.
 */
function ThroughputScenarios({
    team,
    bottleneckName,
    guidance,
}: {
    team: TeamForecast;
    bottleneckName: string | null;
    guidance: ReturnType<typeof confidenceGuidance>;
}) {
    return (
        <div className="mt-2">
            <ScenarioRow
                label="낙관 (자유 재할당)"
                labelTip="모든 잔여 task가 누구에게나 재할당 가능하다는 가정. 실무에서는 전문 영역·숙련도 때문에 비현실적 — 이론적 하한선 참조용."
                days={team.optimistic.p85Days}
                date={team.optimistic.p85Date}
                icon={Sparkles}
                accent="blue"
                note="모든 일이 누구에게나 재할당 가능하다는 가정 — 비현실적"
                guidance={confidenceGuidance(team.optimistic.confidence)}
            />
            <ScenarioRow
                label="기준 ★ 권장 약속"
                labelTip="현재 담당자 배정을 그대로 유지했을 때의 팀 ETA. 개인별 P85 중 최대값 = 팀 P85. 이해관계자 약속·마감 협의 시 이 값을 권장."
                days={team.realistic.p85Days}
                date={team.realistic.p85Date}
                icon={CheckCircle2}
                accent="green"
                note={bottleneckName ? `현재 할당 유지. 병목: ${bottleneckName}` : '현재 할당 유지'}
                guidance={guidance}
            />
            {team.bottleneck && team.bottleneck.forecast && (
                <ScenarioRow
                    label="병목 (최대 ETA)"
                    labelTip="현재 ETA가 가장 긴 인원. 이 인원이 팀 일정을 사실상 좌우함 → 업무 재배분·지원 투입·숙련자 멘토링 대상 신호."
                    days={team.bottleneck.forecast.p85Days}
                    date={team.bottleneck.forecast.p85Date}
                    icon={ShieldAlert}
                    accent="red"
                    note={`${bottleneckName} (잔여 ${team.bottleneck.remaining}건, 일평균 ${team.bottleneck.avgDailyThroughput}건)`}
                    guidance={confidenceGuidance(team.bottleneck.forecast.confidence)}
                />
            )}
        </div>
    );
}

/**
 * v1.0.46 (M5): Throughput MC가 unreliable일 때 Lead Time 3 시나리오로 대체 렌더.
 */
function LeadTimeScenarios({
    leadTime,
}: {
    leadTime: NonNullable<Props['leadTime']>;
}) {
    const ltGuidance = confidenceGuidance(leadTime.confidence);
    const cycles = Math.ceil(leadTime.activeCount / leadTime.activeParallelism);
    return (
        <div className="mt-2">
            <ScenarioRow
                label="낙관 (자유 재할당) (Lead Time)"
                labelTip={
                    `Lead Time P50 = ${leadTime.p50Days}일 (50% 이상 이 시간 내 완료). `
                    + `백로그 ${leadTime.activeCount}건 / 활성 ${leadTime.activeParallelism}명 → ${cycles} 사이클 × ${leadTime.p50Days}일. `
                    + `샘플 ${leadTime.sampleSize}건. 병렬성·이슈 크기 단순 가정.`
                }
                days={leadTime.scenarios.optimistic.days}
                date={leadTime.scenarios.optimistic.date}
                icon={Sparkles}
                accent="blue"
                note={`P50 ${leadTime.p50Days}일 × ${cycles} 사이클 — 50% 이상이 이보다 빨리 완료`}
                guidance={ltGuidance}
            />
            <ScenarioRow
                label="기준 ★ 권장 약속 (Lead Time)"
                labelTip={
                    `Lead Time P85 = ${leadTime.p85Days}일 (85% 이내 완료 약속). `
                    + `백로그 ${leadTime.activeCount}건 / 활성 ${leadTime.activeParallelism}명 → ${cycles} 사이클 × ${leadTime.p85Days}일. `
                    + `Throughput MC unreliable 시 권장 약속.`
                }
                days={leadTime.scenarios.realistic.days}
                date={leadTime.scenarios.realistic.date}
                icon={CheckCircle2}
                accent="green"
                note={`P85 ${leadTime.p85Days}일 × ${cycles} 사이클 — 이해관계자 약속용`}
                guidance={ltGuidance}
            />
            <ScenarioRow
                label="보수 (Lead Time)"
                labelTip={
                    `Lead Time P95 = ${leadTime.p95Days}일 (95% 이내 완료, 보수적 기준). `
                    + `샘플 < 100건 시 P95 추정 폭 ↑ (long-tail).`
                }
                days={leadTime.scenarios.conservative.days}
                date={leadTime.scenarios.conservative.date}
                icon={ShieldAlert}
                accent="red"
                note={`P95 ${leadTime.p95Days}일 × ${cycles} 사이클 — 보수적 buffer`}
                guidance={ltGuidance}
            />
        </div>
    );
}

export function EtaScenarioCard({ team, leadTime, projectMode }: Props) {
    const anonymizeMode = useDisplayPreferenceStore((s) => s.anonymizeMode);
    const anonMap = React.useMemo(
        () => buildAnonymizeMap(team?.perAssignee.map((r) => r.displayName) ?? []),
        [team?.perAssignee]
    );

    if (!team) {
        return <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">데이터 로딩 중...</div>;
    }
    const guidance = confidenceGuidance(team.realistic.confidence);
    const badge = CONFIDENCE_BADGE[team.realistic.confidence];
    const bottleneckName = team.bottleneck
        ? maybeAnonymize(team.bottleneck.displayName, anonMap, anonymizeMode)
        : null;

    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
                    팀 ETA — 3 시나리오
                    <InfoTip size="sm">
                        ETA (Estimated Time of Arrival) = 예상 완료일.
                        P85 기준(=15% 리스크 감수)으로 산정. 3 시나리오는 할당 가정에 따른 낙관·기준·병목.
                    </InfoTip>
                </h3>
                <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium inline-flex items-center gap-1', badge.color)}>
                    신뢰도: {badge.label}
                    <InfoTip size="sm">
                        활동일·변동성(CV)·Scope ratio로 4단계 분류.
                        낮으면 단일 날짜는 숨기고 범위만 표시 (정직성 원칙).
                    </InfoTip>
                </span>
            </div>

            {/* v1.0.44: Throughput MC unreliable + Lead Time reliable이면 → Lead Time 3 시나리오로 대체.
                v1.0.46 (M5): IIFE → 헬퍼 컴포넌트 분리.
                v1.0.47: projectMode === 'static'이면 항상 Lead Time 메인 (Throughput MC는 의미 없음). */}
            {(projectMode === 'static' || team.realistic.confidence === 'unreliable')
                && leadTime
                && leadTime.confidence !== 'unreliable'
                && leadTime.activeCount > 0
                ? <LeadTimeScenarios leadTime={leadTime} />
                : <ThroughputScenarios team={team} bottleneckName={bottleneckName} guidance={guidance} />}

            {/* v1.0.43: leadTime warnings 별도 박스 (warnings 있을 때만) */}
            {leadTime && leadTime.warnings.length > 0 && (
                <div className="mt-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 p-2 text-xs text-blue-900 dark:text-blue-300">
                    <div className="flex items-start gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                            <div className="font-semibold">Lead Time 보완 ETA 한계</div>
                            <ul className="space-y-0.5 list-disc list-inside text-[11px]">
                                {leadTime.warnings.map((w, i) => (
                                    <li key={i}>{w}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {team.realistic.warnings.length > 0 && (
                <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-2 text-xs text-amber-900 dark:text-amber-300">
                    <div className="flex items-start gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <ul className="space-y-0.5 list-disc list-inside">
                            {team.realistic.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
