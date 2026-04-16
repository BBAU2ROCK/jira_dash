import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface InfoTipProps {
    /** 툴팁 내용 (짧은 텍스트 또는 React node) */
    children: React.ReactNode;
    /** 아이콘 크기 (default 3.5) */
    size?: 'sm' | 'md';
    /** 위치 (default start) */
    align?: 'start' | 'center' | 'end';
}

/**
 * 지표 옆 정보 툴팁 — ⓘ 아이콘 hover/click → popover로 설명 표시.
 *
 * 사용 예:
 *   <span>완료율 <InfoTip>leaf 이슈 중 done 비율</InfoTip></span>
 */
export function InfoTip({ children, size = 'sm', align = 'start' }: InfoTipProps) {
    const [open, setOpen] = React.useState(false);
    const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center text-slate-400 hover:text-blue-500 transition-colors align-middle ml-0.5"
                    aria-label="설명 보기"
                    onMouseEnter={() => setOpen(true)}
                    onMouseLeave={() => setOpen(false)}
                >
                    <HelpCircle className={iconSize} />
                </button>
            </PopoverTrigger>
            <PopoverContent
                className="w-64 p-2.5 text-xs text-slate-700 bg-white border border-slate-200 shadow-lg"
                align={align}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
            >
                {children}
            </PopoverContent>
        </Popover>
    );
}
