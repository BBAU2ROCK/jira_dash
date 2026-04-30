/**
 * ConnectionIndicator — v1.0.27.
 *
 * 좌하단 미세 indicator. 세션·네트워크 상태 가시화.
 * - 정상: 초록 점 + "온라인" (hover only)
 * - stale: 노랑 + "세션 갱신 중"
 * - offline: 빨강 + "오프라인"
 */
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KeepaliveState } from '@/hooks/useJiraKeepalive';

interface Props {
    state: KeepaliveState;
}

export function ConnectionIndicator({ state }: Props) {
    let Icon = Wifi;
    let color = 'text-emerald-500 dark:text-emerald-400';
    let label = '온라인';
    let tip = state.lastPingAt
        ? `세션 정상 (마지막 확인: ${new Date(state.lastPingAt).toLocaleTimeString('ko-KR')})`
        : '연결 확인 중…';

    if (!state.isOnline) {
        Icon = WifiOff;
        color = 'text-red-500 dark:text-red-400';
        label = '오프라인';
        tip = '네트워크 연결 없음. 복구 후 자동 재연결됩니다.';
    } else if (state.isStale) {
        Icon = AlertCircle;
        color = 'text-amber-500 dark:text-amber-400';
        label = '세션 갱신';
        tip = 'Jira 세션이 만료됐을 수 있습니다. 자동 재시도 중…';
    }

    return (
        <div
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
                'border border-border bg-card/60 text-[11px] font-medium',
                'transition-colors',
                color
            )}
            title={tip}
            role="status"
            aria-label={label}
        >
            <Icon className="h-3 w-3" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
        </div>
    );
}
