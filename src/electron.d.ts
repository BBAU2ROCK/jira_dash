/**
 * Electron IPC exposed via preload (only in packaged/Electron runtime).
 * v1.0.49: preload는 화이트리스트된 채널만 통과시킨다. 비-허용 채널을 호출하면:
 *  - on/off: console.warn + no-op
 *  - invoke: rejected Promise
 *  - send: no-op (현재 fire-and-forget 사용처 없음)
 */
export interface ElectronIpc {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    send(channel: string, ...args: unknown[]): void;
    /** 반환값은 등록 해제 함수 (v1.0.49) */
    on(
        channel: string,
        listener: (event: unknown, ...args: unknown[]) => void
    ): (() => void) | undefined;
    off(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

declare global {
    interface Window {
        ipcRenderer?: ElectronIpc;
    }
    /** v1.0.34: vite.config.ts의 define 으로 빌드 타임 주입되는 앱 버전. */
    const __APP_VERSION__: string;
}

export {};
