import { describe, it, expect } from 'vitest';
import {
    isBusinessDay,
    addBusinessDays,
    businessDaysBetween,
    startOfKoreanWeek,
    endOfKoreanWeek,
    isToday,
    isThisWeek,
    parseLocalDay,
    safeParseDate,
    dayKey,
    lastNDayKeys,
} from '../date-utils';

describe('isBusinessDay', () => {
    it('평일은 영업일', () => {
        expect(isBusinessDay(new Date(2026, 3, 15))).toBe(true); // 수요일
    });
    it('주말은 비영업일', () => {
        expect(isBusinessDay(new Date(2026, 3, 18))).toBe(false); // 토요일
        expect(isBusinessDay(new Date(2026, 3, 19))).toBe(false); // 일요일
    });
    it('한국 공휴일은 비영업일', () => {
        expect(isBusinessDay(new Date(2026, 0, 1))).toBe(false); // 신정 (목)
        expect(isBusinessDay(new Date(2026, 4, 5))).toBe(false); // 어린이날 (화)
        expect(isBusinessDay(new Date(2026, 7, 15))).toBe(false); // 광복절 (토 — 어차피 주말)
    });
    it('커스텀 공휴일 set 주입 가능', () => {
        const custom = new Set<string>(['2026-04-15']);
        expect(isBusinessDay(new Date(2026, 3, 15), custom)).toBe(false);
    });
});

describe('addBusinessDays', () => {
    it('금요일 + 1영업일 = 다음주 월요일', () => {
        const fri = new Date(2026, 3, 17); // 2026-04-17 금
        const r = addBusinessDays(fri, 1);
        expect(r.getDay()).toBe(1); // 월요일
        expect(r.getDate()).toBe(20);
    });
    it('공휴일 건너뜀 (어린이날 5/5 화 → 영업일 아님)', () => {
        const monday = new Date(2026, 4, 4); // 5/4 월
        const r = addBusinessDays(monday, 1);
        // 5/5 화 공휴일 → 5/6 수
        expect(r.getDate()).toBe(6);
    });
    it('0일 추가는 같은 날', () => {
        const wed = new Date(2026, 3, 15);
        expect(addBusinessDays(wed, 0).getTime()).toBe(wed.getTime());
    });
    it('주말 건너뛰면서 5일 추가', () => {
        const wed = new Date(2026, 3, 15); // 4/15 수
        const r = addBusinessDays(wed, 5);
        expect(r.getDate()).toBe(22); // 4/22 수 (주말 토일 건너뜀)
    });
});

describe('businessDaysBetween', () => {
    it('같은 주 내 평일 차이', () => {
        const mon = new Date(2026, 3, 13);
        const fri = new Date(2026, 3, 17);
        expect(businessDaysBetween(mon, fri)).toBe(4);
    });
    it('주말을 포함하면 영업일만 카운트', () => {
        const fri = new Date(2026, 3, 17);
        const nextFri = new Date(2026, 3, 24);
        // 4/17 ~ 4/24: 5 영업일 (월화수목금)
        expect(businessDaysBetween(fri, nextFri)).toBe(5);
    });
    it('a >= b 면 0', () => {
        const today = new Date(2026, 3, 15);
        expect(businessDaysBetween(today, today)).toBe(0);
        expect(businessDaysBetween(new Date(2026, 3, 20), today)).toBe(0);
    });
});

describe('startOfKoreanWeek / endOfKoreanWeek', () => {
    it('수요일이면 그 주 월요일이 시작', () => {
        const wed = new Date(2026, 3, 15); // 4/15 수
        const start = startOfKoreanWeek(wed);
        expect(start.getDay()).toBe(1); // 월요일
        expect(start.getDate()).toBe(13);
    });
    it('수요일이면 그 주 일요일이 종료', () => {
        const wed = new Date(2026, 3, 15);
        const end = endOfKoreanWeek(wed);
        expect(end.getDay()).toBe(0); // 일요일
        expect(end.getDate()).toBe(19);
    });
    it('일요일이면 같은 주의 시작은 그 직전 월요일', () => {
        const sun = new Date(2026, 3, 19); // 4/19 일
        const start = startOfKoreanWeek(sun);
        expect(start.getDate()).toBe(13);
    });
});

describe('isToday / isThisWeek', () => {
    it('isToday 정확', () => {
        const now = new Date(2026, 3, 15, 14, 30);
        expect(isToday(new Date(2026, 3, 15, 23, 0), now)).toBe(true);
        expect(isToday(new Date(2026, 3, 15, 0, 1), now)).toBe(true);
        expect(isToday(new Date(2026, 3, 14, 23, 59), now)).toBe(false);
        expect(isToday(new Date(2026, 3, 16, 0, 1), now)).toBe(false);
    });
    it('null/undefined 안전', () => {
        expect(isToday(null)).toBe(false);
        expect(isToday(undefined)).toBe(false);
        expect(isThisWeek(null)).toBe(false);
    });
    it('isThisWeek (한국식 월~일)', () => {
        const now = new Date(2026, 3, 15); // 수
        // 같은 주 월요일~일요일은 모두 true
        expect(isThisWeek(new Date(2026, 3, 13), now)).toBe(true);
        expect(isThisWeek(new Date(2026, 3, 19, 23, 59), now)).toBe(true);
        // 직전 일요일은 다른 주
        expect(isThisWeek(new Date(2026, 3, 12), now)).toBe(false);
        // 다음주 월요일은 다른 주
        expect(isThisWeek(new Date(2026, 3, 20), now)).toBe(false);
    });
});

describe('parseLocalDay (KST timezone fix)', () => {
    it("'YYYY-MM-DD'는 로컬 자정으로 파싱 (UTC 자정 X)", () => {
        const d = parseLocalDay('2026-04-15');
        expect(d).not.toBeNull();
        expect(d!.getFullYear()).toBe(2026);
        expect(d!.getMonth()).toBe(3); // April
        expect(d!.getDate()).toBe(15);
        expect(d!.getHours()).toBe(0);
        expect(d!.getMinutes()).toBe(0);
    });
    it('ISO 시각 포함은 그대로', () => {
        const d = parseLocalDay('2026-04-15T10:30:00.000Z');
        expect(d).not.toBeNull();
        expect(d!.toISOString()).toBe('2026-04-15T10:30:00.000Z');
    });
    it('null/잘못된 값 안전', () => {
        expect(parseLocalDay(null)).toBeNull();
        expect(parseLocalDay('not-a-date')).toBeNull();
        expect(parseLocalDay('')).toBeNull();
    });
});

describe('safeParseDate', () => {
    it('Date 인스턴스 그대로', () => {
        const d = new Date();
        expect(safeParseDate(d)).toBe(d);
    });
    it('숫자(epoch ms) 파싱', () => {
        expect(safeParseDate(1_700_000_000_000)).toBeInstanceOf(Date);
    });
    it('잘못된 값', () => {
        expect(safeParseDate(null)).toBeNull();
        expect(safeParseDate({})).toBeNull();
        expect(safeParseDate('garbage')).toBeNull();
    });
});

describe('dayKey / lastNDayKeys', () => {
    it("dayKey: 'YYYY-MM-DD' 반환", () => {
        expect(dayKey(new Date(2026, 3, 15))).toBe('2026-04-15');
        expect(dayKey('2026-04-15T10:00:00Z')).toBe('2026-04-15');
        expect(dayKey(null)).toBeNull();
    });
    it('lastNDayKeys: 오래된 순 N개', () => {
        const now = new Date(2026, 3, 15);
        const keys = lastNDayKeys(3, now);
        expect(keys).toEqual(['2026-04-13', '2026-04-14', '2026-04-15']);
    });
});
