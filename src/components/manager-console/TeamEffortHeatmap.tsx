import { Grid3x3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { getTeamEffortHeatmap } from '@/services/prediction/budgetEffortAnalysis';
import { CATEGORY_LABEL } from '@/services/prediction/aiSavingsEstimation';
import { useDisplayPreferenceStore } from '@/stores/displayPreferenceStore';
import { buildAnonymizeMap, maybeAnonymize } from '@/lib/anonymize';
import type { JiraIssue } from '@/api/jiraClient';
import type { BacklogEffortReport } from '@/services/prediction/types';

interface Props {
    activeIssues: JiraIssue[];
    report: BacklogEffortReport | null;
}

/** MD 값 → 배경 색 강도 (Tailwind class 동적 매핑은 안 되므로 인라인 style) */
function cellColor(manDays: number, max: number): { bg: string; text: string } {
    if (manDays <= 0) return { bg: 'transparent', text: 'inherit' };
    const intensity = Math.min(1, manDays / Math.max(max, 1));
    // 파랑 → 보라 그라디언트
    const opacity = 0.15 + intensity * 0.6;  // 0.15 ~ 0.75
    return {
        bg: `rgba(99, 102, 241, ${opacity})`, // indigo
        text: intensity > 0.5 ? 'rgb(255, 255, 255)' : 'inherit',
    };
}

export function TeamEffortHeatmap({ activeIssues, report }: Props) {
    const anonymize = useDisplayPreferenceStore((s) => s.anonymizeMode);

    if (!report || report.perIssue.length === 0 || activeIssues.length === 0) {
        return (
            <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <Grid3x3 className="h-4 w-4 text-purple-500" />
                    팀 부하 히트맵
                </h3>
                <p className="mt-3 text-sm text-muted-foreground">활성 백로그가 없어 표시할 수 없습니다.</p>
            </div>
        );
    }

    const heatmap = getTeamEffortHeatmap(activeIssues, report);
    const totalMD = Array.from(heatmap.rowTotals.values()).reduce((s, v) => s + v, 0);
    const anonMap = buildAnonymizeMap(heatmap.assignees);

    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <Grid3x3 className="h-4 w-4 text-purple-500" />
                    팀 부하 히트맵 (담당자 × 카테고리)
                    <InfoTip>
                        <div className="space-y-2 max-w-sm">
                            <div className="font-semibold text-foreground text-sm">담당자 × 카테고리 부하 히트맵</div>
                            <p className="text-muted-foreground">
                                활성 백로그를 담당자(행)와 이슈 카테고리(열)로 교차 분석한 부하 분포.
                                병목 인원·편중된 작업 분배를 즉시 시각화.
                            </p>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">📊 표시 방식</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>각 셀의 값 = 해당 담당자의 해당 카테고리 인일(MD) 합계</li>
                                    <li>색 강도 = MD 절대값 (셀 max 대비 0.15 ~ 0.75 opacity)</li>
                                    <li>진할수록 부하 큼 (인디고 그라디언트)</li>
                                    <li>마지막 컬럼·행 = 총합 (행/열 sum)</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">📐 산정 기준</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>활성 백로그(완료 X, 취소 X, 반려 X) 기준</li>
                                    <li>이슈 카테고리: Story / Bug / Sub-task / Test / Doc / 기타</li>
                                    <li>이슈 시간 = 백로그 공수 추정 결과 (worklog → planned → SP → 난이도 → cycle-time)</li>
                                    <li>인일(MD) = 시간 ÷ 8</li>
                                    <li>미할당 이슈는 별도 행 '미할당'으로 묶음</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">💡 활용 사례</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li><strong>병목 발견</strong>: 한 행(담당자) 전체가 진하면 과부하</li>
                                    <li><strong>편중 진단</strong>: 한 열(카테고리)에 한 명만 진한 셀 → 단일 의존</li>
                                    <li><strong>재분배 결정</strong>: 진한 셀의 일부 이슈를 다른 행으로 이전 검토</li>
                                    <li><strong>커리어 관리</strong>: 특정 담당자가 Test/Doc만 → 성장 정체 가능</li>
                                    <li><strong>채용 우선순위</strong>: 모든 행에서 진한 카테고리 → 인력 충원 필요</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">
                                💡 익명화 모드(헤더 토글) 활성화 시 행 라벨이 'A/B/C...' alias로 대체.
                            </div>
                        </div>
                    </InfoTip>
                </h3>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                    {heatmap.assignees.length}명 / 총 {totalMD.toFixed(1)} MD
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="border-b border-border bg-muted/40">
                            <th scope="col" className="px-2 py-1.5 text-left font-medium text-foreground/80 sticky left-0 bg-muted/40">담당자</th>
                            {heatmap.categories.map((c) => (
                                <th key={c} scope="col" className="px-2 py-1.5 text-right font-medium text-foreground/80" title={CATEGORY_LABEL[c]}>
                                    {CATEGORY_LABEL[c].split(' ')[0]}
                                </th>
                            ))}
                            <th scope="col" className="px-2 py-1.5 text-right font-bold text-foreground/90 border-l border-border">합계</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                        {heatmap.assignees.map((assignee) => {
                            const rowTotal = heatmap.rowTotals.get(assignee) ?? 0;
                            const displayName = maybeAnonymize(assignee, anonMap, anonymize);
                            return (
                                <tr key={assignee} className="hover:bg-muted/30">
                                    <td className="px-2 py-1.5 text-foreground/90 sticky left-0 bg-card">
                                        {displayName}
                                    </td>
                                    {heatmap.categories.map((c) => {
                                        const cell = heatmap.cells.find((x) => x.assignee === assignee && x.category === c);
                                        const md = cell?.manDays ?? 0;
                                        const count = cell?.issueCount ?? 0;
                                        const colors = cellColor(md, heatmap.maxCellManDays);
                                        return (
                                            <td
                                                key={c}
                                                className={cn(
                                                    'px-2 py-1.5 text-right tabular-nums transition-colors',
                                                    md > 0 ? 'cursor-help' : ''
                                                )}
                                                style={{ backgroundColor: colors.bg, color: colors.text }}
                                                title={count > 0 ? `${count}건 / ${md.toFixed(1)} MD` : '0건'}
                                            >
                                                {md > 0 ? md.toFixed(1) : '·'}
                                            </td>
                                        );
                                    })}
                                    <td className="px-2 py-1.5 text-right font-bold tabular-nums border-l border-border">
                                        {rowTotal.toFixed(1)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="border-t-2 border-border bg-muted/40">
                            <th scope="row" className="px-2 py-1.5 text-left font-bold text-foreground/90 sticky left-0 bg-muted/40">합계</th>
                            {heatmap.categories.map((c) => {
                                const colTotal = heatmap.colTotals.get(c) ?? 0;
                                return (
                                    <td key={c} className="px-2 py-1.5 text-right font-bold tabular-nums">
                                        {colTotal.toFixed(1)}
                                    </td>
                                );
                            })}
                            <td className="px-2 py-1.5 text-right font-bold tabular-nums border-l border-border">
                                {totalMD.toFixed(1)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground bg-muted/40 px-2 py-1.5 rounded border border-border/60">
                💡 셀 hover → 건수 / 인일. 진한 셀 = 부하 ↑. '·' = 0건.
                정렬: 행은 총 MD 큰 순 / 열은 카테고리 표준 순서 (Story → Bug → Sub-task → Test → Doc → 기타).
            </div>
        </div>
    );
}
