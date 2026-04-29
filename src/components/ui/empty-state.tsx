/**
 * EmptyState — 공용 빈 상태 표시 (v1.0.20).
 *
 * 데이터 부재·데이터 부족 시 일관된 시각적 신호 제공.
 * variant:
 *   - 'info'(기본)  : 회색 — 단순 정보 (데이터 없음)
 *   - 'success'    : 초록 — 긍정 (작업 완료 등)
 *   - 'warning'    : 노랑 — 경고 (데이터 부족)
 *   - 'minimal'    : 인라인 텍스트 (최소)
 */
import React from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EmptyStateVariant = 'info' | 'success' | 'warning' | 'minimal';

interface EmptyStateProps {
    title: string;
    description?: string;
    icon?: React.ReactNode;
    variant?: EmptyStateVariant;
    /** 부가 커스텀 클래스 */
    className?: string;
}

const VARIANT_STYLES: Record<EmptyStateVariant, string> = {
    info: 'border-slate-200 bg-slate-50 text-slate-700',
    success: 'border-green-200 bg-green-50 text-green-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    minimal: 'text-slate-500 italic',
};

export function EmptyState({ title, description, icon, variant = 'info', className }: EmptyStateProps) {
    if (variant === 'minimal') {
        return (
            <div className={cn('text-sm text-slate-500 italic px-2 py-1', className)}>
                {title}
            </div>
        );
    }

    return (
        <div
            className={cn(
                'rounded-lg border p-3 text-sm flex items-start gap-2',
                VARIANT_STYLES[variant],
                className
            )}
            role="status"
        >
            <span className="mt-0.5 shrink-0">
                {icon ?? <Info className="w-4 h-4" aria-hidden />}
            </span>
            <div className="flex-1 min-w-0">
                <div className="font-medium">{title}</div>
                {description && <div className="text-xs opacity-80 mt-0.5">{description}</div>}
            </div>
        </div>
    );
}
