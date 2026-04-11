// ==UserScript==
// @name         Torn Attack Button Safety Highlight (Browser + PDA)
// @namespace    torn.attack.safety
// @version      1.4.0
// @description  Highlights JOIN/JOIN FIGHT on the attack page and adds a safer click-confirm step for browser and TornPDA.
// @author       Mr_Stez / Ace
// @match        https://www.torn.com/page.php?sid=attack*
// @match        http://www.torn.com/page.php?sid=attack*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        makeStartFightGreen: true,
        requireJoinConfirm: true,
        joinConfirmWindowMs: 3500,
        fastIntervalMs: 120,
        fastModeDurationMs: 3500,
        slowIntervalMs: 900,
        useLightObserver: true
    };

    const HANDLED_ATTR = 'data-ace-safety-handled';
    const CONFIRM_UNTIL_ATTR = 'data-ace-confirm-until';
    const ORIG_STYLE_ATTR = 'data-ace-orig-style';

    let lastButton = null;
    let fastTimer = null;
    let slowTimer = null;
    let observer = null;

    function normaliseText(text) {
        return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function getButtonText(el) {
        if (!el) return '';
        return normaliseText(
            (el.textContent || '') + ' ' +
            (el.value || '') + ' ' +
            (el.getAttribute('aria-label') || '')
        );
    }

    function isVisible(el) {
        if (!el || !(el instanceof HTMLElement)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function isJoinText(text) {
        return text === 'join' || text === 'join fight';
    }

    function isStartFightText(text) {
        return text === 'start fight';
    }

    function saveOriginalStyle(button) {
        if (!button || button.hasAttribute(ORIG_STYLE_ATTR)) return;
        button.setAttribute(ORIG_STYLE_ATTR, button.getAttribute('style') || '');
    }

    function restoreOriginalStyle(button) {
        if (!button) return;
        const original = button.getAttribute(ORIG_STYLE_ATTR);
        if (original !== null) {
            if (original) {
                button.setAttribute('style', original);
            } else {
                button.removeAttribute('style');
            }
        } else {
            button.removeAttribute('style');
        }
    }

    function applyButtonStyle(button, bg, border, textColour) {
        if (!button) return;
        saveOriginalStyle(button);

        button.style.setProperty('background', bg, 'important');
        button.style.setProperty('background-image', 'none', 'important');
        button.style.setProperty('color', textColour, 'important');
        button.style.setProperty('border', `2px solid ${border}`, 'important');
        button.style.setProperty('box-shadow', '0 2px 8px rgba(0,0,0,0.28)', 'important');
        button.style.setProperty('font-weight', '700', 'important');
        button.style.setProperty('letter-spacing', '0.04em', 'important');
        button.style.setProperty('text-transform', 'uppercase', 'important');
    }

    function applyJoinDanger(button) {
        applyButtonStyle(button, '#c62828', '#ffb3b3', '#ffffff');
    }

    function applyJoinConfirm(button) {
        applyButtonStyle(button, '#ef6c00', '#ffd180', '#ffffff');
    }

    function applyStartFight(button) {
        restoreOriginalStyle(button);
        if (CONFIG.makeStartFightGreen) {
            applyButtonStyle(button, '#2e7d32', '#b9f6ca', '#ffffff');
        }
    }

    function clearOldButton(currentButton) {
        if (lastButton && lastButton !== currentButton && lastButton.isConnected) {
            restoreOriginalStyle(lastButton);
            const originalText = lastButton.getAttribute('data-ace-original-text');
            if (originalText) {
                lastButton.textContent = originalText;
                lastButton.removeAttribute('data-ace-original-text');
            }
        }
        lastButton = currentButton || null;
    }

    function maybeStoreOriginalText(button) {
        if (!button) return;
        if (!button.hasAttribute('data-ace-original-text')) {
            button.setAttribute('data-ace-original-text', button.textContent || '');
        }
    }

    function setConfirmText(button) {
        maybeStoreOriginalText(button);
        button.textContent = 'Confirm Join';
    }

    function restoreOriginalText(button) {
        if (!button) return;
        const originalText = button.getAttribute('data-ace-original-text');
        if (originalText) {
            button.textContent = originalText;
        }
    }

    function findActionButton() {
        const selectors = [
            'button.torn-btn',
            'button[type="submit"]',
            'button',
            'input[type="submit"]',
            'input[type="button"]',
            '[role="button"]',
            'a'
        ];

        for (const selector of selectors) {
            const nodes = document.querySelectorAll(selector);
            for (const node of nodes) {
                if (!isVisible(node)) continue;
                const text = getButtonText(node);
                if (isJoinText(text) || isStartFightText(text)) {
                    return node;
                }
            }
        }

        return null;
    }

    function attachJoinHandler(button) {
        if (!CONFIG.requireJoinConfirm) return;
        if (!button || button.getAttribute(HANDLED_ATTR) === '1') return;

        button.addEventListener('click', function (event) {
            const text = getButtonText(button);
            const now = Date.now();
            const confirmUntil = parseInt(button.getAttribute(CONFIRM_UNTIL_ATTR) || '0', 10);

            if (!isJoinText(text) && !(confirmUntil > now)) return;

            if (confirmUntil > now) {
                button.removeAttribute(CONFIRM_UNTIL_ATTR);
                restoreOriginalText(button);
                applyJoinDanger(button);
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const until = now + CONFIG.joinConfirmWindowMs;
            button.setAttribute(CONFIRM_UNTIL_ATTR, String(until));
            setConfirmText(button);
            applyJoinConfirm(button);

            if (navigator.vibrate) {
                navigator.vibrate(50);
            }

            setTimeout(() => {
                const current = parseInt(button.getAttribute(CONFIRM_UNTIL_ATTR) || '0', 10);
                if (current === until) {
                    button.removeAttribute(CONFIRM_UNTIL_ATTR);
                    restoreOriginalText(button);
                    applyJoinDanger(button);
                }
            }, CONFIG.joinConfirmWindowMs + 50);
        }, false);

        button.setAttribute(HANDLED_ATTR, '1');
    }

    function updateButton() {
        const button = findActionButton();
        clearOldButton(button);

        if (!button) return;

        const text = getButtonText(button);

        if (isJoinText(text)) {
            attachJoinHandler(button);

            const confirmUntil = parseInt(button.getAttribute(CONFIRM_UNTIL_ATTR) || '0', 10);
            if (confirmUntil > Date.now()) {
                setConfirmText(button);
                applyJoinConfirm(button);
            } else {
                restoreOriginalText(button);
                applyJoinDanger(button);
            }
            return;
        }

        if (isStartFightText(text)) {
            restoreOriginalText(button);
            applyStartFight(button);
        }
    }

    function scheduleUpdate() {
        window.requestAnimationFrame(updateButton);
    }

    function startFastThenSlowPolling() {
        scheduleUpdate();

        fastTimer = setInterval(scheduleUpdate, CONFIG.fastIntervalMs);

        setTimeout(() => {
            if (fastTimer) {
                clearInterval(fastTimer);
                fastTimer = null;
            }
            slowTimer = setInterval(scheduleUpdate, CONFIG.slowIntervalMs);
        }, CONFIG.fastModeDurationMs);
    }

    function startLightObserver() {
        if (!CONFIG.useLightObserver || !document.body || typeof MutationObserver === 'undefined') return;

        observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                    scheduleUpdate();
                    return;
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function init() {
        startFastThenSlowPolling();
        startLightObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();