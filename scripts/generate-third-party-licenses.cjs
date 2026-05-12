#!/usr/bin/env node
/**
 * v1.0.38: 빌드 타임 third-party 라이선스 텍스트 자동 수집.
 *
 * - npx license-checker --production --json 으로 의존성 라이선스 정보 추출
 * - 각 패키지의 LICENSE 파일을 읽어 통합 텍스트 생성
 * - dist_electron/win-unpacked/THIRD-PARTY-LICENSES.txt 로 동봉 (electron-builder extraResources)
 *
 * 의무 충족:
 *   - MIT / ISC / BSD: 저작권 고지 + 라이선스 텍스트
 *   - Apache-2.0: + NOTICE 보존
 *   - CC-BY-3.0: Attribution
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'build', 'THIRD-PARTY-LICENSES.txt');
const NOTICE_OUTPUT = path.join(ROOT, 'build', 'THIRD-PARTY-NOTICES.txt');

console.log('[licenses] 의존성 라이선스 수집 중...');

// license-checker 실행
const json = execSync(
    `npx license-checker --production --json --excludePackages "01_jira_dash@1.0.38;01_jira_dash@1.0.37;01_jira_dash@1.0.36"`,
    { cwd: ROOT, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
);
const data = JSON.parse(json);

const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
console.log(`[licenses] 총 ${entries.length} 패키지 처리`);

// 라이선스 그룹 통계
const stats = {};
const noticeBlocks = [];
const licenseBlocks = [];

for (const [pkg, info] of entries) {
    const lic = info.licenses || 'UNKNOWN';
    stats[lic] = (stats[lic] ?? 0) + 1;

    // 라이선스 텍스트 로드
    let licenseText = '(라이선스 파일 없음)';
    if (info.licenseFile && fs.existsSync(info.licenseFile)) {
        try {
            licenseText = fs.readFileSync(info.licenseFile, 'utf-8').trim();
        } catch {
            licenseText = '(라이선스 파일 읽기 실패)';
        }
    }

    // NOTICE 파일 별도 수집 (Apache-2.0 의무)
    if (info.path) {
        const noticePath = path.join(info.path, 'NOTICE');
        const noticeMd = path.join(info.path, 'NOTICE.md');
        const noticeTxt = path.join(info.path, 'NOTICE.txt');
        for (const np of [noticePath, noticeMd, noticeTxt]) {
            if (fs.existsSync(np)) {
                try {
                    const noticeText = fs.readFileSync(np, 'utf-8').trim();
                    if (noticeText) {
                        noticeBlocks.push(`### ${pkg} ###\n\n${noticeText}\n`);
                    }
                } catch { /* skip */ }
                break;
            }
        }
    }

    licenseBlocks.push(
        `=================================================================\n` +
        `Package: ${pkg}\n` +
        `License: ${lic}\n` +
        (info.repository ? `Repository: ${info.repository}\n` : '') +
        (info.publisher ? `Publisher: ${info.publisher}\n` : '') +
        `=================================================================\n\n` +
        licenseText
    );
}

// 헤더 + 통계
const header =
    `Jira Dashboard — Third-Party Licenses\n` +
    `Generated: ${new Date().toISOString()}\n` +
    `Total packages: ${entries.length}\n\n` +
    `License Distribution:\n` +
    Object.entries(stats)
        .sort(([, a], [, b]) => b - a)
        .map(([l, c]) => `  ${l}: ${c}`)
        .join('\n') +
    `\n\n` +
    `=================================================================\n` +
    `이 문서는 Jira Dashboard에 포함된 오픈소스 의존성의 라이선스 사본입니다.\n` +
    `각 라이선스의 의무(저작권 고지·NOTICE·Attribution)를 충족하기 위해 동봉됩니다.\n` +
    `Apache-2.0 패키지의 NOTICE는 별도 파일(THIRD-PARTY-NOTICES.txt) 참조.\n` +
    `=================================================================\n\n`;

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, header + licenseBlocks.join('\n\n'), 'utf-8');
console.log(`[licenses] 출력: ${OUTPUT} (${(fs.statSync(OUTPUT).size / 1024).toFixed(1)} KB)`);

// NOTICE 별도 파일
if (noticeBlocks.length > 0) {
    const noticeHeader =
        `Jira Dashboard — Third-Party NOTICES (Apache-2.0 §4 의무)\n` +
        `Generated: ${new Date().toISOString()}\n` +
        `Total NOTICE files: ${noticeBlocks.length}\n\n` +
        `=================================================================\n\n`;
    fs.writeFileSync(NOTICE_OUTPUT, noticeHeader + noticeBlocks.join('\n\n'), 'utf-8');
    console.log(`[licenses] NOTICE: ${NOTICE_OUTPUT} (${(fs.statSync(NOTICE_OUTPUT).size / 1024).toFixed(1)} KB)`);
} else {
    fs.writeFileSync(NOTICE_OUTPUT, 'No third-party NOTICE files found.\n', 'utf-8');
}

console.log('[licenses] 완료.');
