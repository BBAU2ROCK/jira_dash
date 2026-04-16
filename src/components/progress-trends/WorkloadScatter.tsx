import React from 'react';
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    ZAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from 'recharts';
import type { TeamForecast, WorkloadQuadrant } from '@/services/prediction/types';
import { useDisplayPreferenceStore } from '@/stores/displayPreferenceStore';
import { buildAnonymizeMap, maybeAnonymize } from '@/lib/anonymize';

const QUADRANT_COLOR: Record<WorkloadQuadrant, string> = {
    overload: '#ef4444',  // 좌상 — 과부하
    focus:    '#f59e0b',  // 우상 — 집중 필요
    capacity: '#94a3b8',  // 좌하 — 여유
    fast:     '#10b981',  // 우하 — 고속
};

const QUADRANT_LABEL: Record<WorkloadQuadrant, string> = {
    overload: '과부하',
    focus: '집중 필요',
    capacity: '여유',
    fast: '고속',
};

interface Props {
    team: TeamForecast | null;
}

interface ChartPoint {
    x: number;        // 일평균 처리량
    y: number;        // 잔여 건수
    name: string;
    fullName: string;
    quadrant: WorkloadQuadrant;
    activeDays: number;
}

export function WorkloadScatter({ team }: Props) {
    const anonymizeMode = useDisplayPreferenceStore((s) => s.anonymizeMode);
    const anonMap = React.useMemo(
        () => buildAnonymizeMap(team?.perAssignee.map((r) => r.displayName) ?? []),
        [team?.perAssignee]
    );

    if (!team || team.perAssignee.length === 0) {
        return null;
    }

    const data: ChartPoint[] = team.perAssignee.map((r) => {
        const fullName = maybeAnonymize(r.displayName, anonMap, anonymizeMode);
        return {
            x: r.avgDailyThroughput,
            y: r.remaining,
            name: fullName.length > 8 ? fullName.slice(0, 8) + '…' : fullName,
            fullName,
            quadrant: r.quadrant,
            activeDays: r.activeDays,
        };
    });

    const medianX = [...data.map((p) => p.x)].sort((a, b) => a - b)[Math.floor(data.length / 2)] ?? 0;
    const medianY = [...data.map((p) => p.y)].sort((a, b) => a - b)[Math.floor(data.length / 2)] ?? 0;

    // quadrant별 그룹핑 (recharts Scatter는 fill을 데이터 단위로 못 줘서 그룹마다 Scatter 분리)
    const grouped: Record<WorkloadQuadrant, ChartPoint[]> = {
        overload: [],
        focus: [],
        capacity: [],
        fast: [],
    };
    data.forEach((p) => grouped[p.quadrant].push(p));

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-800">워크로드 4분위</h3>
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    {(['overload', 'focus', 'capacity', 'fast'] as WorkloadQuadrant[]).map((q) => (
                        <span key={q} className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: QUADRANT_COLOR[q] }} />
                            {QUADRANT_LABEL[q]}
                        </span>
                    ))}
                </div>
            </div>
            <div
                className="h-[240px] w-full"
                role="img"
                aria-label={`워크로드 4분위 scatter chart, ${data.length}명, x축 일평균 처리량, y축 잔여 건수`}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" />
                        <XAxis
                            type="number"
                            dataKey="x"
                            name="일평균"
                            tick={{ fontSize: 10 }}
                            label={{ value: '일평균 처리량', position: 'insideBottom', offset: -8, fontSize: 11 }}
                        />
                        <YAxis
                            type="number"
                            dataKey="y"
                            name="잔여"
                            tick={{ fontSize: 10 }}
                            allowDecimals={false}
                            label={{ value: '잔여 건수', angle: -90, position: 'insideLeft', fontSize: 11 }}
                        />
                        <ZAxis range={[100, 100]} />
                        <ReferenceLine x={medianX} stroke="#cbd5e1" strokeDasharray="3 3" />
                        <ReferenceLine y={medianY} stroke="#cbd5e1" strokeDasharray="3 3" />
                        <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            content={({ active, payload }) => {
                                if (!active || !payload || payload.length === 0) return null;
                                const p = payload[0].payload as ChartPoint;
                                return (
                                    <div className="rounded-md border border-slate-200 bg-white p-2 shadow-sm text-xs">
                                        <div className="font-semibold text-slate-800">{p.fullName}</div>
                                        <div className="text-slate-600 mt-1">
                                            잔여 <strong>{p.y}</strong>건 · 일평균 <strong>{p.x}</strong>건
                                        </div>
                                        <div className="text-slate-500 mt-0.5">
                                            활동 {p.activeDays}일 · {QUADRANT_LABEL[p.quadrant]}
                                        </div>
                                    </div>
                                );
                            }}
                        />
                        {(Object.keys(grouped) as WorkloadQuadrant[]).map((q) =>
                            grouped[q].length > 0 ? (
                                <Scatter key={q} name={QUADRANT_LABEL[q]} data={grouped[q]} fill={QUADRANT_COLOR[q]} />
                            ) : null
                        )}
                    </ScatterChart>
                </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
                * 점선 = 중앙값. 좌상(과부하) → 도움 필요, 우상(집중 필요) → 진행 잘됨, 좌하(여유) → 추가 할당 가능, 우하(고속) → 다음 작업 준비.
            </p>
        </div>
    );
}
