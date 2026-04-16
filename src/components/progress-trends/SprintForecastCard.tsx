import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Calendar, CheckCircle2, AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { jiraApi } from '@/api/jiraClient';
import { classifySprintRisk, type SprintRiskStatus } from '@/services/prediction/sprintForecast';
import type { TeamForecast } from '@/services/prediction/types';

const STATUS_META: Record<SprintRiskStatus, { label: string; color: string; icon: React.ElementType }> = {
    'on-track': { label: '안전', color: 'border-green-300 bg-green-50 text-green-900', icon: CheckCircle2 },
    'at-risk': { label: '위험', color: 'border-amber-300 bg-amber-50 text-amber-900', icon: AlertTriangle },
    'overrun': { label: '지연 확실', color: 'border-red-300 bg-red-50 text-red-900', icon: ShieldAlert },
    'no-data': { label: '데이터 부족', color: 'border-slate-300 bg-slate-50 text-slate-700', icon: Info },
};

interface Props {
    projectKey: string;
    team: TeamForecast | null;
}

export function SprintForecastCard({ projectKey, team }: Props) {
    const boardsQuery = useQuery({
        queryKey: ['agile-boards', projectKey],
        queryFn: () => jiraApi.getBoards(projectKey),
        staleTime: 30 * 60 * 1000,
        retry: 0,
    });
    const firstScrumBoard = boardsQuery.data?.find((b) => b.type === 'scrum') ?? boardsQuery.data?.[0];

    const sprintsQuery = useQuery({
        queryKey: ['agile-sprints', firstScrumBoard?.id],
        queryFn: () => firstScrumBoard ? jiraApi.getActiveSprints(firstScrumBoard.id) : Promise.resolve([]),
        enabled: !!firstScrumBoard,
        staleTime: 5 * 60 * 1000,
        retry: 0,
    });
    const activeSprint = sprintsQuery.data?.[0];

    if (boardsQuery.isLoading || sprintsQuery.isLoading) {
        return null;
    }
    if (!activeSprint || !team) {
        return null; // 칸반 보드거나 활성 스프린트 없음 → 카드 비표시
    }

    const risk = classifySprintRisk(activeSprint, team.realistic);
    const meta = STATUS_META[risk.status];
    const Icon = meta.icon;

    return (
        <div className={cn('rounded-lg border p-4', meta.color)}>
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    현재 스프린트 ETA: {activeSprint.name}
                </h3>
                <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium flex items-center gap-1', meta.color)}>
                    <Icon className="h-3 w-3" />
                    {meta.label}
                </span>
            </div>
            <div className="text-xs space-y-1">
                {activeSprint.endDate && (
                    <div>
                        스프린트 종료: <strong>{format(new Date(activeSprint.endDate), 'yyyy.MM.dd (E)', { locale: ko })}</strong>
                        {risk.sprintRemainingDays > 0 && <span className="ml-1">(영업일 {risk.sprintRemainingDays}일 남음)</span>}
                    </div>
                )}
                <div>{risk.message}</div>
                {activeSprint.goal && <div className="text-slate-600 mt-1">목표: {activeSprint.goal}</div>}
            </div>
        </div>
    );
}
