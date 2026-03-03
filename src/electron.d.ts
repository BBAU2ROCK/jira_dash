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
}

export {};
