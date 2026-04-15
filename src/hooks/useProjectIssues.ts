import { useQuery } from '@tanstack/react-query';
import { jiraClient, type JiraIssue } from '@/api/jiraClient';

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
}

const DEFAULT_FIELDS = [
    'summary',
    'status',
    'assignee',
    'reporter',
    'priority',
    'issuetype',
    'parent',
    'subtasks',
    'created',
    'duedate',
    'resolutiondate',
    'customfield_10016', // SP
    'customfield_10017', // 난이도
    'customfield_11481', // 계획시작
    'customfield_11484', // 실제시작
    'customfield_11485', // 실제완료
    'timespent',
    'labels',
];

/**
 * 프로젝트 단위 전체 이슈 fetch (페이지네이션 합산).
 * 진행 추이/예측 탭에서 사용. 사이드바 epic 선택과 별개 — 별도 캐시.
 */
export async function fetchProjectIssues(projectKey: string, maxPages = 50): Promise<JiraIssue[]> {
    const pk = projectKey.trim().toUpperCase();
    if (!pk) return [];
    let pageToken: string | undefined;
    const all: JiraIssue[] = [];
    for (let i = 0; i < maxPages; i++) {
        const payload: SearchJqlPayload = {
            jql: `project = ${pk}`,
            fields: DEFAULT_FIELDS,
            maxResults: 100,
        };
        if (pageToken) payload.nextPageToken = pageToken;
        const r = await jiraClient.post('/search/jql', payload);
        const data = r.data as SearchJqlResponse;
        all.push(...(data.issues ?? []));
        if (data.isLast || !data.nextPageToken) break;
        pageToken = data.nextPageToken;
    }
    return all;
}

/**
 * React Query hook — 프로젝트 이슈 캐싱.
 * staleTime: 5분 (분석 보고서 §7.2 권장).
 */
export function useProjectIssues(projectKey: string, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ['project-issues', projectKey],
        queryFn: () => fetchProjectIssues(projectKey),
        enabled: options?.enabled !== false && !!projectKey,
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}
