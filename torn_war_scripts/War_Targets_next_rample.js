// ==UserScript==
// @name         Torn War Target Builder + Next + Rampage (Compact UI)
// @namespace    steveo.war.target.builder.next.rampage
// @version      1.4
// @description  Builds a saved FF-filtered opponent target list, enriches with BSP, opens the next live target, and adds Rampage mode for active online targets.
// @author       MrStez / Ace
// @match        https://www.torn.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    const NEXT_BUTTON_ID = 'steveo-war-next-button';
    const RAMPAGE_BUTTON_ID = 'steveo-war-rampage-button';
    const TOGGLE_BUTTON_ID = 'steveo-war-toggle-button';

    const PANEL_ID = 'steveo-war-builder-panel';
    const PANEL_STATUS_ID = 'steveo-war-builder-status';
    const PANEL_MINI_ID = 'steveo-war-builder-mini';

    const API_KEY_STORAGE = 'steveo_torn_api_key';
    const SETTINGS_KEY = 'steveo_war_target_settings';
    const SAVED_LIST_KEY = 'steveo_war_target_saved_list';
    const ROTATION_INDEX_KEY = 'steveo_war_target_rotation_index';
    const ADMIN_EXPANDED_KEY = 'steveo_war_target_admin_expanded';
    const PANEL_MINIMISED_KEY = 'steveo_war_target_panel_minimised';
    const LAST_OUTPUT_KEY = 'steveo_war_target_last_output';

    const FF_DB_NAME = 'ffscouter-cache';
    const FF_STORE_NAME = 'cache';

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

    const DEFAULT_SETTINGS = {
        minFF: 1.5,
        maxFF: 3.0,
        requireFF: true,
        requireBSP: false,
        includeStaleFF: true,
        attackLinkMode: 'same_tab'
    };

    GM_addStyle(`
        .steveo-war-side-btn {
            position: fixed;
            right: 0;
            z-index: 999999;
            color: #fff;
            border: 1px solid #555;
            border-right: 0;
            border-radius: 8px 0 0 8px;
            padding: 8px 9px;
            font-weight: bold;
            font-size: 16px;
            cursor: pointer;
            min-width: 42px;
            text-align: center;
            box-shadow: 0 4px 14px rgba(0,0,0,0.25);
            line-height: 1;
        }

        #${NEXT_BUTTON_ID} {
            top: 27%;
            background: #6a5acd;
        }

        #${RAMPAGE_BUTTON_ID} {
            top: 32%;
            background: #c0392b;
        }

        #${TOGGLE_BUTTON_ID} {
            top: 37%;
            background: #3a3f4b;
        }

        #${PANEL_ID} {
            position: fixed;
            right: 10px;
            bottom: 10px;
            width: 280px;
            max-width: calc(100vw - 20px);
            z-index: 999998;
            background: #1f2430;
            color: #fff;
            border: 1px solid #555;
            border-radius: 10px;
            padding: 10px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.4);
            font-family: Arial, sans-serif;
        }

        #${PANEL_ID}.hidden {
            display: none;
        }

        #${PANEL_MINI_ID} {
            position: fixed;
            right: 10px;
            bottom: 10px;
            z-index: 999998;
            display: none;
        }

        #${PANEL_MINI_ID}.show {
            display: block;
        }

        #${PANEL_MINI_ID} button {
            padding: 10px 14px;
            border: 1px solid #555;
            border-radius: 10px;
            background: #1f2430;
            color: #fff;
            font-weight: bold;
            box-shadow: 0 4px 14px rgba(0,0,0,0.4);
        }

        .steveo-war-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-weight: bold;
            font-size: 14px;
        }

        .steveo-war-panel-header button {
            width: auto !important;
            margin: 0 !important;
            padding: 4px 10px !important;
            border-radius: 6px !important;
            background: #3a3f4b !important;
            font-size: 14px !important;
            line-height: 1 !important;
        }

        .steveo-war-panel-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 8px;
        }

        #${PANEL_ID} button {
            width: 100%;
            padding: 10px;
            border: 0;
            border-radius: 8px;
            box-sizing: border-box;
            font-size: 14px;
            background: #6a5acd;
            color: white;
            font-weight: bold;
        }

        #${PANEL_ID} button.secondary {
            background: #3a3f4b;
        }

        #${PANEL_STATUS_ID} {
            font-size: 12px;
            color: #c8d0da;
            white-space: pre-wrap;
        }
    `);

    function isFactionOrWarPage() {
        const href = window.location.href;
        return href.includes('/factions.php') || href.includes('/war.php');
    }

    function isAdminExpanded() {
        return localStorage.getItem(ADMIN_EXPANDED_KEY) !== 'false';
    }

    function setAdminExpanded(value) {
        localStorage.setItem(ADMIN_EXPANDED_KEY, value ? 'true' : 'false');
    }

    function isPanelMinimised() {
        return localStorage.getItem(PANEL_MINIMISED_KEY) === 'true';
    }

    function setPanelMinimised(value) {
        localStorage.setItem(PANEL_MINIMISED_KEY, value ? 'true' : 'false');
    }

    function setPanelStatus(msg) {
        const el = document.getElementById(PANEL_STATUS_ID);
        if (el) el.textContent = msg;
    }

    function saveLastOutput(text) {
        localStorage.setItem(LAST_OUTPUT_KEY, text || '');
    }

    function getLastOutput() {
        return localStorage.getItem(LAST_OUTPUT_KEY) || '';
    }

    function getStoredApiKey() {
        let key = localStorage.getItem(API_KEY_STORAGE);
        if (!key) {
            key = prompt('Enter your Torn API key for this local script:');
            if (key) localStorage.setItem(API_KEY_STORAGE, key.trim());
        }
        return key ? key.trim() : null;
    }

    function getSavedList() {
        try {
            return JSON.parse(localStorage.getItem(SAVED_LIST_KEY) || 'null');
        } catch {
            return null;
        }
    }

    function saveSavedList(data) {
        localStorage.setItem(SAVED_LIST_KEY, JSON.stringify(data));
    }

    function getRotationIndex() {
        const v = parseInt(localStorage.getItem(ROTATION_INDEX_KEY) || '0', 10);
        return Number.isFinite(v) ? v : 0;
    }

    function setRotationIndex(v) {
        localStorage.setItem(ROTATION_INDEX_KEY, String(v));
    }

    function getSettings() {
        try {
            return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) };
        } catch {
            return { ...DEFAULT_SETTINGS };
        }
    }

    function saveSettings(settings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    function configureSettings() {
        const current = getSettings();

        const minFF = prompt('Minimum FF to include:', String(current.minFF));
        if (minFF === null) return;

        const maxFF = prompt('Maximum FF to include:', String(current.maxFF));
        if (maxFF === null) return;

        const requireFF = confirm('Require FF data to include a target?\nOK = yes, Cancel = no');
        const requireBSP = confirm('Require BSP data to include a target?\nOK = yes, Cancel = no');
        const includeStaleFF = confirm('Include stale FF values?\nOK = yes, Cancel = no');
        const newTab = confirm('Open attacks in a new tab?\nOK = yes, Cancel = same tab');

        const updated = {
            minFF: Number(minFF),
            maxFF: Number(maxFF),
            requireFF,
            requireBSP,
            includeStaleFF,
            attackLinkMode: newTab ? 'new_tab' : 'same_tab'
        };

        saveSettings(updated);
        const msg = `Saved settings.\nFF range: ${updated.minFF}-${updated.maxFF}\nRequire BSP: ${updated.requireBSP ? 'Yes' : 'No'}`;
        setPanelStatus(msg);
        alert(msg);
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

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return 'unknown';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}h ${m}m ${s}s`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
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

    async function fetchJson(url) {
        const res = await fetch(url);
        return res.json();
    }

    async function getRankedWars(apiKey) {
        try {
            const data = await fetchJson(`https://api.torn.com/faction/?selections=rankedwars&key=${encodeURIComponent(apiKey)}&comment=steveo_war_target_rankedwars`);
            if (data?.error) {
                return { ok: false, error: data.error.error, rankedwars: null };
            }
            return { ok: true, error: null, rankedwars: data.rankedwars || {} };
        } catch (e) {
            return { ok: false, error: e.message || String(e), rankedwars: null };
        }
    }

    function inferMyFactionFromRankedWars(rankedwars) {
        const counts = {};
        const names = {};

        for (const war of Object.values(rankedwars || {})) {
            const factions = war?.factions || {};
            for (const [fid, factionData] of Object.entries(factions)) {
                counts[fid] = (counts[fid] || 0) + 1;
                if (factionData?.name) names[fid] = factionData.name;
            }
        }

        let bestId = null;
        let bestCount = -1;

        for (const [fid, count] of Object.entries(counts)) {
            if (count > bestCount) {
                bestId = fid;
                bestCount = count;
            }
        }

        return {
            factionId: bestId ? String(bestId) : '',
            factionName: bestId ? (names[bestId] || `Faction ${bestId}`) : ''
        };
    }

    function getFactionLinksFromPage() {
        const selectors = [
            'a[href*="factions.php?step=profile&ID="]',
            'a[href*="factions.php?step=your#/profile/"]',
            'a[href*="factions.php?step=profile#/"]'
        ];

        const nodes = [];
        selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(node => nodes.push(node));
        });

        const out = nodes.map(a => {
            const href = a.href || '';
            const match = href.match(/ID=(\d+)/) || href.match(/profile\/(\d+)/);
            return {
                id: match ? String(match[1]) : null,
                name: (a.textContent || '').replace(/\s+/g, ' ').trim(),
                href
            };
        }).filter(x => x.id);

        const seen = new Set();
        return out.filter(x => {
            const key = `${x.id}|${x.name}|${x.href}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    async function detectOpponentFaction() {
        const apiKey = getStoredApiKey();
        if (!apiKey) return null;

        const ranked = await getRankedWars(apiKey);
        if (!ranked.ok) return null;

        const mine = inferMyFactionFromRankedWars(ranked.rankedwars);
        const links = getFactionLinksFromPage();

        if (!mine.factionId || !links.length) return null;

        const uniqueById = [];
        const seen = new Set();
        for (const link of links) {
            if (!seen.has(link.id)) {
                seen.add(link.id);
                uniqueById.push(link);
            }
        }

        const opponent = uniqueById.find(x => x.id !== mine.factionId);
        if (!opponent?.id) return null;

        return {
            myFactionId: mine.factionId,
            myFactionName: mine.factionName,
            opponentFactionId: opponent.id,
            opponentFactionName: opponent.name || `Faction ${opponent.id}`
        };
    }

    function getFactionMembers(apiKey, factionId) {
        const url = `https://api.torn.com/faction/${encodeURIComponent(factionId)}?selections=basic&key=${encodeURIComponent(apiKey)}&comment=steveo_war_target_members_${Date.now()}`;
        return fetch(url).then(r => r.json());
    }

    async function openFFDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(FF_DB_NAME, 1);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
        });
    }

    async function getFFValues(playerIds) {
        try {
            const db = await openFFDb();

            return new Promise((resolve, reject) => {
                const tx = db.transaction(FF_STORE_NAME, 'readonly');
                const store = tx.objectStore(FF_STORE_NAME);
                const results = {};

                let remaining = playerIds.length;
                if (remaining === 0) {
                    resolve(results);
                    return;
                }

                for (const playerId of playerIds) {
                    const req = store.get(parseInt(playerId, 10));
                    req.onerror = () => {
                        remaining--;
                        if (remaining === 0) resolve(results);
                    };
                    req.onsuccess = () => {
                        const row = req.result;
                        if (row) results[String(playerId)] = row;
                        remaining--;
                        if (remaining === 0) resolve(results);
                    };
                }

                tx.onerror = () => reject(tx.error);
            });
        } catch (e) {
            console.error('[WAR TARGET] FF cache read failed:', e);
            return {};
        }
    }

    function getFFValueFromRow(row) {
        if (!row) return null;
        if (typeof row.value === 'number') return row.value;
        if (typeof row.ff === 'number') return row.ff;
        if (typeof row.fairFight === 'number') return row.fairFight;
        return null;
    }

    function isFFRowFresh(row) {
        if (!row) return false;
        if (row.expiry && row.expiry > Date.now()) return true;
        if (row.last_updated) {
            const age = Date.now() - row.last_updated;
            return age <= 24 * 60 * 60 * 1000;
        }
        return false;
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

    function getAvailabilityFlags(member) {
        const state = member?.status?.state || '';
        const description = member?.status?.description || '';
        const until = member?.status?.until ? parseInt(member.status.until, 10) : null;
        const lastActionRelative = member?.last_action?.relative || member?.last_action?.status || 'unknown';
        const lastActionSeconds = typeof member?.last_action?.seconds === 'number'
            ? member.last_action.seconds
            : parseRelativeToSeconds(lastActionRelative);

        const stateLower = String(state).toLowerCase();
        const descLower = String(description).toLowerCase();

        const isHospital = stateLower.includes('hospital') || descLower.includes('hospital');
        const isAbroad = stateLower.includes('abroad') || descLower.includes('abroad');
        const isTravel = descLower.includes('travel') || descLower.includes('returning') || descLower.includes('flight');
        const isJail = stateLower.includes('jail') || descLower.includes('jail');
        const isFederal = stateLower.includes('federal') || descLower.includes('federal');

        return {
            state,
            description,
            until,
            isHospital,
            isAbroad,
            isTravel,
            isJail,
            isFederal,
            unavailable: isHospital || isAbroad || isTravel || isJail || isFederal,
            lastActionRelative,
            lastActionSeconds,
            isOnline: String(lastActionRelative).toLowerCase() === 'online'
        };
    }

    async function enrichMembersForBuild(data, settings) {
        const members = Object.entries(data.members || {}).map(([id, member]) => ({
            id: String(id),
            name: member.name || `Unknown [${id}]`,
            status: member.status?.state || member.status?.description || ''
        }));

        const ffMap = await getFFValues(members.map(m => m.id));

        const out = [];
        for (const m of members) {
            const ffRow = ffMap[m.id] || null;
            const ffValue = getFFValueFromRow(ffRow);
            const ffFresh = isFFRowFresh(ffRow);

            if (settings.requireFF && ffValue == null) continue;
            if (ffValue != null && (ffValue < settings.minFF || ffValue > settings.maxFF)) continue;
            if (!settings.includeStaleFF && ffRow && !ffFresh) continue;

            const bsp = await getBestBspData(m.id);
            if (settings.requireBSP && (!bsp || !Number.isFinite(bsp.total))) continue;

            out.push({
                id: m.id,
                name: m.name,
                ff: ffValue,
                ffFresh,
                bsp,
                status: m.status
            });
        }

        out.sort((a, b) => {
            const ffA = a.ff ?? -1;
            const ffB = b.ff ?? -1;
            if (ffB !== ffA) return ffB - ffA;

            const bspA = Number.isFinite(a.bsp?.total) ? a.bsp.total : Number.MAX_SAFE_INTEGER;
            const bspB = Number.isFinite(b.bsp?.total) ? b.bsp.total : Number.MAX_SAFE_INTEGER;
            return bspA - bspB;
        });

        return out;
    }

    function buildSavedListOutput(saved) {
        const lines = [];
        lines.push(`War target list built`);
        lines.push(`My faction: ${saved.myFactionName} [${saved.myFactionId}]`);
        lines.push(`Opponent: ${saved.opponentFactionName} [${saved.opponentFactionId}]`);
        lines.push(`Targets saved: ${saved.targets.length}`);
        lines.push(`FF range: ${saved.settings.minFF} - ${saved.settings.maxFF}`);
        lines.push(`Require BSP: ${saved.settings.requireBSP ? 'Yes' : 'No'}`);
        lines.push(``);

        saved.targets.slice(0, 50).forEach((t, i) => {
            const ffText = t.ff == null ? 'n/a' : t.ff.toFixed(2);
            const bspText = Number.isFinite(t.bsp?.total) ? formatShortNumber(t.bsp.total) : 'n/a';
            const freshness = t.ff == null ? '' : (t.ffFresh ? 'fresh' : 'stale');
            lines.push(`${i + 1}. ${t.name} [${t.id}] - FF ${ffText}${freshness ? ` (${freshness})` : ''} - BSP ${bspText}`);
        });

        return lines.join('\n');
    }

    async function buildTargetList() {
        const apiKey = getStoredApiKey();
        if (!apiKey) {
            alert('No Torn API key provided.');
            return;
        }

        setPanelStatus('Detecting opponent and building list...');

        const ctx = await detectOpponentFaction();
        if (!ctx) {
            const msg = 'Could not detect opponent faction on this page.';
            setPanelStatus(msg);
            alert(msg);
            return;
        }

        const data = await getFactionMembers(apiKey, ctx.opponentFactionId);

        if (data.error) {
            const msg = `API error ${data.error.code}: ${data.error.error}`;
            saveLastOutput(msg);
            setPanelStatus(msg);
            alert(msg);
            return;
        }

        const settings = getSettings();
        const targets = await enrichMembersForBuild(data, settings);

        const saved = {
            builtAt: Date.now(),
            myFactionId: ctx.myFactionId,
            myFactionName: ctx.myFactionName,
            opponentFactionId: ctx.opponentFactionId,
            opponentFactionName: ctx.opponentFactionName,
            settings,
            targets
        };

        saveSavedList(saved);
        setRotationIndex(0);

        const output = buildSavedListOutput(saved);
        saveLastOutput(output);
        setPanelStatus(`Built ${targets.length} targets for ${ctx.opponentFactionName}.`);
        alert(`Built ${targets.length} targets for ${ctx.opponentFactionName}.`);
    }

    async function openNextTarget() {
        const apiKey = getStoredApiKey();
        if (!apiKey) {
            alert('No Torn API key provided.');
            return;
        }

        const saved = getSavedList();
        if (!saved || !saved.targets || !saved.targets.length) {
            alert('No list is built yet. Press Build first on the faction/war page.');
            return;
        }

        const data = await getFactionMembers(apiKey, saved.opponentFactionId);
        if (data.error) {
            alert(`Faction API error ${data.error.code}: ${data.error.error}`);
            return;
        }

        const members = data.members || {};
        const list = saved.targets;
        const startIndex = getRotationIndex() % list.length;

        let soonest = null;

        for (let offset = 0; offset < list.length; offset++) {
            const idx = (startIndex + offset) % list.length;
            const target = list[idx];
            const live = members[String(target.id)];
            if (!live) continue;

            const flags = getAvailabilityFlags(live);

            if (!flags.unavailable) {
                setRotationIndex((idx + 1) % list.length);

                const settings = getSettings();
                const url = `https://www.torn.com/loader.php?sid=attack&user2ID=${target.id}`;

                if (settings.attackLinkMode === 'new_tab') {
                    window.open(url, '_blank');
                } else {
                    window.location.href = url;
                }
                return;
            }

            if (flags.until && (!soonest || flags.until < soonest.until)) {
                soonest = {
                    id: target.id,
                    name: target.name,
                    until: flags.until,
                    description: flags.description || flags.state || 'Unavailable'
                };
            }
        }

        if (soonest) {
            alert(`${soonest.name} should be back first in about ${formatTime(Math.max(0, soonest.until - getNowTs()))} (${soonest.description}).`);
        } else {
            alert('No valid targets are currently available.');
        }
    }

    async function openRampageTarget() {
        const apiKey = getStoredApiKey();
        if (!apiKey) {
            alert('No Torn API key provided.');
            return;
        }

        let saved = getSavedList();
        let ctx = null;

        if (saved?.opponentFactionId) {
            ctx = {
                opponentFactionId: saved.opponentFactionId,
                opponentFactionName: saved.opponentFactionName || `Faction ${saved.opponentFactionId}`
            };
        } else {
            ctx = await detectOpponentFaction();
        }

        if (!ctx || !ctx.opponentFactionId) {
            alert('Could not determine opponent faction for Rampage.');
            return;
        }

        const data = await getFactionMembers(apiKey, ctx.opponentFactionId);
        if (data.error) {
            alert(`Faction API error ${data.error.code}: ${data.error.error}`);
            return;
        }

        const settings = getSettings();
        const liveMembers = Object.entries(data.members || {}).map(([id, member]) => ({
            id: String(id),
            name: member.name || `Unknown [${id}]`,
            member
        }));

        const ffMap = await getFFValues(liveMembers.map(m => m.id));

        const candidates = [];
        for (const row of liveMembers) {
            const flags = getAvailabilityFlags(row.member);
            if (flags.unavailable) continue;

            const ffRow = ffMap[row.id] || null;
            const ffValue = getFFValueFromRow(ffRow);
            const ffFresh = isFFRowFresh(ffRow);

            if (settings.requireFF && ffValue == null) continue;
            if (ffValue != null && ffValue > settings.maxFF) continue;
            if (!settings.includeStaleFF && ffRow && !ffFresh) continue;

            const bsp = await getBestBspData(row.id);
            if (settings.requireBSP && (!bsp || !Number.isFinite(bsp.total))) continue;

            candidates.push({
                id: row.id,
                name: row.name,
                ff: ffValue,
                ffFresh,
                bsp,
                flags
            });
        }

        if (!candidates.length) {
            const msg = 'No live Rampage targets found within your max FF.';
            saveLastOutput(msg);
            alert(msg);
            return;
        }

        candidates.sort((a, b) => {
            if (a.flags.isOnline !== b.flags.isOnline) return a.flags.isOnline ? -1 : 1;

            const aSecs = a.flags.lastActionSeconds ?? Number.MAX_SAFE_INTEGER;
            const bSecs = b.flags.lastActionSeconds ?? Number.MAX_SAFE_INTEGER;
            if (aSecs !== bSecs) return aSecs - bSecs;

            const ffA = a.ff ?? -1;
            const ffB = b.ff ?? -1;
            if (ffB !== ffA) return ffB - ffA;

            const bspA = Number.isFinite(a.bsp?.total) ? a.bsp.total : Number.MAX_SAFE_INTEGER;
            const bspB = Number.isFinite(b.bsp?.total) ? b.bsp.total : Number.MAX_SAFE_INTEGER;
            return bspA - bspB;
        });

        const chosen = candidates[0];
        const settingsNow = getSettings();
        const url = `https://www.torn.com/loader.php?sid=attack&user2ID=${chosen.id}`;

        const summary = [
            `Rampage target: ${chosen.name} [${chosen.id}]`,
            `Last action: ${chosen.flags.lastActionRelative || 'unknown'}`,
            `FF: ${chosen.ff == null ? 'n/a' : chosen.ff.toFixed(2)}${chosen.ff == null ? '' : chosen.ffFresh ? ' (fresh)' : ' (stale)'}`,
            `BSP: ${Number.isFinite(chosen.bsp?.total) ? formatShortNumber(chosen.bsp.total) : 'n/a'}`
        ].join('\n');

        saveLastOutput(summary);

        if (settingsNow.attackLinkMode === 'new_tab') {
            window.open(url, '_blank');
        } else {
            window.location.href = url;
        }
    }

    async function copyOutput() {
        const text = getLastOutput();
        if (!text.trim()) {
            alert('Nothing to copy yet.');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            setPanelStatus('Output copied.');
            alert('Output copied.');
        } catch {
            alert('Copy failed.');
        }
    }

    function showPreview() {
        const text = getLastOutput();
        if (!text.trim()) {
            alert('Nothing saved yet.');
            return;
        }
        alert(text);
    }

    function updatePanelVisibility() {
        const panel = document.getElementById(PANEL_ID);
        const mini = document.getElementById(PANEL_MINI_ID);
        const toggle = document.getElementById(TOGGLE_BUTTON_ID);

        const onAdminPage = isFactionOrWarPage();
        const expanded = isAdminExpanded();
        const minimised = isPanelMinimised();

        if (toggle) {
            toggle.style.display = onAdminPage ? 'block' : 'none';
            toggle.textContent = expanded ? '−' : '+';
        }

        if (!panel || !mini) return;

        if (!onAdminPage || !expanded) {
            panel.classList.add('hidden');
            mini.classList.remove('show');
            return;
        }

        if (minimised) {
            panel.classList.add('hidden');
            mini.classList.add('show');
        } else {
            panel.classList.remove('hidden');
            mini.classList.remove('show');
        }
    }

    function buildButton(id, text, onClick, title) {
        if (document.getElementById(id)) return;

        const btn = document.createElement('button');
        btn.id = id;
        btn.className = 'steveo-war-side-btn';
        btn.textContent = text;
        btn.title = title || '';
        btn.addEventListener('click', onClick);
        document.body.appendChild(btn);
    }

    function buildPanel() {
        if (document.getElementById(PANEL_ID)) return;

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="steveo-war-panel-header">
                <span>War Builder</span>
                <button id="steveo-war-panel-minimise" type="button">_</button>
            </div>
            <div class="steveo-war-panel-grid">
                <button id="steveo-war-build" type="button">Build</button>
                <button id="steveo-war-settings" type="button" class="secondary">Settings</button>
                <button id="steveo-war-copy" type="button" class="secondary">Copy</button>
                <button id="steveo-war-preview" type="button" class="secondary">Preview</button>
            </div>
            <button id="steveo-war-reset" type="button" class="secondary">Reset API key</button>
            <div id="${PANEL_STATUS_ID}">Ready</div>
        `;

        const mini = document.createElement('div');
        mini.id = PANEL_MINI_ID;
        mini.innerHTML = `<button id="steveo-war-panel-reopen" type="button">War Builder</button>`;

        document.body.appendChild(panel);
        document.body.appendChild(mini);

        document.getElementById('steveo-war-build').addEventListener('click', buildTargetList);
        document.getElementById('steveo-war-settings').addEventListener('click', configureSettings);
        document.getElementById('steveo-war-copy').addEventListener('click', copyOutput);
        document.getElementById('steveo-war-preview').addEventListener('click', showPreview);
        document.getElementById('steveo-war-reset').addEventListener('click', () => {
            localStorage.removeItem(API_KEY_STORAGE);
            setPanelStatus('Saved Torn API key removed.');
            alert('Saved Torn API key removed.');
        });
        document.getElementById('steveo-war-panel-minimise').addEventListener('click', () => {
            setPanelMinimised(true);
            updatePanelVisibility();
        });
        document.getElementById('steveo-war-panel-reopen').addEventListener('click', () => {
            setPanelMinimised(false);
            updatePanelVisibility();
        });

        const saved = getSavedList();
        if (saved?.targets?.length) {
            setPanelStatus(`Loaded saved list with ${saved.targets.length} targets.`);
            saveLastOutput(buildSavedListOutput(saved));
        }

        updatePanelVisibility();
    }

    function init() {
        buildButton(NEXT_BUTTON_ID, '⏭️', openNextTarget, 'War Next (saved FF targets)');
        buildButton(RAMPAGE_BUTTON_ID, '🤬', openRampageTarget, 'Rampage (online targets)');
        buildButton(TOGGLE_BUTTON_ID, '+', () => {
            setAdminExpanded(!isAdminExpanded());
            updatePanelVisibility();
        }, 'Show/hide builder');

        buildPanel();
        updatePanelVisibility();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();