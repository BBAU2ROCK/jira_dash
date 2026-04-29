import React from 'react';
import { type JiraIssue } from '@/api/jiraClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Check, Search, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DateRange } from 'react-day-picker';

export interface FilterState {
    title: string;
    assignees: string[];
    statuses: string[];
    period: DateRange | undefined;
    onlyDelayed: boolean;
    onlyDelayedDone: boolean;
}

interface IssueFilterBarProps {
    issues: JiraIssue[];
    onFilterChange: (filters: FilterState) => void;
    onFullReset?: () => void;
    children?: React.ReactNode;
}

export function IssueFilterBar({ issues, onFilterChange, onFullReset, children }: IssueFilterBarProps) {
    const [title, setTitle] = React.useState('');
    const [selectedAssignees, setSelectedAssignees] = React.useState<string[]>([]);
    const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>([]);
    const [period, setPeriod] = React.useState<DateRange | undefined>();
    const [onlyDelayed, setOnlyDelayed] = React.useState(false);
    const [onlyDelayedDone, setOnlyDelayedDone] = React.useState(false);

    const availableAssignees = React.useMemo(() => {
        const names = new Set(issues.map(i => i.fields.assignee?.displayName).filter(Boolean));
        return Array.from(names).sort() as string[];
    }, [issues]);

    const availableStatuses = React.useMemo(() => {
        const names = new Set(issues.map(i => i.fields.status.name));
        return Array.from(names).sort();
    }, [issues]);

    React.useEffect(() => {
        const timer = setTimeout(() => {
            onFilterChange({
                title,
                assignees: selectedAssignees,
                statuses: selectedStatuses,
                period,
                onlyDelayed,
                onlyDelayedDone
            });
        }, 300);
        return () => clearTimeout(timer);
    }, [title, selectedAssignees, selectedStatuses, period, onlyDelayed, onlyDelayedDone, onFilterChange]);

    const toggleSelection = (list: string[], item: string, setter: (val: string[]) => void) => {
        if (list.includes(item)) {
            setter(list.filter(i => i !== item));
        } else {
            setter([...list, item]);
        }
    };

    return (
        <div className="flex flex-col gap-4 mb-4 p-4 bg-muted/30 rounded-xl border border-border">
            <div className="flex flex-wrap gap-3 items-center">
                {/* Title Search */}
                <div className="w-[180px]">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="제목 검색..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="pl-9 h-9 bg-card text-sm"
                        />
                    </div>
                </div>

                {/* Assignee MultiSelect */}
                <div className="w-[180px]">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "w-full h-9 justify-between font-normal bg-card hover:bg-accent text-sm px-3",
                                    selectedAssignees.length === 0 && "text-muted-foreground"
                                )}
                            >
                                <div className="truncate flex-1 text-left">
                                    {selectedAssignees.length === 0 ? "모든 담당자" :
                                        selectedAssignees.length === 1 ? selectedAssignees[0] :
                                            `담당자 ${selectedAssignees.length}명`}
                                </div>
                                <ChevronDown className="h-4 w-4 ml-2 text-muted-foreground shrink-0" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] p-0" align="start">
                            <div className="p-2 border-b border-border bg-muted/40 flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-muted-foreground">담당자 선택</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-[10px] text-primary hover:text-primary hover:bg-primary/10"
                                    onClick={() => setSelectedAssignees(selectedAssignees.length === availableAssignees.length ? [] : [...availableAssignees])}
                                >
                                    {selectedAssignees.length === availableAssignees.length ? "전체 해제" : "전체 선택"}
                                </Button>
                            </div>
                            <ScrollArea className="h-[250px]">
                                <div className="p-1">
                                    {availableAssignees.map(name => {
                                        const checked = selectedAssignees.includes(name);
                                        return (
                                            <div
                                                key={name}
                                                className={cn(
                                                    "flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer rounded-md transition-colors",
                                                    checked
                                                        ? "bg-primary/10 text-primary font-medium"
                                                        : "text-foreground/90 hover:bg-accent/40"
                                                )}
                                                onClick={() => toggleSelection(selectedAssignees, name, setSelectedAssignees)}
                                            >
                                                <div className={cn(
                                                    "w-4 h-4 border rounded flex items-center justify-center transition-colors shrink-0",
                                                    checked
                                                        ? "bg-primary border-primary"
                                                        : "border-border bg-card"
                                                )}>
                                                    {checked && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
                                                </div>
                                                <span className="truncate">{name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </ScrollArea>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Status MultiSelect */}
                <div className="w-[160px]">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "w-full h-9 justify-between font-normal bg-card hover:bg-accent text-sm px-3",
                                    selectedStatuses.length === 0 && "text-muted-foreground"
                                )}
                            >
                                <div className="truncate flex-1 text-left">
                                    {selectedStatuses.length === 0 ? "모든 상태" :
                                        selectedStatuses.length === 1 ? selectedStatuses[0] :
                                            `상태 ${selectedStatuses.length}개`}
                                </div>
                                <ChevronDown className="h-4 w-4 ml-2 text-muted-foreground shrink-0" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[180px] p-0" align="start">
                            <div className="p-2 border-b border-border bg-muted/40 flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-muted-foreground">상태 선택</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-[10px] text-primary hover:text-primary hover:bg-primary/10"
                                    onClick={() => setSelectedStatuses(selectedStatuses.length === availableStatuses.length ? [] : [...availableStatuses])}
                                >
                                    {selectedStatuses.length === availableStatuses.length ? "전체 해제" : "전체 선택"}
                                </Button>
                            </div>
                            <div className="p-1">
                                {availableStatuses.map(s => {
                                    const checked = selectedStatuses.includes(s);
                                    return (
                                        <div
                                            key={s}
                                            className={cn(
                                                "flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer rounded-md transition-colors",
                                                checked
                                                    ? "bg-primary/10 text-primary font-medium"
                                                    : "text-foreground/90 hover:bg-accent/40"
                                            )}
                                            onClick={() => toggleSelection(selectedStatuses, s, setSelectedStatuses)}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 border rounded flex items-center justify-center transition-colors shrink-0",
                                                checked
                                                    ? "bg-primary border-primary"
                                                    : "border-border bg-card"
                                            )}>
                                                {checked && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
                                            </div>
                                            <span>{s}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Period Picker — v1.0.23: 강제 dark 제거, 토큰 기반 */}
                <div className="w-[240px]">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "w-full h-9 justify-start text-left font-normal bg-card hover:bg-accent text-sm",
                                    !period && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {period?.from ? (
                                    period.to ? (
                                        <>
                                            {format(period.from, "yy.MM.dd")} - {format(period.to, "yy.MM.dd")}
                                        </>
                                    ) : (
                                        format(period.from, "yy.MM.dd")
                                    )
                                ) : (
                                    <span>기간 (Due Date)</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={period?.from}
                                selected={period}
                                onSelect={setPeriod}
                                numberOfMonths={2}
                                locale={ko}
                                className="rounded-md p-2"
                            />
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Delay Toggle */}
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setOnlyDelayed(!onlyDelayed)}
                        className={cn(
                            "h-9 bg-card transition-colors text-sm",
                            onlyDelayed && "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-100 dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/60"
                        )}
                    >
                        <span className={cn("w-2 h-2 rounded-full mr-2", onlyDelayed ? "bg-red-500" : "bg-muted-foreground/40")} />
                        지연 이슈
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => setOnlyDelayedDone(!onlyDelayedDone)}
                        className={cn(
                            "h-9 bg-card transition-colors text-sm",
                            onlyDelayedDone && "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900/60 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:bg-orange-950/40 dark:border-orange-900/60 dark:text-orange-300 dark:hover:bg-orange-950/60"
                        )}
                    >
                        <span className={cn("w-2 h-2 rounded-full mr-2", onlyDelayedDone ? "bg-orange-500" : "bg-muted-foreground/40")} />
                        지연 완료
                    </Button>
                    {onFullReset && (
                        <Button variant="outline" size="sm" onClick={onFullReset} className="h-9 shrink-0">
                            초기화
                        </Button>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-2">
                    {children}
                </div>
            </div>
        </div>
    );
}
