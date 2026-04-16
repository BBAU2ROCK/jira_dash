/**
 * v1.0.12 F2-2: 결함 심각도 색상 매핑 — 공용 헬퍼.
 *
 * EpicDefectCard 와 DefectPatternCard 가 각자 중복 정의하던 SEVERITY_COLOR를 여기로 이동.
 * Jira 공식 Severity + 회사 내부 명칭(한글) 모두 지원.
 */

/** 심각도 이름별 Tailwind 클래스 (bg + text + border) */
const SEVERITY_COLOR_MAP: Record<string, string> = {
    // 최고 위험 — 빨강
    Blocker: 'bg-red-100 text-red-800 border-red-300',
    Critical: 'bg-red-100 text-red-800 border-red-300',
    Highest: 'bg-red-100 text-red-800 border-red-300',
    치명적: 'bg-red-100 text-red-800 border-red-300',

    // 높음 — 주황
    High: 'bg-orange-100 text-orange-800 border-orange-300',
    Major: 'bg-orange-100 text-orange-800 border-orange-300',
    중대: 'bg-orange-100 text-orange-800 border-orange-300',

    // 보통 — 황색
    Medium: 'bg-amber-100 text-amber-800 border-amber-300',
    Normal: 'bg-amber-100 text-amber-800 border-amber-300',
    보통: 'bg-amber-100 text-amber-800 border-amber-300',

    // 낮음 — 파랑
    Low: 'bg-blue-100 text-blue-800 border-blue-300',
    Lowest: 'bg-blue-100 text-blue-800 border-blue-300',
    Minor: 'bg-blue-100 text-blue-800 border-blue-300',
    Trivial: 'bg-blue-100 text-blue-800 border-blue-300',
    경미: 'bg-blue-100 text-blue-800 border-blue-300',
};

/** 심각도 이름 → Tailwind 클래스. 매핑 없으면 기본 slate. */
export function severityColorClass(name: string): string {
    return SEVERITY_COLOR_MAP[name] ?? 'bg-slate-100 text-slate-700 border-slate-300';
}

/**
 * 심각도 가중 점수 (severity-weighted defect count).
 * Phase 4 인사이트 엔진에서 사용 — 단순 건수가 아닌 "위험도 총합".
 *
 * 가중치: Critical/Blocker=5, High/Major=3, Medium=2, Low/Minor=1, 기타=1.
 */
export function severityWeight(name: string): number {
    if (/(blocker|critical|highest|치명적)/i.test(name)) return 5;
    if (/(high|major|중대)/i.test(name)) return 3;
    if (/(medium|normal|보통)/i.test(name)) return 2;
    if (/(low|lowest|minor|trivial|경미)/i.test(name)) return 1;
    return 1;
}

/** 심각도 breakdown 배열 → 총 가중 점수 */
export function weightedSeverityScore(breakdown: Array<{ name: string; count: number }>): number {
    return breakdown.reduce((sum, s) => sum + severityWeight(s.name) * s.count, 0);
}

/** 심각도 breakdown 에서 'Critical 이상' 건수 */
export function criticalPlusCount(breakdown: Array<{ name: string; count: number }>): number {
    return breakdown
        .filter((s) => severityWeight(s.name) >= 3)
        .reduce((sum, s) => sum + s.count, 0);
}
