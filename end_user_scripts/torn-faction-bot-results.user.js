// ==UserScript==
// @name         Torn Faction Bot - Attack Log Capture
// @namespace    tornfactionbot.results
// @version      1.0.0
// @description  Captures fight results and submits to faction bot. Shows poach report button when relevant.
// @author       Mr_Stez
// @match        https://www.torn.com/page.php?sid=attackLog*
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
    const getTornId = () => localStorage.getItem(STORAGE.TORN_ID) || '';
    const getName   = () => localStorage.getItem(STORAGE.NAME) || '';

    // ─── Get log ID from URL ───────────────────────────────────
    function getLogId() {
        return new URLSearchParams(window.location.search).get('ID') || '';
    }

    // ─── Wait for page content to load ────────────────────────
    function waitForContent(selector, timeout = 8000) {
        return new Promise((resolve, reject) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                reject(new Error('Timeout waiting for content'));
            }, timeout);
        });
    }

    // ─── Extract raw log text from the page ───────────────────
    function extractLogText() {
        // Grab all text content from the log table
        const rows = document.querySelectorAll('.log-cont .log-list li, .attack-log li, [class*="log"] li');
        if (rows.length > 0) {
            return Array.from(rows).map(r => r.textContent.trim()).join('\n');
        }

        // Fallback: grab the whole log container text
        const container = document.querySelector(
            '.log-cont, .attack-log, [class*="attackLog"], [class*="log-wrap"]'
        );
        if (container) return container.innerText.trim();

        // Last resort: body text
        return document.body.innerText.trim();
    }

    // ─── Extract participants from the page header ─────────────
    function extractParticipants() {
        // Torn shows participant names at the top of the log
        const names = [];
        const nameEls = document.querySelectorAll(
            '.log-cont .name, [class*="name___"], .attacker-name, .defender-name'
        );
        nameEls.forEach(el => {
            const name = el.textContent.trim();
            if (name) names.push(name);
        });
        return names;
    }

    // ─── Submit log to server ──────────────────────────────────
    function submitLog(logId, rawText, warId = null) {
        const token = getToken();
        if (!token) return;

        GM_xmlhttpRequest({
            method: 'POST',
            url: `${SERVER_URL}/api/attack-logs/submit`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({
                token,
                torn_log_id: logId,
                raw_text: rawText,
                war_id: warId,
                occurred_at: new Date().toISOString(),
            }),
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    if (data.violations_found > 0) {
                        showViolationAlert(data.violations_found);
                    }
                    if (data.ok) {
                        showSubmitBadge(data.new ? 'Logged ✓' : 'Already logged');
                    }
                } catch(e) {
                    console.log('[TFB] Error parsing response:', e);
                }
            },
            onerror: function() {
                console.log('[TFB] Could not submit log to server');
            }
        });
    }

    // ─── UI ───────────────────────────────────────────────────

    function injectStyles() {
        if (document.getElementById('tfb-results-styles')) return;
        const style = document.createElement('style');
        style.id = 'tfb-results-styles';
        style.textContent = `
            #tfb-results-bar {
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 999999;
                display: flex;
                flex-direction: column;
                gap: 6px;
                align-items: flex-end;
            }

            .tfb-badge {
                background: #1a1a2e;
                color: #a78bfa;
                border: 1px solid #7c5cff;
                border-radius: 6px;
                padding: 5px 10px;
                font-size: 12px;
                font-family: Arial, sans-serif;
            }

            .tfb-badge-ok { color: #4ade80; border-color: #4ade80; }
            .tfb-badge-warn { color: #fbbf24; border-color: #fbbf24; }

            #tfb-poach-btn {
                background: #7f1d1d;
                color: #fca5a5;
                border: 1px solid #dc2626;
                border-radius: 6px;
                padding: 7px 12px;
                font-size: 12px;
                font-weight: bold;
                font-family: Arial, sans-serif;
                cursor: pointer;
            }

            #tfb-poach-btn:hover { opacity: 0.85; }

            #tfb-poach-panel {
                background: #1a1a2e;
                border: 1px solid #dc2626;
                border-radius: 8px;
                padding: 12px;
                width: 260px;
                font-family: Arial, sans-serif;
                font-size: 12px;
                color: #eee;
            }

            #tfb-poach-panel p {
                margin: 0 0 8px 0;
                color: #ccc;
                line-height: 1.4;
            }

            #tfb-poach-panel input {
                width: 100%;
                padding: 6px 8px;
                border-radius: 4px;
                border: 1px solid #555;
                background: #0d0d1a;
                color: #eee;
                font-size: 12px;
                box-sizing: border-box;
                margin-bottom: 6px;
            }

            .tfb-poach-submit {
                width: 100%;
                padding: 7px;
                background: #dc2626;
                color: #fff;
                border: none;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                margin-bottom: 4px;
            }

            .tfb-poach-cancel {
                width: 100%;
                padding: 7px;
                background: #2a2a3e;
                color: #aaa;
                border: none;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
            }

            #tfb-poach-status {
                text-align: center;
                font-size: 11px;
                min-height: 16px;
                margin-top: 4px;
            }
        `;
        document.head.appendChild(style);
    }

    function createResultsBar() {
        if (document.getElementById('tfb-results-bar')) return;
        const bar = document.createElement('div');
        bar.id = 'tfb-results-bar';
        document.body.appendChild(bar);
    }

    function showSubmitBadge(text) {
        const bar = document.getElementById('tfb-results-bar');
        if (!bar) return;
        const badge = document.createElement('div');
        badge.className = 'tfb-badge tfb-badge-ok';
        badge.textContent = `[Faction Bot] ${text}`;
        bar.appendChild(badge);
    }

    function showViolationAlert(count) {
        const bar = document.getElementById('tfb-results-bar');
        if (!bar) return;
        const badge = document.createElement('div');
        badge.className = 'tfb-badge tfb-badge-warn';
        badge.textContent = `⚠ ${count} dibs violation${count > 1 ? 's' : ''} detected`;
        bar.appendChild(badge);
    }

    function showPoachButton(logId) {
        const bar = document.getElementById('tfb-results-bar');
        if (!bar) return;

        const btn = document.createElement('button');
        btn.id = 'tfb-poach-btn';
        btn.textContent = '🚨 Report Poach';
        bar.appendChild(btn);

        btn.addEventListener('click', () => {
            btn.remove();
            showPoachPanel(logId);
        });
    }

    function showPoachPanel(logId) {
        const bar = document.getElementById('tfb-results-bar');
        if (!bar) return;

        const panel = document.createElement('div');
        panel.id = 'tfb-poach-panel';
        panel.innerHTML = `
            <p><strong>Report a Poach</strong></p>
            <p>Only valid if you had active dibs on the target. Leaders will review this report.</p>
            <input type="text" id="tfb-poach-target" placeholder="Target name (who was poached)" />
            <input type="text" id="tfb-poach-by" placeholder="Poached by (who took the kill)" />
            <button class="tfb-poach-submit" id="tfb-poach-submit">Submit Report</button>
            <button class="tfb-poach-cancel" id="tfb-poach-cancel">Cancel</button>
            <div id="tfb-poach-status"></div>
        `;
        bar.appendChild(panel);

        document.getElementById('tfb-poach-cancel').addEventListener('click', () => {
            panel.remove();
            showPoachButton(logId);
        });

        document.getElementById('tfb-poach-submit').addEventListener('click', () => {
            submitPoachReport(logId, panel);
        });
    }

    function submitPoachReport(logId, panel) {
        const target = document.getElementById('tfb-poach-target')?.value.trim();
        const poacher = document.getElementById('tfb-poach-by')?.value.trim();
        const statusEl = document.getElementById('tfb-poach-status');

        if (!target || !poacher) {
            if (statusEl) {
                statusEl.style.color = '#f87171';
                statusEl.textContent = 'Please fill in both fields';
            }
            return;
        }

        if (statusEl) {
            statusEl.style.color = '#93c5fd';
            statusEl.textContent = 'Submitting...';
        }

        GM_xmlhttpRequest({
            method: 'POST',
            url: `${SERVER_URL}/api/attack-logs/report-poach`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({
                token: getToken(),
                torn_log_id: logId,
                target_name: target,
                poacher_name: poacher,
            }),
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    if (statusEl) {
                        if (data.ok) {
                            statusEl.style.color = '#4ade80';
                            statusEl.textContent = 'Report submitted ✓';
                            setTimeout(() => panel.remove(), 2000);
                        } else {
                            statusEl.style.color = '#f87171';
                            statusEl.textContent = data.detail || 'Report failed';
                        }
                    }
                } catch(e) {
                    if (statusEl) {
                        statusEl.style.color = '#f87171';
                        statusEl.textContent = 'Unexpected error';
                    }
                }
            },
            onerror: function() {
                if (statusEl) {
                    statusEl.style.color = '#f87171';
                    statusEl.textContent = 'Could not reach server';
                }
            }
        });
    }

    // ─── INIT ─────────────────────────────────────────────────

    async function init() {
        if (!getToken()) return; // Not registered, do nothing

        const logId = getLogId();
        if (!logId) return;

        injectStyles();
        createResultsBar();

        // Wait for the log content to appear in the DOM
        try {
            await waitForContent('.log-cont, .attack-log, [class*="log"]', 8000);
        } catch(e) {
            // Content didn't appear via observer, proceed anyway
        }

        // Small delay to let Torn's JS finish rendering
        await new Promise(r => setTimeout(r, 1000));

        const rawText = extractLogText();
        if (!rawText || rawText.length < 50) {
            console.log('[TFB] Log content too short, skipping submission');
            return;
        }

        // Submit the log
        submitLog(logId, rawText);

        // Always show the poach report button on results pages
        // Server will reject it if no valid dibs exists
        showPoachButton(logId);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

})();
