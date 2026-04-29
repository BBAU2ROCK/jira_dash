import type { BacklogStateCounts } from '@/services/prediction/types';
import { cn } from '@/lib/utils';
import { Layers, Activity, PauseCircle, UserMinus, CheckCircle2, FileX } from 'lucide-react';
import { InfoTip } from '@/components/ui/info-tip';
import { SkeletonStatCard } from '@/components/ui/skeleton';
import { UNASSIGNED_LABEL } from '@/lib/jira-constants';

interface CardProps {
    label: string;
    value: number | string;
    Icon: React.ElementType;
    color: 'blue' | 'cyan' | 'purple' | 'amber' | 'green' | 'slate';
    sublabel?: string;
    /** 정보 툴팁 */
    tip?: string;
}

// v1.0.23: 다크모드 dark: variant — 의미 색을 다크에서도 읽히게.
const COLOR_CLASS: Record<CardProps['color'], { bg: string; text: string; icon: string }> = {
    blue:   { bg: 'bg-blue-50 dark:bg-blue-950/30',     text: 'text-blue-700 dark:text-blue-300',     icon: 'text-blue-500 dark:text-blue-400' },
    cyan:   { bg: 'bg-cyan-50 dark:bg-cyan-950/30',     text: 'text-cyan-700 dark:text-cyan-300',     icon: 'text-cyan-500 dark:text-cyan-400' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-300', icon: 'text-purple-500 dark:text-purple-400' },
    amber:  { bg: 'bg-amber-50 dark:bg-amber-950/30',   text: 'text-amber-800 dark:text-amber-300',   icon: 'text-amber-500 dark:text-amber-400' },
    green:  { bg: 'bg-green-50 dark:bg-green-950/30',   text: 'text-green-700 dark:text-green-300',   icon: 'text-green-500 dark:text-green-400' },
    slate:  { bg: 'bg-muted/40',                        text: 'text-foreground/90',                   icon: 'text-muted-foreground' },
};

function StateCard({ label, value, Icon, color, sublabel, tip }: CardProps) {
    const c = COLOR_CLASS[color];
    return (
        <div className={cn('group rounded-lg border border-border/70 p-3 card-hover', c.bg)}>
            <div className="flex items-center gap-2">
                <Icon className={cn('h-4 w-4 transition-transform group-hover:scale-110', c.icon)} />
                <span className={cn('text-xs font-medium tracking-tight', c.text)}>
                    {label}
                    {tip && <InfoTip>{tip}</InfoTip>}
                </span>
            </div>
            <div className={cn('mt-1 text-2xl font-bold tabular-nums leading-none', c.text)}>{value}</div>
            {sublabel && <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">{sublabel}</div>}
        </div>
    );
}

export function BacklogStateCards({ counts }: { counts: BacklogStateCounts | null }) {
    if (!counts) {
        // v1.0.21: spinner 대신 skeleton — layout shift 0
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonStatCard key={i} />)}
            </div>
        );
    }
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <StateCard label="잔여 (전체)" value={counts.total} Icon={Layers} color="blue" tip="leaf 이슈 합계. '하위 작업이 있으면 부모 제외·하위만 카운트' 규칙 적용." />
            <StateCard label="활성" value={counts.active} Icon={Activity} color="cyan" tip="done·취소 제외, 진행해야 할 작업. 보류도 포함됩니다." />
            <StateCard label="보류" value={counts.onHold} Icon={PauseCircle} color="purple" tip="status가 '보류'인 이슈. 활성에 포함되지만 ETA 예측에서는 제외." />
            <StateCard label={UNASSIGNED_LABEL} value={counts.unassigned} Icon={UserMinus} color="amber" sublabel={counts.active > 0 ? `${Math.round((counts.unassigned / counts.active) * 100)}%` : undefined} tip="assignee 없는 활성 이슈. 그루밍 후 담당자 할당 필요." />
            <StateCard label="90일 완료" value={counts.completed90d} Icon={CheckCircle2} color="green" tip="최근 90일 내 완료(statusCategory=done)된 이슈 수." />
            <StateCard label="마감일 없음" value={counts.noDueDate} Icon={FileX} color="slate" tip="활성 이슈 중 duedate 미입력. 지연 판정 불가 → 추정에서 제외." />
        </div>
    );
}
