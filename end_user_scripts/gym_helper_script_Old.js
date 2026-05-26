// ==UserScript==
// @name         Torn Gym Planner Collapsible
// @namespace    steveo.torn.gymplanner
// @version      3.4.0
// @description  Gym planner with highlighted stat tile and collapsible summary bar.
// @author       MrStez / Ace
// @match        https://www.torn.com/gym.php*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'steveo_gym_planner_v340_settings';
    const XAN_E = 250;
    const XAN_CD_SEC = 7 * 60 * 60;

    const DEFAULTS = {
        apiKey: '',
        ratioDex: 100,
        ratioStr: 70,
        ratioSpd: 70,
        ratioDef: 2.5,
        jumpHappy: 50000,
        jumpEnergy: 1000,
        jumpBoosterCooldownHours: 48,
        useNaturalXan: true,
        summaryMinimised: true
    };

    const STAT_META = {
        str: { label: 'Strength', A: 1600, B: 1700 },
        spd: { label: 'Speed', A: 1600, B: 2000 },
        dex: { label: 'Dexterity', A: 1800, B: 1500 },
        def: { label: 'Defense', A: 2100, B: -600 }
    };

    const GYMS = {
        1:  { name: "Premier Fitness", energy: 5, str: 2, spd: 2, def: 2, dex: 2 },
        2:  { name: "Average Joes", energy: 5, str: 2.4, spd: 2.4, def: 2.8, dex: 2.4 },
        3:  { name: "Woody's Workout", energy: 5, str: 2.8, spd: 3.2, def: 3, dex: 2.8 },
        4:  { name: "Beach Bods", energy: 5, str: 3.2, spd: 3.2, def: 3.2, dex: 0 },
        5:  { name: "Silver Gym", energy: 5, str: 3.4, spd: 3.6, def: 3.4, dex: 3.2 },
        6:  { name: "Pour Femme", energy: 5, str: 3.4, spd: 3.6, def: 3.6, dex: 3.8 },
        7:  { name: "Davies Den", energy: 5, str: 3.7, spd: 0, def: 3.7, dex: 3.7 },
        8:  { name: "Global Gym", energy: 5, str: 4, spd: 4, def: 4, dex: 4 },
        9:  { name: "Knuckle Heads", energy: 10, str: 4.8, spd: 4.4, def: 4, dex: 4.2 },
        10: { name: "Pioneer Fitness", energy: 10, str: 4.4, spd: 4.6, def: 4.8, dex: 4.4 },
        11: { name: "Anabolic Anomalies", energy: 10, str: 5, spd: 4.6, def: 5.2, dex: 4.6 },
        12: { name: "Core", energy: 10, str: 5, spd: 5.2, def: 5, dex: 5 },
        13: { name: "Racing Fitness", energy: 10, str: 5, spd: 5.4, def: 4.8, dex: 5.2 },
        14: { name: "Complete Cardio", energy: 10, str: 5.5, spd: 5.8, def: 5.5, dex: 5.2 },
        15: { name: "Legs Bums and Tums", energy: 10, str: 0, spd: 5.6, def: 5.6, dex: 5.8 },
        16: { name: "Deep Burn", energy: 10, str: 6, spd: 6, def: 6, dex: 6 },
        17: { name: "Apollo Gym", energy: 10, str: 6, spd: 6.2, def: 6.4, dex: 6.2 },
        18: { name: "Gun Shop", energy: 10, str: 6.6, spd: 6.4, def: 6.2, dex: 6.2 },
        19: { name: "Force Training", energy: 10, str: 6.4, spd: 6.6, def: 6.4, dex: 6.8 },
        20: { name: "Cha Cha's", energy: 10, str: 6.4, spd: 6.4, def: 6.8, dex: 7 },
        21: { name: "Atlas", energy: 10, str: 7, spd: 6.4, def: 6.4, dex: 6.6 },
        22: { name: "Last Round", energy: 10, str: 6.8, spd: 6.6, def: 7, dex: 6.6 },
        23: { name: "The Edge", energy: 10, str: 6.8, spd: 7, def: 7, dex: 6.8 },
        24: { name: "George's", energy: 10, str: 7.3, spd: 7.3, def: 7.3, dex: 7.3 },
        25: { name: "Balboas Gym", energy: 25, str: 0, spd: 0, def: 7.5, dex: 7.5 },
        26: { name: "Frontline Fitness", energy: 25, str: 7.5, spd: 7.5, def: 0, dex: 0 },
        27: { name: "Gym 3000", energy: 50, str: 8, spd: 0, def: 0, dex: 0 },
        28: { name: "Mr. Isoyamas", energy: 50, str: 0, spd: 0, def: 8, dex: 0 },
        29: { name: "Total Rebound", energy: 50, str: 0, spd: 8, def: 0, dex: 0 },
        30: { name: "Elites", energy: 50, str: 0, spd: 0, def: 0, dex: 8 },
        31: { name: "Sports Science Lab", energy: 25, str: 9, spd: 9, def: 9, dex: 9 }
    };

    const state = {
        settings: loadSettings(),
        currentApiKey: '',
        apiPromptCancelled: false
    };

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

    async function apiFetch(selection) {
        const key = getApiKeyOnce();
        if (!key) throw new Error('No API key set.');
        const url = `https://api.torn.com/user/?selections=${encodeURIComponent(selection)}&key=${encodeURIComponent(key)}&comment=gym_planner_v340&t=${Date.now()}`;
        const res = await fetch(url, { credentials: 'omit' });
        const data = await res.json();
        if (data.error) throw new Error(`API ${data.error.code}: ${data.error.error}`);
        return data;
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

    function cappedStatForFormula(stat) {
        return stat > 50000000 ? 50000000 : stat;
    }

    function perTrainGain(statValue, happy, gymDots, energyPerTrain, perkMult, statKey) {
        const meta = STAT_META[statKey];
        if (!meta || gymDots <= 0 || energyPerTrain <= 0) return 0;

        const S = cappedStatForFormula(statValue);
        const H = Math.max(0, happy);

        return Math.max(0,
            (
                S * round(1 + 0.07 * round(Math.log(1 + H / 250), 4), 4) +
                8 * Math.pow(H, 1.05) +
                (1 - Math.pow(H / 99999, 2)) * meta.A +
                meta.B
            ) * (1 / 200000) * gymDots * energyPerTrain * perkMult
        );
    }

    function totalGainForBatch(statValue, happy, gymDots, energyPerTrain, perkMult, statKey, energyAvailable) {
        if (gymDots <= 0 || energyPerTrain <= 0 || energyAvailable <= 0) return 0;

        let trains = Math.floor(energyAvailable / energyPerTrain);
        if (trains <= 0) return 0;

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

    function chooseBestStat(stats, gym, multipliers, currentHappy) {
        const targets = getTargetRatios();
        const current = getCurrentRatios(stats);
        const candidateKeys = ['str', 'spd', 'dex', 'def'].filter(k => gym[k] > 0);

        const deficits = candidateKeys.map(key => ({
            key,
            deficit: Math.max(0, targets[key] - current[key]),
            gainPerTrain: perTrainGain(stats[key], currentHappy, gym[key], gym.energy, multipliers[key], key)
        }));

        const underTarget = deficits.filter(d => d.deficit > 0.01);
        let ranked;

        if (underTarget.length > 0) {
            ranked = underTarget.sort((a, b) => {
                if (Math.abs(b.deficit - a.deficit) > 0.5) return b.deficit - a.deficit;
                return b.gainPerTrain - a.gainPerTrain;
            });
        } else {
            ranked = deficits.sort((a, b) => b.gainPerTrain - a.gainPerTrain);
        }

        return { best: ranked[0] };
    }

    function estimateJumpReadyHours(currentEnergy, targetEnergy, currentDrugCdSec, currentBoosterCdSec, bars) {
        let e = Number(currentEnergy) || 0;
        let drugCd = Math.max(0, Number(currentDrugCdSec) || 0);
        let boosterCd = Math.max(0, Number(currentBoosterCdSec) || 0);

        const target = Math.max(0, Number(targetEnergy) || 0);
        const energyMax = Number(bars.energy.maximum) || 150;
        const regenPerSec = (Number(bars.energy.increment) || 0) / (Number(bars.energy.interval) || 1);

        let t = 0;
        let safety = 0;

        while (safety < 5000) {
            safety++;

            if (e >= target && drugCd <= 0 && boosterCd <= 0) break;

            if (e < target && drugCd <= 0) {
                e += XAN_E;
                drugCd = XAN_CD_SEC;
                continue;
            }

            let timeToCap = Infinity;
            if (e < energyMax && regenPerSec > 0) {
                timeToCap = (energyMax - e) / regenPerSec;
            }

            const next = Math.min(
                drugCd > 0 ? drugCd : Infinity,
                boosterCd > 0 ? boosterCd : Infinity,
                timeToCap
            );

            if (!isFinite(next)) break;

            const delta = Math.max(1, Math.ceil(next));
            if (regenPerSec > 0 && e < energyMax) {
                e = Math.min(energyMax, e + regenPerSec * delta);
            }

            t += delta;
            drugCd = Math.max(0, drugCd - delta);
            boosterCd = Math.max(0, boosterCd - delta);
        }

        return t / 3600;
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
        const currentHappy = bars.happy.current;
        const currentEnergy = bars.energy.current;
        const drugCdSec = cooldowns.cooldowns?.drug || 0;
        const boosterCdSec = cooldowns.cooldowns?.booster || 0;

        const jumpHappy = Math.max(1, Number(state.settings.jumpHappy) || 50000);
        const jumpEnergy = Math.max(gym.energy, Number(state.settings.jumpEnergy) || 1000);
        const jumpBoosterCooldownHours = Math.max(0, Number(state.settings.jumpBoosterCooldownHours) || 48);

        const jumpReadyHours = estimateJumpReadyHours(currentEnergy, jumpEnergy, drugCdSec, boosterCdSec, bars);
        const naturalComparisonHours = Math.max(0, jumpBoosterCooldownHours);

        const naturalEnergy = estimateNaturalEnergyOverHours(
            currentEnergy,
            naturalComparisonHours,
            drugCdSec,
            bars,
            !!state.settings.useNaturalXan
        );

        const naturalGain = totalGainForBatch(
            stats[bestStatKey],
            currentHappy,
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
            jumpReadyHours,
            naturalGain,
            jumpGain
        };
    }

    function detectUnlockedGyms() {
        const bodyText = (document.body.innerText || '').toLowerCase();
        const unlocked = [];

        for (const [id, gym] of Object.entries(GYMS)) {
            if (bodyText.includes(gym.name.toLowerCase())) unlocked.push(Number(id));
        }

        return unlocked;
    }

    function getBestUnlockedGymForStat(statKey, unlockedGymIds) {
        const candidates = unlockedGymIds
            .map(id => ({ id, ...GYMS[id] }))
            .filter(g => g && g[statKey] > 0);

        if (!candidates.length) return null;

        candidates.sort((a, b) => {
            if (b[statKey] !== a[statKey]) return b[statKey] - a[statKey];
            return a.energy - b.energy;
        });

        return candidates[0];
    }

    function getStatCard(statLabel) {
        const headings = Array.from(document.querySelectorAll('div, h2, h3, h4, span'));
        const titleEl = headings.find(el => (el.textContent || '').trim() === statLabel);
        if (!titleEl) return null;

        let node = titleEl;
        for (let i = 0; i < 5 && node; i++) {
            if ((node.textContent || '').includes('TRAIN')) return node;
            node = node.parentElement;
        }
        return titleEl.parentElement;
    }

    function getTopAnchor() {
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

    function getSummaryTone(rec) {
        if (rec.gymAdvice?.shouldSwitch) return 'bad';
        if (rec.mode.recommendedMode === 'Jump') return 'warn';
        return 'good';
    }

    function buildMinLine(rec) {
        const gymPart = rec.gymAdvice?.shouldSwitch ? 'Change Gym' : 'Gym OK';
        if (rec.mode.recommendedMode === 'Jump') {
            return `Wait for jump · ${STAT_META[rec.bestStat.key].label} · ${gymPart}`;
        }
        return `Train: ${STAT_META[rec.bestStat.key].label} · ${rec.mode.recommendedMode} · ${gymPart}`;
    }

    function renderInlineUi(rec) {
        clearInlineUi();

        const allCards = {
            str: getStatCard('Strength'),
            def: getStatCard('Defense'),
            spd: getStatCard('Speed'),
            dex: getStatCard('Dexterity')
        };

        Object.values(allCards).forEach(card => {
            if (card) card.classList.add('gp-stat-dim');
        });

        const chosenCard = allCards[rec.bestStat.key];
        if (chosenCard && rec.mode.recommendedMode !== 'Jump') {
            chosenCard.classList.remove('gp-stat-dim');
            chosenCard.classList.add('gp-stat-best');

            const note = document.createElement('div');
            note.className = 'gp-inline-note';
            note.innerHTML = `
                <strong>Train now</strong><br>
                <span class="gp-strong">Natural</span> &gt; Jump
            `;
            chosenCard.appendChild(note);
        }

        const topAnchor = getTopAnchor();
        if (!topAnchor || document.getElementById('gp-summary-box')) return;

        const tone = getSummaryTone(rec);
        const box = document.createElement('div');
        box.id = 'gp-summary-box';
        box.className = `${tone} ${state.settings.summaryMinimised ? 'min' : 'max'}`;

        const minLine = buildMinLine(rec);

        const fullHtml = rec.mode.recommendedMode === 'Jump'
            ? `
                <strong>Wait for jump</strong><br>
                Train: ${esc(STAT_META[rec.bestStat.key].label)}<br>
                <span class="gp-strong">Jump</span> ${esc(fmtNum(rec.mode.jumpGain))} vs natural ${esc(fmtNum(rec.mode.naturalGain))}<br>
                Gym: ${esc(rec.gymAdvice?.text || rec.currentGymName)}
              `
            : `
                <strong>Train: ${esc(STAT_META[rec.bestStat.key].label)}</strong><br>
                <span class="gp-strong">Natural</span> ${esc(fmtNum(rec.mode.naturalGain))} vs jump ${esc(fmtNum(rec.mode.jumpGain))}<br>
                Behind ratio by ${esc(rec.bestStat.deficit.toFixed(rec.bestStat.key === 'def' ? 2 : 1))}<br>
                Gym: ${esc(rec.gymAdvice?.text || rec.currentGymName)}
              `;

        box.innerHTML = `
            <div class="gp-summary-head">
                <div class="gp-summary-minline">${esc(minLine)}</div>
                <button type="button" class="gp-summary-toggle">${state.settings.summaryMinimised ? '▾' : '▴'}</button>
            </div>
            <div class="gp-summary-body">${fullHtml}</div>
        `;

        box.querySelector('.gp-summary-head').addEventListener('click', (e) => {
            if (e.target && e.target.closest('.gp-summary-toggle')) return;
            state.settings.summaryMinimised = !state.settings.summaryMinimised;
            saveSettings();
            renderInlineUi(rec);
        });

        box.querySelector('.gp-summary-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            state.settings.summaryMinimised = !state.settings.summaryMinimised;
            saveSettings();
            renderInlineUi(rec);
        });

        topAnchor.parentElement?.insertBefore(box, topAnchor);
    }

    function buildStyles() {
        if (document.getElementById('gp-inline-style')) return;

        const style = document.createElement('style');
        style.id = 'gp-inline-style';
        style.textContent = `
            #gp-toggle {
                position: fixed;
                right: 0;
                top: 42%;
                z-index: 999999;
                background: rgba(20, 24, 32, 0.95);
                color: #fff;
                border: 1px solid rgba(255,255,255,0.12);
                border-right: none;
                border-radius: 10px 0 0 10px;
                padding: 10px 8px;
                font: 12px Arial, sans-serif;
                writing-mode: vertical-rl;
                text-orientation: mixed;
            }

            #gp-drawer {
                position: fixed;
                right: 8px;
                top: 90px;
                width: 290px;
                max-width: calc(100vw - 16px);
                z-index: 999998;
                background: rgba(16,18,24,0.97);
                color: #fff;
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 10px;
                box-shadow: 0 8px 18px rgba(0,0,0,0.35);
                font: 12px/1.35 Arial, sans-serif;
                display: none;
                overflow: hidden;
            }

            #gp-drawer.open { display: block; }

            #gp-drawer .head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 6px;
                padding: 8px 10px;
                background: rgba(255,255,255,0.05);
                font-weight: 700;
            }

            #gp-drawer .body {
                padding: 8px 10px 10px;
            }

            #gp-drawer button {
                background: #2b3446;
                color: #fff;
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 6px;
                padding: 5px 8px;
                font-size: 11px;
            }

            #gp-drawer input[type="text"],
            #gp-drawer input[type="number"] {
                background: #111620;
                color: #fff;
                border: 1px solid rgba(255,255,255,0.14);
                border-radius: 6px;
                padding: 5px 6px;
                font-size: 11px;
                width: 76px;
            }

            #gp-drawer input.gp-api { width: 180px; }

            #gp-drawer .grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0,1fr));
                gap: 6px;
                margin-bottom: 6px;
            }

            #gp-drawer label {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }

            .gp-stat-best {
                background: rgba(80, 160, 80, 0.18) !important;
                box-shadow: inset 0 0 0 1px rgba(130,255,130,0.45), 0 0 10px rgba(80,220,80,0.10);
            }

            .gp-stat-best * {
                border-color: rgba(130,255,130,0.25) !important;
            }

            .gp-stat-dim {
                opacity: 0.9;
            }

            .gp-inline-note {
                margin-top: 8px;
                background: rgba(0,0,0,0.18);
                border-radius: 6px;
                padding: 6px 8px;
                color: #e8f5e8;
                font: 12px/1.25 Arial, sans-serif;
            }

            .gp-strong {
                font-weight: 700;
            }

            #gp-summary-box {
                border-radius: 8px;
                padding: 8px 10px;
                font: 13px/1.3 Arial, sans-serif;
                margin: 10px 0;
                border: 1px solid transparent;
            }

            #gp-summary-box.good {
                background: rgba(80, 150, 80, 0.18);
                border-color: rgba(120, 220, 120, 0.35);
                color: #dff7d7;
            }

            #gp-summary-box.warn {
                background: rgba(170, 120, 40, 0.16);
                border-color: rgba(255, 200, 100, 0.35);
                color: #ffe4b1;
            }

            #gp-summary-box.bad {
                background: rgba(170, 80, 80, 0.18);
                border-color: rgba(255, 140, 140, 0.35);
                color: #ffd3d3;
            }

            .gp-summary-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                cursor: pointer;
            }

            .gp-summary-minline {
                font-weight: 700;
                min-width: 0;
                flex: 1;
            }

            .gp-summary-toggle {
                appearance: none;
                border: 1px solid rgba(255,255,255,0.18);
                background: rgba(0,0,0,0.15);
                color: inherit;
                border-radius: 6px;
                padding: 1px 8px;
                font-size: 14px;
                line-height: 1.2;
                cursor: pointer;
            }

            .gp-summary-body {
                margin-top: 8px;
            }

            #gp-summary-box.min .gp-summary-body {
                display: none;
            }
        `;
        document.head.appendChild(style);
    }

    function createControls() {
        if (document.getElementById('gp-toggle')) return;

        const toggle = document.createElement('button');
        toggle.id = 'gp-toggle';
        toggle.textContent = 'Gym AI';
        toggle.addEventListener('click', () => {
            document.getElementById('gp-drawer')?.classList.toggle('open');
        });
        document.body.appendChild(toggle);

        const drawer = document.createElement('div');
        drawer.id = 'gp-drawer';
        drawer.innerHTML = `
            <div class="head">
                <span>Gym AI</span>
                <div>
                    <button id="gp-recalc">Recalc</button>
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
                    <label><input id="gp-nxan" type="checkbox"> Natural uses Xan</label>
                </div>
                <div style="margin-bottom:8px;">
                    <label>API <input id="gp-api" class="gp-api" type="text" placeholder="Fresh Torn API key"></label>
                </div>
                <div style="display:flex; gap:6px;">
                    <button id="gp-save">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(drawer);

        bindSettingsToUi();

        document.getElementById('gp-close').addEventListener('click', () => {
            drawer.classList.remove('open');
        });

        document.getElementById('gp-save').addEventListener('click', async () => {
            readSettingsFromUi();
            saveSettings();
            await refreshPlanner();
        });

        document.getElementById('gp-recalc').addEventListener('click', async () => {
            readSettingsFromUi();
            saveSettings();
            await refreshPlanner();
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
        document.getElementById('gp-nxan').checked = !!s.useNaturalXan;
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
        s.useNaturalXan = document.getElementById('gp-nxan').checked;
        state.currentApiKey = s.apiKey;
        state.apiPromptCancelled = false;
    }

    async function refreshPlanner() {
        try {
            const [battlestats, gymData, bars, cooldowns, perks] = await Promise.all([
                apiFetch('battlestats'),
                apiFetch('gym'),
                apiFetch('bars'),
                apiFetch('cooldowns'),
                apiFetch('perks')
            ]);

            const stats = {
                str: battlestats.strength,
                spd: battlestats.speed,
                dex: battlestats.dexterity,
                def: battlestats.defense
            };

            const gym = GYMS[gymData.active_gym];
            if (!gym) throw new Error(`Unknown gym id: ${gymData.active_gym}`);

            const multipliers = parsePerkBonuses(perks);
            const picked = chooseBestStat(stats, gym, multipliers, bars.happy.current);
            const mode = compareModes(picked.best.key, stats, gym, multipliers, bars, cooldowns);

            const unlockedGymIds = detectUnlockedGyms();
            const bestUnlockedGym = getBestUnlockedGymForStat(picked.best.key, unlockedGymIds);

            let gymAdvice = null;
            if (bestUnlockedGym && bestUnlockedGym.name !== gym.name && bestUnlockedGym[picked.best.key] > gym[picked.best.key]) {
                gymAdvice = {
                    shouldSwitch: true,
                    text: `Switch to ${bestUnlockedGym.name} (${gym[picked.best.key]} → ${bestUnlockedGym[picked.best.key]} dots)`
                };
            } else if (bestUnlockedGym) {
                gymAdvice = {
                    shouldSwitch: false,
                    text: `${gym.name} is already fine for ${STAT_META[picked.best.key].label}`
                };
            } else {
                gymAdvice = {
                    shouldSwitch: false,
                    text: `${gym.name} in use`
                };
            }

            renderInlineUi({
                bestStat: picked.best,
                mode,
                gymAdvice,
                currentGymName: gym.name
            });
        } catch (err) {
            clearInlineUi();
            const topAnchor = getTopAnchor();
            if (!topAnchor || document.getElementById('gp-summary-box')) return;

            const box = document.createElement('div');
            box.id = 'gp-summary-box';
            box.className = 'warn min';
            box.innerHTML = `
                <div class="gp-summary-head">
                    <div class="gp-summary-minline">Gym AI error</div>
                    <button type="button" class="gp-summary-toggle">▾</button>
                </div>
                <div class="gp-summary-body"><strong>Gym AI:</strong> ${esc(err.message || String(err))}</div>
            `;
            topAnchor.parentElement?.insertBefore(box, topAnchor);

            box.querySelector('.gp-summary-head').addEventListener('click', (e) => {
                if (e.target && e.target.closest('.gp-summary-toggle')) return;
                box.classList.toggle('min');
            });
            box.querySelector('.gp-summary-toggle').addEventListener('click', (e) => {
                e.stopPropagation();
                box.classList.toggle('min');
            });
        }
    }

    function init() {
        buildStyles();
        createControls();
        refreshPlanner();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
