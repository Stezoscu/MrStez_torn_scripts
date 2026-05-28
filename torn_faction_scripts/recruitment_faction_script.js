// ==UserScript==
// @name         MrStez Torn Recruitment Checker
// @namespace    mrstez.torn.recruitment
// @version      1.8.0
// @updateURL    https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_faction_scripts/recruitment_faction_script.js
// @downloadURL  https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_faction_scripts/recruitment_faction_script.js
// @description  Compact recruitment checker with chat/mail templates and DOM-only BSP/FF estimate detection
// @author       MrStez + Ace
// @match        https://www.torn.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '1.8.0';

  const LS = {
    ENABLED: 'mrstez_recruit_checker_enabled',
    API_KEY: 'mrstez_recruit_checker_api_key',
    CACHE_PREFIX: 'mrstez_recruit_checker_cache_',
    SETTINGS: 'mrstez_recruit_checker_settings',
    MINIMISED: 'mrstez_recruit_checker_minimised',
    CHAT_TEMPLATE: 'mrstez_recruit_checker_chat_template',
    MAIL_TEMPLATE: 'mrstez_recruit_checker_mail_template'
  };

  const DEFAULT_CHAT =
    'Hey {name}, saw your profile and thought you might be a good fit for DarkHearts. Are you currently looking for a faction, or open to a quick chat about joining us?';

  const DEFAULT_MAIL_HTML =
    '<p>Hey {name},</p>' +
    '<p>Saw your profile and thought you might be a good fit for DarkHearts. If you are looking for a faction, or open to a quick chat, click the banner below and have a look at us.</p>' +
    '<p><a href="/factions.php?step=profile&amp;ID=9047&amp;referredFrom=2578478"><img src="https://iili.io/CdyZbkP.gif" alt="DarkHearts Faction" /></a></p>';

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
  let currentProfileName = null;
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

  function fillTemplate(template, name, id) {
    return template
      .replaceAll('{name}', name || 'there')
      .replaceAll('{id}', id || '');
  }

  function getChatMessage(name, id) {
    return fillTemplate(localStorage.getItem(LS.CHAT_TEMPLATE) || DEFAULT_CHAT, name, id);
  }

  function getMailHtml(name, id) {
    return fillTemplate(localStorage.getItem(LS.MAIL_TEMPLATE) || DEFAULT_MAIL_HTML, name, id);
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
      if (Date.now() - cached.timestamp > settings.cacheMinutes * 60 * 1000) return null;
      return cached.data;
    } catch {
      return null;
    }
  }

  function setCached(playerId, data) {
    localStorage.setItem(cacheKey(playerId), JSON.stringify({ timestamp: Date.now(), data }));
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
    if (data.error) throw new Error(`${data.error.code}: ${data.error.error}`);

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
      if (last.timestamp) return Math.max(0, Math.round((Date.now() / 1000 - Number(last.timestamp)) / 60));
      if (last.relative) return parseRelativeTimeToMinutes(last.relative);
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

  function getInjectedBspFfStats() {
    const result = {
      bsp: null,
      ffEst: null,
      source: 'Not detected'
    };

    const blocks = [...document.querySelectorAll('body *')]
      .filter(isVisible)
      .map(el => ({
        text: cleanText(el.innerText || el.textContent || ''),
        id: (el.id || '').toLowerCase(),
        cls: (el.className || '').toString().toLowerCase()
      }))
      .filter(x => x.text && x.text.length < 700);

    const interesting = blocks.filter(x => {
      const t = x.text.toLowerCase();
      return (
        x.id.includes('bsp') ||
        x.id.includes('ff') ||
        x.id.includes('spy') ||
        x.cls.includes('bsp') ||
        x.cls.includes('ff') ||
        x.cls.includes('spy') ||
        t.includes('bsp') ||
        t.includes('fairfight') ||
        t.includes('fair fight') ||
        t.includes('est. stats') ||
        t.includes('estimated stats') ||
        t.includes('battle stat')
      );
    });

    for (const block of interesting) {
      const t = block.text;

      if (!result.bsp && /\bBSP\b/i.test(t)) {
        const m =
          t.match(/\bBSP\b\s*[:\-]?\s*([\d,.]+\s*(?:k|m|b|t|q)?)/i) ||
          t.match(/\bBattle\s*Stat(?:s)?\s*Prediction\b\s*[:\-]?\s*([\d,.]+\s*(?:k|m|b|t|q)?)/i);

        if (m && looksLikeUsefulValue(m[1])) {
          result.bsp = normaliseStatValue(m[1]);
          result.source = 'Visible DOM';
        }
      }

      if (!result.ffEst && /\b(FairFight|Fair Fight|FF)\b/i.test(t)) {
        const m =
          t.match(/\bEst\.?\s*Stats?\b\s*[:\-]?\s*([\d,.]+\s*(?:k|m|b|t|q)?)/i) ||
          t.match(/\bEstimated\s*Stats?\b\s*[:\-]?\s*([\d,.]+\s*(?:k|m|b|t|q)?)/i) ||
          t.match(/\bEstimated\s*Battle\s*Stats?\b\s*[:\-]?\s*([\d,.]+\s*(?:k|m|b|t|q)?)/i);

        if (m && looksLikeUsefulValue(m[1])) {
          result.ffEst = normaliseStatValue(m[1]);
          result.source = 'Visible DOM';
        }
      }
    }

    return result;
  }

  function cleanText(text) {
    return String(text).replace(/\s+/g, ' ').replace(/[()]/g, ' ').trim();
  }

  function normaliseStatValue(value) {
    return String(value || '').replace(/\s+/g, '').trim();
  }

  function looksLikeUsefulValue(value) {
    const v = String(value || '').trim().toLowerCase();
    return !!v && /\d/.test(v) && v.length <= 24;
  }

  function evaluateRecruit(data) {
    const ageDays = getAgeDays(data);
    const level = getLevel(data);
    const lastActionMinutes = getLastActionMinutes(data);

    const xanax = getPersonalStat(data, ['xantaken', 'xanax_taken', 'xanax', 'drugsused_xanax']);
    const networth = getPersonalStat(data, ['networth', 'total_networth']);

    const xanaxPerDay = ageDays > 0 ? xanax / ageDays : 0;
    const expectedNetworth = getExpectedNetworth(ageDays, level);
    const networthScore = scoreNetworth(networth, expectedNetworth);
    const injectedStats = getInjectedBspFfStats();

    const pi = hasPrivateIsland(data);
    const sub = hasSubscriberOrDonator(data);

    let score = 0;
    const positives = [];
    const warnings = [];
    const risks = [];

    if (lastActionMinutes === null) warnings.push('Could not read last action.');
    else if (lastActionMinutes <= settings.minRecentMinutesGreen) {
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

    if (level > 0 && level < 15) warnings.push('Level below 15, reduced networth expectation applied.');

    if (injectedStats.bsp || injectedStats.ffEst) positives.push('Visible BSP/FF stat estimate detected.');
    else warnings.push('No visible BSP/FF stat estimate detected. Only visible script output is read.');

    if (pi) {
      score += 12;
      positives.push('Private Island owned.');
    } else warnings.push('No Private Island detected.');

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
      score, rating, colour, ageDays, level, lastActionMinutes,
      xanax, xanaxPerDay, networth, expectedNetworth,
      networthRatio: networthScore.ratio, injectedStats, pi, sub,
      positives, warnings, risks
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
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)}d`;
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied.`);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast(`${label} copied.`);
    }
  }

  function copyChatMessage() {
    const playerId = currentProfileId || getProfileIdFromUrl();
    const name = currentProfileName || 'there';
    copyText(getChatMessage(name, playerId), 'Chat message');
  }

  function copyMailHtml() {
    const playerId = currentProfileId || getProfileIdFromUrl();
    const name = currentProfileName || 'there';
    copyText(getMailHtml(name, playerId), 'Mail HTML');
  }

  function openChatWithPlayer() {
    copyChatMessage();

    const candidates = [...document.querySelectorAll('button, a, div[role="button"], span[role="button"]')]
      .filter(el => isVisible(el))
      .filter(el => {
        const text = (el.innerText || el.textContent || '').trim().toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        const cls = (el.className || '').toString().toLowerCase();
        return text === 'chat' || text.includes('chat') || aria.includes('chat') || title.includes('chat') || cls.includes('chat');
      });

    if (candidates.length) {
      candidates[0].click();
      toast('Tried to open chat. Chat text copied.');
      return;
    }

    toast('Could not find chat button. Chat text copied.');
  }

  function openMailWithPlayer() {
    const playerId = currentProfileId || getProfileIdFromUrl();
    const name = currentProfileName || '';
    const body = encodeURIComponent(getMailHtml(name, playerId));
    const subject = encodeURIComponent('DarkHearts faction');

    copyMailHtml();
    window.open(`https://www.torn.com/messages.php#/p=compose&XID=${playerId}&subject=${subject}&body=${body}`, '_blank');
    toast('Opened mail if supported. Mail HTML copied.');
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function toast(msg) {
    let t = document.getElementById('mrs-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'mrs-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(window.__mrsToastTimer);
    window.__mrsToastTimer = setTimeout(() => { t.style.display = 'none'; }, 1800);
  }

  function addStyles() {
    if (document.getElementById('mrstez-recruit-styles')) return;

    const style = document.createElement('style');
    style.id = 'mrstez-recruit-styles';
    style.textContent = `
      #mrstez-recruit-panel {
        position: fixed; top: 90px; right: 12px; width: 340px; max-width: calc(100vw - 24px);
        z-index: 999999; background: #111827; color: #e5e7eb; border: 1px solid #374151;
        border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.45);
        font-family: Arial, sans-serif; font-size: 12px; overflow: hidden;
      }
      #mrstez-recruit-panel .mrs-header {
        background: linear-gradient(90deg, #6d28d9, #2563eb); color: white; padding: 8px 10px;
        display: flex; justify-content: space-between; align-items: center; cursor: move;
      }
      #mrstez-recruit-panel .mrs-version { font-size: 10px; opacity: 0.8; margin-left: 5px; }
      #mrstez-recruit-panel button {
        background: #1f2937; color: #f9fafb; border: 1px solid #4b5563; border-radius: 7px;
        padding: 4px 7px; cursor: pointer; font-size: 11px;
      }
      #mrs-body { padding: 8px; }
      .mrs-controls, .mrs-actions { display: flex; gap: 5px; margin-bottom: 6px; flex-wrap: wrap; }
      #mrs-status { display: none; }
      .mrs-card {
        border: 1px solid #374151; border-radius: 10px; padding: 8px; margin-bottom: 6px; background: #020617;
      }
      .mrs-topline { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 5px; }
      .mrs-rating { font-weight: bold; padding: 4px 7px; border-radius: 7px; color: white; display: inline-block; white-space: nowrap; }
      .mrs-player { font-size: 12px; opacity: 0.95; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mrs-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px 5px; margin-top: 5px; margin-bottom: 6px; }
      .mrs-stat { border: 1px solid #1f2937; border-radius: 6px; padding: 3px 4px; min-width: 0; background: rgba(255,255,255,0.02); line-height: 1.15; }
      .mrs-stat-label { color: #9ca3af; font-size: 9.5px; margin-right: 2px; }
      .mrs-stat-value { color: #e5e7eb; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
      .mrs-list-block { margin-top: 5px; }
      .mrs-list-block strong { font-size: 12px; }
      .mrs-list { margin: 2px 0 0 15px; padding: 0; }
      .mrs-list li { margin: 1px 0; line-height: 1.18; }
      .mrs-positive { color: #86efac; }
      .mrs-warning { color: #facc15; }
      .mrs-risk { color: #fca5a5; }
      #mrs-settings { border-top: 1px solid #374151; margin-top: 8px; padding-top: 8px; }
      #mrs-settings label { display: block; margin-bottom: 7px; color: #cbd5e1; }
      #mrs-settings input, #mrs-settings textarea {
        width: 100%; box-sizing: border-box; margin-top: 3px; background: #020617; color: #e5e7eb;
        border: 1px solid #4b5563; border-radius: 6px; padding: 5px; font-family: Arial, sans-serif; font-size: 12px;
      }
      #mrs-settings textarea { min-height: 74px; resize: vertical; }
      .mrs-mini-tab {
        position: fixed; left: 10px; bottom: 92px; z-index: 999999;
        background: linear-gradient(90deg, #6d28d9, #2563eb); color: white; border: none;
        border-radius: 999px; padding: 5px 9px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.35);
        font-size: 11px; opacity: 0.88;
      }
      #mrs-toast {
        position: fixed; left: 50%; bottom: 120px; transform: translateX(-50%); z-index: 1000000;
        background: #111827; color: white; border: 1px solid #4b5563; border-radius: 999px;
        padding: 7px 12px; font-size: 12px; box-shadow: 0 4px 18px rgba(0,0,0,0.45); display: none;
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
        <div><strong>MrStez Recruit Check</strong><span class="mrs-version">v${VERSION}</span></div>
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
          <label>API Key <input id="mrs-api-key" type="password" placeholder="Uses shared MrStez key if available"></label>
          <label>Cache minutes <input id="mrs-cache-mins" type="number" min="1" value="${settings.cacheMinutes}"></label>
          <label>Green Xanax/day <input id="mrs-xan-green" type="number" step="0.01" value="${settings.minXanaxPerDayGreen}"></label>
          <label>Amber Xanax/day <input id="mrs-xan-amber" type="number" step="0.01" value="${settings.minXanaxPerDayAmber}"></label>
          <label>Chat template <textarea id="mrs-chat-template" placeholder="Plain text. Use {name} and {id}."></textarea></label>
          <label>Mail HTML template <textarea id="mrs-mail-template" placeholder="HTML allowed. Use {name} and {id}."></textarea></label>
          <label><input id="mrs-debug" type="checkbox" ${settings.showDebug ? 'checked' : ''}> Debug mode</label>
          <button id="mrs-save-settings">Save Settings</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    addStyles();
    wirePanel(panel);

    if (!isProfilePage()) panel.style.display = 'none';
    else if (localStorage.getItem(LS.MINIMISED) !== 'false') showMiniTab(panel);

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
      panel.querySelector('#mrs-chat-template').value = localStorage.getItem(LS.CHAT_TEMPLATE) || DEFAULT_CHAT;
      panel.querySelector('#mrs-mail-template').value = localStorage.getItem(LS.MAIL_TEMPLATE) || DEFAULT_MAIL_HTML;
    });

    saveBtn.addEventListener('click', () => {
      const apiInput = panel.querySelector('#mrs-api-key').value.trim();
      const chatInput = panel.querySelector('#mrs-chat-template').value.trim();
      const mailInput = panel.querySelector('#mrs-mail-template').value.trim();

      if (apiInput) setApiKey(apiInput);
      localStorage.setItem(LS.CHAT_TEMPLATE, chatInput || DEFAULT_CHAT);
      localStorage.setItem(LS.MAIL_TEMPLATE, mailInput || DEFAULT_MAIL_HTML);

      settings.cacheMinutes = Number(panel.querySelector('#mrs-cache-mins').value) || DEFAULT_SETTINGS.cacheMinutes;
      settings.minXanaxPerDayGreen = Number(panel.querySelector('#mrs-xan-green').value) || DEFAULT_SETTINGS.minXanaxPerDayGreen;
      settings.minXanaxPerDayAmber = Number(panel.querySelector('#mrs-xan-amber').value) || DEFAULT_SETTINGS.minXanaxPerDayAmber;
      settings.showDebug = panel.querySelector('#mrs-debug').checked;

      saveSettings();
      toast('Settings saved.');
      render(true);
    });

    minimise.addEventListener('click', () => showMiniTab(panel));
    makeDraggable(panel, panel.querySelector('.mrs-header'));
  }

  function makeDraggable(panel, handle) {
    let dragging = false, offsetX = 0, offsetY = 0;

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

    document.addEventListener('mouseup', () => { dragging = false; });
  }

  function statCell(label, value) {
    return `<div class="mrs-stat"><span class="mrs-stat-label">${escapeHtml(label)}</span><span class="mrs-stat-value">${escapeHtml(value)}</span></div>`;
  }

  function renderCard(playerId, data, evaluation) {
    const name = data.name || data.profile?.name || `Player ${playerId}`;
    currentProfileName = name;

    const bsp = evaluation.injectedStats?.bsp || 'N/D';
    const ffEst = evaluation.injectedStats?.ffEst || 'N/D';

    return `
      <div class="mrs-card">
        <div class="mrs-topline">
          <div class="mrs-rating" style="background:${evaluation.colour}">${evaluation.rating} — ${evaluation.score}</div>
          <div class="mrs-player">${escapeHtml(name)} [${escapeHtml(playerId)}]</div>
        </div>
        <div class="mrs-actions">
          <button id="mrs-copy-chat">Copy Chat</button>
          <button id="mrs-copy-mail">Copy Mail</button>
          <button id="mrs-open-chat">Chat</button>
          <button id="mrs-open-mail">Mail</button>
        </div>
        <div class="mrs-grid">
          ${statCell('Lvl', String(evaluation.level || '?'))}
          ${statCell('Age', `${evaluation.ageDays}d`)}
          ${statCell('Active', fmtLastAction(evaluation.lastActionMinutes))}
          ${statCell('Xan', String(evaluation.xanax))}
          ${statCell('X/d', evaluation.xanaxPerDay.toFixed(2))}
          ${statCell('NW', fmtMoney(evaluation.networth))}
          ${statCell('BSP', bsp)}
          ${statCell('FF Est', ffEst)}
          ${statCell('NW%', `${Math.round(evaluation.networthRatio * 100)}%`)}
          ${statCell('PI', evaluation.pi ? 'Yes' : 'No')}
          ${statCell('Sub', evaluation.sub ? 'Yes' : 'No')}
          ${statCell('ExpNW', fmtMoney(evaluation.expectedNetworth))}
        </div>
        ${renderList('Good', evaluation.positives, 'mrs-positive')}
        ${renderList('Review', evaluation.warnings, 'mrs-warning')}
        ${renderList('Risks', evaluation.risks, 'mrs-risk')}
      </div>
    `;
  }

  function attachActionButtons() {
    const copyChatBtn = document.getElementById('mrs-copy-chat');
    const copyMailBtn = document.getElementById('mrs-copy-mail');
    const chatBtn = document.getElementById('mrs-open-chat');
    const mailBtn = document.getElementById('mrs-open-mail');

    if (copyChatBtn) copyChatBtn.onclick = copyChatMessage;
    if (copyMailBtn) copyMailBtn.onclick = copyMailHtml;
    if (chatBtn) chatBtn.onclick = openChatWithPlayer;
    if (mailBtn) mailBtn.onclick = openMailWithPlayer;
  }

  function renderList(title, items, cls) {
    if (!items || !items.length) return '';
    return `<div class="${cls} mrs-list-block"><strong>${title}</strong><ul class="mrs-list">${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
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

    try {
      if (force) localStorage.removeItem(cacheKey(playerId));
      const data = await apiCall(playerId);
      const evaluation = evaluateRecruit(data);
      results.innerHTML = renderCard(playerId, data, evaluation);
      attachActionButtons();
      status.textContent = `Done. Cache: ${settings.cacheMinutes} mins.`;
    } catch (err) {
      status.textContent = `API error: ${err.message}`;
      results.innerHTML = '';
    }
  }

  function boot() {
    createPanel();
    if (isProfilePage()) showMiniTab(createPanel());

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

    observer.observe(document.body, { childList: true, subtree: true });
  }

  setTimeout(boot, 1200);
})();