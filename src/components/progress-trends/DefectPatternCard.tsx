import React from 'react';
import { Bug, AlertCircle, ChevronRight, ChevronDown, TrendingUp, Award, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDisplayPreferenceStore } from '@/stores/displayPreferenceStore';
import { buildAnonymizeMap, maybeAnonymize } from '@/lib/anonymize';
import { severityColorClass } from '@/lib/defect-severity-color';
import { InfoTip } from '@/components/ui/info-tip';
import type { DefectKpiDeveloperRow } from '@/lib/defect-kpi-utils';
import type { DeveloperStrengthRow } from '@/services/retrospective/types';
import {
    analyzeDeveloperProfile,
    computeTeamBaseline,
    profileMeta,
    type DeveloperProfile,
} from '@/services/retrospective/developerInsights';

const GRADE_COLOR: Record<DefectKpiDeveloperRow['grade'], string> = {
    S: 'bg-purple-100 text-purple-800 border-purple-300',
    A: 'bg-green-100 text-green-800 border-green-300',
    B: 'bg-blue-100 text-blue-800 border-blue-300',
    C: 'bg-amber-100 text-amber-800 border-amber-300',
    D: 'bg-red-100 text-red-800 border-red-300',
    '—': 'bg-slate-100 text-slate-600 border-slate-300',
};

const PROFILE_COLOR: Record<DeveloperProfile, string> = {
    mentor: 'bg-purple-100 text-purple-800 border-purple-300',
    balanced: 'bg-blue-100 text-blue-800 border-blue-300',
    specialized: 'bg-green-100 text-green-800 border-green-300',
    'needs-support': 'bg-amber-100 text-amber-800 border-amber-300',
    'new-joiner': 'bg-slate-100 text-slate-600 border-slate-300',
};

interface Props {
    rows: DefectKpiDeveloperRow[];
    isLoading?: boolean;
    mappingCount: number;
    workerFieldResolved: boolean;
    /** v1.0.12 F4: 담당자 강점 매트릭스 — 페르소나 분석에 사용 */
    strengthRows?: DeveloperStrengthRow[];
}

/**
 * v1.0.12 F4: 회고 — 담당자별 결함 패턴 + 개별 인사이트 드릴다운.
 *
 * 기존: 담당/결함/비율/심각도/등급 5컬럼 테이블
 * 신규: 행 클릭 → 강점·개선점·페르소나·백분위 펼침
 */
export function DefectPatternCard({ rows, isLoading, mappingCount, workerFieldResolved, strengthRows = [] }: Props) {
    const anonymizeMode = useDisplayPreferenceStore((s) => s.anonymizeMode);
    const anonMap = React.useMemo(
        () => buildAnonymizeMap(rows.map((r) => r.displayName)),
        [rows]
    );

    const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

    // 팀 baseline + 개별 인사이트 (useMemo 캐시)
    const { baseline, insights } = React.useMemo(() => {
        const base = computeTeamBaseline(rows, strengthRows);
        const allRates = rows
            .map((r) => r.defectRatePercent)
            .filter((v): v is number => v != null);
        const map = new Map<string, ReturnType<typeof analyzeDeveloperProfile>>();
        for (const r of rows) {
            const strength = strengthRows.find((s) => s.key === r.key);
            map.set(r.key, analyzeDeveloperProfile(r, strength, base, allRates));
        }
        return { baseline: base, insights: map };
    }, [rows, strengthRows]);

    const toggle = (key: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    if (mappingCount === 0) {
        return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <div>
                    <p className="font-semibold">결함 매핑 미등록</p>
                    <p className="mt-0.5 text-xs">
                        KPI 성과 탭 → 결함 KPI → 「개발 ↔ 결함 에픽 매핑」에서 등록하면
                        담당자별 task당 결함 발생률이 회고에 표시됩니다.
                    </p>
                </div>
            </div>
        );
    }

    if (!workerFieldResolved && !isLoading) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                Jira에 「작업자」 필드를 찾지 못했습니다. defectKpiConfig.ts의 WORKER_FIELD_NAMES 확인 필요.
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                결함 데이터 분석 중...
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                매핑된 에픽에 결함 데이터가 없습니다.
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2">
                <Bug className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-semibold text-slate-800">담당자별 결함 패턴 + 개인 인사이트</h3>
                <InfoTip size="sm">
                    행을 클릭하면 강점·개선 포인트·페르소나가 펼쳐집니다.
                    팀 중앙값({baseline.medianDefectRate.toFixed(1)}% defect rate, {baseline.medianCycleTime.toFixed(1)}d cycle) 기준으로 비교.
                </InfoTip>
                <span className="text-[11px] text-slate-500 ml-auto">{rows.length}명</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-left w-6"></th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-left">담당자</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">담당 task</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">결함</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-right">
                                <span className="inline-flex items-center gap-1 justify-end">
                                    비율
                                    <InfoTip size="sm">Defect Density = 결함 ÷ 담당 × 100</InfoTip>
                                </span>
                            </th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-left">심각도</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-center">프로파일</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-slate-600 text-center">등급</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map((r) => {
                            const displayName = maybeAnonymize(r.displayName, anonMap, anonymizeMode);
                            const gradeColor = GRADE_COLOR[r.grade];
                            const insight = insights.get(r.key);
                            const profile = insight?.profile ?? 'balanced';
                            const pMeta = profileMeta(profile);
                            const isExpanded = expanded.has(r.key);
                            return (
                                <React.Fragment key={r.key}>
                                    <tr
                                        className={cn('cursor-pointer hover:bg-slate-50', isExpanded && 'bg-blue-50/40')}
                                        onClick={() => toggle(r.key)}
                                    >
                                        <td className="px-2 py-1.5 text-slate-400">
                                            {isExpanded ? (
                                                <ChevronDown className="h-3.5 w-3.5" />
                                            ) : (
                                                <ChevronRight className="h-3.5 w-3.5" />
                                            )}
                                        </td>
                                        <td className="px-2 py-1.5 text-slate-800 font-medium">{displayName}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">{r.devIssueCount}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums text-red-600 font-medium">{r.defectCount}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums">
                                            {r.defectRatePercent != null ? `${r.defectRatePercent}%` : '—'}
                                        </td>
                                        <td className="px-2 py-1.5 align-top">
                                            {r.severityBreakdown.length === 0 ? (
                                                <span className="text-slate-400 text-xs">—</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1">
                                                    {r.severityBreakdown.slice(0, 4).map((s) => (
                                                        <span
                                                            key={s.name}
                                                            className={cn(
                                                                'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-none',
                                                                severityColorClass(s.name)
                                                            )}
                                                            title={`${s.name} ${s.count}건`}
                                                        >
                                                            <span className="font-medium truncate max-w-[70px]">{s.name}</span>
                                                            <span className="font-bold tabular-nums">{s.count}</span>
                                                        </span>
                                                    ))}
                                                    {r.severityBreakdown.length > 4 && (
                                                        <span className="text-[10px] text-slate-400 self-center">+{r.severityBreakdown.length - 4}</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                            <span
                                                className={cn('inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap', PROFILE_COLOR[profile])}
                                                title={pMeta.description}
                                            >
                                                {pMeta.label}
                                            </span>
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                            <span className={cn('inline-block rounded-full border px-2 py-0.5 text-xs font-bold', gradeColor)}>
                                                {r.grade}
                                            </span>
                                        </td>
                                    </tr>

                                    {/* 펼침 — 인사이트 상세 */}
                                    {isExpanded && insight && (
                                        <tr className="bg-slate-50/60">
                                            <td></td>
                                            <td colSpan={7} className="px-3 py-3 border-t border-slate-200">
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                                    {/* 팀 위치 */}
                                                    <div className="rounded border border-slate-200 bg-white p-2.5">
                                                        <div className="text-[11px] font-semibold text-slate-600 mb-1.5 inline-flex items-center gap-1">
                                                            <Target className="h-3.5 w-3.5 text-blue-500" />
                                                            팀 내 위치
                                                        </div>
                                                        {insight.defectRatePercentile != null ? (
                                                            <div>
                                                                <div className="text-xs text-slate-700">
                                                                    결함율 상위 <span className="font-bold text-blue-700">{insight.defectRatePercentile}%</span>
                                                                    <span className="text-slate-500"> (낮을수록 좋음)</span>
                                                                </div>
                                                                {insight.primaryIssueType && (
                                                                    <div className="text-[11px] text-slate-500 mt-0.5">
                                                                        주력 타입: <span className="text-slate-700">{insight.primaryIssueType}</span>
                                                                    </div>
                                                                )}
                                                                <div className="text-[11px] text-slate-500 mt-0.5">
                                                                    심각도 가중: <span className="font-bold text-slate-700">{insight.severityWeightedScore}</span>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-[11px] text-slate-400 italic">표본 부족 — 백분위 계산 불가</div>
                                                        )}
                                                    </div>

                                                    {/* 강점 */}
                                                    <div className="rounded border border-green-200 bg-green-50/50 p-2.5">
                                                        <div className="text-[11px] font-semibold text-green-800 mb-1.5 inline-flex items-center gap-1">
                                                            <Award className="h-3.5 w-3.5" />
                                                            강점
                                                        </div>
                                                        {insight.strengths.length === 0 ? (
                                                            <div className="text-[11px] text-slate-500 italic">눈에 띄는 강점 지표 없음 (데이터 부족 가능)</div>
                                                        ) : (
                                                            <ul className="space-y-1 text-[11px] text-green-900 list-disc list-inside">
                                                                {insight.strengths.map((s, i) => (
                                                                    <li key={i}>{s}</li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>

                                                    {/* 개선 포인트 */}
                                                    <div className="rounded border border-amber-200 bg-amber-50/50 p-2.5">
                                                        <div className="text-[11px] font-semibold text-amber-900 mb-1.5 inline-flex items-center gap-1">
                                                            <TrendingUp className="h-3.5 w-3.5" />
                                                            개선·지원 기회
                                                        </div>
                                                        {insight.improvements.length === 0 ? (
                                                            <div className="text-[11px] text-slate-500 italic">지금 좋은 성과 — 유지 권장</div>
                                                        ) : (
                                                            <ul className="space-y-1 text-[11px] text-amber-900 list-disc list-inside">
                                                                {insight.improvements.map((s, i) => (
                                                                    <li key={i}>{s}</li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="mt-2 text-[10px] text-slate-500">
                                                    <span className="font-medium">프로파일 설명:</span> {pMeta.description}
                                                    <span className="text-amber-700 font-medium ml-2">— 코칭 도구 · 성과 평가 X</span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="px-3 py-2 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-100">
                * 산식: 결함 ÷ 담당 task × 100. 등급: S ≤5%, A ≤10%, B ≤15%, C ≤20%, D 그 외. 팀 baseline (중앙값): 결함율 {baseline.medianDefectRate.toFixed(1)}% · cycle {baseline.medianCycleTime.toFixed(1)}d.{' '}
                <strong className="text-amber-700">코칭 참고용 — 성과 평가 X.</strong>
            </p>
        </div>
    );
}
