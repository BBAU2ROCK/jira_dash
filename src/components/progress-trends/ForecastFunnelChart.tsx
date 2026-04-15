import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { TeamForecast } from '@/services/prediction/types';
import { confidenceGuidance } from '@/services/prediction/confidence';

interface Props {
    team: TeamForecast | null;
}

/**
 * Forecast funnel — P50/P85/P95를 단순 막대(영업일)로 시각화.
 * Monte Carlo trial별 결과 분포는 상세 정보로 노출 가능 (Tier 3).
 */
export function ForecastFunnelChart({ team }: Props) {
    if (!team) return null;
    const guidance = confidenceGuidance(team.realistic.confidence);
    if (!guidance.showRange) {
        return (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                신뢰도 부족으로 분포 시각화 비활성. 진단 정보를 참조하세요.
            </div>
        );
    }

    const realistic = team.realistic;
    const data = [
        { label: 'P50', days: realistic.p50Days, date: realistic.p50Date, fill: '#93c5fd', desc: '50% 확률 (중앙값)' },
        { label: 'P85 ★', days: realistic.p85Days, date: realistic.p85Date, fill: '#2563eb', desc: '85% 확률 (권장 약속)' },
        { label: 'P95', days: realistic.p95Days, date: realistic.p95Date, fill: '#1e3a8a', desc: '95% 확률 (위험 최소화)' },
    ];

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-800">완료 확률 분포 (기준 시나리오)</h3>
                <span className="text-xs text-slate-500">잔여 {realistic.remainingCount}건</span>
            </div>
            <div className="mt-2 h-[180px] w-full" role="img" aria-label="P50/P85/P95 영업일 막대 차트">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fontWeight: 600 }} width={48} />
                        <Tooltip
                            cursor={{ fill: '#f1f5f9' }}
                            formatter={(v, _name, p) => [
                                `${v} 영업일 (${format(p.payload.date as Date, 'yyyy.MM.dd', { locale: ko })})`,
                                p.payload.desc as string,
                            ]}
                            labelFormatter={() => ''}
                        />
                        <Bar dataKey="days" radius={[0, 4, 4, 0]} fill="#2563eb" />
                        <ReferenceLine x={0} stroke="#475569" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
                * Monte Carlo 처리량 시뮬레이션 ({realistic.stats.activeDays}일 데이터, CV {realistic.stats.cv.toFixed(2)})
            </p>
        </div>
    );
}
