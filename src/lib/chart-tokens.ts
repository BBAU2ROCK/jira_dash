/**
 * Chart Design Tokens (v1.0.21).
 *
 * recharts SVG fill/stroke에 직접 사용 가능한 CSS variable 래퍼.
 * 다크모드 자동 대응 (브라우저가 var() 평가 시 .dark 컨텍스트 적용).
 *
 * 사용 패턴:
 *   <Bar fill={CHART.primary} />
 *   <ReferenceLine stroke={CHART.gridStrong} />
 */

export const CHART = {
    /** 5색 팔레트 — index.css --chart-1~5 와 정합 */
    primary:    'hsl(var(--chart-1))',  // blue
    success:    'hsl(var(--chart-2))',  // emerald
    warning:    'hsl(var(--chart-3))',  // amber
    danger:     'hsl(var(--chart-4))',  // red
    neutral:    'hsl(var(--chart-5))',  // slate

    /** 강조 단계 (P50/P85/P95 등) */
    primaryLight: 'hsl(var(--chart-1) / 0.45)',
    primaryDark:  'hsl(var(--chart-1) / 1)',
    primaryDeep:  'hsl(var(--chart-1) / 1.15)', // not 의미 있음 (CSS clamp)

    /** Surface / Grid / Axis */
    grid:       'hsl(var(--border))',
    gridStrong: 'hsl(var(--border) / 0.8)',
    axisText:   'hsl(var(--muted-foreground))',
    axisLine:   'hsl(var(--muted-foreground) / 0.4)',
    cursor:     'hsl(var(--muted) / 0.5)',
    tooltipBg:  'hsl(var(--popover))',
    tooltipBorder: 'hsl(var(--border))',

    /** Workload 4분위 (의미 부여 색) */
    overload: 'hsl(var(--chart-4))',  // 빨강 — 위험
    focus:    'hsl(var(--chart-3))',  // 주황 — 주목
    capacity: 'hsl(var(--chart-5))',  // 회색 — 중립
    fast:     'hsl(var(--chart-2))',  // 초록 — 양호

    /** Confidence levels */
    confHigh:       'hsl(var(--chart-2))',
    confMedium:     'hsl(var(--chart-1))',
    confLow:        'hsl(var(--chart-3))',
    confUnreliable: 'hsl(var(--chart-5) / 0.5)',
} as const;

/**
 * 차트 텍스트 / Tick 공용 스타일.
 * fontSize: 11 — 데스크톱 표준 (10은 너무 작아 가독성 ↓)
 * 폰트는 시스템 inherit (SVG <text> 는 default 'sans-serif' 라 명시).
 */
export const CHART_FONT = {
    fontSize: 11,
    fontFamily: 'inherit',
    fill: 'hsl(var(--muted-foreground))',
} as const;
