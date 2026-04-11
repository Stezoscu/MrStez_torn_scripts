// ==UserScript==
// @name         Torn Faction Bot - Setup & Registration
// @namespace    tornfactionbot.setup
// @version      1.0.2
// @description  Registers your Torn API key with the faction bot server
// @author       Mr_Stez
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      torn-faction-bot-production.up.railway.app
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ─── CONFIG ───────────────────────────────────────────────
    const SERVER_URL = 'https://torn-faction-bot-production.up.railway.app';
    const STORAGE = {
        TOKEN:           'tfb_token',
        TORN_ID:         'tfb_torn_id',
        NAME:            'tfb_torn_name',
        SETUP_DISMISSED: 'tfb_setup_dismissed',
    };
    // ──────────────────────────────────────────────────────────

    const isRegistered = () => !!localStorage.getItem(STORAGE.TOKEN);
    const getToken     = () => localStorage.getItem(STORAGE.TOKEN) || '';
    const getTornId    = () => localStorage.getItem(STORAGE.TORN_ID) || '';
    const getName      = () => localStorage.getItem(STORAGE.NAME) || '';

    function saveRegistration(token, torn_id, torn_name) {
        localStorage.setItem(STORAGE.TOKEN,   token);
        localStorage.setItem(STORAGE.TORN_ID, String(torn_id));
        localStorage.setItem(STORAGE.NAME,    torn_name);
        localStorage.removeItem(STORAGE.SETUP_DISMISSED);
    }

    function clearRegistration() {
        Object.values(STORAGE).forEach(k => localStorage.removeItem(k));
    }

    // ─── STYLES ───────────────────────────────────────────────

    function injectStyles() {
        if (document.getElementById('tfb-styles')) return;
        const style = document.createElement('style');
        style.id = 'tfb-styles';
        style.textContent = `
            #tfb-panel {
                position: fixed;
                bottom: 70px;
                right: 12px;
                width: 320px;
                background: #1a1a2e;
                color: #eee;
                border: 1px solid #7c5cff;
                border-radius: 12px;
                padding: 16px;
                z-index: 999999;
                font-family: Arial, sans-serif;
                font-size: 13px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            }

            #tfb-panel h3 {
                margin: 0 0 8px 0;
                font-size: 15px;
                color: #a78bfa;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            #tfb-panel p {
                margin: 0 0 10px 0;
                color: #ccc;
                line-height: 1.5;
            }

            #tfb-panel input[type="text"] {
                width: 100%;
                padding: 8px 10px;
                border-radius: 6px;
                border: 1px solid #555;
                background: #0d0d1a;
                color: #eee;
                font-size: 13px;
                box-sizing: border-box;
                margin-bottom: 8px;
            }

            .tfb-btn {
                width: 100%;
                padding: 9px;
                border-radius: 6px;
                border: none;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
                margin-bottom: 6px;
                box-sizing: border-box;
            }

            .tfb-btn-primary   { background: #7c5cff; color: #fff; }
            .tfb-btn-secondary { background: #2a2a3e; color: #aaa; }
            .tfb-btn-danger    { background: #7f1d1d; color: #fca5a5; }

            .tfb-btn:hover { opacity: 0.85; }

            #tfb-status {
                font-size: 12px;
                margin-top: 4px;
                min-height: 18px;
                text-align: center;
            }

            .tfb-status-ok   { color: #4ade80; }
            .tfb-status-err  { color: #f87171; }
            .tfb-status-info { color: #93c5fd; }

            #tfb-toggle {
                position: fixed;
                bottom: 12px;
                right: 12px;
                z-index: 999999;
                background: #7c5cff;
                color: #fff;
                border: none;
                border-radius: 8px;
                padding: 8px 14px;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            }

            #tfb-registered-badge {
                display: inline-block;
                background: #14532d;
                color: #4ade80;
                border-radius: 4px;
                padding: 1px 6px;
                font-size: 11px;
                margin-left: 6px;
            }

            .tfb-tos-table {
                width: 100%;
                border-collapse: collapse;
                margin: 8px 0 12px 0;
                font-size: 11px;
            }

            .tfb-tos-table td {
                border: 1px solid #333;
                padding: 4px 6px;
                vertical-align: top;
            }

            .tfb-tos-table td:first-child {
                color: #a78bfa;
                white-space: nowrap;
                width: 40%;
            }
        `;
        document.head.appendChild(style);
    }

    // ─── UI ───────────────────────────────────────────────────

    function buildPanel() {
        const existing = document.getElementById('tfb-panel');
        if (existing) existing.remove();

        const panel = document.createElement('div');
        panel.id = 'tfb-panel';

        if (isRegistered()) {
            panel.innerHTML = `
                <h3>
                    Faction Bot
                    <span id="tfb-registered-badge">✓ Registered</span>
                </h3>
                <p>Registered as <strong>${getName()}</strong> (${getTornId()})</p>
                <button class="tfb-btn tfb-btn-secondary" id="tfb-reregister">Update API Key</button>
                <button class="tfb-btn tfb-btn-danger" id="tfb-unregister">Unregister</button>
                <button class="tfb-btn tfb-btn-secondary" id="tfb-close">Close</button>
                <div id="tfb-status"></div>
            `;
        } else {
            panel.innerHTML = `
                <h3>Faction Bot Setup</h3>
                <p>Register your Torn API key to use faction tools. Your key is encrypted and stored securely.</p>

                <table class="tfb-tos-table">
                    <tr><td>Data Storage</td><td>Persistent — faction use only</td></tr>
                    <tr><td>Data Sharing</td><td>Faction members only</td></tr>
                    <tr><td>Purpose</td><td>Faction management tools</td></tr>
                    <tr><td>Key Storage</td><td>Stored encrypted, used for automation</td></tr>
                    <tr><td>Access Level</td><td>Public (minimal permissions needed)</td></tr>
                </table>

                <input type="text" id="tfb-api-key" placeholder="Paste your 16-character API key" maxlength="16" />
                <button class="tfb-btn tfb-btn-primary" id="tfb-register">Register</button>
                <button class="tfb-btn tfb-btn-secondary" id="tfb-dismiss">Dismiss</button>
                <div id="tfb-status"></div>
            `;
        }

        document.body.appendChild(panel);
        attachPanelEvents();
    }

    function setStatus(msg, type = 'info') {
        const el = document.getElementById('tfb-status');
        if (el) {
            el.textContent = msg;
            el.className = `tfb-status-${type}`;
        }
    }

    function attachPanelEvents() {
        document.getElementById('tfb-close')?.addEventListener('click', () => {
            document.getElementById('tfb-panel')?.remove();
        });

        document.getElementById('tfb-dismiss')?.addEventListener('click', () => {
            localStorage.setItem(STORAGE.SETUP_DISMISSED, '1');
            document.getElementById('tfb-panel')?.remove();
            document.getElementById('tfb-toggle')?.remove();
        });

        document.getElementById('tfb-unregister')?.addEventListener('click', () => {
            clearRegistration();
            buildPanel();
            buildToggle();
        });

        document.getElementById('tfb-reregister')?.addEventListener('click', () => {
            clearRegistration();
            buildPanel();
        });

        document.getElementById('tfb-register')?.addEventListener('click', doRegister);

        document.getElementById('tfb-api-key')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doRegister();
        });
    }

    // ─── REGISTRATION ─────────────────────────────────────────

    function doRegister() {
        const keyInput = document.getElementById('tfb-api-key');
        const apiKey = (keyInput?.value || '').trim();

        if (!apiKey || apiKey.length !== 16) {
            setStatus('API key must be exactly 16 characters', 'err');
            return;
        }

        setStatus('Registering...', 'info');
        const btn = document.getElementById('tfb-register');
        if (btn) btn.disabled = true;

        GM_xmlhttpRequest({
            method: 'POST',
            url: `${SERVER_URL}/api/auth/register`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ api_key: apiKey }),
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    if (response.status !== 200) {
                        setStatus(data.detail || 'Registration failed', 'err');
                        if (btn) btn.disabled = false;
                        return;
                    }
                    saveRegistration(data.token, data.torn_id, data.torn_name);
                    setStatus(`Welcome, ${data.torn_name}!`, 'ok');
                    setTimeout(() => {
                        buildPanel();
                        buildToggle();
                    }, 1200);
                } catch(e) {
                    setStatus('Unexpected response from server', 'err');
                    if (btn) btn.disabled = false;
                }
            },
            onerror: function() {
                setStatus('Could not reach server. Try again.', 'err');
                if (btn) btn.disabled = false;
            }
        });
    }

    // ─── PING (heartbeat) ─────────────────────────────────────

    function sendPing() {
        if (!isRegistered()) return;
        GM_xmlhttpRequest({
            method: 'POST',
            url: `${SERVER_URL}/api/auth/ping`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({
                torn_id: parseInt(getTornId()),
                torn_name: getName(),
            }),
            onerror: function() {}
        });
    }

    // ─── TOGGLE BUTTON ────────────────────────────────────────

    function buildToggle() {
        const existing = document.getElementById('tfb-toggle');
        if (existing) existing.remove();

        if (!isRegistered() && localStorage.getItem(STORAGE.SETUP_DISMISSED)) return;

        const btn = document.createElement('button');
        btn.id = 'tfb-toggle';
        btn.textContent = isRegistered() ? '⚙ Faction Bot' : '⚙ Setup Bot';
        btn.addEventListener('click', () => {
            const panel = document.getElementById('tfb-panel');
            if (panel) {
                panel.remove();
            } else {
                buildPanel();
            }
        });
        document.body.appendChild(btn);
    }

    // ─── INIT ─────────────────────────────────────────────────

    function init() {
        injectStyles();
        buildToggle();

        if (!isRegistered() && !localStorage.getItem(STORAGE.SETUP_DISMISSED)) {
            buildPanel();
        }

        sendPing();
        setInterval(sendPing, 5 * 60 * 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

})();