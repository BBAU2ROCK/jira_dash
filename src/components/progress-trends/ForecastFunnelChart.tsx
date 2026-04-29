import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { TeamForecast } from '@/services/prediction/types';
import { confidenceGuidance } from '@/services/prediction/confidence';
import { ConfidenceBadge } from '@/components/ui/confidence-badge';
import { CHART, CHART_FONT } from '@/lib/chart-tokens';

interface Props {
    team: TeamForecast | null;
}

/**
 * Forecast funnel — P50/P85/P95를 단순 막대(영업일)로 시각화.
 */
export function ForecastFunnelChart({ team }: Props) {
    if (!team) return null;
    const guidance = confidenceGuidance(team.realistic.confidence);
    if (!guidance.showRange) {
        return (
            <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground card-hover">
                신뢰도 부족으로 분포 시각화 비활성. 진단 정보를 참조하세요.
            </div>
        );
    }

    const realistic = team.realistic;
    // P50/P85/P95 단계별 색상 진하기 — token 기반 alpha
    const data = [
        { label: 'P50', days: realistic.p50Days, date: realistic.p50Date, fill: 'hsl(var(--chart-1) / 0.4)', desc: '50% 확률 (중앙값)' },
        { label: 'P85 ★', days: realistic.p85Days, date: realistic.p85Date, fill: 'hsl(var(--chart-1) / 1)', desc: '85% 확률 (권장 약속)' },
        { label: 'P95', days: realistic.p95Days, date: realistic.p95Date, fill: 'hsl(var(--chart-1) / 1.0) ', desc: '95% 확률 (위험 최소화)' },
    ];

    return (
        <div className="rounded-lg border border-border bg-card p-4 card-hover">
            <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">완료 확률 분포 (기준 시나리오)</h3>
                <div className="flex items-center gap-2">
                    <ConfidenceBadge level={realistic.confidence} showLabel={false} />
                    <span className="text-xs text-muted-foreground">
                        잔여 <span className="tabular-nums font-semibold text-foreground">{realistic.remainingCount}</span>건
                    </span>
                </div>
            </div>
            <div className="mt-2 h-[180px] w-full" role="img" aria-label="P50/P85/P95 영업일 막대 차트">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
                        <XAxis type="number" tick={CHART_FONT} stroke={CHART.axisLine} />
                        <YAxis
                            type="category"
                            dataKey="label"
                            tick={{ ...CHART_FONT, fontWeight: 600 }}
                            width={48}
                            stroke={CHART.axisLine}
                        />
                        <Tooltip
                            cursor={{ fill: CHART.cursor }}
                            contentStyle={{
                                background: CHART.tooltipBg,
                                border: `1px solid ${CHART.tooltipBorder}`,
                                borderRadius: 8,
                                fontSize: 12,
                                padding: '6px 10px',
                                boxShadow: 'var(--shadow-md)',
                            }}
                            formatter={(v, _name, p) => [
                                `${v} 영업일 (${format(p.payload.date as Date, 'yyyy.MM.dd', { locale: ko })})`,
                                p.payload.desc as string,
                            ]}
                            labelFormatter={() => ''}
                        />
                        <Bar dataKey="days" radius={[0, 4, 4, 0]}>
                            {data.map((d, i) => (
                                <Cell key={i} fill={d.fill} />
                            ))}
                        </Bar>
                        <ReferenceLine x={0} stroke={CHART.axisLine} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
                * Monte Carlo 처리량 시뮬레이션 (<span className="tabular-nums">{realistic.stats.activeDays}</span>일 데이터, CV <span className="tabular-nums">{realistic.stats.cv.toFixed(2)}</span>)
            </p>
        </div>
    );
}
