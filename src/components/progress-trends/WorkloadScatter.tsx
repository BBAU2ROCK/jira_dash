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
import { CHART, CHART_FONT } from '@/lib/chart-tokens';

const QUADRANT_COLOR: Record<WorkloadQuadrant, string> = {
    overload: CHART.overload,  // 좌상 — 과부하 (red)
    focus:    CHART.focus,     // 우상 — 집중 필요 (amber)
    capacity: CHART.capacity,  // 좌하 — 여유 (slate)
    fast:     CHART.fast,      // 우하 — 고속 (emerald)
};

// v1.0.20 색맹 대응 — 색상에 더해 모양으로도 4분위 구분 가능 (WCAG 1.4.1).
const QUADRANT_SHAPE: Record<WorkloadQuadrant, 'triangle' | 'square' | 'diamond' | 'circle'> = {
    overload: 'triangle', // 위험 ↑
    focus:    'square',   // 집중
    capacity: 'diamond',  // 여유
    fast:     'circle',   // 기본 (고속)
};

const QUADRANT_LABEL: Record<WorkloadQuadrant, string> = {
    overload: '과부하',
    focus: '집중 필요',
    capacity: '여유',
    fast: '고속',
};

/** 색맹 대응 보조: 4분위별 mini SVG 마커 (범례용) */
function QuadrantMarker({ quadrant }: { quadrant: WorkloadQuadrant }) {
    const color = QUADRANT_COLOR[quadrant];
    const shape = QUADRANT_SHAPE[quadrant];
    const common = { fill: color, stroke: color };
    return (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            {shape === 'circle' && <circle cx="5" cy="5" r="4" {...common} />}
            {shape === 'square' && <rect x="1" y="1" width="8" height="8" {...common} />}
            {shape === 'triangle' && <polygon points="5,1 9,9 1,9" {...common} />}
            {shape === 'diamond' && <polygon points="5,1 9,5 5,9 1,5" {...common} />}
        </svg>
    );
}

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
        <div className="rounded-lg border border-border bg-card p-4 card-hover">
            <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-sm font-semibold text-foreground">워크로드 4분위</h3>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {(['overload', 'focus', 'capacity', 'fast'] as WorkloadQuadrant[]).map((q) => (
                        <span key={q} className="flex items-center gap-1">
                            <QuadrantMarker quadrant={q} />
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
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                        <XAxis
                            type="number"
                            dataKey="x"
                            name="일평균"
                            tick={CHART_FONT}
                            stroke={CHART.axisLine}
                            label={{ value: '일평균 처리량', position: 'insideBottom', offset: -8, ...CHART_FONT }}
                        />
                        <YAxis
                            type="number"
                            dataKey="y"
                            name="잔여"
                            tick={CHART_FONT}
                            stroke={CHART.axisLine}
                            allowDecimals={false}
                            label={{ value: '잔여 건수', angle: -90, position: 'insideLeft', ...CHART_FONT }}
                        />
                        <ZAxis range={[100, 100]} />
                        <ReferenceLine x={medianX} stroke={CHART.axisLine} strokeDasharray="3 3" />
                        <ReferenceLine y={medianY} stroke={CHART.axisLine} strokeDasharray="3 3" />
                        <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            content={({ active, payload }) => {
                                if (!active || !payload || payload.length === 0) return null;
                                const p = payload[0].payload as ChartPoint;
                                return (
                                    <div
                                        className="rounded-md border bg-popover p-2 text-xs"
                                        style={{ borderColor: CHART.tooltipBorder, boxShadow: 'var(--shadow-md)' }}
                                    >
                                        <div className="font-semibold text-foreground">{p.fullName}</div>
                                        <div className="text-foreground/80 mt-1">
                                            잔여 <strong className="tabular-nums">{p.y}</strong>건 · 일평균 <strong className="tabular-nums">{p.x}</strong>건
                                        </div>
                                        <div className="text-muted-foreground mt-0.5">
                                            활동 <span className="tabular-nums">{p.activeDays}</span>일 · {QUADRANT_LABEL[p.quadrant]}
                                        </div>
                                    </div>
                                );
                            }}
                        />
                        {(Object.keys(grouped) as WorkloadQuadrant[]).map((q) =>
                            grouped[q].length > 0 ? (
                                <Scatter
                                    key={q}
                                    name={QUADRANT_LABEL[q]}
                                    data={grouped[q]}
                                    fill={QUADRANT_COLOR[q]}
                                    shape={QUADRANT_SHAPE[q]}
                                />
                            ) : null
                        )}
                    </ScatterChart>
                </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
                * 점선 = 중앙값. 좌상(과부하) → 도움 필요, 우상(집중 필요) → 진행 잘됨, 좌하(여유) → 추가 할당 가능, 우하(고속) → 다음 작업 준비.
            </p>
        </div>
    );
}
