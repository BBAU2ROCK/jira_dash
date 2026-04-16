import { Bug, AlertTriangle, ExternalLink, TrendingUp, TrendingDown, Minus, Lightbulb, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { defectRateToGrade } from '@/lib/defect-kpi-utils';
import { severityColorClass } from '@/lib/defect-severity-color';
import { useDisplayPreferenceStore } from '@/stores/displayPreferenceStore';
import { buildAnonymizeMap, maybeAnonymize } from '@/lib/anonymize';
import type { EpicRetroSummary } from '@/services/retrospective/types';
import React from 'react';

const JIRA_BASE = 'https://okestro.atlassian.net/browse';

const GRADE_COLOR: Record<string, string> = {
    S: 'text-purple-700 bg-purple-100 border-purple-300',
    A: 'text-green-700 bg-green-100 border-green-300',
    B: 'text-blue-700 bg-blue-100 border-blue-300',
    C: 'text-amber-700 bg-amber-100 border-amber-300',
    D: 'text-red-700 bg-red-100 border-red-300',
};

const TYPE_COLOR: Record<string, string> = {
    버그: 'bg-red-50 text-red-800 border-red-200',
    bug: 'bg-red-50 text-red-800 border-red-200',
    개선: 'bg-blue-50 text-blue-800 border-blue-200',
    improvement: 'bg-blue-50 text-blue-800 border-blue-200',
    보안: 'bg-purple-50 text-purple-800 border-purple-200',
    security: 'bg-purple-50 text-purple-800 border-purple-200',
};
function typeColor(name: string): string {
    return TYPE_COLOR[name.toLowerCase()] ?? TYPE_COLOR[name] ?? 'bg-slate-50 text-slate-700 border-slate-200';
}

interface Props {
    summary: EpicRetroSummary;
}

/**
 * v1.0.12 F3-2: 결함 회고 카드 — 심도 분석 포함 재설계.
 *
 * 섹션:
 *   1. 핵심 메트릭 (결함수·Density·팀 대비·트렌드)
 *   2. 심각도 분포 pill
 *   3. 타입 분포 pill
 *   4. 주간 추이 스파크라인 (12주)
 *   5. 집중 담당자 상위 3명
 *   6. 자동 권고 (최대 3건)
 */
export function EpicDefectCard({ summary }: Props) {
    const stats = summary.defectStats;
    const anonymizeMode = useDisplayPreferenceStore((s) => s.anonymizeMode);
    const anonMap = React.useMemo(
        () => buildAnonymizeMap(stats?.topAffectedPeople.map((p) => p.name) ?? []),
        [stats?.topAffectedPeople]
    );

    const grade = stats ? defectRateToGrade(stats.defectsPerCompletedTask) : null;
    const gradeColor = grade ? GRADE_COLOR[grade] ?? '' : '';

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                    <a
                        href={`${JIRA_BASE}/${summary.epicKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                        {summary.epicKey}
                        <ExternalLink className="h-3 w-3" />
                    </a>
                    <h3 className="text-sm font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                        <Bug className="h-4 w-4 text-red-500" />
                        결함 회고
                        <InfoTip size="sm">
                            매핑된 결함 에픽(TQ)의 leaf 이슈 기반 심도 분석.
                            등급·트렌드·타입·집중도·자동 권고 포함.
                        </InfoTip>
                    </h3>
                </div>
                {grade && (
                    <span className={cn('rounded-full border px-2 py-0.5 text-xs font-bold shrink-0', gradeColor)}>
                        {grade}
                    </span>
                )}
            </div>

            {stats ? (
                <div className="flex-1 space-y-3">
                    {/* 1. 핵심 메트릭 (결함수·Density·팀 대비·트렌드) */}
                    <div className="grid grid-cols-2 gap-2">
                        <MetricTile
                            label="결함 등록"
                            value={`${stats.defectCount}`}
                            unit="건"
                            color="red"
                            tip="매핑된 결함 에픽(TQ)의 leaf 이슈 수. 이 에픽에 연결된 결함 전체."
                        />
                        <MetricTile
                            label="Defect Density"
                            value={`${stats.defectsPerCompletedTask}`}
                            unit="%"
                            color="slate"
                            sub="완료 task 대비"
                            tip="결함 수 ÷ 완료 task 수 × 100. 등급: S≤5% A≤10% B≤15% C≤20% D그외."
                        />
                        {stats.densityVsTeamAvg != null && (
                            <MetricTile
                                label="팀 평균 대비"
                                value={`${stats.densityVsTeamAvg > 0 ? '+' : ''}${stats.densityVsTeamAvg}`}
                                unit="%p"
                                color={stats.densityVsTeamAvg > 2 ? 'red' : stats.densityVsTeamAvg < -2 ? 'green' : 'slate'}
                                tip="선택된 에픽들 평균 Defect Density 대비 차이. 양수=평균보다 높음(나쁨), 음수=낮음(좋음)."
                            />
                        )}
                        <TrendTile direction={stats.trendDirection} />
                    </div>

                    {/* 2. 심각도 분포 */}
                    {stats.severityBreakdown.length > 0 && (
                        <div>
                            <div className="text-[11px] font-medium text-slate-600 mb-1 inline-flex items-center gap-1">
                                심각도 분포
                                <InfoTip size="sm">결함 심각도 필드 값 집계. 색상: 적=Critical/Blocker, 주=High/Major, 황=Medium, 청=Low.</InfoTip>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {stats.severityBreakdown.map((s) => (
                                    <span
                                        key={s.name}
                                        className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]', severityColorClass(s.name))}
                                    >
                                        <span className="font-medium">{s.name}</span>
                                        <span className="tabular-nums font-bold">{s.count}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 3. 타입 분포 */}
                    {stats.typeBreakdown.length > 0 && (
                        <div>
                            <div className="text-[11px] font-medium text-slate-600 mb-1 inline-flex items-center gap-1">
                                타입 분포
                                <InfoTip size="sm">결함 이슈의 issuetype 분포. 70%↑ 편향 시 자동 권고 트리거.</InfoTip>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {stats.typeBreakdown.slice(0, 6).map((t) => (
                                    <span
                                        key={t.name}
                                        className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]', typeColor(t.name))}
                                    >
                                        <span>{t.name}</span>
                                        <span className="tabular-nums font-bold">{t.count}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 4. 주간 추이 스파크라인 */}
                    {stats.weeklyTrend.length > 0 && (
                        <WeeklySparkline trend={stats.weeklyTrend} />
                    )}

                    {/* 5. 집중 담당자 */}
                    {stats.topAffectedPeople.length > 0 && (
                        <div>
                            <div className="text-[11px] font-medium text-slate-600 mb-1 inline-flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                집중 담당자
                                <InfoTip size="sm">결함을 가장 많이 처리(작업자) 또는 담당한 상위 3명. 50%↑ 집중 시 pair programming 권고.</InfoTip>
                            </div>
                            <div className="space-y-0.5">
                                {stats.topAffectedPeople.map((p) => {
                                    const displayName = maybeAnonymize(p.name, anonMap, anonymizeMode);
                                    return (
                                        <div key={p.name} className="flex items-center justify-between text-[11px]">
                                            <span className="text-slate-700 truncate">{displayName}</span>
                                            <span className="text-slate-500 tabular-nums">
                                                <span className="font-bold text-slate-700">{p.count}건</span>
                                                <span className="text-slate-400"> ({p.pctOfEpic}%)</span>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 6. 자동 권고 */}
                    {stats.recommendations.length > 0 && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                            <div className="text-[11px] font-semibold text-amber-900 mb-1 inline-flex items-center gap-1">
                                <Lightbulb className="h-3 w-3" />
                                권장 액션
                                <InfoTip size="sm">규칙 기반 자동 생성. 코칭·개선 참고용 — 성과 평가 X.</InfoTip>
                            </div>
                            <ul className="text-[11px] text-amber-900 space-y-0.5 list-disc list-inside">
                                {stats.recommendations.map((rec, i) => (
                                    <li key={i}>{rec}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Footer — 등급 해석 */}
                    <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-100">
                        등급: S ≤5%, A ≤10%, B ≤15%, C ≤20%, D 그 외.
                        <span className="text-amber-700 font-medium ml-1">결함은 시스템 신호 — 개인 책임 X.</span>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col justify-center items-center text-center text-sm text-slate-500 gap-2 py-6">
                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                    <span className="font-semibold">결함 매핑 미등록</span>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-[200px]">
                        KPI 성과 탭 → 결함 KPI → 「개발 ↔ 결함 에픽 매핑」에서 등록하면 에픽별 결함 회고가 표시됩니다.
                    </p>
                </div>
            )}
        </div>
    );
}

// ─── 헬퍼 컴포넌트 ─────────────────────────────────────────────────────────

function MetricTile({ label, value, unit, sub, color, tip }: {
    label: string; value: string; unit?: string; sub?: string;
    color: 'red' | 'slate' | 'green'; tip?: string;
}) {
    const colorMap = {
        red: 'text-red-600',
        slate: 'text-slate-800',
        green: 'text-green-700',
    };
    return (
        <div className="rounded border border-slate-200 bg-slate-50 p-2">
            <div className="text-[10px] text-slate-500 inline-flex items-center gap-1">
                {label}
                {tip && <InfoTip size="sm">{tip}</InfoTip>}
            </div>
            <div className={cn('text-xl font-bold tabular-nums', colorMap[color])}>
                {value}
                {unit && <span className="text-sm font-normal text-slate-500 ml-0.5">{unit}</span>}
            </div>
            {sub && <div className="text-[9px] text-slate-400">{sub}</div>}
        </div>
    );
}

function TrendTile({ direction }: { direction: 'improving' | 'stable' | 'worsening' | 'insufficient' }) {
    const map = {
        improving: { icon: TrendingDown, color: 'text-green-700', label: '개선 중', desc: '최근 4주 결함 감소' },
        stable: { icon: Minus, color: 'text-slate-600', label: '안정', desc: '최근 4주 ±30% 이내' },
        worsening: { icon: TrendingUp, color: 'text-red-700', label: '악화 중', desc: '최근 4주 결함 증가' },
        insufficient: { icon: Minus, color: 'text-slate-400', label: '—', desc: '주 8개 미만 — 분석 불가' },
    }[direction];
    const Icon = map.icon;
    return (
        <div className="rounded border border-slate-200 bg-slate-50 p-2">
            <div className="text-[10px] text-slate-500 inline-flex items-center gap-1">
                트렌드
                <InfoTip size="sm">
                    최근 4주 결함 합 vs 이전 4주 합 비교. ±30%를 경계로 개선/악화 분류.
                    주 8개 미만이면 분석 불가로 표시.
                </InfoTip>
            </div>
            <div className={cn('text-sm font-bold inline-flex items-center gap-1', map.color)}>
                <Icon className="h-4 w-4" />
                {map.label}
            </div>
            <div className="text-[9px] text-slate-400">{map.desc}</div>
        </div>
    );
}

function WeeklySparkline({ trend }: { trend: Array<{ weekStart: string; count: number }> }) {
    const max = Math.max(1, ...trend.map((t) => t.count));
    return (
        <div>
            <div className="text-[11px] font-medium text-slate-600 mb-1 inline-flex items-center gap-1">
                주간 추이 (최근 12주)
                <InfoTip size="sm">
                    각 막대가 1주치 결함 등록 수. 오래된 주가 왼쪽. 막대 높이는 최대값 기준 정규화.
                </InfoTip>
            </div>
            <div className="flex items-end gap-0.5 h-8 bg-slate-50 rounded px-1 py-0.5 border border-slate-200">
                {trend.map((t) => {
                    const h = Math.max(2, Math.round((t.count / max) * 28));
                    const color = t.count === 0
                        ? 'bg-slate-200'
                        : t.count >= max * 0.7
                          ? 'bg-red-400'
                          : t.count >= max * 0.4
                            ? 'bg-amber-400'
                            : 'bg-blue-300';
                    return (
                        <div
                            key={t.weekStart}
                            className={cn('flex-1 rounded-sm', color)}
                            style={{ height: `${h}px` }}
                            title={`${t.weekStart} — ${t.count}건`}
                        />
                    );
                })}
            </div>
            <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                <span>{trend[0]?.weekStart?.slice(5) ?? ''}</span>
                <span>{trend[trend.length - 1]?.weekStart?.slice(5) ?? ''}</span>
            </div>
        </div>
    );
}
