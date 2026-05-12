/**
 * preload — v1.0.49
 *
 * Electron context bridge.
 * 보안: ipcRenderer 전체 노출 대신 **화이트리스트된 채널**만 통과.
 * renderer XSS 발생 시 임의 채널 호출(예: 시크릿 추출)을 차단.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/** main → renderer 단방향 send 채널 */
const INCOMING_CHANNELS = ['main-process-message'] as const
type IncomingChannel = (typeof INCOMING_CHANNELS)[number]

/** renderer → main invoke (양방향 Promise) 채널 */
const INVOKE_CHANNELS = [
    'jira-config:get',
    'jira-config:set',
    'jira-config:test',
] as const
type InvokeChannel = (typeof INVOKE_CHANNELS)[number]

function isIncoming(ch: string): ch is IncomingChannel {
    return (INCOMING_CHANNELS as readonly string[]).includes(ch)
}
function isInvoke(ch: string): ch is InvokeChannel {
    return (INVOKE_CHANNELS as readonly string[]).includes(ch)
}

contextBridge.exposeInMainWorld('ipcRenderer', {
    /** main이 send한 메시지 수신 (화이트리스트 only) */
    on(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) {
        if (!isIncoming(channel)) {
            console.warn(`[preload] blocked ipcRenderer.on for non-whitelisted channel: ${channel}`)
            return () => undefined
        }
        const wrapped = (event: IpcRendererEvent, ...args: unknown[]) => listener(event, ...args)
        ipcRenderer.on(channel, wrapped)
        return () => ipcRenderer.off(channel, wrapped)
    },

    /** 리스너 제거 (화이트리스트 only) */
    off(channel: string, listener: (...args: unknown[]) => void) {
        if (!isIncoming(channel)) {
            console.warn(`[preload] blocked ipcRenderer.off for non-whitelisted channel: ${channel}`)
            return
        }
        ipcRenderer.off(channel, listener as never)
    },

    /** invoke (화이트리스트 only) */
    invoke(channel: string, ...args: unknown[]): Promise<unknown> {
        if (!isInvoke(channel)) {
            return Promise.reject(new Error(`[preload] invoke channel not allowed: ${channel}`))
        }
        return ipcRenderer.invoke(channel, ...args)
    },

    /**
     * send (양방향이 아닌 fire-and-forget).
     * 현재 사용처 없음 — 화이트리스트가 비어 있어 항상 차단.
     */
    send(channel: string) {
        console.warn(`[preload] ipcRenderer.send is disabled. channel: ${channel}`)
    },
})
