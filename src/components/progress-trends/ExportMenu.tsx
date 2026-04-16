import React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel, exportToPdf } from '@/lib/export';
import { useForecastHistoryStore } from '@/stores/forecastHistoryStore';
import type { BacklogStateCounts, TeamForecast, BacklogEffortReport, DailyPoint } from '@/services/prediction/types';

interface Props {
    projectKey: string;
    counts: BacklogStateCounts | null;
    team: TeamForecast | null;
    effort: BacklogEffortReport | null;
    dailySeries: DailyPoint[] | null;
}

export function ExportMenu({ projectKey, counts, team, effort, dailySeries }: Props) {
    const [open, setOpen] = React.useState(false);
    const [exporting, setExporting] = React.useState(false);
    const records = useForecastHistoryStore((s) => s.records);

    const handleExcel = async () => {
        setExporting(true);
        try {
            await exportToExcel({ projectKey, counts, team, effort, dailySeries, forecastHistory: records });
            toast.success('Excel 파일이 다운로드되었습니다');
        } catch (e) {
            toast.error('Excel 출력 실패: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setExporting(false);
            setOpen(false);
        }
    };

    const handlePdf = () => {
        exportToPdf();
        toast.info('브라우저 인쇄 대화상자가 열렸습니다 (대상에서 PDF 선택)');
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" disabled={exporting}>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Export
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1 bg-white border border-slate-200">
                <button
                    type="button"
                    onClick={handleExcel}
                    disabled={exporting}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded hover:bg-slate-100 disabled:opacity-50"
                >
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    Excel (.xlsx)
                </button>
                <button
                    type="button"
                    onClick={handlePdf}
                    disabled={exporting}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded hover:bg-slate-100 disabled:opacity-50"
                >
                    <FileText className="h-4 w-4 text-red-600" />
                    PDF (브라우저 인쇄)
                </button>
            </PopoverContent>
        </Popover>
    );
}
