// ==UserScript==
// @name         Torn OC Best Role Helper (Cached)
// @namespace    ace.torn.oc.ev
// @updateURL    https://raw.githubusercontent.com/YOURUSER/YOURREPO/main/scripts/my-script.user.js
// @downloadURL  https://raw.githubusercontent.com/YOURUSER/YOURREPO/main/scripts/my-script.user.js
// @version      2.0.0
// @description  Shows the single best OC role for you based on EV. Uses faction bot cache for enrichment — falls back to direct API if cache unavailable.
// @author       Rat, MrStez and Ace
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @connect      torn-faction-bot-production.up.railway.app
// @connect      api.torn.com
// ==/UserScript==

(function () {
  'use strict';

  // ─── CONFIG ───────────────────────────────────────────────
  // Get your cache token from the bot admin (/ping in Discord to confirm it's set)
  // Or derive it: sha256(SECRET_KEY)[:16] — ask your faction bot admin
  const BOT_URL    = 'https://torn-faction-bot-production.up.railway.app';
  const CACHE_TOKEN = localStorage.getItem('tfb_oc_cache_token') || '';
  // ──────────────────────────────────────────────────────────

  const IS_PDA = typeof PDA_httpGet === 'function';
  const IS_GM  = typeof GM_xmlhttpRequest === 'function';

  // ─── Crime weights (position_id → weight) ─────────────────
  // These stay in the script as they're EV calculation logic, not API data
  const crimeWeights = {
    "Mob Mentality": { "P1": 0.34, "P2": 0.26, "P3": 0.18, "P4": 0.23 },
    "Pet Project": { "P1": 0, "P2": 0, "P3": 0 },
    "Best of the Lot": { "P1": 0, "P2": 0, "P3": 0 },
    "Cash Me if You Can": { "P1": 0.50, "P2": 0.22, "P3": 0.28 },
    "Smoke and Wing Mirrors": { "P1": 0.51, "P2": 0.27, "P3": 0.09, "P4": 0.13 },
    "Market Forces": { "P1": 0.29, "P2": 0.27, "P3": 0.16, "P4": 0.05, "P5": 0.23 },
    "Gaslight the Way": { "P1": 0.09, "P2": 0.10, "P3": 0.27, "P4": 0, "P5": 0.41, "P6": 0.13 },
    "Snow Blind": { "P1": 0.48, "P2": 0.36, "P3": 0.08, "P4": 0.08 },
    "Stage Fright": { "P1": 0.16, "P2": 0.20, "P3": 0.03, "P4": 0.09, "P5": 0.06, "P6": 0.46 },
    "No Reserve": { "P1": 0.31, "P2": 0.38, "P3": 0.31 },
    "Counter Offer": { "P1": 0.36, "P2": 0.07, "P3": 0.12, "P4": 0.17, "P5": 0.28 },
    "Leave No Trace": { "P1": 0.29, "P2": 0.34, "P3": 0.37 },
    "Bidding War": { "P1": 0.07, "P2": 0.13, "P3": 0.22, "P4": 0.32, "P5": 0.08, "P6": 0.18 },
    "Honey Trap": { "P1": 0.27, "P2": 0.31, "P3": 0.42 },
    "Blast from the Past": { "P1": 0.11, "P2": 0.12, "P3": 0.24, "P4": 0.16, "P5": 0.34, "P6": 0.03 },
    "Clinical Precision": { "P1": 0.43, "P2": 0.19, "P3": 0.16, "P4": 0.22 },
    "Break the Bank": { "P1": 0.13, "P2": 0.14, "P3": 0.10, "P4": 0.03, "P5": 0.32, "P6": 0.29 },
    "Stacking the Deck": { "P1": 0.23, "P2": 0.03, "P3": 0.26, "P4": 0.48 },
    "Ace in the Hole": { "P1": 0.21, "P2": 0.18, "P3": 0.25, "P4": 0.28, "P5": 0.08 }
  };

  const crimePayouts = {
    "Mob Mentality": { min: 829625, max: 1371357 },
    "Pet Project": { min: 414000, max: 800000 },
    "Best of the Lot": { min: 810000, max: 1900000 },
    "Cash Me if You Can": { min: 856800, max: 1555062 },
    "Smoke and Wing Mirrors": { min: 2100000, max: 4700000 },
    "Market Forces": { min: 4691974, max: 8453868 },
    "Gaslight the Way": { min: 4798464, max: 7975605 },
    "Snow Blind": { min: 6170615, max: 10331828 },
    "Stage Fright": { min: 12450000, max: 24900000 },
    "No Reserve": { min: 25715641, max: 42919528 },
    "Counter Offer": { min: 12350114, max: 33918610 },
    "Leave No Trace": { min: 7499500, max: 12990583 },
    "Bidding War": { min: 51431283, max: 85639056 },
    "Honey Trap": { min: 14775212, max: 25643705 },
    "Blast from the Past": { min: 99931212, max: 167566309 },
    "Clinical Precision": { min: 66239666, max: 117161350 },
    "Break the Bank": { min: 216237500, max: 376145789 },
    "Stacking the Deck": { min: 152170777, max: 250765713 },
    "Ace in the Hole": { min: 190213472, max: 313457142 }
  };

  const P = 0.5;
  const K = 0.5;

  // ─── HTTP helper ──────────────────────────────────────────

  function httpGet(url, callback) {
    if (IS_PDA) {
      PDA_httpGet(url)
        .then(r => { try { callback(null, JSON.parse(r)); } catch(e) { callback(e, null); } })
        .catch(e => callback(e, null));
    } else if (IS_GM) {
      GM_xmlhttpRequest({
        method: 'GET', url,
        onload: r => { try { callback(null, JSON.parse(r.responseText)); } catch(e) { callback(e, null); } },
        onerror: () => callback(new Error('Network error'), null)
      });
    } else {
      fetch(url)
        .then(r => r.json())
        .then(d => callback(null, d))
        .catch(e => callback(e, null));
    }
  }

  // ─── Page detection ───────────────────────────────────────

  let btn = null;
  let panel = null;
  let observer = null;
  let lastUrl = location.href;

  function isCrimesTab() {
    return location.pathname === '/factions.php'
      && location.href.includes('step=your')
      && location.href.includes('type=1')
      && location.href.includes('#/tab=crimes');
  }

  // ─── UI (unchanged from original) ─────────────────────────

  function injectStyles() {
    if (document.getElementById('ace-best-oc-role-styles')) return;
    const style = document.createElement('style');
    style.id = 'ace-best-oc-role-styles';
    style.textContent = `
      #ace-best-oc-role-btn {
        opacity: 1 !important; mix-blend-mode: normal !important;
        filter: none !important; isolation: isolate !important;
      }
      #ace-best-oc-role-panel {
        position: fixed !important; opacity: 1 !important;
        background: #111 !important; color: #eee !important;
        mix-blend-mode: normal !important; filter: none !important;
        isolation: isolate !important;
      }
      #ace-best-oc-role-panel * {
        opacity: 1 !important; mix-blend-mode: normal !important;
        filter: none !important; text-shadow: none !important;
        box-sizing: border-box !important;
      }
      #ace-best-oc-role-panel a { color: #4af !important; text-decoration: underline !important; }
      #tfb-oc-cache-status { font-size: 10px; color: #666; margin-top: 4px; }
    `;
    document.head.appendChild(style);
  }

  function createUi() {
    if (document.getElementById('ace-best-oc-role-btn')) return;

    btn = document.createElement('button');
    btn.id = 'ace-best-oc-role-btn';
    btn.textContent = 'Best OC Role';
    Object.assign(btn.style, {
      position: 'fixed', bottom: '52px', right: '12px', zIndex: '99999',
      padding: '6px 10px', background: '#2a4cff', color: '#fff',
      border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer'
    });
    document.body.appendChild(btn);

    panel = document.createElement('div');
    panel.id = 'ace-best-oc-role-panel';
    Object.assign(panel.style, {
      position: 'fixed', bottom: '100px', right: '12px', width: '90%',
      maxWidth: '360px', background: '#111', color: '#eee',
      border: '1px solid #444', borderRadius: '8px', padding: '10px',
      zIndex: '99999', display: 'none', fontSize: '13px', lineHeight: '1.4'
    });
    document.body.appendChild(panel);

    btn.onclick = () => {
      const opening = panel.style.display === 'none';
      panel.style.display = opening ? 'block' : 'none';
      if (opening) fetchCrimes();
    };
  }

  function removeUi() {
    document.getElementById('ace-best-oc-role-btn')?.remove();
    document.getElementById('ace-best-oc-role-panel')?.remove();
    btn = null;
    panel = null;
  }

  // ─── Data fetching — cache first, API fallback ─────────────

  async function fetchCrimes() {
    if (!panel) return;
    panel.innerHTML = 'Loading...';

    // Try bot cache first
    if (CACHE_TOKEN) {
      httpGet(`${BOT_URL}/api/oc-cache/${CACHE_TOKEN}`, (err, data) => {
        if (!err && data && data.crimes) {
          const age = data.updated_at
            ? Math.round((Date.now() - new Date(data.updated_at)) / 1000)
            : null;
          processCrimes(data.crimes, age);
        } else {
          // Cache unavailable — fall back to direct API
          fetchFromApi();
        }
      });
    } else {
      fetchFromApi();
    }
  }

  function fetchFromApi() {
    const key = localStorage.getItem('ace.oc.key') || prompt('Enter Torn API key:');
    if (!key) return;
    localStorage.setItem('ace.oc.key', key);

    httpGet(
      `https://api.torn.com/v2/faction/crimes?cat=recruiting&key=${encodeURIComponent(key)}`,
      (err, data) => {
        if (err || !data) {
          if (panel) panel.innerHTML = 'Error fetching data.';
          return;
        }
        if (data.error) {
          if (panel) panel.innerHTML = `API error: ${escapeHtml(data.error.error || 'Unknown')}`;
          return;
        }
        processCrimes(data.crimes || [], null);
      }
    );
  }

  // ─── Processing (same logic as original) ──────────────────

  function processCrimes(crimes, cacheAgeSeconds) {
    if (!crimes || !crimes.length) {
      if (panel) panel.innerHTML = 'No recruiting OCs found.';
      return;
    }

    const rows = [];
    let consideredCount = 0;

    for (const crime of crimes) {
      if (!crime.slots || !crime.slots.length) continue;

      const members = crime.slots.length;
      let totalRemaining = 0;
      let filled = 0;

      for (const slot of crime.slots) {
        if (slot.occupied) {
          totalRemaining += 100 - (slot.checkpoint_pass_rate || 0);
          filled++;
        } else {
          totalRemaining += 100;
        }
      }

      const stallHours = totalRemaining * 0.24;

      for (const slot of crime.slots) {
        if (slot.occupied) continue;

        const payoutMax = crimePayouts[crime.name]?.max;
        if (!payoutMax) continue;

        let weight = crimeWeights[crime.name]?.[slot.position_id];
        if (weight == null) weight = 1 / members;

        const ev = estPayout(weight, payoutMax, slot.checkpoint_pass_rate || 0, stallHours, members, filled);
        if (ev == null || Number.isNaN(ev)) continue;

        consideredCount++;
        rows.push({
          crime_id: crime.id,
          crime: crime.name,
          role: `${slot.position || slot.position_id} ${slot.position_number || ''}`.trim(),
          ev,
          cpr: slot.checkpoint_pass_rate || 0,
          stall: stallHours.toFixed(1),
          itemId: slot.item_requirement?.id || null,
          itemName: slot.item_requirement?.name || null,
        });
      }
    }

    rows.sort((a, b) => b.ev - a.ev);
    const best = rows[0] || null;

    if (!best) {
      if (panel) panel.innerHTML = consideredCount === 0
        ? 'No usable open roles found.'
        : 'No open roles found.';
      return;
    }

    renderResult(best, cacheAgeSeconds);
  }

  function estPayout(weight, payoutMax, cpr, stallHours, members, filled) {
    if (payoutMax == null || members <= 0) return null;
    const expectedWeight = 1 / members;
    const contributionBonus = (weight / expectedWeight) * (cpr / 100);
    const individualPayout = (payoutMax / members) * Math.max(P, contributionBonus);
    const affectOnSuccess = 1 - weight * (1 - (cpr / 100));
    const cprDamage = payoutMax - (payoutMax * affectOnSuccess);
    const stallBonus = (stallHours === 0 && filled === 0) ? 1 : (1 + (K / (1 + Math.sqrt(stallHours))));
    return individualPayout * stallBonus - cprDamage;
  }

  function renderResult(best, cacheAgeSeconds) {
    if (!panel) return;
    const crimeUrl = `https://www.torn.com/factions.php?step=your&type=1#/tab=crimes&crimeId=${best.crime_id}`;
    const cacheInfo = cacheAgeSeconds !== null
      ? `<div id="tfb-oc-cache-status">📡 Bot cache — ${cacheAgeSeconds}s old</div>`
      : `<div id="tfb-oc-cache-status">📡 Direct API</div>`;

    panel.innerHTML = `
      <div style="font-weight:600;margin-bottom:6px;">Best OC Role:</div>
      <div><a href="${crimeUrl}">${escapeHtml(best.crime)}</a> — <b>${escapeHtml(best.role)}</b></div>
      <div>EV: $${Math.round(best.ev).toLocaleString()}</div>
      <div>CPR: ${best.cpr}% · Stalls in: ${best.stall}h</div>
      <div>${renderItemText(best)}</div>
      ${cacheInfo}
    `;
  }

  function buildItemMarketUrl(itemId, itemName) {
    const params = new URLSearchParams({ itemID: String(itemId) });
    if (itemName) params.set('itemName', itemName);
    return `https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&${params.toString()}`;
  }

  function renderItemText(best) {
    if (!best.itemId) return 'No item required';
    const url = buildItemMarketUrl(best.itemId, best.itemName || '');
    if (best.itemName) return `Requires item: <a href="${url}">${escapeHtml(best.itemName)}</a> (#${best.itemId})`;
    return `Requires item: <a href="${url}">#${best.itemId}</a>`;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  // ─── Navigation hooks (unchanged) ─────────────────────────

  function syncUiToPage() {
    if (isCrimesTab()) createUi();
    else removeUi();
  }

  function installNavigationHooks() {
    const orig_push = history.pushState;
    const orig_replace = history.replaceState;
    history.pushState = function() { const r = orig_push.apply(this, arguments); window.dispatchEvent(new Event('ace-location-change')); return r; };
    history.replaceState = function() { const r = orig_replace.apply(this, arguments); window.dispatchEvent(new Event('ace-location-change')); return r; };
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('ace-location-change')));
    window.addEventListener('hashchange', () => window.dispatchEvent(new Event('ace-location-change')));
    window.addEventListener('ace-location-change', syncUiToPage);
  }

  function installObserver() {
    observer = new MutationObserver(() => {
      if (location.href !== lastUrl) { lastUrl = location.href; syncUiToPage(); }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  injectStyles();
  installNavigationHooks();
  installObserver();
  syncUiToPage();
  setInterval(syncUiToPage, 1000);

})();