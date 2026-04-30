/**
 * useJiraKeepalive — v1.0.27
 *
 * 장시간 사용자 idle 시 Jira 세션·프록시 연결이 끊어지는 문제를 방지.
 *
 * 메커니즘:
 *   1. 10분마다 가벼운 myself API 호출 (Atlassian 세션 토큰 갱신 유도)
 *   2. window focus / online 이벤트 시 즉시 ping
 *   3. ping 실패 시 onError 콜백 (UI에 표시 가능)
 *
 * 호출 위치: App.tsx 또는 Dashboard.tsx (전역 1회)
 */
import { useEffect, useRef, useState } from 'react';
import { jiraApi } from '@/api/jiraClient';

const KEEPALIVE_INTERVAL = 10 * 60 * 1000; // 10분

export interface KeepaliveState {
    /** 마지막 ping 성공 시각 (ms epoch) */
    lastPingAt: number | null;
    /** 마지막 ping 실패 — true 면 세션 끊김 가능성 */
    isStale: boolean;
    /** 현재 onLine 상태 */
    isOnline: boolean;
}

export function useJiraKeepalive(): KeepaliveState {
    const [state, setState] = useState<KeepaliveState>({
        lastPingAt: null,
        isStale: false,
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    });
    const inFlight = useRef(false);

    useEffect(() => {
        let mounted = true;

        async function ping() {
            if (inFlight.current) return;
            inFlight.current = true;
            try {
                // Jira의 가장 가벼운 인증 검증 API. searchUsers('') 1글자.
                // 별도 keepalive endpoint가 없으면 jiraFields(캐시 가능) 활용.
                await jiraApi.getFields();
                if (mounted) {
                    setState((s) => ({ ...s, lastPingAt: Date.now(), isStale: false }));
                }
            } catch {
                if (mounted) {
                    setState((s) => ({ ...s, isStale: true }));
                }
            } finally {
                inFlight.current = false;
            }
        }

        // 부팅 직후 1회 + 10분마다
        ping();
        const id = setInterval(ping, KEEPALIVE_INTERVAL);

        // window focus 시 즉시 ping (탭 복귀, 모니터 켬 등)
        const onFocus = () => ping();
        const onOnline = () => {
            setState((s) => ({ ...s, isOnline: true }));
            ping();
        };
        const onOffline = () => setState((s) => ({ ...s, isOnline: false }));

        window.addEventListener('focus', onFocus);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);

        return () => {
            mounted = false;
            clearInterval(id);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);

    return state;
}
