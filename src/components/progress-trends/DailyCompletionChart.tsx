import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { DailyPoint } from '@/services/prediction/types';

interface Props {
    series: DailyPoint[] | null;
    title?: string;
}

export function DailyCompletionChart({ series, title = '일별 완료 추이 (최근 30일)' }: Props) {
    if (!series || series.length === 0) {
        return (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
                <p className="mt-2 text-sm text-slate-500">데이터 없음</p>
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
        <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
                <div className="text-xs text-slate-500">
                    합계 <span className="font-semibold text-slate-700">{total}건</span> · 최대{' '}
                    <span className="font-semibold text-slate-700">{max}건/일</span>
                </div>
            </div>
            <div
                className="mt-2 h-[200px] w-full"
                role="img"
                aria-label={`${title}, 합계 ${total}건, 최대 일당 ${max}건`}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.ceil(data.length / 10)} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} />
                        <Tooltip
                            cursor={{ fill: '#f1f5f9' }}
                            formatter={(v) => [`${v}건`, '완료']}
                            labelFormatter={(d) => `${d}`}
                        />
                        <Bar dataKey="count" fill="#2563eb" radius={[2, 2, 0, 0]} name="완료" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
