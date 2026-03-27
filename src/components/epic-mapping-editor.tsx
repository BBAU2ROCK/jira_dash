import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type JiraIssue } from '@/api/jiraClient';
import { useEpicMappingStore } from '@/stores/epicMappingStore';
import { DEFECT_KPI_CONFIG } from '@/config/defectKpiConfig';
import { Link2, Trash2, Plus, ExternalLink, Loader2 } from 'lucide-react';

export interface EpicMappingEditorProps {
    devEpics: JiraIssue[];
    defectEpics: JiraIssue[];
    defectEpicsLoading?: boolean;
    defectEpicsError?: Error | null;
}

export function EpicMappingEditor({
    devEpics,
    defectEpics,
    defectEpicsLoading = false,
    defectEpicsError = null,
}: EpicMappingEditorProps) {
    const mappings = useEpicMappingStore((s) => s.mappings);
    const addMapping = useEpicMappingStore((s) => s.addMapping);
    const removeMapping = useEpicMappingStore((s) => s.removeMapping);

    const [devKey, setDevKey] = React.useState('');
    const [defectKey, setDefectKey] = React.useState('');
    const [err, setErr] = React.useState<string | null>(null);

    const devOptions = React.useMemo(
        () => devEpics.map((e) => ({ key: e.key, summary: e.fields?.summary ?? e.key })),
        [devEpics]
    );

    const defectOptions = React.useMemo(
        () => defectEpics.map((e) => ({ key: e.key, summary: e.fields?.summary ?? e.key })),
        [defectEpics]
    );

    const handleAdd = () => {
        setErr(null);
        const d = devKey.trim().toUpperCase();
        const f = defectKey.trim().toUpperCase();
        if (!d || !f) {
            setErr('개발 에픽과 결함 에픽을 모두 선택(또는 입력)하세요.');
            return;
        }
        if (!/^[A-Z][A-Z0-9]*-\d+$/i.test(d) || !/^[A-Z][A-Z0-9]*-\d+$/i.test(f)) {
            setErr('이슈 키 형식을 확인하세요 (예: IGMU-47, TQ-605).');
            return;
        }
        addMapping(d, f);
        setDefectKey('');
    };

    return (
        <div className="space-y-3">
            <a
                href={DEFECT_KPI_CONFIG.DEFECT_PROJECT_BOARD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline"
            >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Jira에서 TQ 이슈 보드 열기 (에픽과 동일 프로젝트)
            </a>

            {defectEpicsLoading && (
                <p className="text-xs text-slate-500 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    {DEFECT_KPI_CONFIG.DEFECT_PROJECT_KEY_HINT} 프로젝트 에픽 목록을 불러오는 중…
                </p>
            )}
            {defectEpicsError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-md px-2 py-1.5">
                    에픽 목록을 가져오지 못했습니다: {defectEpicsError.message}
                </p>
            )}
            {!defectEpicsLoading && !defectEpicsError && defectOptions.length === 0 && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
                    {DEFECT_KPI_CONFIG.DEFECT_PROJECT_KEY_HINT}에서 에픽 이슈가 검색되지 않았습니다. 프로젝트 키·에픽
                    이슈 유형을 확인하거나, 결함 에픽 키를 직접 입력하세요.
                </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                    <label className="text-xs font-medium text-slate-600">개발 에픽 (대시보드 프로젝트)</label>
                    {devOptions.length > 0 ? (
                        <select
                            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900"
                            value={devKey}
                            onChange={(e) => setDevKey(e.target.value)}
                        >
                            <option value="">선택…</option>
                            {devOptions.map((o) => (
                                <option key={o.key} value={o.key}>
                                    {o.key} — {o.summary.slice(0, 56)}
                                    {o.summary.length > 56 ? '…' : ''}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <Input
                            className="h-9 text-sm"
                            placeholder="예: IGMU-47"
                            value={devKey}
                            onChange={(e) => setDevKey(e.target.value.toUpperCase())}
                        />
                    )}
                </div>
                <div className="grid gap-1.5">
                    <label className="text-xs font-medium text-slate-600">
                        결함 에픽 ({DEFECT_KPI_CONFIG.DEFECT_PROJECT_KEY_HINT})
                    </label>
                    {defectOptions.length > 0 ? (
                        <select
                            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900"
                            value={defectKey}
                            onChange={(e) => setDefectKey(e.target.value)}
                            disabled={defectEpicsLoading}
                        >
                            <option value="">선택…</option>
                            {defectOptions.map((o) => (
                                <option key={o.key} value={o.key}>
                                    {o.key} — {o.summary.slice(0, 56)}
                                    {o.summary.length > 56 ? '…' : ''}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <Input
                            className="h-9 text-sm"
                            placeholder={`예: ${DEFECT_KPI_CONFIG.DEFECT_PROJECT_KEY_HINT}-605`}
                            value={defectKey}
                            onChange={(e) => setDefectKey(e.target.value.toUpperCase())}
                            disabled={defectEpicsLoading}
                        />
                    )}
                </div>
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}

            <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={handleAdd}>
                <Plus className="h-4 w-4 mr-2" />
                매핑 추가
            </Button>

            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="text-left px-3 py-2 font-medium text-slate-500">개발 에픽</th>
                            <th className="text-left px-3 py-2 font-medium text-slate-500">결함 에픽</th>
                            <th className="w-10 px-2 py-2" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {mappings.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-3 py-4 text-center text-slate-500 text-xs">
                                    등록된 매핑이 없습니다.
                                </td>
                            </tr>
                        ) : (
                            mappings.map((m) => (
                                <tr key={m.id}>
                                    <td className="px-3 py-2 font-mono text-xs text-slate-800">{m.devEpicKey}</td>
                                    <td className="px-3 py-2 font-mono text-xs text-slate-800">{m.defectEpicKey}</td>
                                    <td className="px-2 py-1">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-red-600 hover:text-red-700"
                                            onClick={() => removeMapping(m.id)}
                                            title="삭제"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
                <Link2 className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
                브라우저 localStorage(키: jira-dash-epic-mappings)에 저장됩니다.
            </p>
        </div>
    );
}
