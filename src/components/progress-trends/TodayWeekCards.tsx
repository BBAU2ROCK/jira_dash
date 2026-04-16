import type { BacklogStateCounts } from '@/services/prediction/types';
import { Calendar, CalendarRange } from 'lucide-react';
import { InfoTip } from '@/components/ui/info-tip';

export function TodayWeekCards({ counts }: { counts: BacklogStateCounts | null }) {
    if (!counts) return null;
    return (
        <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    <span className="text-xs font-medium text-blue-700">오늘 완료 <InfoTip>KST 기준 오늘(0시~23:59) 완료된 leaf 이슈 수. actualDone 또는 resolutiondate 기준.</InfoTip></span>
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-blue-700">{counts.completedToday}건</div>
            </div>
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
                <div className="flex items-center gap-2">
                    <CalendarRange className="h-4 w-4 text-cyan-500" />
                    <span className="text-xs font-medium text-cyan-700">이번주 완료 <InfoTip>한국식 주 (월~일) 기준 이번 주에 완료된 leaf 이슈 수.</InfoTip></span>
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-cyan-700">{counts.completedThisWeek}건</div>
            </div>
        </div>
    );
}
