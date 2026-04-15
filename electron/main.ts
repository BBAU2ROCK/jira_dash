import { app, BrowserWindow, Menu, ipcMain, session } from 'electron'
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
        const parsed = JSON.parse(raw) as JiraConfig;
        if (parsed && typeof parsed.jiraEmail === 'string' && typeof parsed.jiraApiToken === 'string') {
            jiraConfig = {
                jiraEmail: parsed.jiraEmail.trim(),
                jiraApiToken: parsed.jiraApiToken.trim(),
            };
            return jiraConfig;
        }
    } catch {
        // no file or invalid
    }
    return jiraConfig;
}

/** 로컬에 상시 저장. 쓰기 성공 시에만 메모리 반영하여 사이드 이펙트 방지. */
async function saveJiraConfig(config: JiraConfig): Promise<void> {
    const email = typeof config.jiraEmail === 'string' ? config.jiraEmail.trim() : '';
    const token = typeof config.jiraApiToken === 'string' ? config.jiraApiToken.trim() : '';
    const p = getConfigPath();
    await fs.mkdir(path.dirname(p), { recursive: true });
    const payload = JSON.stringify({ jiraEmail: email, jiraApiToken: token }, null, 2);
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
        },
    });

    Menu.setApplicationMenu(null);

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

    ipcMain.handle('jira-config:set', async (_event, config: JiraConfig) => {
        const email = config?.jiraEmail != null ? String(config.jiraEmail).trim() : '';
        const token = config?.jiraApiToken != null ? String(config.jiraApiToken).trim() : '';
        if (email && token) {
            await saveJiraConfig({ jiraEmail: email, jiraApiToken: token });
        }
        return { ok: true };
    });

    startProxyServer();
    createWindow();
})
