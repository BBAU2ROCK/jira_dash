import { useState, useEffect, useMemo, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Calendar, User, Clock, AlertCircle, CheckCircle, Loader2, MessageSquare, GitCommit, Briefcase, RefreshCw, X, ChevronDown, Check, FileText, Paperclip, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { type JiraIssue, jiraApi, buildCommentAdf, adfToSegments, getAttachmentContentUrl } from '@/api/jiraClient';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { JIRA_CONFIG } from '@/config/jiraConfig';
import { UNASSIGNED_LABEL } from '@/lib/jira-constants';
import { useKpiRulesStore } from '@/stores/kpiRulesStore';
// v1.0.20: 분리된 helper / sub-components — 1245 → 약 900 줄 축소
import {
    segmentsToHtml,
    extractSegmentsFromEditor,
    IssueTypeIcon,
    renderDescriptionAdf,
    EmptyState,
} from './issue-detail/helpers';
import { ActivityItem } from './issue-detail/activity';
import { EditableInfoRow } from './issue-detail/editable-info-row';

interface IssueDetailDrawerProps {
    issue: JiraIssue | null;
    open: boolean;
    onClose: () => void;
}

export function IssueDetailDrawer({ issue, open, onClose }: IssueDetailDrawerProps) {
    const queryClient = useQueryClient();
    // v1.0.10 S5: store 필드 구독 — 필드 ID 변경 시 즉시 반영
    // v1.0.20: primitive selector로 분리 — fields 객체 reference 변경 시 불필요 리렌더 방지
    const plannedStartField = useKpiRulesStore((s) => s.rules.fields?.plannedStart) ?? JIRA_CONFIG.FIELDS.PLANNED_START;
    const actualStartField = useKpiRulesStore((s) => s.rules.fields?.actualStart) ?? JIRA_CONFIG.FIELDS.ACTUAL_START;
    const actualDoneField = useKpiRulesStore((s) => s.rules.fields?.actualDone) ?? JIRA_CONFIG.FIELDS.ACTUAL_DONE;
    const storeDifficultyField = useKpiRulesStore((s) => s.rules.fields?.difficulty);

    // 필드 목록(필드명 '난이도' → id 매핑용)
    const { data: allFields = [] } = useQuery({
        queryKey: ['jiraFields'],
        queryFn: () => jiraApi.getFields(),
        enabled: open,
        staleTime: 15 * 60 * 1000,
    });
    const difficultyFieldId = useMemo(() => {
        const found = (allFields as Array<{ id: string; name: string }>).find(
            (f) => f.name === '난이도' || (f.name && f.name.trim() === '난이도')
        );
        // v1.0.10 S5: 1순위 Jira 메타데이터, 2순위 store, 3순위 JIRA_CONFIG
        return found?.id ?? storeDifficultyField ?? JIRA_CONFIG.FIELDS.DIFFICULTY;
    }, [allFields, storeDifficultyField]);

    // 드로어가 열리면 이슈 상세(댓글/이력/업무로그, 난이도 필드 포함) 조회
    const {
        data: details,
        isLoading: detailsLoading,
        isError: detailsError,
        error: fetchError,
        refetch
    } = useQuery({
        queryKey: ['issueDetails', issue?.key, difficultyFieldId],
        queryFn: () => jiraApi.getIssueDetails(issue!.key, difficultyFieldId),
        enabled: open && !!issue,
        staleTime: 5 * 60 * 1000,
        retry: 2,
    });

    const updateMutation = useMutation({
        mutationFn: ({ key, fields }: { key: string; fields: Record<string, unknown> }) =>
            jiraApi.updateIssue(key, fields),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['issueDetails', issue?.key] });
            queryClient.invalidateQueries({ queryKey: ['issues'] });
            toast.success('필드가 업데이트되었습니다');
        },
        onError: (e: Error) => toast.error(`업데이트 실패: ${e.message}`),
    });

    // 가능한 워크플로우 전환(상태 변경) 목록
    const { data: transitions = [] } = useQuery({
        queryKey: ['transitions', issue?.key],
        queryFn: () => jiraApi.getTransitions(issue!.key),
        enabled: open && !!issue,
        staleTime: 2 * 60 * 1000,
    });

    // 우선순위 목록 (편집용)
    const { data: priorities = [] } = useQuery({
        queryKey: ['priorities'],
        queryFn: () => jiraApi.getPriorities(),
        enabled: open,
        staleTime: 10 * 60 * 1000,
    });

    // editmeta (난이도 등 커스텀 필드 옵션; difficultyFieldId는 위에서 필드명 '난이도'로 결정됨)
    const { data: editMeta } = useQuery({
        queryKey: ['editmeta', issue?.key],
        queryFn: () => jiraApi.getEditMeta(issue!.key),
        enabled: open && !!issue,
        staleTime: 5 * 60 * 1000,
    });
    const difficultyOptionsRaw = editMeta?.fields?.[difficultyFieldId]?.allowedValues ?? [];
    // 옵션 정규화: Jira가 id(value)/value/name 등 다양한 형태로 내려줄 수 있음
    const difficultyOptions = useMemo(() => difficultyOptionsRaw.map((opt: any) => ({
        id: String(opt?.id ?? opt?.value ?? opt?.name ?? ''),
        value: String(opt?.value ?? opt?.name ?? (opt?.id != null ? opt.id : '')),
    })).filter((o: { id: string; value: string }) => o.id || o.value), [difficultyOptionsRaw]);

    /** contentEditable 에디터 ref — H2: clearEditor보다 먼저 선언 */
    const editorRef = useRef<HTMLDivElement>(null);
    /** 멘션 삽입 위치를 저장하는 Range ref */
    const savedMentionRange = useRef<Range | null>(null);
    /** 에디터에 내용이 있는지 여부 (submit 버튼 활성화) */
    const [editorHasContent, setEditorHasContent] = useState(false);
    const [mentionPopoverOpen, setMentionPopoverOpen] = useState(false);
    const [mentionSearchQuery, setMentionSearchQuery] = useState('');
    const [mentionSearchResults, setMentionSearchResults] = useState<Array<{ accountId: string; displayName: string; avatarUrls?: { '16x16': string } }>>([]);
    const [mentionSearching, setMentionSearching] = useState(false);
    /** When set, we are editing this comment (load body into composer, check = update). */
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    /** C2: 수정 중인 댓글에 미지원 ADF 노드(코드블록·리스트 등)가 있으면 true → 저장 차단 */
    const [editorReadOnly, setEditorReadOnly] = useState(false);

    const clearEditor = () => {
        if (editorRef.current) editorRef.current.innerHTML = '';
        setEditorHasContent(false);
        setMentionPopoverOpen(false);
        savedMentionRange.current = null;
        setEditorReadOnly(false);
    };

    // v1.0.33 fix: 이슈가 바뀌면 이전 이슈의 댓글 수정 상태(editingCommentId)를 reset.
    // 미수정 상태로 다른 이슈 이동 후 댓글 등록 시 PUT /이전-comment-id가 호출되어 404 발생하던 버그 해결.
    useEffect(() => {
        setEditingCommentId(null);
        setEditorReadOnly(false);
        if (editorRef.current) {
            editorRef.current.innerHTML = '';
            setEditorHasContent(false);
        }
        setMentionPopoverOpen(false);
        savedMentionRange.current = null;
        // v1.0.46 (m2): editorRef, savedMentionRange는 mutable ref (current 변경이 리렌더 트리거 X).
        // setState 함수들은 React가 안정적인 identity 보장. → deps에 포함할 필요 없음.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [issue?.key]);

    const transitionMutation = useMutation({
        mutationFn: ({ key, transitionId }: { key: string; transitionId: string }) =>
            jiraApi.transitionIssue(key, transitionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['issueDetails', issue?.key] });
            queryClient.invalidateQueries({ queryKey: ['transitions', issue?.key] });
            queryClient.invalidateQueries({ queryKey: ['issues'] });
            toast.success('상태가 변경되었습니다');
        },
        onError: (e: Error) => toast.error(`상태 변경 실패: ${e.message}`),
    });

    const addCommentMutation = useMutation({
        mutationFn: ({ key, body }: { key: string; body: ReturnType<typeof buildCommentAdf> }) =>
            jiraApi.addComment(key, body),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['issueDetails', issue?.key] });
            queryClient.invalidateQueries({ queryKey: ['issues'] });
            clearEditor();
            toast.success('댓글이 등록되었습니다');
        },
        onError: (e: Error) => toast.error(`댓글 등록 실패: ${e.message}`),
    });

    const updateCommentMutation = useMutation({
        mutationFn: ({ key, commentId, body }: { key: string; commentId: string; body: ReturnType<typeof buildCommentAdf> }) =>
            jiraApi.updateComment(key, commentId, body),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['issueDetails', issue?.key] });
            queryClient.invalidateQueries({ queryKey: ['issues'] });
            setEditingCommentId(null);
            clearEditor();
            toast.success('댓글이 수정되었습니다');
        },
        onError: (e: Error) => toast.error(`댓글 수정 실패: ${e.message}`),
    });

    // M7: 멘션 검색 디바운스 (250ms) — 키 입력마다 호출되던 것 차단
    useEffect(() => {
        if (!mentionPopoverOpen || mentionSearchQuery.length < 1) return;
        const timer = setTimeout(() => {
            setMentionSearching(true);
            jiraApi.searchUsers(mentionSearchQuery)
                .then((users: Array<{ accountId: string; displayName: string }>) =>
                    setMentionSearchResults(users ?? [])
                )
                .catch(() => setMentionSearchResults([]))
                .finally(() => setMentionSearching(false));
        }, 250);
        return () => clearTimeout(timer);
    }, [mentionPopoverOpen, mentionSearchQuery]);

    const handleStatusChange = (transitionId: string) => {
        if (!issue || !transitionId) return;
        transitionMutation.mutate({ key: issue.key, transitionId });
    };

    const handleUpdateField = (field: string, value: unknown) => {
        if (!issue) return;
        updateMutation.mutate({
            key: issue.key,
            fields: { [field]: value }
        });
    };

    const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
    const [priorityPopoverOpen, setPriorityPopoverOpen] = useState(false);
    const [difficultyPopoverOpen, setDifficultyPopoverOpen] = useState(false);

    const comments = details?.fields?.comment?.comments ?? [];
    /** 댓글 목록: 최신 글이 위로 오도록 정렬 */
    const commentsNewestFirst = useMemo(() => {
        return [...comments].sort((a, b) => {
            const tA = new Date(a.created).getTime();
            const tB = new Date(b.created).getTime();
            if (isNaN(tA)) return 1;
            if (isNaN(tB)) return -1;
            return tB - tA;
        });
    }, [comments]);
    const worklogs = details?.fields?.worklog?.worklogs ?? [];
    const histories = details?.changelog?.histories ?? [];

    const allActivities = [
        ...comments.map(c => ({
            id: `c-${c.id}`,
            type: 'comment' as const,
            time: c.created,
            author: c.author?.displayName || 'Unknown',
            body: c.body
        })),
        ...histories.map(h => ({
            id: `h-${h.id}`,
            type: 'history' as const,
            time: h.created,
            author: h.author?.displayName || 'System',
            items: h.items
        })),
        ...worklogs.map(w => ({
            id: `w-${w.id}`,
            type: 'worklog' as const,
            time: w.started,
            author: w.author?.displayName || 'Unknown',
            timeSpent: w.timeSpent,
            comment: w.comment
        })),
    ].sort((a, b) => {
        try {
            const timeA = new Date(a.time).getTime();
            const timeB = new Date(b.time).getTime();
            if (isNaN(timeA)) return 1;
            if (isNaN(timeB)) return -1;
            return timeB - timeA;
        } catch {
            return 0;
        }
    });

    return (
        <Sheet open={open} onOpenChange={onClose}>
            <SheetContent
                className="overflow-y-auto p-0 bg-card text-foreground"
                style={{ width: 'min(900px, 95vw)', maxWidth: 'none' }}
            >
                {!issue ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        이슈를 선택해주세요
                    </div>
                ) : (
                    <>
                        {/* 헤더 */}
                        <SheetHeader className="px-6 py-4 border-b border-border sticky top-0 z-10 flex-row items-center justify-between bg-card">
                            <SheetTitle className="text-base font-semibold text-foreground leading-snug">
                                이슈 상세
                            </SheetTitle>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground/90"
                                    onClick={() => refetch()}
                                    disabled={detailsLoading}
                                >
                                    <RefreshCw className={`h-4 w-4 ${detailsLoading ? 'animate-spin' : ''}`} />
                                </Button>
                                {/* v1.0.26: 토큰 기반 close — 다크/라이트 자동, focus-visible ring 통일 */}
                                <SheetClose className="rounded-md h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none">
                                    <X className="h-4 w-4" />
                                    <span className="sr-only">닫기</span>
                                </SheetClose>
                            </div>
                        </SheetHeader>

                        {detailsError && (
                            <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-md flex flex-col gap-2">
                                <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                                    <AlertCircle className="h-4 w-4" />
                                    데이터를 불러오지 못했습니다
                                </div>
                                <p className="text-[11px] text-red-300/70 whitespace-pre-wrap font-mono">
                                    {(fetchError as any)?.message || '알 수 없는 오류가 발생했습니다'}
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full mt-2 h-7 text-[11px] border-red-500/30 hover:bg-red-500/20 text-red-200"
                                    onClick={() => refetch()}
                                >
                                    다시 시도
                                </Button>
                            </div>
                        )}

                        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="bg-muted/60 p-2 rounded-lg shrink-0">
                                    {issue && <IssueTypeIcon type={issue.fields.issuetype.name} className="h-5 w-5" />}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">{issue?.key}</span>
                                        <Popover open={statusPopoverOpen} onOpenChange={(open) => { setStatusPopoverOpen(open); if (!open) transitionMutation.reset(); }}>
                                            <PopoverTrigger asChild>
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "inline-flex items-center gap-1 rounded text-[10px] px-1.5 h-4 font-medium bg-muted text-foreground/90 border-none cursor-pointer hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                                                        (transitionMutation.isPending || (transitions?.length === 0)) && "opacity-80"
                                                    )}
                                                    disabled={transitionMutation.isPending}
                                                >
                                                    {details?.fields?.status?.name ?? issue?.fields?.status?.name ?? '-'}
                                                    {transitions && transitions.length > 0 && <ChevronDown className="w-3 h-3 opacity-70" />}
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent
                                                className="w-auto min-w-[8rem] p-0 bg-card border border-border/90 text-foreground shadow-sm rounded-md"
                                                align="start"
                                                sideOffset={4}
                                                avoidCollisions={true}
                                            >
                                                {!transitions?.length ? (
                                                    <div className="px-2.5 py-2 text-[11px] text-muted-foreground">변경 가능한 상태가 없습니다</div>
                                                ) : (
                                                    <div className="py-0.5 max-h-40 overflow-y-auto">
                                                        {transitions.map((t) => (
                                                            <button
                                                                key={t.id}
                                                                type="button"
                                                                className="w-full px-2.5 py-1.5 text-left text-[11px] font-medium text-foreground/90 hover:bg-muted/40 focus:bg-muted/40 focus:outline-none first:rounded-t-[6px] last:rounded-b-[6px]"
                                                                onClick={() => {
                                                                    handleStatusChange(t.id);
                                                                    setStatusPopoverOpen(false);
                                                                }}
                                                                disabled={transitionMutation.isPending}
                                                            >
                                                                {t.to?.name ?? t.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                {transitionMutation.isError && (
                                                    <div className="px-2.5 py-1.5 text-[10px] text-red-600 border-t border-border/50">
                                                        {(transitionMutation.error as Error)?.message ?? '변경 실패'}
                                                    </div>
                                                )}
                                            </PopoverContent>
                                        </Popover>
                                        {transitionMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />}
                                    </div>
                                    <h2 className="text-sm font-semibold text-foreground leading-snug truncate mr-4">
                                        {issue?.fields.summary}
                                    </h2>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-5 space-y-6">
                            {/* 필드 정보 */}
                            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                                <EditableInfoRow
                                    icon={<Calendar className="w-4 h-4 text-blue-500" />}
                                    label="계획 시작일"
                                    value={details?.fields[plannedStartField] ?? issue.fields[plannedStartField]}
                                    type="date"
                                    onSave={(val) => handleUpdateField(plannedStartField, val)}
                                />
                                <EditableInfoRow
                                    icon={<Calendar className="w-4 h-4 text-muted-foreground" />}
                                    label="완료 예정"
                                    value={details?.fields.duedate ?? issue.fields.duedate}
                                    type="date"
                                    onSave={(val) => handleUpdateField('duedate', val)}
                                />
                                <EditableInfoRow
                                    icon={<Clock className="w-4 h-4 text-emerald-500" />}
                                    label="실제 시작일"
                                    value={details?.fields[actualStartField] ?? issue.fields[actualStartField]}
                                    type="date"
                                    onSave={(val) => handleUpdateField(actualStartField, val)}
                                />
                                <EditableInfoRow
                                    icon={<CheckCircle className="w-4 h-4 text-green-500" />}
                                    label="실제 완료일"
                                    value={details?.fields[actualDoneField] ?? issue.fields[actualDoneField]}
                                    type="date"
                                    onSave={(val) => handleUpdateField(actualDoneField, val)}
                                />
                                <EditableInfoRow
                                    icon={<User className="w-4 h-4 text-violet-500" />}
                                    label="담당자"
                                    value={details?.fields.assignee?.displayName ?? issue.fields.assignee?.displayName ?? UNASSIGNED_LABEL}
                                    type="user"
                                    onSave={(val) => handleUpdateField('assignee', val ? { accountId: val } : null)}
                                />
                                <EditableInfoRow
                                    icon={<User className="w-4 h-4 text-muted-foreground" />}
                                    label="보고자"
                                    value={details?.fields.reporter?.displayName ?? issue.fields.reporter?.displayName ?? '-'}
                                    type="user"
                                    onSave={(val) => handleUpdateField('reporter', val ? { accountId: val } : null)}
                                />
                                {/* 우선순위: 편집 가능, Jira에 반영 (§9) — 선택 시 셀렉트 박스 닫힘 */}
                                <div className="flex items-start gap-2 min-h-[40px] px-2 py-1">
                                    <Info className="w-4 h-4 mt-1 text-amber-500 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">우선순위</p>
                                        <Popover open={priorityPopoverOpen} onOpenChange={setPriorityPopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="text-sm font-medium text-foreground hover:bg-muted/60 rounded px-1 -mx-1 flex items-center gap-1"
                                                >
                                                    {details?.fields.priority?.name ?? issue.fields.priority?.name ?? '-'}
                                                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent
                                                className="w-56 p-1 bg-card border border-border shadow-md rounded-md"
                                                align="start"
                                            >
                                                {priorities.length === 0 ? (
                                                    <p className="text-xs text-foreground/80 py-2 px-2">불러오는 중...</p>
                                                ) : (
                                                    <ul className="max-h-60 overflow-y-auto">
                                                        {priorities.map((p: { id: string; name: string }) => (
                                                            <li key={p.id}>
                                                                <button
                                                                    type="button"
                                                                    className={cn(
                                                                        "w-full text-left text-sm py-2 px-2 rounded text-foreground hover:bg-muted/60 focus:bg-muted/60 focus:outline-none",
                                                                        (details?.fields.priority?.name ?? issue.fields.priority?.name) === p.name && "bg-muted font-medium text-foreground"
                                                                    )}
                                                                    onClick={() => {
                                                                        handleUpdateField('priority', { id: p.id });
                                                                        setPriorityPopoverOpen(false);
                                                                    }}
                                                                >
                                                                    {p.name}
                                                                </button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                                {/* 난이도: editmeta allowedValues로 표시·편집, Jira 반영 (§7.6 매핑 보강) */}
                                {(() => {
                                    const rawDiff = details?.fields?.[difficultyFieldId] ?? issue?.fields?.[difficultyFieldId];
                                    const currentId = rawDiff != null && typeof rawDiff === 'object' && 'id' in rawDiff
                                        ? String((rawDiff as { id?: string | number }).id)
                                        : undefined;
                                    const currentValue = rawDiff != null && typeof rawDiff === 'object' && ('value' in rawDiff || 'name' in rawDiff)
                                        ? ((rawDiff as { value?: string; name?: string }).value ?? (rawDiff as { name?: string }).name)
                                        : typeof rawDiff === 'string' || typeof rawDiff === 'number'
                                            ? String(rawDiff)
                                            : null;
                                    const difficultyDisplay = currentValue ?? (currentId && difficultyOptions.length
                                        ? difficultyOptions.find(o => String(o.id) === String(currentId))?.value
                                        : null) ?? '-';
                                    const difficultyIdNorm = currentId != null ? String(currentId) : (currentValue && difficultyOptions.length
                                        ? difficultyOptions.find(o => o.value === currentValue || String(o.id) === currentValue)?.id
                                        : undefined);
                                    return (
                                        <div className="flex items-start gap-2 min-h-[40px] px-2 py-1">
                                            <AlertCircle className="w-4 h-4 mt-1 text-muted-foreground shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[10px] uppercase font-semibold text-muted-foreground">난이도</p>
                                                {difficultyOptions.length > 0 ? (
                                                    <Popover open={difficultyPopoverOpen} onOpenChange={setDifficultyPopoverOpen}>
                                                        <PopoverTrigger asChild>
                                                            <button
                                                                type="button"
                                                                className="text-sm font-medium text-foreground hover:bg-muted/60 rounded px-1 -mx-1 flex items-center gap-1"
                                                            >
                                                                {difficultyDisplay}
                                                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                                            </button>
                                                        </PopoverTrigger>
                                                        <PopoverContent
                                                            className="w-56 p-1 bg-card border border-border shadow-md rounded-md"
                                                            align="start"
                                                        >
                                                            <ul className="max-h-60 overflow-y-auto">
                                                                {difficultyOptions.map((opt) => (
                                                                    <li key={opt.id}>
                                                                        <button
                                                                            type="button"
                                                                            className={cn(
                                                                                "w-full text-left text-sm py-2 px-2 rounded text-foreground hover:bg-muted/60 focus:bg-muted/60 focus:outline-none",
                                                                                difficultyIdNorm === String(opt.id) && "bg-muted font-medium text-foreground"
                                                                            )}
                                                                            onClick={() => {
                                                                                handleUpdateField(difficultyFieldId, { id: opt.id });
                                                                                setDifficultyPopoverOpen(false);
                                                                            }}
                                                                        >
                                                                            {opt.value}
                                                                        </button>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </PopoverContent>
                                                    </Popover>
                                                ) : (
                                                    <p className="text-sm font-medium text-foreground">{difficultyDisplay}</p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                                <div className="flex items-start gap-2 min-h-[40px] px-2 py-1">
                                    <Calendar className="w-4 h-4 mt-1 text-muted-foreground shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">생성일</p>
                                        <p className="text-sm font-medium text-foreground">
                                            {details?.fields.created ?? issue.fields.created
                                                ? format(new Date(details?.fields.created ?? issue.fields.created), 'yyyy.MM.dd HH:mm')
                                                : '-'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* 설명(주요 세부정보) - §8 설명 내 첨부(미디어) 표시: ADF → React, media는 attachment content URL로 표시 */}
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold text-foreground/80 uppercase flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5" />
                                    설명
                                </h3>
                                <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground/90">
                                    {(details?.fields?.description ?? issue?.fields?.description)
                                        ? renderDescriptionAdf(
                                            details?.fields?.description ?? issue?.fields?.description,
                                            (details?.fields?.attachment ?? issue?.fields?.attachment) ?? [],
                                            getAttachmentContentUrl
                                        )
                                        : '설명 없음'}
                                </div>
                            </div>

                            {/* 첨부파일 - 목록만 횡(일렬) 표시, 다운로드 미제공 */}
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold text-foreground/80 uppercase flex items-center gap-1.5">
                                    <Paperclip className="w-3.5 h-3.5" />
                                    첨부파일 ({(details?.fields?.attachment ?? issue?.fields?.attachment)?.length ?? 0})
                                </h3>
                                {((details?.fields?.attachment ?? issue?.fields?.attachment)?.length ?? 0) > 0 ? (
                                    <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
                                        {(details?.fields?.attachment ?? issue?.fields?.attachment)?.map((att) => (
                                            <li
                                                key={String(att.id)}
                                                className="shrink-0 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground max-w-full min-w-0"
                                                title={`${att.filename}${att.size != null ? ` · ${(att.size / 1024).toFixed(1)} KB` : ''}${att.created ? ` · ${format(new Date(att.created), 'yyyy.MM.dd')}` : ''}${att.author?.displayName ? ` · ${att.author.displayName}` : ''}`}
                                            >
                                                <span className="truncate block font-medium">{att.filename}</span>
                                                <span className="text-[11px] text-muted-foreground truncate block">
                                                    {att.size != null ? `${(att.size / 1024).toFixed(1)} KB` : ''}
                                                    {att.created && ` · ${format(new Date(att.created), 'yyyy.MM.dd')}`}
                                                    {att.author?.displayName && ` · ${att.author.displayName}`}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">첨부된 파일이 없습니다.</p>
                                )}
                            </div>

                            {/* 활동 탭: 동일 크기 버튼, 선택 탭은 배경으로 구분 */}
                            <div className="border-t border-border pt-5">
                                <Tabs defaultValue="all" className="w-full">
                                    <TabsList className="flex gap-1 p-1 rounded-lg h-auto bg-muted/60 border border-border">
                                        <TabsTrigger
                                            value="all"
                                            className="flex-1 min-w-0 text-xs py-2 rounded-md data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                                        >
                                            전체
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value="comments"
                                            className="flex-1 min-w-0 text-xs py-2 rounded-md data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                                        >
                                            댓글 ({comments.length})
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value="history"
                                            className="flex-1 min-w-0 text-xs py-2 rounded-md data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                                        >
                                            기록 ({histories.length})
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value="worklog"
                                            className="flex-1 min-w-0 text-xs py-2 rounded-md data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                                        >
                                            업무로그 ({worklogs.length})
                                        </TabsTrigger>
                                    </TabsList>

                                    {detailsLoading ? (
                                        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
                                            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                            데이터 불러오는 중...
                                        </div>
                                    ) : (
                                        <>
                                            <TabsContent value="all" className="mt-4 space-y-4">
                                                {allActivities.length === 0 ? (
                                                    <EmptyState title="활동 기록이 없습니다" description="이슈에 대한 댓글, 업무로그, 변경 이력이 없습니다." Icon={MessageSquare} />
                                                ) : (
                                                    allActivities.map(item => (
                                                        <ActivityItem key={item.id} item={item} />
                                                    ))
                                                )}
                                            </TabsContent>
                                            <TabsContent value="comments" className="mt-4 space-y-4">
                                                {/* 댓글 입력: contentEditable 기반 인라인 멘션 에디터 */}
                                                <div className="space-y-2">
                                                    <Popover
                                                        open={mentionPopoverOpen}
                                                        onOpenChange={(open) => {
                                                            if (!open) { setMentionPopoverOpen(false); setMentionSearchResults([]); }
                                                        }}
                                                    >
                                                        <PopoverAnchor asChild>
                                                            <div className={cn(
                                                                "min-w-0 rounded-md border bg-card focus-within:ring-2 focus-within:ring-blue-500",
                                                                editorReadOnly
                                                                    ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30/30"
                                                                    : "border-border focus-within:border-blue-500"
                                                            )}>
                                                                {editorReadOnly && (
                                                                    <div className="flex items-start gap-2 px-2 pt-2 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/60">
                                                                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                                                        <span>코드블록·리스트·링크 등 풍부한 서식이 포함된 댓글입니다. 데이터 손실 방지를 위해 Jira 웹에서 편집해 주세요.</span>
                                                                    </div>
                                                                )}
                                                                {/* contentEditable 에디터: 텍스트와 멘션 칩이 자유롭게 혼재 */}
                                                                <div
                                                                    ref={editorRef}
                                                                    contentEditable={!editorReadOnly}
                                                                    suppressContentEditableWarning
                                                                    data-placeholder={editingCommentId ? '댓글 수정 중... (우측 하단 ✓ 클릭 시 반영)' : '댓글 입력... (@ 멘션, 여러 줄 가능)'}
                                                                    className="min-h-[80px] max-h-[200px] overflow-y-auto px-2 pt-2 pb-1 text-xs text-foreground leading-5 focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none [&_.mention-chip]:inline-flex [&_.mention-chip]:items-center [&_.mention-chip]:px-1 [&_.mention-chip]:py-px [&_.mention-chip]:rounded [&_.mention-chip]:bg-blue-100 [&_.mention-chip]:text-blue-800 dark:text-blue-300 [&_.mention-chip]:text-[10px] [&_.mention-chip]:font-medium [&_.mention-chip]:mx-0.5 [&_.mention-chip]:select-none [&_.mention-chip]:cursor-default"
                                                                    onInput={() => {
                                                                        const editor = editorRef.current;
                                                                        if (!editor) return;
                                                                        const hasContent = (editor.textContent?.replace(/\u200B/g, '').trim() ?? '').length > 0
                                                                            || !!editor.querySelector('[data-mention-id]');
                                                                        setEditorHasContent(hasContent);

                                                                        // @ 감지: 커서 앞 텍스트에서 @ 찾기
                                                                        const sel = window.getSelection();
                                                                        if (!sel || sel.rangeCount === 0) return;
                                                                        const range = sel.getRangeAt(0);
                                                                        const node = range.startContainer;
                                                                        if (node.nodeType !== Node.TEXT_NODE) return;
                                                                        const textBefore = (node.textContent ?? '').slice(0, range.startOffset);
                                                                        const atIdx = textBefore.lastIndexOf('@');
                                                                        if (atIdx !== -1) {
                                                                            const query = textBefore.slice(atIdx + 1);
                                                                            if (!query.includes(' ') && !query.includes('\n')) {
                                                                                setMentionSearchQuery(query);
                                                                                setMentionPopoverOpen(true);
                                                                                // @~커서 범위 저장
                                                                                const mr = range.cloneRange();
                                                                                mr.setStart(node, atIdx);
                                                                                mr.setEnd(node, range.startOffset);
                                                                                savedMentionRange.current = mr;
                                                                                return;
                                                                            }
                                                                        }
                                                                        setMentionPopoverOpen(false);
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Escape') { setMentionPopoverOpen(false); }
                                                                    }}
                                                                    onPaste={(e) => {
                                                                        // 순수 텍스트만 붙여넣기
                                                                        e.preventDefault();
                                                                        const text = e.clipboardData.getData('text/plain');
                                                                        document.execCommand('insertText', false, text);
                                                                    }}
                                                                />
                                                                <div className="flex justify-end items-center gap-1 px-2 pb-2 pt-1">
                                                                    {editingCommentId && (
                                                                        <Button
                                                                            type="button"
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            className="h-7 w-7 p-0 text-foreground/80 hover:text-foreground hover:bg-muted/60"
                                                                            onClick={() => {
                                                                                setEditingCommentId(null);
                                                                                clearEditor();
                                                                            }}
                                                                            aria-label="수정 취소"
                                                                            title="수정 취소"
                                                                        >
                                                                            <X className="h-4 w-4" />
                                                                        </Button>
                                                                    )}
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-7 w-7 p-0 text-foreground/80 hover:text-foreground hover:bg-muted/60"
                                                                        disabled={
                                                                            editorReadOnly ||
                                                                            (addCommentMutation.isPending || updateCommentMutation.isPending) ||
                                                                            !editorHasContent
                                                                        }
                                                                        onClick={() => {
                                                                            if (!issue || !editorRef.current || editorReadOnly) return;
                                                                            const segments = extractSegmentsFromEditor(editorRef.current);
                                                                            if (segments.length === 0) return;
                                                                            const adf = buildCommentAdf(segments);
                                                                            if (editingCommentId) {
                                                                                updateCommentMutation.mutate({ key: issue.key, commentId: editingCommentId, body: adf });
                                                                            } else {
                                                                                addCommentMutation.mutate({ key: issue.key, body: adf });
                                                                            }
                                                                        }}
                                                                        aria-label={editingCommentId ? '수정 반영' : '등록'}
                                                                        title={editingCommentId ? '수정 반영' : '등록'}
                                                                    >
                                                                        {(addCommentMutation.isPending || updateCommentMutation.isPending) ? (
                                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                                        ) : (
                                                                            <Check className="h-4 w-4" />
                                                                        )}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </PopoverAnchor>
                                                        <PopoverContent className="w-auto min-w-[160px] max-w-[220px] p-0 bg-card border border-border shadow-lg" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                                                            <div className="p-1.5 border-b border-border">
                                                                <Input
                                                                    placeholder="이름 검색..."
                                                                    className="h-7 text-xs"
                                                                    value={mentionSearchQuery}
                                                                    onChange={(e) => {
                                                                        // M7: 디바운스된 useEffect가 검색 호출. 여기서는 query만 갱신.
                                                                        const q = e.target.value;
                                                                        setMentionSearchQuery(q);
                                                                        if (q.length === 0) setMentionSearchResults([]);
                                                                    }}
                                                                />
                                                            </div>
                                                            <div className="max-h-36 overflow-y-auto bg-card">
                                                                {mentionSearching ? (
                                                                    <div className="p-2 text-center text-muted-foreground text-xs">검색 중...</div>
                                                                ) : mentionSearchResults.length === 0 ? (
                                                                    <div className="p-2 text-center text-muted-foreground text-xs">검색어를 입력하세요</div>
                                                                ) : (
                                                                    mentionSearchResults.map((u) => (
                                                                        <button
                                                                            key={u.accountId}
                                                                            type="button"
                                                                            className="w-full px-2 py-1.5 text-left text-xs hover:bg-muted/60 flex items-center gap-1.5 text-foreground bg-card"
                                                                            onMouseDown={(e) => {
                                                                                // mousedown에서 처리해 에디터 포커스 유지
                                                                                e.preventDefault();
                                                                                const editor = editorRef.current;
                                                                                if (!editor) return;
                                                                                editor.focus();

                                                                                const mr = savedMentionRange.current;
                                                                                const sel = window.getSelection();
                                                                                if (sel && mr) {
                                                                                    sel.removeAllRanges();
                                                                                    sel.addRange(mr);
                                                                                    mr.deleteContents(); // @검색어 삭제
                                                                                }

                                                                                // 멘션 칩 생성
                                                                                const chip = document.createElement('span');
                                                                                chip.contentEditable = 'false';
                                                                                chip.dataset.mentionId = u.accountId;
                                                                                chip.dataset.mentionName = u.displayName;
                                                                                chip.className = 'mention-chip';
                                                                                chip.textContent = `@${u.displayName}`;

                                                                                const currentSel = window.getSelection();
                                                                                if (currentSel && currentSel.rangeCount > 0) {
                                                                                    const r = currentSel.getRangeAt(0);
                                                                                    r.insertNode(chip);
                                                                                    // 칩 뒤에 빈 텍스트 노드 추가 후 커서 이동
                                                                                    const space = document.createTextNode('\u00A0');
                                                                                    chip.after(space);
                                                                                    const newRange = document.createRange();
                                                                                    newRange.setStartAfter(space);
                                                                                    newRange.collapse(true);
                                                                                    currentSel.removeAllRanges();
                                                                                    currentSel.addRange(newRange);
                                                                                }

                                                                                savedMentionRange.current = null;
                                                                                setMentionPopoverOpen(false);
                                                                                setMentionSearchQuery('');
                                                                                setMentionSearchResults([]);
                                                                                setEditorHasContent(true);
                                                                            }}
                                                                        >
                                                                            {u.avatarUrls?.['16x16'] && <img src={u.avatarUrls['16x16']} alt="" className="w-4 h-4 rounded-full shrink-0" />}
                                                                            <span>{u.displayName}</span>
                                                                        </button>
                                                                    ))
                                                                )}
                                                            </div>
                                                        </PopoverContent>
                                                    </Popover>
                                                    {(addCommentMutation.isError || updateCommentMutation.isError) && (
                                                        <p className="text-xs text-red-600 flex items-center gap-1">
                                                            <AlertCircle className="h-3.5 w-3.5" />
                                                            {(addCommentMutation.error as Error)?.message ?? (updateCommentMutation.error as Error)?.message ?? '댓글 등록/수정에 실패했습니다.'}
                                                        </p>
                                                    )}
                                                </div>
                                                {commentsNewestFirst.length === 0 ? (
                                                    <EmptyState title="댓글이 없습니다" description="이슈에 대한 댓글이 아직 없습니다." Icon={MessageSquare} />
                                                ) : (
                                                    commentsNewestFirst.map(c => (
                                                        <ActivityItem
                                                            key={c.id}
                                                            item={{ id: c.id, type: 'comment', author: c.author?.displayName, time: c.created, body: c.body }}
                                                            onEditClick={() => {
                                                                setEditingCommentId(c.id);
                                                                // C2: ADF에 paragraph 외 노드(코드블록·리스트·링크 등)가 있으면
                                                                // 데이터 손실을 막기 위해 편집 모드를 readOnly로 전환
                                                                const { segments, hasUnsupportedNodes } = adfToSegments(c.body);
                                                                if (editorRef.current) {
                                                                    editorRef.current.innerHTML = segmentsToHtml(segments);
                                                                    setEditorHasContent(segments.length > 0);
                                                                    setEditorReadOnly(hasUnsupportedNodes);
                                                                    if (hasUnsupportedNodes) {
                                                                        toast.warning('이 댓글은 코드블록·리스트·링크 등 풍부한 서식을 포함하고 있어 Jira 웹에서만 편집할 수 있습니다.');
                                                                    }
                                                                    // 커서를 맨 끝으로
                                                                    const range = document.createRange();
                                                                    range.selectNodeContents(editorRef.current);
                                                                    range.collapse(false);
                                                                    const sel = window.getSelection();
                                                                    sel?.removeAllRanges();
                                                                    sel?.addRange(range);
                                                                    editorRef.current.focus();
                                                                }
                                                            }}
                                                        />
                                                    ))
                                                )}
                                            </TabsContent>
                                            <TabsContent value="history" className="mt-4 space-y-4">
                                                {histories.length === 0 ? (
                                                    <EmptyState title="기록이 없습니다" description="이슈에 대한 변경 이력이 없습니다." Icon={GitCommit} />
                                                ) : (
                                                    histories.map(h => (
                                                        <ActivityItem key={h.id} item={{ id: h.id, type: 'history', author: h.author?.displayName || 'System', time: h.created, items: h.items }} />
                                                    ))
                                                )}
                                            </TabsContent>
                                            <TabsContent value="worklog" className="mt-4 space-y-4">
                                                {worklogs.length === 0 ? (
                                                    <EmptyState title="업무로그가 없습니다" description="이슈에 대한 업무로그가 아직 없습니다." Icon={Briefcase} />
                                                ) : (
                                                    worklogs.map(w => (
                                                        <ActivityItem key={w.id} item={{ id: w.id, type: 'worklog', author: w.author?.displayName, time: w.started, timeSpent: w.timeSpent, comment: w.comment }} />
                                                    ))
                                                )}
                                            </TabsContent>
                                        </>
                                    )}
                                </Tabs>
                            </div>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}

