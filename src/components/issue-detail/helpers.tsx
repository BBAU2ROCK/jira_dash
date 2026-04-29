/* eslint-disable react-refresh/only-export-components --
 * 이 파일은 issue-detail-drawer 전용 helper 모음 (함수 + 작은 컴포넌트 혼합).
 * 별도 파일로 분리할 만큼 큰 이득이 없어 함께 유지.
 */
/**
 * Issue Detail Drawer — pure helpers / small presentational components.
 * Extracted from issue-detail-drawer.tsx (v1.0.20).
 */
import React from 'react';
import { Bug, CheckCircle, CircleCheck, Info } from 'lucide-react';
import type { CommentSegment } from '@/api/jiraClient';
import { cn } from '@/lib/utils';

const ZWSP = String.fromCharCode(0x200B); // zero-width space
const NBSP = String.fromCharCode(0x00A0); // non-breaking space
const TRAILING_WS_RE = new RegExp('[\\n' + NBSP + '\\s]+$');

/** CommentSegment[] → contentEditable innerHTML 변환 */
export function segmentsToHtml(segments: CommentSegment[]): string {
    return segments.map(seg => {
        if (seg.type === 'text') {
            return seg.text
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
        }
        const name = seg.displayName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<span contenteditable="false" data-mention-id="${seg.accountId}" data-mention-name="${name}" class="mention-chip">@${name}</span>`;
    }).join('');
}

/** contentEditable div → CommentSegment[] 추출 */
export function extractSegmentsFromEditor(el: HTMLDivElement): CommentSegment[] {
    const segments: CommentSegment[] = [];
    const pushText = (text: string) => {
        if (!text) return;
        const last = segments[segments.length - 1];
        if (last?.type === 'text') last.text += text;
        else segments.push({ type: 'text', text });
    };
    const walk = (node: Node, isFirstBlock: boolean) => {
        if (node.nodeType === Node.TEXT_NODE) {
            // zero-width space 제거 — split/join으로 invisible char 회피
            pushText((node.textContent ?? '').split(ZWSP).join(''));
        } else if (node instanceof HTMLElement) {
            if (node.dataset.mentionId) {
                segments.push({ type: 'mention', accountId: node.dataset.mentionId, displayName: node.dataset.mentionName ?? '' });
            } else if (node.tagName === 'BR') {
                pushText('\n');
            } else {
                const isBlock = ['DIV', 'P'].includes(node.tagName);
                if (isBlock && !isFirstBlock) pushText('\n');
                node.childNodes.forEach((c, i) => walk(c, isBlock && i === 0));
            }
        }
    };
    el.childNodes.forEach((c, i) => walk(c, i === 0));
    // 끝에 붙은 공백/개행/non-breaking space 제거
    const last = segments[segments.length - 1];
    if (last?.type === 'text') {
        last.text = last.text.replace(TRAILING_WS_RE, '');
    }
    return segments.filter(s => s.type !== 'text' || s.text.length > 0);
}

export function IssueTypeIcon({ type, className }: { type: string; className?: string }) {
    switch (type.toLowerCase()) {
        case 'bug': return <Bug className={cn("text-red-500", className)} />;
        case 'story': return <CheckCircle className={cn("text-emerald-500", className)} />;
        case 'task': return <CircleCheck className={cn("text-blue-500", className)} />;
        case 'sub-task':
        case 'subtask':
        case '하위 작업': return <CircleCheck className={cn("text-blue-400", className)} />;
        case '할 일': return <CircleCheck className={cn("text-blue-500", className)} />;
        case '결함': return <Bug className={cn("text-red-500", className)} />;
        default: return <Info className={cn("text-slate-400", className)} />;
    }
}

/** Atlassian Document Format (ADF) → plain text helper */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function adfToText(body: any): string {
    if (!body) return '';
    if (typeof body === 'string') return body;

    if (Array.isArray(body)) {
        return body.map(adfToText).join('');
    }

    switch (body.type) {
        case 'text':
            return body.text || '';
        case 'mention':
            return body.attrs?.text || '';
        case 'hardBreak':
            return '\n';
        case 'paragraph':
            return (body.content ? body.content.map(adfToText).join('') : '') + '\n';
        case 'bulletList':
        case 'orderedList':
            return (body.content ? body.content.map(adfToText).join('') : '') + '\n';
        case 'listItem':
            return '• ' + (body.content ? body.content.map(adfToText).join('') : '') + '\n';
        case 'codeBlock':
            return '\n```\n' + (body.content ? body.content.map(adfToText).join('') : '') + '\n```\n';
        case 'doc':
            return body.content ? body.content.map(adfToText).join('') : '';
        case 'media':
        case 'mediaSingle':
        case 'mediaGroup':
            return ''; // adfToText does not render media; use renderDescriptionAdf for inline display
        default:
            if (body.content) return adfToText(body.content);
            return '';
    }
}

export type AttachmentInfo = { id: string | number; filename?: string; mimeType?: string };

/** Safe href: only http/https to avoid XSS. */
export function isSafeHref(href: string | undefined): boolean {
    if (!href || typeof href !== 'string') return false;
    const t = href.trim().toLowerCase();
    return t.startsWith('https://') || t.startsWith('http://');
}

/** ADF → React nodes; media (id 또는 파일명 폴백), link marks. */
export function renderDescriptionAdf(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any,
    attachments: AttachmentInfo[],
    getUrl: (id: string | number) => string
): React.ReactNode {
    if (!body) return null;
    if (typeof body === 'string') return body;

    const attachmentIds = new Set(attachments.map(a => String(a.id)));
    const attachmentMime = new Map(attachments.map(a => [String(a.id), a.mimeType]));
    const attachmentByFilename = new Map<string, AttachmentInfo>();
    for (const a of attachments) {
        if (a.filename && !attachmentByFilename.has(a.filename.trim())) {
            attachmentByFilename.set(a.filename.trim(), a);
        }
    }

    function isImage(id: string | number): boolean {
        const mime = attachmentMime.get(String(id));
        return !!mime?.startsWith('image/');
    }

    function resolveMediaAttachmentId(id: string | number | undefined, alt: string): string | number | null {
        if (id != null && attachmentIds.has(String(id))) return id;
        if (!alt) return null;
        const byFilename = attachmentByFilename.get(alt.trim()) ?? attachments.find(a => a.filename?.trim() === alt.trim());
        return byFilename ? byFilename.id : null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function renderNode(node: any): React.ReactNode {
        if (!node) return null;
        if (typeof node === 'string') return node;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (Array.isArray(node)) return <>{node.map((n: any, i: number) => <React.Fragment key={i}>{renderNode(n)}</React.Fragment>)}</>;

        switch (node.type) {
            case 'text': {
                const text = node.text ?? '';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const linkMark = node.marks?.find((m: any) => m.type === 'link');
                const href = linkMark?.attrs?.href;
                if (isSafeHref(href)) {
                    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{text}</a>;
                }
                return text;
            }
            case 'mention':
                return node.attrs?.text ?? '';
            case 'hardBreak':
                return <br />;
            case 'paragraph':
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return <p className="mb-1">{node.content?.map((n: any, i: number) => <React.Fragment key={i}>{renderNode(n)}</React.Fragment>)}</p>;
            case 'bulletList':
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return <ul className="list-disc pl-4 my-1">{node.content?.map((n: any, i: number) => <li key={i}>{renderNode(n)}</li>)}</ul>;
            case 'orderedList':
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return <ol className="list-decimal pl-4 my-1">{node.content?.map((n: any, i: number) => <li key={i}>{renderNode(n)}</li>)}</ol>;
            case 'listItem':
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return <>{node.content?.map((n: any, i: number) => <React.Fragment key={i}>{renderNode(n)}</React.Fragment>)}</>;
            case 'codeBlock':
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return <pre className="bg-slate-200 rounded p-2 text-xs my-1 overflow-x-auto"><code>{node.content?.map((n: any, i: number) => <React.Fragment key={i}>{renderNode(n)}</React.Fragment>)}</code></pre>;
            case 'doc':
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return <>{node.content?.map((n: any, i: number) => <React.Fragment key={i}>{renderNode(n)}</React.Fragment>)}</>;
            case 'media': {
                const alt = node.attrs?.alt || '첨부';
                const resolvedId = resolveMediaAttachmentId(node.attrs?.id, alt);
                if (resolvedId != null) {
                    if (isImage(resolvedId)) {
                        return <img src={getUrl(resolvedId)} alt={alt} className="max-w-full h-auto rounded my-1" />;
                    }
                    return <a href={getUrl(resolvedId)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">[{alt} 다운로드]</a>;
                }
                return <span className="text-slate-500 text-sm">[이미지: {alt}]</span>;
            }
            case 'mediaSingle':
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return <div className="my-1">{node.content?.map((n: any, i: number) => <React.Fragment key={i}>{renderNode(n)}</React.Fragment>)}</div>;
            case 'mediaGroup':
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return <div className="flex flex-wrap gap-2 my-1">{node.content?.map((n: any, i: number) => <React.Fragment key={i}>{renderNode(n)}</React.Fragment>)}</div>;
            default:
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (node.content) return <>{node.content.map((n: any, i: number) => <React.Fragment key={i}>{renderNode(n)}</React.Fragment>)}</>;
                return null;
        }
    }

    return renderNode(body);
}

/** 빈 상태(empty state) — 이슈 상세 패널·탭에서 사용. */
export function EmptyState({ Icon, title, description }: { Icon: React.ElementType; title: string; description: string }) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300">
            <div className="bg-slate-100 p-4 rounded-full mb-4">
                <Icon className="h-8 w-8 text-slate-500" />
            </div>
            <h3 className="text-slate-700 font-medium mb-1">{title}</h3>
            <p className="text-slate-600 text-sm max-w-[200px] leading-relaxed">{description}</p>
        </div>
    );
}
