import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InfoTip } from '@/components/ui/info-tip';
import { Plus, Trash2 } from 'lucide-react';

interface Props {
    dashboardProjectKey: string;
    projectKeys: string[];
    weekStartsOn: number;
    onDashboardKeyChange: (key: string) => void;
    onProjectKeysChange: (keys: string[]) => void;
    onWeekStartsOnChange: (day: number) => void;
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function ProjectEditor({ dashboardProjectKey, projectKeys, weekStartsOn, onDashboardKeyChange, onProjectKeysChange, onWeekStartsOnChange }: Props) {
    const [newKey, setNewKey] = React.useState('');

    const addKey = () => {
        const k = newKey.trim().toUpperCase();
        if (!k || projectKeys.includes(k)) return;
        onProjectKeysChange([...projectKeys, k]);
        setNewKey('');
    };

    const removeKey = (key: string) => {
        onProjectKeysChange(projectKeys.filter((k) => k !== key));
    };

    return (
        <div className="space-y-4">
            <div>
                <div className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1">
                    대시보드 프로젝트 키
                    <InfoTip>사이드바 에픽 조회의 기본 프로젝트. 변경 시 에픽 목록이 새로고침됩니다.</InfoTip>
                </div>
                <Input
                    value={dashboardProjectKey}
                    onChange={(e) => onDashboardKeyChange(e.target.value.toUpperCase())}
                    className="h-8 text-sm font-mono w-40"
                    placeholder="예: IGMU"
                />
            </div>
            <div>
                <div className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1">
                    프로젝트 키 목록
                    <InfoTip>진행 추이/예측 탭의 프로젝트 선택 드롭다운에 표시될 키 목록.</InfoTip>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {projectKeys.map((key) => (
                        <span key={key} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-mono">
                            {key}
                            <button type="button" onClick={() => removeKey(key)} className="text-red-500 hover:text-red-700">
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                </div>
                <div className="flex gap-2">
                    <Input
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                        className="h-7 text-xs font-mono w-32"
                        placeholder="프로젝트 키"
                        onKeyDown={(e) => e.key === 'Enter' && addKey()}
                    />
                    <Button variant="outline" size="sm" onClick={addKey} className="h-7">
                        <Plus className="h-3 w-3 mr-1" />
                        추가
                    </Button>
                </div>
            </div>
            <div>
                <div className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1">
                    주 시작 요일
                    <InfoTip>이번주 완료 카운트의 주 시작 요일. 한국 비즈니스 표준은 월요일(1).</InfoTip>
                </div>
                <select
                    value={weekStartsOn}
                    onChange={(e) => onWeekStartsOnChange(parseInt(e.target.value))}
                    className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm"
                >
                    {DAYS.map((d, i) => (
                        <option key={i} value={i}>{d}요일 ({i})</option>
                    ))}
                </select>
            </div>
        </div>
    );
}
