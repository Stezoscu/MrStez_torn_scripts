// ==UserScript==
// @name         MrStez Torn Recruitment Checker
// @namespace    mrstez.torn.recruitment
// @version      1.2.0
// @updateURL    https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_user_scripts/torn_faction_scripts/Recruitment_helper.js
// @downloadURL  https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_user_scripts/torn_faction_scripts/Recruitment_helper.js
// @description  Recruitment suitability checker for faction applications and player profiles
// @author       MrStez + Ace
// @match        https://www.torn.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '1.3.0';

  const LS = {
    ENABLED: 'mrstez_recruit_checker_enabled',
    API_KEY: 'mrstez_recruit_checker_api_key',
    CACHE_PREFIX: 'mrstez_recruit_checker_cache_',
    SETTINGS: 'mrstez_recruit_checker_settings',
    MINIMISED: 'mrstez_recruit_checker_minimised'
  };

  const POSSIBLE_SHARED_API_KEYS = [
    'mrstez_api_key',
    'MrStezApiKey',
    'torn_api_key',
    'TORN_API_KEY',
    'tornApiKey',
    'apiKey',
    'TornApiKey'
  ];

  const DEFAULT_SETTINGS = {
    cacheMinutes: 15,
    minRecentMinutesGreen: 60,
    minRecentMinutesAmber: 360,
    minXanaxPerDayGreen: 0.18,
    minXanaxPerDayAmber: 0.08,
    veryYoungAccountDays: 45,
    showDebug: false
  };

  let settings = loadSettings();
  let enabled = localStorage.getItem(LS.ENABLED) !== 'false';
  let currentProfileId = null;
  let lastRenderedUrl = '';

  function loadSettings() {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(LS.SETTINGS) || '{}') };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    localStorage.setItem(LS.SETTINGS, JSON.stringify(settings));
  }

  function getApiKey() {
    const own = localStorage.getItem(LS.API_KEY);
    if (own && own.trim()) return own.trim();

    for (const key of POSSIBLE_SHARED_API_KEYS) {
      const value = localStorage.getItem(key);
      if (value && value.trim() && value.trim().length > 10) return value.trim();
    }

    return '';
  }

  function setApiKey(key) {
    localStorage.setItem(LS.API_KEY, key.trim());
  }

  function isProfilePage() {
    return /profiles\.php\?XID=\d+/.test(location.href);
  }

  function getProfileIdFromUrl() {
    const match = location.href.match(/profiles\.php\?XID=(\d+)/);
    return match ? match[1] : null;
  }

  function cacheKey(playerId) {
    return `${LS.CACHE_PREFIX}${playerId}`;
  }

  function getCached(playerId) {
    try {
      const raw = localStorage.getItem(cacheKey(playerId));
      if (!raw) return null;

      const cached = JSON.parse(raw);
      const ageMs = Date.now() - cached.timestamp;
      if (ageMs > settings.cacheMinutes * 60 * 1000) return null;

      return cached.data;
    } catch {
      return null;
    }
  }

  function setCached(playerId, data) {
    localStorage.setItem(cacheKey(playerId), JSON.stringify({
      timestamp: Date.now(),
      data
    }));
  }

  async function apiCall(playerId) {
    const cached = getCached(playerId);
    if (cached) return cached;

    const apiKey = getApiKey();
    if (!apiKey) throw new Error('No API key found');

    const selections = ['profile', 'personalstats', 'basic'].join(',');
    const url = `https://api.torn.com/user/${playerId}?selections=${selections}&key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      throw new Error(`${data.error.code}: ${data.error.error}`);
    }

    setCached(playerId, data);
    return data;
  }

  function getPersonalStat(data, keys) {
    const ps = data.personalstats || {};
    for (const key of keys) {
      if (ps[key] !== undefined) return Number(ps[key]) || 0;
    }
    return 0;
  }

  function getAgeDays(data) {
    return Number(data.age || data.profile?.age || 0);
  }

  function getLevel(data) {
    return Number(data.level || data.profile?.level || 0);
  }

  function getExpectedNetworth(ageDays, level) {
    let base = 0;

    if (ageDays < 30) base = 5_000_000;
    else if (ageDays < 90) base = 25_000_000;
    else if (ageDays < 180) base = 75_000_000;
    else if (ageDays < 365) base = 150_000_000;
    else if (ageDays < 730) base = 350_000_000;
    else if (ageDays < 1095) base = 750_000_000;
    else if (ageDays < 1825) base = 1_500_000_000;
    else base = 2_500_000_000;

    if (level > 0 && level < 15) base *= 0.35;
    else if (level < 25) base *= 0.65;
    else if (level < 50) base *= 0.9;
    else base *= 1.1;

    return Math.round(base);
  }

  function scoreNetworth(networth, expectedNetworth) {
    const ratio = expectedNetworth > 0 ? networth / expectedNetworth : 0;

    if (ratio >= 1.5) return { score: 18, note: 'Excellent networth for age/level.', type: 'positive', ratio };
    if (ratio >= 1.0) return { score: 12, note: 'Good networth for age/level.', type: 'positive', ratio };
    if (ratio >= 0.5) return { score: 5, note: 'Networth is a little low for age/level.', type: 'warning', ratio };

    return { score: -12, note: 'Low networth for age/level.', type: 'risk', ratio };
  }

  function getLastActionMinutes(data) {
    const last = data.last_action;
    if (!last) return null;

    if (typeof last === 'object') {
      if (last.timestamp) {
        return Math.max(0, Math.round((Date.now() / 1000 - Number(last.timestamp)) / 60));
      }

      if (last.relative) {
        return parseRelativeTimeToMinutes(last.relative);
      }
    }

    return null;
  }

  function parseRelativeTimeToMinutes(text) {
    if (!text) return null;
    const t = String(text).toLowerCase();

    if (t.includes('online') || t.includes('now')) return 0;

    const num = Number((t.match(/\d+/) || [0])[0]);

    if (t.includes('minute')) return num;
    if (t.includes('hour')) return num * 60;
    if (t.includes('day')) return num * 1440;
    if (t.includes('month')) return num * 43200;
    if (t.includes('year')) return num * 525600;

    return null;
  }

  function hasPrivateIsland(data) {
    const property = String(data.property || data.profile?.property || '').toLowerCase();
    return property.includes('private island');
  }

  function hasSubscriberOrDonator(data) {
    const text = JSON.stringify(data).toLowerCase();
    return text.includes('subscriber') || text.includes('donator');
  }

  function evaluateRecruit(data) {
    const ageDays = getAgeDays(data);
    const level = getLevel(data);
    const lastActionMinutes = getLastActionMinutes(data);

    const xanax = getPersonalStat(data, [
      'xantaken',
      'xanax_taken',
      'xanax',
      'drugsused_xanax'
    ]);

    const networth = getPersonalStat(data, [
      'networth',
      'total_networth'
    ]);

    const xanaxPerDay = ageDays > 0 ? xanax / ageDays : 0;
    const expectedNetworth = getExpectedNetworth(ageDays, level);
    const networthScore = scoreNetworth(networth, expectedNetworth);

    const pi = hasPrivateIsland(data);
    const sub = hasSubscriberOrDonator(data);

    let score = 0;
    const positives = [];
    const warnings = [];
    const risks = [];

    if (lastActionMinutes === null) {
      warnings.push('Could not read last action.');
    } else if (lastActionMinutes <= settings.minRecentMinutesGreen) {
      score += 30;
      positives.push('Recently active.');
    } else if (lastActionMinutes <= settings.minRecentMinutesAmber) {
      score += 15;
      warnings.push('Active, but not very recently.');
    } else {
      score -= 25;
      risks.push('Not recently active.');
    }

    if (ageDays <= settings.veryYoungAccountDays) {
      score += 5;
      warnings.push('Very young account, use judgement.');
    } else if (xanaxPerDay >= settings.minXanaxPerDayGreen) {
      score += 30;
      positives.push('Strong Xanax usage for account age.');
    } else if (xanaxPerDay >= settings.minXanaxPerDayAmber) {
      score += 15;
      warnings.push('Moderate Xanax usage for account age.');
    } else {
      score -= 25;
      risks.push('Low Xanax usage for account age.');
    }

    score += networthScore.score;

    if (networthScore.type === 'positive') positives.push(networthScore.note);
    if (networthScore.type === 'warning') warnings.push(networthScore.note);
    if (networthScore.type === 'risk') risks.push(networthScore.note);

    if (level > 0 && level < 15) {
      warnings.push('Level below 15, reduced networth expectation applied.');
    }

    if (pi) {
      score += 12;
      positives.push('Private Island owned.');
    } else {
      warnings.push('No Private Island detected.');
    }

    if (sub) {
      score += 8;
      positives.push('Subscriber/donator signal detected.');
    }

    let rating = 'Review';
    let colour = '#f59e0b';

    if (score >= 65 && risks.length === 0) {
      rating = 'Strong Fit';
      colour = '#22c55e';
    } else if (score >= 40) {
      rating = 'Good / Review';
      colour = '#84cc16';
    } else if (score >= 15) {
      rating = 'Manual Review';
      colour = '#f59e0b';
    } else {
      rating = 'Weak / Risky';
      colour = '#ef4444';
    }

    return {
      score,
      rating,
      colour,
      ageDays,
      level,
      lastActionMinutes,
      xanax,
      xanaxPerDay,
      networth,
      expectedNetworth,
      networthRatio: networthScore.ratio,
      pi,
      sub,
      positives,
      warnings,
      risks
    };
  }

  function fmtMoney(n) {
    if (!n) return '$0';
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}b`;
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
    return `$${n}`;
  }

  function fmtLastAction(minutes) {
    if (minutes === null) return 'Unknown';
    if (minutes < 1) return 'Now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
    return `${Math.round(minutes / 1440)}d ago`;
  }

  function addStyles() {
    if (document.getElementById('mrstez-recruit-styles')) return;

    const style = document.createElement('style');
    style.id = 'mrstez-recruit-styles';
    style.textContent = `
      #mrstez-recruit-panel {
        position: fixed;
        top: 90px;
        right: 12px;
        width: 340px;
        max-width: calc(100vw - 24px);
        z-index: 999999;
        background: #111827;
        color: #e5e7eb;
        border: 1px solid #374151;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.45);
        font-family: Arial, sans-serif;
        font-size: 13px;
        overflow: hidden;
      }

      #mrstez-recruit-panel .mrs-header {
        background: linear-gradient(90deg, #6d28d9, #2563eb);
        color: white;
        padding: 9px 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
      }

      #mrstez-recruit-panel .mrs-version {
        font-size: 11px;
        opacity: 0.8;
        margin-left: 5px;
      }

      #mrstez-recruit-panel button {
        background: #1f2937;
        color: #f9fafb;
        border: 1px solid #4b5563;
        border-radius: 7px;
        padding: 5px 8px;
        cursor: pointer;
        font-size: 12px;
      }

      #mrs-body {
        padding: 10px;
      }

      .mrs-controls {
        display: flex;
        gap: 6px;
        margin-bottom: 8px;
        flex-wrap: wrap;
      }

      #mrs-status {
        color: #cbd5e1;
        margin-bottom: 8px;
        font-size: 12px;
      }

      .mrs-card {
        border: 1px solid #374151;
        border-radius: 10px;
        padding: 9px;
        margin-bottom: 8px;
        background: #020617;
      }

      .mrs-rating {
        font-weight: bold;
        padding: 5px 7px;
        border-radius: 7px;
        color: white;
        display: inline-block;
        margin-bottom: 7px;
      }

      .mrs-row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        border-bottom: 1px solid #1f2937;
        padding: 3px 0;
      }

      .mrs-row span:first-child {
        color: #9ca3af;
      }

      .mrs-list {
        margin-top: 7px;
        padding-left: 17px;
      }

      .mrs-positive {
        color: #86efac;
      }

      .mrs-warning {
        color: #facc15;
      }

      .mrs-risk {
        color: #fca5a5;
      }

      #mrs-settings {
        border-top: 1px solid #374151;
        margin-top: 10px;
        padding-top: 10px;
      }

      #mrs-settings label {
        display: block;
        margin-bottom: 8px;
        color: #cbd5e1;
      }

      #mrs-settings input[type="password"],
      #mrs-settings input[type="number"] {
        width: 100%;
        box-sizing: border-box;
        margin-top: 3px;
        background: #020617;
        color: #e5e7eb;
        border: 1px solid #4b5563;
        border-radius: 6px;
        padding: 5px;
      }

      .mrs-mini-tab {
        position: fixed;
        left: 10px;
        bottom: 92px;
        z-index: 999999;
        background: linear-gradient(90deg, #6d28d9, #2563eb);
        color: white;
        border: none;
        border-radius: 999px;
        padding: 5px 9px;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(0,0,0,0.35);
        font-size: 11px;
        opacity: 0.88;
      }
    `;

    document.head.appendChild(style);
  }

  function showMiniTab(panel) {
    panel.style.display = 'none';
    localStorage.setItem(LS.MINIMISED, 'true');

    let tab = document.getElementById('mrs-mini-tab');
    if (!tab) {
      tab = document.createElement('button');
      tab.id = 'mrs-mini-tab';
      tab.className = 'mrs-mini-tab';
      tab.textContent = 'RC';
      document.body.appendChild(tab);

      tab.addEventListener('click', () => {
        if (!isProfilePage()) return;

        localStorage.setItem(LS.MINIMISED, 'false');
        panel.style.display = 'block';
        tab.style.display = 'none';
        render(true);
      });
    }

    tab.style.display = isProfilePage() ? 'block' : 'none';
  }

  function createPanel() {
    let panel = document.getElementById('mrstez-recruit-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'mrstez-recruit-panel';
    panel.innerHTML = `
      <div class="mrs-header">
        <div>
          <strong>MrStez Recruit Check</strong>
          <span class="mrs-version">v${VERSION}</span>
        </div>
        <button id="mrs-minimise">–</button>
      </div>

      <div id="mrs-body">
        <div class="mrs-controls">
          <button id="mrs-toggle"></button>
          <button id="mrs-refresh">Refresh</button>
          <button id="mrs-settings-btn">Settings</button>
        </div>

        <div id="mrs-status">Waiting for profile...</div>
        <div id="mrs-results"></div>

        <div id="mrs-settings" style="display:none;">
          <label>API Key
            <input id="mrs-api-key" type="password" placeholder="Uses shared MrStez key if available">
          </label>

          <label>Cache minutes
            <input id="mrs-cache-mins" type="number" min="1" value="${settings.cacheMinutes}">
          </label>

          <label>Green Xanax/day
            <input id="mrs-xan-green" type="number" step="0.01" value="${settings.minXanaxPerDayGreen}">
          </label>

          <label>Amber Xanax/day
            <input id="mrs-xan-amber" type="number" step="0.01" value="${settings.minXanaxPerDayAmber}">
          </label>

          <label>
            <input id="mrs-debug" type="checkbox" ${settings.showDebug ? 'checked' : ''}>
            Debug mode
          </label>

          <button id="mrs-save-settings">Save Settings</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    addStyles();
    wirePanel(panel);

    if (!isProfilePage()) {
      panel.style.display = 'none';
    } else if (localStorage.getItem(LS.MINIMISED) !== 'false') {
      showMiniTab(panel);
    }

    return panel;
  }

  function wirePanel(panel) {
    const toggle = panel.querySelector('#mrs-toggle');
    const refresh = panel.querySelector('#mrs-refresh');
    const settingsBtn = panel.querySelector('#mrs-settings-btn');
    const settingsBox = panel.querySelector('#mrs-settings');
    const saveBtn = panel.querySelector('#mrs-save-settings');
    const minimise = panel.querySelector('#mrs-minimise');

    function updateToggleText() {
      toggle.textContent = enabled ? 'Enabled' : 'Disabled';
      toggle.style.background = enabled ? '#166534' : '#7f1d1d';
    }

    updateToggleText();

    toggle.addEventListener('click', () => {
      enabled = !enabled;
      localStorage.setItem(LS.ENABLED, String(enabled));
      updateToggleText();
      render();
    });

    refresh.addEventListener('click', () => {
      if (currentProfileId) localStorage.removeItem(cacheKey(currentProfileId));
      render(true);
    });

    settingsBtn.addEventListener('click', () => {
      settingsBox.style.display = settingsBox.style.display === 'none' ? 'block' : 'none';
      panel.querySelector('#mrs-api-key').value = localStorage.getItem(LS.API_KEY) || '';
    });

    saveBtn.addEventListener('click', () => {
      const apiInput = panel.querySelector('#mrs-api-key').value.trim();
      if (apiInput) setApiKey(apiInput);

      settings.cacheMinutes = Number(panel.querySelector('#mrs-cache-mins').value) || DEFAULT_SETTINGS.cacheMinutes;
      settings.minXanaxPerDayGreen = Number(panel.querySelector('#mrs-xan-green').value) || DEFAULT_SETTINGS.minXanaxPerDayGreen;
      settings.minXanaxPerDayAmber = Number(panel.querySelector('#mrs-xan-amber').value) || DEFAULT_SETTINGS.minXanaxPerDayAmber;
      settings.showDebug = panel.querySelector('#mrs-debug').checked;

      saveSettings();
      alert('Recruitment checker settings saved.');
      render(true);
    });

    minimise.addEventListener('click', () => {
      showMiniTab(panel);
    });

    makeDraggable(panel, panel.querySelector('.mrs-header'));
  }

  function makeDraggable(panel, handle) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('mousedown', e => {
      dragging = true;
      offsetX = e.clientX - panel.offsetLeft;
      offsetY = e.clientY - panel.offsetTop;
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      panel.style.left = `${e.clientX - offsetX}px`;
      panel.style.top = `${e.clientY - offsetY}px`;
      panel.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  function renderCard(playerId, data, evaluation) {
    const name = data.name || data.profile?.name || `Player ${playerId}`;

    return `
      <div class="mrs-card">
        <div class="mrs-rating" style="background:${evaluation.colour}">
          ${evaluation.rating} — ${evaluation.score} pts
        </div>

        <div><strong>${name}</strong> [${playerId}]</div>

        <div class="mrs-row"><span>Level</span><span>${evaluation.level || 'Unknown'}</span></div>
        <div class="mrs-row"><span>Age</span><span>${evaluation.ageDays} days</span></div>
        <div class="mrs-row"><span>Last action</span><span>${fmtLastAction(evaluation.lastActionMinutes)}</span></div>
        <div class="mrs-row"><span>Xanax</span><span>${evaluation.xanax}</span></div>
        <div class="mrs-row"><span>Xanax/day</span><span>${evaluation.xanaxPerDay.toFixed(3)}</span></div>
        <div class="mrs-row"><span>Networth</span><span>${fmtMoney(evaluation.networth)}</span></div>
        <div class="mrs-row"><span>Expected NW</span><span>${fmtMoney(evaluation.expectedNetworth)}</span></div>
        <div class="mrs-row"><span>NW ratio</span><span>${Math.round(evaluation.networthRatio * 100)}%</span></div>
        <div class="mrs-row"><span>Private Island</span><span>${evaluation.pi ? 'Yes' : 'No / Unknown'}</span></div>
        <div class="mrs-row"><span>Sub/Donator</span><span>${evaluation.sub ? 'Yes / likely' : 'No / Unknown'}</span></div>

        ${renderList('Good signs', evaluation.positives, 'mrs-positive')}
        ${renderList('Review notes', evaluation.warnings, 'mrs-warning')}
        ${renderList('Risks', evaluation.risks, 'mrs-risk')}
      </div>
    `;
  }

  function renderList(title, items, cls) {
    if (!items || !items.length) return '';
    return `
      <div class="${cls}">
        <strong>${title}</strong>
        <ul class="mrs-list">
          ${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[s]));
  }

  async function render(force = false) {
    const panel = createPanel();
    const tab = document.getElementById('mrs-mini-tab');

    if (!isProfilePage()) {
      panel.style.display = 'none';
      if (tab) tab.style.display = 'none';
      return;
    }

    if (localStorage.getItem(LS.MINIMISED) === 'true') {
      panel.style.display = 'none';
      if (tab) tab.style.display = 'block';
      return;
    }

    if (tab) tab.style.display = 'none';
    panel.style.display = 'block';

    const status = panel.querySelector('#mrs-status');
    const results = panel.querySelector('#mrs-results');

    if (!enabled) {
      status.textContent = 'Recruitment checker is disabled.';
      results.innerHTML = '';
      return;
    }

    if (!getApiKey()) {
      status.textContent = 'No API key found. Add one in Settings.';
      results.innerHTML = '';
      return;
    }

    const playerId = getProfileIdFromUrl();
    currentProfileId = playerId;

    if (!playerId) {
      status.textContent = 'No profile ID found.';
      results.innerHTML = '';
      return;
    }

    status.textContent = `Checking player ${playerId}...`;

    try {
      if (force) localStorage.removeItem(cacheKey(playerId));
      const data = await apiCall(playerId);
      const evaluation = evaluateRecruit(data);
      results.innerHTML = renderCard(playerId, data, evaluation);
      status.textContent = `Profile check complete. Cache: ${settings.cacheMinutes} mins.`;
    } catch (err) {
      status.textContent = `API error: ${err.message}`;
      results.innerHTML = '';
    }
  }

  function boot() {
    createPanel();

    if (isProfilePage()) {
      showMiniTab(createPanel());
    }

    setInterval(() => {
      if (location.href !== lastRenderedUrl) {
        lastRenderedUrl = location.href;
        setTimeout(render, 800);
      }
    }, 1000);

    const observer = new MutationObserver(() => {
      clearTimeout(window.__mrsRecruitRenderTimer);
      window.__mrsRecruitRenderTimer = setTimeout(render, 1000);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  setTimeout(boot, 1200);
})();