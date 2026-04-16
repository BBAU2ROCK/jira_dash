import type { BacklogStateCounts } from '@/services/prediction/types';
import { AlertTriangle, RotateCw, FileQuestion } from 'lucide-react';
import { InfoTip } from '@/components/ui/info-tip';

export function DelayCards({ counts }: { counts: BacklogStateCounts | null }) {
    if (!counts) return null;
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="rounded-lg border border-orange-300 bg-orange-50 p-3">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    <span className="text-xs font-medium text-orange-800">미완료 지연 <InfoTip>마감일(duedate)이 오늘보다 이전인데 아직 완료되지 않은 이슈. 지금 즉시 처리가 필요합니다.</InfoTip></span>
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-orange-700">{counts.overdueInProgress}건</div>
                <div className="text-[11px] text-orange-700 mt-0.5">"지금 처리 필요"</div>
            </div>
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                <div className="flex items-center gap-2">
                    <RotateCw className="h-4 w-4 text-purple-600" />
                    <span className="text-xs font-medium text-purple-800">완료 지연 <InfoTip>이미 완료됐지만 마감일을 초과한 이슈. 회복된 상태이며 참고 지표입니다.</InfoTip></span>
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-purple-700">{counts.lateCompletion}건</div>
                <div className="text-[11px] text-purple-700 mt-0.5">"회복 완료 (참고)"</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                    <FileQuestion className="h-4 w-4 text-slate-600" />
                    <span className="text-xs font-medium text-slate-800">마감일 미설정 <InfoTip>duedate가 없는 활성 이슈. 지연 여부를 판단할 수 없어 추정에서 제외됩니다.</InfoTip></span>
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-slate-700">{counts.noDueDate}건</div>
                <div className="text-[11px] text-slate-600 mt-0.5">"지연 추정 불가"</div>
            </div>
        </div>
    );
}
