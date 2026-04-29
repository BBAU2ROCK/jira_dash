/**
 * Issue Detail Drawer — Activity / History UI fragments.
 * Extracted from issue-detail-drawer.tsx (v1.0.20).
 */
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { adfToText } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyItem = any;

export function HistoryItems({ items }: { items: AnyItem[] }) {
    if (!items || items.length === 0) return null;
    return (
        <div className="space-y-1.5 border-l-2 border-slate-300 pl-3 py-1">
            {items.map((item: AnyItem, i: number) => (
                <div key={i} className="text-[11px] text-slate-600 flex gap-1.5 flex-wrap items-center">
                    <span className="font-bold text-slate-700">{item.field}</span>
                    <span className="text-slate-500 line-through">{item.fromString || '(empty)'}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-medium text-slate-800">{item.toString || '(empty)'}</span>
                </div>
            ))}
        </div>
    );
}

export function ActivityItem({ item, onEditClick }: { item: AnyItem; onEditClick?: (commentId: string, body: AnyItem) => void }) {
    const isCommentEditable = item.type === 'comment' && onEditClick;
    return (
        <div
            className={cn(
                "border border-slate-200 rounded-lg p-4 space-y-2 bg-slate-50 shadow-sm",
                isCommentEditable && "cursor-pointer hover:bg-slate-100 hover:border-slate-300 transition-colors"
            )}
            onClick={isCommentEditable ? () => onEditClick(item.id, item.body) : undefined}
            role={isCommentEditable ? "button" : undefined}
            tabIndex={isCommentEditable ? 0 : undefined}
            onKeyDown={isCommentEditable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEditClick(item.id, item.body); } } : undefined}
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800">{item.author ?? 'Unknown'}</span>
                    <Badge variant="outline" className={`text-[9px] px-1 h-3.5 border-none font-normal ${item.type === 'comment' ? 'bg-blue-500/10 text-blue-600' :
                        item.type === 'worklog' ? 'bg-amber-500/10 text-amber-600' :
                            'bg-slate-500/10 text-slate-600'
                        }`}>
                        {item.type === 'comment' ? '댓글' : item.type === 'worklog' ? '업무로그' : '이력'}
                    </Badge>
                    {item.type === 'worklog' && item.timeSpent && (
                        <span className="text-[10px] text-amber-600 font-medium" title="로그시간">
                            · {item.timeSpent}
                        </span>
                    )}
                </div>
                <span className="text-[11px] text-slate-500 ml-auto whitespace-nowrap">
                    {(() => {
                        try {
                            return format(new Date(item.time), 'yyyy.MM.dd HH:mm');
                        } catch {
                            return '날짜 오류';
                        }
                    })()}
                </span>
            </div>
            <div className="pl-6">
                {item.type === 'comment' ? (
                    <div className="text-sm text-slate-700 whitespace-pre-wrap">{adfToText(item.body)}</div>
                ) : item.type === 'worklog' ? (
                    <div className="text-sm text-slate-700 whitespace-pre-wrap">{adfToText(item.comment)}</div>
                ) : (
                    <HistoryItems items={item.items} />
                )}
            </div>
        </div>
    );
}
