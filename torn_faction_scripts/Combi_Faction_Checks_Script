// ==UserScript==
// @name         Torn PDA - Faction War Risk / Revive Check
// @namespace    steveo.faction.warriskrevive
// @version      1.4
// @description  Checks faction war risk, inactivity, federal status, and revive settings
// @author       MrStez / Ace
// @match        https://www.torn.com/factions.php*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'steveo_torn_api_key';
    const MINIMISED_KEY = 'steveo_faction_tool_minimised';

    const WAR_RISK_DAYS = 2;
    const INACTIVE_DAYS = 7;

    const WAR_RISK_SECONDS = WAR_RISK_DAYS * 24 * 60 * 60;
    const INACTIVE_SECONDS = INACTIVE_DAYS * 24 * 60 * 60;

    GM_addStyle(`
        #steveo-faction-tool {
            position: fixed;
            right: 10px;
            bottom: 10px;
            z-index: 999999;
            background: #1f2430;
            color: #fff;
            border: 1px solid #555;
            border-radius: 10px;
            padding: 10px;
            width: 340px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.4);
            font-family: Arial, sans-serif;
        }

        #steveo-faction-tool.minimised {
            display: none;
        }

        #steveo-faction-mini {
            position: fixed;
            right: 10px;
            bottom: 10px;
            z-index: 999999;
            display: none;
        }

        #steveo-faction-mini.show {
            display: block;
        }

        #steveo-faction-mini button {
            padding: 10px 14px;
            border: 1px solid #555;
            border-radius: 10px;
            background: #1f2430;
            color: #fff;
            font-weight: bold;
            box-shadow: 0 4px 14px rgba(0,0,0,0.4);
        }

        #steveo-faction-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-weight: bold;
            font-size: 14px;
        }

        #steveo-faction-minimise {
            width: auto !important;
            margin: 0 !important;
            padding: 4px 10px !important;
            border-radius: 6px !important;
            background: #3a3f4b !important;
            font-size: 14px !important;
            line-height: 1 !important;
        }

        #steveo-faction-tool button {
            width: 100%;
            margin-bottom: 8px;
            padding: 10px;
            border: 0;
            border-radius: 8px;
            background: #6a5acd;
            color: white;
            font-weight: bold;
            font-size: 14px;
        }

        #steveo-faction-tool button.secondary {
            background: #3a3f4b;
        }

        #steveo-faction-output {
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

        #steveo-faction-status {
            font-size: 12px;
            color: #c8d0da;
            margin-bottom: 8px;
        }
    `);

    function getApiKey() {
        let key = localStorage.getItem(STORAGE_KEY);
        if (!key) {
            key = prompt('Enter your Torn API key for this local script:');
            if (key) {
                localStorage.setItem(STORAGE_KEY, key.trim());
            }
        }
        return key ? key.trim() : null;
    }

    function formatDays(seconds) {
        if (typeof seconds !== 'number' || isNaN(seconds)) return 'unknown';
        const days = seconds / 86400;
        return `${days.toFixed(1)}d`;
    }

    function formatFactionTime(seconds) {
        if (typeof seconds !== 'number' || isNaN(seconds)) return 'unknown';
        const days = Math.floor(seconds / 86400);
        if (days < 1) return '<1d';
        if (days < 30) return `${days}d`;
        if (days < 365) return `${Math.floor(days / 30)}mo`;
        const years = Math.floor(days / 365);
        const remMonths = Math.floor((days % 365) / 30);
        return remMonths > 0 ? `${years}y ${remMonths}mo` : `${years}y`;
    }

    function parseRelativeToSeconds(relative) {
        if (!relative || typeof relative !== 'string') return null;

        const text = relative.toLowerCase().trim();

        if (text === 'online' || text === 'offline' || text === 'idle') return 0;

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

    function extractFactionAgeSeconds(member) {
        const now = Math.floor(Date.now() / 1000);

        if (typeof member.days_in_faction === 'number') return member.days_in_faction * 86400;
        if (typeof member.faction?.days_in_faction === 'number') return member.faction.days_in_faction * 86400;
        if (typeof member.joined === 'number') return Math.max(0, now - member.joined);
        if (typeof member.joined_at === 'number') return Math.max(0, now - member.joined_at);
        if (typeof member.faction?.joined === 'number') return Math.max(0, now - member.faction.joined);
        if (typeof member.faction?.joined_at === 'number') return Math.max(0, now - member.faction.joined_at);

        return null;
    }

    function extractStatusState(member) {
        return (
            member.status?.state ||
            member.status?.description ||
            member.state ||
            member.status ||
            ''
        );
    }

    function extractLastActionRelative(member) {
        return (
            member.last_action?.relative ||
            member.last_action?.status ||
            member.last_action_relative ||
            'unknown'
        );
    }

    function extractLastActionSeconds(member) {
        if (typeof member.last_action?.seconds === 'number') return member.last_action.seconds;
        if (typeof member.last_action_seconds === 'number') return member.last_action_seconds;
        return parseRelativeToSeconds(extractLastActionRelative(member));
    }

    function extractReviveRaw(member) {
        return (
            member.revive_setting ??
            member.reviveSettings ??
            member.revive ??
            member.revivable ??
            member.reviveable ??
            member.profile?.revive_setting ??
            null
        );
    }

    function normaliseReviveSetting(raw) {
        if (raw === null || raw === undefined) return 'Unknown';

        if (typeof raw === 'boolean') {
            return raw ? 'Everyone' : 'Nobody';
        }

        if (typeof raw === 'number') {
            if (raw === 0) return 'Nobody';
            if (raw === 1) return 'Friends/Faction';
            if (raw === 2) return 'Everyone';
            return 'Unknown';
        }

        const text = String(raw).trim().toLowerCase();

        if (!text || text === 'unknown' || text === 'null') return 'Unknown';

        if (text.includes('every') || text === 'all' || text === 'everyone') return 'Everyone';
        if (text.includes('friend') || text.includes('faction')) return 'Friends/Faction';
        if (text.includes('nobody') || text.includes('no one') || text.includes('none') || text.includes('off')) return 'Nobody';
        if (text === 'true' || text === 'yes' || text === 'on') return 'Everyone';
        if (text === 'false' || text === 'no') return 'Nobody';

        return 'Unknown';
    }

    function isRevivesOn(setting) {
        return setting === 'Everyone' || setting === 'Friends/Faction';
    }

    function buildPanel() {
        if (document.getElementById('steveo-faction-tool')) return;

        const panel = document.createElement('div');
        panel.id = 'steveo-faction-tool';
        panel.innerHTML = `
            <div id="steveo-faction-header">
                <span>Faction Check</span>
                <button id="steveo-faction-minimise" type="button">_</button>
            </div>
            <button id="steveo-run-check">War risk check</button>
            <button id="steveo-run-revive-check">Check revive settings</button>
            <button id="steveo-copy-output" class="secondary">Copy output</button>
            <button id="steveo-reset-key" class="secondary">Reset API key</button>
            <div id="steveo-faction-status">Ready</div>
            <textarea id="steveo-faction-output" readonly></textarea>
        `;

        const mini = document.createElement('div');
        mini.id = 'steveo-faction-mini';
        mini.innerHTML = `<button id="steveo-faction-reopen" type="button">Faction Check</button>`;

        document.body.appendChild(panel);
        document.body.appendChild(mini);

        document.getElementById('steveo-run-check').addEventListener('click', runWarRiskCheck);
        document.getElementById('steveo-run-revive-check').addEventListener('click', runReviveCheck);
        document.getElementById('steveo-copy-output').addEventListener('click', copyOutput);
        document.getElementById('steveo-reset-key').addEventListener('click', () => {
            localStorage.removeItem(STORAGE_KEY);
            setStatus('Saved API key removed.');
        });

        document.getElementById('steveo-faction-minimise').addEventListener('click', minimisePanel);
        document.getElementById('steveo-faction-reopen').addEventListener('click', expandPanel);

        if (localStorage.getItem(MINIMISED_KEY) === 'true') {
            minimisePanel();
        }
    }

    function minimisePanel() {
        const panel = document.getElementById('steveo-faction-tool');
        const mini = document.getElementById('steveo-faction-mini');
        if (panel) panel.classList.add('minimised');
        if (mini) mini.classList.add('show');
        localStorage.setItem(MINIMISED_KEY, 'true');
    }

    function expandPanel() {
        const panel = document.getElementById('steveo-faction-tool');
        const mini = document.getElementById('steveo-faction-mini');
        if (panel) panel.classList.remove('minimised');
        if (mini) mini.classList.remove('show');
        localStorage.setItem(MINIMISED_KEY, 'false');
    }

    function setStatus(msg) {
        const el = document.getElementById('steveo-faction-status');
        if (el) el.textContent = msg;
    }

    function setOutput(text) {
        const el = document.getElementById('steveo-faction-output');
        if (el) el.value = text;
    }

    async function copyOutput() {
        const text = document.getElementById('steveo-faction-output')?.value || '';
        if (!text.trim()) {
            setStatus('Nothing to copy.');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            setStatus('Output copied.');
        } catch (e) {
            setStatus('Copy failed. You can still manually select the text.');
        }
    }

    function normaliseMembers(data) {
        const source =
            data?.members ||
            data?.faction?.members ||
            data?.data?.members ||
            data?.data ||
            [];

        let rows = [];

        if (Array.isArray(source)) {
            rows = source.map((member, idx) => ({
                id: member.id || member.user_id || member.player_id || `unknown_${idx}`,
                member
            }));
        } else if (source && typeof source === 'object') {
            rows = Object.entries(source).map(([id, member]) => ({
                id,
                member
            }));
        }

        return rows.map(({ id, member }) => {
            const name = member.name || member.username || `Unknown [${id}]`;
            const statusState = extractStatusState(member);
            const lastActionRelative = extractLastActionRelative(member);
            const lastActionSeconds = extractLastActionSeconds(member);
            const factionAgeSeconds = extractFactionAgeSeconds(member);
            const rawRevive = extractReviveRaw(member);
            const reviveSetting = normaliseReviveSetting(rawRevive);

            const isFederal = String(statusState).toLowerCase() === 'federal';
            const isInactive2d =
                typeof lastActionSeconds === 'number' &&
                lastActionSeconds > WAR_RISK_SECONDS;
            const isInactive7d =
                typeof lastActionSeconds === 'number' &&
                lastActionSeconds >= INACTIVE_SECONDS;
            const hasRevivesOn = isRevivesOn(reviveSetting);
            const isWarRisk = isInactive2d && hasRevivesOn;

            return {
                id,
                name,
                statusState,
                lastActionSeconds,
                lastActionRelative,
                factionAgeSeconds,
                rawRevive,
                reviveSetting,
                hasRevivesOn,
                isFederal,
                isInactive2d,
                isInactive7d,
                isWarRisk
            };
        });
    }

    function buildSummary(members) {
        const warRiskCount = members.filter(m => m.isWarRisk).length;
        const inactive7Count = members.filter(m => m.isInactive7d).length;
        const federalCount = members.filter(m => m.isFederal).length;
        const revivesEveryoneCount = members.filter(m => m.reviveSetting === 'Everyone').length;
        const revivesRestrictedCount = members.filter(m => m.reviveSetting === 'Friends/Faction').length;
        const unknownCount = members.filter(m => m.reviveSetting === 'Unknown').length;

        return [
            `SUMMARY`,
            `Members checked: ${members.length}`,
            `War risk (inactive > ${WAR_RISK_DAYS}d + revives on): ${warRiskCount}`,
            `Inactive ${INACTIVE_DAYS}+ days: ${inactive7Count}`,
            `Federal: ${federalCount}`,
            `Revives on - everyone: ${revivesEveryoneCount}`,
            `Revives on - restricted: ${revivesRestrictedCount}`,
            `Unknown revive setting: ${unknownCount}`,
            ``
        ];
    }

    function buildWarRiskOutput(members) {
        const warRisk = members
            .filter(m => m.isWarRisk)
            .sort((a, b) => (b.lastActionSeconds || 0) - (a.lastActionSeconds || 0));

        const inactive7 = members
            .filter(m => m.isInactive7d)
            .sort((a, b) => (b.lastActionSeconds || 0) - (a.lastActionSeconds || 0));

        const revivesEveryone = members
            .filter(m => m.reviveSetting === 'Everyone')
            .sort((a, b) => a.name.localeCompare(b.name));

        const revivesRestricted = members
            .filter(m => m.reviveSetting === 'Friends/Faction')
            .sort((a, b) => a.name.localeCompare(b.name));

        const unknown = members
            .filter(m => m.reviveSetting === 'Unknown')
            .sort((a, b) => a.name.localeCompare(b.name));

        const federal = members
            .filter(m => m.isFederal)
            .sort((a, b) => a.name.localeCompare(b.name));

        const lines = [];
        lines.push(`Faction war risk check`);
        lines.push(``);
        lines.push(...buildSummary(members));

        lines.push(`WAR RISK - INACTIVE > ${WAR_RISK_DAYS} DAYS + REVIVES ON (${warRisk.length})`);
        if (!warRisk.length) {
            lines.push(`None`);
        } else {
            warRisk.forEach(m => {
                lines.push(
                    `${m.name} [${m.id}] - inactive ${formatDays(m.lastActionSeconds)} - revives: ${m.reviveSetting} - in faction: ${formatFactionTime(m.factionAgeSeconds)}`
                );
            });
        }
        lines.push(``);

        lines.push(`INACTIVE ${INACTIVE_DAYS}+ DAYS (${inactive7.length})`);
        if (!inactive7.length) {
            lines.push(`None`);
        } else {
            inactive7.forEach(m => {
                lines.push(
                    `${m.name} [${m.id}] - inactive ${formatDays(m.lastActionSeconds)} - last action: ${m.lastActionRelative} - revives: ${m.reviveSetting} - in faction: ${formatFactionTime(m.factionAgeSeconds)}`
                );
            });
        }
        lines.push(``);

        lines.push(`REVIVES ON - EVERYONE (${revivesEveryone.length})`);
        if (!revivesEveryone.length) {
            lines.push(`None`);
        } else {
            revivesEveryone.forEach(m => {
                lines.push(
                    `${m.name} [${m.id}] - last action: ${m.lastActionRelative} - in faction: ${formatFactionTime(m.factionAgeSeconds)}`
                );
            });
        }
        lines.push(``);

        lines.push(`REVIVES ON - RESTRICTED (${revivesRestricted.length})`);
        if (!revivesRestricted.length) {
            lines.push(`None`);
        } else {
            revivesRestricted.forEach(m => {
                lines.push(
                    `${m.name} [${m.id}] - last action: ${m.lastActionRelative} - in faction: ${formatFactionTime(m.factionAgeSeconds)}`
                );
            });
        }
        lines.push(``);

        lines.push(`UNKNOWN REVIVE SETTING (${unknown.length})`);
        if (!unknown.length) {
            lines.push(`None`);
        } else {
            unknown.forEach(m => {
                lines.push(
                    `${m.name} [${m.id}] - last action: ${m.lastActionRelative} - in faction: ${formatFactionTime(m.factionAgeSeconds)}`
                );
            });
        }
        lines.push(``);

        lines.push(`FEDERAL (${federal.length})`);
        if (!federal.length) {
            lines.push(`None`);
        } else {
            federal.forEach(m => {
                lines.push(
                    `${m.name} [${m.id}] - Federal - last action: ${m.lastActionRelative} - revives: ${m.reviveSetting} - in faction: ${formatFactionTime(m.factionAgeSeconds)}`
                );
            });
        }

        return lines.join('\n');
    }

    function buildReviveOutput(members) {
        const revivesEveryone = members
            .filter(m => m.reviveSetting === 'Everyone')
            .sort((a, b) => a.name.localeCompare(b.name));

        const revivesRestricted = members
            .filter(m => m.reviveSetting === 'Friends/Faction')
            .sort((a, b) => a.name.localeCompare(b.name));

        const unknown = members
            .filter(m => m.reviveSetting === 'Unknown')
            .sort((a, b) => a.name.localeCompare(b.name));

        const lines = [];
        lines.push(`Faction revive settings audit`);
        lines.push(``);
        lines.push(...buildSummary(members));

        lines.push(`REVIVES ON - EVERYONE (${revivesEveryone.length})`);
        if (!revivesEveryone.length) {
            lines.push(`None`);
        } else {
            revivesEveryone.forEach(m => {
                lines.push(
                    `${m.name} [${m.id}] - last action: ${m.lastActionRelative} - in faction: ${formatFactionTime(m.factionAgeSeconds)}`
                );
            });
        }
        lines.push(``);

        lines.push(`REVIVES ON - RESTRICTED (${revivesRestricted.length})`);
        if (!revivesRestricted.length) {
            lines.push(`None`);
        } else {
            revivesRestricted.forEach(m => {
                lines.push(
                    `${m.name} [${m.id}] - last action: ${m.lastActionRelative} - in faction: ${formatFactionTime(m.factionAgeSeconds)}`
                );
            });
        }
        lines.push(``);

        lines.push(`UNKNOWN REVIVE SETTING (${unknown.length})`);
        if (!unknown.length) {
            lines.push(`None`);
        } else {
            unknown.forEach(m => {
                lines.push(
                    `${m.name} [${m.id}] - last action: ${m.lastActionRelative} - in faction: ${formatFactionTime(m.factionAgeSeconds)}`
                );
            });
        }

        return lines.join('\n');
    }

    async function fetchFactionMembersV2() {
        const key = getApiKey();
        if (!key) {
            throw new Error('No API key provided.');
        }

        const url = `https://api.torn.com/v2/faction/members?key=${encodeURIComponent(key)}&comment=steveo_faction_check_${Date.now()}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
            throw new Error(`API error ${data.error.code}: ${data.error.error}`);
        }

        return data;
    }

    async function runWarRiskCheck() {
        setStatus('Fetching faction members...');
        setOutput('');

        try {
            const data = await fetchFactionMembersV2();
            const members = normaliseMembers(data);
            const output = buildWarRiskOutput(members);

            setOutput(output);
            setStatus(`Done. Checked ${members.length} members.`);
        } catch (err) {
            console.error(err);
            setStatus('Request failed.');
            setOutput(`Request failed:\n${err.message || err}`);
        }
    }

    async function runReviveCheck() {
        setStatus('Fetching faction members / revive settings...');
        setOutput('');

        try {
            const data = await fetchFactionMembersV2();
            const members = normaliseMembers(data);
            const output = buildReviveOutput(members);

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