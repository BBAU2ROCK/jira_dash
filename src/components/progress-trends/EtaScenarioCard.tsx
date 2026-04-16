import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import React from 'react';
import { Sparkles, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TeamForecast, ConfidenceLevel } from '@/services/prediction/types';
import { confidenceGuidance } from '@/services/prediction/confidence';
import { useDisplayPreferenceStore } from '@/stores/displayPreferenceStore';
import { buildAnonymizeMap, maybeAnonymize } from '@/lib/anonymize';

const CONFIDENCE_BADGE: Record<ConfidenceLevel, { label: string; color: string }> = {
    high: { label: '높음', color: 'bg-green-100 text-green-800 border-green-200' },
    medium: { label: '중간', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    low: { label: '낮음', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    unreliable: { label: '예측 불가', color: 'bg-red-100 text-red-800 border-red-200' },
};

function formatDateRange(d?: Date) {
    if (!d) return '-';
    return format(d, 'yyyy.MM.dd (E)', { locale: ko });
}

function ScenarioRow({ label, days, date, icon: Icon, accent, note, guidance }: {
    label: string;
    days: number;
    date: Date;
    icon: React.ElementType;
    accent: 'blue' | 'green' | 'red';
    note?: string;
    guidance: ReturnType<typeof confidenceGuidance>;
}) {
    const accentClass = {
        blue: 'text-blue-700',
        green: 'text-green-700',
        red: 'text-red-700',
    }[accent];

    if (!guidance.showRange && !guidance.showSingleEta) {
        return (
            <div className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                <Icon className={cn('h-4 w-4 shrink-0', accentClass)} />
                <span className="text-sm font-medium text-slate-700 w-32">{label}</span>
                <span className="text-sm text-slate-400 italic">예측 불가 — 진단 정보 참조</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
            <Icon className={cn('h-4 w-4 shrink-0', accentClass)} />
            <span className="text-sm font-medium text-slate-700 w-32">{label}</span>
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                    {guidance.showSingleEta ? (
                        <span className={cn('text-base font-bold tabular-nums', accentClass)}>
                            {formatDateRange(date)}
                        </span>
                    ) : (
                        <span className="text-sm text-slate-500">단일 날짜 표시 안함 (신뢰도 낮음)</span>
                    )}
                    {days > 0 && (
                        <span className="text-xs text-slate-500">({days} 영업일)</span>
                    )}
                </div>
                {note && <div className="text-[11px] text-slate-500 mt-0.5">{note}</div>}
            </div>
        </div>
    );
}

interface Props {
    team: TeamForecast | null;
}

export function EtaScenarioCard({ team }: Props) {
    const anonymizeMode = useDisplayPreferenceStore((s) => s.anonymizeMode);
    const anonMap = React.useMemo(
        () => buildAnonymizeMap(team?.perAssignee.map((r) => r.displayName) ?? []),
        [team?.perAssignee]
    );

    if (!team) {
        return <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">데이터 로딩 중...</div>;
    }
    const guidance = confidenceGuidance(team.realistic.confidence);
    const badge = CONFIDENCE_BADGE[team.realistic.confidence];
    const bottleneckName = team.bottleneck
        ? maybeAnonymize(team.bottleneck.displayName, anonMap, anonymizeMode)
        : null;

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">팀 ETA — 3 시나리오</h3>
                <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', badge.color)}>
                    신뢰도: {badge.label}
                </span>
            </div>

            <div className="mt-2">
                <ScenarioRow
                    label="낙관 (자유 재할당)"
                    days={team.optimistic.p85Days}
                    date={team.optimistic.p85Date}
                    icon={Sparkles}
                    accent="blue"
                    note="모든 일이 누구에게나 재할당 가능하다는 가정 — 비현실적"
                    guidance={confidenceGuidance(team.optimistic.confidence)}
                />
                <ScenarioRow
                    label="기준 ★ 권장 약속"
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
                        days={team.bottleneck.forecast.p85Days}
                        date={team.bottleneck.forecast.p85Date}
                        icon={ShieldAlert}
                        accent="red"
                        note={`${bottleneckName} (잔여 ${team.bottleneck.remaining}건, 일평균 ${team.bottleneck.avgDailyThroughput}건)`}
                        guidance={confidenceGuidance(team.bottleneck.forecast.confidence)}
                    />
                )}
            </div>

            {team.realistic.warnings.length > 0 && (
                <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900">
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
