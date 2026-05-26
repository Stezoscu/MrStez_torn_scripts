// ==UserScript==
// @name         Torn OC Helper Leader (Recruiting + Planning)
// @namespace    ace.torn.oc.helper
// @version      1.3.0
// @updateURL    https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_user_scripts/torn_faction_scripts/OC_Leader_Helper.js
// @downloadURL  https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_user_scripts/torn_faction_scripts/OC_Leader_Helper.js
// @description  Best role picker plus CPR and missing-item leadership checks for faction OC page
// @author       MrStez and Rat
// @match        https://www.torn.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const P = 0.5;
  const K = 0.5;
  const WATCHLIST_HIDDEN_BY_DEFAULT = true;

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

  let btn = null;
  let panel = null;
  let lastUrl = location.href;
  let latestBestRole = null;
  let latestWarnings = [];
  let latestMissingItems = [];
  let watchlistVisible = !WATCHLIST_HIDDEN_BY_DEFAULT;

  const warnedMissingWeights = new Set();
  const warnedMissingPayouts = new Set();
  const highlightedNodes = new Set();

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normaliseText(str) {
    return String(str).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function isCrimesTab() {
    return location.pathname === '/factions.php'
      && location.href.includes('step=your')
      && location.href.includes('type=1')
      && location.href.includes('#/tab=crimes');
  }

  function getRequiredCPR(level) {
    if (level >= 8) return 60;
    if (level >= 6) return 70;
    return 80;
  }

  function getImpactCategory(impactScore) {
    if (impactScore >= 5) return 'critical';
    if (impactScore >= 2) return 'warning';
    if (impactScore > 0) return 'watchlist';
    return null;
  }

  function getCategoryStyle(category) {
    if (category === 'critical') return { border: '#ff5c5c', label: 'Critical' };
    if (category === 'warning') return { border: '#ffb347', label: 'Warning' };
    return { border: '#ffd966', label: 'Watchlist' };
  }

  function getSlotUserId(slot) {
    const user = slot?.user;
    return user?.id ?? user?.user_id ?? user?.userID ?? user?.ID ?? null;
  }

  function getSlotUserName(slot) {
    const user = slot?.user;
    if (!user) return null;

    const direct = [
      user.name, user.user_name, user.userName, user.username,
      user.player_name, user.playerName, user.display_name,
      user.displayName, user.nickname
    ];

    for (const value of direct) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }

    const nested = [user.user, user.player, user.profile, user.member];
    for (const candidate of nested) {
      if (!candidate) continue;

      if (Array.isArray(candidate)) {
        for (const item of candidate) {
          if (!item || typeof item !== 'object') continue;
          const vals = [
            item.name, item.user_name, item.userName, item.username,
            item.player_name, item.playerName, item.display_name,
            item.displayName, item.nickname
          ];
          for (const value of vals) {
            if (typeof value === 'string' && value.trim()) return value.trim();
          }
        }
      } else if (typeof candidate === 'object') {
        const vals = [
          candidate.name, candidate.user_name, candidate.userName, candidate.username,
          candidate.player_name, candidate.playerName, candidate.display_name,
          candidate.displayName, candidate.nickname
        ];
        for (const value of vals) {
          if (typeof value === 'string' && value.trim()) return value.trim();
        }
      }
    }

    return null;
  }

  function buildItemMarketUrl(itemId, itemName = '') {
    const params = new URLSearchParams({ itemID: String(itemId) });
    if (itemName) params.set('itemName', itemName);
    return `https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&${params.toString()}`;
  }

  function buildWarningBuckets(warnings) {
    return {
      all: warnings,
      critical: warnings.filter(w => w.category === 'critical'),
      warning: warnings.filter(w => w.category === 'warning'),
      watchlist: warnings.filter(w => w.category === 'watchlist')
    };
  }

  function groupWarningsByCrime(items) {
    const map = new Map();
    for (const item of items) {
      const key = String(item.crimeId);
      if (!map.has(key)) {
        map.set(key, {
          crimeId: item.crimeId,
          crimeName: item.crimeName,
          crimeLevel: item.crimeLevel,
          items: []
        });
      }
      map.get(key).items.push(item);
    }
    return Array.from(map.values()).sort((a, b) => {
      const aMax = Math.max(...a.items.map(i => i.impactScore || 0));
      const bMax = Math.max(...b.items.map(i => i.impactScore || 0));
      return bMax - aMax;
    });
  }

  function injectStyles() {
    if (document.getElementById('ace-oc-helper-styles')) return;

    const style = document.createElement('style');
    style.id = 'ace-oc-helper-styles';
    style.textContent = `
      #ace-oc-helper-panel {
        position: fixed !important;
        opacity: 1 !important;
        background: #111 !important;
        color: #eee !important;
        mix-blend-mode: normal !important;
        filter: none !important;
        backdrop-filter: none !important;
        isolation: isolate !important;
        transform: translateZ(0) !important;
      }
      #ace-oc-helper-panel * {
        opacity: 1 !important;
        mix-blend-mode: normal !important;
        filter: none !important;
        backdrop-filter: none !important;
        text-shadow: none !important;
        box-sizing: border-box !important;
      }
      #ace-oc-helper-btn {
        opacity: 1 !important;
        mix-blend-mode: normal !important;
        filter: none !important;
        backdrop-filter: none !important;
        isolation: isolate !important;
        transform: translateZ(0) !important;
      }
      #ace-oc-helper-panel a {
        color: #4af !important;
        text-decoration: underline !important;
      }
      .ace-oc-action-btn {
        background: #222 !important;
        border: 1px solid #555 !important;
        color: #ddd !important;
        padding: 3px 7px !important;
        border-radius: 5px !important;
        cursor: pointer !important;
        font-size: 12px !important;
      }
      .ace-oc-remove-btn {
        background: #2b1b1b !important;
        border: 1px solid #7a3a3a !important;
        color: #f0c0c0 !important;
      }
      .ace-oc-highlight-badge {
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function createUi() {
    if (document.getElementById('ace-oc-helper-btn')) return;

    btn = document.createElement('button');
    btn.id = 'ace-oc-helper-btn';
    btn.textContent = 'OC Helper';
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
    panel.id = 'ace-oc-helper-panel';
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '100px',
      right: '12px',
      width: '92%',
      maxWidth: '420px',
      maxHeight: '72vh',
      overflowY: 'auto',
      background: '#111',
      color: '#eee',
      border: '1px solid #444',
      borderRadius: '8px',
      padding: '10px',
      zIndex: '99999',
      display: 'none',
      fontSize: '13px',
      lineHeight: '1.45',
      boxShadow: '0 4px 12px rgba(0,0,0,0.35)'
    });
    panel.addEventListener('click', handlePanelClick);
    document.body.appendChild(panel);

    btn.onclick = () => {
      const opening = panel.style.display === 'none';
      panel.style.display = opening ? 'block' : 'none';
      if (opening) fetchAllAndRender();
    };
  }

  function removeUi() {
    clearHighlights();
    document.getElementById('ace-oc-helper-btn')?.remove();
    document.getElementById('ace-oc-helper-panel')?.remove();
    btn = null;
    panel = null;
    latestBestRole = null;
    latestWarnings = [];
    latestMissingItems = [];
  }

  function handlePanelClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches('[data-action="toggle-watchlist"]')) {
      watchlistVisible = !watchlistVisible;
      rerender();
      return;
    }

    if (target.matches('[data-action="locate-warning"], [data-action="locate-item"]')) {
      const idx = Number(target.dataset.index);
      const type = target.dataset.type;

      if (type === 'warning' && !Number.isNaN(idx) && latestWarnings[idx]) {
        locateInPage(latestWarnings[idx], { openMenu: false });
      }
      if (type === 'item' && !Number.isNaN(idx) && latestMissingItems[idx]) {
        locateInPage(latestMissingItems[idx], { openMenu: false });
      }
      return;
    }

    if (target.matches('[data-action="open-remove"]')) {
      const idx = Number(target.dataset.index);
      if (!Number.isNaN(idx) && latestWarnings[idx]) {
        locateInPage(latestWarnings[idx], { openMenu: true });
      }
    }
  }

  async function fetchCrimesByCategory(cat) {
    const key = localStorage.getItem('ace.oc.key') || prompt('Enter Torn API key:');
    if (!key) throw new Error('No API key provided');

    localStorage.setItem('ace.oc.key', key);

    const res = await fetch(`https://api.torn.com/v2/faction/crimes?cat=${encodeURIComponent(cat)}&key=${encodeURIComponent(key)}`);
    const data = await res.json();

    if (data.error) {
      throw new Error(data.error.error || 'Unknown API error');
    }

    if (!data.crimes || !Array.isArray(data.crimes)) {
      return [];
    }

    return data.crimes;
  }

  async function fetchAllAndRender() {
    if (!panel) return;

    panel.innerHTML = 'Loading...';

    try {
      const [recruitingCrimes, planningCrimes] = await Promise.all([
        fetchCrimesByCategory('recruiting'),
        fetchCrimesByCategory('planning')
      ]);

      latestBestRole = processBestRole(recruitingCrimes);

      const leadershipCrimes = [...recruitingCrimes, ...planningCrimes];
      const warningBuckets = processCprWarnings(leadershipCrimes);
      latestWarnings = warningBuckets.all;

      latestMissingItems = processMissingItems(leadershipCrimes);

      renderPanel(latestBestRole, warningBuckets, latestMissingItems);

      setTimeout(() => applyHighlights(latestWarnings, latestMissingItems), 500);
      setTimeout(() => applyHighlights(latestWarnings, latestMissingItems), 1500);
    } catch (e) {
      panel.innerHTML = `Error: ${escapeHtml(e.message || String(e))}`;
    }
  }

  function rerender() {
    renderPanel(latestBestRole, buildWarningBuckets(latestWarnings), latestMissingItems);
  }

  function processBestRole(crimes) {
    const rows = [];

    for (const crime of crimes) {
      if (!crime.slots || !crime.slots.length) continue;

      const members = crime.slots.length;
      let totalRemaining = 0;
      let filled = 0;

      for (const slot of crime.slots) {
        if (slot.user) {
          totalRemaining += 100 - (slot.user.progress || 0);
          filled++;
        } else {
          totalRemaining += 100;
        }
      }

      const stallHours = totalRemaining * 0.24;

      for (const slot of crime.slots) {
        if (slot.user) continue;

        const payoutMax = crimePayouts[crime.name]?.max;
        if (!payoutMax) {
          if (!warnedMissingPayouts.has(crime.name)) {
            console.warn(`[OC Helper] Missing payout data for crime: ${crime.name}`);
            warnedMissingPayouts.add(crime.name);
          }
          continue;
        }

        let weight = crimeWeights[crime.name]?.[slot.position_id];
        if (weight == null) {
          weight = 1 / members;
          if (!warnedMissingWeights.has(crime.name)) {
            console.warn(`[OC Helper] Missing weight data for crime: ${crime.name}. Using fallback.`);
            warnedMissingWeights.add(crime.name);
          }
        }

        const ev = estPayout(weight, payoutMax, slot.checkpoint_pass_rate || 0, stallHours, members, filled);
        if (ev == null || Number.isNaN(ev)) continue;

        rows.push({
          crime_id: crime.id,
          crime: crime.name,
          role: `${slot.position} ${slot.position_number}`,
          ev,
          cpr: slot.checkpoint_pass_rate || 0,
          stall: stallHours.toFixed(1),
          itemId: slot.item_requirement?.id || null,
          itemName: slot.item_requirement?.name || null
        });
      }
    }

    rows.sort((a, b) => b.ev - a.ev);
    return rows[0] || null;
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

  function processCprWarnings(crimes) {
    const warnings = [];

    for (const crime of crimes) {
      if (!crime.slots || !crime.slots.length) continue;

      const members = crime.slots.length;
      const crimeLevel = crime.difficulty ?? crime.level ?? crime.crime_level ?? null;
      if (crimeLevel == null) continue;

      const requiredCPR = getRequiredCPR(Number(crimeLevel));

      for (const slot of crime.slots) {
        if (!slot.user) continue;

        const actualCPR = Number(slot.checkpoint_pass_rate ?? 0);
        const gap = requiredCPR - actualCPR;
        if (gap <= 0) continue;

        let weight = crimeWeights[crime.name]?.[slot.position_id];
        if (weight == null) {
          weight = 1 / members;
          if (!warnedMissingWeights.has(crime.name)) {
            console.warn(`[OC Helper] Missing weight data for crime: ${crime.name}. Using fallback.`);
            warnedMissingWeights.add(crime.name);
          }
        }

        const impactScore = gap * weight;
        const category = getImpactCategory(impactScore);
        if (!category) continue;

        const memberId = getSlotUserId(slot);
        const memberName = getSlotUserName(slot) || (memberId ? `User ${memberId}` : 'Unknown User');

        warnings.push({
          type: 'warning',
          category,
          impactScore,
          gap,
          requiredCPR,
          actualCPR,
          weight,
          crimeId: crime.id,
          crimeName: crime.name,
          crimeLevel: Number(crimeLevel),
          role: `${slot.position} ${slot.position_number}`,
          memberName,
          memberId
        });
      }
    }

    warnings.sort((a, b) => b.impactScore - a.impactScore);
    return buildWarningBuckets(warnings);
  }

  function processMissingItems(crimes) {
    const items = [];

    for (const crime of crimes) {
      if (!crime.slots || !crime.slots.length) continue;

      const crimeLevel = crime.difficulty ?? crime.level ?? crime.crime_level ?? null;

      for (const slot of crime.slots) {
        const req = slot.item_requirement;
        if (!req) continue;
        if (!slot.user) continue;

        const isAvailable = req.is_available;
        if (isAvailable === true) continue;

        const memberId = getSlotUserId(slot);
        const memberName = getSlotUserName(slot) || (memberId ? `User ${memberId}` : 'Unknown User');
        const itemId = req.id || null;
        const itemName = req.name || `Item ${itemId || ''}`.trim();

        items.push({
          type: 'item',
          crimeId: crime.id,
          crimeName: crime.name,
          crimeLevel: crimeLevel != null ? Number(crimeLevel) : '?',
          role: `${slot.position} ${slot.position_number}`,
          memberName,
          memberId,
          itemId,
          itemName
        });
      }
    }

    return items;
  }

  function renderPanel(bestRole, cprWarnings, missingItems) {
    if (!panel) return;
    panel.innerHTML = `
      ${renderBestRoleSection(bestRole)}
      <hr style="border:none;border-top:1px solid #333;margin:10px 0;">
      ${renderCprSection(cprWarnings)}
      <hr style="border:none;border-top:1px solid #333;margin:10px 0;">
      ${renderMissingItemsSection(missingItems)}
    `;
  }

  function renderBestRoleSection(best) {
    if (!best) {
      return `<div style="font-weight:600; margin-bottom:6px;">Best OC Role</div><div>No suitable open role found.</div>`;
    }

    const crimeUrl = `https://www.torn.com/factions.php?step=your&type=1#/tab=crimes&crimeId=${best.crime_id}`;

    return `
      <div style="font-weight:600; margin-bottom:6px;">Best OC Role</div>
      <div><a href="${crimeUrl}">${escapeHtml(best.crime)}</a> — <b>${escapeHtml(best.role)}</b></div>
      <div>EV: $${Math.round(best.ev).toLocaleString()}</div>
      <div>CPR: ${best.cpr}% · Stalls in: ${best.stall}h</div>
      <div>${renderItemText(best)}</div>
    `;
  }

  function renderCprSection(cprWarnings) {
    const total = cprWarnings.all.length;

    if (total === 0) {
      return `
        <div style="font-weight:600; margin-bottom:6px;">CPR Warnings</div>
        <div style="color:#7CFC90;">No CPR issues found.</div>
      `;
    }

    const uniqueCrimes = new Set(cprWarnings.all.map(w => w.crimeId)).size;

    return `
      <div style="font-weight:600; margin-bottom:6px;">CPR Warnings</div>
      <div style="margin-bottom:8px;">${total} issue${total === 1 ? '' : 's'} across ${uniqueCrimes} crime${uniqueCrimes === 1 ? '' : 's'}</div>
      ${renderWarningCrimeGroups('Critical', cprWarnings.critical, '#ff5c5c')}
      ${renderWarningCrimeGroups('Warning', cprWarnings.warning, '#ffb347')}
      ${renderWatchlistSection(cprWarnings.watchlist)}
    `;
  }

  function renderWatchlistSection(items) {
    const toggleText = watchlistVisible ? 'Hide watchlist' : `Show watchlist (${items.length})`;
    return `
      <div style="margin-top:8px;">
        <button data-action="toggle-watchlist" class="ace-oc-action-btn">${toggleText}</button>
      </div>
      ${watchlistVisible ? renderWarningCrimeGroups('Watchlist', items, '#ffd966') : ''}
    `;
  }

  function renderWarningCrimeGroups(title, items, colour) {
    if (!items.length) return '';

    const grouped = groupWarningsByCrime(items);

    const groupsHtml = grouped.map(group => {
      const crimeUrl = `https://www.torn.com/factions.php?step=your&type=1#/tab=crimes&crimeId=${group.crimeId}`;
      const entries = group.items.map(item => {
        const idx = latestWarnings.findIndex(w =>
          w.crimeId === item.crimeId &&
          w.memberId === item.memberId &&
          w.role === item.role &&
          w.category === item.category
        );

        return `
          <div style="margin:6px 0 8px 8px; padding-left:6px; border-left:2px solid ${colour};">
            <div>${escapeHtml(item.memberName)} — ${escapeHtml(item.role)}</div>
            <div style="color:#ccc; font-size:12px;">
              ${item.actualCPR}% / ${item.requiredCPR}% · Gap: ${item.gap.toFixed(0)} · Impact: ${item.impactScore.toFixed(2)}
            </div>
            <div style="margin-top:4px; display:flex; gap:6px; flex-wrap:wrap;">
              <button data-action="locate-warning" data-type="warning" data-index="${idx}" class="ace-oc-action-btn">Locate</button>
              <button data-action="open-remove" data-index="${idx}" class="ace-oc-action-btn ace-oc-remove-btn">Open Remove</button>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="margin-top:8px;">
          <div style="font-weight:600; color:${colour};">
            <a href="${crimeUrl}" style="color:${colour} !important;">${escapeHtml(group.crimeName)}</a>
            (L${group.crimeLevel}) — ${group.items.length}
          </div>
          ${entries}
        </div>
      `;
    }).join('');

    return `
      <div style="margin-top:10px;">
        <div style="font-weight:700; color:${colour}; margin-bottom:2px;">${title}</div>
        ${groupsHtml}
      </div>
    `;
  }

  function renderMissingItemsSection(items) {
    if (!items.length) {
      return `
        <div style="font-weight:600; margin-bottom:6px;">Missing Items</div>
        <div style="color:#7CFC90;">No missing required items found.</div>
      `;
    }

    const grouped = groupWarningsByCrime(items);

    const html = grouped.map(group => {
      const crimeUrl = `https://www.torn.com/factions.php?step=your&type=1#/tab=crimes&crimeId=${group.crimeId}`;

      const entries = group.items.map(item => {
        const idx = latestMissingItems.findIndex(x =>
          x.crimeId === item.crimeId &&
          x.memberId === item.memberId &&
          x.role === item.role &&
          x.itemId === item.itemId
        );

        const marketUrl = item.itemId ? buildItemMarketUrl(item.itemId, item.itemName || '') : null;

        return `
          <div style="margin:6px 0 8px 8px; padding-left:6px; border-left:2px solid #7ec8ff;">
            <div>${escapeHtml(item.memberName)} — ${escapeHtml(item.role)}</div>
            <div style="color:#ccc; font-size:12px;">
              Requires: ${marketUrl ? `<a href="${marketUrl}">${escapeHtml(item.itemName)}</a>` : escapeHtml(item.itemName)}
              ${item.itemId ? `(#${item.itemId})` : ''}
            </div>
            <div style="margin-top:4px; display:flex; gap:6px; flex-wrap:wrap;">
              <button data-action="locate-item" data-type="item" data-index="${idx}" class="ace-oc-action-btn">Locate</button>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="margin-top:8px;">
          <div style="font-weight:600; color:#7ec8ff;">
            <a href="${crimeUrl}" style="color:#7ec8ff !important;">${escapeHtml(group.crimeName)}</a>
            (L${group.crimeLevel}) — ${group.items.length}
          </div>
          ${entries}
        </div>
      `;
    }).join('');

    return `
      <div style="font-weight:600; margin-bottom:6px;">Missing Items</div>
      ${html}
    `;
  }

  function renderItemText(best) {
    if (!best.itemId) return 'No item required';
    const marketUrl = buildItemMarketUrl(best.itemId, best.itemName || '');
    if (best.itemName) return `Requires item: <a href="${marketUrl}">${escapeHtml(best.itemName)}</a> (#${best.itemId})`;
    return `Requires item: <a href="${marketUrl}">#${best.itemId}</a>`;
  }

  function clearHighlights() {
    for (const node of highlightedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      node.style.outline = '';
      node.style.outlineOffset = '';
      node.style.backgroundColor = '';
      node.style.boxShadow = '';
      node.style.position = node.dataset.acePrevPosition || '';
      delete node.dataset.acePrevPosition;
    }
    highlightedNodes.clear();
    document.querySelectorAll('.ace-oc-highlight-badge').forEach(el => el.remove());
  }

  function applyHighlights(warnings, missingItems) {
    clearHighlights();

    const combined = [
      ...warnings.map(x => ({ ...x, highlightType: 'warning' })),
      ...missingItems.map(x => ({ ...x, highlightType: 'item' }))
    ];

    for (const entry of combined) {
      const match = findBestMatchingSlotElement(entry);
      if (!match) continue;

      const { element } = match;
      const style = entry.highlightType === 'item'
        ? { border: '#7ec8ff', label: 'Item' }
        : getCategoryStyle(entry.category);

      element.dataset.acePrevPosition = element.style.position || '';
      element.style.outline = `2px solid ${style.border}`;
      element.style.outlineOffset = '2px';
      highlightedNodes.add(element);

      if (!element.querySelector(':scope > .ace-oc-highlight-badge')) {
        const badge = document.createElement('div');
        badge.className = 'ace-oc-highlight-badge';
        badge.textContent = style.label;
        Object.assign(badge.style, {
          position: 'absolute',
          top: '4px',
          right: '4px',
          background: style.border,
          color: '#111',
          fontWeight: '700',
          fontSize: '10px',
          padding: '2px 5px',
          borderRadius: '4px',
          zIndex: '2'
        });

        const pos = getComputedStyle(element).position;
        if (pos === 'static' || !pos) element.style.position = 'relative';
        element.appendChild(badge);
      }
    }
  }

  function locateInPage(entry, options = { openMenu: false }) {
    const crimeUrl = `https://www.torn.com/factions.php?step=your&type=1#/tab=crimes&crimeId=${entry.crimeId}`;

    if (!location.href.includes(`crimeId=${entry.crimeId}`)) {
      location.hash = `/tab=crimes&crimeId=${entry.crimeId}`;
    }

    const attempt = (triesLeft = 10) => {
      const match = findBestMatchingSlotElement(entry);
      if (match?.element) {
        const element = match.element;
        const style = entry.type === 'item'
          ? { border: '#7ec8ff' }
          : getCategoryStyle(entry.category);

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.outline = `3px solid ${style.border}`;
        element.style.outlineOffset = '3px';
        highlightedNodes.add(element);

        if (options.openMenu) {
          setTimeout(() => tryOpenRemoveMenu(element), 500);
        }
        return;
      }

      if (triesLeft > 0) {
        setTimeout(() => attempt(triesLeft - 1), 600);
      } else {
        window.open(crimeUrl, '_self');
      }
    };

    attempt();
  }

  function findBestMatchingSlotElement(entry) {
    const candidates = getCandidateContainers();
    let best = null;

    for (const el of candidates) {
      const text = normaliseText(el.innerText || '');
      let score = 0;

      if (entry.memberName && text.includes(normaliseText(entry.memberName))) score += 6;
      if (entry.role && text.includes(normaliseText(entry.role))) score += 4;
      if (entry.crimeName && text.includes(normaliseText(entry.crimeName))) score += 3;
      if (entry.memberId && text.includes(String(entry.memberId))) score += 2;
      if (entry.itemName && text.includes(normaliseText(entry.itemName))) score += 2;

      if (score > 0 && (!best || score > best.score)) {
        best = { element: el, score };
      }
    }

    return best;
  }

  function getCandidateContainers() {
    const selectors = [
      '[class*="slot"]',
      '[class*="crime"]',
      '[class*="member"]',
      '[class*="role"]',
      '[class*="wrapper"]',
      '[class*="row"]',
      'li',
      'article',
      'section',
      'div'
    ];

    const seen = new Set();
    const results = [];

    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        if (!(el instanceof HTMLElement)) return;
        if (seen.has(el)) return;
        const text = (el.innerText || '').trim();
        if (text.length < 8) return;
        seen.add(el);
        results.push(el);
      });
    }

    return results;
  }

  function tryOpenRemoveMenu(container) {
    if (!(container instanceof HTMLElement)) return false;

    const removeTexts = ['remove from role', 'remove', 'kick', 'unassign'];
    const menuTexts = ['menu', 'actions', 'more', 'options'];

    const clickable = container.querySelectorAll('button, a, [role="button"], summary, .menu, .dropdown, svg');

    for (const el of clickable) {
      const text = normaliseText(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '');
      if (removeTexts.some(t => text.includes(t))) {
        el.click();
        return true;
      }
    }

    for (const el of clickable) {
      const text = normaliseText(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '');
      if (menuTexts.some(t => text.includes(t))) {
        el.click();
        return true;
      }
    }

    const nearby = container.parentElement?.querySelectorAll('button, a, [role="button"], summary') || [];
    for (const el of nearby) {
      const text = normaliseText(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '');
      if (removeTexts.some(t => text.includes(t)) || menuTexts.some(t => text.includes(t))) {
        el.click();
        return true;
      }
    }

    return false;
  }

  function syncUiToPage() {
    if (isCrimesTab()) {
      createUi();
      setTimeout(() => {
        if (latestWarnings.length || latestMissingItems.length) {
          applyHighlights(latestWarnings, latestMissingItems);
        }
      }, 300);
    } else {
      removeUi();
    }
  }

  function installNavigationHooks() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function () {
      const result = originalPushState.apply(this, arguments);
      window.dispatchEvent(new Event('ace-location-change'));
      return result;
    };

    history.replaceState = function () {
      const result = originalReplaceState.apply(this, arguments);
      window.dispatchEvent(new Event('ace-location-change'));
      return result;
    };

    window.addEventListener('popstate', () => window.dispatchEvent(new Event('ace-location-change')));
    window.addEventListener('hashchange', () => window.dispatchEvent(new Event('ace-location-change')));
    window.addEventListener('ace-location-change', syncUiToPage);
  }

  function installObserver() {
    const observer = new MutationObserver(() => {
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