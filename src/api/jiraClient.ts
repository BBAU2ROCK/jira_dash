import axios from 'axios';
import { JIRA_CONFIG } from '@/config/jiraConfig';

/**
 * Proxy base URL.
 * - Vite (renderer): `import.meta.env.VITE_PROXY_BASE` 사용 가능 (없으면 기본).
 * - Node/test 환경: `globalThis.process.env.VITE_PROXY_BASE` 또는 기본.
 */
function resolveProxyBase(): string {
    const fallback = 'http://localhost:3001/api';
    try {
        const meta = (import.meta as unknown as { env?: Record<string, string | undefined> });
        const fromVite = meta?.env?.VITE_PROXY_BASE;
        if (typeof fromVite === 'string' && fromVite.trim()) return fromVite.trim();
    } catch { /* ignore */ }
    const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
    if (proc?.env?.VITE_PROXY_BASE) return proc.env.VITE_PROXY_BASE;
    return fallback;
}

export const jiraClient = axios.create({
    baseURL: resolveProxyBase(),
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
});

/** 첨부파일 다운로드 URL (프록시 경유). */
export const getAttachmentContentUrl = (id: string | number) =>
    `${jiraClient.defaults.baseURL}/attachment/content/${id}`;

function quoteJqlStringLiteral(value: string): string {
    const s = value.trim();
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function throwIfJiraSearchJqlPayloadErrors(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const msgs = (data as { errorMessages?: unknown }).errorMessages;
    if (Array.isArray(msgs) && msgs.length > 0) {
        throw new Error(msgs.filter((m): m is string => typeof m === 'string').join(' / ') || 'Jira 검색 오류');
    }
}

interface SearchJqlPayload {
    jql: string;
    fields: string[];
    maxResults: number;
    nextPageToken?: string;
}

interface SearchJqlResponse {
    issues?: JiraIssue[];
    nextPageToken?: string;
    isLast?: boolean;
    total?: number;
}

/** axios 에러에서 HTTP status를 안전 추출 */
function getStatusFromAxiosError(e: unknown): number | undefined {
    if (e && typeof e === 'object' && 'response' in e) {
        const r = (e as { response?: { status?: number } }).response;
        return r?.status;
    }
    return undefined;
}

/**
 * 프로젝트 키 기준 에픽 이슈 검색.
 * - 다국어/포맷 변형 5종을 순차 시도.
 * - **C4**: 401/403은 즉시 throw (5회 중복 인증 호출 차단)
 * - **H3**: 첫 변형에서 1건 이상 정상 수집되면 후속 변형 생략
 */
async function fetchEpicsForProjectKey(projectKey: string): Promise<JiraIssue[]> {
    const pk = projectKey.trim();
    const pkQ = quoteJqlStringLiteral(pk);
    const jqlVariants = [
        `project = ${pkQ} AND issuetype = ${quoteJqlStringLiteral('에픽')} ORDER BY created DESC`,
        `project = ${pk} AND issuetype = ${quoteJqlStringLiteral('에픽')} ORDER BY created DESC`,
        `project = ${pkQ} AND issuetype = Epic ORDER BY created DESC`,
        `project = ${pk} AND issuetype = Epic ORDER BY created DESC`,
        `project = ${pkQ} AND issuetype = "Epic" ORDER BY created DESC`,
    ];
    const fields = [
        'summary', 'description', 'status', 'assignee', 'reporter', 'priority',
        'issuetype', 'created', 'timespent', 'worklog', 'comment', 'attachment',
    ];
    const maxResults = 100;
    const byKey = new Map<string, JiraIssue>();

    variantLoop: for (const jql of jqlVariants) {
        let nextPageToken: string | undefined;
        let guard = 0;
        try {
            do {
                const payload: SearchJqlPayload = { jql, fields, maxResults };
                if (nextPageToken) payload.nextPageToken = nextPageToken;
                const response = await jiraClient.post('/search/jql', payload);
                throwIfJiraSearchJqlPayloadErrors(response.data);
                const data = response.data as SearchJqlResponse;
                const issues = data.issues ?? [];
                for (const issue of issues) {
                    if (issue?.key) byKey.set(issue.key, issue);
                }
                nextPageToken = data.nextPageToken;
                const done = data.isLast === true || issues.length < maxResults || !nextPageToken;
                if (done) break;
                if (++guard > 50) break;
                // eslint-disable-next-line no-constant-condition
            } while (true);

            // H3: 이 변형에서 결과를 모았다면 다른 변형은 시도하지 않음
            if (byKey.size > 0) break variantLoop;
        } catch (e) {
            const status = getStatusFromAxiosError(e);
            // C4: 인증/권한 오류는 다른 변형으로도 동일하게 실패하므로 즉시 중단
            if (status === 401 || status === 403) {
                throw e;
            }
            console.warn('[jira] getEpicsForProject JQL 변형 실패(다음 변형 시도):', jql.slice(0, 72));
        }
    }

    const list = Array.from(byKey.values()).sort((a, b) => {
        const ta = a.fields?.created ? Date.parse(a.fields.created) : 0;
        const tb = b.fields?.created ? Date.parse(b.fields.created) : 0;
        return tb - ta;
    });

    if (list.length === 0) {
        console.warn(
            `[jira] getEpicsForProject(${pk}): 결과 0건. 프로젝트 키·issuetype(에픽/Epic)·프록시 인증을 확인하세요.`
        );
    }
    return list;
}

// Dev 모드 한정 디버그 인터셉터 — 프로덕션에서는 노이즈만 발생하므로 비활성화
function isDevMode(): boolean {
    try {
        const meta = (import.meta as unknown as { env?: { DEV?: boolean } });
        return meta?.env?.DEV === true;
    } catch {
        return false;
    }
}

if (isDevMode()) {
    jiraClient.interceptors.request.use(
        (config) => {
            console.log('[jira] req', config.method?.toUpperCase(), config.url);
            return config;
        },
        (error) => Promise.reject(error)
    );
    jiraClient.interceptors.response.use(
        (response) => {
            console.log('[jira] res', response.status, response.config.url);
            return response;
        },
        (error) => Promise.reject(error)
    );
}

// 에러 로깅은 모드 무관하게 유지 (사용자 진단에 필요)
jiraClient.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status;
        if (status) {
            console.warn(`[jira] HTTP ${status}: ${error.config?.url ?? '(unknown)'}`);
        } else {
            console.warn('[jira] network error:', error?.message ?? error);
        }
        return Promise.reject(error);
    }
);

// Types definitions
export interface JiraIssue {
    id: string;
    key: string;
    fields: {
        summary: string;
        description?: any;
        status: {
            name: string;
            statusCategory: {
                key: string;
                colorName: string;
            };
        };
        assignee?: {
            accountId: string;
            displayName: string;
            avatarUrls: {
                '48x48': string;
            };
        };
        reporter?: {
            accountId: string;
            displayName: string;
            avatarUrls: {
                '48x48': string;
            };
        };
        priority?: {
            name: string;
            iconUrl: string;
        };
        issuetype: {
            name: string;
            iconUrl: string;
            subtask: boolean;
        };
        parent?: {
            id: string;
            key: string;
            fields: {
                summary: string;
            }
        };
        labels?: string[];
        [key: string]: any;
        subtasks?: JiraIssue[];
        // Custom Fields
        customfield_10016?: number; // Story Points (SP)
        customfield_11481?: string; // 계획시작일 (Planned Start Date)
        customfield_11484?: string; // 실제시작일 (Actual Start Date)
        customfield_11485?: string; // 실제완료일 (Actual Done Date)
        duedate?: string;           // 완료 예정일 (Due Date)
        created: string;            // 이슈 생성일
        resolutiondate?: string;    // 실제 완료일
        comment?: {
            comments: Array<{
                id: string;
                author: { displayName: string; avatarUrls: { '48x48': string } };
                body: any;
                created: string;
            }>;
        };
        worklog?: {
            worklogs: Array<{
                id: string;
                author: { displayName: string; avatarUrls: { '48x48': string } };
                timeSpent: string;
                started: string;
                comment?: any;
            }>;
        };
        /** 첨부파일 목록 (GET issue 시 fields=attachment 로 반환) */
        attachment?: Array<{
            id: string | number;
            filename: string;
            size?: number;
            mimeType?: string;
            created?: string;
            author?: { displayName?: string };
            content?: string;
            thumbnail?: string;
        }>;
    };
    changelog?: {
        histories: Array<{
            id: string;
            author: { displayName: string; avatarUrls: { '48x48': string } };
            created: string;
            items: Array<{
                field: string;
                fromString: string;
                toString: string;
            }>;
        }>;
    };
}

// API Helper functions
export const jiraApi = {
    searchIssues: async (jql: string) => {
        const response = await jiraClient.post('/search/jql', {
            jql,
            fields: [
                'summary', 'description', 'status', 'assignee', 'reporter', 'priority', 'issuetype',
                'parent', 'subtasks', 'customfield_10016',
                'customfield_11481', 'customfield_11484', 'customfield_11485',
                'duedate', 'created', 'resolutiondate', 'timespent', 'worklog', 'comment', 'attachment'
            ],
            maxResults: 100
        });
        return response.data.issues as JiraIssue[];
    },
    getEpicsForProject: async (projectKey: string): Promise<JiraIssue[]> => {
        return fetchEpicsForProjectKey(projectKey);
    },

    /**
     * 현재 활성 대시보드 프로젝트의 에픽 목록.
     * v1.0.10 S2: 호출자가 projectKey를 명시적으로 전달 권장.
     * 인자 생략 시 `JIRA_CONFIG.DASHBOARD?.PROJECT_KEY` fallback (하위 호환).
     */
    getEpics: async (projectKey?: string): Promise<JiraIssue[]> => {
        const pk = (projectKey ?? JIRA_CONFIG.DASHBOARD?.PROJECT_KEY ?? 'IGMU').trim();
        return fetchEpicsForProjectKey(pk);
    },
    getIssuesForEpic: async (epicKey: string, difficultyFieldId?: string, extraFieldIds?: string[]) => {
        const diffField = difficultyFieldId ?? JIRA_CONFIG.FIELDS.DIFFICULTY;
        const extras = [...new Set((extraFieldIds ?? []).filter(Boolean))];
        const searchFields = [
            ...new Set([
                'summary', 'description', 'status', 'assignee', 'reporter', 'priority',
                'issuetype', 'customfield_10016', 'customfield_11481', 'customfield_11484',
                'customfield_11485', diffField, 'duedate', 'created', 'resolutiondate',
                'parent', 'subtasks', 'timespent', 'worklog', 'comment', 'attachment',
                ...extras,
            ]),
        ];

        // Step 1: Fetch parent issues (할 일) with pagination
        let parents: JiraIssue[] = [];
        let nextPageToken: string | undefined = undefined;
        let isLast = false;
        let startAt = 0;
        const maxResults = 100;
        let safetyCounter = 0;

        do {
            const payload: SearchJqlPayload = {
                jql: `"Epic Link" = "${epicKey}" OR parent = "${epicKey}"`,
                fields: searchFields,
                maxResults,
            };
            // Jira Cloud POST /rest/api/3/search/jql는 본문 startAt 미지원. nextPageToken만 사용.
            if (nextPageToken) payload.nextPageToken = nextPageToken;

            const response = await jiraClient.post('/search/jql', payload);
            const data = response.data as SearchJqlResponse;
            const issues = data.issues || [];
            if (issues.length === 0) break;
            parents = [...parents, ...issues];

            nextPageToken = data.nextPageToken;
            isLast = data.isLast ?? false;

            if (nextPageToken === undefined) {
                const total = data.total ?? 0;
                startAt += issues.length;
                isLast = startAt >= total || issues.length < maxResults;
            }

            if (safetyCounter++ > 20) break; // Hard limit ~2000 issues
        } while (!isLast);

        // Step 2: Collect subtask keys from parent.subtasks
        const subtaskKeys = new Set<string>();
        parents.forEach((parent) => {
            if (parent.fields.subtasks && parent.fields.subtasks.length > 0) {
                parent.fields.subtasks.forEach((subtask) => {
                    if (subtask.key) subtaskKeys.add(subtask.key);
                });
            }
        });

        // Step 3: Fetch subtasks by key list (if any)
        let subtasks: JiraIssue[] = [];
        if (subtaskKeys.size > 0) {
            const keyArray = Array.from(subtaskKeys);
            const batchSize = 100;
            for (let i = 0; i < keyArray.length; i += batchSize) {
                const batch = keyArray.slice(i, i + batchSize);
                const quotedKeys = batch.map((k) => `"${k}"`).join(', ');
                const subtasksResp = await jiraClient.post('/search/jql', {
                    jql: `key IN (${quotedKeys})`,
                    fields: searchFields,
                    maxResults: batchSize,
                });
                subtasks = [...subtasks, ...((subtasksResp.data as SearchJqlResponse).issues ?? [])];
            }
        }

        return [...parents, ...subtasks];
    },
    getIssueDetails: async (issueKey: string, difficultyFieldId?: string) => {
        const diffField = difficultyFieldId ?? JIRA_CONFIG.FIELDS.DIFFICULTY;
        const response = await jiraClient.get(`/issue/${issueKey}`, {
            params: {
                expand: 'changelog',
                fields: `summary,status,assignee,reporter,priority,issuetype,comment,worklog,customfield_11481,customfield_11484,customfield_11485,duedate,created,resolutiondate,description,attachment,${diffField}`
            }
        });
        const issue = response.data;

        // Fetch all comments if truncated
        if (issue.fields.comment && issue.fields.comment.total > issue.fields.comment.maxResults) {
            const commentsResp = await jiraClient.get(`/issue/${issueKey}/comment`);
            issue.fields.comment.comments = commentsResp.data.comments;
        }

        // Fetch all worklogs if truncated
        if (issue.fields.worklog && issue.fields.worklog.total > issue.fields.worklog.maxResults) {
            const worklogResp = await jiraClient.get(`/issue/${issueKey}/worklog`);
            issue.fields.worklog.worklogs = worklogResp.data.worklogs;
        }

        // Ensure changelog (activity history): Jira REST v3 often does not include it in GET issue;
        // fetch explicitly from dedicated changelog endpoint and merge.
        const existingHistories = issue.changelog?.histories;
        if (!existingHistories || existingHistories.length === 0) {
            try {
                const allHistories: Array<{ id: string; author?: { displayName: string }; created: string; items: Array<{ field: string; fromString?: string; toString?: string }> }> = [];
                let startAt = 0;
                const maxResults = 100;
                let hasMore = true;
                while (hasMore) {
                    const changelogResp = await jiraClient.get(`/issue/${issueKey}/changelog`, {
                        params: { startAt, maxResults }
                    });
                    const data = changelogResp.data;
                    // v3: PageBean with "values" array of history objects
                    const rawValues = data.values ?? data.histories ?? [];
                    const normalized = rawValues.map((v: any) => {
                        const created = v.created;
                        const createdStr = typeof created === 'number'
                            ? (created < 1e12 ? new Date(created * 1000).toISOString() : new Date(created).toISOString())
                            : (created ?? new Date().toISOString());
                        return { ...v, created: createdStr };
                    });
                    allHistories.push(...normalized);
                    if (normalized.length === 0 || normalized.length < maxResults || (data.total != null && startAt + normalized.length >= data.total)) {
                        hasMore = false;
                    } else {
                        startAt += normalized.length;
                    }
                }
                if (allHistories.length > 0) {
                    issue.changelog = { histories: allHistories };
                }
            } catch (changelogError: unknown) {
                const msg = changelogError instanceof Error ? changelogError.message : String(changelogError);
                console.warn(`[jira] changelog fetch failed for ${issueKey}: ${msg}`);
            }
        }

        return issue as JiraIssue;
    },
    updateIssue: async (issueKey: string, fields: any) => {
        const response = await jiraClient.put(`/issue/${issueKey}`, {
            fields
        });
        return response.data;
    },
    /** Get available workflow transitions for an issue (for status change). */
    getTransitions: async (issueKey: string) => {
        const response = await jiraClient.get(`/issue/${issueKey}/transitions`);
        const list = response.data.transitions ?? response.data.values ?? [];
        return list as Array<{ id: string; name: string; to?: { id: string; name: string } }>;
    },
    /** Get all issue priorities (for priority field edit). */
    getPriorities: async () => {
        const response = await jiraClient.get('/priority');
        const list = response.data ?? [];
        return list as Array<{ id: string; name: string; [key: string]: unknown }>;
    },
    /** Get all fields (id, name). Used to resolve field id by name (e.g. '난이도'). */
    getFields: async () => {
        const response = await jiraClient.get('/field');
        const list = Array.isArray(response.data) ? response.data : (response.data as any)?.values ?? [];
        return list as Array<{ id: string; name: string; [key: string]: unknown }>;
    },
    /** Get edit metadata for an issue (includes custom field allowedValues). */
    getEditMeta: async (issueKey: string) => {
        const response = await jiraClient.get(`/issue/${issueKey}/editmeta`);
        return response.data as {
            fields?: Record<string, {
                id?: string;
                name?: string;
                allowedValues?: Array<{ id?: string | number; value?: string; name?: string; [key: string]: unknown }>;
                [key: string]: unknown;
            }>;
        };
    },
    /** Transition issue to a new status (Jira requires transition ID, not raw status field). */
    transitionIssue: async (issueKey: string, transitionId: string, fields?: Record<string, unknown>) => {
        const response = await jiraClient.post(`/issue/${issueKey}/transitions`, {
            transition: { id: transitionId },
            ...(fields && Object.keys(fields).length > 0 ? { fields } : {})
        });
        return response.data;
    },
    getCurrentUser: async () => {
        const response = await jiraClient.get('/myself');
        return response.data;
    },
    searchUsers: async (query: string) => {
        const response = await jiraClient.get('/user/search', {
            params: { query }
        });
        return response.data;
    },
    /** Add a comment to an issue. Body must be ADF document. */
    addComment: async (issueKey: string, body: AdfDoc) => {
        const response = await jiraClient.post(`/issue/${issueKey}/comment`, { body });
        return response.data;
    },
    /** Update an existing comment. Body must be ADF document. */
    updateComment: async (issueKey: string, commentId: string, body: AdfDoc) => {
        const response = await jiraClient.put(`/issue/${issueKey}/comment/${commentId}`, { body });
        return response.data;
    },
    /** Atlassian Agile API — 프로젝트의 보드 목록 */
    getBoards: async (projectKey: string): Promise<JiraBoard[]> => {
        try {
            const response = await jiraClient.get('/agile/board', {
                params: { projectKeyOrId: projectKey },
            });
            return (response.data as { values?: JiraBoard[] }).values ?? [];
        } catch {
            return [];
        }
    },
    /** Atlassian Agile API — 특정 보드의 활성 스프린트 (calbal/scrum 보드만 sprint 있음) */
    getActiveSprints: async (boardId: number): Promise<JiraSprint[]> => {
        try {
            const response = await jiraClient.get(`/agile/board/${boardId}/sprint`, {
                params: { state: 'active' },
            });
            return (response.data as { values?: JiraSprint[] }).values ?? [];
        } catch {
            return [];
        }
    },
    /** Atlassian Agile API — 스프린트 내 이슈 (page 1만, maxResults 100) */
    getSprintIssues: async (sprintId: number): Promise<JiraIssue[]> => {
        try {
            const response = await jiraClient.get(`/agile/sprint/${sprintId}/issue`, {
                params: { maxResults: 100, fields: 'summary,status,assignee,duedate,resolutiondate' },
            });
            return (response.data as { issues?: JiraIssue[] }).issues ?? [];
        } catch {
            return [];
        }
    },
};

export interface JiraBoard {
    id: number;
    name: string;
    type: 'scrum' | 'kanban' | string;
}

export interface JiraSprint {
    id: number;
    name: string;
    state: 'active' | 'closed' | 'future' | string;
    startDate?: string;
    endDate?: string;
    completeDate?: string;
    goal?: string;
}

/** ADF document for comment body (Jira REST v3). */
export interface AdfDoc {
    version: 1;
    type: 'doc';
    content: AdfBlock[];
}

export type AdfBlock = AdfParagraph;

export interface AdfParagraph {
    type: 'paragraph';
    content: AdfInline[];
}

export type AdfInline = AdfText | AdfMention | AdfHardBreak;

export interface AdfText {
    type: 'text';
    text: string;
    marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export interface AdfMention {
    type: 'mention';
    attrs: { id: string; text: string };
}

export interface AdfHardBreak {
    type: 'hardBreak';
}

/** Segment for building comment: text or mention. */
export type CommentSegment =
    | { type: 'text'; text: string }
    | { type: 'mention'; accountId: string; displayName: string };

/** Build ADF document from comment segments. Supports multiple lines via \\n (hardBreak). */
export function buildCommentAdf(segments: CommentSegment[]): AdfDoc {
    const content: AdfInline[] = [];
    for (const seg of segments) {
        if (seg.type === 'text') {
            if (seg.text === '\n') {
                content.push({ type: 'hardBreak' });
            } else if (seg.text.length) {
                const lines = seg.text.split('\n');
                lines.forEach((line, i) => {
                    if (line.length) content.push({ type: 'text', text: line });
                    if (i < lines.length - 1) content.push({ type: 'hardBreak' });
                });
            }
        } else {
            content.push({
                type: 'mention',
                attrs: { id: seg.accountId, text: `@${seg.displayName}` },
            });
        }
    }
    return {
        version: 1,
        type: 'doc',
        content: content.length ? [{ type: 'paragraph', content }] : [{ type: 'paragraph', content: [] }],
    };
}

/**
 * Parse ADF comment body to CommentSegment[] for editing.
 *
 * **C2 방어**: paragraph 외 블록(list/codeBlock/blockquote/heading 등) 또는
 * 단락 내 text/mention/hardBreak 외 노드(emoji/link mark 등 일부)가 있으면
 * `hasUnsupportedNodes = true`. 호출자(드로어 댓글 수정)는 이 경우 편집을
 * 비활성화하여 데이터 손실을 막아야 합니다.
 */
export function adfToSegments(body: unknown): { segments: CommentSegment[]; hasUnsupportedNodes: boolean } {
    const empty = { segments: [] as CommentSegment[], hasUnsupportedNodes: false };
    if (!body || typeof body !== 'object') return empty;
    const doc = body as { type?: string; content?: unknown[] };
    if (doc.type !== 'doc' || !Array.isArray(doc.content)) return empty;

    const segments: CommentSegment[] = [];
    let hasUnsupportedNodes = false;

    for (const block of doc.content) {
        const b = block as { type?: string; content?: unknown[] };
        if (b.type !== 'paragraph') {
            // codeBlock/bulletList/orderedList/blockquote/heading 등
            hasUnsupportedNodes = true;
            continue;
        }
        if (!Array.isArray(b.content)) continue;

        for (const node of b.content) {
            const n = node as {
                type?: string;
                text?: string;
                attrs?: { id?: string; text?: string };
                marks?: unknown[];
            };
            if (n.type === 'text') {
                segments.push({ type: 'text', text: n.text ?? '' });
                // text + link mark는 평문으로 보존되지만 마크는 손실됨 → 경고
                if (Array.isArray(n.marks) && n.marks.length > 0) {
                    hasUnsupportedNodes = true;
                }
            } else if (n.type === 'mention' && n.attrs) {
                segments.push({
                    type: 'mention',
                    accountId: n.attrs.id ?? '',
                    displayName: (n.attrs.text ?? '').replace(/^@/, ''),
                });
            } else if (n.type === 'hardBreak') {
                segments.push({ type: 'text', text: '\n' });
            } else {
                // emoji/inlineCard/date 등 미지원 인라인 노드
                hasUnsupportedNodes = true;
            }
        }
    }
    return { segments, hasUnsupportedNodes };
}
