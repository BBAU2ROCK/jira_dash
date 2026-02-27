/**
 * 설치 파일 빌드 전 정리: electron-builder가 재사용하는 폴더(win-unpacked 등)만 삭제.
 * - dist_electron 전체를 지우지 않아, 기존 버전별 exe 파일은 유지됨.
 * - win-unpacked(언팩된 앱)만 제거하여 다음 빌드 시 "Access is denied" 방지.
 * 실행 중인 Jira Dashboard 앱이 있으면 win-unpacked 삭제가 실패할 수 있으므로,
 * 빌드 전에 앱을 종료한 뒤 실행하세요.
 */
const fs = require('fs');
const path = require('path');

const distElectron = path.join(__dirname, '..', 'dist_electron');
if (!fs.existsSync(distElectron)) {
    process.exit(0);
}

// 삭제할 하위 항목만 제거 (버전별 exe 등 루트 파일은 유지)
const toRemove = [
    path.join(distElectron, 'win-unpacked'),  // Windows portable 언팩 폴더 (잠금 발생 위치)
    path.join(distElectron, 'mac'),            // Mac 빌드 결과(있을 경우)
];
let removed = 0;
for (const dir of toRemove) {
    if (!fs.existsSync(dir)) continue;
    try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
        console.log('Removed:', path.relative(distElectron, dir));
        removed++;
    } catch (err) {
        console.warn('Remove failed (close running app and retry):', dir, err.message);
        process.exit(1);
    }
}
if (removed === 0) {
    console.log('Nothing to clean');
}
