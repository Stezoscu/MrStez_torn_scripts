// ==UserScript==
// @name         Torn Faction Bot - War Page & Dibs
// @namespace    tornfactionbot.war
// @version      1.1.0
// @description  Dibs system and opponent tracking overlay for the war page
// @author       Mr_Stez
// @match        https://www.torn.com/factions.php*
// @match        https://www.torn.com/loader.php?sid=attack*
// @grant        GM_xmlhttpRequest
// @connect      torn-faction-bot-production.up.railway.app
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const SERVER_URL = 'https://torn-faction-bot-production.up.railway.app';
    const STORAGE = {
        TOKEN:   'tfb_token',
        TORN_ID: 'tfb_torn_id',
        NAME:    'tfb_torn_name',
    };

    const getToken  = () => localStorage.getItem(STORAGE.TOKEN) || '';
    const getTornId = () => parseInt(localStorage.getItem(STORAGE.TORN_ID) || '0');
    const getName   = () => localStorage.getItem(STORAGE.NAME) || '';

    // ─── Page detection ───────────────────────────────────────

    function isWarPage() {
        return location.pathname === '/factions.php'
            && (location.hash.startsWith('#/war')
                || location.hash === '#/');
    }

    function isAttackPage() {
        return location.pathname === '/loader.php'
            && location.search.includes('sid=attack');
    }

    function pageFocused() {
        // TornPDA doesn't support hasFocus — always return true
        if (IS_PDA) return true;
        return document.hasFocus();
    }

    // ─── Environment detection ────────────────────────────────

    const IS_PDA = typeof PDA_httpGet === 'function';
    const IS_GM  = typeof GM_xmlhttpRequest === 'function';

    // ─── API helpers ──────────────────────────────────────────

    function apiGet(path, callback) {
        const url = `${SERVER_URL}${path}`;

        if (IS_PDA) {
            PDA_httpGet(url)
                .then(r => {
                    try { callback(null, JSON.parse(r)); }
                    catch(e) { callback(e, null); }
                })
                .catch(() => callback(new Error('Network error'), null));
        } else if (IS_GM) {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                onload: r => {
                    try { callback(null, JSON.parse(r.responseText)); }
                    catch(e) { callback(e, null); }
                },
                onerror: () => callback(new Error('Network error'), null)
            });
        } else {
            fetch(url)
                .then(r => r.json())
                .then(d => callback(null, d))
                .catch(e => callback(e, null));
        }
    }

    function apiPost(path, data, callback) {
        const url = `${SERVER_URL}${path}`;
        const body = JSON.stringify({ token: getToken(), ...data });
        const headers = { 'Content-Type': 'application/json' };

        if (IS_PDA) {
            PDA_httpPost(url, headers, body)
                .then(r => {
                    try { callback(null, JSON.parse(r)); }
                    catch(e) { callback(e, null); }
                })
                .catch(() => callback(new Error('Network error'), null));
        } else if (IS_GM) {
            GM_xmlhttpRequest({
                method: 'POST',
                url,
                headers,
                data: body,
                onload: r => {
                    try { callback(null, JSON.parse(r.responseText)); }
                    catch(e) { callback(e, null); }
                },
                onerror: () => callback(new Error('Network error'), null)
            });
        } else {
            fetch(url, { method: 'POST', headers, body })
                .then(r => r.json())
                .then(d => callback(null, d))
                .catch(e => callback(e, null));
        }
    }

    // ─── State ────────────────────────────────────────────────

    const state = {
        allDibs: {},
        myDibs: null,
        warId: null,
        refreshTimer: null,
        countdownTimer: null,
        injectionTimer: null,
        lastInjectedCount: 0,
    };

    // ─── Styles ───────────────────────────────────────────────

    function injectStyles() {
        if (document.getElementById('tfb-war-styles')) return;
        const style = document.createElement('style');
        style.id = 'tfb-war-styles';
        style.textContent = `
            .tfb-dibs-badge {
                display: inline-block !important;
                font-size: 10px !important;
                font-weight: bold !important;
                padding: 1px 5px !important;
                border-radius: 4px !important;
                margin-left: 4px !important;
                vertical-align: middle !important;
                cursor: pointer !important;
                white-space: nowrap !important;
                text-decoration: none !important;
                line-height: 1.4 !important;
            }
            .tfb-dibs-mine {
                background: #14532d !important;
                color: #4ade80 !important;
                border: 1px solid #4ade80 !important;
            }
            .tfb-dibs-other {
                background: #1e3a5f !important;
                color: #93c5fd !important;
                border: 1px solid #93c5fd !important;
            }
            .tfb-dibs-ready {
                background: #7f1d1d !important;
                color: #fca5a5 !important;
                border: 1px solid #ef4444 !important;
                animation: tfb-pulse 1s infinite !important;
            }
            @keyframes tfb-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            .tfb-claim-btn {
                display: inline-block !important;
                font-size: 10px !important;
                font-weight: bold !important;
                padding: 1px 5px !important;
                border-radius: 4px !important;
                margin-left: 4px !important;
                cursor: pointer !important;
                background: #4c1d95 !important;
                color: #e9d5ff !important;
                border: 1px solid #7c3aed !important;
                vertical-align: middle !important;
                white-space: nowrap !important;
                text-decoration: none !important;
                line-height: 1.4 !important;
            }
            .tfb-claim-btn:hover { opacity: 0.85 !important; }
            #tfb-war-panel {
                position: fixed;
                top: 60px;
                right: 10px;
                width: 240px;
                background: #1a1a2e;
                color: #eee;
                border: 1px solid #7c5cff;
                border-radius: 10px;
                padding: 10px;
                z-index: 999999;
                font-family: Arial, sans-serif;
                font-size: 12px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.5);
            }
            #tfb-war-panel h4 {
                margin: 0 0 6px 0;
                color: #a78bfa;
                font-size: 13px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .tfb-my-dibs-box {
                background: #14532d;
                border: 1px solid #4ade80;
                border-radius: 6px;
                padding: 5px 8px;
                margin-bottom: 6px;
                color: #4ade80;
                font-size: 11px;
            }
            .tfb-my-dibs-box.ready {
                background: #7f1d1d;
                border-color: #ef4444;
                color: #fca5a5;
                animation: tfb-pulse 1s infinite;
            }
            .tfb-release-btn {
                font-size: 10px;
                padding: 1px 5px;
                border-radius: 3px;
                cursor: pointer;
                background: #374151;
                color: #9ca3af;
                border: 1px solid #4b5563;
                margin-left: 6px;
            }
            #tfb-toggle-btn {
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 999999;
                background: #7c5cff;
                color: #fff;
                border: none;
                border-radius: 6px;
                padding: 5px 10px;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                font-family: Arial, sans-serif;
            }
        `;
        document.head.appendChild(style);
    }

    // ─── Panel ────────────────────────────────────────────────

    function createPanel() {
        if (document.getElementById('tfb-war-panel')) return;

        const toggle = document.createElement('button');
        toggle.id = 'tfb-toggle-btn';
        toggle.textContent = '⚔️ Bot';
        toggle.onclick = () => {
            const p = document.getElementById('tfb-war-panel');
            if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
        };
        document.body.appendChild(toggle);

        const panel = document.createElement('div');
        panel.id = 'tfb-war-panel';
        panel.innerHTML = '<h4>⚔️ Faction Bot</h4><div style="color:#6b7280">Loading...</div>';
        document.body.appendChild(panel);
    }

    function updatePanel() {
        const panel = document.getElementById('tfb-war-panel');
        if (!panel) return;

        const myDibs = state.myDibs;
        const dibsCount = Object.keys(state.allDibs).length;
        let myDibsHtml = '<div style="color:#6b7280;font-size:11px">No active dibs — click 🎯 to claim</div>';

        if (myDibs) {
            const isReady = myDibs.status === 'ready';
            const cls = isReady ? 'tfb-my-dibs-box ready' : 'tfb-my-dibs-box';
            const countdownHtml = isReady && myDibs.window_expires_at
                ? `<br><span id="tfb-countdown">⚡ ATTACK NOW — calculating...</span>`
                : '';

            myDibsHtml = `
                <div class="${cls}">
                    🎯 <b>${myDibs.target_name || myDibs.target_torn_id}</b>
                    <span class="tfb-release-btn" id="tfb-release-btn">✕ Release</span>
                    ${countdownHtml}
                </div>`;
        }

        panel.innerHTML = `
            <h4>⚔️ Faction Bot <span style="color:#6b7280;font-size:10px">${dibsCount} dibs</span></h4>
            ${myDibsHtml}
        `;

        // Attach release button listener after innerHTML is set
        if (myDibs) {
            const releaseBtn = document.getElementById('tfb-release-btn');
            if (releaseBtn) {
                releaseBtn.addEventListener('click', () => releaseDibs(myDibs.target_torn_id));
            }
        }
    }

    // Ticks every second to update the countdown display only
    function tickCountdown() {
        const myDibs = state.myDibs;
        const el = document.getElementById('tfb-countdown');
        if (!el || !myDibs || !myDibs.window_expires_at) return;

        const secs = Math.max(0, Math.floor(
            (new Date(myDibs.window_expires_at) - Date.now()) / 1000
        ));
        el.textContent = secs > 0
            ? `⚡ ATTACK NOW — ${secs}s left`
            : '⏰ Window expired — refreshing...';
    }

    // ─── Load dibs data ───────────────────────────────────────

    function loadDibs() {
        if (!getToken()) return;

        apiGet(`/api/dibs/all`, (err, data) => {
            if (!err && data && data.dibs) {
                state.allDibs = {};
                data.dibs.forEach(d => { state.allDibs[d.target_torn_id] = d; });
            }

            apiGet(`/api/dibs/my-dibs?token=${encodeURIComponent(getToken())}`, (err2, data2) => {
                if (!err2 && data2) state.myDibs = data2.dibs;
                updatePanel();
                injectDibsBadges();
            });
        });
    }

    // ─── Inject badges — only fires when attack links exist ───

    function injectDibsBadges() {
        // On refresh, clear previous badges and reset done markers
        document.querySelectorAll('.tfb-dibs-badge, .tfb-claim-btn').forEach(el => el.remove());
        document.querySelectorAll('[data-tfb-done]').forEach(el => el.removeAttribute('data-tfb-done'));

        const links = document.querySelectorAll(
            'a[href*="sid=attack"][href*="user2ID"]'
        );

        if (links.length === 0) return;

        const myTornId = getTornId();

        links.forEach(link => {
            link.setAttribute('data-tfb-done', '1');

            const row = link.closest('li');
            if (!row || !row.className.includes('enemy')) return;

            const match = link.href.match(/user2ID=(\d+)/);
            if (!match) return;
            const targetId = parseInt(match[1]);

            // Remove any stale badge
            link.parentElement?.querySelector('.tfb-dibs-badge, .tfb-claim-btn')?.remove();

            // Get the attack div and make it flex (exactly as CAT does)
            const attackDiv = link.closest('.attack') || link.parentElement;
            if (!attackDiv) return;
            attackDiv.style.display = 'flex';
            attackDiv.style.alignItems = 'center';
            attackDiv.style.gap = '4px';
            attackDiv.style.flexWrap = 'nowrap';
            attackDiv.style.overflow = 'visible';

            const dibs = state.allDibs[targetId];

            if (dibs) {
                const badge = document.createElement('button');
                const isReady = dibs.status === 'ready';
                const isMine = dibs.holder_torn_id === myTornId;

                if (isReady) {
                    badge.className = 'tfb-dibs-badge tfb-dibs-ready';
                    badge.textContent = isMine ? '⚡ GO!' : `⚡ ${dibs.holder_name}`;
                    if (isMine) {
                        badge.title = 'Click to attack!';
                        badge.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.location.href = `/page.php?sid=attack&user2ID=${targetId}`;
                        };
                    }
                } else if (isMine) {
                    badge.className = 'tfb-dibs-badge tfb-dibs-mine';
                    badge.textContent = '🎯 Mine';
                    badge.title = 'Click to release';
                    badge.onclick = (e) => { e.preventDefault(); e.stopPropagation(); releaseDibs(targetId); };
                } else {
                    badge.className = 'tfb-dibs-badge tfb-dibs-other';
                    badge.textContent = `🎯 ${dibs.holder_name}`;
                }
                // Insert before the Attack link (CAT's exact approach)
                attackDiv.insertBefore(badge, link);

            } else if (!state.myDibs) {
                const nameEl = row.querySelector('a[href*="profiles"]');
                const targetName = nameEl ? nameEl.textContent.trim() : String(targetId);

                const btn = document.createElement('button');
                btn.className = 'tfb-claim-btn';
                btn.textContent = '🎯';
                btn.title = `Claim dibs on ${targetName}`;
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    claimDibs(targetId, targetName, btn);
                };
                // Insert before the Attack link
                attackDiv.insertBefore(btn, link);
            }
        });
    }

    // ─── Dibs actions ─────────────────────────────────────────

    function claimDibs(targetId, targetName, btn) {
        btn.textContent = '...';
        btn.style.opacity = '0.5';
        btn.onclick = null;

        apiPost('/api/dibs/claim', {
            target_torn_id: targetId,
            target_name: targetName,
        }, (err, data) => {
            if (err || !data || !data.ok) {
                btn.textContent = '🎯';
                btn.style.opacity = '1';
                btn.title = data?.reason || 'Failed';
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    claimDibs(targetId, targetName, btn);
                };
                return;
            }
            // If window already open, update local state immediately
            if (data.window_open && data.window_expires_at) {
                state.myDibs = {
                    target_torn_id: targetId,
                    target_name: targetName,
                    status: 'ready',
                    window_expires_at: data.window_expires_at,
                };
            }
            // Remove data-tfb-done so badges re-inject
            document.querySelectorAll('[data-tfb-done]').forEach(el => {
                el.removeAttribute('data-tfb-done');
            });
            loadDibs();
        });
    }

    function releaseDibs(targetId) {
        apiPost('/api/dibs/release', { target_torn_id: targetId }, (err, data) => {
            if (!err && data && data.ok) {
                document.querySelectorAll('[data-tfb-done]').forEach(el => {
                    el.removeAttribute('data-tfb-done');
                });
                loadDibs();
            }
        });
    }

    window._tfbRelease = releaseDibs;

    // ─── Smart DOM observer — only watches the war list container

    let domObserver = null;

    function startDomObserver() {
        if (domObserver) return;

        // Watch for new rows being added to the war list
        // Use a short debounce so rapid DOM changes don't fire repeatedly
        let debounceTimer = null;
        domObserver = new MutationObserver(() => {
            if (!pageFocused()) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                injectDibsBadges();
            }, 300);
        });

        // Try to observe just the war list — much less noisy than document.body
        const tryObserve = () => {
            const warList = document.querySelector('.desc-wrap, [class*="factionWar"], [class*="war-list"]');
            if (warList) {
                domObserver.observe(warList, { childList: true, subtree: true });
            } else {
                // Fall back to body but with a filter
                domObserver.observe(document.body, { childList: true, subtree: false });
            }
        };

        tryObserve();
    }

    function stopDomObserver() {
        if (domObserver) {
            domObserver.disconnect();
            domObserver = null;
        }
    }

    // ─── War page setup ───────────────────────────────────────

    function setupWarPage() {
        injectStyles();
        createPanel();
        loadDibs();

        // Refresh dibs data every 15s
        state.refreshTimer = setInterval(() => {
            if (!isWarPage() || !pageFocused()) return;
            loadDibs();
        }, 15000);

        // Tick countdown every second
        state.countdownTimer = setInterval(tickCountdown, 1000);

        // Delayed initial injection — React takes a moment
        setTimeout(() => {
            injectDibsBadges();
            startDomObserver();
        }, 1500);
    }

    function teardownWarPage() {
        clearInterval(state.refreshTimer);
        clearInterval(state.countdownTimer);
        stopDomObserver();
        document.getElementById('tfb-war-panel')?.remove();
        document.getElementById('tfb-toggle-btn')?.remove();
    }

    // ─── Attack page setup ────────────────────────────────────

    function setupAttackPage() {
        injectStyles();

        const targetId = parseInt(
            new URLSearchParams(window.location.search).get('user2ID') || '0'
        );
        if (!targetId) return;

        // Load dibs to check context
        loadDibs();

        setTimeout(() => {
            const myDibs = state.myDibs;

            // Hook Start Fight button if we have dibs on this target
            if (myDibs && myDibs.target_torn_id === targetId) {
                const hookBtn = () => {
                    const btn = document.querySelector('button[type="submit"]');
                    if (!btn || btn.dataset.tfbHit) return;
                    btn.dataset.tfbHit = '1';
                    btn.addEventListener('click', () => {
                        apiPost('/api/dibs/hit', { target_torn_id: targetId }, () => {});
                    });
                };
                hookBtn();
                new MutationObserver(hookBtn).observe(document.body, {
                    childList: true, subtree: true
                });
            }

            // Show assist button on Join fights if target has someone else's dibs
            const theirDibs = state.allDibs[targetId];
            if (theirDibs && theirDibs.holder_torn_id !== getTornId()) {
                const injectAssist = () => {
                    const joinBtn = [...document.querySelectorAll('button')].find(
                        b => /^join/i.test(b.textContent.trim())
                    );
                    if (!joinBtn || joinBtn.dataset.tfbAssist) return;
                    joinBtn.dataset.tfbAssist = '1';

                    const assistBtn = document.createElement('button');
                    assistBtn.textContent = '✋ Assist';
                    assistBtn.style.cssText = 'margin-left:8px;padding:4px 10px;background:#1e3a5f;color:#93c5fd;border:1px solid #3b82f6;border-radius:4px;cursor:pointer;font-size:12px;';
                    assistBtn.onclick = () => {
                        apiPost('/api/dibs/assist', { target_torn_id: targetId }, (err, data) => {
                            if (!err && data?.ok) {
                                assistBtn.textContent = '✅ Assist logged';
                                assistBtn.disabled = true;
                            }
                        });
                    };
                    joinBtn.parentNode.insertBefore(assistBtn, joinBtn.nextSibling);
                };

                injectAssist();
                new MutationObserver(injectAssist).observe(document.body, {
                    childList: true, subtree: true
                });
            }
        }, 1000);
    }

    // ─── SPA navigation handler ───────────────────────────────

    let currentPage = null;

    function handleNavigation() {
        const newPage = isWarPage() ? 'war' : isAttackPage() ? 'attack' : 'other';
        if (newPage === currentPage) return;

        // Teardown previous page
        if (currentPage === 'war') teardownWarPage();

        currentPage = newPage;

        if (!getToken()) return;

        if (newPage === 'war') {
            // Small delay for React to render after hash change
            setTimeout(setupWarPage, 300);
        } else if (newPage === 'attack') {
            setupAttackPage();
        }
    }

    // ─── Init ─────────────────────────────────────────────────

    function init() {
        // Listen for hash changes (Torn is a SPA)
        window.addEventListener('hashchange', handleNavigation);

        // Initial page load
        handleNavigation();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

})();