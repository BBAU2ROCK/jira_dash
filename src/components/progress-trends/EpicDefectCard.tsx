import { Bug, AlertTriangle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { defectRateToGrade } from '@/lib/defect-kpi-utils';
import type { EpicRetroSummary } from '@/services/retrospective/types';

const JIRA_BASE = 'https://okestro.atlassian.net/browse';

const GRADE_COLOR: Record<string, string> = {
    S: 'text-purple-700 bg-purple-100 border-purple-300',
    A: 'text-green-700 bg-green-100 border-green-300',
    B: 'text-blue-700 bg-blue-100 border-blue-300',
    C: 'text-amber-700 bg-amber-100 border-amber-300',
    D: 'text-red-700 bg-red-100 border-red-300',
};

const SEVERITY_COLOR: Record<string, string> = {
    Blocker: 'bg-red-100 text-red-800 border-red-200',
    Critical: 'bg-red-100 text-red-800 border-red-200',
    Highest: 'bg-red-100 text-red-800 border-red-200',
    High: 'bg-orange-100 text-orange-800 border-orange-200',
    Major: 'bg-orange-100 text-orange-800 border-orange-200',
    Medium: 'bg-amber-100 text-amber-800 border-amber-200',
    Normal: 'bg-amber-100 text-amber-800 border-amber-200',
    Low: 'bg-blue-100 text-blue-800 border-blue-200',
    Lowest: 'bg-blue-100 text-blue-800 border-blue-200',
    Minor: 'bg-blue-100 text-blue-800 border-blue-200',
    Trivial: 'bg-blue-100 text-blue-800 border-blue-200',
};

function sevColor(name: string): string {
    return SEVERITY_COLOR[name] ?? 'bg-slate-100 text-slate-700 border-slate-200';
}

interface Props {
    summary: EpicRetroSummary;
}

/**
 * 결함 회고 카드 — 에픽 회고 카드 옆에 독립 배치.
 * 결함 매핑이 있으면 Defect Density + 심각도 분포 + 등급.
 * 없으면 등록 안내.
 */
export function EpicDefectCard({ summary }: Props) {
    const stats = summary.defectStats;
    const grade = stats ? defectRateToGrade(stats.defectsPerCompletedTask) : null;
    const gradeColor = grade ? GRADE_COLOR[grade] ?? '' : '';

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                    <a
                        href={`${JIRA_BASE}/${summary.epicKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                        {summary.epicKey}
                        <ExternalLink className="h-3 w-3" />
                    </a>
                    <h3 className="text-sm font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                        <Bug className="h-4 w-4 text-red-500" />
                        결함 회고
                    </h3>
                </div>
                {grade && (
                    <span className={cn('rounded-full border px-2 py-0.5 text-xs font-bold shrink-0', gradeColor)}>
                        {grade}
                    </span>
                )}
            </div>

            {stats ? (
                <div className="flex-1 space-y-3">
                    {/* 핵심 메트릭 */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded border border-slate-200 bg-slate-50 p-3">
                            <div className="text-[10px] text-slate-500">결함 등록 <InfoTip>매핑된 결함 에픽(TQ)의 leaf 이슈 수. 이 에픽에 연결된 결함 전체.</InfoTip></div>
                            <div className="text-2xl font-bold text-red-600 tabular-nums">{stats.defectCount}<span className="text-base font-normal text-slate-500"> 건</span></div>
                        </div>
                        <div className="rounded border border-slate-200 bg-slate-50 p-3">
                            <div className="text-[10px] text-slate-500">Defect Density <InfoTip>결함 수 ÷ 완료 task 수 × 100. 등급: S≤5% A≤10% B≤15% C≤20% D그외.</InfoTip></div>
                            <div className="text-2xl font-bold text-slate-800 tabular-nums">{stats.defectsPerCompletedTask}<span className="text-base font-normal text-slate-500">%</span></div>
                            <div className="text-[9px] text-slate-400">완료 task 대비</div>
                        </div>
                    </div>

                    {/* 심각도 분포 */}
                    {stats.severityBreakdown.length > 0 && (
                        <div>
                            <div className="text-[11px] font-medium text-slate-600 mb-1.5">심각도 분포</div>
                            <div className="flex flex-wrap gap-1.5">
                                {stats.severityBreakdown.map((s) => (
                                    <span
                                        key={s.name}
                                        className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs', sevColor(s.name))}
                                    >
                                        <span className="font-semibold">{s.name}</span>
                                        <span className="tabular-nums font-bold">{s.count}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 추가 정보 — 등급 해석 */}
                    <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                        등급: S ≤5%, A ≤10%, B ≤15%, C ≤20%, D 그 외.
                        <span className="text-amber-700 font-medium ml-1">결함은 시스템 신호 — 개인 책임 X.</span>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col justify-center items-center text-center text-sm text-slate-500 gap-2 py-6">
                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                    <span className="font-semibold">결함 매핑 미등록</span>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-[200px]">
                        KPI 성과 탭 → 결함 KPI → 「개발 ↔ 결함 에픽 매핑」에서 등록하면 에픽별 결함 회고가 표시됩니다.
                    </p>
                </div>
            )}
        </div>
    );
}
