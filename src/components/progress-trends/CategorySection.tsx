import React from 'react';
import { cn } from '@/lib/utils';

/**
 * 카테고리 섹션 헤더 + 컨텐츠 wrapper.
 * 진행 추이/예측 탭의 6개 카테고리 그룹화에 사용.
 */
export interface CategorySectionProps {
    icon: React.ElementType;
    title: string;
    subtitle?: string;
    accent?: 'blue' | 'cyan' | 'orange' | 'indigo' | 'purple' | 'slate';
    children: React.ReactNode;
    /** 우측 상단 액션 (배지·버튼 등) */
    headerRight?: React.ReactNode;
    /** 제목 옆에 바로 붙는 보조 요소 (InfoTip·Glossary 등) */
    titleAfter?: React.ReactNode;
}

const ACCENT_CLASS: Record<NonNullable<CategorySectionProps['accent']>, { border: string; bg: string; iconBg: string; iconText: string; titleText: string }> = {
    blue:   { border: 'border-blue-200',   bg: 'bg-blue-50/40',   iconBg: 'bg-blue-100',   iconText: 'text-blue-600',   titleText: 'text-blue-900' },
    cyan:   { border: 'border-cyan-200',   bg: 'bg-cyan-50/40',   iconBg: 'bg-cyan-100',   iconText: 'text-cyan-600',   titleText: 'text-cyan-900' },
    orange: { border: 'border-orange-200', bg: 'bg-orange-50/40', iconBg: 'bg-orange-100', iconText: 'text-orange-600', titleText: 'text-orange-900' },
    indigo: { border: 'border-indigo-200', bg: 'bg-indigo-50/40', iconBg: 'bg-indigo-100', iconText: 'text-indigo-600', titleText: 'text-indigo-900' },
    purple: { border: 'border-purple-200', bg: 'bg-purple-50/40', iconBg: 'bg-purple-100', iconText: 'text-purple-600', titleText: 'text-purple-900' },
    slate:  { border: 'border-slate-200',  bg: 'bg-slate-50/40',  iconBg: 'bg-slate-100',  iconText: 'text-slate-600',  titleText: 'text-slate-900' },
};

export function CategorySection({ icon: Icon, title, subtitle, accent = 'slate', children, headerRight, titleAfter }: CategorySectionProps) {
    const c = ACCENT_CLASS[accent];
    return (
        <section className={cn('rounded-xl border-2 p-3 sm:p-4', c.border, c.bg)}>
            <header className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3">
                    <div className={cn('rounded-lg p-2 shrink-0', c.iconBg)}>
                        <Icon className={cn('h-5 w-5', c.iconText)} />
                    </div>
                    <div>
                        <h2 className={cn('text-base font-bold flex items-center gap-1.5', c.titleText)}>
                            {title}
                            {titleAfter}
                        </h2>
                        {subtitle && <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>}
                    </div>
                </div>
                {headerRight && <div className="shrink-0">{headerRight}</div>}
            </header>
            <div className="space-y-3">{children}</div>
        </section>
    );
}
