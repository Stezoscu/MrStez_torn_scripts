// ==UserScript==
// @name         Torn Chain Button + Target Rotation + API Key Manager
// @version      4.1
// @namespace    steveo.chain.button.targets
// @description  Floating chain timer with rotating target list, replace/merge tools, and locally stored Torn API key.
// @author       MrStez + Ace
// @match        https://www.torn.com/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEYS = {
        apiKey: 'steveo_chain_api_key',
        targets: 'steveo_chain_targets',
        index: 'steveo_chain_target_index',
        minimised: 'steveo_chain_minimised'
    };

    const RANDOM_FALLBACK = {
        enabled: false,
        minID: 3000000,
        maxID: 3400000
    };

    const REFRESH_INTERVAL_MS = 10000;
    const PANEL_TOP = '27%';
    const PANEL_RIGHT = '0%';

    let timeLeftSeconds = 0;
    let timerInterval = null;
    let refreshInterval = null;

    function getStoredApiKey() {
        return (localStorage.getItem(STORAGE_KEYS.apiKey) || '').trim();
    }

    function setStoredApiKey(key) {
        localStorage.setItem(STORAGE_KEYS.apiKey, key.trim());
    }

    function ensureApiKey() {
        let key = getStoredApiKey();
        if (key) return key;

        const input = prompt('Enter your Torn API key for the chain timer:');
        if (!input) return '';

        key = input.trim();
        if (!key) return '';

        setStoredApiKey(key);
        return key;
    }

    function loadTargets() {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.targets);
            const parsed = stored ? JSON.parse(stored) : [];
            return Array.isArray(parsed) ? parsed.filter(n => Number.isInteger(n)) : [];
        } catch {
            return [];
        }
    }

    function saveTargets(targets) {
        localStorage.setItem(STORAGE_KEYS.targets, JSON.stringify(targets));
    }

    function getCurrentIndex() {
        const raw = parseInt(localStorage.getItem(STORAGE_KEYS.index) || '0', 10);
        return Number.isNaN(raw) || raw < 0 ? 0 : raw;
    }

    function setCurrentIndex(index) {
        localStorage.setItem(STORAGE_KEYS.index, String(index));
    }

    function isMinimised() {
        return localStorage.getItem(STORAGE_KEYS.minimised) === '1';
    }

    function setMinimised(value) {
        localStorage.setItem(STORAGE_KEYS.minimised, value ? '1' : '0');
    }

    const panel = document.createElement('div');
    panel.id = 'steveo-chain-panel';
    panel.style.position = 'fixed';
    panel.style.top = PANEL_TOP;
    panel.style.right = PANEL_RIGHT;
    panel.style.zIndex = '99999';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.alignItems = 'flex-end';
    panel.style.gap = '4px';
    panel.style.fontFamily = 'Arial, sans-serif';

    const chainButton = document.createElement('button');
    const controlsRow = document.createElement('div');
    const replaceButton = document.createElement('button');
    const addButton = document.createElement('button');
    const keyButton = document.createElement('button');
    const miniButton = document.createElement('button');

    const buttonStyle = `
        border: none;
        border-radius: 6px;
        padding: 6px 8px;
        color: white;
        font-weight: bold;
        font-size: 14px;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    `;

    chainButton.style.cssText = buttonStyle + `
        min-width: 120px;
        background: gray;
    `;
    chainButton.textContent = 'Chain – ??';
    chainButton.title = 'Open next chain target';

    controlsRow.style.display = 'flex';
    controlsRow.style.gap = '4px';
    controlsRow.style.justifyContent = 'flex-end';
    controlsRow.style.alignItems = 'center';

    replaceButton.style.cssText = buttonStyle + `background: #666; min-width: 36px;`;
    replaceButton.textContent = '⚙️';
    replaceButton.title = 'Replace target list';

    addButton.style.cssText = buttonStyle + `background: #666; min-width: 36px;`;
    addButton.textContent = '➕';
    addButton.title = 'Add / merge targets into current list';

    keyButton.style.cssText = buttonStyle + `background: #666; min-width: 36px;`;
    keyButton.textContent = '🔑';
    keyButton.title = 'Set or replace Torn API key';

    miniButton.style.cssText = buttonStyle + `background: #666; min-width: 36px;`;
    miniButton.title = 'Minimise / expand';

    controlsRow.appendChild(addButton);
    controlsRow.appendChild(replaceButton);
    controlsRow.appendChild(keyButton);
    controlsRow.appendChild(miniButton);

    panel.appendChild(chainButton);
    panel.appendChild(controlsRow);
    document.body.appendChild(panel);

    function applyMinimisedState() {
        const minimised = isMinimised();

        if (minimised) {
            addButton.style.display = 'none';
            replaceButton.style.display = 'none';
            keyButton.style.display = 'none';
            miniButton.style.display = 'inline-block';
            miniButton.textContent = '+';
            miniButton.title = 'Expand controls';
            chainButton.style.minWidth = '90px';
        } else {
            addButton.style.display = 'inline-block';
            replaceButton.style.display = 'inline-block';
            keyButton.style.display = 'inline-block';
            miniButton.style.display = 'inline-block';
            miniButton.textContent = '–';
            miniButton.title = 'Minimise controls';
            chainButton.style.minWidth = '120px';
        }
    }

    function parseIDs(input) {
        if (!input) return [];

        const bracketMatches = [...input.matchAll(/\[(\d+)\]/g)];
        if (bracketMatches.length > 0) {
            return bracketMatches
                .map(match => parseInt(match[1], 10))
                .filter(id => !Number.isNaN(id));
        }

        return input
            .split(/[\s,;]+/)
            .map(part => parseInt(part.trim(), 10))
            .filter(id => !Number.isNaN(id));
    }

    function dedupePreserveOrder(ids) {
        return [...new Set(ids)];
    }

    function getNextTarget() {
        const targets = loadTargets();
        if (targets.length === 0) return null;

        let index = getCurrentIndex();
        if (index >= targets.length) index = 0;

        const target = targets[index];
        const nextIndex = (index + 1) % targets.length;
        setCurrentIndex(nextIndex);

        return target;
    }

    function getUpcomingTarget() {
        const targets = loadTargets();
        if (targets.length === 0) return null;

        let index = getCurrentIndex();
        if (index >= targets.length) index = 0;
        return targets[index];
    }

    function getRandomFallbackTarget() {
        if (!RANDOM_FALLBACK.enabled) return null;
        const { minID, maxID } = RANDOM_FALLBACK;
        return Math.floor(Math.random() * (maxID - minID + 1)) + minID;
    }

    function formatTime(seconds) {
        if (seconds < 0) seconds = 0;
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    function updateChainButtonDisplay() {
        if (timeLeftSeconds > 0) {
            chainButton.textContent = `Chain – ${formatTime(timeLeftSeconds)}`;
            chainButton.style.background = timeLeftSeconds < 60 ? 'red' : 'green';
        } else {
            chainButton.textContent = 'Chain – ??';
            chainButton.style.background = 'gray';
        }

        const upcoming = getUpcomingTarget();
        const targetCount = loadTargets().length;
        const keyStatus = getStoredApiKey() ? 'API key set' : 'No API key';
        chainButton.title = [
            upcoming ? `Next target: ${upcoming}` : 'No target list loaded',
            `Targets: ${targetCount}`,
            keyStatus
        ].join(' | ');
    }

    async function fetchChainData() {
        const apiKey = getStoredApiKey();
        if (!apiKey) {
            timeLeftSeconds = 0;
            updateChainButtonDisplay();
            return;
        }

        const apiUrl = `https://api.torn.com/faction/?selections=chain&key=${encodeURIComponent(apiKey)}`;

        try {
            const response = await fetch(apiUrl, { credentials: 'omit' });
            const data = await response.json();

            if (data?.error) {
                console.warn('[Chain Timer] Torn API error:', data.error);
                timeLeftSeconds = 0;

                if (String(data.error.code) === '2' || String(data.error.code) === '16') {
                    chainButton.textContent = 'Chain – Key?';
                    chainButton.style.background = '#8b5a00';
                }
                return;
            }

            if (data?.chain?.end) {
                const now = Math.floor(Date.now() / 1000);
                timeLeftSeconds = Math.max(0, data.chain.end - now);
            } else {
                timeLeftSeconds = 0;
            }
        } catch (error) {
            console.error('[Chain Timer] API request failed:', error);
            timeLeftSeconds = 0;
        } finally {
            updateChainButtonDisplay();
        }
    }

    function startCountdownLoop() {
        if (timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            if (timeLeftSeconds > 0) {
                timeLeftSeconds -= 1;
            }
            updateChainButtonDisplay();
        }, 1000);
    }

    function startRefreshLoop() {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(fetchChainData, REFRESH_INTERVAL_MS);
    }

    chainButton.addEventListener('click', () => {
        const targetID = getNextTarget() || getRandomFallbackTarget();

        if (!targetID) {
            alert('No target list found. Use ➕ to add targets or ⚙️ to replace the list.');
            return;
        }

        window.location.href = `https://www.torn.com/loader.php?sid=attack&user2ID=${targetID}`;
    });

    replaceButton.addEventListener('click', () => {
        const currentTargets = loadTargets();
        const input = prompt(
            'Paste target IDs or raw Torn text to REPLACE your current list:',
            currentTargets.join(', ')
        );
        if (input === null) return;

        const parsed = dedupePreserveOrder(parseIDs(input));
        if (parsed.length === 0) {
            alert('No valid IDs found.');
            return;
        }

        saveTargets(parsed);
        setCurrentIndex(0);
        updateChainButtonDisplay();
        alert(`Replaced target list with ${parsed.length} IDs.`);
    });

    addButton.addEventListener('click', () => {
        const input = prompt('Paste target IDs or raw Torn text to ADD / MERGE into your current list:');
        if (input === null) return;

        const parsed = dedupePreserveOrder(parseIDs(input));
        if (parsed.length === 0) {
            alert('No valid IDs found.');
            return;
        }

        const current = loadTargets();
        const currentSet = new Set(current);
        const actuallyNew = parsed.filter(id => !currentSet.has(id));
        const merged = [...current, ...actuallyNew];

        saveTargets(merged);
        updateChainButtonDisplay();

        alert(`Added ${actuallyNew.length} new IDs. Total list size: ${merged.length}.`);
    });

    keyButton.addEventListener('click', async () => {
        const current = getStoredApiKey();
        const input = prompt('Enter your Torn API key:', current || '');
        if (input === null) return;

        const trimmed = input.trim();
        if (!trimmed) {
            const shouldClear = confirm('Clear the saved API key?');
            if (shouldClear) {
                localStorage.removeItem(STORAGE_KEYS.apiKey);
                timeLeftSeconds = 0;
                updateChainButtonDisplay();
                alert('Saved API key cleared.');
            }
            return;
        }

        setStoredApiKey(trimmed);
        await fetchChainData();
        alert('API key saved.');
    });

    miniButton.addEventListener('click', () => {
        const newState = !isMinimised();
        setMinimised(newState);
        applyMinimisedState();
    });

    function init() {
        ensureApiKey();
        applyMinimisedState();
        updateChainButtonDisplay();
        fetchChainData();
        startCountdownLoop();
        startRefreshLoop();
    }

    init();
})();