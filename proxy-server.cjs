const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const LOG_FILE = path.join(__dirname, 'proxy.log');

function logToFile(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

// Clear log on start
fs.writeFileSync(LOG_FILE, `--- Proxy Server log started at ${new Date().toISOString()} ---\n`);

// Jira credentials: set JIRA_EMAIL, JIRA_API_TOKEN in environment
const JIRA_EMAIL = process.env.JIRA_EMAIL || '';
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || '';
const authHeader = (JIRA_EMAIL && JIRA_API_TOKEN) ? 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64') : '';

app.use(cors());
app.use(express.json());

// Proxy all /api requests to Jira - Fixed route pattern
app.use('/api', async (req, res) => {
    const jiraPath = req.path.replace(/^\//, '/rest/api/3/');
    const jiraUrl = `https://okestro.atlassian.net${jiraPath}`;

    // 이미지 등 바이너리 데이터 여부 확인
    const isBinary = jiraPath.includes('/attachment/content/') || jiraPath.includes('/avatar/');

    logToFile(`[PROXY] ${req.method} ${req.originalUrl} -> ${jiraUrl} (Binary: ${isBinary})`);

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

app.listen(PORT, () => {
    console.log(`\n🚀 Jira Proxy Server is running!`);
    console.log(`   URL: http://localhost:${PORT}`);
    console.log(`   Proxying to: https://okestro.atlassian.net`);
    console.log(`\n✅ Now open http://localhost:5173 in your browser`);
    console.log(`   The Jira Dashboard should load without CORS errors!\n`);
});
