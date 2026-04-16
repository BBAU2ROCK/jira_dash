/**
 * 익명화 — 인원명을 deterministic alias (개발자 A/B/C...)로 변환.
 * 같은 인원은 항상 같은 alias. 외부 공유·스크린샷 시 안전.
 *
 * 알고리즘:
 *   - 가나다 정렬 후 인덱스 → A, B, C ... Z, AA, AB ...
 *   - mapping 캐시는 호출자가 보유 (Map<key, alias>)
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 인덱스 0 → 'A', 25 → 'Z', 26 → 'AA', 27 → 'AB' ... */
function indexToLetter(idx: number): string {
    if (idx < 0) return '?';
    let result = '';
    let n = idx;
    while (true) {
        result = LETTERS[n % 26] + result;
        n = Math.floor(n / 26) - 1;
        if (n < 0) break;
    }
    return result;
}

/**
 * 이름 목록에서 alias 매핑 생성.
 * 가나다 정렬 → 인덱스 순 alias. 동일 입력은 항상 동일 alias 반환 (deterministic).
 */
export function buildAnonymizeMap(names: readonly string[]): Map<string, string> {
    const unique = [...new Set(names)].sort((a, b) => a.localeCompare(b, 'ko'));
    const map = new Map<string, string>();
    unique.forEach((name, idx) => {
        map.set(name, `개발자 ${indexToLetter(idx)}`);
    });
    return map;
}

/**
 * 단일 이름을 alias로 변환. 매핑에 없으면 원본 그대로 반환 (안전).
 */
export function anonymizeName(name: string, map: Map<string, string>): string {
    return map.get(name) ?? name;
}

/**
 * 미할당·비활성 등 특수 라벨은 그대로 유지 (alias 적용 X).
 * K8: 과거 호환성 유지 — '미할당'도 preserved에 포함하여 older localStorage 데이터 보호.
 */
import { UNASSIGNED_LABEL, UNKNOWN_LABEL, UNKNOWN_VALUE } from '@/lib/jira-constants';
const PRESERVED_LABELS = new Set<string>([
    UNASSIGNED_LABEL,  // '미배정'
    '미할당',            // 과거 데이터 호환
    UNKNOWN_VALUE,      // '(unknown)'
    UNKNOWN_LABEL,      // '(미상)'
]);
export function isPreservedLabel(name: string): boolean {
    return PRESERVED_LABELS.has(name);
}

/**
 * 익명화 모드일 때만 alias 변환. PRESERVED_LABELS는 항상 원본.
 */
export function maybeAnonymize(name: string, map: Map<string, string>, anonymizeMode: boolean): string {
    if (!anonymizeMode) return name;
    if (isPreservedLabel(name)) return name;
    return anonymizeName(name, map);
}
