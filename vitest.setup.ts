import '@testing-library/jest-dom/vitest';

// vitest 4.x + jsdom에서 localStorage가 disabled로 나오는 케이스 대응 (강제 polyfill)
class MemoryStorage implements Storage {
    private data: Record<string, string> = {};
    get length() {
        return Object.keys(this.data).length;
    }
    clear() {
        this.data = {};
    }
    getItem(k: string) {
        return this.data[k] ?? null;
    }
    key(i: number) {
        return Object.keys(this.data)[i] ?? null;
    }
    removeItem(k: string) {
        delete this.data[k];
    }
    setItem(k: string, v: string) {
        this.data[k] = String(v);
    }
}

if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: new MemoryStorage(), configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: new MemoryStorage(), configurable: true });
}
