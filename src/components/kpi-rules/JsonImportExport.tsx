import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Upload, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { KpiRuleSet } from '@/stores/kpiRulesStore';
import { validateRuleSet } from '@/stores/kpiRulesStore';

interface Props {
    rules: KpiRuleSet;
    onImport: (rules: KpiRuleSet) => void;
    onReset: () => void;
}

export function JsonImportExport({ rules, onImport, onReset }: Props) {
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleExport = () => {
        const json = JSON.stringify(rules, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kpi-rules-${rules.version}-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('JSON 파일이 다운로드되었습니다');
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(ev.target?.result as string) as KpiRuleSet;
                // 기본 검증
                if (!parsed.version || !parsed.grades) {
                    toast.error('유효하지 않은 KPI 규칙 파일입니다.');
                    return;
                }
                const errors = validateRuleSet(parsed);
                if (errors.length > 0) {
                    toast.error(`검증 실패: ${errors[0]}`);
                    return;
                }
                onImport(parsed);
                toast.success(`KPI 규칙 v${parsed.version} 가져오기 완료`);
            } catch {
                toast.error('JSON 파싱 실패');
            }
        };
        reader.readAsText(file);
        // reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleReset = () => {
        if (confirm('모든 KPI 규칙을 기본값으로 초기화할까요?')) {
            onReset();
            toast.info('기본값으로 초기화되었습니다');
        }
    };

    return (
        <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-3.5 w-3.5 mr-1" />
                JSON 내보내기
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1" />
                JSON 가져오기
            </Button>
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImport}
            />
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                기본값 리셋
            </Button>
        </div>
    );
}
