/**
 * Export 헬퍼 — Excel(xlsx) + PDF(브라우저 print).
 *
 * xlsx는 큰 라이브러리(~100KB) — 동적 import로 사용 시점에만 로드.
 *
 * **보안 (v1.0.51, C3)**:
 *   - xlsx 0.18.x는 GHSA-4r6h-8v6p-xvw6 (Prototype Pollution) / GHSA-5pgg-2g8v-p4x9 (ReDoS) 가 있다.
 *     두 CVE는 모두 *xlsx 파싱 (xlsx.read / readFile)* 시 발현. 본 모듈은 *생성·쓰기* 전용으로
 *     `xlsx.utils.aoa_to_sheet` + `xlsx.writeFile` 만 사용 → 외부 입력 파싱 경로 없음.
 *   - 따라서 직접적 영향 영역은 없으나, 장기적으로 sheetjs 직접 호스팅 0.20+ 또는 exceljs 전환 권장.
 *   - export.ts는 `xlsx.read`·`xlsx.readFile`·`xlsx.read_str` 등 파싱 API 호출을 **절대 추가하지 말 것**.
 */

import type { BacklogStateCounts, TeamForecast, BacklogEffortReport, DailyPoint } from '@/services/prediction/types';
import type { IssueExpectation } from '@/stores/forecastExpectationStore';
import { format } from 'date-fns';
import { UNASSIGNED_LABEL } from '@/lib/jira-constants';

export interface ExportPayload {
    projectKey: string;
    counts: BacklogStateCounts | null;
    team: TeamForecast | null;
    effort: BacklogEffortReport | null;
    dailySeries: DailyPoint[] | null;
    /** v1.0.36: forecastHistory → expectations (이슈별 추적). */
    expectations: Record<string, IssueExpectation>;
}

/**
 * 5개 시트가 있는 Excel 다운로드.
 *
 * v1.0.51: 동적 import 실패(네트워크 chunk 로드 실패 등) 시 에러를 throw하여
 * 호출자가 toast/UI에서 안내할 수 있도록 한다.
 */
export async function exportToExcel(payload: ExportPayload): Promise<void> {
    let xlsx: typeof import('xlsx');
    try {
        xlsx = await import('xlsx');
    } catch (e) {
        throw new Error(
            'Excel 라이브러리 로드 실패. 네트워크를 확인하거나 페이지를 새로고침해 주세요. ' +
            `(${(e as Error)?.message ?? 'unknown'})`
        );
    }
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

    // Sheet 5: Issue Expectations (v1.0.36: 이슈별 정확도 추적)
    const expRows: (string | number)[][] = [
        ['Issue Key', 'Project', 'First Seen At', 'P50', 'P85', 'P95', 'CV', 'Completed At', 'Actual Days'],
    ];
    Object.values(payload.expectations)
        .filter((e) => e.projectKey === payload.projectKey)
        .sort((a, b) => new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime())
        .forEach((e) => {
            expRows.push([
                e.issueKey,
                e.projectKey,
                e.firstSeenAt,
                e.p50Days,
                e.p85Days,
                e.p95Days,
                e.teamCV,
                e.completedAt ?? '',
                e.actualDays ?? '',
            ]);
        });
    const expSheet = xlsx.utils.aoa_to_sheet(expRows);
    xlsx.utils.book_append_sheet(wb, expSheet, 'Issue Expectations');

    const filename = `jira-progress-${payload.projectKey}-${format(new Date(), 'yyyyMMdd-HHmm')}.xlsx`;
    xlsx.writeFile(wb, filename);
}

/** PDF — 브라우저 print API */
export function exportToPdf(): void {
    // 간단한 print. CSS @media print는 별도 (필요시 index.css 확장)
    window.print();
}
