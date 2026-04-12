// ==UserScript==
// @name         Torn Gym Planner (Ratio + Jump v2.1)
// @namespace    steveo.torn.gymplanner
// @version      2.1.0
// @description  Recommends the best stat to train and whether to train naturally or wait for your configured jump.
// @author       MrStez / Ace
// @match        https://www.torn.com/gym.php*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'steveo_gym_planner_v21_settings';
    const PANEL_ID = 'steo-gym-planner-v21';
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
        minimise: false,
        settingsOpen: false,
        left: 8,
        top: 58
    };

    const STAT_META = {
        str: { label: 'Strength', A: 1600, B: 1700 },
        spd: { label: 'Speed',    A: 1600, B: 2000 },
        dex: { label: 'Dexterity',A: 1800, B: 1500 },
        def: { label: 'Defense',  A: 2100, B: -600 }
    };

    const GYMS = {
        1:  { name: "Premier Fitness",     energy: 5,  str: 2,   spd: 2,   def: 2,   dex: 2   },
        2:  { name: "Average Joes",        energy: 5,  str: 2.4, spd: 2.4, def: 2.8, dex: 2.4 },
        3:  { name: "Woody's Workout",     energy: 5,  str: 2.8, spd: 3.2, def: 3,   dex: 2.8 },
        4:  { name: "Beach Bods",          energy: 5,  str: 3.2, spd: 3.2, def: 3.2, dex: 0   },
        5:  { name: "Silver Gym",          energy: 5,  str: 3.4, spd: 3.6, def: 3.4, dex: 3.2 },
        6:  { name: "Pour Femme",          energy: 5,  str: 3.4, spd: 3.6, def: 3.6, dex: 3.8 },
        7:  { name: "Davies Den",          energy: 5,  str: 3.7, spd: 0,   def: 3.7, dex: 3.7 },
        8:  { name: "Global Gym",          energy: 5,  str: 4,   spd: 4,   def: 4,   dex: 4   },
        9:  { name: "Knuckle Heads",       energy: 10, str: 4.8, spd: 4.4, def: 4,   dex: 4.2 },
        10: { name: "Pioneer Fitness",     energy: 10, str: 4.4, spd: 4.6, def: 4.8, dex: 4.4 },
        11: { name: "Anabolic Anomalies",  energy: 10, str: 5,   spd: 4.6, def: 5.2, dex: 4.6 },
        12: { name: "Core",                energy: 10, str: 5,   spd: 5.2, def: 5,   dex: 5   },
        13: { name: "Racing Fitness",      energy: 10, str: 5,   spd: 5.4, def: 4.8, dex: 5.2 },
        14: { name: "Complete Cardio",     energy: 10, str: 5.5, spd: 5.8, def: 5.5, dex: 5.2 },
        15: { name: "Legs Bums and Tums",  energy: 10, str: 0,   spd: 5.6, def: 5.6, dex: 5.8 },
        16: { name: "Deep Burn",           energy: 10, str: 6,   spd: 6,   def: 6,   dex: 6   },
        17: { name: "Apollo Gym",          energy: 10, str: 6,   spd: 6.2, def: 6.4, dex: 6.2 },
        18: { name: "Gun Shop",            energy: 10, str: 6.6, spd: 6.4, def: 6.2, dex: 6.2 },
        19: { name: "Force Training",      energy: 10, str: 6.4, spd: 6.6, def: 6.4, dex: 6.8 },
        20: { name: "Cha Cha's",           energy: 10, str: 6.4, spd: 6.4, def: 6.8, dex: 7   },
        21: { name: "Atlas",               energy: 10, str: 7,   spd: 6.4, def: 6.4, dex: 6.6 },
        22: { name: "Last Round",          energy: 10, str: 6.8, spd: 6.6, def: 7,   dex: 6.6 },
        23: { name: "The Edge",            energy: 10, str: 6.8, spd: 7,   def: 7,   dex: 6.8 },
        24: { name: "George's",            energy: 10, str: 7.3, spd: 7.3, def: 7.3, dex: 7.3 },
        25: { name: "Balboas Gym",         energy: 25, str: 0,   spd: 0,   def: 7.5, dex: 7.5 },
        26: { name: "Frontline Fitness",   energy: 25, str: 7.5, spd: 7.5, def: 0,   dex: 0   },
        27: { name: "Gym 3000",            energy: 50, str: 8,   spd: 0,   def: 0,   dex: 0   },
        28: { name: "Mr. Isoyamas",        energy: 50, str: 0,   spd: 0,   def: 8,   dex: 0   },
        29: { name: "Total Rebound",       energy: 50, str: 0,   spd: 8,   def: 0,   dex: 0   },
        30: { name: "Elites",              energy: 50, str: 0,   spd: 0,   def: 0,   dex: 8   },
        31: { name: "Sports Science Lab",  energy: 25, str: 9,   spd: 9,   def: 9,   dex: 9   }
    };

    function loadSettings() {
        try {
            return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) };
        } catch {
            return { ...DEFAULTS };
        }
    }

    function saveSettings() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }

    let settings = loadSettings();
    let currentApiKey = settings.apiKey || '';
    let apiPromptCancelled = false;

    function fmtNum(n) {
        if (!isFinite(n)) return '0';
        if (n >= 1e12) return `${(n / 1e12).toFixed(2).replace(/\.00$/, '')}t`;
        if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(/\.00$/, '')}b`;
        if (n >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.00$/, '')}m`;
        if (n >= 1e3) return `${(n / 1e3).toFixed(2).replace(/\.00$/, '')}k`;
        return `${Math.round(n)}`;
    }

    function fmtHours(hours) {
        if (!isFinite(hours)) return '0h';
        if (hours < 1) return `${Math.round(hours * 60)}m`;
        return `${hours.toFixed(1).replace(/\.0$/, '')}h`;
    }

    function round(n, p = 4) {
        return Number(Number(n).toFixed(p));
    }

    function escapeHtml(str) {
        return String(str)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }

    function getApiKeyOnce() {
        if (apiPromptCancelled) return '';

        if (currentApiKey) return currentApiKey;

        const freshKey = prompt('Enter a fresh Torn API key for Gym Planner');
        if (!freshKey) {
            apiPromptCancelled = true;
            return '';
        }

        currentApiKey = freshKey.trim();
        settings.apiKey = currentApiKey;
        saveSettings();
        const apiBox = document.getElementById('gp-api');
        if (apiBox) apiBox.value = currentApiKey;
        return currentApiKey;
    }

    async function apiFetch(selection) {
        const key = getApiKeyOnce();
        if (!key) throw new Error('No API key set.');
        const url = `https://api.torn.com/user/?selections=${encodeURIComponent(selection)}&key=${encodeURIComponent(key)}&comment=gym_planner_v21&t=${Date.now()}`;
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

        const result =
            (
                S * round(1 + 0.07 * round(Math.log(1 + H / 250), 4), 4) +
                8 * Math.pow(H, 1.05) +
                (1 - Math.pow(H / 99999, 2)) * meta.A +
                meta.B
            ) * (1 / 200000) * gymDots * energyPerTrain * perkMult;

        return Math.max(0, result);
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
            dex: Number(settings.ratioDex) || 100,
            str: Number(settings.ratioStr) || 70,
            spd: Number(settings.ratioSpd) || 70,
            def: Number(settings.ratioDef) || 2.5
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

        return {
            current,
            targets,
            ranked,
            best: ranked[0]
        };
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

    function monthChangesBefore(hours) {
        const now = new Date();
        const future = new Date(now.getTime() + hours * 3600 * 1000);
        return now.getMonth() !== future.getMonth();
    }

    function compareModes(bestStatKey, stats, gym, multipliers, bars, cooldowns) {
        const currentHappy = bars.happy.current;
        const currentEnergy = bars.energy.current;
        const drugCdSec = cooldowns.cooldowns?.drug || 0;
        const boosterCdSec = cooldowns.cooldowns?.booster || 0;

        const jumpHappy = Math.max(1, Number(settings.jumpHappy) || 50000);
        const jumpEnergy = Math.max(gym.energy, Number(settings.jumpEnergy) || 1000);
        const jumpBoosterCooldownHours = Math.max(0, Number(settings.jumpBoosterCooldownHours) || 48);

        const jumpReadyHours = estimateJumpReadyHours(currentEnergy, jumpEnergy, drugCdSec, boosterCdSec, bars);
        const fullJumpCycleHours = jumpReadyHours + jumpBoosterCooldownHours;

        // Natural only gets the "free" time between jumps, not the next stack-prep window as well.
        const naturalComparisonHours = Math.max(0, fullJumpCycleHours - jumpReadyHours);

        const naturalEnergy = estimateNaturalEnergyOverHours(
            currentEnergy,
            naturalComparisonHours,
            drugCdSec,
            bars,
            !!settings.useNaturalXan
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

        const recommendedMode = jumpGain > naturalGain ? 'Jump' : 'Natural';
        const reason = recommendedMode === 'Jump'
            ? 'Waiting for your configured jump beats natural training over the free time between jumps.'
            : 'Natural training beats waiting for your configured jump over the free time between jumps.';

        const warnings = [];
        if (monthChangesBefore(jumpReadyHours)) {
            warnings.push('Jump prep crosses into a new month, so live faction gym perks may change before the jump lands.');
        }
        if (recommendedMode === 'Jump' && currentEnergy >= bars.energy.maximum && drugCdSec > 0) {
            warnings.push('You already have trainable stacked energy and drug cooldown running, so waiting may still feel awkward in practice.');
        }

        return {
            recommendedMode,
            reason,
            jumpReadyHours,
            fullJumpCycleHours,
            naturalComparisonHours,
            naturalEnergy,
            naturalGain,
            jumpGain,
            warnings
        };
    }

    function buildStyles() {
        if (document.getElementById(`${PANEL_ID}-style`)) return;

        const style = document.createElement('style');
        style.id = `${PANEL_ID}-style`;
        style.textContent = `
            #${PANEL_ID} {
                position: fixed;
                left: ${settings.left}px;
                top: ${settings.top}px;
                z-index: 999999;
                width: 318px;
                max-width: calc(100vw - 16px);
                background: rgba(16, 18, 24, 0.96);
                color: #f5f5f5;
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 10px;
                box-shadow: 0 8px 18px rgba(0,0,0,0.35);
                font: 12px/1.35 Arial, sans-serif;
                overflow: hidden;
                backdrop-filter: blur(4px);
            }
            #${PANEL_ID}.min .gp-body {
                display: none;
            }
            #${PANEL_ID} .gp-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 8px 10px;
                background: rgba(255,255,255,0.05);
                cursor: move;
                user-select: none;
            }
            #${PANEL_ID} .gp-title {
                font-weight: 700;
                font-size: 13px;
            }
            #${PANEL_ID} .gp-btns,
            #${PANEL_ID} .gp-row {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
            }
            #${PANEL_ID} button {
                background: #2b3446;
                color: #fff;
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 6px;
                padding: 5px 8px;
                font-size: 11px;
            }
            #${PANEL_ID} .gp-body {
                padding: 8px 10px 10px;
                max-height: 70vh;
                overflow-y: auto;
            }
            #${PANEL_ID} .gp-box {
                background: rgba(255,255,255,0.035);
                border-radius: 8px;
                padding: 8px;
                margin-bottom: 8px;
            }
            #${PANEL_ID} .gp-box:last-child {
                margin-bottom: 0;
            }
            #${PANEL_ID} .gp-box-title {
                font-weight: 700;
                margin-bottom: 6px;
            }
            #${PANEL_ID} input[type="text"],
            #${PANEL_ID} input[type="number"] {
                background: #111620;
                color: #fff;
                border: 1px solid rgba(255,255,255,0.14);
                border-radius: 6px;
                padding: 5px 6px;
                font-size: 11px;
                width: 76px;
            }
            #${PANEL_ID} input.gp-api {
                width: 180px;
            }
            #${PANEL_ID} label {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }
            #${PANEL_ID} .gp-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 6px;
            }
            #${PANEL_ID} .good {
                color: #99df8a;
            }
            #${PANEL_ID} .warn {
                color: #f6c46f;
            }
            #${PANEL_ID} .mono {
                font-family: Consolas, Menlo, monospace;
                white-space: pre-wrap;
                word-break: break-word;
            }
            #${PANEL_ID} .small {
                font-size: 11px;
                opacity: 0.92;
            }
            #${PANEL_ID} .muted {
                opacity: 0.78;
            }
        `;
        document.head.appendChild(style);
    }

    function createPanel() {
        if (document.getElementById(PANEL_ID)) return;

        buildStyles();

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        if (settings.minimise) panel.classList.add('min');

        panel.innerHTML = `
            <div class="gp-head" id="gp-drag-handle">
                <div class="gp-title">Gym Planner</div>
                <div class="gp-btns">
                    <button id="gp-refresh">Recalc</button>
                    <button id="gp-settings-toggle">Settings</button>
                    <button id="gp-minimise">_</button>
                </div>
            </div>

            <div class="gp-body">
                <div class="gp-box">
                    <div class="gp-box-title">Recommendation</div>
                    <div id="gp-summary" class="small">Loading...</div>
                </div>

                <div class="gp-box">
                    <div class="gp-box-title">Live state</div>
                    <div id="gp-live" class="small mono"></div>
                </div>

                <div class="gp-box">
                    <div class="gp-box-title">Stat ranking</div>
                    <div id="gp-ranking" class="small mono"></div>
                </div>

                <div class="gp-box" id="gp-settings-box" style="display:${settings.settingsOpen ? 'block' : 'none'};">
                    <div class="gp-box-title">Settings</div>

                    <div class="gp-row" style="margin-bottom:6px;">
                        <label>API <input id="gp-api" class="gp-api" type="text" placeholder="Fresh Torn API key"></label>
                    </div>

                    <div class="gp-grid" style="margin-bottom:6px;">
                        <label>DEX <input id="gp-rdex" type="number" step="0.1"></label>
                        <label>STR <input id="gp-rstr" type="number" step="0.1"></label>
                        <label>SPD <input id="gp-rspd" type="number" step="0.1"></label>
                        <label>DEF <input id="gp-rdef" type="number" step="0.1"></label>
                    </div>

                    <div class="gp-grid" style="margin-bottom:6px;">
                        <label>Jump H <input id="gp-jhappy" type="number" step="1"></label>
                        <label>Jump E <input id="gp-je" type="number" step="10"></label>
                        <label>Jump CDh <input id="gp-jcd" type="number" step="1"></label>
                        <label><input id="gp-nxan" type="checkbox"> Natural uses Xan</label>
                    </div>

                    <div class="small muted">
                        Jump H = happy when training starts.<br>
                        Jump E = total energy spent in the jump.<br>
                        Jump CDh = booster cooldown caused by that jump setup.
                    </div>

                    <div class="gp-row" style="margin-top:8px;">
                        <button id="gp-save">Save</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        bindSettingsToUi();
        wireUiEvents();
        makeDraggable(panel, document.getElementById('gp-drag-handle'));
    }

    function bindSettingsToUi() {
        document.getElementById('gp-api').value = settings.apiKey || '';
        document.getElementById('gp-rdex').value = settings.ratioDex;
        document.getElementById('gp-rstr').value = settings.ratioStr;
        document.getElementById('gp-rspd').value = settings.ratioSpd;
        document.getElementById('gp-rdef').value = settings.ratioDef;
        document.getElementById('gp-jhappy').value = settings.jumpHappy;
        document.getElementById('gp-je').value = settings.jumpEnergy;
        document.getElementById('gp-jcd').value = settings.jumpBoosterCooldownHours;
        document.getElementById('gp-nxan').checked = !!settings.useNaturalXan;
    }

    function readSettingsFromUi() {
        settings.apiKey = document.getElementById('gp-api').value.trim();
        currentApiKey = settings.apiKey;
        apiPromptCancelled = false;
        settings.ratioDex = Number(document.getElementById('gp-rdex').value);
        settings.ratioStr = Number(document.getElementById('gp-rstr').value);
        settings.ratioSpd = Number(document.getElementById('gp-rspd').value);
        settings.ratioDef = Number(document.getElementById('gp-rdef').value);
        settings.jumpHappy = Number(document.getElementById('gp-jhappy').value);
        settings.jumpEnergy = Number(document.getElementById('gp-je').value);
        settings.jumpBoosterCooldownHours = Number(document.getElementById('gp-jcd').value);
        settings.useNaturalXan = document.getElementById('gp-nxan').checked;
    }

    function wireUiEvents() {
        document.getElementById('gp-refresh').addEventListener('click', async () => {
            readSettingsFromUi();
            saveSettings();
            await refreshPlanner();
        });

        document.getElementById('gp-save').addEventListener('click', async () => {
            readSettingsFromUi();
            saveSettings();
            await refreshPlanner();
        });

        document.getElementById('gp-settings-toggle').addEventListener('click', () => {
            settings.settingsOpen = !settings.settingsOpen;
            saveSettings();
            document.getElementById('gp-settings-box').style.display = settings.settingsOpen ? 'block' : 'none';
        });

        document.getElementById('gp-minimise').addEventListener('click', () => {
            settings.minimise = !document.getElementById(PANEL_ID).classList.contains('min');
            document.getElementById(PANEL_ID).classList.toggle('min');
            saveSettings();
        });
    }

    function makeDraggable(panel, handle) {
        let dragging = false;
        let startX = 0;
        let startY = 0;
        let origLeft = 0;
        let origTop = 0;

        handle.addEventListener('pointerdown', (e) => {
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            origLeft = panel.offsetLeft;
            origTop = panel.offsetTop;
            handle.setPointerCapture(e.pointerId);
        });

        handle.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const left = Math.max(0, origLeft + (e.clientX - startX));
            const top = Math.max(0, origTop + (e.clientY - startY));
            panel.style.left = `${left}px`;
            panel.style.top = `${top}px`;
            settings.left = left;
            settings.top = top;
        });

        handle.addEventListener('pointerup', () => {
            dragging = false;
            saveSettings();
        });

        handle.addEventListener('pointercancel', () => {
            dragging = false;
            saveSettings();
        });
    }

    async function refreshPlanner() {
        const summaryEl = document.getElementById('gp-summary');
        const liveEl = document.getElementById('gp-live');
        const rankingEl = document.getElementById('gp-ranking');

        summaryEl.textContent = 'Loading...';
        liveEl.textContent = '';
        rankingEl.textContent = '';

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

            const ratioLines = [
                `Current ratios vs DEX`,
                `STR ${picked.current.str.toFixed(1)} / ${picked.targets.str}`,
                `SPD ${picked.current.spd.toFixed(1)} / ${picked.targets.spd}`,
                `DEF ${picked.current.def.toFixed(2)} / ${picked.targets.def}`
            ];

            summaryEl.innerHTML = `
                <div><strong>Best stat:</strong> <span class="good">${escapeHtml(STAT_META[picked.best.key].label)}</span></div>
                <div><strong>Best mode:</strong> <span class="good">${escapeHtml(mode.recommendedMode)}</span></div>
                <div class="small" style="margin-top:4px;">${escapeHtml(mode.reason)}</div>
                <div class="small" style="margin-top:6px;">
                    Jump ready in <strong>${escapeHtml(fmtHours(mode.jumpReadyHours))}</strong> |
                    Full jump cycle <strong>${escapeHtml(fmtHours(mode.fullJumpCycleHours))}</strong>
                </div>
                <div class="small" style="margin-top:4px;">
                    Natural window: <strong>${escapeHtml(fmtHours(mode.naturalComparisonHours))}</strong>
                </div>
                <div class="small" style="margin-top:4px;">
                    Natural gain: ${escapeHtml(fmtNum(mode.naturalGain))} |
                    Jump gain: ${escapeHtml(fmtNum(mode.jumpGain))}
                </div>
                ${mode.warnings.map(w => `<div class="warn small" style="margin-top:4px;">• ${escapeHtml(w)}</div>`).join('')}
            `;

            liveEl.textContent = [
                `Gym: ${gym.name} (${gym.energy}E/train)`,
                `Happy: ${bars.happy.current}/${bars.happy.maximum}`,
                `Energy: ${bars.energy.current}/${bars.energy.maximum}`,
                `Cooldowns: Drug ${cooldowns.cooldowns.drug}s | Booster ${cooldowns.cooldowns.booster}s`,
                `Perks: STR x${multipliers.str.toFixed(2)} | SPD x${multipliers.spd.toFixed(2)} | DEX x${multipliers.dex.toFixed(2)} | DEF x${multipliers.def.toFixed(2)}`,
                '',
                ...ratioLines
            ].join('\n');

            rankingEl.textContent = picked.ranked.map(item => {
                const label = STAT_META[item.key].label.padEnd(9);
                return `${label} deficit=${item.deficit.toFixed(item.key === 'def' ? 2 : 1)} gain/train=${fmtNum(item.gainPerTrain)}`;
            }).join('\n');

        } catch (err) {
            summaryEl.innerHTML = `<span class="warn">${escapeHtml(err.message || String(err))}</span>`;
        }
    }

    createPanel();
    refreshPlanner();
})();