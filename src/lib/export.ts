/**
 * Export 헬퍼 — Excel(xlsx) + PDF(브라우저 print).
 *
 * xlsx는 큰 라이브러리(~100KB) — 동적 import로 사용 시점에만 로드.
 */

import type { BacklogStateCounts, TeamForecast, BacklogEffortReport, DailyPoint } from '@/services/prediction/types';
import type { ForecastRecord } from '@/stores/forecastHistoryStore';
import { format } from 'date-fns';
import { UNASSIGNED_LABEL } from '@/lib/jira-constants';

export interface ExportPayload {
    projectKey: string;
    counts: BacklogStateCounts | null;
    team: TeamForecast | null;
    effort: BacklogEffortReport | null;
    dailySeries: DailyPoint[] | null;
    forecastHistory: ForecastRecord[];
}

/** 5개 시트가 있는 Excel 다운로드 */
export async function exportToExcel(payload: ExportPayload): Promise<void> {
    const xlsx = await import('xlsx');
    const wb = xlsx.utils.book_new();

    // Sheet 1: Summary
    const summaryRows: (string | number)[][] = [
        ['Jira Dashboard - 진행 추이/예측 보고서'],
        [`프로젝트: ${payload.projectKey}`],
        [`출력 시점: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`],
        [],
        ['── 백로그 현황 ──'],
        ['항목', '값'],
        ['잔여 (전체)', payload.counts?.total ?? 0],
        ['활성', payload.counts?.active ?? 0],
        ['보류', payload.counts?.onHold ?? 0],
        [UNASSIGNED_LABEL, payload.counts?.unassigned ?? 0],
        ['90일 완료', payload.counts?.completed90d ?? 0],
        ['오늘 완료', payload.counts?.completedToday ?? 0],
        ['이번주 완료', payload.counts?.completedThisWeek ?? 0],
        ['미완료 지연', payload.counts?.overdueInProgress ?? 0],
        ['완료 지연', payload.counts?.lateCompletion ?? 0],
        ['마감일 미설정', payload.counts?.noDueDate ?? 0],
        [],
        ['── 팀 ETA (P85) ──'],
        ['시나리오', '영업일', '예상 일자', '신뢰도'],
        ['낙관 (자유 재할당)',
            payload.team?.optimistic.p85Days ?? 0,
            payload.team ? format(payload.team.optimistic.p85Date, 'yyyy-MM-dd') : '-',
            payload.team?.optimistic.confidence ?? '-'],
        ['기준 ★ 권장 약속',
            payload.team?.realistic.p85Days ?? 0,
            payload.team ? format(payload.team.realistic.p85Date, 'yyyy-MM-dd') : '-',
            payload.team?.realistic.confidence ?? '-'],
        [],
        ['── 백로그 공수 ──'],
        ['지표', '값'],
        ['총 공수 (mid)', `${payload.effort?.totalHoursMid ?? 0} 인시`],
        ['공수 범위', `${payload.effort?.totalHoursLow ?? 0} ~ ${payload.effort?.totalHoursHigh ?? 0} 인시`],
        ['인일 환산', `${payload.effort?.totalManDaysMid ?? 0} 인일`],
        ['팀 capacity 일수', `${payload.effort?.teamCapacityAssumption.teamDaysMid ?? 0} 일`],
    ];
    const summarySheet = xlsx.utils.aoa_to_sheet(summaryRows);
    xlsx.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // Sheet 2: Daily completions
    const dailyRows: (string | number)[][] = [['Date', 'Completed Count']];
    (payload.dailySeries ?? []).forEach((d) => dailyRows.push([d.date, d.count]));
    const dailySheet = xlsx.utils.aoa_to_sheet(dailyRows);
    xlsx.utils.book_append_sheet(wb, dailySheet, 'Daily Completions');

    // Sheet 3: Per-assignee
    const assigneeRows: (string | number)[][] = [
        ['담당자', '잔여', '보류', '활동일', '일평균', 'P50일', 'P85일', 'P95일', '신뢰도'],
    ];
    (payload.team?.perAssignee ?? []).forEach((p) => {
        assigneeRows.push([
            p.displayName,
            p.remaining,
            p.onHold,
            p.activeDays,
            p.avgDailyThroughput,
            p.forecast?.p50Days ?? 0,
            p.forecast?.p85Days ?? 0,
            p.forecast?.p95Days ?? 0,
            p.forecast?.confidence ?? 'no-data',
        ]);
    });
    const assigneeSheet = xlsx.utils.aoa_to_sheet(assigneeRows);
    xlsx.utils.book_append_sheet(wb, assigneeSheet, 'Per-Assignee');

    // Sheet 4: Effort breakdown (이슈별)
    const effortRows: (string | number)[][] = [
        ['Issue Key', '제목', '공수 (인시)', 'Low', 'High', '출처', '신뢰도'],
    ];
    (payload.effort?.perIssue ?? []).forEach((p) => {
        effortRows.push([p.issueKey, p.summary, p.hours, p.hoursLow, p.hoursHigh, p.source, p.confidence]);
    });
    const effortSheet = xlsx.utils.aoa_to_sheet(effortRows);
    xlsx.utils.book_append_sheet(wb, effortSheet, 'Per-Issue Effort');

    // Sheet 5: Forecast history (정확도 추적)
    const histRows: (string | number)[][] = [
        ['Recorded At', 'P50', 'P85', 'P95', 'Remaining', 'Active Days', 'CV', 'Actual Date'],
    ];
    payload.forecastHistory.forEach((r) => {
        histRows.push([
            r.recordedAt,
            r.p50Days,
            r.p85Days,
            r.p95Days,
            r.remainingAtTime,
            r.activeDays,
            r.teamCV,
            r.actualCompletionDate ?? '',
        ]);
    });
    const histSheet = xlsx.utils.aoa_to_sheet(histRows);
    xlsx.utils.book_append_sheet(wb, histSheet, 'Forecast History');

    const filename = `jira-progress-${payload.projectKey}-${format(new Date(), 'yyyyMMdd-HHmm')}.xlsx`;
    xlsx.writeFile(wb, filename);
}

/** PDF — 브라우저 print API */
export function exportToPdf(): void {
    // 간단한 print. CSS @media print는 별도 (필요시 index.css 확장)
    window.print();
}
