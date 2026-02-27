import { useIssueDetails, useIssueMutation } from "@/hooks/use-jira";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { X, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

interface IssueDrawerProps {
    issueKey: string | null;
    onClose: () => void;
}

export function IssueDrawer({ issueKey, onClose }: IssueDrawerProps) {
    const { data: issue, isLoading } = useIssueDetails(issueKey);
    const mutation = useIssueMutation();

    if (!issueKey) return null;

    const handleUpdate = (field: string, value: any) => {
        mutation.mutate({ key: issueKey, fields: { [field]: value } });
    };

    if (isLoading || !issue) {
        return (
            <div className="fixed inset-y-0 right-0 w-[600px] bg-background border-l shadow-2xl p-6 z-40 transform transition-transform duration-300 ease-in-out">
                <div className="flex items-center justify-between mb-6">
                    <div className="h-6 w-32 bg-muted animate-pulse rounded"></div>
                    <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
                </div>
                <div className="space-y-4">
                    <div className="h-10 w-full bg-muted animate-pulse rounded"></div>
                    <div className="h-40 w-full bg-muted animate-pulse rounded"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-y-0 right-0 w-[600px] bg-background border-l shadow-2xl z-40 flex flex-col transform transition-transform duration-300 ease-in-out">
            {/* Header */}
            <div className="p-6 border-b flex items-start justify-between bg-muted/10">
                <div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <img src={issue.fields.issuetype.iconUrl} alt={issue.fields.issuetype.name} className="w-4 h-4" />
                        <span>{issue.key}</span>
                        <span className="mx-1">•</span>
                        <span className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium",
                            issue.fields.priority?.name === 'High' ? "bg-red-100 text-red-700" : "bg-secondary text-secondary-foreground"
                        )}>
                            {issue.fields.priority?.name}
                        </span>
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight">{issue.fields.summary}</h2>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-6 space-y-8">
                    {/* Status & People */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-muted-foreground">상태</h3>
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    "px-3 py-1 rounded-md text-sm font-medium border",
                                    issue.fields.status.statusCategory.key === 'done' ? "bg-green-100 text-green-700 border-green-200" :
                                        issue.fields.status.statusCategory.key === 'indeterminate' ? "bg-blue-100 text-blue-700 border-blue-200" :
                                            "bg-slate-100 text-slate-700 border-slate-200"
                                )}>
                                    {issue.fields.status.name}
                                </span>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-muted-foreground">담당자</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">담당자</span>
                                    <div className="flex items-center gap-2">
                                        {issue.fields.assignee && (
                                            <img src={issue.fields.assignee.avatarUrls['48x48']} className="w-5 h-5 rounded-full" />
                                        )}
                                        <span>{issue.fields.assignee?.displayName || '미할당'}</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">보고자</span>
                                    <div className="flex items-center gap-2">
                                        {issue.fields.reporter && (
                                            <img src={issue.fields.reporter.avatarUrls['48x48']} className="w-5 h-5 rounded-full" />
                                        )}
                                        <span>{issue.fields.reporter?.displayName || '알수없음'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Dates */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-muted-foreground">일정</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <DateField
                                label="계획 시작일"
                                date={issue.fields.customfield_10015}
                                onChange={(d) => handleUpdate('customfield_10015', d)}
                            />
                            <DateField
                                label="완료 예정일"
                                date={issue.fields.duedate}
                                onChange={(d) => handleUpdate('duedate', d)}
                            />
                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs text-muted-foreground">실제 시작일 (생성일)</span>
                                <span className="text-sm">{issue.fields.created ? format(new Date(issue.fields.created), 'yyyy-MM-dd') : '-'}</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs text-muted-foreground">실제 완료일 (해결일)</span>
                                <span className="text-sm">{issue.fields.resolutiondate ? format(new Date(issue.fields.resolutiondate), 'yyyy-MM-dd') : '-'}</span>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Description */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground">설명</h3>
                        <div className="text-sm prose prose-sm max-w-none text-muted-foreground">
                            {typeof issue.fields.description === 'string'
                                ? issue.fields.description
                                : "상세 설명은 Jira에서 확인해주세요."}
                        </div>
                    </div>

                    {/* Activity Tabs */}
                    <Tabs defaultValue="comments" className="w-full">
                        <TabsList className="w-full grid grid-cols-3">
                            <TabsTrigger value="comments">댓글 ({issue.fields.comment?.comments.length || 0})</TabsTrigger>
                            <TabsTrigger value="history">이력</TabsTrigger>
                            <TabsTrigger value="worklog">작업 로그 ({issue.fields.worklog?.worklogs.length || 0})</TabsTrigger>
                        </TabsList>
                        <TabsContent value="comments" className="mt-4 space-y-4">
                            {issue.fields.comment?.comments.map(c => (
                                <div key={c.id} className="flex gap-3 text-sm">
                                    <img src={c.author.avatarUrls['48x48']} className="w-8 h-8 rounded-full" />
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold">{c.author.displayName}</span>
                                            <span className="text-xs text-muted-foreground">{format(new Date(c.created), 'yy.MM.dd HH:mm')}</span>
                                        </div>
                                        <div className="text-muted-foreground">
                                            {JSON.stringify(c.body?.content?.[0]?.content?.[0]?.text || '').replace(/"/g, '')}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {(!issue.fields.comment?.comments.length) && <p className="text-sm text-muted-foreground text-center py-4">댓글이 없습니다.</p>}
                        </TabsContent>
                        <TabsContent value="history" className="mt-4 text-sm">
                            {issue.changelog?.histories.map(h => (
                                <div key={h.id} className="py-2 border-b last:border-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <img src={h.author.avatarUrls['48x48']} className="w-5 h-5 rounded-full" />
                                        <span className="font-medium">{h.author.displayName}</span>
                                        <span className="text-xs text-muted-foreground">{format(new Date(h.created), 'yy.MM.dd HH:mm')}</span>
                                    </div>
                                    <ul className="list-disc list-inside pl-7 text-muted-foreground text-xs">
                                        {h.items.map((item, idx) => (
                                            <li key={idx}>
                                                Changed <b>{item.field}</b> from <span className="line-through">{item.fromString || 'None'}</span> to <span>{item.toString}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </TabsContent>
                        <TabsContent value="worklog" className="mt-4 space-y-4">
                            {issue.fields.worklog?.worklogs.map(w => (
                                <div key={w.id} className="flex gap-3 text-sm">
                                    <img src={w.author.avatarUrls['48x48']} className="w-8 h-8 rounded-full" />
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold">{w.author.displayName}</span>
                                            <span className="text-green-600 font-medium">{w.timeSpent}</span>
                                            <span className="text-xs text-muted-foreground">{format(new Date(w.started), 'yy.MM.dd')}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {(!issue.fields.worklog?.worklogs.length) && <p className="text-sm text-muted-foreground text-center py-4">작업 로그가 없습니다.</p>}
                        </TabsContent>
                    </Tabs>

                </div>
            </ScrollArea>
        </div>
    );
}

function DateField({ label, date, onChange }: { label: string, date?: string, onChange: (d: string) => void }) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{label}</span>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9", !date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(new Date(date), 'yyyy-MM-dd') : <span>날짜 선택</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-50">
                    <Calendar
                        mode="single"
                        selected={date ? new Date(date) : undefined}
                        onSelect={(d) => d && onChange(format(d, 'yyyy-MM-dd'))}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
}
