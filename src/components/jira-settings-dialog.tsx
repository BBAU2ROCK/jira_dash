import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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

/** 웹 모드 — 프록시 admin 엔드포인트로 자격증명 변경. Electron 모드 — IPC. */
const ipcRenderer = typeof window !== 'undefined' ? window.ipcRenderer : null;
const isWebMode = !ipcRenderer;
const PROXY_BASE = (() => {
    try {
        const meta = (import.meta as unknown as { env?: { VITE_PROXY_BASE?: string } });
        return (meta?.env?.VITE_PROXY_BASE || 'http://localhost:3001/api').replace(/\/api\/?$/, '');
    } catch {
        return 'http://localhost:3001';
    }
})();

async function fetchWebStatus(): Promise<{ configured: boolean; email: string; source: string }> {
    const r = await fetch(`${PROXY_BASE}/admin/auth`);
    if (!r.ok) throw new Error(`status ${r.status}`);
    return r.json();
}

async function fetchWebTest(payload: JiraConfig): Promise<JiraTestResult> {
    const r = await fetch(`${PROXY_BASE}/admin/auth/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return r.json();
}

async function fetchWebSave(payload: JiraConfig): Promise<{ ok: boolean; message?: string; persisted?: boolean }> {
    const r = await fetch(`${PROXY_BASE}/admin/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return r.json();
}

export function JiraSettingsDialog({ open, onClose, initialConfig }: JiraSettingsDialogProps) {
    const queryClient = useQueryClient();
    const [email, setEmail] = React.useState(initialConfig?.jiraEmail ?? '');
    const [apiToken, setApiToken] = React.useState(initialConfig?.jiraApiToken ?? '');
    const [saving, setSaving] = React.useState(false);
    const [testing, setTesting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [testResult, setTestResult] = React.useState<JiraTestResult | null>(null);
    const [webStatus, setWebStatus] = React.useState<{ configured: boolean; email: string; source: string } | null>(null);

    React.useEffect(() => {
        if (!open) return;
        setError(null);
        setTestResult(null);
        if (isWebMode) {
            // 웹 모드: 프록시에서 현재 상태 조회 + 이메일 미리 채우기
            fetchWebStatus()
                .then((s) => {
                    setWebStatus(s);
                    if (s.email && !email) setEmail(s.email);
                })
                .catch(() => setWebStatus({ configured: false, email: '', source: '' }));
        } else {
            setEmail(initialConfig?.jiraEmail ?? '');
            setApiToken(initialConfig?.jiraApiToken ?? '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialConfig?.jiraEmail, initialConfig?.jiraApiToken]);

    const handleTestConnection = async () => {
        const trimmedEmail = email.trim();
        const trimmedToken = apiToken.trim();
        if (!trimmedEmail || !trimmedToken) {
            setTestResult({ ok: false, message: '이메일과 API 토큰을 먼저 입력하세요.', status: 0 });
            return;
        }
        setError(null);
        setTestResult(null);
        setTesting(true);
        try {
            const result: JiraTestResult = isWebMode
                ? await fetchWebTest({ jiraEmail: trimmedEmail, jiraApiToken: trimmedToken })
                : ((await ipcRenderer!.invoke('jira-config:test', {
                      jiraEmail: trimmedEmail,
                      jiraApiToken: trimmedToken,
                  })) as JiraTestResult);
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
            if (isWebMode) {
                const r = await fetchWebSave({ jiraEmail: trimmedEmail, jiraApiToken: trimmedToken });
                if (!r.ok) {
                    setError(r.message || '저장 실패');
                    toast.error(r.message || '저장 실패');
                    return;
                }
                if (r.persisted === false) {
                    toast.warning(r.message || '메모리에만 적용됨');
                } else {
                    toast.success('Jira 설정이 저장되었습니다');
                }
            } else {
                await ipcRenderer!.invoke('jira-config:set', {
                    jiraEmail: trimmedEmail,
                    jiraApiToken: trimmedToken,
                });
                toast.success('Jira 설정이 저장되었습니다');
            }
            // 캐시 무효화 → 자격증명 재로딩 + 에픽 즉시 재조회
            await queryClient.invalidateQueries({ queryKey: ['jira-config'] });
            await queryClient.invalidateQueries({ queryKey: ['epics'] });
            await queryClient.refetchQueries({ queryKey: ['epics'] });
            onClose();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '설정 저장에 실패했습니다.';
            setError(msg);
            toast.error(msg);
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
                        {isWebMode
                            ? `웹 모드 — 입력 후 "연결 테스트" → 정상이면 "저장". 즉시 반영됩니다 (서버 재시작 불필요).`
                            : 'exe 실행 시 및 PC 재시작 후에도 Jira 데이터를 가져오려면 아래 정보를 저장해 두세요.'}
                    </DialogDescription>
                </DialogHeader>

                {isWebMode && webStatus && (
                    <div className="rounded-md border bg-slate-50 p-2 text-xs text-slate-700">
                        현재 프록시 자격증명:{' '}
                        {webStatus.configured ? (
                            <>
                                <span className="font-mono">{webStatus.email || '(미상)'}</span>
                                {webStatus.source && (
                                    <span className="text-slate-500"> · {webStatus.source}</span>
                                )}
                            </>
                        ) : (
                            <span className="text-amber-700">설정되지 않음</span>
                        )}
                    </div>
                )}

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
