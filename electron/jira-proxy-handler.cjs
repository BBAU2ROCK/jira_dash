/**
 * Jira REST v3 프록시 미들웨어 팩토리.
 * - electron/main.ts (내장 프록시) 와 proxy-server.cjs (웹 dev 프록시) 양쪽에서 공유.
 * - CommonJS로 작성하여 두 환경에서 모두 require/import 가능.
 *
 * @typedef {Object} JiraProxyOptions
 * @property {() => string} getAuthHeader  Basic 인증 헤더 문자열을 반환 (없으면 빈 문자열).
 * @property {(message: string) => void} [log]  진단 로그 콜백 (선택).
 * @property {string} [baseUrl]  Jira 인스턴스 base URL. 기본 'https://okestro.atlassian.net'.
 */

const axios = require('axios');

const DEFAULT_BASE_URL = 'https://okestro.atlassian.net';

/**
 * Express 미들웨어를 생성합니다.
 * 마운트 경로에서 떨어진 path를 `/rest/api/3/...`로 매핑해 Jira에 프록시.
 * @param {JiraProxyOptions} options
 */
function createJiraProxyMiddleware(options) {
    const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    const log = options.log || (() => {});

    return async function jiraProxyHandler(req, res) {
        const jiraPath = req.path.replace(/^\//, '/rest/api/3/');
        const jiraUrl = `${baseUrl}${jiraPath}`;
        const isBinary = jiraPath.includes('/attachment/content/') || jiraPath.includes('/avatar/');
        const authHeader = options.getAuthHeader();

        log(`[PROXY] ${req.method} ${req.originalUrl} -> ${jiraUrl} (Binary: ${isBinary})`);

        const headers = {
            Authorization: authHeader,
            Accept: isBinary ? '*/*' : 'application/json',
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
            log(`[PROXY] OK ${response.status} ${jiraUrl}`);

            if (isBinary) {
                res.send(Buffer.from(response.data));
            } else {
                res.status(response.status).json(response.data);
            }
        } catch (error) {
            const message = error && error.message ? error.message : String(error);
            log(`[PROXY] ERR ${message}`);
            if (error && error.response) {
                res.status(error.response.status).send(error.response.data);
            } else {
                res.status(500).json({ error: message });
            }
        }
    };
}

module.exports = { createJiraProxyMiddleware };
