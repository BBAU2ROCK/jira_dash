import { TrendingUp, AlertTriangle, Users, Calendar, Boxes, Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { analyzeInflow } from '@/services/prediction/scopeInflowAnalysis';
import { useDisplayPreferenceStore } from '@/stores/displayPreferenceStore';
import { buildAnonymizeMap, maybeAnonymize } from '@/lib/anonymize';
import type { JiraIssue } from '@/api/jiraClient';

interface Props {
    issues: JiraIssue[];
    windowDays?: number;
}

export function ScopeInflowCard({ issues, windowDays = 30 }: Props) {
    const anonymizeMode = useDisplayPreferenceStore((s) => s.anonymizeMode);
    const analysis = analyzeInflow(issues, windowDays);
    const anonMap = buildAnonymizeMap(analysis.topReporters.map((r) => r.displayName));

    const suspicion = analysis.migrationSignals.suspicionScore;
    const isEarlyStage = analysis.projectStage === 'early';
    const suspicionMeta = isEarlyStage
        ? { label: '🌱 초기 구축', color: 'bg-emerald-100 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60' }
        : suspicion >= 0.5
        ? { label: '의심 큼', color: 'bg-red-100 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900/60' }
        : suspicion >= 0.2
        ? { label: '의심 보통', color: 'bg-amber-100 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/60' }
        : { label: '정상 유입', color: 'bg-green-100 text-green-800 dark:text-green-300 border-green-200 dark:border-green-900/60' };

    // sparkline용 max
    const maxDay = Math.max(1, ...analysis.byDay.map((d) => d.count));

    if (analysis.totalNew === 0) {
        return (
            <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-indigo-500" />
                    신규 유입 분석 — 최근 {windowDays}일
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">최근 {windowDays}일 신규 이슈 없음.</p>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-indigo-500" />
                    신규 유입 분석 (최근 {windowDays}일)
                    <InfoTip>
                        <div className="space-y-2 max-w-sm">
                            <div className="font-semibold text-foreground text-sm">신규 유입 분석 — Scope 발산 원인 진단</div>
                            <p className="text-muted-foreground">
                                Scope ratio가 1.5x를 초과하면 ETA 예측이 불가능합니다.
                                이 카드는 "왜 신규가 많은지" 원인을 분해하여 운영 액션 결정에 도움을 줍니다.
                            </p>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">📐 산정 방식</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>최근 {windowDays}일 동안 created된 leaf 이슈 분석</li>
                                    <li>이슈 타입별·일별·작성자별 분포</li>
                                    <li>마이그레이션 휴리스틱:
                                        <ul className="list-disc pl-4 mt-0.5">
                                            <li>일별 폭증: 신규 일자 중앙값 × 5배 이상 = spike</li>
                                            <li>단일 작성자: 한 사람이 50%+ = 의심</li>
                                        </ul>
                                    </li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">🎯 의심도 등급</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li><strong>정상 유입</strong> (0~0.2): 실제 새 작업, 운영 액션 필요</li>
                                    <li><strong>의심 보통</strong> (0.2~0.5): 일부 마이그레이션 가능성</li>
                                    <li><strong>의심 큼</strong> (0.5+): 마이그레이션 또는 일괄 등록 가능성 高 → 정상 신규 별도 추정</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">💡 운영 액션 가이드</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li><strong>정상 유입</strong>: 인력 보강 / 신규 차단 검토 / scope 협의</li>
                                    <li><strong>마이그레이션 의심</strong>: 등록 작업 마무리 후 ratio 재측정</li>
                                    <li><strong>단일 작성자 다수</strong>: 일괄 등록 패턴 확인 (예: 사전 정의된 작업 목록)</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">
                                💡 spike 일자의 이슈를 마이그레이션으로 가정하면 "정상 신규" 추정치가 표시됩니다.
                            </div>
                        </div>
                    </InfoTip>
                </h3>
                <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', suspicionMeta.color)}>
                    {suspicionMeta.label} ({Math.round(suspicion * 100)}%)
                </span>
            </div>

            {/* Top 메트릭 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-md border border-border bg-muted/30 p-2">
                    <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        신규
                    </div>
                    <div className="text-lg font-bold text-foreground tabular-nums">{analysis.totalNew}</div>
                    <div className="text-[10px] text-muted-foreground">총 / {windowDays}일</div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2">
                    <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                        ✓ 완료
                    </div>
                    <div className="text-lg font-bold text-foreground tabular-nums">{analysis.totalCompleted}</div>
                    <div className="text-[10px] text-muted-foreground">{windowDays}일 처리</div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2">
                    <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                        Scope 비율
                        <InfoTip size="sm">
                            <p className="text-xs text-muted-foreground max-w-xs">
                                신규 / 완료. 1.5x 초과 = 백로그 발산. ETA 예측 의미 없음.
                            </p>
                        </InfoTip>
                    </div>
                    <div className={cn(
                        'text-lg font-bold tabular-nums',
                        analysis.scopeRatio > 1.5 ? 'text-red-600 dark:text-red-400' :
                        analysis.scopeRatio > 1.0 ? 'text-amber-600 dark:text-amber-400' :
                        'text-emerald-600 dark:text-emerald-400'
                    )}>
                        {isFinite(analysis.scopeRatio) ? `${analysis.scopeRatio.toFixed(2)}x` : '∞'}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        {analysis.scopeRatio > 1.5 ? '발산' : analysis.scopeRatio > 1.0 ? '증가' : '수렴'}
                    </div>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-2">
                    <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                        정상 신규 추정
                        <InfoTip size="sm">
                            <p className="text-xs text-muted-foreground max-w-xs">
                                마이그레이션 의심(spike 일자) 제외한 추정 신규 건수.
                                이 값 기준 ratio가 1.5 이하면 진짜 발산은 아닐 가능성.
                            </p>
                        </InfoTip>
                    </div>
                    <div className="text-lg font-bold text-foreground tabular-nums">{analysis.estimatedRealNew}</div>
                    <div className={cn(
                        'text-[10px] tabular-nums',
                        analysis.estimatedRealRatio > 1.5 ? 'text-red-500' :
                        analysis.estimatedRealRatio > 1.0 ? 'text-amber-500' :
                        'text-emerald-500'
                    )}>
                        조정 후 {isFinite(analysis.estimatedRealRatio) ? `${analysis.estimatedRealRatio.toFixed(2)}x` : '∞'}
                    </div>
                </div>
            </div>

            {/* v1.0.42: 초기 구축 단계 안내 (early 일 때만) — 마이그레이션 의심보다 먼저 표시 */}
            {isEarlyStage && (
                <div className="rounded-md border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 p-2.5">
                    <div className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-300 mb-1 inline-flex items-center gap-1">
                        <Sprout className="h-3.5 w-3.5" />
                        초기 구축 단계 — 신규 유입 = "스코프 정의"
                    </div>
                    <p className="text-[11px] text-emerald-900 dark:text-emerald-300">
                        {analysis.projectStageRationale}
                    </p>
                    <p className="text-[11px] text-emerald-900 dark:text-emerald-300 mt-1">
                        이 단계에서는 신규 유입이 많은 게 <strong>정상</strong>입니다 (할 일 목록 등록 중).
                        Scope ratio가 1.5x를 초과해도 "발산"이 아닌 "스코프 정의"로 해석.
                        백로그가 안정화(매일 신규 ≤ 5건 + 완료율 30%+)되면 자동으로 'active' 단계로 전환되어 ETA 산정 시작.
                    </p>
                </div>
            )}

            {/* 마이그레이션 의심 사유 — early 단계가 아닐 때만 의미 있음 */}
            {!isEarlyStage && analysis.migrationSignals.reasons.length > 0 && (
                <div className="rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-2.5">
                    <div className="text-[11px] font-semibold text-amber-900 dark:text-amber-300 mb-1 inline-flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        마이그레이션 의심 신호
                    </div>
                    <ul className="text-[11px] text-amber-900 dark:text-amber-300 space-y-0.5 list-disc pl-4">
                        {analysis.migrationSignals.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* 일별 sparkline */}
            <div>
                <div className="text-[11px] font-semibold text-foreground/90 mb-1.5 inline-flex items-center gap-1">
                    일별 신규 분포 (sparkline)
                    <InfoTip size="sm">
                        <p className="text-xs text-muted-foreground max-w-xs">
                            가로축 시간 (왼쪽 = {windowDays}일 전, 오른쪽 = 오늘). 빨간 막대는 spike 일자.
                            중앙값 대비 {5}배 이상 폭증 = 마이그레이션 의심.
                        </p>
                    </InfoTip>
                </div>
                <div className="flex items-end gap-px h-12 bg-muted/20 rounded p-1">
                    {analysis.byDay.map((d) => {
                        const isSpike = analysis.migrationSignals.spikeDays.some((s) => s.date === d.date);
                        const heightPct = d.count > 0 ? Math.max(8, (d.count / maxDay) * 100) : 0;
                        return (
                            <div
                                key={d.date}
                                className={cn(
                                    'flex-1 transition-all',
                                    isSpike ? 'bg-red-500 dark:bg-red-600' :
                                    d.count > 0 ? 'bg-indigo-500 dark:bg-indigo-600' :
                                    'bg-transparent'
                                )}
                                style={{ height: `${heightPct}%` }}
                                title={`${d.date}: ${d.count}건${isSpike ? ' (spike)' : ''}`}
                            />
                        );
                    })}
                </div>
                <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                    <span>{analysis.byDay[0]?.date}</span>
                    <span>오늘</span>
                </div>
            </div>

            {/* 이슈 타입별 + 작성자 Top 2-column */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* 이슈 타입별 */}
                <div>
                    <div className="text-[11px] font-semibold text-foreground/90 mb-1.5 inline-flex items-center gap-1">
                        <Boxes className="h-3 w-3" />
                        이슈 타입별
                    </div>
                    <ul className="space-y-1 text-xs">
                        {analysis.byIssueType.slice(0, 5).map((t) => (
                            <li key={t.typeName} className="flex items-center gap-2">
                                <span className="w-24 text-foreground/90 truncate" title={t.typeName}>{t.typeName}</span>
                                <div className="flex-1 h-1.5 bg-muted/40 rounded overflow-hidden">
                                    <div className="h-full bg-indigo-500 dark:bg-indigo-600" style={{ width: `${t.percentage}%` }} />
                                </div>
                                <span className="tabular-nums text-foreground/80 w-14 text-right">
                                    {t.count} ({t.percentage}%)
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* 작성자 Top */}
                <div>
                    <div className="text-[11px] font-semibold text-foreground/90 mb-1.5 inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        작성자 Top {analysis.topReporters.length}
                        <InfoTip size="sm">
                            <p className="text-xs text-muted-foreground max-w-xs">
                                신규 이슈를 등록한 작성자(reporter). 단일 작성자가 50%+면 일괄 등록 의심.
                            </p>
                        </InfoTip>
                    </div>
                    <ul className="space-y-1 text-xs">
                        {analysis.topReporters.map((r) => {
                            const displayName = maybeAnonymize(r.displayName, anonMap, anonymizeMode);
                            const isDominant = analysis.migrationSignals.dominantReporter?.displayName === r.displayName;
                            return (
                                <li key={r.displayName} className="flex items-center gap-2">
                                    <span
                                        className={cn(
                                            'w-24 truncate',
                                            isDominant ? 'text-amber-700 dark:text-amber-300 font-medium' : 'text-foreground/90'
                                        )}
                                        title={displayName}
                                    >
                                        {displayName}
                                    </span>
                                    <div className="flex-1 h-1.5 bg-muted/40 rounded overflow-hidden">
                                        <div
                                            className={cn(
                                                'h-full',
                                                isDominant ? 'bg-amber-500 dark:bg-amber-600' : 'bg-indigo-500 dark:bg-indigo-600'
                                            )}
                                            style={{ width: `${r.percentage}%` }}
                                        />
                                    </div>
                                    <span className="tabular-nums text-foreground/80 w-14 text-right">
                                        {r.count} ({r.percentage}%)
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>

            {/* 운영 액션 가이드 — v1.0.42: early 단계 분기 추가 (다른 분기보다 먼저) */}
            <div className="text-[11px] text-muted-foreground bg-muted/30 px-2 py-1.5 rounded border border-border/60">
                💡 <strong>다음 행동</strong>:&nbsp;
                {isEarlyStage ? (
                    <>초기 구축 단계 — 백로그 정의 작업 마무리에 집중. 안정화 후(매일 신규 ≤ 5건 + 완료율 30%+) ETA 자동 산정 시작. 지금 5.67x는 "발산"이 아닌 정상 등록 활동.</>
                ) : suspicion >= 0.5 ? (
                    <>마이그레이션 의심 큼 — spike 일자의 이슈를 별도 백로그로 분리하고 ratio 재측정 권장.</>
                ) : suspicion >= 0.2 ? (
                    <>일부 마이그레이션 가능성 — 일괄 등록 작업 마무리 후 ratio 추이 관찰.</>
                ) : analysis.scopeRatio > 1.5 ? (
                    <>실제 발산 — 신규 차단 / 인력 보강 / scope 협의 검토 필요.</>
                ) : (
                    <>정상 수준. 현재 ratio 유지 중.</>
                )}
            </div>
        </div>
    );
}
