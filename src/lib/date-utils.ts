import {
    format,
    isWeekend,
    addDays,
    startOfWeek,
    endOfWeek,
    startOfDay,
    endOfDay,
    isSameDay,
    isWithinInterval,
    differenceInCalendarDays,
} from 'date-fns';
import Holidays from 'date-holidays';
import { JIRA_CONFIG } from '@/config/jiraConfig';
import { resolveWeekStartsOn } from '@/lib/kpi-rules-resolver';

/** Jira 날짜 문자열을 안전하게 파싱·포매팅. 잘못된 값은 fallback 반환. */
export function formatDateSafe(dateStr: string | undefined | null, pattern = 'yy.MM.dd', fallback = '-'): string {
    if (!dateStr) return fallback;
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return fallback;
        return format(date, pattern);
    } catch {
        return fallback;
    }
}

/** Jira 날짜 문자열을 Date로 안전 변환. 실패 시 null. */
export function parseDateSafe(dateStr: string | undefined | null): Date | null {
    if (!dateStr) return null;
    try {
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
    } catch {
        return null;
    }
}

/** unknown 값을 안전 Date로 변환 */
export function safeParseDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

/** Jira API의 'YYYY-MM-DD' 또는 ISO 문자열에서 로컬 자정으로 파싱.
 *  KST 환경에서 'YYYY-MM-DD'를 new Date()로 파싱 시 UTC 자정 → KST 09시가 되는 문제 회피.
 *  완료일 비교(isCompletedToday 등)에 사용. */
export function parseLocalDay(dateStr: string | undefined | null): Date | null {
    if (!dateStr) return null;
    if (typeof dateStr !== 'string') return null;
    // 'YYYY-MM-DD' 만 있는 경우 → 로컬 자정
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
        return isNaN(dt.getTime()) ? null : dt;
    }
    // ISO with time → 그대로
    return safeParseDate(dateStr);
}

/**
 * K10: Jira의 `duedate`(YYYY-MM-DD) 를 **로컬 타임존 그날 23:59:59.999** 로 변환.
 *
 * 과거 패턴:
 *   const due = new Date(dueDateStr);  // UTC 자정으로 파싱됨
 *   due.setHours(23, 59, 59, 999);     // 로컬 시각으로 덮어써 → 타임존 혼합 발생
 *
 * 신규:
 *   const due = endOfLocalDay(dueDateStr); // 로컬 자정 기반으로 일관성 있게 23:59:59.999
 *
 * 반환값은 로컬 타임존 기준 그날의 마지막 밀리초. actualEnd(UTC ISO)와 비교 시
 * Date 객체의 epoch 비교는 일관된다 (둘 다 Date).
 *
 * 예외: 잘못된 입력이나 시간 포함 ISO는 그대로 반환 (endOfLocalDay 동작 불가).
 */
export function endOfLocalDay(dateStr: string | undefined | null): Date | null {
    const d = parseLocalDay(dateStr);
    if (!d) return null;
    // parseLocalDay가 YYYY-MM-DD 케이스는 로컬 자정으로 반환했으므로 여기서 23:59:59.999 덮어쓰기 안전
    const out = new Date(d);
    out.setHours(23, 59, 59, 999);
    return out;
}

/**
 * K10: Jira의 `duedate`(YYYY-MM-DD) 를 **로컬 타임존 그날 00:00:00.000** 로 변환.
 * "조기 완료" 경계 판정(actualEnd < dueStart) 에 사용.
 */
export function startOfLocalDay(dateStr: string | undefined | null): Date | null {
    // parseLocalDay가 YYYY-MM-DD를 로컬 자정(00:00:00.000)으로 반환하므로 그대로 반환
    return parseLocalDay(dateStr);
}

/** 한국 공휴일 Set (lazy memoize).
 *  date-holidays 라이브러리로 다년치(2025-2030) 자동 산출. 실패 시 JIRA_CONFIG 배열로 fallback. */
let cachedHolidaySet: Set<string> | null = null;
function getKoreanHolidaySet(): Set<string> {
    if (cachedHolidaySet) return cachedHolidaySet;
    const set = new Set<string>();
    try {
        const hd = new Holidays('KR');
        for (let year = 2025; year <= 2030; year++) {
            const holidays = hd.getHolidays(year) as Array<{ date: string; type: string }>;
            for (const h of holidays) {
                if (h.type === 'public') {
                    // h.date 형식: 'YYYY-MM-DD HH:mm:ss' → 앞 10자만
                    set.add(h.date.slice(0, 10));
                }
            }
        }
    } catch {
        // fallback: JIRA_CONFIG 수동 배열
        for (const d of JIRA_CONFIG.KOREAN_HOLIDAYS_2026) set.add(d);
    }
    // fallback 배열도 항상 union (라이브러리에 없는 임시 휴일 추가용)
    for (const d of JIRA_CONFIG.KOREAN_HOLIDAYS_2026) set.add(d);
    cachedHolidaySet = set;
    return set;
}

/** 영업일 여부: 주말이 아니고 한국 공휴일이 아님 */
export function isBusinessDay(date: Date, holidays: Set<string> = getKoreanHolidaySet()): boolean {
    if (isWeekend(date)) return false;
    const key = format(date, 'yyyy-MM-dd');
    return !holidays.has(key);
}

/** 주어진 날짜에 영업일 N일을 더한 날짜를 반환 (시작일 다음 영업일부터 카운트) */
export function addBusinessDays(start: Date, days: number, holidays: Set<string> = getKoreanHolidaySet()): Date {
    if (days <= 0) return new Date(start.getTime());
    let cursor = startOfDay(start);
    let added = 0;
    while (added < days) {
        cursor = addDays(cursor, 1);
        if (isBusinessDay(cursor, holidays)) added++;
    }
    return cursor;
}

/** 두 날짜 사이 영업일 수 (a < b 가정, 같은 날이면 0) */
export function businessDaysBetween(a: Date, b: Date, holidays: Set<string> = getKoreanHolidaySet()): number {
    const days = differenceInCalendarDays(b, a);
    if (days <= 0) return 0;
    let count = 0;
    let cursor = startOfDay(a);
    for (let i = 0; i < days; i++) {
        cursor = addDays(cursor, 1);
        if (isBusinessDay(cursor, holidays)) count++;
    }
    return count;
}

/** 한국식 주 시작 (기본 월요일, v1.0.10부터 store에서 변경 가능) */
export function startOfKoreanWeek(date: Date): Date {
    return startOfWeek(date, { weekStartsOn: resolveWeekStartsOn() });
}

/** 한국식 주 종료 (일요일 23:59:59.999, v1.0.10부터 store에서 변경 가능) */
export function endOfKoreanWeek(date: Date): Date {
    return endOfWeek(date, { weekStartsOn: resolveWeekStartsOn() });
}

/** 주어진 날짜가 오늘인가 (로컬 시각 기준) */
export function isToday(date: Date | null | undefined, now = new Date()): boolean {
    if (!date) return false;
    return isSameDay(date, now);
}

/** 주어진 날짜가 이번주 (한국식, 월~일) 안에 있나 */
export function isThisWeek(date: Date | null | undefined, now = new Date()): boolean {
    if (!date) return false;
    return isWithinInterval(date, {
        start: startOfKoreanWeek(now),
        end: endOfKoreanWeek(now),
    });
}

/** 'YYYY-MM-DD' key 추출 (그룹핑 용) */
export function dayKey(date: Date | string | null | undefined): string | null {
    const d = typeof date === 'string' ? safeParseDate(date) : date;
    if (!d) return null;
    return format(d, 'yyyy-MM-dd');
}

/** N일 전 ~ 오늘까지의 day key 배열 (오래된 순) */
export function lastNDayKeys(n: number, now = new Date()): string[] {
    const result: string[] = [];
    const today = startOfDay(now);
    for (let i = n - 1; i >= 0; i--) {
        result.push(format(addDays(today, -i), 'yyyy-MM-dd'));
    }
    return result;
}

/** date-fns endOfDay 재export — 외부에서 import 편의 */
export { startOfDay, endOfDay };
