import axios from 'axios';
import { JIRA_CONFIG } from '@/config/jiraConfig';

export const jiraClient = axios.create({
    baseURL: 'http://localhost:3001/api',  // Local proxy server (auto-started by Vite plugin)
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
});

/** 첨부파일 다운로드 URL (프록시 경유). */
export const getAttachmentContentUrl = (id: string | number) =>
    `${jiraClient.defaults.baseURL}/attachment/content/${id}`;

// Add request interceptor for debugging
jiraClient.interceptors.request.use(
    (config) => {
        console.log('API Request:', config.method?.toUpperCase(), config.url);
        return config;
    },
    (error) => {
        console.error('Request Error:', error);
        return Promise.reject(error);
    }
);

// Add response interceptor for debugging
jiraClient.interceptors.response.use(
    (response) => {
        console.log('API Response:', response.status, response.config.url);
        return response;
    },
    (error) => {
        console.error('API Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
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
    // Fetch all Epics from IGMU project
    getEpics: async (): Promise<JiraIssue[]> => {
        const response = await jiraClient.post('/search/jql', {
            jql: 'project = IGMU AND issuetype = "에픽" ORDER BY created DESC',
            fields: ['summary', 'description', 'status', 'assignee', 'reporter', 'priority', 'issuetype', 'created', 'timespent', 'worklog', 'comment', 'attachment'],
            maxResults: 100,
        });
        return response.data.issues || [];
    },
    getIssuesForEpic: async (epicKey: string, difficultyFieldId?: string) => {
        const diffField = difficultyFieldId ?? JIRA_CONFIG.FIELDS.DIFFICULTY;
        try {
            // Step 1: Fetch parent issues (할 일) with pagination
            let parents: JiraIssue[] = [];
            let nextPageToken: string | undefined = undefined;
            let isLast = false;
            let startAt = 0;
            const maxResults = 100;
            let safetyCounter = 0;

            console.log(`[JiraAPI] Fetching issues for epic: ${epicKey}`);

            do {
                const payload: any = {
                    jql: `"Epic Link" = "${epicKey}" OR parent = "${epicKey}"`,
                    fields: [
                        'summary', 'description', 'status', 'assignee', 'reporter', 'priority', 'issuetype',
                        'customfield_10016',
                        'customfield_11481', 'customfield_11484', 'customfield_11485',
                        diffField,
                        'duedate', 'created', 'resolutiondate', 'parent', 'subtasks', 'timespent', 'worklog', 'comment', 'attachment'
                    ],
                    maxResults
                };

                // Jira Cloud POST /rest/api/3/search/jql supports only nextPageToken (not startAt in body). Sending startAt causes 400.
                if (nextPageToken) {
                    payload.nextPageToken = nextPageToken;
                }

                const response = await jiraClient.post('/search/jql', payload);
                const data = response.data;
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

                console.log(`[JiraAPI] Fetched ${parents.length} parent issues so far...`);

                if (safetyCounter++ > 20) break; // Hard limit 2000 issues
            } while (!isLast);

            // Step 2: Collect subtask keys from parent.subtasks field
            const subtaskKeys = new Set<string>();
            parents.forEach((parent: JiraIssue) => {
                if (parent.fields.subtasks && parent.fields.subtasks.length > 0) {
                    parent.fields.subtasks.forEach((subtask: any) => {
                        subtaskKeys.add(subtask.key);
                    });
                }
            });

            // Step 3: Fetch subtasks by key list (if any exist)
            let subtasks: any[] = [];
            if (subtaskKeys.size > 0) {
                console.log(`[JiraAPI] Fetching ${subtaskKeys.size} subtasks...`);
                const keyArray = Array.from(subtaskKeys);
                const batchSize = 100;

                for (let i = 0; i < keyArray.length; i += batchSize) {
                    const batch = keyArray.slice(i, i + batchSize);
                    const quotedKeys = batch.map(key => `"${key}"`).join(', ');
                    const subtasksResp = await jiraClient.post('/search/jql', {
                        jql: `key IN (${quotedKeys})`,
                        fields: [
                            'summary', 'description', 'status', 'assignee', 'reporter', 'priority', 'issuetype',
                            'customfield_10016',
                            'customfield_11481', 'customfield_11484', 'customfield_11485',
                            diffField,
                            'duedate', 'created', 'resolutiondate', 'parent', 'subtasks', 'timespent', 'worklog', 'comment', 'attachment'
                        ],
                        maxResults: batchSize
                    });

                    subtasks = [...subtasks, ...(subtasksResp.data.issues || [])];
                }
                console.log(`[JiraAPI] Fetched ${subtasks.length} total subtasks.`);
            }

            // Step 4: Combine and return
            return [...parents, ...subtasks] as JiraIssue[];
        } catch (error: any) {
            console.error('[JiraAPI] Critical error in getIssuesForEpic:', error);
            throw error;
        }
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
            console.log(`[JiraAPI] Fetching all comments for ${issueKey}...`);
            const commentsResp = await jiraClient.get(`/issue/${issueKey}/comment`);
            issue.fields.comment.comments = commentsResp.data.comments;
        }

        // Fetch all worklogs if truncated
        if (issue.fields.worklog && issue.fields.worklog.total > issue.fields.worklog.maxResults) {
            console.log(`[JiraAPI] Fetching all worklogs for ${issueKey}...`);
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
                    console.log(`[JiraAPI] Fetched ${allHistories.length} changelog entries for ${issueKey}`);
                }
            } catch (changelogError: any) {
                console.warn(`[JiraAPI] Changelog fetch failed for ${issueKey}:`, changelogError?.message || changelogError);
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
};

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

/** Parse ADF comment body to CommentSegment[] for editing. */
export function adfToSegments(body: any): CommentSegment[] {
    if (!body || body.type !== 'doc' || !Array.isArray(body.content)) return [];
    const segments: CommentSegment[] = [];
    for (const block of body.content) {
        if (block.type !== 'paragraph' || !Array.isArray(block.content)) continue;
        for (const node of block.content) {
            if (node.type === 'text') {
                segments.push({ type: 'text', text: node.text ?? '' });
            } else if (node.type === 'mention' && node.attrs) {
                segments.push({
                    type: 'mention',
                    accountId: node.attrs.id ?? '',
                    displayName: (node.attrs.text ?? '').replace(/^@/, ''),
                });
            } else if (node.type === 'hardBreak') {
                segments.push({ type: 'text', text: '\n' });
            }
        }
    }
    return segments;
}
