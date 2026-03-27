const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3001;
const LOG_FILE = path.join(__dirname, 'proxy.log');

function logToFile(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

fs.writeFileSync(LOG_FILE, `--- Proxy Server log started at ${new Date().toISOString()} ---\n`);

/** Electron 과 동일한 JSON 형식 — 여러 경로에서 순서대로 시도 (저장소에 비밀 커밋 방지: 로컬 파일은 gitignore) */
function candidateCredentialFiles() {
    const list = [path.join(__dirname, 'jira-proxy-config.json')];
    if (process.platform === 'win32' && process.env.APPDATA) {
        list.push(path.join(process.env.APPDATA, 'Jira Dashboard', 'jira-config.json'));
    } else if (process.platform === 'darwin') {
        list.push(path.join(os.homedir(), 'Library', 'Application Support', 'Jira Dashboard', 'jira-config.json'));
    } else {
        list.push(path.join(os.homedir(), '.config', 'Jira Dashboard', 'jira-config.json'));
    }
    return list;
}

function loadJiraCredentials() {
    let email = (process.env.JIRA_EMAIL || '').trim();
    let token = (process.env.JIRA_API_TOKEN || '').trim();
    if (email && token) {
        return { email, token, source: '환경 변수' };
    }
    for (const p of candidateCredentialFiles()) {
        try {
            if (!fs.existsSync(p)) continue;
            const j = JSON.parse(fs.readFileSync(p, 'utf8'));
            const e = typeof j.jiraEmail === 'string' ? j.jiraEmail.trim() : '';
            const t = typeof j.jiraApiToken === 'string' ? j.jiraApiToken.trim() : '';
            if (e && t) {
                return { email: e, token: t, source: p };
            }
        } catch (err) {
            logToFile(`[CONFIG] 읽기 실패 ${p}: ${err.message}`);
        }
    }
    return { email: '', token: '', source: '' };
}

const creds = loadJiraCredentials();
const authHeader =
    creds.email && creds.token
        ? 'Basic ' + Buffer.from(`${creds.email}:${creds.token}`).toString('base64')
        : '';

if (!authHeader) {
    console.warn(
        '\n⚠️  Jira 인증 없음: JIRA_EMAIL/JIRA_API_TOKEN 또는\n' +
            '    jira-proxy-config.json / Electron용 jira-config.json(AppData·Application Support 등)을 설정하세요.\n' +
            '    브라우저(dev:web)는 이 프록시가 인증을 넣지 않으면 에픽 API가 401/빈 응답이 됩니다.\n'
    );
    logToFile('[CONFIG] 경고: 인증 정보 없음');
} else {
    const short = creds.source === '환경 변수' ? creds.source : path.basename(creds.source);
    console.log(`\n✅ Jira 프록시 인증 로드: ${short} (이메일: ${creds.email})\n`);
    logToFile(`[CONFIG] 인증 로드: ${creds.source}`);
}

app.use(cors());
app.use(express.json());

app.use('/api', async (req, res) => {
    const jiraPath = req.path.replace(/^\//, '/rest/api/3/');
    const jiraUrl = `https://okestro.atlassian.net${jiraPath}`;

    const isBinary = jiraPath.includes('/attachment/content/') || jiraPath.includes('/avatar/');

    logToFile(`[PROXY] ${req.method} ${req.originalUrl} -> ${jiraUrl} (Binary: ${isBinary})`);

    try {
        const response = await axios({
            method: req.method,
            url: jiraUrl,
            headers: {
                Authorization: authHeader,
                Accept: isBinary ? '*/*' : 'application/json',
            },
            data: req.body,
            params: req.query,
            responseType: isBinary ? 'arraybuffer' : 'json',
        });

        const contentType = response.headers['content-type'];
        res.setHeader('Content-Type', contentType || (isBinary ? 'image/png' : 'application/json'));

        logToFile(`[PROXY] ✓ ${response.status} ${jiraUrl} (Content-Type: ${contentType})`);

        if (isBinary) {
            res.send(Buffer.from(response.data));
        } else {
            res.status(response.status).json(response.data);
        }
    } catch (error) {
        logToFile(`[PROXY] ✗ Error: ${error.message}`);
        if (error.response) {
            res.status(error.response.status).send(error.response.data);
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`\n🚀 Jira Proxy Server is running!`);
    console.log(`   URL: http://127.0.0.1:${PORT}`);
    console.log(`   Proxying to: https://okestro.atlassian.net\n`);
});
