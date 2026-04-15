import { describe, it, expect, beforeEach } from 'vitest';
import { useEpicMappingStore } from '../epicMappingStore';

function reset() {
    useEpicMappingStore.setState({ mappings: [] });
}

describe('epicMappingStore.addMapping', () => {
    beforeEach(reset);

    it('정상 추가', () => {
        const r = useEpicMappingStore.getState().addMapping('IGMU-1', 'TQ-1');
        expect(r.ok).toBe(true);
        expect(useEpicMappingStore.getState().mappings).toHaveLength(1);
    });

    it('대소문자 정규화 (입력 소문자 → 저장은 대문자)', () => {
        useEpicMappingStore.getState().addMapping('igmu-1', 'tq-1');
        const m = useEpicMappingStore.getState().mappings[0];
        expect(m.devEpicKey).toBe('IGMU-1');
        expect(m.defectEpicKey).toBe('TQ-1');
    });

    it('빈 키 거부', () => {
        const r = useEpicMappingStore.getState().addMapping('', 'TQ-1');
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('empty');
    });

    it('동일 (dev, defect) 쌍 중복 거부', () => {
        useEpicMappingStore.getState().addMapping('IGMU-1', 'TQ-1');
        const r = useEpicMappingStore.getState().addMapping('IGMU-1', 'TQ-1');
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('duplicate-pair');
        expect(useEpicMappingStore.getState().mappings).toHaveLength(1);
    });

    it('동일 dev 에픽이 다른 결함에 매핑 시 거부 (H6/H7 회귀 박제)', () => {
        useEpicMappingStore.getState().addMapping('IGMU-1', 'TQ-1');
        const r = useEpicMappingStore.getState().addMapping('IGMU-1', 'TQ-2');
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('dev-already-mapped');
        expect(useEpicMappingStore.getState().mappings).toHaveLength(1);
    });

    it('서로 다른 dev 에픽은 자유 추가', () => {
        useEpicMappingStore.getState().addMapping('IGMU-1', 'TQ-1');
        useEpicMappingStore.getState().addMapping('IGMU-2', 'TQ-1'); // 같은 결함, 다른 dev → 허용
        expect(useEpicMappingStore.getState().mappings).toHaveLength(2);
    });
});

describe('epicMappingStore.removeMapping / updateMapping', () => {
    beforeEach(reset);

    it('removeMapping', () => {
        const r = useEpicMappingStore.getState().addMapping('IGMU-1', 'TQ-1');
        if (!r.ok) throw new Error('add failed');
        useEpicMappingStore.getState().removeMapping(r.id);
        expect(useEpicMappingStore.getState().mappings).toHaveLength(0);
    });

    it('updateMapping은 정규화 적용', () => {
        const r = useEpicMappingStore.getState().addMapping('IGMU-1', 'TQ-1');
        if (!r.ok) throw new Error('add failed');
        useEpicMappingStore.getState().updateMapping(r.id, { defectEpicKey: 'tq-99' });
        expect(useEpicMappingStore.getState().mappings[0].defectEpicKey).toBe('TQ-99');
    });
});
