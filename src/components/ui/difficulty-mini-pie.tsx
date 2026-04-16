import { cn } from '@/lib/utils';
import type { JiraIssue } from '@/api/jiraClient';
import { resolveFields } from '@/lib/kpi-rules-resolver';

const DIFFICULTY_COLORS: Record<string, string> = {
    '상': '#ef4444',      // red
    '높음': '#ef4444',
    'High': '#ef4444',
    '중': '#f59e0b',      // amber
    '중간': '#f59e0b',
    '보통': '#f59e0b',
    'Medium': '#f59e0b',
    '하': '#22c55e',      // green
    '낮음': '#22c55e',
    'Low': '#22c55e',
    'default': '#cbd5e1', // slate (미지정)
};

function getDifficultyLabel(issue: JiraIssue): string {
    // v1.0.10 S5: store 우선 참조
    const DIFF_FIELD = resolveFields().DIFFICULTY;
    const raw = issue.fields[DIFF_FIELD];
    if (raw == null) return '미지정';
    if (typeof raw === 'string') return raw.trim() || '미지정';
    if (typeof raw === 'object' && raw !== null) {
        const obj = raw as Record<string, unknown>;
        const v = obj.value ?? obj.name ?? obj.displayName;
        if (typeof v === 'string') return v.trim() || '미지정';
    }
    return '미지정';
}

function getColor(label: string): string {
    return DIFFICULTY_COLORS[label] ?? DIFFICULTY_COLORS['default'];
}

export interface DifficultyCount {
    label: string;
    count: number;
    color: string;
}

/** 이슈 배열에서 난이도 분포 추출 */
export function extractDifficultyBreakdown(issues: JiraIssue[]): DifficultyCount[] {
    const map = new Map<string, number>();
    for (const issue of issues) {
        const label = getDifficultyLabel(issue);
        map.set(label, (map.get(label) ?? 0) + 1);
    }
    return Array.from(map.entries())
        .map(([label, count]) => ({ label, count, color: getColor(label) }))
        .sort((a, b) => b.count - a.count);
}

interface MiniPieProps {
    /** 이슈 배열 직접 전달 — 내부에서 난이도 추출 */
    issues?: JiraIssue[];
    /** 또는 이미 추출된 breakdown 직접 전달 */
    breakdown?: DifficultyCount[];
    /** 크기 (px) */
    size?: number;
    className?: string;
}

/**
 * 난이도별 미니 파이차트 (SVG).
 * - 프로젝트 현황·KPI·진행 추이/예측 모든 탭의 담당자 표에서 재사용.
 * - 난이도 커버리지 0%면 회색 원 표시.
 */
export function DifficultyMiniPie({ issues, breakdown: breakdownProp, size = 28, className }: MiniPieProps) {
    const breakdown = breakdownProp ?? (issues ? extractDifficultyBreakdown(issues) : []);
    const total = breakdown.reduce((s, d) => s + d.count, 0);

    // 데이터 없거나 모두 미지정이면 회색 원
    const hasData = breakdown.some((d) => d.label !== '미지정' && d.count > 0);
    if (!hasData) {
        return (
            <svg width={size} height={size} className={cn('shrink-0', className)} aria-label="난이도 데이터 없음">
                <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="1" />
                <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" fontSize={size * 0.32}>
                    -
                </text>
            </svg>
        );
    }

    const r = size / 2 - 1;
    const cx = size / 2;
    const cy = size / 2;

    // mutable accumulation을 render 외부로 분리 (lint: react-compiler 호환)
    const filtered = breakdown.filter((d) => d.count > 0);
    const arcs: Array<{ d: string; color: string; label: string; count: number }> = [];
    {
        let accAngle = -90; // 12시 시작
        for (const d of filtered) {
            const angle = (d.count / total) * 360;
            const startAngle = accAngle;
            accAngle += angle;
            const endAngle = accAngle;
            const largeArc = angle > 180 ? 1 : 0;
            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;
            const x1 = cx + r * Math.cos(startRad);
            const y1 = cy + r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad);
            const y2 = cy + r * Math.sin(endRad);

            if (angle >= 359.9) {
                arcs.push({ d: `M ${cx - r},${cy} A ${r} ${r} 0 1 1 ${cx + r},${cy} A ${r} ${r} 0 1 1 ${cx - r},${cy}`, color: d.color, label: d.label, count: d.count });
            } else {
                arcs.push({
                    d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
                    color: d.color,
                    label: d.label,
                    count: d.count,
                });
            }
        }
    }

    return (
        <svg
            width={size}
            height={size}
            className={cn('shrink-0', className)}
            role="img"
            aria-label={`난이도: ${breakdown.map((d) => `${d.label} ${d.count}`).join(', ')}`}
        >
            {arcs.map((arc, i) => (
                <path key={i} d={arc.d} fill={arc.color}>
                    <title>{arc.label}: {arc.count}건</title>
                </path>
            ))}
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="white" strokeWidth="0.5" />
        </svg>
    );
}
