/**
 * v1.0.16: 데이터 충족 현황 카드.
 *
 * 사용자 질문 "어느 정도 데이터가 쌓여야 표시할 수 있는지?" 에 답하는 UI.
 * 활동일·변동성(CV)·유입비율 진행 바 + 다음 등급까지 필요한 조건 명시.
 *
 * 정직성 원칙: 현재 신뢰도 등급의 객관적 근거 + 어떻게 개선하는지 안내.
 */

import React from 'react';
import { CheckCircle2, AlertCircle, XCircle, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { computeReadiness, type ReadinessMetric } from '@/services/prediction/confidence';
import type { ConfidenceLevel, ThroughputStats } from '@/services/prediction/types';

interface Props {
    /** Monte Carlo 통계 — TeamForecast.realistic.stats 또는 perAssignee의 stats */
    stats: ThroughputStats | null;
    /** 등급 표시 모드: 메인 (큰 카드) / 컴팩트 (인라인) */
    variant?: 'full' | 'compact';
}

const LEVEL_LABEL: Record<ConfidenceLevel, { ko: string; color: string; bg: string }> = {
    high:        { ko: '높음',        color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 border-green-300 dark:border-green-900/60' },
    medium:      { ko: '중간',        color: 'text-blue-700 dark:text-blue-300',  bg: 'bg-blue-100 border-blue-300 dark:border-blue-900/60' },
    low:         { ko: '낮음',        color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 border-amber-300 dark:border-amber-900/60' },
    unreliable:  { ko: '데이터 부족',  color: 'text-red-700 dark:text-red-300',   bg: 'bg-red-100 border-red-300 dark:border-red-900/60' },
};

function formatValue(m: ReadinessMetric): string {
    if (m.format === 'days') return `${m.current}일`;
    if (m.format === 'pct') return `${Math.round(m.current * 100)}%`;
    return m.current.toFixed(2);
}

function ProgressBar({ value, status }: { value: number; status: 'good' | 'warn' | 'bad' }) {
    const colorMap = {
        good: 'bg-green-500',
        warn: 'bg-amber-400',
        bad: 'bg-red-400',
    };
    return (
        <div className="h-2 bg-muted/60 rounded overflow-hidden">
            <div className={cn('h-full transition-all', colorMap[status])} style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
        </div>
    );
}

function StatusIcon({ status }: { status: 'good' | 'warn' | 'bad' }) {
    if (status === 'good') return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
    if (status === 'warn') return <AlertCircle className="h-3.5 w-3.5 text-amber-600" />;
    return <XCircle className="h-3.5 w-3.5 text-red-600" />;
}

export function DataReadinessCard({ stats, variant = 'full' }: Props) {
    // Hook 규칙: 조건부 분기보다 useMemo가 먼저
    const computed = React.useMemo(
        () => (stats ? computeReadiness(stats) : null),
        [stats]
    );

    if (!stats || !computed) {
        return (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                ℹ 데이터 통계가 없습니다 — 처리량 분석 불가
            </div>
        );
    }

    const { currentLevel, metrics, nextRequirements } = computed;
    const level = LEVEL_LABEL[currentLevel];

    if (variant === 'compact') {
        // 인라인 1줄 — 현재 등급 + 다음 등급 1줄 안내
        const nextReq = nextRequirements[0];
        return (
            <div className="text-[11px] text-foreground/80 inline-flex items-center gap-2 flex-wrap">
                <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold', level.bg, level.color)}>
                    {level.ko}
                </span>
                {nextReq && !nextReq.achievable && (
                    <span className="text-muted-foreground">
                        → '{LEVEL_LABEL[nextReq.target].ko}' 까지: {nextReq.items.filter((i) => !i.met).map((i) => i.need).join(', ')}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    데이터 충족 현황
                    <InfoTip>
                        예측 정확도는 활동 일수·처리 일관성·백로그 안정성에 따라 4단계로 결정됩니다.
                        지표가 임계값을 충족할수록 더 정밀한 ETA·확률 분포 표시.
                    </InfoTip>
                </h3>
                <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold', level.bg, level.color)}>
                    현재 등급: {level.ko}
                </span>
            </div>

            {/* 3개 지표 진행 바 */}
            <div className="space-y-3">
                {metrics.map((m) => (
                    <div key={m.label}>
                        <div className="flex items-baseline justify-between text-[11px] mb-0.5">
                            <span className="text-foreground/90 font-medium inline-flex items-center gap-1">
                                <StatusIcon status={m.status} />
                                {m.label}
                                <InfoTip size="sm">{m.tip}</InfoTip>
                            </span>
                            <span className="tabular-nums text-foreground/80">
                                <span className="font-bold">{formatValue(m)}</span>
                                <span className="text-muted-foreground ml-1">
                                    {m.format === 'cv' && '(낮을수록 안정)'}
                                    {m.format === 'ratio' && '(낮을수록 마무리)'}
                                </span>
                            </span>
                        </div>
                        <ProgressBar value={m.progress} status={m.status} />
                        {/* 임계값 마커들 */}
                        <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5 px-px">
                            {m.targets.map((t) => (
                                <span key={t.level} className={cn(t.meet ? 'text-green-600 font-bold' : 'text-muted-foreground')}>
                                    {t.meet ? '✓' : '·'} {LEVEL_LABEL[t.level].ko} {t.comparator}{m.format === 'days' ? `${t.threshold}일` : t.threshold}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* 다음 등급 요건 */}
            {nextRequirements.length > 0 && (
                <div className="mt-4 space-y-2">
                    {nextRequirements.map((req) => {
                        const targetMeta = LEVEL_LABEL[req.target];
                        return (
                            <div
                                key={req.target}
                                className={cn(
                                    'rounded-md border p-2.5 text-[11px]',
                                    req.achievable ? 'border-green-200 dark:border-green-900/60 bg-green-50 dark:bg-green-950/30' : 'border-border bg-muted/40'
                                )}
                            >
                                <div className={cn('font-semibold mb-1 inline-flex items-center gap-1', req.achievable ? 'text-green-800 dark:text-green-300' : 'text-foreground/90')}>
                                    {req.achievable ? '✓' : '🎯'} '{targetMeta.ko}' 등급 가능 조건
                                    {req.achievable && <span className="text-[10px] text-green-700 dark:text-green-300 ml-1">(다음 갱신 시 달성!)</span>}
                                </div>
                                <ul className="space-y-0.5 ml-3">
                                    {req.items.map((it, i) => (
                                        <li key={i} className={it.met ? 'text-green-700 dark:text-green-300' : 'text-foreground/80'}>
                                            <span className="font-medium">{it.name}:</span> {it.need}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            )}

            <p className="mt-3 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
                기준: 활동 7일↑ 예측 가능 / 14일↑ 중간 / 30일↑ 높음 가능. CV ≤ 0.5 안정. 유입/완료 비율 ≤ 1.0 안정.
                <span className="text-amber-700 dark:text-amber-300 font-medium ml-1">정직성 원칙 — 데이터 부족 시 단일 날짜 표시 안 함.</span>
            </p>
        </div>
    );
}
