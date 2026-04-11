// ==UserScript==
// @name         Stez - Attack Timer (Hospital Countdown)
// @namespace    stez.torn.attack.timer
// @version      1.0.0
// @description  Displays a live hospital countdown timer for attack targets on Torn PDA attack screen
// @author       MrStez
// @match        https://www.torn.com/page.php?sid=attack*
// @run-at       document-end
// ==/UserScript==

(function () {
    "use strict";

    /* ========================
       CONFIG / STORAGE
    ======================== */

    const STORAGE = {
        API_KEY: "stez_torn_api_key",
        MINIMISED: "stez_attack_timer_min"
    };

    const REFRESH_INTERVAL = 15000;
    const RENDER_INTERVAL = 1000;

    let state = {
        targetId: null,
        targetName: "",
        status: "",
        until: 0,
        lastUpdated: 0
    };

    /* ========================
       UTILITIES
    ======================== */

    function getTargetId() {
        return new URLSearchParams(window.location.search).get("user2ID");
    }

    function getApiKey() {
        return localStorage.getItem(STORAGE.API_KEY) || "";
    }

    function setApiKey() {
        const val = prompt("Enter your Torn API key:", getApiKey());
        if (val) {
            localStorage.setItem(STORAGE.API_KEY, val.trim());
            refresh();
        }
    }

    function isMinimised() {
        return localStorage.getItem(STORAGE.MINIMISED) === "1";
    }

    function toggleMinimise() {
        localStorage.setItem(STORAGE.MINIMISED, isMinimised() ? "0" : "1");
        render();
    }

    function formatTime(seconds) {
        seconds = Math.max(0, Math.floor(seconds));
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    }

    /* ========================
       UI SETUP
    ======================== */

    function injectStyles() {
        if (document.getElementById("stez-attack-style")) return;

        const style = document.createElement("style");
        style.id = "stez-attack-style";
        style.textContent = `
            #stez-attack-panel {
                position: fixed;
                top: 40px;
                left: 10px;
                z-index: 999999;
                background: rgba(10,10,10,0.95);
                color: white;
                border: 2px solid #7c5cff;
                border-radius: 10px;
                padding: 10px;
                font-family: Arial;
                box-shadow: 0 6px 16px rgba(0,0,0,0.5);
                min-width: 160px;
            }

            #stez-attack-panel.min {
                padding: 6px 10px;
                font-size: 14px;
            }

            .stez-title {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-weight: bold;
                margin-bottom: 6px;
            }

            .stez-timer {
                font-size: 18px;
                font-weight: bold;
                color: #ff8a65;
            }

            .stez-good { color: #7CFC90; }
            .stez-warn { color: #ffd166; }
            .stez-muted { font-size: 11px; opacity: 0.7; }

            .stez-btn {
                cursor: pointer;
                padding: 2px 6px;
                border-radius: 6px;
                background: #222;
                border: 1px solid #666;
                font-size: 12px;
            }

            .stez-controls {
                margin-top: 6px;
            }
        `;
        document.head.appendChild(style);
    }

    function getPanel() {
        let el = document.getElementById("stez-attack-panel");
        if (!el) {
            el = document.createElement("div");
            el.id = "stez-attack-panel";
            document.body.appendChild(el);
        }
        return el;
    }

    /* ========================
       RENDER
    ======================== */

    function render() {
        const el = getPanel();
        const now = Math.floor(Date.now() / 1000);

        const apiKey = getApiKey();
        const minimised = isMinimised();

        let timerText = "—";
        let statusText = "";

        if (!apiKey) {
            el.innerHTML = `
                <div class="stez-title">
                    Attack Timer
                </div>
                <div class="stez-warn">API key required</div>
                <div class="stez-controls">
                    <span class="stez-btn" id="api">Set API</span>
                </div>
            `;
            attachEvents();
            return;
        }

        if (state.status.toLowerCase().includes("hospital")) {
            const remaining = state.until - now;
            timerText = remaining > 0 ? formatTime(remaining) : "Ready";
            statusText = `<span class="stez-warn">Hospital</span>`;
        } else {
            timerText = "Ready";
            statusText = `<span class="stez-good">${state.status || "Unknown"}</span>`;
        }

        if (minimised) {
            el.className = "min";
            el.innerHTML = `
                <div class="stez-title">
                    ⏱ ${timerText}
                    <span class="stez-btn" id="expand">+</span>
                </div>
            `;
        } else {
            el.className = "";
            el.innerHTML = `
                <div class="stez-title">
                    Attack Timer
                    <span class="stez-btn" id="minimise">–</span>
                </div>

                <div>Target: <b>${state.targetName || state.targetId || "—"}</b></div>
                <div>Status: ${statusText}</div>

                <div class="stez-timer">${timerText}</div>

                <div class="stez-muted">
                    ${state.lastUpdated ? new Date(state.lastUpdated).toLocaleTimeString() : ""}
                </div>

                <div class="stez-controls">
                    <span class="stez-btn" id="api">API</span>
                    <span class="stez-btn" id="refresh">↻</span>
                </div>
            `;
        }

        attachEvents();
    }

    function attachEvents() {
        document.getElementById("minimise")?.addEventListener("click", toggleMinimise);
        document.getElementById("expand")?.addEventListener("click", toggleMinimise);
        document.getElementById("api")?.addEventListener("click", setApiKey);
        document.getElementById("refresh")?.addEventListener("click", refresh);
    }

    /* ========================
       DATA FETCH
    ======================== */

    async function fetchData(id) {
        const key = getApiKey();
        if (!key) return;

        const res = await fetch(`https://api.torn.com/user/${id}?selections=basic,profile&key=${key}`);
        const data = await res.json();

        state.targetName = data.name || "";
        state.status = data.status?.description || data.status?.state || "";
        state.until = Number(data.status?.until || 0);
        state.lastUpdated = Date.now();
    }

    async function refresh() {
        state.targetId = getTargetId();
        if (!state.targetId) return;

        await fetchData(state.targetId);
        render();
    }

    /* ========================
       INIT
    ======================== */

    function init() {
        injectStyles();
        getPanel();
        refresh();

        setInterval(render, RENDER_INTERVAL);
        setInterval(refresh, REFRESH_INTERVAL);
    }

    init();

})();