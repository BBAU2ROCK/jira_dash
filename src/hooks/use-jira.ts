import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jiraApi } from '../api/jiraClient';

export function useJiraIssues(jql: string = 'project = IGMU ORDER BY created DESC') {
    return useQuery({
        queryKey: ['issues', jql],
        queryFn: () => jiraApi.searchIssues(jql),
        refetchInterval: 600000, // 10 minutes
        refetchOnWindowFocus: true,
    });
}

export function useEpics() {
    return useQuery({
        queryKey: ['epics'],
        queryFn: () => jiraApi.getEpics(),
        refetchInterval: 600000,
    });
}

export function useEpicIssues(epicKey: string | null) {
    return useQuery({
        queryKey: ['epic-issues', epicKey],
        queryFn: () => epicKey ? jiraApi.getIssuesForEpic(epicKey) : Promise.resolve([]),
        enabled: !!epicKey,
        refetchInterval: 600000,
    });
}

export function useIssueDetails(issueKey: string | null) {
    return useQuery({
        queryKey: ['issue-details', issueKey],
        queryFn: () => issueKey ? jiraApi.getIssueDetails(issueKey) : Promise.resolve(null),
        enabled: !!issueKey,
    });
}

export function useIssueMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ key, fields }: { key: string; fields: any }) =>
            jiraApi.updateIssue(key, fields),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['issue-details', variables.key] });
            queryClient.invalidateQueries({ queryKey: ['issues'] });
            queryClient.invalidateQueries({ queryKey: ['epic-issues'] });
        },
    });
}

export function useCurrentUser() {
    return useQuery({
        queryKey: ['currentUser'],
        queryFn: () => jiraApi.getCurrentUser(),
    });
}

