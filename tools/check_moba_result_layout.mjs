#!/usr/bin/env node
/**
 * Focused regression gate for the MOBA battle/result viewport.
 *
 * It drives the real GameView through a debug battle, feeds the live snapshot
 * through the real useBattleFeed terminal boundary, and checks that the
 * result's own scroll container keeps both the banner and final action
 * reachable at the required viewport sizes. This avoids making layout
 * verification depend on the time required to simulate a complete match.
 *
 * Usage:
 *   node tools/check_moba_result_layout.mjs
 *   node tools/check_moba_result_layout.mjs --url https://.../ESMO-/
 */
import { launchChrome, startDevServer } from "./browser/cdp.mjs";

const VITE_PORT = 5361;
const CDP_PORT = 9381;
const suppliedUrl = process.argv.find((arg) => arg.startsWith("--url="))?.slice(6) ?? null;
const requestedViewport = process.argv.find((arg) => arg.startsWith("--viewport="))?.slice(11) ?? null;
const productionMode = Boolean(suppliedUrl);
const APP = (suppliedUrl ?? `http://localhost:${VITE_PORT}/ESMO-/`).replace(/\/?$/, "/");
const allViewports = [
  { label: "desktop-1920x1080", width: 1920, height: 1080, mobile: false },
  { label: "desktop-1366x768", width: 1366, height: 768, mobile: false },
  { label: "mobile-390x844", width: 390, height: 844, mobile: true },
  { label: "mobile-390x640", width: 390, height: 640, mobile: true },
];
const viewports = requestedViewport ? allViewports.filter(({ label }) => label === requestedViewport) : allViewports;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (chrome, expression, timeoutMs, what) => {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await chrome.evaluate(`return Boolean(${expression});`)) return true;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`${what} timeout${lastError ? `: ${lastError.message}` : ""}`);
};

let pass = 0;
let fail = 0;
const failures = [];
const ck = (label, ok, detail = "") => {
  if (ok) pass += 1;
  else {
    fail += 1;
    failures.push({ label, detail });
  }
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
};

const battleUrl = (viewport) =>
  `${APP}?debug=moba-runtime-battle&result-layout=${viewport.label}`;

const clearIsolatedState = async (chrome) => {
  await chrome.evaluate(
    "localStorage.removeItem('esmo.profile.v1'); sessionStorage.clear(); return true;"
  );
};

const enterTerminalBoundary = (chrome) => chrome.evaluate(`
  const resourceUrl = (name) => performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .find((url) => url.endsWith('/src/' + name)) ??
    new URL('/src/' + name, location.origin).href;
  const storeUrl = resourceUrl('useGameStore.js');
  const { useGameStore } = await import(storeUrl);
  const current = useGameStore.getState().snapshot;
  if (!current || !Array.isArray(current.players) || current.players.length < 10) {
    return { ok: false, reason: 'live_snapshot_not_ready' };
  }
  const terminal = {
    ...current,
    ts: Math.max(1, Number(current.ts) || 0) + 1,
    over: true,
    winner: current.winner === 'red' ? 'red' : 'blue',
  };
  useGameStore.getState().pushFrame(terminal);
  return { ok: true, ts: terminal.ts, winner: terminal.winner, players: terminal.players.length, storeUrl };
`);

const pauseBattle = (chrome) => chrome.evaluate(`
  const button = document.querySelector('[data-testid="leave-active-match"]');
  if (!button) return false;
  button.click();
  return true;
`);

const readLiveSnapshot = (chrome) => chrome.evaluate(`
  const resourceUrl = (name) => performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .find((url) => url.includes('/src/' + name)) ??
    new URL('/src/' + name, location.origin).href;
  const { useGameStore } = await import(resourceUrl('useGameStore.js'));
  const state = useGameStore.getState();
  return {
    ts: Number(state.snapshot?.ts) || 0,
    over: Boolean(state.snapshot?.over),
    players: state.snapshot?.players?.length ?? 0,
  };
`);

const useProductionBattleHeight = (chrome) => chrome.evaluate(`
  const node = document.querySelector('[data-runtime-battle] > div > div');
  if (!node) return { ok: false };
  const height = Math.min(window.innerHeight * 0.82, 720);
  node.style.setProperty('height', height + 'px', 'important');
  node.style.setProperty('max-height', height + 'px', 'important');
  node.style.setProperty('border-radius', '14px', 'important');
  return { ok: true, height };
`);

const inspectLayout = (chrome) => chrome.evaluate(`
  const overlay = document.querySelector('[data-testid="battle-end-screen"]');
  const continueButton = document.querySelector('[data-testid="battle-result-continue"]');
  const root = document.querySelector('#root') ?? document.documentElement;
  const rect = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
  };
  const style = overlay ? getComputedStyle(overlay) : null;
  const overlayRect = rect(overlay);
  if (overlay) overlay.scrollTop = 0;
  const bannerBeforeScroll = rect([...((overlay?.children ?? []))].find((node) => node.tagName !== 'STYLE'));
  const topContentReachable = Boolean(overlayRect && bannerBeforeScroll &&
    bannerBeforeScroll.bottom > overlayRect.top && bannerBeforeScroll.top < overlayRect.bottom);
  const beforeButtonRect = rect(continueButton);
  if (overlay) overlay.scrollTop = overlay.scrollHeight;
  const afterButtonRect = rect(continueButton);
  const bottomReached = Boolean(overlay && overlay.scrollTop + overlay.clientHeight >= overlay.scrollHeight - 1);
  const visibleInOverlay = Boolean(overlayRect && afterButtonRect &&
    afterButtonRect.bottom > overlayRect.top && afterButtonRect.top < overlayRect.bottom &&
    afterButtonRect.right > overlayRect.left && afterButtonRect.left < overlayRect.right);
  const fixedSticky = [...document.querySelectorAll('*')]
    .filter((node) => ['fixed', 'sticky'].includes(getComputedStyle(node).position))
    .filter((node) => !node.matches('[data-runtime-battle]') && !node.closest('[data-testid="battle-end-screen"]'))
    .filter((node) => {
      if (!overlay) return false;
      const r = node.getBoundingClientRect();
      return r.bottom > overlayRect.top && r.top < overlayRect.bottom && r.right > overlayRect.left && r.left < overlayRect.right;
    })
    .map((node) => ({ tag: node.tagName, testid: node.dataset.testid || '', text: (node.innerText || '').trim().slice(0, 60) }));
  const horizontalOverflow = Boolean(overlay && overlay.scrollWidth > overlay.clientWidth + 1);
  const documentOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
  const horizontalNodes = overlay ? [...overlay.querySelectorAll('*')]
    .filter((node) => node.scrollWidth > node.clientWidth + 1 || node.getBoundingClientRect().right > overlayRect.right + 1 || node.getBoundingClientRect().left < overlayRect.left - 1)
    .slice(0, 12)
    .map((node) => ({ tag: node.tagName, testid: node.dataset.testid || '', text: (node.innerText || '').trim().slice(0, 50), clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, rect: rect(node) })) : [];
  const rootRect = rect(root);
  const contentChildren = [...(overlay?.children ?? [])]
    .filter((node) => node.tagName !== 'STYLE')
    .map((node) => ({
      tag: node.tagName,
      text: (node.innerText || '').trim().slice(0, 40),
      rect: rect(node),
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
    }));
  return {
    overlay: overlayRect,
    overlayClientHeight: overlay?.clientHeight ?? null,
    overlayScrollHeight: overlay?.scrollHeight ?? null,
    overlayScrollTop: overlay?.scrollTop ?? null,
    overflowY: style?.overflowY ?? null,
    boxSizing: style?.boxSizing ?? null,
    position: style?.position ?? null,
    justifyContent: style?.justifyContent ?? null,
    beforeButton: beforeButtonRect,
    bannerBeforeScroll,
    topContentReachable,
    afterButton: afterButtonRect,
    continueButtonPresent: Boolean(continueButton),
    visibleInOverlay,
    bottomReached,
    horizontalOverflow,
    overlayClientWidth: overlay?.clientWidth ?? null,
    overlayScrollWidth: overlay?.scrollWidth ?? null,
    horizontalNodes,
    documentOverflow,
    fixedSticky,
    contentChildren,
    root: rootRect,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  };
`);

let dev = null;
let chrome = null;
const reports = [];
try {
  if (!suppliedUrl) dev = await startDevServer({ port: VITE_PORT });
  chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: true });

  for (const viewport of viewports) {
    const consoleStart = chrome.consoleLines.length;
    const pageErrorStart = chrome.pageErrors.length;
    await chrome.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    });
    await chrome.navigate(battleUrl(viewport));
    await clearIsolatedState(chrome);
    await chrome.reload();
    await waitFor(chrome, "document.querySelector('canvas')", 30_000, `${viewport.label} Canvas`);
    await waitFor(chrome, "document.querySelector('[data-testid=\\\"quick-finish-match\\\"]')", 30_000, `${viewport.label} battle controls`);
    await sleep(2_000);
    const productionFrame = await useProductionBattleHeight(chrome);
    const liveSnapshot = productionMode ? { ts: null, over: false, players: null } : await readLiveSnapshot(chrome);

    const battleState = await chrome.evaluate(`return {
      canvas: document.querySelectorAll('canvas').length,
      hud: Boolean(document.querySelector('[data-testid="battle-hud"]')),
      resultBeforeFinish: Boolean(document.querySelector('[data-testid="battle-end-screen"]')),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };`);
    battleState.simTs = liveSnapshot.ts;
    battleState.productionFrame = productionFrame;
    ck(`${viewport.label} battle layer mounts`, battleState.canvas > 0 && battleState.hud && !battleState.resultBeforeFinish && (productionMode || liveSnapshot.ts > 0),
      JSON.stringify({ ...battleState, liveSnapshot }));

    if (productionMode) {
      const clicked = await chrome.evaluate(`
        window.confirm = () => true;
        const button = document.querySelector('[data-testid="quick-finish-match"]');
        if (!button || button.disabled) return false;
        button.click();
        return true;
      `);
      ck(`${viewport.label} production real quick-finish enters transition`, clicked);
    } else {
      const paused = await pauseBattle(chrome);
      ck(`${viewport.label} battle pause boundary is available`, paused);
      await sleep(250);
      const terminal = await enterTerminalBoundary(chrome);
      ck(`${viewport.label} live battle snapshot enters terminal boundary`, terminal.ok, JSON.stringify(terminal));
    }
    try {
      await waitFor(chrome,
        "document.querySelector('[data-testid=\\\"battle-end-screen\\\"]')",
        productionMode ? 420_000 : 15_000,
        `${viewport.label} result overlay`
      );
    } catch (error) {
      const diagnostic = productionMode ? await chrome.evaluate(`return {
        body: (document.body.innerText || '').slice(-500),
        url: location.href,
      };`).catch((diagnosticError) => ({ diagnosticError: diagnosticError.message })) : await chrome.evaluate(`
        const resourceUrl = (name) => performance.getEntriesByType('resource')
          .map((entry) => entry.name)
          .find((url) => url.endsWith('/src/' + name)) ??
          new URL('/src/' + name, location.origin).href;
        const storeUrl = resourceUrl('useGameStore.js');
        const battleStoreUrl = resourceUrl('battle/battleStore.js');
        const [{ useGameStore }, { useBattleStore }] = await Promise.all([
          import(storeUrl),
          import(battleStoreUrl),
        ]);
        return {
          storeUrl,
          resourceUrls: performance.getEntriesByType('resource').map((entry) => entry.name)
            .filter((url) => url.includes('useGameStore') || url.includes('battleStore')),
          hudOver: useGameStore.getState().hud?.over ?? null,
          snapshotOver: useGameStore.getState().snapshot?.over ?? null,
          result: Boolean(useBattleStore.getState().result),
          body: (document.body.innerText || '').slice(-300),
        };
      `).catch((diagnosticError) => ({ diagnosticError: diagnosticError.message }));
      ck(`${viewport.label} result overlay renders`, false,
        `${error.message}; diagnostic=${JSON.stringify(diagnostic)}; console=${JSON.stringify(chrome.consoleLines.slice(consoleStart))}; page=${JSON.stringify(chrome.pageErrors.slice(pageErrorStart))}`);
      continue;
    }
    await waitFor(chrome, "document.body.innerText.includes('戰報摘要')", 5_000, `${viewport.label} result content phase`);
    await sleep(300);
    const layout = await inspectLayout(chrome);
    reports.push({ viewport: viewport.label, battleState, layout });
    const appErrors = chrome.consoleLines.slice(consoleStart).filter((line) => line.startsWith("[error]"));
    const pageErrors = chrome.pageErrors.slice(pageErrorStart);
    ck(`${viewport.label} result overlay renders`, Boolean(layout.overlay));
    ck(`${viewport.label} overlay owns vertical scrolling`, ["auto", "scroll"].includes(layout.overflowY) && layout.overlayScrollHeight >= layout.overlayClientHeight,
      JSON.stringify({ overflowY: layout.overflowY, client: layout.overlayClientHeight, scroll: layout.overlayScrollHeight, children: layout.contentChildren }));
    ck(`${viewport.label} overlay uses border-box bounds`, layout.boxSizing === "border-box" && layout.position === "absolute");
    ck(`${viewport.label} result banner starts inside viewport`, Boolean(layout.overlay && layout.overlay.top >= -1 && layout.overlay.bottom <= viewport.height + 1),
      JSON.stringify(layout.overlay));
    ck(`${viewport.label} result banner reachable at top`, layout.topContentReachable,
      JSON.stringify(layout.bannerBeforeScroll));
    ck(`${viewport.label} result bottom content reachable after scroll`, layout.bottomReached &&
      (!layout.continueButtonPresent || layout.visibleInOverlay),
      JSON.stringify({ continueButtonPresent: layout.continueButtonPresent, before: layout.beforeButton, after: layout.afterButton, scrollTop: layout.overlayScrollTop, bottomReached: layout.bottomReached }));
    ck(`${viewport.label} no result horizontal overflow`, !layout.horizontalOverflow && !layout.documentOverflow,
      JSON.stringify({ overlay: layout.horizontalOverflow, document: layout.documentOverflow, client: layout.overlayClientWidth, scroll: layout.overlayScrollWidth, nodes: layout.horizontalNodes }));
    ck(`${viewport.label} no fixed/sticky result blocker`, layout.fixedSticky.length === 0, JSON.stringify(layout.fixedSticky));
    ck(`${viewport.label} console app errors = 0`, appErrors.length === 0 && pageErrors.length === 0,
      JSON.stringify({ console: appErrors, page: pageErrors }));
  }
} catch (error) {
  ck("focused browser harness completes", false, error?.stack ?? String(error));
} finally {
  try { if (chrome) await chrome.close(); } catch (error) { console.error(`Chrome cleanup: ${error.message}`); }
  try { if (dev) await dev.stop(); } catch (error) { console.error(`Vite cleanup: ${error.message}`); }
}

ck("at least one required viewport exercised a scrollable result", reports.some(({ layout }) => layout.overlayScrollHeight > layout.overlayClientHeight + 1),
  JSON.stringify(reports.map(({ viewport, layout }) => ({ viewport, client: layout.overlayClientHeight, scroll: layout.overlayScrollHeight }))));

console.log(`MOBA result layout focused: ${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
if (fail) {
  console.log(`Failures: ${JSON.stringify(failures)}`);
  process.exitCode = 1;
}
