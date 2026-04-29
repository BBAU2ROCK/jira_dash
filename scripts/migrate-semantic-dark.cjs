/**
 * v1.0.23 — 의미 색상(semantic colors)에 dark variant 자동 추가.
 *
 * 패턴:
 *   bg-{color}-50  → bg-{color}-50 dark:bg-{color}-950/30
 *   text-{color}-{700|800|900} → 추가 dark:text-{color}-300
 *   border-{color}-{200|300}   → 추가 dark:border-{color}-900/60
 *
 * 이미 dark: 변형이 같은 className 안에 있으면 중복 방지 (best-effort).
 */
const fs = require('fs');
const path = require('path');

function walk(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
}

const candidates = [...walk('src/components'), ...walk('src/pages')];

const COLORS = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const COLOR_RE = COLORS.join('|');

// bg-{color}-50/50 → +dark
const BG_LIGHT_50_50 = new RegExp(`\\bbg-(${COLOR_RE})-50/50\\b`, 'g');
const BG_LIGHT_50 = new RegExp(`\\bbg-(${COLOR_RE})-50\\b`, 'g');
// text-{color}-{700-900}
const TEXT_DARK = new RegExp(`\\btext-(${COLOR_RE})-(700|800|900)\\b`, 'g');
// border-{color}-{200|300}
const BORDER_LIGHT = new RegExp(`\\bborder-(${COLOR_RE})-(200|300)\\b`, 'g');

let totalReplacements = 0;
let totalFiles = 0;

for (const file of candidates) {
    let content = fs.readFileSync(file, 'utf8');
    const orig = content;
    let replaced = 0;

    // bg-{color}-50/50
    content = content.replace(BG_LIGHT_50_50, (match, color) => {
        // 이미 dark variant 있나 best-effort 체크 (같은 string literal 내에서)
        if (content.includes(`dark:bg-${color}-950`) && content.indexOf(match) > content.indexOf(`dark:bg-${color}-950`) - 200) {
            return match;
        }
        replaced++;
        return `bg-${color}-50/50 dark:bg-${color}-950/20`;
    });

    // bg-{color}-50
    content = content.replace(BG_LIGHT_50, (match, color) => {
        replaced++;
        return `bg-${color}-50 dark:bg-${color}-950/30`;
    });

    // text-{color}-{700|800|900}
    content = content.replace(TEXT_DARK, (match, color, weight) => {
        replaced++;
        return `text-${color}-${weight} dark:text-${color}-300`;
    });

    // border-{color}-{200|300}
    content = content.replace(BORDER_LIGHT, (match, color, weight) => {
        replaced++;
        return `border-${color}-${weight} dark:border-${color}-900/60`;
    });

    if (content !== orig) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`  ${file}: ${replaced}`);
        totalReplacements += replaced;
        totalFiles++;
    }
}
console.log(`\nTotal: ${totalReplacements} replacements across ${totalFiles} files.`);
