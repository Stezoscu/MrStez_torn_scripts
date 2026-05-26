// ==UserScript==
// @name         Torn - Opponent Activity / Stats + BSP
// @namespace    steveo.faction.opponent.activity.bsp
// @version      1.2
// @updateURL    https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_war_scripts/opponent_review_script.js
// @downloadURL  https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_war_scripts/opponent_review_script.js
// @description  Shows opponent faction grouped by activity or stats, with best-effort BSP stats
// @author       MrStez / Ace
// @match        https://www.torn.com/factions.php*
// @match        https://www.torn.com/war.php*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    const PANEL_ID = 'steveo-opponent-activity-panel';
    const OUTPUT_ID = 'steveo-opponent-activity-output';
    const STATUS_ID = 'steveo-opponent-activity-status';
    const API_KEY_STORAGE = 'steveo_torn_api_key';
    const MINIMISED_KEY = 'steveo_opponent_activity_minimised';
    const DISPLAY_MODE_KEY = 'steveo_opponent_activity_display_mode';
    const GROUP_MODE_KEY = 'steveo_opponent_group_mode';

    const BSP_KEYS = {
        primaryApiKey: 'tdup.battleStatsPredictor.PrimaryAPIKey',
        predictionPrefix: 'tdup.battleStatsPredictor.cache.prediction.',
        tornStatsSpyPrefix: 'tdup.battleStatsPredictor.cache.spy_v2.tornstats_',
        yataSpyPrefix: 'tdup.battleStatsPredictor.cache.spy_v2.yata_',
        daysToUseSpies: 'tdup.battleStatsPredictor.DaysToUseTornStatsSpy'
    };

    const BSP_RESULT = {
        FAIL: 0,
        SUCCESS: 1,
        TOO_WEAK: 2,
        TOO_STRONG: 3,
        MODEL_ERROR: 4,
        HOF: 5,
        FFATTACKS: 6
    };

    const STAT_BUCKETS = [
        { key: '1b_plus',    min: 1000000000, max: Infinity,    label: '1BN+' },
        { key: '500m_1b',    min: 500000000,  max: 1000000000,  label: '500M–1BN' },
        { key: '100m_500m',  min: 100000000,  max: 500000000,   label: '100M–500M' },
        { key: '50m_100m',   min: 50000000,   max: 100000000,   label: '50M–100M' },
        { key: '20m_50m',    min: 20000000,   max: 50000000,    label: '20M–50M' },
        { key: '10m_20m',    min: 10000000,   max: 20000000,    label: '10M–20M' },
        { key: '5m_10m',     min: 5000000,    max: 10000000,    label: '5M–10M' },
        { key: '2m_5m',      min: 2000000,    max: 5000000,     label: '2M–5M' },
        { key: '1m_2m',      min: 1000000,    max: 2000000,     label: '1M–2M' },
        { key: '500k_1m',    min: 500000,     max: 1000000,     label: '500K–1M' },
        { key: '200k_500k',  min: 200000,     max: 500000,      label: '200K–500K' },
        { key: '50k_200k',   min: 50000,      max: 200000,      label: '50K–200K' },
        { key: 'lt_50k',     min: 0,          max: 50000,       label: '<50K' }
    ];

    GM_addStyle(`
        #${PANEL_ID} {
            position: fixed;
            right: 10px;
            bottom: 10px;
            width: 360px;
            max-width: calc(100vw - 20px);
            z-index: 999999;
            background: #1f2430;
            color: #fff;
            border: 1px solid #555;
            border-radius: 10px;
            padding: 10px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.4);
            font-family: Arial, sans-serif;
        }

        #${PANEL_ID}.minimised {
            display: none;
        }

        #steveo-opponent-activity-mini {
            position: fixed;
            right: 10px;
            bottom: 10px;
            z-index: 999999;
            display: none;
        }

        #steveo-opponent-activity-mini.show {
            display: block;
        }

        #steveo-opponent-activity-mini button {
            padding: 10px 14px;
            border: 1px solid #555;
            border-radius: 10px;
            background: #1f2430;
            color: #fff;
            font-weight: bold;
            box-shadow: 0 4px 14px rgba(0,0,0,0.4);
        }

        .steveo-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-weight: bold;
            font-size: 14px;
        }

        .steveo-header button {
            width: auto !important;
            margin: 0 !important;
            padding: 4px 10px !important;
            border-radius: 6px !important;
            background: #3a3f4b !important;
            font-size: 14px !important;
            line-height: 1 !important;
        }

        #${PANEL_ID} button,
        #${PANEL_ID} input[type="text"] {
            width: 100%;
            margin-bottom: 8px;
            padding: 10px;
            border: 0;
            border-radius: 8px;
            box-sizing: border-box;
            font-size: 14px;
        }

        #${PANEL_ID} button {
            background: #6a5acd;
            color: white;
            font-weight: bold;
        }

        #${PANEL_ID} button.secondary {
            background: #3a3f4b;
        }

        #${PANEL_ID} input[type="text"] {
            background: #10141c;
            color: #dfe6ee;
            border: 1px solid #666;
        }

        #${OUTPUT_ID} {
            width: 100%;
            height: 260px;
            border-radius: 8px;
            border: 1px solid #666;
            background: #10141c;
            color: #dfe6ee;
            padding: 8px;
            resize: vertical;
            box-sizing: border-box;
            font-size: 12px;
        }

        #${STATUS_ID} {
            font-size: 12px;
            color: #c8d0da;
            margin-bottom: 8px;
        }
    `);

    function getStoredApiKey() {
        let key = localStorage.getItem(API_KEY_STORAGE);
        if (!key) {
            key = prompt('Enter your Torn API key for this local script:');
            if (key) localStorage.setItem(API_KEY_STORAGE, key.trim());
        }
        return key ? key.trim() : null;
    }

    function setStatus(msg) {
        const el = document.getElementById(STATUS_ID);
        if (el) el.textContent = msg;
    }

    function setOutput(text) {
        const el = document.getElementById(OUTPUT_ID);
        if (el) el.value = text;
    }

    function getNowTs() {
        return Math.floor(Date.now() / 1000);
    }

    function formatShortNumber(n) {
        if (n == null || Number.isNaN(n)) return 'n/a';
        const abs = Math.abs(n);
        if (abs >= 1e15) return (n / 1e15).toFixed(1).replace(/\.0$/, '') + 'q';
        if (abs >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 't';
        if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'b';
        if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'm';
        if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
        return String(Math.round(n));
    }

    function parseRelativeToSeconds(relative) {
        if (!relative || typeof relative !== 'string') return null;
        const text = relative.toLowerCase().trim();

        if (text === 'online') return 0;
        if (text === 'offline') return 0;

        const match = text.match(/(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago/);
        if (!match) return null;

        const value = parseInt(match[1], 10);
        const unit = match[2];

        if (unit.startsWith('minute')) return value * 60;
        if (unit.startsWith('hour')) return value * 3600;
        if (unit.startsWith('day')) return value * 86400;
        if (unit.startsWith('week')) return value * 7 * 86400;
        if (unit.startsWith('month')) return value * 30 * 86400;
        if (unit.startsWith('year')) return value * 365 * 86400;

        return null;
    }

    function activityBucket(seconds) {
        if (seconds == null) return 'unknown';
        if (seconds < 86400) return 'lt24h';
        if (seconds < 172800) return '24to48h';
        if (seconds < 604800) return '2to7d';
        return 'gt7d';
    }

    function activityBucketLabel(key) {
        switch (key) {
            case 'lt24h': return 'ACTIVE <24H';
            case '24to48h': return 'ACTIVE 24–48H';
            case '2to7d': return 'ACTIVE 2–7D';
            case 'gt7d': return 'INACTIVE 7D+';
            default: return 'UNKNOWN';
        }
    }

    function getOpponentFactionIdFromPage() {
        const url = new URL(window.location.href);

        const direct = url.searchParams.get('ID');
        if (direct && /^\d+$/.test(direct)) return direct;

        const factionInfo = document.querySelector('.faction-info');
        if (factionInfo && factionInfo.getAttribute('data-faction')) {
            return factionInfo.getAttribute('data-faction');
        }

        const warLink = document.querySelector('.view-wars');
        if (warLink && warLink.href) {
            const m = warLink.href.match(/ranked\/(\d+)/);
            if (m) return m[1];
        }

        const selected = document.querySelector('[data-faction]');
        if (selected) {
            const val = selected.getAttribute('data-faction');
            if (val && /^\d+$/.test(val)) return val;
        }

        return '';
    }

    function getFactionIdInput() {
        return document.getElementById('steveo-opponent-faction-id');
    }

    function getDisplayMode() {
        return localStorage.getItem(DISPLAY_MODE_KEY) || 'full';
    }

    function setDisplayMode(mode) {
        localStorage.setItem(DISPLAY_MODE_KEY, mode);
    }

    function getGroupMode() {
        return localStorage.getItem(GROUP_MODE_KEY) || 'activity';
    }

    function setGroupMode(mode) {
        localStorage.setItem(GROUP_MODE_KEY, mode);
    }

    function getBspPrimaryKey() {
        return localStorage.getItem(BSP_KEYS.primaryApiKey) || '';
    }

    function getBspDaysToUseSpies() {
        const v = parseInt(localStorage.getItem(BSP_KEYS.daysToUseSpies), 10);
        return Number.isFinite(v) && v > 0 ? v : 30;
    }

    function getTornStatsSpyFromCache(playerId) {
        const raw = localStorage.getItem(BSP_KEYS.tornStatsSpyPrefix + playerId);
        if (!raw) return null;

        try {
            const spy = JSON.parse(raw);
            if (!spy) return null;

            const hasUnknown = spy.str == 0 || spy.def == 0 || spy.spd == 0 || spy.dex == 0;
            spy.IsSpy = true;
            spy.Source = 'TornStats';
            spy.Score = hasUnknown ? 0 : Math.floor(
                Math.sqrt(spy.str) + Math.sqrt(spy.def) + Math.sqrt(spy.spd) + Math.sqrt(spy.dex)
            );
            return spy;
        } catch {
            return null;
        }
    }

    function getYataSpyFromCache(playerId) {
        const raw = localStorage.getItem(BSP_KEYS.yataSpyPrefix + playerId);
        if (!raw) return null;

        try {
            const spy = JSON.parse(raw);
            if (!spy) return null;

            const hasUnknown = spy.str == 0 || spy.def == 0 || spy.spd == 0 || spy.dex == 0;
            spy.IsSpy = true;
            spy.Source = 'YATA';
            spy.Score = hasUnknown ? 0 : Math.floor(
                Math.sqrt(spy.str) + Math.sqrt(spy.def) + Math.sqrt(spy.spd) + Math.sqrt(spy.dex)
            );
            return spy;
        } catch {
            return null;
        }
    }

    function getMostRecentSpy(playerId) {
        const ts = getTornStatsSpyFromCache(playerId);
        const yata = getYataSpyFromCache(playerId);

        if (!ts && !yata) return null;
        if (!ts) return yata;
        if (!yata) return ts;

        return (yata.timestamp || 0) >= (ts.timestamp || 0) ? yata : ts;
    }

    function getPredictionFromCache(playerId) {
        const raw = localStorage.getItem(BSP_KEYS.predictionPrefix + playerId);
        if (!raw || raw === '[object Object]') return null;

        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function isPredictionFresh(prediction) {
        if (!prediction) return false;
        const base = prediction.DateFetched || prediction.PredictionDate;
        if (!base) return false;

        const dt = new Date(base);
        if (Number.isNaN(dt.getTime())) return false;

        const ageMs = Date.now() - dt.getTime();
        return ageMs <= 5 * 24 * 60 * 60 * 1000;
    }

    function consolidateBspData(prediction) {
        if (!prediction) return null;

        if (prediction.IsSpy === true) {
            return {
                source: prediction.Source || 'Spy',
                total: prediction.total || null,
                score: prediction.Score || null,
                label: `${prediction.Source || 'Spy'} spy`
            };
        }

        const result = prediction.Result;

        if (result === BSP_RESULT.FAIL || result === BSP_RESULT.MODEL_ERROR) {
            return {
                source: 'BSP',
                total: null,
                score: null,
                label: 'BSP error'
            };
        }

        let total = null;
        if (prediction.TBS != null) {
            if (typeof prediction.TBS === 'number') total = prediction.TBS;
            else total = parseInt(String(prediction.TBS).replace(/,/g, ''), 10);
        }

        let label = 'BSP prediction';
        if (result === BSP_RESULT.HOF) label = 'BSP HOF';
        else if (result === BSP_RESULT.FFATTACKS) label = 'BSP FF attacks';
        else if (result === BSP_RESULT.TOO_WEAK) label = 'BSP too weak';
        else if (result === BSP_RESULT.TOO_STRONG) label = 'BSP too strong';

        return {
            source: 'BSP',
            total,
            score: prediction.Score || null,
            label
        };
    }

    function fetchBspLive(playerId) {
        const bspKey = getBspPrimaryKey();
        if (!bspKey) return Promise.resolve(null);

        const url = `http://www.lol-manager.com/api/battlestats/${encodeURIComponent(bspKey)}/${encodeURIComponent(playerId)}/custom`;

        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    onload: (r) => {
                        try {
                            const parsed = JSON.parse(r.responseText);
                            resolve(parsed || null);
                        } catch {
                            resolve(null);
                        }
                    },
                    onerror: () => resolve(null),
                    ontimeout: () => resolve(null)
                });
            } else {
                fetch(url)
                    .then(r => r.json())
                    .then(j => resolve(j || null))
                    .catch(() => resolve(null));
            }
        });
    }

    async function getBestBspData(playerId) {
        const daysToUseSpies = getBspDaysToUseSpies();
        const now = getNowTs();

        const spy = getMostRecentSpy(playerId);
        if (spy && spy.total && spy.timestamp) {
            const maxAge = daysToUseSpies * 86400;
            if ((now - spy.timestamp) <= maxAge) {
                return consolidateBspData(spy);
            }
        }

        const cachedPrediction = getPredictionFromCache(playerId);
        if (cachedPrediction && isPredictionFresh(cachedPrediction)) {
            return consolidateBspData(cachedPrediction);
        }

        const live = await fetchBspLive(playerId);
        if (live) {
            try {
                live.DateFetched = new Date().toISOString();
                localStorage.setItem(BSP_KEYS.predictionPrefix + playerId, JSON.stringify(live));
            } catch (e) {}
            return consolidateBspData(live);
        }

        return null;
    }

    function sortBucketMembersByActivity(arr) {
        return arr.slice().sort((a, b) => {
            const aSec = a.lastActionSeconds ?? -1;
            const bSec = b.lastActionSeconds ?? -1;
            return aSec - bSec;
        });
    }

    function sortBucketMembersByStats(arr) {
        return arr.slice().sort((a, b) => {
            const aVal = a.bsp?.total ?? -1;
            const bVal = b.bsp?.total ?? -1;
            return bVal - aVal;
        });
    }

    function formatBspFull(bsp) {
        if (!bsp) return 'BSP: none';

        const parts = [bsp.label || bsp.source || 'BSP'];
        if (bsp.total != null) parts.push(`TBS ${formatShortNumber(bsp.total)}`);
        if (bsp.score != null) parts.push(`Score ${formatShortNumber(bsp.score)}`);
        return parts.join(' | ');
    }

    function formatBspShort(bsp) {
        if (!bsp) return 'BSP none';
        if (bsp.total != null) return `TBS ${formatShortNumber(bsp.total)}`;
        if (bsp.score != null) return `Score ${formatShortNumber(bsp.score)}`;
        return bsp.label || 'BSP';
    }

    function getStatBucketKey(total) {
        if (total == null || !Number.isFinite(total)) return 'no_stats';

        for (const bucket of STAT_BUCKETS) {
            if (total >= bucket.min && total < bucket.max) {
                return bucket.key;
            }
        }

        return 'no_stats';
    }

    function getStatBucketLabel(key) {
        const found = STAT_BUCKETS.find(b => b.key === key);
        if (found) return found.label;
        return 'NO STATS';
    }

    function buildActivityOutput(factionId, members, compact) {
        const buckets = {
            lt24h: [],
            '24to48h': [],
            '2to7d': [],
            gt7d: [],
            unknown: []
        };

        for (const m of members) {
            if (!buckets[m.bucket]) buckets.unknown.push(m);
            else buckets[m.bucket].push(m);
        }

        const lines = [];
        lines.push(`Opponent faction check`);
        lines.push(`Faction ID: ${factionId}`);
        lines.push(`Grouped by: Activity`);
        lines.push(compact ? `Mode: Compact` : `Mode: Full`);
        lines.push(``);

        ['lt24h', '24to48h', '2to7d', 'gt7d', 'unknown'].forEach(key => {
            const arr = sortBucketMembersByActivity(buckets[key]);
            if (!arr.length) return;

            lines.push(`${activityBucketLabel(key)} (${arr.length})`);
            arr.forEach(m => {
                if (compact) {
                    lines.push(`${m.name} - ${formatBspShort(m.bsp)}`);
                } else {
                    lines.push(`${m.name} [${m.id}] - last action: ${m.lastActionRelative} - ${formatBspFull(m.bsp)}`);
                }
            });
            lines.push('');
        });

        lines.push(`TOTAL MEMBERS CHECKED: ${members.length}`);
        return lines.join('\n');
    }

    function buildStatsOutput(factionId, members, compact) {
        const buckets = {};
        for (const bucket of STAT_BUCKETS) {
            buckets[bucket.key] = [];
        }
        buckets.no_stats = [];

        for (const m of members) {
            const total = m.bsp?.total ?? null;
            const key = getStatBucketKey(total);
            buckets[key].push(m);
        }

        const lines = [];
        lines.push(`Opponent faction check`);
        lines.push(`Faction ID: ${factionId}`);
        lines.push(`Grouped by: Stats`);
        lines.push(compact ? `Mode: Compact` : `Mode: Full`);
        lines.push(``);

        const orderedKeys = [...STAT_BUCKETS.map(b => b.key), 'no_stats'];

        orderedKeys.forEach(key => {
            const arr = sortBucketMembersByStats(buckets[key] || []);
            if (!arr.length) return;

            lines.push(`${getStatBucketLabel(key)} (${arr.length})`);
            arr.forEach(m => {
                if (compact) {
                    lines.push(`${m.name} - ${formatBspShort(m.bsp)}`);
                } else {
                    lines.push(`${m.name} [${m.id}] - ${formatBspFull(m.bsp)} - last action: ${m.lastActionRelative}`);
                }
            });
            lines.push('');
        });

        lines.push(`TOTAL MEMBERS CHECKED: ${members.length}`);
        return lines.join('\n');
    }

    function normaliseMembers(data) {
        if (!data || !data.members) return [];

        return Object.entries(data.members).map(([id, member]) => {
            const lastActionRelative = member.last_action?.relative || member.last_action?.status || 'unknown';
            const lastActionSeconds = typeof member.last_action?.seconds === 'number'
                ? member.last_action.seconds
                : parseRelativeToSeconds(lastActionRelative);

            return {
                id: String(id),
                name: member.name || `Unknown [${id}]`,
                status: member.status?.state || member.status?.description || '',
                lastActionRelative,
                lastActionSeconds,
                bucket: activityBucket(lastActionSeconds)
            };
        });
    }

    async function enrichMembersWithBsp(members) {
        const out = [];
        for (const m of members) {
            const bsp = await getBestBspData(m.id);
            out.push({ ...m, bsp });
        }
        return out;
    }

    function getFactionMembers(apiKey, factionId) {
        const url = `https://api.torn.com/faction/${encodeURIComponent(factionId)}?selections=basic&key=${encodeURIComponent(apiKey)}&comment=steveo_opponent_activity_${Date.now()}`;
        return fetch(url).then(r => r.json());
    }

    function minimisePanel() {
        const panel = document.getElementById(PANEL_ID);
        const mini = document.getElementById('steveo-opponent-activity-mini');
        if (panel) panel.classList.add('minimised');
        if (mini) mini.classList.add('show');
        localStorage.setItem(MINIMISED_KEY, 'true');
    }

    function expandPanel() {
        const panel = document.getElementById(PANEL_ID);
        const mini = document.getElementById('steveo-opponent-activity-mini');
        if (panel) panel.classList.remove('minimised');
        if (mini) mini.classList.remove('show');
        localStorage.setItem(MINIMISED_KEY, 'false');
    }

    async function copyOutput() {
        const text = document.getElementById(OUTPUT_ID)?.value || '';
        if (!text.trim()) {
            setStatus('Nothing to copy.');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            setStatus('Output copied.');
        } catch {
            setStatus('Copy failed. Manual copy still works.');
        }
    }

    function buildPanel() {
        if (document.getElementById(PANEL_ID)) return;

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="steveo-header">
                <span>Opponent Activity</span>
                <button id="steveo-opponent-minimise" type="button">_</button>
            </div>
            <input id="steveo-opponent-faction-id" type="text" placeholder="Opponent faction ID" />
            <button id="steveo-opponent-run" type="button">Check opponent faction</button>
            <button id="steveo-opponent-toggle-mode" type="button" class="secondary">Mode: Full</button>
            <button id="steveo-opponent-toggle-group" type="button" class="secondary">Group: Activity</button>
            <button id="steveo-opponent-copy" type="button" class="secondary">Copy output</button>
            <button id="steveo-opponent-reset-key" type="button" class="secondary">Reset Torn API key</button>
            <div id="${STATUS_ID}">Ready</div>
            <textarea id="${OUTPUT_ID}" readonly></textarea>
        `;

        const mini = document.createElement('div');
        mini.id = 'steveo-opponent-activity-mini';
        mini.innerHTML = `<button id="steveo-opponent-reopen" type="button">Opponent Activity</button>`;

        document.body.appendChild(panel);
        document.body.appendChild(mini);

        const input = getFactionIdInput();
        const autoId = getOpponentFactionIdFromPage();
        if (input && autoId) input.value = autoId;

        document.getElementById('steveo-opponent-run').addEventListener('click', runCheck);
        document.getElementById('steveo-opponent-copy').addEventListener('click', copyOutput);
        document.getElementById('steveo-opponent-reset-key').addEventListener('click', () => {
            localStorage.removeItem(API_KEY_STORAGE);
            setStatus('Saved Torn API key removed.');
        });
        document.getElementById('steveo-opponent-minimise').addEventListener('click', minimisePanel);
        document.getElementById('steveo-opponent-reopen').addEventListener('click', expandPanel);

        const modeBtn = document.getElementById('steveo-opponent-toggle-mode');
        const groupBtn = document.getElementById('steveo-opponent-toggle-group');

        function refreshButtons() {
            const mode = getDisplayMode();
            const group = getGroupMode();
            modeBtn.textContent = mode === 'compact' ? 'Mode: Compact' : 'Mode: Full';
            groupBtn.textContent = group === 'stats' ? 'Group: Stats' : 'Group: Activity';
        }

        modeBtn.addEventListener('click', () => {
            const current = getDisplayMode();
            const next = current === 'compact' ? 'full' : 'compact';
            setDisplayMode(next);
            refreshButtons();
        });

        groupBtn.addEventListener('click', () => {
            const current = getGroupMode();
            const next = current === 'stats' ? 'activity' : 'stats';
            setGroupMode(next);
            refreshButtons();
        });

        refreshButtons();

        if (localStorage.getItem(MINIMISED_KEY) === 'true') {
            minimisePanel();
        }
    }

    async function runCheck() {
        const apiKey = getStoredApiKey();
        if (!apiKey) {
            setStatus('No Torn API key provided.');
            return;
        }

        const factionId = (getFactionIdInput()?.value || '').trim();
        if (!factionId || !/^\d+$/.test(factionId)) {
            setStatus('Enter a valid opponent faction ID.');
            return;
        }

        setStatus('Fetching faction members...');
        setOutput('');

        try {
            const data = await getFactionMembers(apiKey, factionId);

            if (data.error) {
                setStatus(`API error ${data.error.code}: ${data.error.error}`);
                setOutput(JSON.stringify(data.error, null, 2));
                return;
            }

            let members = normaliseMembers(data);
            setStatus(`Fetched ${members.length} members. Enriching with BSP...`);

            members = await enrichMembersWithBsp(members);

            const compact = getDisplayMode() === 'compact';
            const groupMode = getGroupMode();

            const output = groupMode === 'stats'
                ? buildStatsOutput(factionId, members, compact)
                : buildActivityOutput(factionId, members, compact);

            setOutput(output);
            setStatus(`Done. Checked ${members.length} members.`);
        } catch (err) {
            console.error(err);
            setStatus('Request failed.');
            setOutput(`Request failed:\n${err.message || err}`);
        }
    }

    function init() {
        buildPanel();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

