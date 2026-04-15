import { describe, it, expect } from 'vitest';
import { buildCommentAdf, adfToSegments, type CommentSegment } from '../jiraClient';

describe('buildCommentAdf / adfToSegments round-trip', () => {
    it('단순 텍스트', () => {
        const segs: CommentSegment[] = [{ type: 'text', text: 'Hello world' }];
        const adf = buildCommentAdf(segs);
        const { segments, hasUnsupportedNodes } = adfToSegments(adf);
        expect(segments).toEqual(segs);
        expect(hasUnsupportedNodes).toBe(false);
    });

    it('멘션 + 텍스트 혼합', () => {
        const segs: CommentSegment[] = [
            { type: 'text', text: '안녕 ' },
            { type: 'mention', accountId: 'acc-1', displayName: '홍길동' },
            { type: 'text', text: ' 검토 부탁드려요.' },
        ];
        const adf = buildCommentAdf(segs);
        const { segments } = adfToSegments(adf);
        expect(segments).toEqual(segs);
    });

    it('hardBreak (개행) 처리', () => {
        const segs: CommentSegment[] = [
            { type: 'text', text: '첫 줄\n둘째 줄' },
        ];
        const adf = buildCommentAdf(segs);
        const { segments } = adfToSegments(adf);
        const recombined = segments.map((s) => (s.type === 'text' ? s.text : '')).join('');
        expect(recombined).toBe('첫 줄\n둘째 줄');
    });

    it('빈 segments는 빈 paragraph 생성', () => {
        const adf = buildCommentAdf([]);
        expect(adf.type).toBe('doc');
        expect(adf.content[0].type).toBe('paragraph');
        expect(adf.content[0].content).toEqual([]);
    });

    it('잘못된 ADF는 빈 배열 반환', () => {
        expect(adfToSegments(null).segments).toEqual([]);
        expect(adfToSegments({ type: 'foo' }).segments).toEqual([]);
        expect(adfToSegments({ type: 'doc', content: 'invalid' }).segments).toEqual([]);
    });
});

describe('adfToSegments — C2 unsupported node detection', () => {
    it('codeBlock는 unsupported로 표시', () => {
        const adf = {
            type: 'doc',
            content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'foo()' }] }],
        };
        const { segments, hasUnsupportedNodes } = adfToSegments(adf);
        expect(segments).toEqual([]);
        expect(hasUnsupportedNodes).toBe(true);
    });

    it('bulletList는 unsupported', () => {
        const adf = {
            type: 'doc',
            content: [
                { type: 'bulletList', content: [] },
                { type: 'paragraph', content: [{ type: 'text', text: 'after list' }] },
            ],
        };
        const { segments, hasUnsupportedNodes } = adfToSegments(adf);
        expect(segments).toEqual([{ type: 'text', text: 'after list' }]);
        expect(hasUnsupportedNodes).toBe(true);
    });

    it('text + link mark는 unsupported (마크 손실)', () => {
        const adf = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'click here', marks: [{ type: 'link', attrs: { href: 'https://x.tld' } }] },
                    ],
                },
            ],
        };
        const { segments, hasUnsupportedNodes } = adfToSegments(adf);
        expect(segments).toEqual([{ type: 'text', text: 'click here' }]);
        expect(hasUnsupportedNodes).toBe(true);
    });

    it('emoji 같은 미지원 인라인 노드는 unsupported', () => {
        const adf = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'hi ' },
                        { type: 'emoji', attrs: { shortName: ':smile:' } },
                    ],
                },
            ],
        };
        const { segments, hasUnsupportedNodes } = adfToSegments(adf);
        expect(segments).toEqual([{ type: 'text', text: 'hi ' }]);
        expect(hasUnsupportedNodes).toBe(true);
    });
});
