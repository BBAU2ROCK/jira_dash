import type { BacklogStateCounts } from '@/services/prediction/types';
import { AlertTriangle, RotateCw, FileQuestion } from 'lucide-react';
import { InfoTip } from '@/components/ui/info-tip';

export function DelayCards({ counts }: { counts: BacklogStateCounts | null }) {
    if (!counts) return null;
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="rounded-lg border border-orange-300 dark:border-orange-900/60 bg-orange-50 dark:bg-orange-950/30 p-3">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    <span className="text-xs font-medium text-orange-800 dark:text-orange-300">미완료 지연 <InfoTip>마감일(duedate)이 오늘보다 이전인데 아직 완료되지 않은 이슈. 지금 즉시 처리가 필요합니다.</InfoTip></span>
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-orange-700 dark:text-orange-300">{counts.overdueInProgress}건</div>
                <div className="text-[11px] text-orange-700 dark:text-orange-300 mt-0.5">"지금 처리 필요"</div>
            </div>
            <div className="rounded-lg border border-purple-200 dark:border-purple-900/60 bg-purple-50 dark:bg-purple-950/30 p-3">
                <div className="flex items-center gap-2">
                    <RotateCw className="h-4 w-4 text-purple-600" />
                    <span className="text-xs font-medium text-purple-800 dark:text-purple-300">완료 지연 <InfoTip>이미 완료됐지만 마감일을 초과한 이슈. 회복된 상태이며 참고 지표입니다.</InfoTip></span>
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-purple-700 dark:text-purple-300">{counts.lateCompletion}건</div>
                <div className="text-[11px] text-purple-700 dark:text-purple-300 mt-0.5">"회복 완료 (참고)"</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-center gap-2">
                    <FileQuestion className="h-4 w-4 text-foreground/80" />
                    <span className="text-xs font-medium text-foreground">마감일 미설정 <InfoTip>duedate가 없는 활성 이슈. 지연 여부를 판단할 수 없어 추정에서 제외됩니다.</InfoTip></span>
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-foreground/90">{counts.noDueDate}건</div>
                <div className="text-[11px] text-foreground/80 mt-0.5">"지연 추정 불가"</div>
            </div>
        </div>
    );
}
