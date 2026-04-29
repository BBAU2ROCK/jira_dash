import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Card — v1.0.21 개선:
 * - shadow-sm 기본 (전 shadow), hover 시 lift (interactive prop)
 * - rounded-xl 유지 (radius 토큰 활용)
 * - 다크모드 자동 (bg-card)
 */
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    /** hover 시 shadow lift + border 강조 */
    interactive?: boolean;
    /** padding compact (sm) — KPI 대시보드 카드는 보통 작음 */
    compact?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
    ({ className, interactive, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                "rounded-xl border border-border bg-card text-card-foreground shadow-sm",
                interactive && "card-hover cursor-pointer",
                className
            )}
            {...props}
        />
    )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { compact?: boolean }>(
    ({ className, compact, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                "flex flex-col space-y-1.5",
                compact ? "p-3 sm:p-4" : "p-6",
                className
            )}
            {...props}
        />
    )
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn("font-semibold leading-tight tracking-tight", className)}
            {...props}
        />
    )
)
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn("text-sm text-muted-foreground", className)}
            {...props}
        />
    )
)
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { compact?: boolean }>(
    ({ className, compact, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(compact ? "p-3 sm:p-4 pt-0" : "p-6 pt-0", className)}
            {...props}
        />
    )
)
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { compact?: boolean }>(
    ({ className, compact, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                "flex items-center",
                compact ? "p-3 sm:p-4 pt-0" : "p-6 pt-0",
                className
            )}
            {...props}
        />
    )
)
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
