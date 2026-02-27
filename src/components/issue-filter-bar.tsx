import React from 'react';
import { type JiraIssue } from '@/api/jiraClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, X, Search, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DateRange } from 'react-day-picker';

export interface FilterState {
    title: string;
    assignees: string[]; // 다중 선택 지원
    statuses: string[];  // 다중 선택 지원
    period: DateRange | undefined;
    onlyDelayed: boolean;
    onlyDelayedDone: boolean; // 지연 완료 추가
}

interface IssueFilterBarProps {
    issues: JiraIssue[];
    onFilterChange: (filters: FilterState) => void;
    /** 상시 노출 초기화 버튼 (지연 완료 우측). 클릭 시 통계 선택 해제 + 필터 초기화 */
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

    // Extract unique values for selects
    const availableAssignees = React.useMemo(() => {
        const names = new Set(issues.map(i => i.fields.assignee?.displayName).filter(Boolean));
        return Array.from(names).sort() as string[];
    }, [issues]);

    const availableStatuses = React.useMemo(() => {
        const names = new Set(issues.map(i => i.fields.status.name));
        return Array.from(names).sort();
    }, [issues]);

    // Debounce filter update
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

        <div className="flex flex-col gap-4 mb-4 p-4 bg-slate-50/50 rounded-lg border border-slate-200">
            {/* Header Removed as per user request */}

            <div className="flex flex-wrap gap-3 items-center">
                {/* Title Search - Fixed width reduced */}
                <div className="w-[180px]">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                        <Input
                            placeholder="제목 검색..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="pl-9 h-9 bg-white text-sm"
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
                                    "w-full h-9 justify-between font-normal bg-white text-slate-900 border-slate-200 hover:bg-slate-50 hover:text-slate-900 text-sm px-3",
                                    selectedAssignees.length === 0 && "text-slate-400"
                                )}
                            >
                                <div className="truncate flex-1 text-left">
                                    {selectedAssignees.length === 0 ? "모든 담당자" :
                                        selectedAssignees.length === 1 ? selectedAssignees[0] :
                                            `담당자 ${selectedAssignees.length}명`}
                                </div>
                                <ChevronDown className="h-4 w-4 ml-2 text-slate-400 shrink-0" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] p-0 bg-white border-slate-200 text-slate-900" align="start">
                            <div className="p-2 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-slate-500">담당자 선택</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-[9px] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    onClick={() => setSelectedAssignees(selectedAssignees.length === availableAssignees.length ? [] : [...availableAssignees])}
                                >
                                    {selectedAssignees.length === availableAssignees.length ? "전체 해제" : "전체 선택"}
                                </Button>
                            </div>
                            <ScrollArea className="h-[250px]">
                                <div className="p-1">
                                    {availableAssignees.map(name => (
                                        <div
                                            key={name}
                                            className={cn(
                                                "flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer rounded-sm hover:bg-slate-50",
                                                selectedAssignees.includes(name) && "bg-blue-50 text-blue-600 font-medium"
                                            )}
                                            onClick={() => toggleSelection(selectedAssignees, name, setSelectedAssignees)}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 border rounded flex items-center justify-center transition-colors",
                                                selectedAssignees.includes(name) ? "bg-blue-500 border-blue-500" : "border-slate-300 bg-white"
                                            )}>
                                                {selectedAssignees.includes(name) && <X className="w-3 h-3 text-white rotate-45" />}
                                            </div>
                                            <span className="truncate">{name}</span>
                                        </div>
                                    ))}
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
                                    "w-full h-9 justify-between font-normal bg-white text-slate-900 border-slate-200 hover:bg-slate-50 hover:text-slate-900 text-sm px-3",
                                    selectedStatuses.length === 0 && "text-slate-400"
                                )}
                            >
                                <div className="truncate flex-1 text-left">
                                    {selectedStatuses.length === 0 ? "모든 상태" :
                                        selectedStatuses.length === 1 ? selectedStatuses[0] :
                                            `상태 ${selectedStatuses.length}개`}
                                </div>
                                <ChevronDown className="h-4 w-4 ml-2 text-slate-400 shrink-0" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[180px] p-0 bg-white border-slate-200 text-slate-900" align="start">
                            <div className="p-2 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-slate-500">상태 선택</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-[9px] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    onClick={() => setSelectedStatuses(selectedStatuses.length === availableStatuses.length ? [] : [...availableStatuses])}
                                >
                                    {selectedStatuses.length === availableStatuses.length ? "전체 해제" : "전체 선택"}
                                </Button>
                            </div>
                            <div className="p-1">
                                {availableStatuses.map(s => (
                                    <div
                                        key={s}
                                        className={cn(
                                            "flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer rounded-sm hover:bg-slate-50",
                                            selectedStatuses.includes(s) && "bg-blue-50 text-blue-600 font-medium"
                                        )}
                                        onClick={() => toggleSelection(selectedStatuses, s, setSelectedStatuses)}
                                    >
                                        <div className={cn(
                                            "w-4 h-4 border rounded flex items-center justify-center transition-colors",
                                            selectedStatuses.includes(s) ? "bg-blue-500 border-blue-500" : "border-slate-300 bg-white"
                                        )}>
                                            {selectedStatuses.includes(s) && <X className="w-3 h-3 text-white rotate-45" />}
                                        </div>
                                        <span>{s}</span>
                                    </div>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Period Picker */}
                <div className="w-[240px]">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "w-full h-9 justify-start text-left font-normal bg-white text-sm",
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
                            <div className="dark">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={period?.from}
                                    selected={period}
                                    onSelect={setPeriod}
                                    numberOfMonths={2}
                                    locale={ko}
                                    className="bg-black text-white border-zinc-800 rounded-md p-2"
                                    classNames={{
                                        months: "relative flex flex-row gap-0",
                                        month: "flex flex-col gap-4 px-3 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-zinc-700"
                                    }}
                                    style={{ '--cell-size': '1.75rem' } as React.CSSProperties}
                                />
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Delay Toggle */}
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setOnlyDelayed(!onlyDelayed)}
                        className={cn(
                            "h-9 bg-white transition-colors text-sm",
                            onlyDelayed && "bg-red-50 border-red-200 text-red-600 hover:bg-red-100 hover:text-red-700"
                        )}
                    >
                        <span className={cn("w-2 h-2 rounded-full mr-2", onlyDelayed ? "bg-red-500" : "bg-slate-300")} />
                        지연 이슈
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => setOnlyDelayedDone(!onlyDelayedDone)}
                        className={cn(
                            "h-9 bg-white transition-colors text-sm",
                            onlyDelayedDone && "bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100 hover:text-orange-700"
                        )}
                    >
                        <span className={cn("w-2 h-2 rounded-full mr-2", onlyDelayedDone ? "bg-orange-500" : "bg-slate-300")} />
                        지연 완료
                    </Button>
                    {onFullReset && (
                        <Button variant="outline" size="sm" onClick={onFullReset} className="h-9 shrink-0">
                            초기화
                        </Button>
                    )}
                </div>

                {/* Right Aligned Children (Expand All Button 등) — 초기화는 지연 완료 옆 단일 버튼으로 일원화 */}
                <div className="ml-auto flex items-center gap-2">
                    {children}
                </div>
            </div>
        </div>
    );
}
