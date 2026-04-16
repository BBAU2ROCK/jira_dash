import { describe, it, expect } from 'vitest';
import { buildAnonymizeMap, anonymizeName, isPreservedLabel, maybeAnonymize } from '../anonymize';

describe('buildAnonymizeMap', () => {
    it('가나다 정렬 후 인덱스 alias 부여', () => {
        const map = buildAnonymizeMap(['장XX', '김XX', '안XX']);
        expect(map.get('김XX')).toBe('개발자 A');
        expect(map.get('안XX')).toBe('개발자 B');
        expect(map.get('장XX')).toBe('개발자 C');
    });

    it('같은 입력 → 같은 alias (deterministic)', () => {
        const m1 = buildAnonymizeMap(['김XX', '이YY']);
        const m2 = buildAnonymizeMap(['이YY', '김XX']); // 순서 다르게 입력
        expect(m1.get('김XX')).toBe(m2.get('김XX'));
        expect(m1.get('이YY')).toBe(m2.get('이YY'));
    });

    it('27명 이상 — AA, AB ... 형식 (zero-padded numeric 입력)', () => {
        // 정렬 안정성을 위해 zero-padded numeric 사용
        const names = Array.from({ length: 28 }, (_, i) => `name${String(i).padStart(3, '0')}`);
        const map = buildAnonymizeMap(names);
        expect(map.get('name000')).toBe('개발자 A');
        expect(map.get('name025')).toBe('개발자 Z');
        expect(map.get('name026')).toBe('개발자 AA');
        expect(map.get('name027')).toBe('개발자 AB');
    });

    it('중복 입력은 dedupe', () => {
        const map = buildAnonymizeMap(['김XX', '김XX', '이YY']);
        expect(map.size).toBe(2);
    });
});

describe('anonymizeName', () => {
    it('매핑 있으면 alias 반환', () => {
        const map = new Map([['김XX', '개발자 A']]);
        expect(anonymizeName('김XX', map)).toBe('개발자 A');
    });

    it('매핑 없으면 원본 반환 (안전)', () => {
        const map = new Map([['김XX', '개발자 A']]);
        expect(anonymizeName('박ZZ', map)).toBe('박ZZ');
    });
});

describe('isPreservedLabel', () => {
    it('미배정·미할당 등은 보존', () => {
        expect(isPreservedLabel('미배정')).toBe(true);
        expect(isPreservedLabel('미할당')).toBe(true);
        expect(isPreservedLabel('김XX')).toBe(false);
    });
});

describe('maybeAnonymize', () => {
    const map = new Map([['김XX', '개발자 A']]);

    it('익명화 OFF → 원본', () => {
        expect(maybeAnonymize('김XX', map, false)).toBe('김XX');
    });

    it('익명화 ON → alias', () => {
        expect(maybeAnonymize('김XX', map, true)).toBe('개발자 A');
    });

    it('보존 라벨은 익명화 ON에서도 원본', () => {
        expect(maybeAnonymize('미배정', map, true)).toBe('미배정');
    });
});
