/**
 * Issue Detail Drawer — EditableInfoRow.
 * 날짜/사용자 인라인 편집 UI. Jira 사용자 검색 250ms 디바운스 포함.
 * Extracted from issue-detail-drawer.tsx (v1.0.20).
 */
import React from 'react';
import { format } from 'date-fns';
import { jiraApi } from '@/api/jiraClient';
import { cn } from '@/lib/utils';

export interface EditableInfoRowProps {
    icon: React.ReactNode;
    label: string;
    value: string | null | undefined;
    type: 'date' | 'user';
    onSave: (val: string) => void;
}

interface JiraUserSearchResult {
    accountId: string;
    displayName: string;
    avatarUrls?: { '16x16'?: string };
}

export function EditableInfoRow({ icon, label, value, type, onSave }: EditableInfoRowProps) {
    const [isEditing, setIsEditing] = React.useState(false);
    const [localValue, setLocalValue] = React.useState(value || '');
    const [userQuery, setUserQuery] = React.useState('');
    const [isSearching, setIsSearching] = React.useState(false);
    const [searchResults, setSearchResults] = React.useState<JiraUserSearchResult[]>([]);

    React.useEffect(() => { setLocalValue(value || ''); }, [value]);

    const handleSave = () => { if (localValue !== value) onSave(localValue); setIsEditing(false); };

    // M7: 사용자 검색 디바운스 (250ms)
    React.useEffect(() => {
        if (userQuery.length < 2) {
            setSearchResults([]);
            return;
        }
        const timer = setTimeout(() => {
            setIsSearching(true);
            jiraApi.searchUsers(userQuery)
                .then((users: JiraUserSearchResult[]) => setSearchResults(users ?? []))
                .catch(() => setSearchResults([]))
                .finally(() => setIsSearching(false));
        }, 250);
        return () => clearTimeout(timer);
    }, [userQuery]);

    return (
        <div className="flex items-start gap-2 group cursor-pointer min-h-[40px] px-2 py-1 rounded hover:bg-muted/60"
            onClick={() => !isEditing && setIsEditing(true)}>
            <span className="mt-1">{icon}</span>
            <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground">{label}</p>
                {isEditing ? (
                    <div className="mt-1" onClick={e => e.stopPropagation()}>
                        {type === 'date' ? (
                            <input type="date" className="w-full text-sm border rounded px-1 h-7 bg-card border-border text-foreground"
                                value={localValue} onChange={e => setLocalValue(e.target.value)}
                                onBlur={handleSave} autoFocus />
                        ) : (
                            <div className="relative">
                                <input type="text" className="w-full text-sm border rounded px-1 h-7 bg-card border-border text-foreground"
                                    placeholder="Search user..." value={userQuery}
                                    onChange={e => setUserQuery(e.target.value)} autoFocus />
                                {userQuery.length >= 2 && (
                                    <div className="absolute top-full left-0 w-full mt-1 bg-card border border-border rounded shadow-lg z-50 max-h-48 overflow-y-auto">
                                        {isSearching ? <div className="p-2 text-xs text-center text-muted-foreground">Searching...</div> :
                                            searchResults.map(user => (
                                                <div key={user.accountId} className="px-2 py-1.5 text-xs hover:bg-muted/60 cursor-pointer flex items-center gap-2 text-foreground"
                                                    onClick={() => { onSave(user.accountId); setIsEditing(false); setUserQuery(''); }}>
                                                    {user.avatarUrls?.['16x16'] && (
                                                        <img src={user.avatarUrls['16x16']} className="w-4 h-4 rounded-full" alt="" />
                                                    )}
                                                    {user.displayName}
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className={cn("text-sm font-medium truncate", value ? "text-foreground" : "text-muted-foreground italic")}>
                        {type === 'date' && value ? format(new Date(value), 'yyyy.MM.dd') : (value || '-')}
                    </p>
                )}
            </div>
        </div>
    );
}
