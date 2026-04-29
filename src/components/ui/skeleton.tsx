/**
 * Skeleton — 데이터 로딩 placeholder (v1.0.21).
 *
 * spinner 대비 장점:
 * - layout shift 0 — 실제 컨텐츠 크기 미리 점유
 * - 인지된 속도 향상 (perceived performance)
 *
 * 사용:
 *   <Skeleton className="h-4 w-32" />
 *   <SkeletonCard /> — 진행 추이/예측용 prebuilt
 */
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn('skeleton-shimmer rounded-md', className)}
            aria-hidden
            {...props}
        />
    );
}

/** KPI 카드용 skeleton — BacklogStateCards 형태 */
export function SkeletonStatCard() {
    return (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-7 w-12" />
        </div>
    );
}

/** 차트 영역 skeleton */
export function SkeletonChart({ height = 200 }: { height?: number }) {
    return (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-baseline justify-between">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="w-full" style={{ height }} />
        </div>
    );
}

/** 테이블용 row skeleton */
export function SkeletonRow({ cols = 4 }: { cols?: number }) {
    return (
        <div className="flex gap-2 py-2 border-b border-border last:border-0">
            {Array.from({ length: cols }).map((_, i) => (
                <Skeleton key={i} className="h-3 flex-1" />
            ))}
        </div>
    );
}

/** 진행 추이/예측 탭 첫 진입용 — 카테고리 섹션 placeholder */
export function SkeletonSection() {
    return (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonStatCard key={i} />
                ))}
            </div>
        </div>
    );
}
