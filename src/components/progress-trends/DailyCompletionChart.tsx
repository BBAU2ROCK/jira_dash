import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { DailyPoint } from '@/services/prediction/types';
import { CHART, CHART_FONT } from '@/lib/chart-tokens';

interface Props {
    series: DailyPoint[] | null;
    title?: string;
}

export function DailyCompletionChart({ series, title = '일별 완료 추이 (최근 30일)' }: Props) {
    if (!series || series.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-card p-4 card-hover">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">데이터 없음</p>
            </div>
        );
    }
    const data = series.map((p) => ({
        date: p.date.slice(5).replace('-', '.'), // 'MM.DD'
        count: p.count,
    }));
    const total = series.reduce((s, p) => s + p.count, 0);
    const max = Math.max(...series.map((p) => p.count), 1);

    return (
        <div className="rounded-lg border border-border bg-card p-4 card-hover">
            <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <div className="text-xs text-muted-foreground">
                    합계 <span className="font-semibold text-foreground tabular-nums">{total}</span>건 · 최대{' '}
                    <span className="font-semibold text-foreground tabular-nums">{max}</span>건/일
                </div>
            </div>
            <div
                className="mt-2 h-[200px] w-full"
                role="img"
                aria-label={`${title}, 합계 ${total}건, 최대 일당 ${max}건`}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                        <XAxis
                            dataKey="date"
                            tick={CHART_FONT}
                            interval={Math.ceil(data.length / 10)}
                            stroke={CHART.axisLine}
                        />
                        <YAxis
                            allowDecimals={false}
                            tick={CHART_FONT}
                            width={24}
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
                            formatter={(v) => [`${v}건`, '완료']}
                            labelFormatter={(d) => `${d}`}
                        />
                        <Bar dataKey="count" fill={CHART.primary} radius={[3, 3, 0, 0]} name="완료" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
