// ==UserScript==
// @name         Torn Net Worth Display
// @namespace    steveo.profile.networth
// @version      1.1
// @updateURL    https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_user_scripts/end_user_scripts/netwoth_on_profile.js
// @downloadURL  https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_user_scripts/end_user_scripts/netwoth_on_profile.js
// @description  Display a player's net worth on their profile page
// @author       MrStez
// @match        https://www.torn.com/profiles.php*
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// ==/UserScript==

(function () {
    'use strict';

    const API_KEY_STORAGE = 'steveo_torn_api_key';
    const NETWORTH_ID = 'steveo-networth-display';
    const STATUS_ID = 'steveo-networth-status';

    let lastPlayerId = null;
    let lastInsertedFor = null;

    function getPlayerId() {
        const params = new URLSearchParams(window.location.search);
        return params.get('XID');
    }

    function getApiKey() {
        let key = localStorage.getItem(API_KEY_STORAGE);

        if (!key) {
            key = prompt('Enter your Torn API key for the Net Worth script:');
            if (key) {
                key = key.trim();
                localStorage.setItem(API_KEY_STORAGE, key);
            }
        }

        return key || '';
    }

    function formatNetWorth(num) {
        if (!Number.isFinite(num)) return 'Unknown';
        if (num >= 1_000_000_000_000) {
            return (num / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '') + 'tn';
        }
        if (num >= 1_000_000_000) {
            return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'bn';
        }
        if (num >= 1_000_000) {
            return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
        }
        if (num >= 1_000) {
            return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
        }
        return String(num);
    }

    function findProfileContainer() {
        return (
            document.querySelector('.user-information') ||
            document.querySelector('.user-info-list') ||
            document.querySelector('.profile-wrapper') ||
            document.querySelector('.profile-container') ||
            document.querySelector('#profileroot') ||
            document.querySelector('div[class*="profile"]') ||
            document.body
        );
    }

    function removeExisting() {
        const existing = document.getElementById(NETWORTH_ID);
        if (existing) existing.remove();

        const status = document.getElementById(STATUS_ID);
        if (status) status.remove();
    }

    function insertStatus(text) {
        const container = findProfileContainer();
        if (!container) return;

        let existing = document.getElementById(STATUS_ID);
        if (existing) {
            existing.textContent = text;
            return;
        }

        const el = document.createElement('div');
        el.id = STATUS_ID;
        el.textContent = text;
        el.style.marginTop = '6px';
        el.style.padding = '6px 10px';
        el.style.fontWeight = 'bold';
        el.style.borderRadius = '6px';
        el.style.background = 'rgba(0,0,0,0.15)';
        el.style.color = '#cccccc';
        el.style.fontSize = '12px';

        container.prepend(el);
    }

    function insertNetWorth(netWorthText, rawValue) {
        const container = findProfileContainer();
        if (!container) return;

        const existingStatus = document.getElementById(STATUS_ID);
        if (existingStatus) existingStatus.remove();

        let existing = document.getElementById(NETWORTH_ID);
        if (existing) {
            existing.querySelector('.steveo-networth-value').textContent = netWorthText;
            existing.title = `Net worth: ${rawValue.toLocaleString()}`;
            return;
        }

        const wrap = document.createElement('div');
        wrap.id = NETWORTH_ID;
        wrap.title = `Net worth: ${rawValue.toLocaleString()}`;
        wrap.style.marginTop = '6px';
        wrap.style.padding = '6px 10px';
        wrap.style.fontWeight = 'bold';
        wrap.style.borderRadius = '6px';
        wrap.style.background = 'rgba(46, 204, 113, 0.12)';
        wrap.style.border = '1px solid rgba(46, 204, 113, 0.35)';
        wrap.style.color = '#2ecc71';
        wrap.style.fontSize = '13px';
        wrap.style.display = 'inline-block';
        wrap.style.maxWidth = '100%';

        wrap.innerHTML = `
            <span>💰 Net worth: </span>
            <span class="steveo-networth-value">${netWorthText}</span>
        `;

        container.prepend(wrap);
    }

    function fetchNetWorth(playerId, apiKey) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.torn.com/user/${playerId}?selections=personalstats&key=${encodeURIComponent(apiKey)}`,
                timeout: 15000,
                onload: function (response) {
                    try {
                        const data = JSON.parse(response.responseText);

                        if (data.error) {
                            reject(new Error(data.error.error || 'Unknown Torn API error'));
                            return;
                        }

                        const ps = data.personalstats || {};
                        const netWorth =
                            typeof ps.networth === 'number'
                                ? ps.networth
                                : (ps.networth && typeof ps.networth.total === 'number')
                                    ? ps.networth.total
                                    : 0;

                        resolve(netWorth);
                    } catch (err) {
                        reject(new Error('Failed to parse Torn API response'));
                    }
                },
                onerror: function () {
                    reject(new Error('Request failed'));
                },
                ontimeout: function () {
                    reject(new Error('Request timed out'));
                }
            });
        });
    }

    async function updateNetWorth() {
        const playerId = getPlayerId();
        if (!playerId) return;

        if (lastInsertedFor === playerId && document.getElementById(NETWORTH_ID)) {
            return;
        }

        const apiKey = getApiKey();
        if (!apiKey) {
            insertStatus('Net worth: no API key saved');
            return;
        }

        insertStatus('Net worth: loading...');

        try {
            const netWorth = await fetchNetWorth(playerId, apiKey);
            insertNetWorth(formatNetWorth(netWorth), netWorth);
            lastInsertedFor = playerId;
        } catch (err) {
            console.warn('[Net Worth Script]', err.message);
            insertStatus(`Net worth: unavailable`);
        }
    }

    function pageReady() {
        return !!findProfileContainer();
    }

    function checkPageChange() {
        const playerId = getPlayerId();
        if (!playerId) return;

        if (playerId !== lastPlayerId) {
            lastPlayerId = playerId;
            removeExisting();
            updateNetWorth();
            return;
        }

        if (!document.getElementById(NETWORTH_ID) && !document.getElementById(STATUS_ID)) {
            updateNetWorth();
        }
    }

    function init() {
        const observer = new MutationObserver(() => {
            if (pageReady()) {
                checkPageChange();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        checkPageChange();
        setInterval(checkPageChange, 1500);
    }

    init();
})();