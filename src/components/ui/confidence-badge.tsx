/**
 * ConfidenceBadge — 4단계 신뢰도 일관 표시 (v1.0.20).
 *
 * 산업 표준(추천): high → medium → low → unreliable.
 * 차트·카드·표 어디에서든 동일 색상·아이콘으로 일관성 유지.
 */
import { ShieldCheck, ShieldAlert, ShieldX, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConfidenceLevel } from '@/services/prediction/types';

interface Props {
    level: ConfidenceLevel;
    /** 작은 배지 (차트 코너용) vs 일반 (카드 헤더용) */
    size?: 'sm' | 'md';
    /** 텍스트 라벨 표시 여부 (default true) */
    showLabel?: boolean;
    className?: string;
}

const LEVEL_CONFIG: Record<ConfidenceLevel, { label: string; color: string; Icon: typeof Shield; tip: string }> = {
    high: {
        label: '높음',
        color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
        Icon: ShieldCheck,
        tip: '데이터 충분 — 예측 결과 신뢰 가능',
    },
    medium: {
        label: '보통',
        color: 'bg-blue-50 border-blue-200 text-blue-700',
        Icon: Shield,
        tip: '데이터 양호 — 일반 사용 가능',
    },
    low: {
        label: '낮음',
        color: 'bg-amber-50 border-amber-200 text-amber-700',
        Icon: ShieldAlert,
        tip: '데이터 부족 — 참고용으로만 사용',
    },
    unreliable: {
        label: '신뢰 X',
        color: 'bg-rose-50 border-rose-200 text-rose-700',
        Icon: ShieldX,
        tip: '데이터 매우 부족 — 단일 ETA 표기 비활성',
    },
};

export function ConfidenceBadge({ level, size = 'sm', showLabel = true, className }: Props) {
    const config = LEVEL_CONFIG[level];
    const Icon = config.Icon;
    const isSm = size === 'sm';

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-md border font-medium',
                isSm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
                config.color,
                className
            )}
            title={config.tip}
            role="status"
            aria-label={`예측 신뢰도 ${config.label}`}
        >
            <Icon className={cn(isSm ? 'w-3 h-3' : 'w-3.5 h-3.5')} aria-hidden />
            {showLabel && <span>신뢰도 {config.label}</span>}
        </span>
    );
}
