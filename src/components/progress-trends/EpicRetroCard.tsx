import React from 'react';
import { ExternalLink, Trophy, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { useDisplayPreferenceStore } from '@/stores/displayPreferenceStore';
import { buildAnonymizeMap, maybeAnonymize } from '@/lib/anonymize';
import type { EpicRetroSummary } from '@/services/retrospective/types';

const JIRA_BASE = 'https://okestro.atlassian.net/browse';

const GRADE_COLOR: Record<EpicRetroSummary['kpiGrade'], string> = {
    S: 'text-purple-700 bg-purple-100 border-purple-300',
    A: 'text-green-700 bg-green-100 border-green-300',
    B: 'text-blue-700 bg-blue-100 border-blue-300',
    C: 'text-amber-700 bg-amber-100 border-amber-300',
    D: 'text-red-700 bg-red-100 border-red-300',
    '—': 'text-slate-700 bg-slate-100 border-slate-300',
};

const STATUS_LABEL: Record<EpicRetroSummary['epicStatus'], string> = {
    done: '완료',
    'in-progress': '진행 중',
    unknown: '상태 미상',
};

interface Props {
    summary: EpicRetroSummary;
}

export function EpicRetroCard({ summary }: Props) {
    const anonymizeMode = useDisplayPreferenceStore((s) => s.anonymizeMode);
    const anonMap = React.useMemo(
        () => buildAnonymizeMap(summary.contributors.map((c) => c.displayName)),
        [summary.contributors]
    );

    const gradeColor = GRADE_COLOR[summary.kpiGrade];

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
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
                    <h3 className="text-sm font-semibold text-slate-800 mt-0.5 truncate" title={summary.epicSummary}>
                        {summary.epicSummary}
                    </h3>
                    <span className="text-[11px] text-slate-500">{STATUS_LABEL[summary.epicStatus]}</span>
                </div>
                <div className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold shrink-0', gradeColor)}>
                    <Trophy className="h-3 w-3" />
                    {summary.kpiScore}점 · {summary.kpiGrade}
                </div>
            </div>

            {/* 회고 메트릭 (결함은 별도 EpicDefectCard로 분리) */}
            <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <Metric label="완료율" value={`${summary.completionRate}%`} sub={`${summary.completedTasks}/${summary.totalTasks}`} tip="leaf task 중 완료(done) 비율. 하위 작업 있으면 부모 제외." />
                        <Metric label="정시 완료율" value={`${summary.onTimeRate}%`} accent={summary.onTimeRate >= 80 ? 'good' : summary.onTimeRate < 50 ? 'bad' : undefined} tip="완료된 task 중 마감일(duedate) 안에 끝난 비율. 마감일 없으면 준수로 간주." />
                        <Metric label="평균 cycle time" value={`${summary.avgCycleTimeDays}d`} sub={`P85 ${summary.p85CycleTimeDays}d`} icon={Clock} tip="created → done 평균 소요일. P85 = 85%의 task가 이 기간 안에 끝남." />
                        <Metric label="에픽 lead" value={summary.epicLeadTimeDays != null ? `${summary.epicLeadTimeDays}일` : '-'} tip="에픽 생성일 → 마지막 task 완료일까지 총 소요일." />
                    </div>

                    {/* 담당자 분포 (프로젝트 현황 탭과 유사한 분해) */}
                    {summary.contributors.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr className="text-slate-500">
                                        <th className="text-left py-1 pr-2 font-medium">
                                            <span className="inline-flex items-center gap-1">
                                                담당자 ({summary.contributors.length}명)
                                                <InfoTip size="sm">
                                                    이 에픽에 assignee로 연결된 인원 수.
                                                    각 행의 수치는 해당 담당자의 leaf task 수 (프로젝트 현황 탭과 동일 카운트 규칙).
                                                    하위 작업이 있는 부모 task는 제외되고 leaf만 카운트됩니다. 상위 7명까지 표시.
                                                </InfoTip>
                                            </span>
                                        </th>
                                        <th className="py-1 px-1 font-medium text-center text-slate-600">
                                            <span className="inline-flex items-center gap-1 justify-center">
                                                전체
                                                <InfoTip size="sm">담당자의 leaf task 총 수 (부모 작업 제외).</InfoTip>
                                            </span>
                                        </th>
                                        <th className="py-1 px-1 font-medium text-center text-green-700">
                                            <span className="inline-flex items-center gap-1 justify-center">
                                                완료
                                                <InfoTip size="sm">statusCategory가 'done'인 task. Jira의 완료 분류 기준.</InfoTip>
                                            </span>
                                        </th>
                                        <th className="py-1 px-1 font-medium text-center text-blue-700">
                                            <span className="inline-flex items-center gap-1 justify-center">
                                                진행
                                                <InfoTip size="sm">statusCategory가 'indeterminate' (진행 중, 리뷰 등) task.</InfoTip>
                                            </span>
                                        </th>
                                        <th className="py-1 px-1 font-medium text-center text-slate-500">
                                            <span className="inline-flex items-center gap-1 justify-center">
                                                대기
                                                <InfoTip size="sm">statusCategory가 'new' (To Do, Backlog 등) — 아직 착수하지 않은 task.</InfoTip>
                                            </span>
                                        </th>
                                        <th className="py-1 px-1 font-medium text-center text-red-600">
                                            <span className="inline-flex items-center gap-1 justify-center">
                                                지연
                                                <InfoTip size="sm">미완료 + 마감일(duedate)이 오늘 이전인 task. 즉시 조치 대상.</InfoTip>
                                            </span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.contributors.slice(0, 7).map((c) => {
                                        const aliasName = maybeAnonymize(c.displayName, anonMap, anonymizeMode);
                                        return (
                                            <tr key={c.key} className="border-t border-slate-100">
                                                <td className="py-1 pr-2 text-slate-800 truncate max-w-[100px]" title={aliasName}>
                                                    {aliasName}
                                                </td>
                                                <td className="py-1 px-1 text-center tabular-nums font-semibold text-slate-700">{c.taskCount}</td>
                                                <td className="py-1 px-1 text-center tabular-nums text-green-700">{c.completedCount}</td>
                                                <td className="py-1 px-1 text-center tabular-nums text-blue-700">{c.inProgressCount || '-'}</td>
                                                <td className="py-1 px-1 text-center tabular-nums text-slate-500">{c.todoCount || '-'}</td>
                                                <td className="py-1 px-1 text-center tabular-nums text-red-600">{c.delayedCount || '-'}</td>
                                            </tr>
                                        );
                                    })}
                                    {summary.contributors.length > 7 && (
                                        <tr><td colSpan={6} className="py-1 text-center text-slate-400">+ {summary.contributors.length - 7}명</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
        </div>
    );
}

function Metric({ label, value, sub, accent, icon: Icon, tip }: {
    label: string;
    value: string;
    sub?: string;
    accent?: 'good' | 'bad';
    tip?: string;
    icon?: React.ElementType;
}) {
    const accentClass = accent === 'good' ? 'text-green-700' : accent === 'bad' ? 'text-red-700' : 'text-slate-800';
    return (
        <div className="rounded border border-slate-200 bg-slate-50 p-2">
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
                {Icon && <Icon className="h-3 w-3" />}
                {label}
                {tip && <InfoTip size="sm">{tip}</InfoTip>}
            </div>
            <div className={cn('text-base font-bold tabular-nums', accentClass)}>{value}</div>
            {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
        </div>
    );
}
