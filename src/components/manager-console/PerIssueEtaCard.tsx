/**
 * v1.0.43: 개별 이슈 ETA 카드.
 *
 * Lead time 분포 P85 기준 각 활성 이슈의 추정 완료일.
 * 매니저 콘솔 "공수 & 예산" 탭에 위치 (그루밍 표 옆).
 */
import { useState } from 'react';
import { Target, ExternalLink, AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/info-tip';
import { useDisplayPreferenceStore } from '@/stores/displayPreferenceStore';
import { buildAnonymizeMap, maybeAnonymize } from '@/lib/anonymize';
import type { LeadTimeForecast } from '@/services/prediction/leadTimeForecast';

const JIRA_BASE = 'https://okestro.atlassian.net/browse';

interface Props {
    leadTime: LeadTimeForecast | null;
}

export function PerIssueEtaCard({ leadTime }: Props) {
    const [showAll, setShowAll] = useState(false);
    const [sortBy, setSortBy] = useState<'overdue' | 'remaining' | 'created'>('overdue');
    const anonymize = useDisplayPreferenceStore((s) => s.anonymizeMode);

    if (!leadTime || leadTime.perIssueEtas.length === 0) return null;
    if (leadTime.confidence === 'unreliable') {
        return (
            <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <Target className="h-4 w-4 text-indigo-500" />
                    개별 이슈 ETA
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                    Lead time 샘플 부족 ({leadTime.sampleSize}건 / 최소 10건 필요). 데이터 누적 후 표시.
                </p>
            </div>
        );
    }

    const assigneeList = leadTime.perIssueEtas
        .map((e) => e.assigneeName)
        .filter((n): n is string => n != null);
    const anonMap = buildAnonymizeMap(assigneeList);

    const sorted = [...leadTime.perIssueEtas].sort((a, b) => {
        if (sortBy === 'overdue') {
            if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
            return b.estimatedRemainingDays - a.estimatedRemainingDays;
        }
        if (sortBy === 'remaining') return a.estimatedRemainingDays - b.estimatedRemainingDays;
        return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const DEFAULT_LIMIT = 10;
    const visible = showAll ? sorted : sorted.slice(0, DEFAULT_LIMIT);
    const hidden = sorted.length - visible.length;
    const overdueCount = leadTime.perIssueEtas.filter((e) => e.overdue).length;

    return (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-baseline justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <Target className="h-4 w-4 text-indigo-500" />
                    개별 이슈 ETA (Lead Time 기반)
                    <InfoTip>
                        <div className="space-y-2 max-w-sm">
                            <div className="font-semibold text-foreground text-sm">개별 이슈 ETA — Lead Time 기반</div>
                            <p className="text-muted-foreground">
                                완료된 이슈 {leadTime.sampleSize}건의 lead time(created→completed) 분포 P85 ={' '}
                                <strong>{leadTime.p85Days}일</strong>. 활성 이슈마다 created로부터 P85일까지의 잔여 영업일을 추정.
                            </p>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">📐 산정 공식</div>
                                <div className="text-[11px] text-muted-foreground font-mono bg-muted/40 p-1.5 rounded">
                                    elapsed = businessDaysBetween(created, now)<br/>
                                    remaining = max(0, P85 - elapsed)<br/>
                                    completionDate = now + remaining (영업일)<br/>
                                    overdue = elapsed &gt; P85
                                </div>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">📊 백분위 (전체 샘플)</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>P50: <strong>{leadTime.p50Days}일</strong> (절반 이상 이 시간 안에 완료)</li>
                                    <li>P85: <strong>{leadTime.p85Days}일</strong> (85% 이 시간 안에)</li>
                                    <li>P95: <strong>{leadTime.p95Days}일</strong> (95% 이 시간 안에)</li>
                                    <li>평균: <strong>{leadTime.meanDays}일</strong> (±{leadTime.stddevDays})</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">⚠️ 한계 및 주의</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>이슈 크기 차이 무시 (평균 P85만)</li>
                                    <li>각 이슈가 즉시 시작된다는 단순 가정 — 실제는 순차 처리</li>
                                    <li>인력 변화·블로커 미반영</li>
                                    <li>P85 초과한 이슈(overdue)는 즉시 처리 필요 신호</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">
                                💡 정렬: '지연 우선' = overdue 먼저 / '잔여 짧은 순' = 마무리 가능한 것부터 / '최근 created' = 신규 우선.
                            </div>
                        </div>
                    </InfoTip>
                </h3>
                <div className="flex items-center gap-2 text-[11px]">
                    {overdueCount > 0 && (
                        <span className="rounded-full border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 px-2 py-0.5 font-medium">
                            ⚠️ 지연 {overdueCount}건
                        </span>
                    )}
                    <span className="text-muted-foreground">
                        {sorted.length}건 · 표시 {visible.length}건
                    </span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'overdue' | 'remaining' | 'created')}
                        className="text-[11px] px-1 py-0.5 border border-border rounded bg-card text-foreground"
                    >
                        <option value="overdue">지연 우선</option>
                        <option value="remaining">잔여 짧은 순</option>
                        <option value="created">최근 created</option>
                    </select>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b border-border">
                        <tr>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-foreground/80 text-left">키</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-foreground/80 text-left">제목</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-foreground/80 text-left">담당자</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-foreground/80 text-right">Created</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-foreground/80 text-right">잔여 (일)</th>
                            <th scope="col" className="px-2 py-2 text-xs font-medium text-foreground/80 text-right">예상 완료일</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {visible.map((e) => {
                            const displayName = e.assigneeName
                                ? maybeAnonymize(e.assigneeName, anonMap, anonymize)
                                : '(미할당)';
                            return (
                                <tr key={e.issueKey} className={cn('hover:bg-muted/40', e.overdue && 'bg-red-50/30 dark:bg-red-950/10')}>
                                    <td className="px-2 py-1.5">
                                        <a
                                            href={`${JIRA_BASE}/${e.issueKey}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs font-mono text-blue-600 hover:underline inline-flex items-center gap-1"
                                        >
                                            {e.issueKey}
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </td>
                                    <td className="px-2 py-1.5 max-w-[400px] truncate text-foreground/90" title={e.summary}>
                                        {e.summary}
                                    </td>
                                    <td className="px-2 py-1.5 text-xs text-foreground/80">{displayName}</td>
                                    <td className="px-2 py-1.5 text-right text-xs text-muted-foreground tabular-nums">
                                        {format(e.createdAt, 'yy.MM.dd')}
                                    </td>
                                    <td className={cn(
                                        'px-2 py-1.5 text-right tabular-nums font-semibold',
                                        e.overdue ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                                    )}>
                                        {e.overdue ? (
                                            <span className="inline-flex items-center gap-1 justify-end">
                                                <AlertTriangle className="h-3 w-3" />
                                                지연
                                            </span>
                                        ) : (
                                            <>{e.estimatedRemainingDays}일</>
                                        )}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-xs text-foreground/80 tabular-nums">
                                        <span className="inline-flex items-center gap-1 justify-end">
                                            <Clock className="h-3 w-3 text-muted-foreground" />
                                            {format(e.estimatedCompletionDate, 'yy.MM.dd')}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {(hidden > 0 || showAll) && sorted.length > DEFAULT_LIMIT && (
                <div className="px-3 py-2 border-t border-border/50 text-center">
                    <button
                        type="button"
                        onClick={() => setShowAll((v) => !v)}
                        className="text-xs text-blue-600 hover:underline"
                    >
                        {showAll
                            ? `상위 ${DEFAULT_LIMIT}건만 보기`
                            : `나머지 ${hidden}건 더 보기 (전체 ${sorted.length}건)`}
                    </button>
                </div>
            )}
            <p className="px-3 py-2 text-[11px] text-muted-foreground bg-muted/40 border-t border-border/50">
                * P85 lead time {leadTime.p85Days}영업일 기준. 키 클릭 → Jira 새 탭. 지연(overdue) = created 후 P85 초과 → 즉시 검토 권장.
            </p>
        </div>
    );
}
