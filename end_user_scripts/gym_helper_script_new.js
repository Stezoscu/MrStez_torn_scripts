// ==UserScript==
// @name         Torn Gym Planner Dual Layout Stable
// @namespace    steveo.torn.gymplanner
// @version      3.9.0
// @updateURL    https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_user_scripts/end_user_scripts/gym_helper_script_new.js
// @downloadURL  https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_user_scripts/gym_helper_script_new.js
// @description  API-safe Torn gym planner with cached API, Steadfast Rotation logic, Dex protection, and browser/PDA UI.
// @author       MrStez / Ace
// @match        https://www.torn.com/gym.php*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'steveo_gym_planner_v390_settings';
    const API_CACHE_KEY = 'steveo_gym_planner_v390_api_cache';
    const XAN_E = 250;
    const XAN_CD_SEC = 7 * 60 * 60;

    const DEFAULTS = {
        apiKey: '',
        apiCacheMinutes: 15,

        ratioDex: 100,
        ratioStr: 70,
        ratioSpd: 70,
        ratioDef: 2.5,

        jumpHappy: 50000,
        jumpEnergy: 1000,
        jumpBoosterCooldownHours: 48,
        useNaturalXan: true,

        summaryMinimised: true,

        trainingStrategy: 'steadfast', // balanced | perk | steadfast
        perkBiasStrength: 35,
        forecastMonths: 2,

        defenseFloorPercent: 2.5,

        dexProtection: 'rotationAware', // strict | flexible | rotationAware
        maxTemporaryDexGapPercent: 5,
        dexMonthBehaviour: 'pureDex' // pureDex | split
    };

    const STAT_META = {
        str: { label: 'Strength', browserSelector: 'li.strength___UwX1Y, li[class*="strength"]', A: 1600, B: 1700 },
        def: { label: 'Defense', browserSelector: 'li.defense___LITyA, li[class*="defense"]', A: 2100, B: -600 },
        spd: { label: 'Speed', browserSelector: 'li.speed___qNMTy, li[class*="speed"]', A: 1600, B: 2000 },
        dex: { label: 'Dexterity', browserSelector: 'li.dexterity___6ayVQ, li[class*="dexterity"]', A: 1800, B: 1500 }
    };

    // DarkHearts default rotation.
    // 0 = Jan, 1 = Feb, etc.
    // Current known assumption: May = DEF/SPD.
    const DARKHEARTS_ROTATION = {
        0: ['def', 'spd'],
        1: ['str', 'def'],
        2: ['dex', 'spd'],
        3: ['str', 'def'],
        4: ['def', 'spd'],
        5: ['dex', 'str'],
        6: ['def', 'spd'],
        7: ['str', 'def'],
        8: ['dex', 'spd'],
        9: ['str', 'def'],
        10: ['def', 'spd'],
        11: ['dex', 'str']
    };

    const GYMS = {
        1:{name:"Premier Fitness",energy:5,str:2,spd:2,def:2,dex:2},
        2:{name:"Average Joes",energy:5,str:2.4,spd:2.4,def:2.8,dex:2.4},
        3:{name:"Woody's Workout",energy:5,str:2.8,spd:3.2,def:3,dex:2.8},
        4:{name:"Beach Bods",energy:5,str:3.2,spd:3.2,def:3.2,dex:0},
        5:{name:"Silver Gym",energy:5,str:3.4,spd:3.6,def:3.4,dex:3.2},
        6:{name:"Pour Femme",energy:5,str:3.4,spd:3.6,def:3.6,dex:3.8},
        7:{name:"Davies Den",energy:5,str:3.7,spd:0,def:3.7,dex:3.7},
        8:{name:"Global Gym",energy:5,str:4,spd:4,def:4,dex:4},
        9:{name:"Knuckle Heads",energy:10,str:4.8,spd:4.4,def:4,dex:4.2},
        10:{name:"Pioneer Fitness",energy:10,str:4.4,spd:4.6,def:4.8,dex:4.4},
        11:{name:"Anabolic Anomalies",energy:10,str:5,spd:4.6,def:5.2,dex:4.6},
        12:{name:"Core",energy:10,str:5,spd:5.2,def:5,dex:5},
        13:{name:"Racing Fitness",energy:10,str:5,spd:5.4,def:4.8,dex:5.2},
        14:{name:"Complete Cardio",energy:10,str:5.5,spd:5.8,def:5.5,dex:5.2},
        15:{name:"Legs Bums and Tums",energy:10,str:0,spd:5.6,def:5.6,dex:5.8},
        16:{name:"Deep Burn",energy:10,str:6,spd:6,def:6,dex:6},
        17:{name:"Apollo Gym",energy:10,str:6,spd:6.2,def:6.4,dex:6.2},
        18:{name:"Gun Shop",energy:10,str:6.6,spd:6.4,def:6.2,dex:6.2},
        19:{name:"Force Training",energy:10,str:6.4,spd:6.6,def:6.4,dex:6.8},
        20:{name:"Cha Cha's",energy:10,str:6.4,spd:6.4,def:6.8,dex:7},
        21:{name:"Atlas",energy:10,str:7,spd:6.4,def:6.4,dex:6.6},
        22:{name:"Last Round",energy:10,str:6.8,spd:6.6,def:7,dex:6.6},
        23:{name:"The Edge",energy:10,str:6.8,spd:7,def:7,dex:6.8},
        24:{name:"George's",energy:10,str:7.3,spd:7.3,def:7.3,dex:7.3},
        25:{name:"Balboas Gym",energy:25,str:0,spd:0,def:7.5,dex:7.5},
        26:{name:"Frontline Fitness",energy:25,str:7.5,spd:7.5,def:0,dex:0},
        27:{name:"Gym 3000",energy:50,str:8,spd:0,def:0,dex:0},
        28:{name:"Mr. Isoyamas",energy:50,str:0,spd:0,def:8,dex:0},
        29:{name:"Total Rebound",energy:50,str:0,spd:8,def:0,dex:0},
        30:{name:"Elites",energy:50,str:0,spd:0,def:0,dex:8},
        31:{name:"Sports Science Lab",energy:25,str:9,spd:9,def:9,dex:9}
    };

    const state = {
        settings: loadSettings(),
        currentApiKey: '',
        apiPromptCancelled: false,
        lastRec: null
    };

    let gpObserver = null;
    let gpRefreshTimer = null;
    let gpLastRenderSig = '';

    function loadSettings() {
        try {
            return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) };
        } catch {
            return { ...DEFAULTS };
        }
    }

    function saveSettings() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
    }

    function fmtNum(n) {
        if (!isFinite(n)) return '0';
        if (n >= 1e12) return `${(n / 1e12).toFixed(2).replace(/\.00$/, '')}t`;
        if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(/\.00$/, '')}b`;
        if (n >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.00$/, '')}m`;
        if (n >= 1e3) return `${(n / 1e3).toFixed(2).replace(/\.00$/, '')}k`;
        return `${Math.round(n)}`;
    }

    function round(n, p = 4) {
        return Number(Number(n).toFixed(p));
    }

    function esc(str) {
        return String(str)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }

    function isPDA() {
        if (window.innerWidth > 900) return false;
        return !!document.querySelector('#skip-to-content') ||
               !!document.querySelector('button[aria-label="more"]') ||
               !!document.querySelector('input[placeholder="Gym"]');
    }

    function getCurrentMonthIndexUTC() {
        return new Date().getUTCMonth();
    }

    function getActiveRotationStats() {
        return DARKHEARTS_ROTATION[getCurrentMonthIndexUTC()] || [];
    }

    function getNextRotationStats() {
        return DARKHEARTS_ROTATION[(getCurrentMonthIndexUTC() + 1) % 12] || [];
    }

    function getForecastPerkCoverage(statKey, monthsAhead = 2) {
        const months = Math.max(1, Number(monthsAhead) || 2);
        const now = getCurrentMonthIndexUTC();
        let coverage = 0;

        for (let i = 0; i < months; i++) {
            const perks = DARKHEARTS_ROTATION[(now + i) % 12] || [];
            if (perks.includes(statKey)) coverage++;
        }

        return coverage / months;
    }

    function getApiKeyOnce() {
        if (state.apiPromptCancelled) return '';
        if (state.currentApiKey) return state.currentApiKey;

        if (state.settings.apiKey) {
            state.currentApiKey = state.settings.apiKey;
            return state.currentApiKey;
        }

        const key = prompt('Enter a fresh Torn API key for Gym Planner');

        if (!key) {
            state.apiPromptCancelled = true;
            return '';
        }

        state.currentApiKey = key.trim();
        state.settings.apiKey = state.currentApiKey;
        saveSettings();

        const apiBox = document.getElementById('gp-api');
        if (apiBox) apiBox.value = state.currentApiKey;

        return state.currentApiKey;
    }

    function getCachedApi() {
        try {
            return JSON.parse(localStorage.getItem(API_CACHE_KEY) || 'null');
        } catch {
            return null;
        }
    }

    function setCachedApi(data) {
        localStorage.setItem(API_CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data
        }));
    }

    function isApiCacheFresh(cache) {
        if (!cache || !cache.timestamp || !cache.data) return false;
        const maxAgeMs = Math.max(1, Number(state.settings.apiCacheMinutes || 15)) * 60 * 1000;
        return Date.now() - cache.timestamp < maxAgeMs;
    }

    async function fetchCombinedApi(force = false) {
        const cached = getCachedApi();

        if (!force && isApiCacheFresh(cached)) {
            return cached.data;
        }

        const key = getApiKeyOnce();
        if (!key) {
            if (cached?.data) return cached.data;
            throw new Error('No API key set.');
        }

        const selections = 'battlestats,gym,bars,cooldowns,perks';
        const url = `https://api.torn.com/user/?selections=${encodeURIComponent(selections)}&key=${encodeURIComponent(key)}&comment=gym_planner_v390&t=${Date.now()}`;

        const res = await fetch(url, { credentials: 'omit' });
        const data = await res.json();

        if (data.error) {
            if (cached?.data) {
                console.warn('Gym Planner API error, using cache:', data.error);
                return cached.data;
            }
            throw new Error(`API ${data.error.code}: ${data.error.error}`);
        }

        setCachedApi(data);
        return data;
    }

    function forceApiRefresh() {
        localStorage.removeItem(API_CACHE_KEY);
        gpLastRenderSig = '';
        scheduleRefresh(50, true);
    }

    function parsePerkBonuses(perksData) {
        const allPerks = [
            ...(perksData.faction_perks || []),
            ...(perksData.job_perks || []),
            ...(perksData.property_perks || []),
            ...(perksData.education_perks || []),
            ...(perksData.company_perks || []),
            ...(perksData.book_perks || [])
        ];

        const bonus = { all: 0, str: 0, spd: 0, dex: 0, def: 0 };

        for (const raw of allPerks) {
            const s = String(raw).toLowerCase();
            const match = s.match(/(\d+)%/);
            const pct = match ? Number(match[1]) : 0;

            if (!s.includes('gym gains')) continue;

            if (s.includes('strength')) bonus.str += pct;
            else if (s.includes('speed')) bonus.spd += pct;
            else if (s.includes('dexterity')) bonus.dex += pct;
            else if (s.includes('defense')) bonus.def += pct;
            else bonus.all += pct;
        }

        return {
            str: 1 + (bonus.all + bonus.str) / 100,
            spd: 1 + (bonus.all + bonus.spd) / 100,
            dex: 1 + (bonus.all + bonus.dex) / 100,
            def: 1 + (bonus.all + bonus.def) / 100
        };
    }

    function getFactionGymPerks(perksData) {
        const out = { str: 0, spd: 0, dex: 0, def: 0 };
        const factionPerks = perksData.faction_perks || [];

        for (const raw of factionPerks) {
            const s = String(raw).toLowerCase();
            if (!s.includes('gym gains')) continue;

            const m = s.match(/(\d+)%/);
            const pct = m ? Number(m[1]) : 0;

            if (s.includes('strength')) out.str = Math.max(out.str, pct);
            else if (s.includes('speed')) out.spd = Math.max(out.spd, pct);
            else if (s.includes('dexterity')) out.dex = Math.max(out.dex, pct);
            else if (s.includes('defense')) out.def = Math.max(out.def, pct);
        }

        return out;
    }

    function getHighestFactionPerkStats(perksData) {
        const fp = getFactionGymPerks(perksData);
        const max = Math.max(fp.str, fp.spd, fp.dex, fp.def);

        if (max <= 0) return { max: 0, stats: [], perks: fp };

        return {
            max,
            stats: Object.entries(fp)
                .filter(([, pct]) => pct === max)
                .map(([key]) => key),
            perks: fp
        };
    }

    function cappedStatForFormula(stat) {
        return stat > 50000000 ? 50000000 : stat;
    }

    function perTrainGain(statValue, happy, gymDots, energyPerTrain, perkMult, statKey) {
        const meta = STAT_META[statKey];
        if (!meta || gymDots <= 0 || energyPerTrain <= 0) return 0;

        const S = cappedStatForFormula(statValue);
        const H = Math.max(0, happy);

        return Math.max(0, (
            S * round(1 + 0.07 * round(Math.log(1 + H / 250), 4), 4) +
            8 * Math.pow(H, 1.05) +
            (1 - Math.pow(H / 99999, 2)) * meta.A +
            meta.B
        ) * (1 / 200000) * gymDots * energyPerTrain * perkMult);
    }

    function totalGainForBatch(statValue, happy, gymDots, energyPerTrain, perkMult, statKey, energyAvailable) {
        if (gymDots <= 0 || energyPerTrain <= 0 || energyAvailable <= 0) return 0;

        const trains = Math.floor(energyAvailable / energyPerTrain);
        let total = 0;
        let stat = statValue;
        let H = happy;

        for (let i = 0; i < trains; i++) {
            const gain = perTrainGain(stat, H, gymDots, energyPerTrain, perkMult, statKey);
            total += gain;
            stat += gain;
            H = Math.max(0, H - Math.round(energyPerTrain / 2));
        }

        return total;
    }

    function getTargetRatios() {
        return {
            dex: Number(state.settings.ratioDex) || 100,
            str: Number(state.settings.ratioStr) || 70,
            spd: Number(state.settings.ratioSpd) || 70,
            def: Number(state.settings.ratioDef) || 2.5
        };
    }

    function getCurrentRatios(stats) {
        const dex = Math.max(1, stats.dex);
        return {
            dex: 100,
            str: (stats.str / dex) * 100,
            spd: (stats.spd / dex) * 100,
            def: (stats.def / dex) * 100
        };
    }

    function isDexAtRisk(stats) {
        const maxOther = Math.max(stats.str, stats.spd, stats.def);
        const dexLead = stats.dex - maxOther;
        const dexGapPct = ((maxOther - stats.dex) / Math.max(1, stats.dex)) * 100;
        const leadPct = (dexLead / Math.max(1, stats.dex)) * 100;

        return {
            dexIsHighest: stats.dex >= maxOther,
            maxOther,
            dexLead,
            leadPct,
            dexGapPct: Math.max(0, dexGapPct)
        };
    }

    function shouldForceDex(stats) {
        const protection = state.settings.dexProtection || 'rotationAware';
        const risk = isDexAtRisk(stats);

        if (protection === 'strict') {
            return !risk.dexIsHighest || risk.leadPct < 2;
        }

        if (protection === 'flexible') {
            return !risk.dexIsHighest && risk.dexGapPct > Number(state.settings.maxTemporaryDexGapPercent || 5);
        }

        if (protection === 'rotationAware') {
            if (risk.dexIsHighest) return risk.leadPct < 1.5;

            const nextRotation = getNextRotationStats();
            const dexNext = nextRotation.includes('dex');
            const maxGap = Number(state.settings.maxTemporaryDexGapPercent || 5);

            if (dexNext && risk.dexGapPct <= maxGap) {
                return false;
            }

            return true;
        }

        return false;
    }

    function chooseBestStat(stats, gym, multipliers, currentHappy, perksData) {
        const targets = getTargetRatios();
        const current = getCurrentRatios(stats);
        const candidateKeys = ['str', 'spd', 'dex', 'def'].filter(k => gym[k] > 0);

        const strategy = state.settings.trainingStrategy || 'steadfast';
        const perkBiasStrength = Number(state.settings.perkBiasStrength || 35);
        const forecastMonths = Number(state.settings.forecastMonths || 2);
        const defenseFloor = Number(state.settings.defenseFloorPercent || 2.5);

        const activeRotation = getActiveRotationStats();
        const highestFaction = getHighestFactionPerkStats(perksData || {});
        const forceDex = shouldForceDex(stats);

        const scored = [];

        for (const key of candidateKeys) {
            const currentRatio = current[key];
            const targetRatio = targets[key];
            const deficit = Math.max(0, targetRatio - currentRatio);
            const overshoot = Math.max(0, currentRatio - targetRatio);

            const gainPerTrain = perTrainGain(stats[key], currentHappy, gym[key], gym.energy, multipliers[key], key);
            const livePerk = highestFaction.perks[key] || 0;
            const forecastCoverage = getForecastPerkCoverage(key, forecastMonths);

            let score = deficit * 100 + gainPerTrain / 2500;
            let reason = 'Ratio and gain efficiency.';

            if (key === 'def') {
                if (currentRatio >= defenseFloor) score *= 0.12;
                else {
                    score += 150;
                    reason = 'Defence is below floor.';
                }
            }

            if (strategy === 'perk') {
                score += livePerk * perkBiasStrength;
                score += forecastCoverage * perkBiasStrength * 25;
                if (overshoot > 0 && overshoot < 15) score += livePerk * 2;
                if (overshoot > 20) score -= overshoot * 8;
                if (key === 'def' && currentRatio >= defenseFloor) score *= 0.4;
                reason = 'Perk Focused mode: weighted by live faction perk and ratio gap.';
            }

            if (strategy === 'steadfast') {
                score = 0;

                if (forceDex) {
                    score = key === 'dex' ? 5000 : -1000;
                    reason = 'Dex protection has forced Dexterity.';
                } else if (key === 'def') {
                    score = currentRatio < defenseFloor
                        ? 1000 + ((defenseFloor - currentRatio) * 200)
                        : 5;
                    reason = currentRatio < defenseFloor
                        ? 'Defence is below floor.'
                        : 'Defence is suppressed unless below floor.';
                } else {
                    const usefulHighPerkStats = highestFaction.stats.filter(k => k !== 'def');

                    if (usefulHighPerkStats.includes(key)) {
                        score = 2000 + (deficit * 80) + (gainPerTrain / 2000);
                        reason = 'Steadfast mode: highest live faction perk stat.';
                    } else if (highestFaction.stats.includes('dex') && key === 'dex') {
                        score = state.settings.dexMonthBehaviour === 'split'
                            ? 1600 + (gainPerTrain / 2000)
                            : 2400 + (gainPerTrain / 2000);
                        reason = 'Steadfast mode: Dex high-perk month.';
                    } else if (
                        highestFaction.stats.includes('dex') &&
                        state.settings.dexMonthBehaviour === 'split' &&
                        ['str', 'spd'].includes(key)
                    ) {
                        score = 1200 + deficit * 60 + livePerk * 20;
                        reason = 'Dex split mode: paired growth allowed.';
                    } else {
                        score = deficit * 60 + forecastCoverage * 150 + gainPerTrain / 3000;
                        reason = 'Fallback: ratio gap and forecast coverage.';
                    }

                    if (key !== 'dex' && currentRatio > targetRatio + 20) {
                        score -= 700;
                        reason += ' Penalised because stat is far over target.';
                    }
                }
            }

            scored.push({
                key,
                score,
                deficit,
                overshoot,
                gainPerTrain,
                currentRatio,
                targetRatio,
                livePerk,
                forecastCoverage,
                reason
            });
        }

        scored.sort((a, b) => b.score - a.score);

        return {
            best: scored[0],
            ranked: scored,
            strategy,
            activeRotation,
            highestFaction,
            forceDex,
            dexRisk: isDexAtRisk(stats)
        };
    }

    function estimateNaturalEnergyOverHours(currentEnergy, hours, currentDrugCdSec, bars, useNaturalXan) {
        const secs = Math.max(0, hours) * 3600;
        const regenPerSec = (Number(bars.energy.increment) || 0) / (Number(bars.energy.interval) || 1);

        let total = Number(currentEnergy) || 0;
        total += regenPerSec * secs;

        if (useNaturalXan) {
            const startDrug = Math.max(0, Number(currentDrugCdSec) || 0);
            if (secs > startDrug) {
                const remaining = secs - startDrug;
                const xans = 1 + Math.floor(remaining / XAN_CD_SEC);
                total += xans * XAN_E;
            }
        }

        return total;
    }

    function compareModes(bestStatKey, stats, gym, multipliers, bars, cooldowns) {
        const currentEnergy = bars.energy.current;
        const drugCdSec = cooldowns.cooldowns?.drug || 0;
        const jumpHappy = Math.max(1, Number(state.settings.jumpHappy) || 50000);
        const jumpEnergy = Math.max(gym.energy, Number(state.settings.jumpEnergy) || 1000);
        const jumpBoosterCooldownHours = Math.max(0, Number(state.settings.jumpBoosterCooldownHours) || 48);

        const naturalEnergy = estimateNaturalEnergyOverHours(
            currentEnergy,
            jumpBoosterCooldownHours,
            drugCdSec,
            bars,
            !!state.settings.useNaturalXan
        );

        const naturalGain = totalGainForBatch(
            stats[bestStatKey],
            bars.happy.current,
            gym[bestStatKey],
            gym.energy,
            multipliers[bestStatKey],
            bestStatKey,
            naturalEnergy
        );

        const jumpGain = totalGainForBatch(
            stats[bestStatKey],
            jumpHappy,
            gym[bestStatKey],
            gym.energy,
            multipliers[bestStatKey],
            bestStatKey,
            jumpEnergy
        );

        return {
            recommendedMode: jumpGain > naturalGain ? 'Jump' : 'Natural',
            naturalGain,
            jumpGain
        };
    }

    function getGymTileRow() {
        return document.querySelector('.gymList___XJKU0, [class*="gymList___"], [class*="gymList"]') || null;
    }

    function getUnlockedGymsFromDOM() {
        const row = getGymTileRow();
        if (!row) return [];

        const buttons = Array.from(row.querySelectorAll('button.gymButton___wSCig, button[class*="gymButton"]'));
        const unlocked = [];

        buttons.forEach((btn, i) => {
            const cls = (btn.className || '').toString().toLowerCase();
            const locked = cls.includes('locked') || btn.querySelector('[class*="lock"]');
            if (!locked && GYMS[i + 1]) unlocked.push(i + 1);
        });

        return unlocked;
    }

    function getBestUnlockedGymForStat(statKey, unlockedIds) {
        if (!Array.isArray(unlockedIds) || !unlockedIds.length) return null;

        let best = null;

        for (const id of unlockedIds) {
            const gym = GYMS[id];
            if (!gym || !gym[statKey]) continue;

            if (!best || gym[statKey] > best[statKey] || (gym[statKey] === best[statKey] && gym.energy < best.energy)) {
                best = gym;
            }
        }

        return best;
    }

    function getBrowserStatCard(statKey) {
        return document.querySelector(STAT_META[statKey].browserSelector);
    }

    function getPdaStatCard(statLabel) {
        const headings = Array.from(document.querySelectorAll('div, h2, h3, h4, span, li'));
        const titleEl = headings.find(el => (el.textContent || '').trim() === statLabel);
        if (!titleEl) return null;

        let node = titleEl;

        for (let i = 0; i < 10 && node; i++) {
            const txt = (node.textContent || '');
            if (txt.includes('TRAIN') || txt.includes('energy per train')) return node;
            node = node.parentElement;
        }

        return titleEl.parentElement;
    }

    function getStatCard(statKey) {
        if (!isPDA()) return getBrowserStatCard(statKey);
        return getPdaStatCard(STAT_META[statKey].label);
    }

    function canSeeGymCards() {
        return !!getStatCard('str') && !!getStatCard('def') && !!getStatCard('spd') && !!getStatCard('dex');
    }

    function scheduleRefresh(delay = 250, force = false) {
        clearTimeout(gpRefreshTimer);
        gpRefreshTimer = setTimeout(() => {
            refreshPlanner(force).catch(err => console.error('Gym Planner refresh error:', err));
        }, delay);
    }

    function startGymObserver() {
        if (gpObserver) return;
        gpObserver = new MutationObserver(() => scheduleRefresh(250, false));
        gpObserver.observe(document.body, { childList: true, subtree: true });
    }

    async function waitForGymAndRefresh(maxAttempts = 30, delayMs = 300) {
        for (let i = 0; i < maxAttempts; i++) {
            if (canSeeGymCards()) {
                await refreshPlanner(false);
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        await refreshPlanner(false);
        return false;
    }

    function getTopAnchorPDA() {
        return Array.from(document.querySelectorAll('div, section')).find(el => {
            const text = (el.textContent || '').trim();
            return /home\s+events\s+items/i.test(text) || /homeeventsitemscity/i.test(text.replace(/\s+/g, ''));
        });
    }

    function clearInlineUi() {
        document.querySelectorAll('.gp-stat-best').forEach(el => el.classList.remove('gp-stat-best'));
        document.querySelectorAll('.gp-stat-dim').forEach(el => el.classList.remove('gp-stat-dim'));
        document.querySelectorAll('.gp-inline-note').forEach(el => el.remove());
        document.getElementById('gp-summary-box')?.remove();
    }

    function buildMinLine(rec) {
        const statName = STAT_META[rec.bestStat.key].label;
        const strategy = rec.strategy === 'steadfast' ? 'Steadfast' : rec.strategy === 'perk' ? 'Perk Focus' : 'Balanced';
        const gymPart = rec.gymAdvice?.shouldSwitch ? 'Change Gym' : 'Gym OK';
        return `Train: ${statName} · ${rec.mode.recommendedMode} · ${gymPart} · ${strategy}`;
    }

    function buildSummaryBox(rec) {
        const box = document.createElement('div');
        box.id = 'gp-summary-box';
        box.className = `good ${state.settings.summaryMinimised ? 'min' : 'max'}`;

        const strategyLabel = rec.strategy === 'steadfast' ? 'Steadfast Rotation' : rec.strategy === 'perk' ? 'Perk Focused' : 'Balanced';
        const highPerks = rec.highestFaction?.stats?.map(k => STAT_META[k]?.label || k).join(' + ') || 'Unknown';
        const active = (rec.activeRotation || []).map(k => STAT_META[k]?.label || k).join(' + ');

        box.innerHTML = `
            <div class="gp-summary-head">
                <div class="gp-summary-minline">${esc(buildMinLine(rec))}</div>
                <button type="button" class="gp-summary-toggle">${state.settings.summaryMinimised ? '▾' : '▴'}</button>
            </div>
            <div class="gp-summary-body">
                <strong>Train: ${esc(STAT_META[rec.bestStat.key].label)}</strong><br>
                Strategy: ${esc(strategyLabel)}<br>
                Highest live faction perks: ${esc(highPerks)} (+${esc(rec.highestFaction?.max || 0)}%)<br>
                DarkHearts rotation: ${esc(active || 'Unknown')}<br>
                <span class="gp-strong">${esc(rec.mode.recommendedMode)}</span> — natural ${esc(fmtNum(rec.mode.naturalGain))} vs jump ${esc(fmtNum(rec.mode.jumpGain))}<br>
                Ratio gap: ${esc(rec.bestStat.deficit.toFixed(rec.bestStat.key === 'def' ? 2 : 1))}<br>
                Dex lead: ${esc(rec.dexRisk.leadPct.toFixed(1))}%<br>
                Reason: ${esc(rec.bestStat.reason || '')}<br>
                Gym: ${esc(rec.gymAdvice?.text || rec.currentGymName)}
            </div>
        `;

        box.querySelector('.gp-summary-head').addEventListener('click', e => {
            if (e.target && e.target.closest('.gp-summary-toggle')) return;
            state.settings.summaryMinimised = !state.settings.summaryMinimised;
            saveSettings();
            if (state.lastRec) renderInlineUi(state.lastRec);
        });

        box.querySelector('.gp-summary-toggle').addEventListener('click', e => {
            e.stopPropagation();
            state.settings.summaryMinimised = !state.settings.summaryMinimised;
            saveSettings();
            if (state.lastRec) renderInlineUi(state.lastRec);
        });

        return box;
    }

    function renderPDA(rec) {
        const topAnchor = getTopAnchorPDA();
        if (!topAnchor || document.getElementById('gp-summary-box')) return;
        const box = buildSummaryBox(rec);
        topAnchor.parentElement?.insertBefore(box, topAnchor);
    }

    function renderBrowser(rec, chosenCard) {
        if (!chosenCard) return;

        const note = chosenCard.querySelector('.gp-inline-note');
        if (!note) return;

        const strategyLabel = rec.strategy === 'steadfast' ? 'Steadfast Rotation' : rec.strategy === 'perk' ? 'Perk Focused' : 'Balanced';
        const highPerks = rec.highestFaction?.stats?.map(k => STAT_META[k]?.label || k).join(' + ') || 'Unknown';

        note.innerHTML = `
            <strong>Train: ${esc(STAT_META[rec.bestStat.key].label)}</strong><br>
            Strategy: ${esc(strategyLabel)}<br>
            High perk: ${esc(highPerks)} (+${esc(rec.highestFaction?.max || 0)}%)<br>
            <span class="gp-strong">${esc(rec.mode.recommendedMode)}</span> — natural ${esc(fmtNum(rec.mode.naturalGain))} vs jump ${esc(fmtNum(rec.mode.jumpGain))}<br>
            Dex lead: ${esc(rec.dexRisk.leadPct.toFixed(1))}%<br>
            ${esc(rec.gymAdvice?.shouldSwitch ? rec.gymAdvice.text : `Current gym: ${rec.currentGymName}`)}
        `;
    }

    function renderInlineUi(rec) {
        state.lastRec = rec;

        const sig = JSON.stringify({
            key: rec.bestStat.key,
            mode: rec.mode.recommendedMode,
            natural: Math.round(rec.mode.naturalGain),
            jump: Math.round(rec.mode.jumpGain),
            gymText: rec.gymAdvice?.text || rec.currentGymName,
            strategy: rec.strategy,
            high: rec.highestFaction,
            pda: isPDA(),
            min: state.settings.summaryMinimised
        });

        if (sig === gpLastRenderSig && document.querySelector('.gp-inline-note, #gp-summary-box')) return;
        gpLastRenderSig = sig;

        clearInlineUi();

        const allCards = {
            str: getStatCard('str'),
            def: getStatCard('def'),
            spd: getStatCard('spd'),
            dex: getStatCard('dex')
        };

        Object.values(allCards).forEach(card => {
            if (card) card.classList.add('gp-stat-dim');
        });

        const chosenCard = allCards[rec.bestStat.key];

        if (chosenCard) {
            chosenCard.classList.remove('gp-stat-dim');
            chosenCard.classList.add('gp-stat-best');

            const note = document.createElement('div');
            note.className = 'gp-inline-note';
            note.innerHTML = '<strong>Calculating...</strong>';
            chosenCard.appendChild(note);
        }

        if (isPDA()) renderPDA(rec);
        else renderBrowser(rec, chosenCard);
    }

    function buildStyles() {
        if (document.getElementById('gp-inline-style')) return;

        const style = document.createElement('style');
        style.id = 'gp-inline-style';
        style.textContent = `
            #gp-toggle{position:fixed;right:0;top:42%;z-index:999999;background:rgba(20,24,32,.95);color:#fff;border:1px solid rgba(255,255,255,.12);border-right:none;border-radius:10px 0 0 10px;padding:10px 8px;font:12px Arial,sans-serif;writing-mode:vertical-rl;text-orientation:mixed}
            #gp-drawer{position:fixed;right:8px;top:90px;width:310px;max-width:calc(100vw - 16px);max-height:calc(100vh - 110px);overflow-y:auto;z-index:999998;background:rgba(16,18,24,.97);color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:10px;box-shadow:0 8px 18px rgba(0,0,0,.35);font:12px/1.35 Arial,sans-serif;display:none}
            #gp-drawer.open{display:block}
            #gp-drawer .head{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:8px 10px;background:rgba(255,255,255,.05);font-weight:700;position:sticky;top:0;z-index:2}
            #gp-drawer .body{padding:8px 10px 10px}
            #gp-drawer button{background:#2b3446;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:5px 8px;font-size:11px}
            #gp-drawer input[type="text"],#gp-drawer input[type="number"],#gp-drawer select{background:#111620;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:6px;padding:5px 6px;font-size:11px;width:84px}
            #gp-drawer input.gp-api{width:185px}
            #gp-drawer .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:6px}
            #gp-drawer label{display:inline-flex;align-items:center;gap:4px}
            .gp-strategy-box{margin:8px 0;padding:8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.04)}
            .gp-stat-best{background:rgba(80,160,80,.18)!important;box-shadow:inset 0 0 0 1px rgba(130,255,130,.45),0 0 10px rgba(80,220,80,.10)}
            .gp-stat-best *{border-color:rgba(130,255,130,.25)!important}
            .gp-stat-dim{opacity:.92}
            .gp-inline-note{margin-top:8px;background:rgba(0,0,0,.18);border-radius:6px;padding:6px 8px;color:#e8f5e8;font:12px/1.25 Arial,sans-serif}
            .gp-strong{font-weight:700}
            #gp-summary-box{border-radius:8px;padding:8px 10px;font:13px/1.3 Arial,sans-serif;margin:10px 0;border:1px solid transparent}
            #gp-summary-box.good{background:rgba(80,150,80,.18);border-color:rgba(120,220,120,.35);color:#dff7d7}
            .gp-summary-head{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer}
            .gp-summary-minline{font-weight:700;min-width:0;flex:1}
            .gp-summary-toggle{appearance:none;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.15);color:inherit;border-radius:6px;padding:1px 8px;font-size:14px;line-height:1.2;cursor:pointer}
            .gp-summary-body{margin-top:8px}
            #gp-summary-box.min .gp-summary-body{display:none}
        `;
        document.head.appendChild(style);
    }

    function createControls() {
        if (document.getElementById('gp-toggle')) return;

        const toggle = document.createElement('button');
        toggle.id = 'gp-toggle';
        toggle.textContent = 'Gym AI';
        toggle.addEventListener('click', () => document.getElementById('gp-drawer')?.classList.toggle('open'));
        document.body.appendChild(toggle);

        const drawer = document.createElement('div');
        drawer.id = 'gp-drawer';
        drawer.innerHTML = `
            <div class="head">
                <span>Gym AI</span>
                <div>
                    <button id="gp-recalc">Recalc</button>
                    <button id="gp-forceapi">API Now</button>
                    <button id="gp-close">×</button>
                </div>
            </div>
            <div class="body">
                <div class="grid">
                    <label>DEX <input id="gp-rdex" type="number" step="0.1"></label>
                    <label>STR <input id="gp-rstr" type="number" step="0.1"></label>
                    <label>SPD <input id="gp-rspd" type="number" step="0.1"></label>
                    <label>DEF <input id="gp-rdef" type="number" step="0.1"></label>
                </div>

                <div class="grid">
                    <label>Jump H <input id="gp-jhappy" type="number" step="1"></label>
                    <label>Jump E <input id="gp-je" type="number" step="10"></label>
                    <label>Jump CDh <input id="gp-jcd" type="number" step="1"></label>
                    <label>Cache min <input id="gp-cachemin" type="number" min="1" max="120" step="1"></label>
                    <label><input id="gp-nxan" type="checkbox"> Natural uses Xan</label>
                </div>

                <div class="gp-strategy-box">
                    <div style="font-weight:700;margin-bottom:6px;">Strategy</div>
                    <label style="display:block;margin-bottom:4px;"><input type="radio" name="gp-strategy" value="balanced"> Balanced</label>
                    <label style="display:block;margin-bottom:4px;"><input type="radio" name="gp-strategy" value="perk"> Perk Focused</label>
                    <label style="display:block;margin-bottom:8px;"><input type="radio" name="gp-strategy" value="steadfast"> Steadfast Rotation</label>

                    <div class="grid">
                        <label>Bias <input id="gp-perkbias" type="number" min="0" max="100" step="1"></label>
                        <label>Forecast <input id="gp-forecast" type="number" min="1" max="6" step="1"></label>
                    </div>

                    <div class="grid">
                        <label>DEF Floor <input id="gp-deffloor" type="number" min="0" max="20" step="0.1"></label>
                        <label>Dex Gap <input id="gp-dexgap" type="number" min="0" max="25" step="0.1"></label>
                    </div>

                    <div class="grid">
                        <label>Dex Mode <select id="gp-dexmode"><option value="pureDex">Pure Dex</option><option value="split">Split</option></select></label>
                        <label>Dex Protect <select id="gp-dexprotect"><option value="rotationAware">Rotation-aware</option><option value="flexible">Flexible</option><option value="strict">Strict</option></select></label>
                    </div>
                </div>

                <div style="margin-bottom:8px;">
                    <label>API <input id="gp-api" class="gp-api" type="text" placeholder="Fresh Torn API key"></label>
                </div>

                <div style="display:flex;gap:6px;">
                    <button id="gp-save">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(drawer);

        bindSettingsToUi();

        document.getElementById('gp-close').addEventListener('click', () => drawer.classList.remove('open'));
        document.getElementById('gp-save').addEventListener('click', async () => {
            readSettingsFromUi();
            saveSettings();
            gpLastRenderSig = '';
            await refreshPlanner(false);
        });
        document.getElementById('gp-recalc').addEventListener('click', async () => {
            readSettingsFromUi();
            saveSettings();
            gpLastRenderSig = '';
            await refreshPlanner(false);
        });
        document.getElementById('gp-forceapi').addEventListener('click', () => {
            readSettingsFromUi();
            saveSettings();
            forceApiRefresh();
        });
    }

    function bindSettingsToUi() {
        const s = state.settings;

        document.getElementById('gp-api').value = s.apiKey || '';
        document.getElementById('gp-rdex').value = s.ratioDex;
        document.getElementById('gp-rstr').value = s.ratioStr;
        document.getElementById('gp-rspd').value = s.ratioSpd;
        document.getElementById('gp-rdef').value = s.ratioDef;
        document.getElementById('gp-jhappy').value = s.jumpHappy;
        document.getElementById('gp-je').value = s.jumpEnergy;
        document.getElementById('gp-jcd').value = s.jumpBoosterCooldownHours;
        document.getElementById('gp-cachemin').value = s.apiCacheMinutes;
        document.getElementById('gp-nxan').checked = !!s.useNaturalXan;

        document.querySelectorAll('input[name="gp-strategy"]').forEach(r => r.checked = r.value === (s.trainingStrategy || 'steadfast'));

        document.getElementById('gp-perkbias').value = s.perkBiasStrength;
        document.getElementById('gp-forecast').value = s.forecastMonths;
        document.getElementById('gp-deffloor').value = s.defenseFloorPercent;
        document.getElementById('gp-dexgap').value = s.maxTemporaryDexGapPercent;
        document.getElementById('gp-dexmode').value = s.dexMonthBehaviour;
        document.getElementById('gp-dexprotect').value = s.dexProtection;
    }

    function readSettingsFromUi() {
        const s = state.settings;

        s.apiKey = document.getElementById('gp-api').value.trim();
        s.ratioDex = Number(document.getElementById('gp-rdex').value);
        s.ratioStr = Number(document.getElementById('gp-rstr').value);
        s.ratioSpd = Number(document.getElementById('gp-rspd').value);
        s.ratioDef = Number(document.getElementById('gp-rdef').value);

        s.jumpHappy = Number(document.getElementById('gp-jhappy').value);
        s.jumpEnergy = Number(document.getElementById('gp-je').value);
        s.jumpBoosterCooldownHours = Number(document.getElementById('gp-jcd').value);
        s.apiCacheMinutes = Number(document.getElementById('gp-cachemin').value);
        s.useNaturalXan = document.getElementById('gp-nxan').checked;

        const selectedStrategy = document.querySelector('input[name="gp-strategy"]:checked');
        if (selectedStrategy) s.trainingStrategy = selectedStrategy.value;

        s.perkBiasStrength = Number(document.getElementById('gp-perkbias').value);
        s.forecastMonths = Number(document.getElementById('gp-forecast').value);
        s.defenseFloorPercent = Number(document.getElementById('gp-deffloor').value);
        s.maxTemporaryDexGapPercent = Number(document.getElementById('gp-dexgap').value);
        s.dexMonthBehaviour = document.getElementById('gp-dexmode').value;
        s.dexProtection = document.getElementById('gp-dexprotect').value;

        state.currentApiKey = s.apiKey;
        state.apiPromptCancelled = false;
    }

    async function refreshPlanner(forceApi = false) {
        try {
            if (!canSeeGymCards()) return;

            const api = await fetchCombinedApi(forceApi);

            const stats = {
                str: api.strength,
                spd: api.speed,
                dex: api.dexterity,
                def: api.defense
            };

            const gym = GYMS[api.active_gym];
            if (!gym) throw new Error(`Unknown gym id: ${api.active_gym}`);

            const bars = {
                energy: api.energy,
                happy: api.happy
            };

            const cooldowns = {
                cooldowns: api.cooldowns || { drug: 0, booster: 0, medical: 0 }
            };

            const multipliers = parsePerkBonuses(api);
            const picked = chooseBestStat(stats, gym, multipliers, bars.happy.current, api);
            const mode = compareModes(picked.best.key, stats, gym, multipliers, bars, cooldowns);

            const unlockedGymIds = getUnlockedGymsFromDOM();
            const bestUnlockedGym = getBestUnlockedGymForStat(picked.best.key, unlockedGymIds);

            const gymAdvice = bestUnlockedGym && bestUnlockedGym.name !== gym.name && bestUnlockedGym[picked.best.key] > gym[picked.best.key]
                ? { shouldSwitch: true, text: `Switch to ${bestUnlockedGym.name} (${gym[picked.best.key]} → ${bestUnlockedGym[picked.best.key]} dots)` }
                : { shouldSwitch: false, text: `${gym.name} is already fine for ${STAT_META[picked.best.key].label}` };

            renderInlineUi({
                bestStat: picked.best,
                ranked: picked.ranked,
                strategy: picked.strategy,
                activeRotation: picked.activeRotation,
                highestFaction: picked.highestFaction,
                forceDex: picked.forceDex,
                dexRisk: picked.dexRisk,
                mode,
                gymAdvice,
                currentGymName: gym.name
            });
        } catch (err) {
            clearInlineUi();
            console.error('Gym Planner error:', err);
        }
    }

    function init() {
        buildStyles();
        createControls();
        startGymObserver();
        waitForGymAndRefresh().catch(err => console.error('Gym Planner init error:', err));
        scheduleRefresh(500, false);
        scheduleRefresh(1500, false);
        scheduleRefresh(3000, false);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();