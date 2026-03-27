import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Settings, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export interface JiraConfig {
    jiraEmail: string;
    jiraApiToken: string;
}

export interface JiraTestResult {
    ok: boolean;
    message: string;
    status?: number;
    detail?: unknown;
}

interface JiraSettingsDialogProps {
    open: boolean;
    onClose: () => void;
    initialConfig?: JiraConfig | null;
}

export function JiraSettingsDialog({ open, onClose, initialConfig }: JiraSettingsDialogProps) {
    const queryClient = useQueryClient();
    const [email, setEmail] = React.useState(initialConfig?.jiraEmail ?? '');
    const [apiToken, setApiToken] = React.useState(initialConfig?.jiraApiToken ?? '');
    const [saving, setSaving] = React.useState(false);
    const [testing, setTesting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [testResult, setTestResult] = React.useState<JiraTestResult | null>(null);

    React.useEffect(() => {
        if (open) {
            setEmail(initialConfig?.jiraEmail ?? '');
            setApiToken(initialConfig?.jiraApiToken ?? '');
            setError(null);
            setTestResult(null);
        }
    }, [open, initialConfig?.jiraEmail, initialConfig?.jiraApiToken]);

    const ipc = typeof window !== 'undefined' ? window.ipcRenderer : null;

    const handleTestConnection = async () => {
        const trimmedEmail = email.trim();
        const trimmedToken = apiToken.trim();
        if (!trimmedEmail || !trimmedToken) {
            setTestResult({ ok: false, message: '이메일과 API 토큰을 먼저 입력하세요.', status: 0 });
            return;
        }
        if (!ipc) {
            setTestResult({ ok: false, message: '연결 테스트는 Electron 앱에서만 가능합니다.', status: 0 });
            return;
        }
        setError(null);
        setTestResult(null);
        setTesting(true);
        try {
            const result = await ipc.invoke('jira-config:test', {
                jiraEmail: trimmedEmail,
                jiraApiToken: trimmedToken,
            }) as JiraTestResult;
            setTestResult(result);
        } catch (e: unknown) {
            setTestResult({
                ok: false,
                message: e instanceof Error ? e.message : '연결 테스트 중 오류가 발생했습니다.',
                status: 0,
            });
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async () => {
        const trimmedEmail = email.trim();
        const trimmedToken = apiToken.trim();
        if (!trimmedEmail || !trimmedToken) {
            setError('이메일과 API 토큰을 모두 입력하세요.');
            return;
        }
        setError(null);
        setSaving(true);
        try {
            if (!ipc) {
                setError('이 설정은 Electron 앱에서만 사용할 수 있습니다.');
                setSaving(false);
                return;
            }
            await ipc.invoke('jira-config:set', {
                jiraEmail: trimmedEmail,
                jiraApiToken: trimmedToken,
            });
            await queryClient.invalidateQueries({ queryKey: ['jira-config'] });
            await queryClient.invalidateQueries({ queryKey: ['epics'] });
            await queryClient.refetchQueries({ queryKey: ['epics'] });
            onClose();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : '설정 저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Jira 연결 설정
                    </DialogTitle>
                    <DialogDescription>
                        exe 실행 시 및 PC 재시작 후에도 Jira 데이터를 가져오려면 아래 정보를 저장해 두세요.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <label htmlFor="jira-email" className="text-sm font-medium leading-none">Jira 이메일</label>
                        <Input
                            id="jira-email"
                            type="email"
                            placeholder="your@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                        />
                    </div>
                    <div className="grid gap-2">
                        <label htmlFor="jira-token" className="text-sm font-medium leading-none">API 토큰</label>
                        <Input
                            id="jira-token"
                            type="password"
                            placeholder="••••••••"
                            value={apiToken}
                            onChange={(e) => setApiToken(e.target.value)}
                            autoComplete="off"
                        />
                        <p className="text-xs text-muted-foreground">
                            Atlassian 계정 → 보안 → API 토큰에서 생성할 수 있습니다.
                        </p>
                    </div>
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                    {testResult && (
                        <div
                            className={`flex items-start gap-2 rounded-md p-3 text-sm ${
                                testResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
                            }`}
                        >
                            {testResult.ok ? (
                                <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                            ) : (
                                <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                            )}
                            <div>
                                <p className="font-medium">{testResult.ok ? '연결 성공' : '연결 실패'}</p>
                                <p className="mt-0.5">{testResult.message}</p>
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter className="flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={handleTestConnection}
                        disabled={testing || saving}
                    >
                        {testing ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                테스트 중...
                            </>
                        ) : (
                            '연결 테스트'
                        )}
                    </Button>
                    <div className="flex gap-2 ml-auto">
                        <Button variant="outline" onClick={onClose} disabled={saving}>
                            취소
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? '저장 중...' : '저장'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
