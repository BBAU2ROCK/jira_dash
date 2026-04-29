import React from "react";
import { cn } from "@/lib/utils";
import { type JiraIssue } from "@/api/jiraClient";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Loader2, Layers, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
    epics: JiraIssue[];
    selectedEpicIds: string[];
    onSelectEpic: (id: string | null) => void;
    className?: string;
    isLoading?: boolean;
    error?: Error | null;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    onOpenSettings?: () => void;
}

function EpicList({
    epics,
    selectedEpicIds,
    onSelectEpic,
    isLoading,
    error,
    onOpenSettings,
}: Pick<SidebarProps, "epics" | "selectedEpicIds" | "onSelectEpic" | "isLoading" | "error" | "onOpenSettings">) {
    return (
        <ScrollArea className="h-[calc(100vh-120px)]">
            <div className="space-y-1.5 px-2 py-2">
                {isLoading && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                )}

                {error && (
                    <div className="text-sm text-center text-destructive py-4 px-2 space-y-2">
                        <p className="font-medium">에러 발생</p>
                        <p className="text-xs mt-1 text-muted-foreground">
                            {String(error.message).includes('401')
                                ? 'Jira 인증이 필요합니다. 상단 설정에서 이메일과 API 토큰을 입력한 뒤 연결 테스트 후 저장하세요.'
                                : String(error.message).includes('403')
                                    ? 'Jira 접근 권한이 없습니다. API 토큰 권한을 확인하세요.'
                                    : error.message}
                        </p>
                        {onOpenSettings && (
                            <Button variant="outline" size="sm" className="mt-2" onClick={onOpenSettings}>
                                Jira 연결 설정
                            </Button>
                        )}
                    </div>
                )}

                {!isLoading && !error && epics.length === 0 && (
                    <div className="text-sm text-center text-muted-foreground py-4 space-y-2">
                        <p>에픽을 찾을 수 없습니다.</p>
                        {onOpenSettings && (
                            <Button variant="outline" size="sm" className="mt-2" onClick={onOpenSettings}>
                                Jira 연결 설정
                            </Button>
                        )}
                    </div>
                )}

                {!isLoading && !error && epics.map((epic) => {
                    const isSelected = selectedEpicIds.includes(epic.key);
                    return (
                        <button
                            type="button"
                            key={epic.id}
                            onClick={() => {
                                if (isSelected) onSelectEpic(null);
                                else onSelectEpic(epic.key);
                            }}
                            className={cn(
                                // base
                                "group relative w-full text-left rounded-lg p-3 transition-all duration-200 outline-none",
                                "border focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                isSelected
                                    ? [
                                        // 선택 — primary tint + ring + glow + 좌측 strip
                                        "bg-primary/[0.08] dark:bg-primary/[0.12]",
                                        "border-primary/50 dark:border-primary/40",
                                        "shadow-[0_0_0_1px_hsl(var(--primary)/0.15),0_4px_12px_-2px_hsl(var(--primary)/0.25)]",
                                    ].join(" ")
                                    : [
                                        // 비선택 — 충분한 대비, hover 시 lift
                                        "bg-card hover:bg-accent/40",
                                        "border-border/60 hover:border-border",
                                        "hover:shadow-sm",
                                    ].join(" ")
                            )}
                        >
                            {/* Left selection strip (선택 시) */}
                            {isSelected && (
                                <span
                                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary"
                                    aria-hidden
                                />
                            )}
                            <div className={cn("flex flex-col gap-1.5", isSelected && "pl-1")}>
                                <div className="flex items-center gap-2 min-w-0">
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "font-mono text-[10px] px-1.5 py-0 h-5 shrink-0 tracking-tight",
                                            isSelected
                                                ? "bg-primary/15 text-primary border-primary/40 dark:bg-primary/20 dark:text-primary"
                                                : "bg-muted/40 text-foreground/80 border-border"
                                        )}
                                    >
                                        {epic.key}
                                    </Badge>
                                    {epic.fields.assignee && (
                                        <span
                                            className={cn(
                                                "text-[11px] truncate",
                                                isSelected
                                                    ? "text-foreground/80"
                                                    : "text-muted-foreground"
                                            )}
                                        >
                                            {epic.fields.assignee.displayName}
                                        </span>
                                    )}
                                </div>
                                <span
                                    className={cn(
                                        "text-sm font-medium line-clamp-2 leading-snug tracking-tight",
                                        isSelected ? "text-foreground" : "text-foreground/90 group-hover:text-foreground"
                                    )}
                                >
                                    {epic.fields.summary}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </ScrollArea>
    );
}

export function Sidebar({
    epics,
    selectedEpicIds,
    onSelectEpic,
    className,
    isLoading,
    error,
    isCollapsed = false,
    onToggleCollapse,
    onOpenSettings,
}: SidebarProps) {
    const [isHovering, setIsHovering] = React.useState(false);

    // Collapsed state
    if (isCollapsed) {
        return (
            <div
                className="relative h-full flex-shrink-0"
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
            >
                <div
                    className={cn(
                        "h-full bg-card border-r border-border flex flex-col items-center pt-4 pb-4 gap-3 cursor-pointer select-none transition-colors",
                        "hover:bg-accent/30"
                    )}
                    style={{ width: 48 }}
                    onClick={onToggleCollapse}
                    title="클릭하여 펼치기"
                >
                    <div className="text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronRight className="h-4 w-4" />
                    </div>
                    <div
                        className="flex-1 flex items-center justify-center"
                        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                    >
                        <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-primary flex-shrink-0" style={{ transform: 'rotate(90deg)' }} />
                            <span className="text-sm font-semibold tracking-widest text-foreground/80">
                                Epics
                            </span>
                            {epics.length > 0 && (
                                <span className="text-xs font-bold text-primary">
                                    {epics.length}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {isHovering && (
                    <div
                        className="absolute top-0 left-12 z-50 bg-popover border border-border shadow-xl rounded-r-lg overflow-hidden"
                        style={{ width: 280, maxHeight: '100vh' }}
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                    >
                        <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-muted/40">
                            <Layers className="h-4 w-4 text-primary" />
                            <h2 className="text-sm font-semibold tracking-tight text-foreground">Epics</h2>
                            {epics.length > 0 && (
                                <Badge variant="secondary" className="ml-auto">
                                    {epics.length}
                                </Badge>
                            )}
                            <button
                                className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
                                onClick={onToggleCollapse}
                                title="펼치기"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                        <EpicList
                            epics={epics}
                            selectedEpicIds={selectedEpicIds}
                            onSelectEpic={onSelectEpic}
                            isLoading={isLoading}
                            error={error}
                            onOpenSettings={onOpenSettings}
                        />
                    </div>
                )}
            </div>
        );
    }

    // Expanded state — v1.0.21: subtle gradient, 더 강한 분리감
    return (
        <div
            className={cn(
                "pb-12 h-full flex flex-col",
                "bg-gradient-to-b from-card to-card/60",
                "border-r border-border",
                "supports-[backdrop-filter]:bg-card/95 supports-[backdrop-filter]:backdrop-blur-md",
                className
            )}
        >
            <div className="space-y-4 py-4 flex-1">
                <div className="px-3 py-2">
                    <div className="mb-4 px-2 flex items-center gap-2">
                        <div className="rounded-md p-1.5 bg-primary/10 dark:bg-primary/15">
                            <Layers className="h-4 w-4 text-primary" />
                        </div>
                        <h2 className="text-base font-semibold tracking-tight text-foreground">
                            Epics
                        </h2>
                        {epics.length > 0 && (
                            <Badge variant="secondary" className="ml-auto tabular-nums">
                                {epics.length}
                            </Badge>
                        )}
                        <button
                            type="button"
                            className={cn(
                                "ml-1 inline-flex items-center justify-center rounded-md",
                                "h-7 w-7 border border-border bg-background/80",
                                "text-muted-foreground hover:text-foreground hover:bg-accent hover:border-accent-foreground/20",
                                "transition-colors shadow-sm"
                            )}
                            onClick={onToggleCollapse}
                            title="사이드바 접기"
                            aria-label="사이드바 접기"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <EpicList
                        epics={epics}
                        selectedEpicIds={selectedEpicIds}
                        onSelectEpic={onSelectEpic}
                        isLoading={isLoading}
                        error={error}
                        onOpenSettings={onOpenSettings}
                    />
                </div>
            </div>
        </div>
    );
}
