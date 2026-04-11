// ==UserScript==
// @name         Torn Chain Button + Live API Timer
// @version      3.0
// @namespace    steveo.chain.button.timer
// @description  Always-visible chain button with stored API key and more accurate live countdown from Torn API.
// @author       Omanpx + Ace + MrStez
// @match        https://www.torn.com/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const API_KEY_STORAGE = 'steveo_torn_api_key';
    const BUTTON_ID = 'steveo-chain-button';
    const CONFIG_ID = 'steveo-chain-config-button';

    // Tiny/inactive target range
    const minID = 3000000;
    const maxID = 3400000;

    // Refresh chain data every X ms while visible
    const API_REFRESH_MS = 15000;

    let apiKey = '';
    let chainEndTimestamp = 0;
    let lastFetchedAt = 0;
    let timerInterval = null;
    let refreshInterval = null;

    function getApiKey() {
        return localStorage.getItem(API_KEY_STORAGE) || '';
    }

    function setApiKey(key) {
        localStorage.setItem(API_KEY_STORAGE, key.trim());
        apiKey = key.trim();
    }

    function promptForApiKey(force = false) {
        const existing = getApiKey();
        if (existing && !force) {
            apiKey = existing;
            return true;
        }

        const entered = window.prompt('Enter your Torn API key for the chain timer:', existing || '');
        if (!entered || !entered.trim()) {
            return false;
        }

        setApiKey(entered);
        return true;
    }

    function formatTime(seconds) {
        const safe = Math.max(0, Math.floor(seconds));
        const m = Math.floor(safe / 60).toString().padStart(2, '0');
        const s = (safe % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    function getTimeLeftSeconds() {
        if (!chainEndTimestamp) return 0;
        return Math.max(0, chainEndTimestamp - Math.floor(Date.now() / 1000));
    }

    function getButton() {
        return document.getElementById(BUTTON_ID);
    }

    function updateButtonDisplay() {
        const button = getButton();
        if (!button) return;

        const timeLeftSeconds = getTimeLeftSeconds();

        if (!apiKey) {
            button.textContent = 'Chain – No Key';
            button.style.backgroundColor = '#666';
            return;
        }

        if (timeLeftSeconds > 0) {
            button.textContent = `Chain – ${formatTime(timeLeftSeconds)}`;

            if (timeLeftSeconds < 30) {
                button.style.backgroundColor = '#b22222'; // urgent
            } else if (timeLeftSeconds < 60) {
                button.style.backgroundColor = '#d97706'; // warning
            } else {
                button.style.backgroundColor = '#15803d'; // healthy
            }
        } else {
            button.textContent = 'Chain – 00:00';
            button.style.backgroundColor = '#666';
        }
    }

    async function fetchChainData() {
        if (!apiKey) return;

        const url = `https://api.torn.com/faction/?selections=chain&key=${encodeURIComponent(apiKey)}`;

        try {
            const response = await fetch(url, { cache: 'no-store' });
            const data = await response.json();

            if (data?.error) {
                console.error('[Chain Timer] Torn API error:', data.error);
                chainEndTimestamp = 0;

                const button = getButton();
                if (button) {
                    button.textContent = `Chain – API Err`;
                    button.style.backgroundColor = '#7f1d1d';
                }
                return;
            }

            // Old Torn API chain object generally includes `current` and `end`
            if (data.chain && typeof data.chain.end === 'number') {
                chainEndTimestamp = data.chain.end;
            } else {
                chainEndTimestamp = 0;
            }

            lastFetchedAt = Date.now();
            updateButtonDisplay();
        } catch (error) {
            console.error('[Chain Timer] Fetch failed:', error);
        }
    }

    function pickRandomTarget() {
        const randID = Math.floor(Math.random() * (maxID - minID + 1)) + minID;
        return `https://www.torn.com/loader.php?sid=attack&user2ID=${randID}`;
    }

    function createButton() {
        if (document.getElementById(BUTTON_ID)) return;

        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.textContent = 'Chain – ??';

        Object.assign(button.style, {
            position: 'fixed',
            top: '27%',
            right: '0',
            zIndex: '9999',
            backgroundColor: '#666',
            color: '#fff',
            border: 'none',
            padding: '8px 10px',
            borderRadius: '6px 0 0 6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)'
        });

        button.addEventListener('click', () => {
            if (!apiKey) {
                const ok = promptForApiKey();
                if (!ok) return;
                fetchChainData();
            }

            window.location.href = pickRandomTarget();
        });

        document.body.appendChild(button);
    }

    function createConfigButton() {
        if (document.getElementById(CONFIG_ID)) return;

        const configBtn = document.createElement('button');
        configBtn.id = CONFIG_ID;
        configBtn.type = 'button';
        configBtn.textContent = '⚙';

        Object.assign(configBtn.style, {
            position: 'fixed',
            top: 'calc(27% + 42px)',
            right: '0',
            zIndex: '9999',
            backgroundColor: '#1f2937',
            color: '#fff',
            border: 'none',
            padding: '6px 8px',
            borderRadius: '6px 0 0 6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '13px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)'
        });

        configBtn.title = 'Set / change Torn API key';

        configBtn.addEventListener('click', async () => {
            const ok = promptForApiKey(true);
            if (!ok) return;
            await fetchChainData();
            updateButtonDisplay();
        });

        document.body.appendChild(configBtn);
    }

    function ensureUi() {
        createButton();
        createConfigButton();
        updateButtonDisplay();
    }

    function startLoops() {
        if (timerInterval) clearInterval(timerInterval);
        if (refreshInterval) clearInterval(refreshInterval);

        // Visual countdown updates
        timerInterval = setInterval(() => {
            updateButtonDisplay();
        }, 250);

        // API refresh
        refreshInterval = setInterval(() => {
            if (!document.hidden) {
                fetchChainData();
            }
        }, API_REFRESH_MS);
    }

    function handleVisibilityChange() {
        if (!document.hidden) {
            // Re-sync when tab becomes active again
            fetchChainData();
        }
    }

    function init() {
        apiKey = getApiKey();

        ensureUi();
        startLoops();

        if (!apiKey) {
            updateButtonDisplay();
        } else {
            fetchChainData();
        }

        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Handle Torn's SPA-ish behaviour by checking UI still exists
    setInterval(() => {
        ensureUi();
    }, 2000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();