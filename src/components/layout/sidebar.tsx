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
}

function EpicList({
    epics,
    selectedEpicIds,
    onSelectEpic,
    isLoading,
    error,
}: Pick<SidebarProps, "epics" | "selectedEpicIds" | "onSelectEpic" | "isLoading" | "error">) {
    return (
        <ScrollArea className="h-[calc(100vh-120px)]">
            <div className="space-y-1 p-2">
                {isLoading && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                )}

                {error && (
                    <div className="text-sm text-center text-red-500 py-4 px-2">
                        <p className="font-medium">에러 발생</p>
                        <p className="text-xs mt-1">{error.message}</p>
                    </div>
                )}

                {!isLoading && !error && epics.length === 0 && (
                    <div className="text-sm text-center text-muted-foreground py-4">
                        에픽을 찾을 수 없습니다.
                    </div>
                )}

                {!isLoading && !error && epics.map((epic) => {
                    const isSelected = selectedEpicIds.includes(epic.key);
                    return (
                        <Button
                            key={epic.id}
                            variant="ghost"
                            style={{
                                backgroundColor: isSelected ? '#3b82f6' : 'transparent',
                                color: isSelected ? '#ffffff' : '#1f2937',
                            }}
                            className="w-full justify-start text-left h-auto py-3 px-3 hover:bg-gray-100"
                            onClick={() => {
                                if (isSelected) {
                                    onSelectEpic(null);
                                } else {
                                    onSelectEpic(epic.key);
                                }
                            }}
                        >
                            <div className="flex flex-col gap-1 w-full">
                                <div className="flex items-center gap-2">
                                    <Badge
                                        variant="outline"
                                        className="font-mono text-xs border-gray-300"
                                        style={{ color: '#1f2937' }}
                                    >
                                        {epic.key}
                                    </Badge>
                                    {epic.fields.assignee && (
                                        <span className="text-xs" style={{
                                            color: isSelected ? '#e0e7ff' : '#6b7280',
                                            opacity: 0.8
                                        }}>
                                            {epic.fields.assignee.displayName}
                                        </span>
                                    )}
                                </div>
                                <span
                                    className="text-sm font-medium line-clamp-2"
                                    style={{ color: isSelected ? '#ffffff' : '#111827' }}
                                >
                                    {epic.fields.summary}
                                </span>
                            </div>
                        </Button>
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
}: SidebarProps) {
    const [isHovering, setIsHovering] = React.useState(false);

    // Collapsed state: show vertical label + floating menu on hover
    if (isCollapsed) {
        return (
            <div
                className="relative h-full flex-shrink-0"
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
            >
                {/* Collapsed bar with vertical label */}
                <div
                    className={cn(
                        "h-full bg-white border-r border-slate-200 flex flex-col items-center pt-4 pb-4 gap-3 cursor-pointer select-none transition-colors",
                        "hover:bg-gray-50"
                    )}
                    style={{ width: 48 }}
                    onClick={onToggleCollapse}
                    title="클릭하여 펼치기"
                >
                    {/* Toggle icon */}
                    <div className="text-gray-400 hover:text-gray-700 transition-colors">
                        <ChevronRight className="h-4 w-4" />
                    </div>

                    {/* Vertical label */}
                    <div
                        className="flex-1 flex items-center justify-center"
                        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                    >
                        <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-primary flex-shrink-0" style={{ transform: 'rotate(90deg)' }} />
                            <span className="text-sm font-semibold tracking-widest text-gray-600">
                                Epics
                            </span>
                            {epics.length > 0 && (
                                <span className="text-xs font-bold text-blue-500">
                                    {epics.length}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Floating hover menu */}
                {isHovering && (
                    <div
                        className="absolute top-0 left-12 z-50 bg-white border border-slate-200 shadow-xl rounded-r-lg overflow-hidden"
                        style={{ width: 280, maxHeight: '100vh' }}
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                    >
                        <div className="px-4 py-3 border-b flex items-center gap-2 bg-gray-50">
                            <Layers className="h-4 w-4 text-primary" />
                            <h2 className="text-sm font-semibold tracking-tight">Epics</h2>
                            {epics.length > 0 && (
                                <Badge variant="secondary" className="ml-auto">
                                    {epics.length}
                                </Badge>
                            )}
                            <button
                                className="ml-1 text-gray-400 hover:text-gray-700 transition-colors"
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
                        />
                    </div>
                )}
            </div>
        );
    }

    // Expanded state
    return (
        <div className={cn("pb-12 bg-background border-r h-full flex flex-col", className)}>
            <div className="space-y-4 py-4 flex-1">
                <div className="px-3 py-2">
                    <div className="mb-4 px-4 flex items-center gap-2">
                        <Layers className="h-5 w-5 text-primary" />
                        <h2 className="text-base font-semibold tracking-tight">
                            Epics
                        </h2>
                        {epics.length > 0 && (
                            <Badge variant="secondary" className="ml-auto">
                                {epics.length}
                            </Badge>
                        )}
                        {/* Collapse button */}
                        <button
                            className="ml-1 text-gray-400 hover:text-gray-700 transition-colors"
                            onClick={onToggleCollapse}
                            title="접기"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                    </div>
                    <EpicList
                        epics={epics}
                        selectedEpicIds={selectedEpicIds}
                        onSelectEpic={onSelectEpic}
                        isLoading={isLoading}
                        error={error}
                    />
                </div>
            </div>
        </div>
    );
}
