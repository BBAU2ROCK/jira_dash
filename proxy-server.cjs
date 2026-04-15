const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { createJiraProxyMiddleware } = require('./electron/jira-proxy-handler.cjs');

const app = express();
const PORT = 3001;
const LOG_FILE = path.join(__dirname, 'proxy.log');
const LOG_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const JIRA_BASE_URL = 'https://okestro.atlassian.net';
const LOCAL_CRED_FILE = path.join(__dirname, 'jira-proxy-config.json');

function logToFile(message) {
    try {
        // L1: 5MB 초과 시 1회 truncate (간단한 회전)
        if (fs.existsSync(LOG_FILE)) {
            const { size } = fs.statSync(LOG_FILE);
            if (size > LOG_MAX_BYTES) {
                fs.writeFileSync(LOG_FILE, `--- Proxy Server log truncated at ${new Date().toISOString()} (was ${size} bytes) ---\n`);
            }
        }
        const timestamp = new Date().toISOString();
        fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
    } catch {
        // 디스크/권한 오류는 조용히 무시
    }
}

logToFile(`--- Proxy Server log session started at ${new Date().toISOString()} ---`);

/** Electron 과 동일한 JSON 형식 — 여러 경로에서 순서대로 시도 (저장소에 비밀 커밋 방지: 로컬 파일은 gitignore) */
function candidateCredentialFiles() {
    const list = [LOCAL_CRED_FILE];
    if (process.platform === 'win32' && process.env.APPDATA) {
        list.push(path.join(process.env.APPDATA, 'Jira Dashboard', 'jira-config.json'));
    } else if (process.platform === 'darwin') {
        list.push(path.join(os.homedir(), 'Library', 'Application Support', 'Jira Dashboard', 'jira-config.json'));
    } else {
        list.push(path.join(os.homedir(), '.config', 'Jira Dashboard', 'jira-config.json'));
    }
    return list;
}

/** example/placeholder 자격증명을 무효로 처리 → 다음 후보로 fallback */
function isPlaceholderCreds(email, token) {
    if (!email || !token) return true;
    const e = email.toLowerCase();
    if (e.includes('example.com') || e === 'your@email.com' || e.startsWith('your-')) return true;
    if (token === 'paste-api-token-here' || token.toLowerCase().startsWith('paste-')) return true;
    return false;
}

function loadJiraCredentials() {
    let email = (process.env.JIRA_EMAIL || '').trim();
    let token = (process.env.JIRA_API_TOKEN || '').trim();
    if (email && token && !isPlaceholderCreds(email, token)) {
        return { email, token, source: '환경 변수' };
    }
    for (const p of candidateCredentialFiles()) {
        try {
            if (!fs.existsSync(p)) continue;
            const j = JSON.parse(fs.readFileSync(p, 'utf8'));
            const e = typeof j.jiraEmail === 'string' ? j.jiraEmail.trim() : '';
            const t = typeof j.jiraApiToken === 'string' ? j.jiraApiToken.trim() : '';
            if (e && t && !isPlaceholderCreds(e, t)) {
                return { email: e, token: t, source: p };
            }
            if (e && t && isPlaceholderCreds(e, t)) {
                logToFile(`[CONFIG] ${p}: example placeholder 감지 — 다음 후보로 진행`);
            }
        } catch (err) {
            logToFile(`[CONFIG] 읽기 실패 ${p}: ${err.message}`);
        }
    }
    return { email: '', token: '', source: '' };
}

// let — admin endpoint에서 갱신 가능
let creds = loadJiraCredentials();
let authHeader =
    creds.email && creds.token
        ? 'Basic ' + Buffer.from(`${creds.email}:${creds.token}`).toString('base64')
        : '';

function buildAuthHeader(email, token) {
    return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

if (!authHeader) {
    console.warn(
        '\n⚠️  Jira 인증 없음: JIRA_EMAIL/JIRA_API_TOKEN 또는\n' +
            '    jira-proxy-config.json / Electron용 jira-config.json(AppData·Application Support 등)을 설정하세요.\n' +
            '    브라우저(dev:web) 우상단 [설정] → 이메일/토큰 입력으로 즉시 적용 가능합니다.\n'
    );
    logToFile('[CONFIG] 경고: 인증 정보 없음');
} else {
    const short = creds.source === '환경 변수' ? creds.source : path.basename(creds.source);
    console.log(`\n✅ Jira 프록시 인증 로드: ${short} (이메일: ${creds.email})\n`);
    logToFile(`[CONFIG] 인증 로드: ${creds.source}`);
}

app.use(cors());
app.use(express.json());

// ─── /admin/auth: 웹 모드에서 자격증명을 즉시 변경/테스트 ────────────────
//   GET  /admin/auth          → 현재 자격증명 상태 (이메일, source — 토큰 비공개)
//   POST /admin/auth/test     → body로 받은 임시 자격증명을 /myself로 검증
//   POST /admin/auth          → body 자격증명을 메모리 + 로컬 파일에 저장
//                               성공 시 다음 /api/* 호출부터 즉시 새 자격증명 사용
app.get('/admin/auth', (req, res) => {
    res.json({
        configured: !!authHeader,
        email: creds.email || '',
        source: creds.source || '',
    });
});

app.post('/admin/auth/test', async (req, res) => {
    const body = req.body || {};
    const e = typeof body.jiraEmail === 'string' ? body.jiraEmail.trim() : '';
    const t = typeof body.jiraApiToken === 'string' ? body.jiraApiToken.trim() : '';
    if (!e || !t) {
        return res.json({ ok: false, message: '이메일과 API 토큰을 모두 입력하세요.', status: 0 });
    }
    if (isPlaceholderCreds(e, t)) {
        return res.json({ ok: false, message: '예시 placeholder 값입니다. 실제 값을 입력하세요.', status: 0 });
    }
    try {
        const r = await axios.get(`${JIRA_BASE_URL}/rest/api/3/myself`, {
            headers: { Authorization: buildAuthHeader(e, t), Accept: 'application/json' },
            timeout: 15000,
            validateStatus: () => true,
        });
        if (r.status === 200) {
            const name = (r.data && r.data.displayName) || e;
            return res.json({ ok: true, message: `연결 성공: ${name}`, status: 200 });
        }
        if (r.status === 401) {
            return res.json({ ok: false, message: '인증 실패 (401). 이메일 또는 API 토큰을 확인하세요.', status: 401 });
        }
        if (r.status === 403) {
            return res.json({ ok: false, message: '접근 권한 없음 (403). API 토큰 권한을 확인하세요.', status: 403 });
        }
        return res.json({ ok: false, message: `Jira 응답 오류: ${r.status}`, status: r.status });
    } catch (err) {
        const code = err && err.code;
        if (code === 'ECONNREFUSED') {
            return res.json({ ok: false, message: '네트워크 연결 실패. 인터넷·방화벽을 확인하세요.', status: 0 });
        }
        if (code === 'ETIMEDOUT' || (err && err.message || '').includes('timeout')) {
            return res.json({ ok: false, message: '연결 시간 초과. 네트워크를 확인하세요.', status: 0 });
        }
        return res.json({ ok: false, message: (err && err.message) || '연결 테스트 실패', status: 0 });
    }
});

app.post('/admin/auth', (req, res) => {
    const body = req.body || {};
    const e = typeof body.jiraEmail === 'string' ? body.jiraEmail.trim() : '';
    const t = typeof body.jiraApiToken === 'string' ? body.jiraApiToken.trim() : '';
    if (!e || !t) {
        return res.status(400).json({ ok: false, message: '이메일과 API 토큰을 모두 입력하세요.' });
    }
    if (isPlaceholderCreds(e, t)) {
        return res.status(400).json({ ok: false, message: '예시 placeholder 값은 저장할 수 없습니다.' });
    }
    creds = { email: e, token: t, source: 'web admin (jira-proxy-config.json)' };
    authHeader = buildAuthHeader(e, t);
    try {
        fs.writeFileSync(LOCAL_CRED_FILE, JSON.stringify({ jiraEmail: e, jiraApiToken: t }, null, 2), 'utf8');
        logToFile(`[CONFIG] /admin/auth 저장 완료 (이메일: ${e})`);
        console.log(`\n🔐 자격증명 갱신: ${e} (${LOCAL_CRED_FILE})\n`);
        return res.json({ ok: true, message: '저장되었습니다.', email: e, source: creds.source });
    } catch (err) {
        // 디스크 저장 실패 — 메모리는 갱신됐으므로 세션 동안은 동작
        logToFile(`[CONFIG] 디스크 저장 실패: ${err.message}`);
        return res.json({
            ok: true,
            message: `메모리에는 적용되었으나 파일 저장 실패: ${err.message}. 서버 재시작 시 손실됩니다.`,
            email: e,
            source: 'memory only',
            persisted: false,
        });
    }
});

// M4: 공통 핸들러 사용 (electron/main.ts와 동일 로직 공유)
app.use(
    '/api',
    createJiraProxyMiddleware({
        getAuthHeader: () => authHeader,
        log: logToFile,
    })
);

app.listen(PORT, '127.0.0.1', () => {
    console.log(`\n🚀 Jira Proxy Server is running!`);
    console.log(`   URL: http://127.0.0.1:${PORT}`);
    console.log(`   Proxying to: ${JIRA_BASE_URL}\n`);
});
