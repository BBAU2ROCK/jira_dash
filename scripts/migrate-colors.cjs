/**
 * v1.0.23 — Hard-code Tailwind 색상 일괄 마이그레이션 스크립트.
 * 일회성 도구. 실행 후 .gitignore에 추가하거나 수동 삭제.
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

const REPLACEMENTS = [
    [/\btext-slate-(50|100|200)\b/g, 'text-foreground'],
    [/\btext-slate-(300|400|500)\b/g, 'text-muted-foreground'],
    [/\btext-slate-600\b/g, 'text-foreground/80'],
    [/\btext-slate-700\b/g, 'text-foreground/90'],
    [/\btext-slate-(800|900)\b/g, 'text-foreground'],
    [/\btext-gray-(50|100|200)\b/g, 'text-foreground'],
    [/\btext-gray-(300|400|500)\b/g, 'text-muted-foreground'],
    [/\btext-gray-600\b/g, 'text-foreground/80'],
    [/\btext-gray-700\b/g, 'text-foreground/90'],
    [/\btext-gray-(800|900)\b/g, 'text-foreground'],
    [/\bbg-white\b/g, 'bg-card'],
    [/\bbg-slate-50\/50\b/g, 'bg-muted/30'],
    [/\bbg-slate-50\b/g, 'bg-muted/40'],
    [/\bbg-slate-100\/50\b/g, 'bg-muted/40'],
    [/\bbg-slate-100\b/g, 'bg-muted/60'],
    [/\bbg-slate-200\b/g, 'bg-muted'],
    [/\bbg-gray-50\b/g, 'bg-muted/40'],
    [/\bbg-gray-100\b/g, 'bg-muted/60'],
    [/\bbg-gray-200\b/g, 'bg-muted'],
    [/\bborder-slate-100\b/g, 'border-border/50'],
    [/\bborder-slate-(200|300)\b/g, 'border-border'],
    [/\bborder-gray-100\b/g, 'border-border/50'],
    [/\bborder-gray-(200|300)\b/g, 'border-border'],
    [/\bhover:bg-slate-50\b/g, 'hover:bg-accent/40'],
    [/\bhover:bg-slate-100\b/g, 'hover:bg-accent'],
    [/\bhover:bg-gray-50\b/g, 'hover:bg-accent/40'],
    [/\bhover:bg-gray-100\b/g, 'hover:bg-accent'],
    [/\bhover:text-slate-(700|800|900)\b/g, 'hover:text-foreground'],
    [/\bhover:text-gray-(700|800|900)\b/g, 'hover:text-foreground'],
    [/\bdivide-slate-100\b/g, 'divide-border/50'],
    [/\bdivide-slate-200\b/g, 'divide-border'],
    [/\bdivide-gray-100\b/g, 'divide-border/50'],
    [/\bdivide-gray-200\b/g, 'divide-border'],
];

let totalReplacements = 0;
let totalFiles = 0;
for (const file of candidates) {
    let content = fs.readFileSync(file, 'utf8');
    const orig = content;
    let replaced = 0;
    for (const [pattern, replacement] of REPLACEMENTS) {
        const matches = content.match(pattern);
        if (matches) {
            replaced += matches.length;
            content = content.replace(pattern, replacement);
        }
    }
    if (content !== orig) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`  ${file}: ${replaced}`);
        totalReplacements += replaced;
        totalFiles++;
    }
}
console.log(`\nTotal: ${totalReplacements} replacements across ${totalFiles} files.`);
