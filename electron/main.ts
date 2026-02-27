import { app, BrowserWindow, Menu } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-ignore
import express from 'express'
import axios from 'axios'
// @ts-ignore
import cors from 'cors'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

// --- Jira Proxy Server Integration ---
// Set JIRA_EMAIL and JIRA_API_TOKEN via environment variables (e.g. .env or system env) for security.
const proxyApp = express();
const PROXY_PORT = 3001;
const JIRA_EMAIL = process.env.JIRA_EMAIL ?? '';
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN ?? '';
const authHeader = JIRA_EMAIL && JIRA_API_TOKEN ? 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64') : '';

proxyApp.use(cors());
proxyApp.use(express.json());

proxyApp.use('/api', async (req: any, res: any) => {
    const jiraPath = req.path.replace(/^\//, '/rest/api/3/');
    const jiraUrl = `https://okestro.atlassian.net${jiraPath}`;

    // 이미지 등 바이너리 데이터 여부 확인
    const isBinary = jiraPath.includes('/attachment/content/') || jiraPath.includes('/avatar/');

    console.log(`[ELECTRON PROXY] ${req.method} ${req.originalUrl} -> ${jiraUrl} (Binary: ${isBinary})`);

    try {
        const response = await axios({
            method: req.method,
            url: jiraUrl,
            headers: {
                'Authorization': authHeader,
                'Accept': isBinary ? '*/*' : 'application/json',
            },
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
// -------------------------------------

let win: BrowserWindow | null
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
    win = new BrowserWindow({
        width: 1400,
        height: 900,
        title: "Jira Dashboard",
        icon: path.join(process.env.VITE_PUBLIC || '', 'electron-vite.svg'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Remove menu bar for a cleaner look
    Menu.setApplicationMenu(null);

    // Test active push message to Renderer-process.
    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
    } else {
        // win.loadFile('dist/index.html')
        win.loadFile(path.join(process.env.DIST || '', 'index.html'))
    }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
        win = null
    }
})

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.whenReady().then(() => {
    startProxyServer();
    createWindow();
})
