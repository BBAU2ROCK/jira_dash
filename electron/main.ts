import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
// @ts-ignore
import express from 'express'
import axios from 'axios'
// @ts-ignore
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

// --- Jira Proxy ---
const proxyApp = express();
const PROXY_PORT = 3001;

proxyApp.use(cors());
proxyApp.use(express.json());

proxyApp.use('/api', async (req: any, res: any) => {
    const jiraPath = req.path.replace(/^\//, '/rest/api/3/');
    const jiraUrl = `https://okestro.atlassian.net${jiraPath}`;

    const isBinary = jiraPath.includes('/attachment/content/') || jiraPath.includes('/avatar/');

    console.log(`[ELECTRON PROXY] ${req.method} ${req.originalUrl} -> ${jiraUrl} (Binary: ${isBinary})`);

    const authHeader = getAuthHeader();

    const headers: Record<string, string> = {
        'Authorization': authHeader,
        'Accept': isBinary ? '*/*' : 'application/json',
    };
    if (req.body !== undefined && req.body !== null && req.method !== 'GET') {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await axios({
            method: req.method,
            url: jiraUrl,
            headers,
            data: req.body,
            params: req.query,
            responseType: isBinary ? 'arraybuffer' : 'json',
        });

        const contentType = response.headers['content-type'];
        res.setHeader('Content-Type', contentType || (isBinary ? 'image/png' : 'application/json'));

        console.log(`[ELECTRON PROXY] ✓ ${response.status} ${jiraUrl} (Content-Type: ${contentType})`);

        if (isBinary) {
            res.send(Buffer.from(response.data));
        } else {
            res.status(response.status).json(response.data);
        }
    } catch (error: any) {
        console.error(`[ELECTRON PROXY] ✗ Error: ${error.message}`);
        if (error.response) {
            res.status(error.response.status).send(error.response.data);
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

function startProxyServer() {
    proxyApp.listen(PROXY_PORT, () => {
        console.log(`🚀 Internal Jira Proxy Server running on port ${PROXY_PORT}`);
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
            webSecurity: false,
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

app.whenReady().then(async () => {
    await loadJiraConfig();

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
