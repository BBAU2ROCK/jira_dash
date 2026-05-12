import { app, BrowserWindow, Menu, ipcMain, session, powerSaveBlocker, shell, safeStorage } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import express from 'express'
import axios from 'axios'
import cors from 'cors'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

// --- Jira Config (jira-config.json + env) - exe에서 설치 파일로 사용 가능 ---
export interface JiraConfig {
    jiraEmail: string;
    jiraApiToken: string;
}

const defaultJiraConfig: JiraConfig = { jiraEmail: '', jiraApiToken: '' };
let jiraConfig: JiraConfig = { ...defaultJiraConfig };

function getConfigPath(): string {
    return path.join(app.getPath('userData'), 'jira-config.json');
}

/**
 * v1.0.49 (H3): safeStorage(DPAPI on Windows, Keychain on macOS, libsecret on Linux)로
 * API 토큰을 OS 키체인 기반 암호화 저장. encryptionAvailable()=false 환경(예: 일부 Linux)
 * 에서는 평문 폴백 + 경고 로그.
 *
 * 파일 스키마 (마이그레이션 자동 처리):
 *   v1: { jiraEmail, jiraApiToken }                    — 평문 (legacy)
 *   v2: { jiraEmail, jiraApiTokenEnc: '<base64>' }     — safeStorage 암호화
 */
interface PersistedConfigV1 {
    jiraEmail?: string;
    jiraApiToken?: string;
}
interface PersistedConfigV2 {
    jiraEmail?: string;
    jiraApiTokenEnc?: string;
}

function tryDecryptToken(enc: string): string {
    try {
        if (!safeStorage.isEncryptionAvailable()) return '';
        return safeStorage.decryptString(Buffer.from(enc, 'base64'));
    } catch {
        return '';
    }
}

async function loadJiraConfig(): Promise<JiraConfig> {
    const envEmail = process.env.JIRA_EMAIL ?? '';
    const envToken = process.env.JIRA_API_TOKEN ?? '';
    if (envEmail && envToken) {
        jiraConfig = { jiraEmail: envEmail, jiraApiToken: envToken };
        return jiraConfig;
    }
    try {
        const p = getConfigPath();
        const raw = await fs.readFile(p, 'utf-8');
        const parsed = JSON.parse(raw) as PersistedConfigV1 & PersistedConfigV2;
        const email = typeof parsed?.jiraEmail === 'string' ? parsed.jiraEmail.trim() : '';
        let token = '';
        if (typeof parsed?.jiraApiTokenEnc === 'string' && parsed.jiraApiTokenEnc) {
            token = tryDecryptToken(parsed.jiraApiTokenEnc);
        }
        // legacy 평문 마이그레이션
        if (!token && typeof parsed?.jiraApiToken === 'string' && parsed.jiraApiToken) {
            token = parsed.jiraApiToken.trim();
            if (token) {
                try {
                    await saveJiraConfig({ jiraEmail: email, jiraApiToken: token });
                    console.log('[main] migrated legacy plain-text token to safeStorage');
                } catch (e) {
                    console.warn('[main] token migration failed:', e);
                }
            }
        }
        jiraConfig = { jiraEmail: email, jiraApiToken: token };
        return jiraConfig;
    } catch {
        // no file or invalid
    }
    return jiraConfig;
}

/**
 * 로컬에 상시 저장. 쓰기 성공 시에만 메모리 반영하여 사이드 이펙트 방지.
 * v1.0.49: safeStorage 사용 가능 시 토큰을 암호화하여 저장. 불가능 환경에서는 경고 후 평문 저장.
 */
async function saveJiraConfig(config: JiraConfig): Promise<void> {
    const email = typeof config.jiraEmail === 'string' ? config.jiraEmail.trim() : '';
    const token = typeof config.jiraApiToken === 'string' ? config.jiraApiToken.trim() : '';
    const p = getConfigPath();
    await fs.mkdir(path.dirname(p), { recursive: true });

    let payload: string;
    if (token && safeStorage.isEncryptionAvailable()) {
        const enc = safeStorage.encryptString(token).toString('base64');
        payload = JSON.stringify({ jiraEmail: email, jiraApiTokenEnc: enc }, null, 2);
    } else {
        if (token) console.warn('[main] safeStorage unavailable — saving token in plain text');
        payload = JSON.stringify({ jiraEmail: email, jiraApiToken: token }, null, 2);
    }
    await fs.writeFile(p, payload, 'utf-8');
    jiraConfig = { jiraEmail: email, jiraApiToken: token };
}

function getAuthHeader(): string {
    const { jiraEmail, jiraApiToken } = jiraConfig;
    if (jiraEmail && jiraApiToken) {
        return 'Basic ' + Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');
    }
    return '';
}

// --- Jira Proxy --- (M4: 공통 핸들러 사용 — CommonJS 모듈을 ESM에서 require)
import { createRequire } from 'node:module'
const requireCjs = createRequire(import.meta.url)
const { createJiraProxyMiddleware } = requireCjs('./jira-proxy-handler.cjs') as {
    createJiraProxyMiddleware: (opts: {
        getAuthHeader: () => string;
        log?: (msg: string) => void;
        baseUrl?: string;
    }) => (req: unknown, res: unknown) => Promise<void>;
};

const proxyApp = express();
const PROXY_PORT = 3001;

proxyApp.use(cors());
proxyApp.use(express.json());

proxyApp.use(
    '/api',
    createJiraProxyMiddleware({
        getAuthHeader,
        log: (msg: string) => console.log(`[ELECTRON PROXY] ${msg}`),
    })
);

function startProxyServer() {
    const server = proxyApp.listen(PROXY_PORT, '127.0.0.1', () => {
        console.log(`🚀 Internal Jira Proxy Server running on http://127.0.0.1:${PROXY_PORT}`);
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(
                `[ELECTRON PROXY] 포트 ${PROXY_PORT}이(가) 이미 사용 중입니다. ` +
                    '`npm start`로 뜬 proxy-server.cjs가 있다면 그쪽으로 요청됩니다(동일 Jira 인증 필요).'
            );
        } else {
            console.error('[ELECTRON PROXY] listen 오류:', err);
        }
    });
}

let win: BrowserWindow | null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

/**
 * v1.0.49: 외부로 열어도 되는 도메인 (shell.openExternal로 위임).
 * Jira 이슈 링크·아바타·attachment만 허용. 그 외 URL은 deny.
 */
const EXTERNAL_URL_WHITELIST = [
    /^https:\/\/([a-z0-9-]+\.)?atlassian\.net(\/.*)?$/i,
    /^https:\/\/([a-z0-9-]+\.)?atl-paas\.net(\/.*)?$/i,
    /^https:\/\/id\.atlassian\.com(\/.*)?$/i,
];

function isExternalUrlAllowed(rawUrl: string): boolean {
    try {
        const u = new URL(rawUrl);
        if (u.protocol !== 'https:') return false;
        return EXTERNAL_URL_WHITELIST.some((re) => re.test(rawUrl));
    } catch {
        return false;
    }
}

/**
 * v1.0.49: 내부 네비게이션 허용 URL (앱 자체 진입).
 *  - dev: Vite dev server
 *  - prod: file:// (loadFile)
 */
function isInternalNavigationAllowed(rawUrl: string): boolean {
    if (rawUrl.startsWith('file://')) return true;
    if (VITE_DEV_SERVER_URL && rawUrl.startsWith(VITE_DEV_SERVER_URL)) return true;
    return false;
}

function createWindow() {
    const preloadName = fsSync.existsSync(path.join(__dirname, 'preload.mjs')) ? 'preload.mjs' : 'preload.js';
    win = new BrowserWindow({
        width: 1400,
        height: 900,
        title: "Jira Dashboard",
        icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
        webPreferences: {
            preload: path.join(__dirname, preloadName),
            // C3: webSecurity 활성화. 외부 이미지 트래킹/XSS 표면 차단.
            webSecurity: true,
            nodeIntegration: false,
            contextIsolation: true,
            // v1.0.49 보안 강화 (Electron 보안 체크리스트):
            sandbox: true,                       // preload도 sandbox 안에서 실행
            allowRunningInsecureContent: false,  // mixed content 차단
            experimentalFeatures: false,         // 실험적 web API 차단
        },
    });

    Menu.setApplicationMenu(null);

    // v1.0.49: window.open / target=_blank 차단 + 화이트리스트만 외부 브라우저로 위임
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isExternalUrlAllowed(url)) {
            void shell.openExternal(url);
        } else {
            console.warn(`[main] blocked window.open to non-whitelisted URL: ${url}`);
        }
        return { action: 'deny' };
    });

    // v1.0.49: navigate / redirect 가로채기 — 내부 진입 외 모두 차단
    win.webContents.on('will-navigate', (event, url) => {
        if (!isInternalNavigationAllowed(url)) {
            event.preventDefault();
            if (isExternalUrlAllowed(url)) {
                void shell.openExternal(url);
            } else {
                console.warn(`[main] blocked will-navigate to non-whitelisted URL: ${url}`);
            }
        }
    });
    win.webContents.on('will-redirect', (event, url) => {
        if (!isInternalNavigationAllowed(url)) {
            event.preventDefault();
            console.warn(`[main] blocked will-redirect to non-whitelisted URL: ${url}`);
        }
    });

    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(process.env.DIST || '', 'index.html'))
    }
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
        win = null
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

/**
 * C3: Content-Security-Policy 헤더 주입.
 * - dev: Vite HMR(WebSocket·eval) 허용
 * - prod: 자기 자신·로컬 프록시·Jira 첨부만 허용
 */
function installCspHeaders(): void {
    const isDev = !!process.env['VITE_DEV_SERVER_URL'];
    // Atlassian 아바타·아이콘 호스팅 도메인 (사이드바·멘션 검색 결과의 외부 이미지)
    const atlassianImg = "https://okestro.atlassian.net https://*.atlassian.net https://*.atl-paas.net";
    const csp = isDev
        ? "default-src 'self' http://localhost:5173 http://localhost:3001; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173; " +
          "style-src 'self' 'unsafe-inline'; " +
          `img-src 'self' http://localhost:3001 ${atlassianImg} data: blob:; ` +
          "connect-src 'self' http://localhost:3001 http://localhost:5173 ws://localhost:5173;"
        : "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline'; " +
          "style-src 'self' 'unsafe-inline'; " +
          `img-src 'self' http://localhost:3001 ${atlassianImg} data: blob:; ` +
          "connect-src 'self' http://localhost:3001;";

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...details.responseHeaders } as Record<string, string[] | string>;
        // 기존 CSP 제거 후 우리 정책 단일 적용
        for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === 'content-security-policy') delete headers[key];
        }
        headers['Content-Security-Policy'] = [csp];
        callback({ responseHeaders: headers as Record<string, string[]> });
    });
}

app.whenReady().then(async () => {
    await loadJiraConfig();
    installCspHeaders();

    // v1.0.27: 사용 중에는 시스템 절전 모드 진입 방지 — 장시간 idle 시 네트워크 끊김 방지.
    // 'prevent-app-suspension': 앱 백그라운드/스로틀링은 막지만 화면 끔(monitor sleep)은 허용.
    try {
        const blockerId = powerSaveBlocker.start('prevent-app-suspension');
        console.log('[main] powerSaveBlocker started:', blockerId);
    } catch (e) {
        console.warn('[main] powerSaveBlocker failed:', e);
    }

    ipcMain.handle('jira-config:get', () => Promise.resolve({ ...jiraConfig }));

    ipcMain.handle('jira-config:test', async (_event, credentials?: JiraConfig) => {
        const email = (credentials?.jiraEmail ?? jiraConfig.jiraEmail)?.trim();
        const token = (credentials?.jiraApiToken ?? jiraConfig.jiraApiToken)?.trim();
        if (!email || !token) {
            return { ok: false, message: '이메일과 API 토큰을 입력하세요.', status: 0 };
        }
        const authHeader = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
        const url = 'https://okestro.atlassian.net/rest/api/3/myself';
        try {
            const res = await axios.get(url, {
                headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
                timeout: 15000,
                validateStatus: () => true,
            });
            if (res.status === 200) {
                const name = (res.data as { displayName?: string })?.displayName ?? email;
                return { ok: true, message: `연결 성공: ${name}`, status: res.status };
            }
            if (res.status === 401) {
                return { ok: false, message: '인증 실패 (401). 이메일 또는 API 토큰을 확인하세요.', status: 401, detail: res.data };
            }
            if (res.status === 403) {
                return { ok: false, message: '접근 권한 없음 (403). API 토큰 권한을 확인하세요.', status: 403, detail: res.data };
            }
            return { ok: false, message: `Jira 응답 오류: ${res.status}`, status: res.status, detail: res.data };
        } catch (err: unknown) {
            const ax = err as { code?: string; message?: string; response?: { status?: number } };
            const msg = ax?.message ?? String(err);
            const status = ax?.response?.status;
            if (ax?.code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
                return { ok: false, message: '네트워크 연결 실패. 인터넷 및 방화벽을 확인하세요.', status: 0 };
            }
            if (ax?.code === 'ETIMEDOUT' || msg.includes('timeout')) {
                return { ok: false, message: '연결 시간 초과. 네트워크를 확인하세요.', status: 0 };
            }
            if (status === 401) {
                return { ok: false, message: '인증 실패 (401). 이메일 또는 API 토큰을 확인하세요.', status: 401 };
            }
            return { ok: false, message: msg || '연결 테스트 실패', status: status ?? 0 };
        }
    });

    /**
     * v1.0.49 (M2): 입력 검증 강화.
     *  - email: 8~256자, 단순 'a@b' 형식 (Jira는 OAuth 이메일 형식 강제)
     *  - token: 16~2048자 (Atlassian API 토큰은 통상 100자 이상)
     *  - 둘 중 하나라도 비어 있으면 reset 의도로 빈 저장 허용 (기존 동작 유지)
     */
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    ipcMain.handle('jira-config:set', async (_event, config: JiraConfig) => {
        if (config != null && typeof config !== 'object') {
            return { ok: false, message: 'invalid payload' };
        }
        const email = config?.jiraEmail != null ? String(config.jiraEmail).trim() : '';
        const token = config?.jiraApiToken != null ? String(config.jiraApiToken).trim() : '';

        // 둘 다 빈 값이면 reset (legacy 동작 유지)
        if (!email && !token) {
            return { ok: true };
        }

        if (email && (email.length < 5 || email.length > 256 || !EMAIL_RE.test(email))) {
            return { ok: false, message: '유효하지 않은 이메일 형식입니다.' };
        }
        if (token && (token.length < 8 || token.length > 2048)) {
            return { ok: false, message: 'API 토큰 길이가 유효하지 않습니다 (8~2048자).' };
        }
        if (email && token) {
            await saveJiraConfig({ jiraEmail: email, jiraApiToken: token });
        }
        return { ok: true };
    });

    startProxyServer();
    createWindow();
})
