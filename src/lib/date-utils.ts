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
import { JIRA_CONFIG } from '@/config/jiraConfig';

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

/** 한국 공휴일 Set (lazy memoize) */
let cachedHolidaySet: Set<string> | null = null;
function getKoreanHolidaySet(): Set<string> {
    if (!cachedHolidaySet) {
        cachedHolidaySet = new Set<string>(JIRA_CONFIG.KOREAN_HOLIDAYS_2026);
    }
    return cachedHolidaySet;
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

/** 한국식 주 시작 (월요일) */
export function startOfKoreanWeek(date: Date): Date {
    return startOfWeek(date, { weekStartsOn: JIRA_CONFIG.WEEK_STARTS_ON });
}

/** 한국식 주 종료 (일요일 23:59:59.999) */
export function endOfKoreanWeek(date: Date): Date {
    return endOfWeek(date, { weekStartsOn: JIRA_CONFIG.WEEK_STARTS_ON });
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
