/**
 * IGMU-538 하위 309 task의 풍부한 메타데이터를 Jira REST API에서 직접 가져와
 * 단일 JSON으로 저장 — WBS xlsx 생성용 입력.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const cfgPath = path.join(process.env.APPDATA, 'Jira Dashboard/jira-config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const host = cfg.jiraHost || 'okestro.atlassian.net';
const auth = Buffer.from(`${cfg.jiraEmail}:${cfg.jiraApiToken}`).toString('base64');

const FIELDS = [
    'summary', 'assignee', 'reporter', 'status', 'priority', 'issuetype',
    'created', 'updated', 'duedate', 'resolutiondate',
    'customfield_11481', // 계획 시작
    'customfield_11484', // 실제 시작
    'customfield_11624', // 난이도
    'customfield_11482', // 서브담당자
    'parent',
];

async function fetchAll() {
    const all = [];
    let nextPageToken = undefined;
    let page = 0;
    while (true) {
        page++;
        const payload = {
            jql: 'parent = IGMU-538 ORDER BY created ASC',
            fields: FIELDS,
            maxResults: 100,
        };
        if (nextPageToken) payload.nextPageToken = nextPageToken;

        const res = await axios.post(`https://${host}/rest/api/3/search/jql`, payload, {
            headers: {
                Authorization: `Basic ${auth}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });

        const issues = res.data.issues || [];
        all.push(...issues);
        console.log(`  Page ${page}: +${issues.length} (total ${all.length})`);

        nextPageToken = res.data.nextPageToken;
        const isLast = res.data.isLast === true || !nextPageToken || issues.length < 100;
        if (isLast) break;
        if (page > 10) {
            console.warn('  Page guard hit (>10), stop');
            break;
        }
    }
    return all;
}

(async () => {
    try {
        console.log('Fetching IGMU-538 children from Jira...');
        const issues = await fetchAll();
        console.log(`✓ Total fetched: ${issues.length}`);

        // Slim down to essential fields for WBS
        const slim = issues.map(i => {
            const f = i.fields;
            const sum = (f.summary || '').trim();
            // [B/E] or [F/E] prefix detection
            const m = sum.match(/^\[(B\/E|F\/E)\]\s*(.+)$/);
            const layer = m ? m[1] : '';
            const restSummary = m ? m[2].trim() : sum;
            // Split by " - " into Depths
            const parts = restSummary.split(/\s*-\s*/).map(s => s.trim()).filter(Boolean);

            return {
                key: i.key,
                summary: sum,
                layer, // B/E or F/E or ''
                d1: parts[0] || '',
                d2: parts[1] || '',
                d3: parts[2] || '',
                d4: parts[3] || '',
                d5: parts.slice(4).join(' - ') || '',
                assignee: f.assignee?.displayName || '',
                reporter: f.reporter?.displayName || '',
                status: f.status?.name || '',
                priority: f.priority?.name || '',
                issuetype: f.issuetype?.name || '',
                created: f.created || '',
                duedate: f.duedate || '',
                resolutiondate: f.resolutiondate || '',
                plannedStart: f.customfield_11481 || '',
                actualStart: f.customfield_11484 || '',
                difficulty: f.customfield_11624?.value || '',
                subAssignees: (f.customfield_11482 || []).map(u => u.displayName || u.name || '').filter(Boolean).join(', '),
            };
        });

        const out = path.join(__dirname, '..', '.igmu538-children.json');
        fs.writeFileSync(out, JSON.stringify(slim, null, 2), 'utf8');
        console.log(`✓ Saved to ${out}`);
        // Distribution
        const byAssignee = {};
        const byDifficulty = {};
        const byLayer = {};
        for (const t of slim) {
            byAssignee[t.assignee || '미배정'] = (byAssignee[t.assignee || '미배정'] || 0) + 1;
            byDifficulty[t.difficulty || '미설정'] = (byDifficulty[t.difficulty || '미설정'] || 0) + 1;
            byLayer[t.layer || '기타'] = (byLayer[t.layer || '기타'] || 0) + 1;
        }
        console.log('\nBy assignee:', JSON.stringify(byAssignee, null, 2));
        console.log('\nBy difficulty:', JSON.stringify(byDifficulty, null, 2));
        console.log('\nBy layer:', JSON.stringify(byLayer, null, 2));
    } catch (e) {
        console.error('FAIL:', e.message, e.response?.data ? JSON.stringify(e.response.data).slice(0, 500) : '');
        process.exit(1);
    }
})();
