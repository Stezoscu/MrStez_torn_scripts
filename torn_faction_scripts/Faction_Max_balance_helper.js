// ==UserScript==
// @name         Torn Faction Controls - Max Balance Button
// @namespace    https://synyega.com/torn
// @version      1.0
// @updateURL    https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_faction_scripts/Faction_Max_balance_helper.js
// @downloadURL  https://raw.githubusercontent.com/Stezoscu/MrStez_torn_scripts/refs/heads/main/torn_faction_scripts/Faction_Max_balance_helper.js
// @author       MrStez
// @description  Adds a "Max" button that fills the Amount box with the selected member's total balance on the faction controls page.
// @match        https://www.torn.com/factions.php*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // Only run on the target area (URL hash changes without full reload, so we also observe later)
  const isTarget = () =>
    location.pathname.includes("/factions.php") &&
    (location.search.includes("step=your") || location.href.includes("step=your")) &&
    location.href.includes("type=1") &&
    location.href.includes("#/tab=controls");

  // ---------- helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const parseMoney = (txt) => {
    // Handles: "$1,234,567", "1,234,567", "£" etc.
    const m = (txt || "").match(/([\d]{1,3}(?:[, ]\d{3})+|\d+)(?:\.\d+)?/);
    if (!m) return null;
    return m[0].replace(/[ ,]/g, "");
  };

  const setNativeValue = (el, value) => {
    // React/controlled inputs need native setter + input event
    const valueSetter = Object.getOwnPropertyDescriptor(el.__proto__, "value")?.set;
    const prototype = Object.getPrototypeOf(el);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    (valueSetter || prototypeValueSetter).call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const findAmountInput = () => {
    // Try common patterns first
    const candidates = [
      'input[name="amount"]',
      'input[placeholder*="Amount" i]',
      'input[aria-label*="Amount" i]',
    ];

    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.type !== "hidden") return el;
    }

    // Fallback: find a label containing "Amount" and grab nearby input
    const labels = [...document.querySelectorAll("label, div, span, p")];
    const amountLabel = labels.find((n) => /amount/i.test(n.textContent || ""));
    if (amountLabel) {
      const nearbyInput =
        amountLabel.closest("div")?.querySelector("input") ||
        amountLabel.parentElement?.querySelector("input") ||
        amountLabel.nextElementSibling?.querySelector?.("input");
      if (nearbyInput) return nearbyInput;
    }

    // Last resort: any visible text/number input in the controls area
    const inputs = [...document.querySelectorAll('input[type="text"], input[type="number"]')].filter(
      (i) => i.offsetParent !== null
    );
    // Heuristic: amount inputs are often the second box (name then amount)
    return inputs.length ? inputs[inputs.length - 1] : null;
  };

  const findBalanceValueText = () => {
    // We look for something that *mentions* balance and has a money number in it.
    // This is intentionally flexible.
    const nodes = [...document.querySelectorAll("div, span, p, li")].filter(
      (n) => n.offsetParent !== null
    );

    // Prefer nodes with "total" + "balance"
    const preferred = nodes.filter((n) => /total/i.test(n.textContent || "") && /balance/i.test(n.textContent || ""));
    for (const n of preferred) {
      const v = parseMoney(n.textContent);
      if (v) return v;
    }

    // Otherwise anything with "balance"
    const balanceNodes = nodes.filter((n) => /balance/i.test(n.textContent || ""));
    for (const n of balanceNodes) {
      const v = parseMoney(n.textContent);
      if (v) return v;
    }

    return null;
  };

  const findSendButton = () => {
    // Optional: you can also auto-focus or auto-send; for now we only fill
    const btns = [...document.querySelectorAll('button, a[role="button"]')].filter(
      (b) => b.offsetParent !== null
    );
    return btns.find((b) => /send/i.test(b.textContent || ""));
  };

  // ---------- UI injection ----------
  const ensureMaxButton = () => {
    const amountInput = findAmountInput();
    if (!amountInput) return;

    // Already added?
    if (amountInput.dataset.maxBtnAttached === "1") return;
    amountInput.dataset.maxBtnAttached = "1";

    // Create button
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Max";
    btn.style.marginLeft = "8px";
    btn.style.padding = "6px 10px";
    btn.style.borderRadius = "6px";
    btn.style.cursor = "pointer";
    btn.style.fontWeight = "600";

    // Try to insert right next to the input
    const container = amountInput.parentElement;
    container?.appendChild(btn);

    const updateEnabledState = () => {
      const balance = findBalanceValueText();
      btn.disabled = !balance;
      btn.style.opacity = btn.disabled ? "0.5" : "1";
      btn.title = btn.disabled ? "Select a member first (balance not detected yet)" : "Fill amount with max balance";
    };

    btn.addEventListener("click", () => {
      const balance = findBalanceValueText();
      if (!balance) {
        updateEnabledState();
        return;
      }
      setNativeValue(amountInput, balance);
      amountInput.focus();
    });

    // Keep enabled state fresh
    updateEnabledState();
    const interval = setInterval(updateEnabledState, 1000);

    // Clean up if input disappears (tab switch)
    const cleanupObserver = new MutationObserver(() => {
      if (!document.body.contains(amountInput)) {
        clearInterval(interval);
        cleanupObserver.disconnect();
      }
    });
    cleanupObserver.observe(document.body, { childList: true, subtree: true });
  };

  // ---------- routing / observers ----------
  const boot = async () => {
    // Wait for the app to render
    for (let i = 0; i < 30; i++) {
      if (isTarget()) break;
      await sleep(250);
    }

    // Observe DOM changes so we can inject when the controls tab renders
    const obs = new MutationObserver(() => {
      if (!isTarget()) return;
      ensureMaxButton();
    });

    obs.observe(document.body, { childList: true, subtree: true });

    // Also check on hash changes (SPA routing)
    window.addEventListener("hashchange", () => {
      if (isTarget()) ensureMaxButton();
    });

    // Initial attempt
    if (isTarget()) ensureMaxButton();
  };

  boot();
})();