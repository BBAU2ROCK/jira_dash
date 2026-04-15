import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, ChevronRight, ChevronDown, ChevronsDown, ChevronsRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type JiraIssue } from '@/api/jiraClient';
import { filterLeafIssues, getStatusCategoryKey } from '@/lib/jira-helpers';
import { formatDateSafe } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { IssueFilterBar, type FilterState } from './issue-filter-bar';

const INITIAL_FILTER: FilterState = {
    title: '',
    assignees: [],
    statuses: [],
    period: undefined,
    onlyDelayed: false,
    onlyDelayedDone: false
};

interface IssueListProps {
    issues: JiraIssue[];
    isLoading?: boolean;
    /** 프로젝트 통계 담당자별 현황에서 난이도/이슈 클릭 시 해당 키만 표시 */
    focusIssueKeys?: string[] | null;
    /** 통계 선택 해제 시 호출 (전체 보기) */
    onClearFocusIssueKeys?: () => void;
    onIssueClick?: (issue: JiraIssue) => void;
}

export function IssueList({ issues, isLoading, focusIssueKeys, onClearFocusIssueKeys, onIssueClick }: IssueListProps) {
    const [expandedParents, setExpandedParents] = React.useState<Set<string>>(new Set());
    const [expandAll, setExpandAll] = React.useState(false);
    const [filterResetKey, setFilterResetKey] = React.useState(0);
    const [filter, setFilter] = React.useState<FilterState>(INITIAL_FILTER);

    const handleReset = React.useCallback(() => {
        setFilter(INITIAL_FILTER);
        setFilterResetKey(k => k + 1);
        onClearFocusIssueKeys?.();
    }, [onClearFocusIssueKeys]);

    // ── Filtering Logic ─────────────────────────────────────────────────────────────
    const { filteredIssues, matchCount } = React.useMemo(() => {
        if (!issues) return { filteredIssues: [], matchCount: 0 };

        // 통계에서 선택된 키만 먼저 제한 (담당자별 현황 → 난이도/이슈 클릭)
        const sourceIssues = focusIssueKeys && focusIssueKeys.length > 0
            ? issues.filter(i => focusIssueKeys.includes(i.key))
            : issues;

        const matches = sourceIssues.filter(issue => {
            // 1. Title
            if (filter.title && !issue.fields.summary.toLowerCase().includes(filter.title.toLowerCase())) return false;

            // 2. Assignee (Multi-select)
            if (filter.assignees.length > 0 && (!issue.fields.assignee || !filter.assignees.includes(issue.fields.assignee.displayName))) return false;

            // 3. Status (Multi-select)
            if (filter.statuses.length > 0 && !filter.statuses.includes(issue.fields.status?.name ?? '')) return false;

            // 4. Delay (In-progress)
            const isDelayed = issue.fields.duedate && new Date(issue.fields.duedate) < new Date() && getStatusCategoryKey(issue) !== 'done';
            if (filter.onlyDelayed && !isDelayed) return false;

            // 5. Delayed Done (Completed but late)
            const isDelayedDone = getStatusCategoryKey(issue) === 'done' &&
                issue.fields.duedate &&
                issue.fields.resolutiondate &&
                new Date(issue.fields.resolutiondate) > new Date(new Date(issue.fields.duedate).setHours(23, 59, 59, 999));
            if (filter.onlyDelayedDone && !isDelayedDone) return false;

            // 6. Period (Due Date)
            if (filter.period?.from && issue.fields.duedate) {
                const due = new Date(issue.fields.duedate);
                const from = new Date(filter.period.from); from.setHours(0, 0, 0, 0);
                const to = filter.period.to ? new Date(filter.period.to) : from; to.setHours(23, 59, 59, 999);
                if (due < from || due > to) return false;
            } else if (filter.period?.from && !issue.fields.duedate) {
                return false; // 기간 설정되었는데 날짜 없으면 제외
            }
            return true;
        });

        // Hierarchy Preservation: Include parents if subtask matches
        const finalSet = new Set<JiraIssue>(matches);
        const parentKeysNeeded = new Set<string>();

        matches.forEach(i => {
            if (i.fields.parent) parentKeysNeeded.add(i.fields.parent.key);
        });

        if (parentKeysNeeded.size > 0) {
            issues.forEach(i => {
                if (parentKeysNeeded.has(i.key)) finalSet.add(i);
            });
        }

        const filteredList = Array.from(finalSet);
        // 건수 규칙: 할 일만 카운트, 하위 작업 있으면 부모 제외·하위만 반영
        const matchCount = filterLeafIssues(filteredList).length;

        return {
            filteredIssues: filteredList,
            matchCount
        };
    }, [issues, filter, focusIssueKeys]);

    const allParentKeys = React.useMemo(() => {
        return filteredIssues
            .filter(i => i.fields.subtasks && i.fields.subtasks.length > 0)
            .map(i => i.key);
    }, [filteredIssues]);

    // Toggle expand all / collapse all
    const toggleExpandAll = () => {
        if (expandAll) {
            // Collapse all
            setExpandedParents(new Set());
            setExpandAll(false);
        } else {
            // Expand all
            setExpandedParents(new Set(allParentKeys));
            setExpandAll(true);
        }
    };

    // Top-level issues: issues that have no parent, OR whose parent is not in filteredIssues
    // This ensures subtasks appear at top level when their parent didn't match the filter
    const filteredKeys = new Set(filteredIssues.map(i => i.key));
    const topLevelIssues = filteredIssues.filter(i => !i.fields.parent || !filteredKeys.has(i.fields.parent.key));

    // Build map from filteredIssues (so only matching subtasks are shown)
    const subtaskMap = React.useMemo(() => {
        const map = new Map<string, JiraIssue[]>();
        filteredIssues.forEach(issue => {
            if (issue.fields.parent) {
                const parentKey = issue.fields.parent.key;
                if (!map.has(parentKey)) {
                    map.set(parentKey, []);
                }
                map.get(parentKey)!.push(issue);
            }
        });
        return map;
    }, [filteredIssues]);

    const toggleParent = (parentKey: string) => {
        setExpandedParents(prev => {
            const newSet = new Set(prev);
            if (newSet.has(parentKey)) {
                newSet.delete(parentKey);
            } else {
                newSet.add(parentKey);
            }
            // Update expandAll state based on current expansion
            setExpandAll(newSet.size === allParentKeys.length);
            return newSet;
        });
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-4" />
                <p>이슈를 불러오는 중...</p>
            </div>
        );
    }

    if (!issues || issues.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg">이슈가 없습니다</p>
            </div>
        );
    }

    const renderIssue = (issue: JiraIssue, isSubtask: boolean = false, level: number = 0) => {
        const isDelayed = issue.fields.duedate && new Date(issue.fields.duedate) < new Date() && getStatusCategoryKey(issue) !== 'done';
        const isDone = getStatusCategoryKey(issue) === 'done';
        const hasSubtasks = issue.fields.subtasks && issue.fields.subtasks.length > 0;
        const isExpanded = expandedParents.has(issue.key);
        const children = subtaskMap.get(issue.key) || [];

        return (
            <React.Fragment key={issue.id}>
                <TableRow
                    className={cn(
                        "cursor-pointer hover:bg-muted/50 transition-colors",
                        isSubtask ? "bg-blue-50" : hasSubtasks ? "bg-slate-50" : "bg-white"
                    )}
                    onClick={() => onIssueClick?.(issue)}
                >
                    {/* Key */}
                    <TableCell className="font-mono text-xs text-muted-foreground font-medium">
                        {issue.key}
                    </TableCell>

                    {/* Title - Clickable for expand/collapse */}
                    <TableCell className="font-medium">
                        <div
                            className="flex items-center gap-2 cursor-pointer hover:text-blue-600 transition-colors"
                            style={{ paddingLeft: `${level * 24}px` }}
                            onClick={(e) => {
                                if (hasSubtasks) {
                                    e.stopPropagation(); // subtask 토글 시에만 row click 차단
                                    toggleParent(issue.key);
                                }
                            }}
                        >
                            {hasSubtasks && (
                                <span className="flex-shrink-0">
                                    {isExpanded ? (
                                        <ChevronDown className="h-4 w-4 text-blue-600" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4 text-blue-600" />
                                    )}
                                </span>
                            )}
                            {isSubtask && !hasSubtasks && (
                                <span className="w-4 flex-shrink-0"></span>
                            )}
                            {issue.fields.priority && (
                                <img
                                    src={issue.fields.priority.iconUrl}
                                    className="w-4 h-4 flex-shrink-0"
                                    alt={issue.fields.priority.name}
                                />
                            )}
                            <span className={cn(
                                "truncate max-w-[400px]",
                                isSubtask && "text-sm",
                                hasSubtasks && "font-semibold text-slate-800"
                            )}>
                                {issue.fields.summary}
                                {hasSubtasks && (
                                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                                        ({children.length}개)
                                    </span>
                                )}
                            </span>
                        </div>
                    </TableCell>

                    {/* Assignee */}
                    <TableCell className="text-sm">
                        {issue.fields.assignee ? (
                            <span className="text-slate-700">{issue.fields.assignee.displayName}</span>
                        ) : (
                            <span className="text-muted-foreground text-xs">미할당</span>
                        )}
                    </TableCell>

                    {/* 계획시작: customfield_11481 */}
                    <TableCell className="text-xs text-muted-foreground">
                        {formatDateSafe(issue.fields.customfield_11481)}
                    </TableCell>
                    {/* 완료예정: duedate */}
                    <TableCell className="text-xs text-muted-foreground">
                        {formatDateSafe(issue.fields.duedate)}
                    </TableCell>
                    {/* 실제시작: customfield_11484 */}
                    <TableCell className="text-xs text-muted-foreground">
                        {formatDateSafe(issue.fields.customfield_11484)}
                    </TableCell>
                    {/* 실제완료: resolutiondate */}
                    <TableCell className="text-xs text-muted-foreground">
                        {formatDateSafe(issue.fields.resolutiondate)}
                    </TableCell>

                    {/* Delay indicator */}
                    <TableCell className="text-center">
                        {isDelayed && (
                            <div className="flex items-center justify-center">
                                <AlertCircle className="w-4 h-4 text-red-500" />
                            </div>
                        )}
                        {isDone && (
                            <div className="flex items-center justify-center">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                            </div>
                        )}
                    </TableCell>

                    {/* Status - Moved to end */}
                    <TableCell>
                        <Badge
                            variant="outline"
                            className={cn(
                                "whitespace-nowrap font-normal text-xs",
                                isDone ? "bg-green-50 text-green-700 border-green-200" :
                                    getStatusCategoryKey(issue) === 'indeterminate' ? "bg-blue-50 text-blue-700 border-blue-200" :
                                        "bg-slate-50 text-slate-700 border-slate-200"
                            )}
                        >
                            {issue.fields.status?.name ?? '—'}
                        </Badge>
                    </TableCell>
                </TableRow>

                {/* Render subtasks if expanded */}
                {hasSubtasks && isExpanded && children.map((child) =>
                    renderIssue(child, true, level + 1)
                )}
            </React.Fragment>
        );
    };

    return (
        <div className="w-full">
            <IssueFilterBar
                key={`filter-bar-${filterResetKey}`}
                issues={issues}
                onFilterChange={setFilter}
                onFullReset={handleReset}
            >
                {/* Expand/Collapse All Button - Moved inside FilterBar */}
                {allParentKeys.length > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleExpandAll}
                        className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    >
                        {expandAll ? (
                            <>
                                <ChevronsRight className="h-4 w-4 mr-2" />
                                <span>모두 접기</span>
                            </>
                        ) : (
                            <>
                                <ChevronsDown className="h-4 w-4 mr-2" />
                                <span>모두 펼치기</span>
                            </>
                        )}
                    </Button>
                )}
                {/* Search Count Display */}
                <div className="flex items-center px-2 py-1 bg-blue-50/50 rounded-full border border-blue-100 shadow-sm">
                    <span className="text-xs font-semibold text-blue-600 mr-1.5">검색 결과</span>
                    <span className="text-sm font-bold text-blue-700 bg-white px-1.5 py-0.5 rounded shadow-inner border border-blue-50">
                        {matchCount}
                    </span>
                    <span className="text-xs font-medium text-blue-500 ml-1">건</span>
                </div>
            </IssueFilterBar>

            {focusIssueKeys && focusIssueKeys.length > 0 && onClearFocusIssueKeys && (
                <div className="flex items-center justify-between gap-2 px-4 py-2 bg-slate-100 border-b border-slate-200">
                    <span className="text-sm text-slate-600">
                        통계에서 선택: <strong>{focusIssueKeys.length}</strong>건
                    </span>
                    <Button variant="ghost" size="sm" onClick={onClearFocusIssueKeys} className="text-blue-600 hover:bg-blue-50">
                        전체 보기
                    </Button>
                </div>
            )}

            <Table>
                <TableHeader>
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[100px]">키</TableHead>
                        <TableHead>제목</TableHead>
                        <TableHead className="w-[120px]">담당자</TableHead>
                        <TableHead className="w-[100px]">계획 시작</TableHead>
                        <TableHead className="w-[100px]">완료 예정</TableHead>
                        <TableHead className="w-[100px]">실제 시작</TableHead>
                        <TableHead className="w-[100px]">실제 완료</TableHead>
                        <TableHead className="w-[60px] text-center">지연</TableHead>
                        <TableHead className="w-[120px]">상태</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {/* Render all top-level issues (parents, standalone, and orphaned subtasks) */}
                    {topLevelIssues.map((issue) => renderIssue(issue, false, 0))}
                </TableBody>
            </Table>
        </div>
    );
}
