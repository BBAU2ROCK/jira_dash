/** Electron IPC exposed via preload (only in packaged/Electron runtime). */
export interface ElectronIpc {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    send(channel: string, ...args: unknown[]): void;
    on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
    off(channel: string, ...args: unknown[]): void;
}

declare global {
    interface Window {
        ipcRenderer?: ElectronIpc;
    }
    /** v1.0.34: vite.config.ts의 define 으로 빌드 타임 주입되는 앱 버전. */
    const __APP_VERSION__: string;
}

export {};
