import React from 'react';
import { cn } from '@/lib/utils';

interface Props {
    label: string;
    /** 부제 (선택) */
    subtitle?: string;
    /** 좌측 큰 아이콘 */
    icon?: React.ElementType;
    /** 색상 톤 */
    tone?: 'forecast' | 'retrospective';
}

const TONE_CLASS: Record<NonNullable<Props['tone']>, { bg: string; border: string; iconBg: string; iconText: string; titleText: string }> = {
    forecast: {
        bg: 'bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50',
        border: 'border-indigo-300',
        iconBg: 'bg-indigo-500',
        iconText: 'text-white',
        titleText: 'text-indigo-900',
    },
    retrospective: {
        bg: 'bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50',
        border: 'border-amber-300',
        iconBg: 'bg-amber-500',
        iconText: 'text-white',
        titleText: 'text-amber-900',
    },
};

/**
 * 진행 추이/예측 탭의 큰 섹션 구분선 + 헤더.
 * "예측" / "회고" 영역을 시각적으로 명확히 분리.
 */
export function SectionDivider({ label, subtitle, icon: Icon, tone = 'forecast' }: Props) {
    const c = TONE_CLASS[tone];
    return (
        <div className={cn('rounded-xl border-2 p-4 mt-4 first:mt-0', c.border, c.bg)}>
            <div className="flex items-center gap-3">
                {Icon && (
                    <div className={cn('rounded-lg p-2.5 shrink-0', c.iconBg)}>
                        <Icon className={cn('h-6 w-6', c.iconText)} />
                    </div>
                )}
                <div className="flex-1">
                    <h2 className={cn('text-lg font-bold tracking-tight', c.titleText)}>{label}</h2>
                    {subtitle && <p className="text-sm text-slate-600 mt-0.5">{subtitle}</p>}
                </div>
            </div>
        </div>
    );
}
