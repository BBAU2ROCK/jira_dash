/**
 * 로컬 Jira 프록시용 설정 파일 생성 (최초 1회)
 * - jira-proxy-config.json 이 없으면 jira-proxy-config.example.json 을 복사합니다.
 * - 복사 후 이메일·API 토큰을 반드시 수정하세요.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const target = path.join(root, 'jira-proxy-config.json');
const example = path.join(root, 'jira-proxy-config.example.json');

if (fs.existsSync(target)) {
    console.log('[setup-jira-config] jira-proxy-config.json already exists — skipped.');
    process.exit(0);
}

if (!fs.existsSync(example)) {
    console.error('[setup-jira-config] Missing jira-proxy-config.example.json');
    process.exit(1);
}

fs.copyFileSync(example, target);
console.log('[setup-jira-config] Created jira-proxy-config.json from example.');
console.log('[setup-jira-config] Edit jiraEmail and jiraApiToken (Atlassian API token).');
console.log('[setup-jira-config] File is gitignored — do not commit secrets.');
