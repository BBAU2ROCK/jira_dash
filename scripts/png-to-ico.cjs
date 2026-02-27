/**
 * build/icon.png → build/icon.ico (NSIS 및 Win exe 아이콘용)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const pngPath = path.join(projectRoot, 'build', 'icon.png');
const icoPath = path.join(projectRoot, 'build', 'icon.ico');

if (!fs.existsSync(pngPath)) {
    console.warn('build/icon.png not found, skipping ico generation');
    process.exit(0);
}

try {
    const bin = path.join(projectRoot, 'node_modules', 'png-to-ico', 'bin', 'cli.js');
    const buf = execSync(`node "${bin}" "${pngPath}"`, { encoding: null, cwd: projectRoot });
    fs.writeFileSync(icoPath, buf);
    console.log('Created build/icon.ico');
} catch (err) {
    console.error('png-to-ico failed:', err.message);
    process.exit(1);
}
