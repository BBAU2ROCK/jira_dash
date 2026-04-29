import React from 'react';
import { cn } from '@/lib/utils';

/**
 * 카테고리 섹션 — v1.0.21 리뉴얼.
 *
 * 변경:
 * - 좌측 colored accent strip (bar) — Linear/Notion 스타일
 * - 1px border + subtle bg (전 2px + 50%/40 alpha 톤)
 * - Icon container — solid color tint (전 100, 더 보드라운 느낌)
 * - 다크모드 자동 대응 (CSS variable + dark: tone)
 */
export interface CategorySectionProps {
    icon: React.ElementType;
    title: string;
    subtitle?: string;
    accent?: 'blue' | 'cyan' | 'orange' | 'indigo' | 'purple' | 'slate' | 'emerald' | 'rose';
    children: React.ReactNode;
    /** 우측 상단 액션 (배지·버튼 등) */
    headerRight?: React.ReactNode;
    /** 제목 옆에 바로 붙는 보조 요소 (InfoTip·Glossary 등) */
    titleAfter?: React.ReactNode;
}

interface AccentStyle {
    /** 좌측 accent strip 색 */
    strip: string;
    /** Icon container 배경 */
    iconBg: string;
    /** Icon 색 */
    iconText: string;
    /** Title 텍스트 색 */
    titleText: string;
}

const ACCENT_STYLE: Record<NonNullable<CategorySectionProps['accent']>, AccentStyle> = {
    blue:    { strip: 'bg-blue-500',    iconBg: 'bg-blue-100 dark:bg-blue-950/40',     iconText: 'text-blue-600 dark:text-blue-400',     titleText: 'text-slate-900 dark:text-slate-100' },
    cyan:    { strip: 'bg-cyan-500',    iconBg: 'bg-cyan-100 dark:bg-cyan-950/40',     iconText: 'text-cyan-600 dark:text-cyan-400',     titleText: 'text-slate-900 dark:text-slate-100' },
    orange:  { strip: 'bg-orange-500',  iconBg: 'bg-orange-100 dark:bg-orange-950/40', iconText: 'text-orange-600 dark:text-orange-400', titleText: 'text-slate-900 dark:text-slate-100' },
    indigo:  { strip: 'bg-indigo-500',  iconBg: 'bg-indigo-100 dark:bg-indigo-950/40', iconText: 'text-indigo-600 dark:text-indigo-400', titleText: 'text-slate-900 dark:text-slate-100' },
    purple:  { strip: 'bg-purple-500',  iconBg: 'bg-purple-100 dark:bg-purple-950/40', iconText: 'text-purple-600 dark:text-purple-400', titleText: 'text-slate-900 dark:text-slate-100' },
    slate:   { strip: 'bg-slate-400',   iconBg: 'bg-slate-100 dark:bg-slate-800',      iconText: 'text-slate-600 dark:text-slate-400',   titleText: 'text-slate-900 dark:text-slate-100' },
    emerald: { strip: 'bg-emerald-500', iconBg: 'bg-emerald-100 dark:bg-emerald-950/40', iconText: 'text-emerald-600 dark:text-emerald-400', titleText: 'text-slate-900 dark:text-slate-100' },
    rose:    { strip: 'bg-rose-500',    iconBg: 'bg-rose-100 dark:bg-rose-950/40',     iconText: 'text-rose-600 dark:text-rose-400',     titleText: 'text-slate-900 dark:text-slate-100' },
};

export function CategorySection({ icon: Icon, title, subtitle, accent = 'slate', children, headerRight, titleAfter }: CategorySectionProps) {
    const c = ACCENT_STYLE[accent];
    return (
        <section
            className={cn(
                'relative rounded-xl border border-border bg-card overflow-hidden',
                'shadow-sm hover:shadow-md transition-shadow duration-200'
            )}
        >
            {/* Left accent strip */}
            <div className={cn('absolute left-0 top-0 bottom-0 w-[3px]', c.strip)} aria-hidden />

            <div className="pl-4 pr-3 py-3 sm:pl-5 sm:pr-4 sm:py-4">
                <header className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className={cn('rounded-lg p-2 shrink-0', c.iconBg)}>
                            <Icon className={cn('h-5 w-5', c.iconText)} aria-hidden />
                        </div>
                        <div className="min-w-0">
                            <h2 className={cn('text-base font-semibold flex items-center gap-1.5 tracking-tight', c.titleText)}>
                                <span className="truncate">{title}</span>
                                {titleAfter}
                            </h2>
                            {subtitle && (
                                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    </div>
                    {headerRight && <div className="shrink-0">{headerRight}</div>}
                </header>
                <div className="space-y-3">{children}</div>
            </div>
        </section>
    );
}
