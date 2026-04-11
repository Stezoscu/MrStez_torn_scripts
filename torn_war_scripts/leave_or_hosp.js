// ==UserScript==
// @name         TornPDA Attack Result Helper
// @namespace    steveo.attack.result.helper.pda
// @version      4.0.0
// @description  PDA-first helper that recommends Leave or Hospitalise by highlighting the suggested result button.
// @author       MrStez / Ace
// @match        https://www.torn.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    /******************************************************************
     * CONFIG
     ******************************************************************/
    const API_KEY_CANDIDATES = [
        'steveo_torn_api_key',
        'tph_join_start_api_key',
        'torn_api_key',
        'tph_attack_result_helper_api_key'
    ];

    const OWN_API_KEY_STORAGE = 'tph_attack_result_helper_api_key';

    const LAST_ACTION_THRESHOLD_MINUTES = 15;

    const SCAN_MS = 700;            // light PDA polling
    const API_TTL_MS = 30000;       // reuse fetched data for same target
    const PREFETCH_COOLDOWN_MS = 5000;

    const STYLE_ID = 'steveo-arh-pda-style';
    const CHIP_ID = 'steveo-arh-pda-chip';
    const KEY_PROMPT_ID = 'steveo-arh-pda-keyprompt';

    /******************************************************************
     * STATE
     ******************************************************************/
    let currentTargetId = null;
    let cachedTargetData = null;
    let cachedTargetFetchedAt = 0;
    let lastPrefetchAttemptAt = 0;
    let lastProcessedResultKey = null;
    let lastUrl = location.href;

    /******************************************************************
     * HELPERS
     ******************************************************************/
    function isAttackPage() {
        return location.href.includes('sid=attack');
    }

    function normaliseText(text) {
        return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function getStoredApiKeyInfo() {
        for (const key of API_KEY_CANDIDATES) {
            const value = (localStorage.getItem(key) || '').trim();
            if (value) return { key, value };
        }
        return { key: null, value: '' };
    }

    function getApiKey() {
        return getStoredApiKeyInfo().value;
    }

    function setApiKey(value) {
        const clean = (value || '').trim();
        if (!clean) return;
        localStorage.setItem(OWN_API_KEY_STORAGE, clean);

        const existing = getStoredApiKeyInfo();
        if (!existing.value) {
            localStorage.setItem(API_KEY_CANDIDATES[0], clean);
        }
    }

    function minutesAgoFromTimestamp(ts) {
        if (!ts || Number.isNaN(ts)) return null;
        return Math.floor((Date.now() / 1000 - ts) / 60);
    }

    function shortMinutes(mins) {
        if (mins == null) return '?';
        if (mins <= 0) return '<1m';
        return `${mins}m`;
    }

    function clearHighlights() {
        document.querySelectorAll('.steveo-arh-recommended').forEach(el => {
            el.classList.remove('steveo-arh-recommended');
        });
    }

    function resetState() {
        currentTargetId = null;
        cachedTargetData = null;
        cachedTargetFetchedAt = 0;
        lastPrefetchAttemptAt = 0;
        lastProcessedResultKey = null;
        clearHighlights();
        removeChip();
        removeKeyPrompt();
    }

    /******************************************************************
     * STYLES
     ******************************************************************/
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .steveo-arh-recommended {
                box-shadow: 0 0 0 3px rgba(70, 220, 90, 0.95) !important;
                border-radius: 10px !important;
                filter: brightness(1.08) saturate(1.08) !important;
                position: relative !important;
            }

            .steveo-arh-recommended::after {
                content: "✓";
                position: absolute;
                top: -8px;
                right: -8px;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: #34b34a;
                color: #fff;
                font-size: 12px;
                font-weight: 800;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 6px rgba(0,0,0,0.35);
                z-index: 2;
            }

            #${CHIP_ID} {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                min-height: 24px;
                padding: 4px 10px;
                margin: 0 auto 10px auto;
                border-radius: 999px;
                background: rgba(20, 20, 20, 0.88);
                color: #fff;
                font-size: 11px;
                font-weight: 700;
                line-height: 1.2;
                box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                border: 1px solid rgba(255,255,255,0.08);
                width: fit-content;
                max-width: 90%;
                text-align: center;
                pointer-events: none;
            }

            #${CHIP_ID}.leave {
                background: rgba(18, 70, 28, 0.92);
                border-color: rgba(80, 220, 100, 0.35);
            }

            #${CHIP_ID}.hospitalise {
                background: rgba(18, 70, 28, 0.92);
                border-color: rgba(80, 220, 100, 0.35);
            }

            #${CHIP_ID}.neutral {
                background: rgba(45, 45, 45, 0.92);
            }

            #${KEY_PROMPT_ID} {
                position: fixed;
                top: 92px;
                right: 10px;
                z-index: 999999;
                padding: 7px 9px;
                border-radius: 10px;
                background: rgba(45, 35, 20, 0.96);
                color: #fff;
                font-size: 11px;
                line-height: 1.25;
                border: 1px solid rgba(255, 210, 100, 0.28);
                box-shadow: 0 4px 12px rgba(0,0,0,0.28);
                max-width: 180px;
            }

            #${KEY_PROMPT_ID} .main {
                font-weight: 700;
                margin-bottom: 5px;
            }

            #${KEY_PROMPT_ID} button {
                background: rgba(255,255,255,0.08);
                color: #fff;
                border: 1px solid rgba(255,255,255,0.14);
                border-radius: 7px;
                padding: 3px 8px;
                font-size: 11px;
            }
        `;
        document.head.appendChild(style);
    }

    /******************************************************************
     * UI
     ******************************************************************/
    function getChip() {
        return document.getElementById(CHIP_ID);
    }

    function removeChip() {
        const chip = getChip();
        if (chip) chip.remove();
    }

    function ensureChipHost() {
        const hospBtn = findActionButton('Hospitalize') || findActionButton('Hospitalise');
        const leaveBtn = findActionButton('Leave');
        const button = hospBtn || leaveBtn;
        if (!button) return null;

        const actionBox =
            button.closest('div')?.parentElement ||
            button.parentElement;

        return actionBox || null;
    }

    function showChip(mode, text) {
        const host = ensureChipHost();
        if (!host) return;

        let chip = getChip();
        if (!chip) {
            chip = document.createElement('div');
            chip.id = CHIP_ID;
            host.insertBefore(chip, host.firstChild);
        }

        chip.className = mode || 'neutral';
        chip.textContent = text || '';
    }

    function getKeyPrompt() {
        return document.getElementById(KEY_PROMPT_ID);
    }

    function removeKeyPrompt() {
        const el = getKeyPrompt();
        if (el) el.remove();
    }

    function showKeyPrompt() {
        if (!isAttackPage() || getApiKey()) {
            removeKeyPrompt();
            return;
        }

        let prompt = getKeyPrompt();
        if (!prompt) {
            prompt = document.createElement('div');
            prompt.id = KEY_PROMPT_ID;
            prompt.innerHTML = `
                <div class="main">API key missing</div>
                <button type="button">Set Key</button>
            `;
            document.body.appendChild(prompt);

            prompt.querySelector('button')?.addEventListener('click', () => {
                const existing = getApiKey();
                const entered = window.prompt('Enter Torn API key', existing || '');
                if (entered !== null) {
                    setApiKey(entered);
                    removeKeyPrompt();
                    cachedTargetData = null;
                    cachedTargetFetchedAt = 0;
                    lastProcessedResultKey = null;
                }
            });
        }
    }

    /******************************************************************
     * BUTTONS / DOM
     ******************************************************************/
    function getInteractiveElements() {
        return Array.from(document.querySelectorAll(
            'button, a, input[type="button"], input[type="submit"], div[role="button"], span[role="button"]'
        ));
    }

    function findActionButton(label) {
        const wanted = normaliseText(label);
        const els = getInteractiveElements();

        for (const el of els) {
            const text = normaliseText(
                el.textContent ||
                el.value ||
                el.getAttribute('aria-label') ||
                el.getAttribute('title')
            );
            if (!text) continue;
            if (text === wanted || text.includes(wanted)) return el;
        }
        return null;
    }

    function getResultButtons() {
        const leaveBtn = findActionButton('Leave');
        const hospBtn = findActionButton('Hospitalize') || findActionButton('Hospitalise');
        const mugBtn = findActionButton('Mug');
        return { leaveBtn, hospBtn, mugBtn };
    }

    function resultScreenVisible() {
        const { leaveBtn, hospBtn } = getResultButtons();
        return !!(leaveBtn && hospBtn);
    }

    /******************************************************************
     * TARGET ID DETECTION
     *
     * PDA-first: try current URL first, then profile-ish links.
     ******************************************************************/
    function extractTargetId() {
        const urlPatterns = [
            /[?&]user2ID=(\d+)/i,
            /[?&]XID=(\d+)/i,
            /[?&]userID=(\d+)/i
        ];

        const href = location.href;
        for (const pattern of urlPatterns) {
            const m = href.match(pattern);
            if (m) return m[1];
        }

        const patterns = [
            /[?&]XID=(\d+)/i,
            /[?&]userID=(\d+)/i,
            /loader\.php\?sid=profile&userID=(\d+)/i,
            /profiles\.php\?XID=(\d+)/i
        ];

        const links = Array.from(document.querySelectorAll('a[href]'));
        for (const link of links) {
            const hrefVal = link.getAttribute('href') || link.href || '';
            if (!/profile|XID=|userID=/i.test(hrefVal)) continue;
            for (const pattern of patterns) {
                const m = hrefVal.match(pattern);
                if (m) return m[1];
            }
        }

        return null;
    }

    /******************************************************************
     * API
     ******************************************************************/
    async function fetchTargetData(targetId, force = false) {
        const apiKey = getApiKey();
        if (!apiKey || !targetId) return null;

        const now = Date.now();

        if (
            !force &&
            cachedTargetData &&
            currentTargetId === targetId &&
            (now - cachedTargetFetchedAt) < API_TTL_MS
        ) {
            return cachedTargetData;
        }

        try {
            const url = `https://api.torn.com/user/${targetId}?selections=profile&key=${encodeURIComponent(apiKey)}`;
            const res = await fetch(url, { cache: 'no-store' });
            const data = await res.json();

            if (data?.error) return null;

            const result = {
                targetId,
                statusState: data?.status?.state || 'Unknown',
                statusDescription: data?.status?.description || '',
                lastActionTimestamp: Number(data?.last_action?.timestamp || 0),
                lastActionRelative: data?.last_action?.relative || 'Unknown',
                lastActionStatus: data?.last_action?.status || ''
            };

            result.minsAgo = minutesAgoFromTimestamp(result.lastActionTimestamp);

            currentTargetId = targetId;
            cachedTargetData = result;
            cachedTargetFetchedAt = now;

            return result;
        } catch {
            return null;
        }
    }

    /******************************************************************
     * DECISION
     ******************************************************************/
    function decideAction(data) {
        if (!data) {
            return {
                action: null,
                chip: 'No data'
            };
        }

        const status = normaliseText(data.statusState);
        const minsAgo = data.minsAgo;

        if (status.includes('online')) {
            return {
                action: 'hospitalise',
                chip: 'HOSP • online'
            };
        }

        if (minsAgo != null && minsAgo > LAST_ACTION_THRESHOLD_MINUTES) {
            return {
                action: 'leave',
                chip: `LEAVE • ${shortMinutes(minsAgo)}`
            };
        }

        return {
            action: 'hospitalise',
            chip: `HOSP • ${shortMinutes(minsAgo)}`
        };
    }

    /******************************************************************
     * PREFETCH DURING FIGHT
     ******************************************************************/
    async function prefetchIfNeeded() {
        if (!isAttackPage()) return;
        if (!getApiKey()) return;
        if (resultScreenVisible()) return;

        const targetId = extractTargetId();
        if (!targetId) return;

        const now = Date.now();

        if (
            currentTargetId === targetId &&
            cachedTargetData &&
            (now - cachedTargetFetchedAt) < API_TTL_MS
        ) {
            return;
        }

        if ((now - lastPrefetchAttemptAt) < PREFETCH_COOLDOWN_MS) {
            return;
        }

        lastPrefetchAttemptAt = now;
        await fetchTargetData(targetId, false);
    }

    /******************************************************************
     * APPLY RESULT UI
     ******************************************************************/
    function applyRecommendation() {
        if (!isAttackPage()) {
            resetState();
            return;
        }

        const { leaveBtn, hospBtn } = getResultButtons();

        if (!leaveBtn || !hospBtn) {
            clearHighlights();
            removeChip();
            lastProcessedResultKey = null;
            return;
        }

        if (!getApiKey()) {
            clearHighlights();
            showChip('neutral', 'Set API key');
            return;
        }

        const targetId = extractTargetId() || currentTargetId;
        if (!targetId) {
            clearHighlights();
            showChip('neutral', 'No target found');
            return;
        }

        const resultKey = `${location.pathname}|${location.hash}|${targetId}`;

        const data = (currentTargetId === targetId && cachedTargetData)
            ? cachedTargetData
            : null;

        if (!data) {
            clearHighlights();
            showChip('neutral', 'Checking…');
            return;
        }

        const decision = decideAction(data);

        if (decision.action === 'leave') {
            clearHighlights();
            leaveBtn.classList.add('steveo-arh-recommended');
            showChip('leave', decision.chip);
        } else if (decision.action === 'hospitalise') {
            clearHighlights();
            hospBtn.classList.add('steveo-arh-recommended');
            showChip('hospitalise', decision.chip);
        } else {
            clearHighlights();
            showChip('neutral', decision.chip || 'No data');
        }

        lastProcessedResultKey = resultKey;
    }

    /******************************************************************
     * LOOP
     ******************************************************************/
    async function tick() {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            resetState();
        }

        injectStyles();
        showKeyPrompt();

        await prefetchIfNeeded();
        applyRecommendation();
    }

    function init() {
        injectStyles();
        setInterval(() => {
            tick().catch(() => {});
        }, SCAN_MS);
    }

    init();
})();