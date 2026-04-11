// ==UserScript==
// @name         Torn Effective Stats Inline
// @namespace    stez.effective.stats.inline
// @version      3.2.0
// @description  Shows effective battle stats inline on Torn home page
// @author       MrStez
// @match        https://www.torn.com/index.php*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const STAT_NAMES = ['Strength', 'Defense', 'Speed', 'Dexterity'];

    function parseNumber(str) {
        if (!str) return NaN;
        return parseFloat(String(str).replace(/,/g, '').trim());
    }

    function parsePercent(str) {
        if (!str) return 0;
        return parseFloat(
            String(str)
                .replace(/[−–—]/g, '-') // Torn often uses unicode minus
                .replace('%', '')
                .trim()
        ) || 0;
    }

    function formatNumber(num) {
        const abs = Math.abs(num);
        if (abs >= 1e12) return (num / 1e12).toFixed(2) + 't';
        if (abs >= 1e9) return (num / 1e9).toFixed(2) + 'b';
        if (abs >= 1e6) return (num / 1e6).toFixed(2) + 'm';
        if (abs >= 1e3) return (num / 1e3).toFixed(2) + 'k';
        return Math.round(num).toLocaleString('en-GB');
    }

    function injectStyles() {
        if (document.getElementById('stez-eff-styles')) return;

        const style = document.createElement('style');
        style.id = 'stez-eff-styles';
        style.textContent = `
            .stez-eff {
                margin-left: 6px;
                font-size: 10px;
                font-weight: 700;
                white-space: nowrap;
                opacity: 0.92;
            }

            .stez-eff-pos {
                color: #6ee26e;
            }

            .stez-eff-neg {
                color: #ff8a65;
            }

            .stez-eff-neutral {
                color: #dddddd;
            }

            .stez-eff-total {
                display: block;
                margin-top: 4px;
                font-size: 11px;
                font-weight: 700;
            }
        `;
        document.head.appendChild(style);
    }

    function findBattleStatsBox() {
        return Array.from(document.querySelectorAll('.sortable-box')).find(box => {
            const title = box.querySelector('.box-title');
            return title && title.textContent.trim() === 'Battle Stats';
        }) || null;
    }

    function run() {
        const box = findBattleStatsBox();
        if (!box) return false;

        const rows = box.querySelectorAll('.cont-gray.battle .info-cont-wrap > li');
        if (!rows.length) return false;

        let effectiveTotal = 0;
        let foundStats = 0;

        rows.forEach((row) => {
            const labelEl = row.querySelector('.label');
            const valueEl = row.querySelector('.desc');
            const modEl = row.querySelector('.mod-value');
            const totalSpan = row.querySelector('.divider > span:not(.label)');

            if (labelEl && valueEl) {
                const statName = labelEl.textContent.trim();
                if (!STAT_NAMES.includes(statName)) return;

                const raw = parseNumber(valueEl.textContent);
                const mod = parsePercent(modEl ? modEl.textContent : '0');
                if (Number.isNaN(raw)) return;

                const effective = raw * (1 + mod / 100);
                effectiveTotal += effective;
                foundStats += 1;

                let effEl = row.querySelector('.stez-eff');
                if (!effEl) {
                    effEl = document.createElement('span');
                    effEl.className = 'stez-eff';
                    labelEl.insertAdjacentElement('afterend', effEl);
                }

                if (mod > 0) {
                    effEl.className = 'stez-eff stez-eff-pos';
                } else if (mod < 0) {
                    effEl.className = 'stez-eff stez-eff-neg';
                } else {
                    effEl.className = 'stez-eff stez-eff-neutral';
                }

                effEl.textContent = `(Eff: ${formatNumber(effective)})`;
            } else if (totalSpan && totalSpan.textContent.trim() === 'Total') {
                const rawTotalEl = row.querySelector('.desc');
                const rawTotal = rawTotalEl ? parseNumber(rawTotalEl.textContent) : NaN;

                let totalEl = row.querySelector('.stez-eff-total');
                if (!totalEl && foundStats > 0) {
                    totalEl = document.createElement('span');
                    totalEl.className = 'stez-eff-total';
                    row.querySelector('.divider').appendChild(totalEl);
                }

                if (totalEl) {
                    totalEl.textContent = `Eff Total: ${formatNumber(effectiveTotal)}`;

                    if (!Number.isNaN(rawTotal)) {
                        if (effectiveTotal > rawTotal) {
                            totalEl.className = 'stez-eff-total stez-eff-pos';
                        } else if (effectiveTotal < rawTotal) {
                            totalEl.className = 'stez-eff-total stez-eff-neg';
                        } else {
                            totalEl.className = 'stez-eff-total stez-eff-neutral';
                        }
                    } else {
                        totalEl.className = 'stez-eff-total stez-eff-neutral';
                    }
                }
            }
        });

        return foundStats > 0;
    }

    function init() {
        injectStyles();

        let attempts = 0;
        const maxAttempts = 20;

        const timer = setInterval(() => {
            attempts += 1;
            const ok = run();
            if (ok || attempts >= maxAttempts) {
                clearInterval(timer);
            }
        }, 400);

        window.addEventListener('focus', () => {
            setTimeout(run, 250);
        }, { passive: true });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                setTimeout(run, 250);
            }
        }, { passive: true });
    }

    init();
})();