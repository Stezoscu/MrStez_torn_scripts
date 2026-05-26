// ==UserScript==
// @name         Torn OC Best Role Helper - DarkHearts Member DOM
// @namespace    mrstez.torn.oc.member
// @version      1.4.0
// @updateURL    https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_faction_scripts/OC_Choice_Helper_DH.js
// @downloadURL  https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_faction_scripts/OC_Choice_Helper_DH.js
// @description  DarkHearts member OC helper using live DOM first, optional API enrichment, DH CPR rules, EV scoring and item/deep links where available
// @author       Rat, MrStez and Ace
// @match        https://www.torn.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /**********************************************************************
   * MEMBER SCRIPT ONLY
   *
   * Source strategy:
   * 1. DOM = live truth for visible crimes/open JOIN roles/CPR/current page.
   * 2. Direct API enrichment = optional if member has faction API access.
   * 3. Future bot cache enrichment = placeholder supported by URL setting.
   *
   * Does:
   * - recommends best visible OC role from DOM
   * - applies DarkHearts CPR rules
   * - avoids roles that fail CPR standards
   * - deprioritises level 7 OCs
   * - prioritises OCs with members already joined / likely stalled
   * - uses local weights and payout tables for EV scoring
   * - enriches with API crime ID/item info where available
   * - works in TornPDA and browser
   * - SPA-safe
   *
   * Does NOT:
   * - no leader CPR warning lists
   * - no missing item leadership checks
   * - no locate/remove buttons
   * - no planning-stage management
   * - no not-in-OC list
   **********************************************************************/

  const SCRIPT_VERSION = '1.4.0';

  const API_KEY_STORAGE_KEYS = [
    'mrstez.torn.apiKey',
    'mrstez.api.key',
    'tornApiKey',
    'ace.torn.apiKey',
    'ace.oc.key',
    'ace.oc.member.apiKey'
  ];

  const OWN_API_KEY_KEY = 'mrstez.oc.member.apiKey';
  const API_CACHE_KEY = 'mrstez.oc.member.api.enrichment.cache';
  const BOT_CACHE_URL_KEY = 'mrstez.oc.member.botCacheUrl';
  const BOT_CACHE_KEY = 'mrstez.oc.member.bot.enrichment.cache';

  const ENRICHMENT_CACHE_TTL_MS = 5 * 60 * 1000;

  const P = 0.5;
  const K = 0.5;

  let btn = null;
  let panel = null;
  let observer = null;
  let lastUrl = location.href;

  const warnedMissingWeights = new Set();
  const warnedMissingPayouts = new Set();

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
    "Ace in the Hole": { "P1": 0.21, "P2": 0.18, "P3": 0.25, "P4": 0.28 }
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
    "Ace in the Hole": { min: 190213472, max: 313457142 },

    // DOM has shown these newer/extra crimes. Payouts unknown here.
    // They will be skipped for EV until we add payout data.
    "Window of Opportunity": null,
    "Sneaky Git Grab": null,
    "First Aid and Abet": null
  };

  function isCrimesTab() {
    return location.pathname === '/factions.php'
      && location.href.includes('step=your')
      && location.href.includes('type=1')
      && location.href.includes('#/tab=crimes');
  }

  function getApiKey() {
    for (const keyName of API_KEY_STORAGE_KEYS) {
      const val = localStorage.getItem(keyName);
      if (val && val.trim()) return val.trim();
    }

    const own = localStorage.getItem(OWN_API_KEY_KEY);
    return own ? own.trim() : '';
  }

  function setApiKey(key) {
    if (!key || !key.trim()) return;
    localStorage.setItem(OWN_API_KEY_KEY, key.trim());
    localStorage.setItem('mrstez.torn.apiKey', key.trim());
  }

  function clearApiKey() {
    localStorage.removeItem(OWN_API_KEY_KEY);
    localStorage.removeItem('mrstez.torn.apiKey');
    localStorage.removeItem('ace.oc.key');
  }

  function getBotCacheUrl() {
    return localStorage.getItem(BOT_CACHE_URL_KEY) || '';
  }

  function setBotCacheUrl(url) {
    if (!url || !url.trim()) localStorage.removeItem(BOT_CACHE_URL_KEY);
    else localStorage.setItem(BOT_CACHE_URL_KEY, url.trim());
  }

  function getRequiredCpr(level) {
    if (level === 1) return 0;
    if (level >= 2 && level <= 5) return 80;
    if (level >= 6 && level <= 7) return 70;
    if (level >= 8) return 60;
    return 80;
  }

  function injectStyles() {
    if (document.getElementById('mrstez-oc-member-styles')) return;

    const style = document.createElement('style');
    style.id = 'mrstez-oc-member-styles';
    style.textContent = `
      #mrstez-oc-member-btn {
        opacity: 1 !important;
        mix-blend-mode: normal !important;
        filter: none !important;
        backdrop-filter: none !important;
        isolation: isolate !important;
        transform: translateZ(0) !important;
      }

      #mrstez-oc-member-panel {
        position: fixed !important;
        opacity: 1 !important;
        background: #111 !important;
        background-color: #111 !important;
        color: #eee !important;
        mix-blend-mode: normal !important;
        filter: none !important;
        backdrop-filter: none !important;
        isolation: isolate !important;
        transform: translateZ(0) !important;
      }

      #mrstez-oc-member-panel * {
        opacity: 1 !important;
        mix-blend-mode: normal !important;
        filter: none !important;
        backdrop-filter: none !important;
        text-shadow: none !important;
        box-sizing: border-box !important;
      }

      #mrstez-oc-member-panel a {
        color: #65a9ff !important;
        text-decoration: underline !important;
      }

      .mrstez-oc-btn {
        border: 1px solid #555 !important;
        background: #222 !important;
        color: #eee !important;
        border-radius: 5px !important;
        padding: 4px 7px !important;
        cursor: pointer !important;
        margin: 2px !important;
        font-size: 12px !important;
      }

      .mrstez-oc-primary {
        background: #2a4cff !important;
        border-color: #4b66ff !important;
        color: #fff !important;
      }

      .mrstez-oc-danger {
        background: #5b1e1e !important;
        border-color: #8a3434 !important;
        color: #fff !important;
      }

      .mrstez-oc-muted { color: #aaa !important; }
      .mrstez-oc-good { color: #9eff9e !important; }
      .mrstez-oc-warn { color: #ffd56a !important; }
      .mrstez-oc-bad { color: #ff8f8f !important; }
      .mrstez-oc-small { font-size: 12px !important; }
      .mrstez-oc-row { margin: 6px 0; }
      .mrstez-oc-divider { border-top: 1px solid #333; margin: 8px 0; }
    `;
    document.head.appendChild(style);
  }

  function createUi() {
    if (document.getElementById('mrstez-oc-member-btn')) return;

    btn = document.createElement('button');
    btn.id = 'mrstez-oc-member-btn';
    btn.textContent = 'Best OC Role';
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '52px',
      right: '12px',
      zIndex: '99999',
      padding: '6px 10px',
      background: '#2a4cff',
      color: '#fff',
      border: 'none',
      borderRadius: '6px',
      fontSize: '13px',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
    });
    document.body.appendChild(btn);

    panel = document.createElement('div');
    panel.id = 'mrstez-oc-member-panel';
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '100px',
      right: '12px',
      width: '90%',
      maxWidth: '370px',
      maxHeight: '70vh',
      overflowY: 'auto',
      background: '#111',
      color: '#eee',
      border: '1px solid #444',
      borderRadius: '8px',
      padding: '10px',
      zIndex: '99999',
      display: 'none',
      fontSize: '13px',
      lineHeight: '1.4',
      boxShadow: '0 4px 12px rgba(0,0,0,0.35)'
    });
    document.body.appendChild(panel);

    btn.onclick = () => {
      const opening = panel.style.display === 'none';
      panel.style.display = opening ? 'block' : 'none';
      if (opening) runRecommendation(false);
    };
  }

  function removeUi() {
    document.getElementById('mrstez-oc-member-btn')?.remove();
    document.getElementById('mrstez-oc-member-panel')?.remove();
    btn = null;
    panel = null;
  }

  async function runRecommendation(forceRefresh) {
    if (!panel) return;

    panel.innerHTML = renderHeader() + `<div class="mrstez-oc-row">Reading visible OC page...</div>`;
    bindButtons();

    const domCrimes = parseDomCrimes();

    if (!domCrimes.length) {
      panel.innerHTML = renderHeader() + `
        <div class="mrstez-oc-row mrstez-oc-warn">No visible recruiting OCs found from the page.</div>
        <div class="mrstez-oc-row mrstez-oc-small mrstez-oc-muted">
          Make sure you are on the faction crimes Recruiting tab and the page has fully loaded.
        </div>
        ${renderActions()}
      `;
      bindButtons();
      return;
    }

    let enrichment = null;
    let enrichmentSource = 'DOM only';

    try {
      enrichment = await getBestEnrichment(forceRefresh);
      if (enrichment && enrichment.sourceLabel) enrichmentSource = enrichment.sourceLabel;
    } catch (e) {
      console.warn('[OC Helper] Enrichment failed:', e);
    }

    const result = processDomCrimes(domCrimes, enrichment);
    renderResult(result, enrichmentSource);
  }

  function parseDomCrimes() {
    const root = document.querySelector('.faction-crimes-wrap') || document.querySelector('#faction-crimes-root') || document.body;
    const text = normaliseText(root.innerText || '');

    const knownCrimeNames = Object.keys(crimeWeights)
      .concat(Object.keys(crimePayouts))
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort((a, b) => b.length - a.length);

    const lines = text
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean);

    const crimes = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const crimeName = knownCrimeNames.find(name => equalsIgnoreCase(line, name));

      if (!crimeName) {
        i++;
        continue;
      }

      const levelInfo = findLevelNear(lines, i);
      if (!levelInfo) {
        i++;
        continue;
      }

      const nextCrimeIndex = findNextCrimeIndex(lines, i + 1, knownCrimeNames);
      const blockEnd = nextCrimeIndex === -1 ? lines.length : nextCrimeIndex;
      const blockLines = lines.slice(i, blockEnd);

      const timer = findTimerBefore(lines, i);
      const roles = parseRolesFromBlock(blockLines);

      crimes.push({
        name: crimeName,
        level: levelInfo.level,
        progress: levelInfo.progress,
        timer,
        roles,
        rawLines: blockLines
      });

      i = blockEnd;
    }

    return crimes;
  }

  function parseRolesFromBlock(blockLines) {
    const roles = [];

    for (let i = 0; i < blockLines.length - 1; i++) {
      const roleLine = blockLines[i];
      const cprLine = blockLines[i + 1];

      if (!looksLikeRole(roleLine)) continue;
      if (!/^\d{1,3}$/.test(cprLine)) continue;

      const cpr = normaliseCpr(cprLine);
      const after1 = blockLines[i + 2] || '';
      const after2 = blockLines[i + 3] || '';

      let isOpen = false;
      let memberName = null;

      if (equalsIgnoreCase(after1, '24hrs') && equalsIgnoreCase(after2, 'JOIN')) {
        isOpen = true;
      } else if (after1 && !isControlLine(after1)) {
        memberName = after1;
      }

      roles.push({
        role: roleLine.toUpperCase(),
        cpr,
        isOpen,
        memberName,
        rawIndex: i
      });
    }

    return roles;
  }

  function looksLikeRole(line) {
    if (!line) return false;
    if (isControlLine(line)) return false;
    if (/^\d+$/.test(line)) return false;
    if (/^\d+\s*\/\s*\d+$/.test(line)) return false;
    if (/^\d{2}:\d{2}:\d{2}:\d{2}$/.test(line)) return false;
    if (line.length > 35) return false;

    return /^[A-Z][A-Z\s#0-9'-]+$/i.test(line)
      && !knownNonRoleWords().has(line.toUpperCase());
  }

  function knownNonRoleWords() {
    return new Set([
      'RECRUITING',
      'PLANNING',
      'COMPLETED',
      'SPAWN',
      'JOIN',
      'CRIMES',
      'FACTION',
      'INFO',
      'TERRITORY',
      'RANK',
      'UPGRADES',
      'ARMORY',
      'CONTROLS',
      'SELECT A DIFFICULTY TO SPAWN A NEW SCENARIO',
      'SHOW MORE'
    ]);
  }

  function isControlLine(line) {
    const upper = String(line || '').toUpperCase();
    return knownNonRoleWords().has(upper)
      || upper.includes('SHOW MORE')
      || upper.includes('SELECT A DIFFICULTY')
      || upper.includes('MEMBERS AREN')
      || upper.includes('OC HELPER')
      || upper.includes('CAPTURE DOM');
  }

  function findLevelNear(lines, crimeIndex) {
    for (let j = crimeIndex + 1; j <= Math.min(lines.length - 2, crimeIndex + 8); j++) {
      const a = lines[j];
      const b = lines[j + 1];
      const c = lines[j + 2];

      if (/^\d+$/.test(a) && b === '/' && /^\d+$/.test(c)) {
        return {
          level: parseInt(a, 10),
          progress: parseInt(c, 10)
        };
      }

      const combined = `${a} ${b} ${c}`;
      const match = combined.match(/(\d+)\s*\/\s*(\d+)/);
      if (match) {
        return {
          level: parseInt(match[1], 10),
          progress: parseInt(match[2], 10)
        };
      }
    }

    return null;
  }

  function findNextCrimeIndex(lines, start, knownCrimeNames) {
    for (let i = start; i < lines.length; i++) {
      if (knownCrimeNames.some(name => equalsIgnoreCase(lines[i], name))) return i;
    }
    return -1;
  }

  function findTimerBefore(lines, crimeIndex) {
    for (let i = crimeIndex - 1; i >= Math.max(0, crimeIndex - 4); i--) {
      if (/^\d{2}:\d{2}:\d{2}:\d{2}$/.test(lines[i])) return lines[i];
    }
    return '';
  }

  function processDomCrimes(domCrimes, enrichment) {
    const rows = [];
    const rejected = [];
    const skipped = [];

    let openRoles = 0;

    for (const crime of domCrimes) {
      const requiredCpr = getRequiredCpr(crime.level);
      const open = crime.roles.filter(r => r.isOpen);
      const filled = crime.roles.filter(r => !r.isOpen && r.memberName);
      const members = crime.roles.length || open.length + filled.length;

      for (const role of open) {
        openRoles++;

        const payoutMax = crimePayouts[crime.name]?.max;
        if (!payoutMax) {
          skipped.push({
            crime: crime.name,
            role: role.role,
            reason: 'Missing payout data'
          });

          if (!warnedMissingPayouts.has(crime.name)) {
            console.warn(`[OC Best Role] Missing payout data for crime: ${crime.name}. Skipping.`);
            warnedMissingPayouts.add(crime.name);
          }

          continue;
        }

        const enriched = findEnrichment(enrichment, crime, role);
        const positionId = enriched?.position_id || inferPositionId(crime, role);
        let weight = crimeWeights[crime.name]?.[positionId];

        if (weight == null) {
          weight = 1 / Math.max(1, members);
          if (!warnedMissingWeights.has(`${crime.name}:${positionId}`)) {
            console.warn(`[OC Best Role] Missing weight for ${crime.name} ${positionId}. Using equal fallback.`);
            warnedMissingWeights.add(`${crime.name}:${positionId}`);
          }
        }

        const cpr = normaliseCpr(role.cpr);
        const passesCpr = cpr >= requiredCpr;
        const stallHours = estimateStallHours(crime, role, filled.length, open.length);
        const ev = estPayout(weight, payoutMax, cpr, stallHours, members, filled.length);

        const isLevel7 = crime.level === 7;
        const hasMembers = filled.length > 0;

        let score = ev;
        if (hasMembers) score *= 1.25;
        if (isLevel7) score *= 0.60;

        const row = {
          crime: crime.name,
          crimeId: enriched?.crime_id || null,
          level: crime.level,
          progress: crime.progress,
          role: role.role,
          cpr,
          requiredCpr,
          ev,
          score,
          weight,
          positionId,
          timer: crime.timer,
          stallHours,
          filled: filled.length,
          open: open.length,
          members,
          isLevel7,
          hasMembers,
          itemId: enriched?.item_requirement?.id || enriched?.itemId || null,
          itemName: enriched?.item_requirement?.name || enriched?.itemName || null,
          enrichmentMatched: !!enriched
        };

        if (!passesCpr) {
          rejected.push(row);
          continue;
        }

        rows.push(row);
      }
    }

    rows.sort((a, b) => b.score - a.score);
    rejected.sort((a, b) => b.ev - a.ev);

    return {
      best: rows[0] || null,
      safeRoles: rows.length,
      openRoles,
      rejected,
      skipped,
      domCrimeCount: domCrimes.length
    };
  }

  function inferPositionId(crime, role) {
    const sameBase = crime.roles.filter(r => cleanRoleBase(r.role) === cleanRoleBase(role.role));
    const allOpenAndFilled = crime.roles;
    const index = allOpenAndFilled.findIndex(r => r === role);

    if (index >= 0) return `P${index + 1}`;

    const numMatch = role.role.match(/#\s*(\d+)/);
    if (numMatch) return `P${parseInt(numMatch[1], 10)}`;

    if (sameBase.length === 1) {
      const realIndex = allOpenAndFilled.findIndex(r => cleanRoleBase(r.role) === cleanRoleBase(role.role));
      if (realIndex >= 0) return `P${realIndex + 1}`;
    }

    return `P${Math.max(1, index + 1)}`;
  }

  function estimateStallHours(crime, role, filledCount, openCount) {
    if (crime.timer && /^\d{2}:\d{2}:\d{2}:\d{2}$/.test(crime.timer)) {
      const parts = crime.timer.split(':').map(Number);
      const days = parts[0] || 0;
      const hours = parts[1] || 0;
      const mins = parts[2] || 0;
      return days * 24 + hours + mins / 60;
    }

    const totalRemaining = (filledCount * 20) + (openCount * 100);
    return totalRemaining * 0.24;
  }

  function estPayout(weight, payoutMax, cpr, stallHours, members, filled) {
    if (payoutMax == null || members <= 0) return null;

    const expectedWeight = 1 / members;
    const contributionBonus = (weight / expectedWeight) * (cpr / 100);
    const individualPayout = (payoutMax / members) * Math.max(P, contributionBonus);
    const affectOnSuccess = 1 - weight * (1 - (cpr / 100));
    const cprDamage = payoutMax - (payoutMax * affectOnSuccess);
    const stallBonus = (stallHours === 0 && filled === 0)
      ? 1
      : (1 + (K / (1 + Math.sqrt(stallHours))));

    return individualPayout * stallBonus - cprDamage;
  }

  async function getBestEnrichment(forceRefresh) {
    const botUrl = getBotCacheUrl();

    if (botUrl) {
      const botData = await getBotEnrichment(botUrl, forceRefresh);
      if (botData) return botData;
    }

    const apiData = await getApiEnrichment(forceRefresh);
    if (apiData) return apiData;

    return null;
  }

  async function getBotEnrichment(url, forceRefresh) {
    if (!forceRefresh) {
      const cached = readTimedCache(BOT_CACHE_KEY);
      if (cached) return {
        sourceLabel: 'bot cache',
        crimes: cached.crimes || []
      };
    }

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Bot cache HTTP ${res.status}`);

    const data = await res.json();
    const crimes = Array.isArray(data.crimes) ? data.crimes : [];

    writeTimedCache(BOT_CACHE_KEY, { crimes, updated_at: data.updated_at || null });

    return {
      sourceLabel: 'bot cache',
      crimes
    };
  }

  async function getApiEnrichment(forceRefresh) {
    const key = getApiKey();
    if (!key) return null;

    if (!forceRefresh) {
      const cached = readTimedCache(API_CACHE_KEY);
      if (cached) return {
        sourceLabel: 'direct API enrichment',
        crimes: cached.crimes || []
      };
    }

    const res = await fetch(`https://api.torn.com/v2/faction/crimes?cat=recruiting&key=${encodeURIComponent(key)}`);
    const data = await res.json();

    if (data.error) {
      console.warn('[OC Helper] API enrichment error:', data.error);
      return null;
    }

    const crimes = Array.isArray(data.crimes) ? data.crimes : [];
    writeTimedCache(API_CACHE_KEY, { crimes });

    return {
      sourceLabel: 'direct API enrichment',
      crimes
    };
  }

  function findEnrichment(enrichment, domCrime, domRole) {
    if (!enrichment || !Array.isArray(enrichment.crimes)) return null;

    const matchingCrimes = enrichment.crimes.filter(c =>
      equalsIgnoreCase(c.name, domCrime.name)
      && (getApiCrimeLevel(c) == null || domCrime.level == null || getApiCrimeLevel(c) === domCrime.level)
    );

    for (const crime of matchingCrimes) {
      const slots = crime.slots || [];
      const openSlots = slots.filter(s => !s.user);

      let matched = openSlots.find(s => roleMatches(s, domRole));
      if (!matched) matched = openSlots.find(s => normaliseRoleName(s.position) === cleanRoleBase(domRole.role));

      if (matched) {
        return {
          crime_id: crime.id,
          position_id: matched.position_id,
          position: matched.position,
          position_number: matched.position_number,
          item_requirement: matched.item_requirement || null
        };
      }
    }

    return null;
  }

  function roleMatches(slot, domRole) {
    const apiRole = normaliseRoleName(`${slot.position || ''} ${slot.position_number || ''}`.trim());
    const apiBase = normaliseRoleName(slot.position || '');
    const domFull = normaliseRoleName(domRole.role);
    const domBase = cleanRoleBase(domRole.role);

    return apiRole === domFull || apiBase === domBase;
  }

  function getApiCrimeLevel(crime) {
    const candidates = [crime.difficulty, crime.level, crime.crime_level, crime.tier];

    for (const value of candidates) {
      const n = parseInt(value, 10);
      if (!Number.isNaN(n)) return n;
    }

    return null;
  }

  function readTimedCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const cached = JSON.parse(raw);
      if (!cached.savedAt || !cached.data) return null;
      if (Date.now() - cached.savedAt > ENRICHMENT_CACHE_TTL_MS) return null;

      return cached.data;
    } catch {
      return null;
    }
  }

  function writeTimedCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({
        savedAt: Date.now(),
        data
      }));
    } catch (e) {
      console.warn('[OC Helper] Cache write failed:', e);
    }
  }

  function clearCaches() {
    localStorage.removeItem(API_CACHE_KEY);
    localStorage.removeItem(BOT_CACHE_KEY);
  }

  function renderResult(result, enrichmentSource) {
    if (!panel) return;

    if (!result.best) {
      panel.innerHTML = renderHeader() + `
        <div class="mrstez-oc-row mrstez-oc-warn">No safe OC role found from visible DOM.</div>
        <div class="mrstez-oc-row mrstez-oc-small mrstez-oc-muted">
          Visible crimes: ${result.domCrimeCount}
          · Open roles: ${result.openRoles}
          · CPR-filtered: ${result.rejected.length}
          · Skipped: ${result.skipped.length}
        </div>
        ${renderRejectedSummary(result.rejected)}
        ${renderSkippedSummary(result.skipped)}
        ${renderActions()}
      `;
      bindButtons();
      return;
    }

    const b = result.best;
    const crimeUrl = b.crimeId
      ? `https://www.torn.com/factions.php?step=your&type=1#/tab=crimes&crimeId=${encodeURIComponent(b.crimeId)}`
      : `https://www.torn.com/factions.php?step=your&type=1#/tab=crimes`;

    panel.innerHTML = renderHeader() + `
      <div class="mrstez-oc-row mrstez-oc-small mrstez-oc-muted">
        Source: DOM live truth + ${escapeHtml(enrichmentSource)}
      </div>

      <div class="mrstez-oc-row" style="font-weight:700;">Best OC Role:</div>

      <div class="mrstez-oc-row">
        <a href="${crimeUrl}">${escapeHtml(b.crime)}</a>
        Lv. ${b.level}
        — <b>${escapeHtml(b.role)}</b>
      </div>

      <div class="mrstez-oc-row">
        EV: <b>$${Math.round(b.ev).toLocaleString()}</b>
      </div>

      <div class="mrstez-oc-row">
        CPR: <b class="mrstez-oc-good">${b.cpr}%</b>
        · Required: <b>${b.requiredCpr}%</b>
      </div>

      <div class="mrstez-oc-row">
        ${b.hasMembers
          ? '<span class="mrstez-oc-good">Prioritised: OC already has members / may be stalled.</span>'
          : '<span class="mrstez-oc-muted">Fresh empty OC. Stalled/part-filled OCs are preferred.</span>'}
      </div>

      ${b.isLevel7 ? `
        <div class="mrstez-oc-row mrstez-oc-warn">
          Lv. 7 warning: lower member payout/material value. Other levels are preferred.
        </div>
      ` : ''}

      <div class="mrstez-oc-row mrstez-oc-small mrstez-oc-muted">
        Timer/stall estimate: ${b.timer ? escapeHtml(b.timer) : formatHours(b.stallHours)}
        · Role impact: ${Math.round(b.weight * 100)}%
        · ${b.enrichmentMatched ? 'Enriched' : 'DOM only'}
      </div>

      <div class="mrstez-oc-row">
        ${renderItemText(b)}
      </div>

      <div class="mrstez-oc-row mrstez-oc-small mrstez-oc-muted">
        Visible crimes: ${result.domCrimeCount}
        · Open roles: ${result.openRoles}
        · Safe roles: ${result.safeRoles}
        · Filtered: ${result.rejected.length}
        · Skipped: ${result.skipped.length}
      </div>

      ${renderRejectedSummary(result.rejected)}
      ${renderSkippedSummary(result.skipped)}
      ${renderActions()}
    `;

    bindButtons();
  }

  function renderRejectedSummary(rejected) {
    if (!rejected || !rejected.length) return '';

    const top = rejected.slice(0, 3);

    return `
      <div class="mrstez-oc-divider"></div>
      <details>
        <summary class="mrstez-oc-small mrstez-oc-warn" style="cursor:pointer;">
          CPR-filtered roles (${rejected.length})
        </summary>
        <div class="mrstez-oc-small" style="margin-top:6px;">
          ${top.map(r => `
            <div class="mrstez-oc-row">
              <b>${escapeHtml(r.crime)}</b> Lv. ${r.level}
              — ${escapeHtml(r.role)}
              <br>
              CPR ${r.cpr}% below required ${r.requiredCpr}%
            </div>
          `).join('')}
        </div>
      </details>
    `;
  }

  function renderSkippedSummary(skipped) {
    if (!skipped || !skipped.length) return '';

    const top = skipped.slice(0, 3);

    return `
      <details>
        <summary class="mrstez-oc-small mrstez-oc-muted" style="cursor:pointer;">
          Skipped roles (${skipped.length})
        </summary>
        <div class="mrstez-oc-small" style="margin-top:6px;">
          ${top.map(r => `
            <div class="mrstez-oc-row">
              <b>${escapeHtml(r.crime)}</b> — ${escapeHtml(r.role)}
              <br>
              ${escapeHtml(r.reason)}
            </div>
          `).join('')}
        </div>
      </details>
    `;
  }

  function renderHeader() {
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div style="font-weight:700;">OC Best Role</div>
        <div class="mrstez-oc-small mrstez-oc-muted">v${SCRIPT_VERSION}</div>
      </div>
      <div class="mrstez-oc-row mrstez-oc-small">
        API key: ${getApiKey() ? '<span class="mrstez-oc-good">saved</span>' : '<span class="mrstez-oc-muted">not set</span>'}
        <button class="mrstez-oc-btn" data-action="set-key">Set/Change</button>
        <button class="mrstez-oc-btn mrstez-oc-danger" data-action="clear-key">Clear</button>
      </div>
      <div class="mrstez-oc-row mrstez-oc-small">
        Bot cache: ${getBotCacheUrl() ? '<span class="mrstez-oc-good">set</span>' : '<span class="mrstez-oc-muted">not set</span>'}
        <button class="mrstez-oc-btn" data-action="set-bot-url">Set URL</button>
      </div>
    `;
  }

  function renderActions() {
    return `
      <div class="mrstez-oc-divider"></div>
      <div class="mrstez-oc-row">
        <button class="mrstez-oc-btn mrstez-oc-primary" data-action="refresh">Refresh</button>
        <button class="mrstez-oc-btn" data-action="clear-cache">Clear Cache</button>
      </div>
      <div class="mrstez-oc-row mrstez-oc-small mrstez-oc-muted">
        Member helper only. DOM controls the live recommendation; API/bot data only enriches.
      </div>
    `;
  }

  function bindButtons() {
    if (!panel) return;

    panel.querySelectorAll('[data-action]').forEach(el => {
      el.onclick = () => {
        const action = el.getAttribute('data-action');

        if (action === 'set-key') {
          const key = prompt(
            'Enter Torn API key.\n\nOptional: used only for enrichment if faction crimes access is available.',
            getApiKey() || ''
          );
          if (key && key.trim()) {
            setApiKey(key.trim());
            clearCaches();
            runRecommendation(true);
          }
        }

        if (action === 'clear-key') {
          if (confirm('Clear saved API key for this script/shared MrStez key?')) {
            clearApiKey();
            clearCaches();
            runRecommendation(true);
          }
        }

        if (action === 'set-bot-url') {
          const url = prompt(
            'Enter faction bot OC cache JSON URL.\n\nLeave blank to clear.',
            getBotCacheUrl()
          );
          setBotCacheUrl(url || '');
          clearCaches();
          runRecommendation(true);
        }

        if (action === 'refresh') {
          runRecommendation(true);
        }

        if (action === 'clear-cache') {
          clearCaches();
          runRecommendation(true);
        }
      };
    });
  }

  function buildItemMarketUrl(itemId, itemName = '') {
    const params = new URLSearchParams({ itemID: String(itemId) });
    if (itemName) params.set('itemName', itemName);
    return `https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&${params.toString()}`;
  }

  function renderItemText(best) {
    if (!best.itemId) {
      return '<span class="mrstez-oc-muted">Item requirement unavailable from DOM/enrichment.</span>';
    }

    const marketUrl = buildItemMarketUrl(best.itemId, best.itemName || '');

    if (best.itemName) {
      return `Requires item: <a href="${marketUrl}">${escapeHtml(best.itemName)}</a> (#${best.itemId})`;
    }

    return `Requires item: <a href="${marketUrl}">#${best.itemId}</a>`;
  }

  function normaliseText(text) {
    return String(text || '')
      .replace(/\r/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function normaliseCpr(cpr) {
    const n = Number(cpr || 0);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function normaliseRoleName(str) {
    return String(str || '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanRoleBase(str) {
    return normaliseRoleName(str).replace(/\s+#?\d+$/, '').trim();
  }

  function equalsIgnoreCase(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  }

  function formatHours(hours) {
    const n = Number(hours || 0);
    if (n < 1) return `${Math.round(n * 60)}m`;
    return `${n.toFixed(1)}h`;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function syncUiToPage() {
    if (isCrimesTab()) createUi();
    else removeUi();
  }

  function installNavigationHooks() {
    if (window.__mrstezOcMemberHooksInstalled) return;
    window.__mrstezOcMemberHooksInstalled = true;

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function () {
      const result = originalPushState.apply(this, arguments);
      window.dispatchEvent(new Event('mrstez-oc-member-location-change'));
      return result;
    };

    history.replaceState = function () {
      const result = originalReplaceState.apply(this, arguments);
      window.dispatchEvent(new Event('mrstez-oc-member-location-change'));
      return result;
    };

    window.addEventListener('popstate', () => window.dispatchEvent(new Event('mrstez-oc-member-location-change')));
    window.addEventListener('hashchange', () => window.dispatchEvent(new Event('mrstez-oc-member-location-change')));
    window.addEventListener('mrstez-oc-member-location-change', syncUiToPage);
  }

  function installObserver() {
    observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        syncUiToPage();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  injectStyles();
  installNavigationHooks();
  installObserver();
  syncUiToPage();
  setInterval(syncUiToPage, 1000);
})();