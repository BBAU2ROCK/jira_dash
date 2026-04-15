import { describe, it, expect } from 'vitest';
import { scopeChangeRatio, classifyScopeStatus, scopeStatusMeta } from '../scopeAnalysis';

describe('scopeChangeRatio', () => {
    it('완료 0이면 0 반환 (분류 불가)', () => {
        expect(scopeChangeRatio(10, 0)).toBe(0);
    });
    it('정상 비율 계산', () => {
        expect(scopeChangeRatio(50, 100)).toBe(0.5);
        expect(scopeChangeRatio(120, 71)).toBeCloseTo(1.69, 2);
    });
});

describe('classifyScopeStatus', () => {
    it('안정 (0.8) → stable', () => {
        expect(classifyScopeStatus(0.8)).toBe('stable');
    });
    it('마무리 (0.13, IGMU 케이스) → converging', () => {
        expect(classifyScopeStatus(0.13)).toBe('converging');
    });
    it('Scope creep (1.2) → growing', () => {
        expect(classifyScopeStatus(1.2)).toBe('growing');
    });
    it('발산 (1.69, IPCON 케이스) → crisis', () => {
        expect(classifyScopeStatus(1.69)).toBe('crisis');
    });
    it('비율 0 또는 음수 → converging', () => {
        expect(classifyScopeStatus(0)).toBe('converging');
        expect(classifyScopeStatus(-0.1)).toBe('converging');
    });
});

describe('scopeStatusMeta', () => {
    it('각 상태별 색상·아이콘 매핑', () => {
        expect(scopeStatusMeta('stable').color).toBe('green');
        expect(scopeStatusMeta('growing').color).toBe('amber');
        expect(scopeStatusMeta('crisis').color).toBe('red');
        expect(scopeStatusMeta('converging').color).toBe('blue');
    });
});
