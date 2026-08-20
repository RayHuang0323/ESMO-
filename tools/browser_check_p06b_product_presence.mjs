#!/usr/bin/env node
/**
 * P0.6B browser product-presence gate.
 * Drives the real dashboard routes and the real profileStore module graph.
 */
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5359;
const CDP_PORT = 9379;
const APP = "http://localhost:" + VITE_PORT + "/ESMO-/";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let pass = 0;
let fail = 0;
const ck = (label, ok, detail = "") => {
  if (ok) pass += 1;
  else fail += 1;
  console.log((ok ? "PASS " : "FAIL ") + label + (detail ? " :: " + detail : ""));
};

const waitFor = async (chrome, expression, timeoutMs = 15_000) => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await chrome.evaluate("return Boolean(" + expression + ");")) return true;
    await wait(250);
  }
  return false;
};

const clickButton = async (chrome, predicate) => chrome.evaluate(
  "const button = [...document.querySelectorAll('button')].find(" + predicate.toString() + ");" +
  "if (!button) return false; button.click(); return true;"
);

const dashboard = async (chrome) => {
  await chrome.navigate(APP);
  await wait(600);
};

let dev = null;
let chrome = null;
try {
  dev = await startDevServer({ port: VITE_PORT });
  chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: true });
  await chrome.navigate(APP);
  await wait(900);
  await chrome.evaluate('localStorage.removeItem("esmo.profile.v1"); location.reload();');
  await waitFor(chrome, "document.readyState === 'complete'");
  await wait(900);

  const initial = await chrome.evaluate(
    "return { width: window.innerWidth, " +
    "developmentTile: [...document.querySelectorAll('button')].some((b) => b.innerText.includes('戰隊發展')), " +
    "talentPrimary: [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === '天賦') };"
  );
  ck("dashboard exposes 戰隊發展 primary product entry", initial.developmentTile && !initial.talentPrimary);

  ck("Team Development route opens in browser",
    await clickButton(chrome, (b) => b.innerText.includes("戰隊發展")) &&
    await waitFor(chrome, "document.querySelector('[data-testid=\"development-route-summary\"]')"));

  const upgradeOpened = await chrome.evaluate(
    "const card = document.querySelector('[data-development-node-id=\"general_training_flow\"]');" +
    "const button = card && card.querySelector('button'); if (!button) return false;" +
    "button.click(); return true;"
  );
  const upgradeConfirmed = upgradeOpened && await chrome.evaluate(
    "const card = document.querySelector('[data-development-node-id=\"general_training_flow\"]');" +
    "const buttons = card ? card.querySelectorAll('button') : []; if (buttons.length < 2) return false;" +
    "buttons[buttons.length - 2].click(); return true;"
  );
  await wait(450);
  const upgraded = await chrome.evaluate(
    "const raw = JSON.parse(localStorage.getItem('esmo.profile.v1') || '{}');" +
    "return { rank: raw.teamDevelopment?.ranks?.general_training_flow ?? 0, " +
    "effect: Boolean(document.querySelector('[data-development-current-effect=\"general_training_flow\"]')) };"
  );
  ck("Team Development can be upgraded through real UI",
    upgradeConfirmed && upgraded.rank === 1 && upgraded.effect);

  await chrome.reload();
  await waitFor(chrome, "document.readyState === 'complete'");
  const reopenedAfterReload = await clickButton(chrome, (b) => b.innerText.includes("戰隊發展")) &&
    await waitFor(chrome, "document.querySelector('[data-testid=\"development-route-summary\"]')");
  const reloadedDevelopment = await chrome.evaluate(
    "const raw = JSON.parse(localStorage.getItem('esmo.profile.v1') || '{}');" +
    "return { rank: raw.teamDevelopment?.ranks?.general_training_flow ?? 0, " +
    "effect: Boolean(document.querySelector('[data-development-current-effect=\"general_training_flow\"]')) };"
  );
  ck("Team Development upgrade survives browser reload",
    reopenedAfterReload && reloadedDevelopment.rank === 1 && reloadedDevelopment.effect,
    JSON.stringify({ reopenedAfterReload, ...reloadedDevelopment }));

  await chrome.evaluate("document.querySelector('button[aria-label]')?.click();");
  await waitFor(chrome, "document.querySelector('button') && !document.querySelector('[data-testid=\"development-route-summary\"]')");
  ck("Player Profile is reachable from the product dashboard",
    await clickButton(chrome, (b) => b.innerText.includes("選手")) &&
    await waitFor(chrome, "document.querySelector('[data-testid^=\"roster-player-\"]')"));
  const profileCardClicked = await chrome.evaluate("const card = document.querySelector('[data-testid^=\"roster-player-\"]'); card?.click(); return Boolean(card);");
  const fullProfileClicked = await clickButton(chrome, (b) => b.innerText.includes("開啟完整選手檔案"));
  const profileTabsReady = await waitFor(chrome, "document.querySelectorAll('[data-testid^=\"player-profile-tab-\"]').length === 4");
  const profileTabsInfo = await chrome.evaluate("return { count: document.querySelectorAll('[data-testid^=\"player-profile-tab-\"]').length, detail: Boolean(document.querySelector('[data-testid=\"player-profile-tabs\"]')) };");
  ck("Player Profile exposes four real tabs", profileCardClicked && fullProfileClicked && profileTabsReady && profileTabsInfo.count === 4, JSON.stringify({ fullProfileClicked, ...profileTabsInfo }));

  await dashboard(chrome);
  const competitionClicked = await clickButton(chrome, (b) => b.innerText.includes("賽事"));
  const competitionReady = await waitFor(chrome, "document.body.innerText.includes('積分榜') && document.body.innerText.includes('下一場賽事')");
  const competitionInfo = await chrome.evaluate("return { hasStandings: document.body.innerText.includes('積分榜'), hasNextMatch: document.body.innerText.includes('下一場賽事'), body: document.body.innerText.slice(0, 180) };");
  ck("Competition is reachable from the product dashboard", competitionClicked && competitionReady, JSON.stringify({ competitionClicked, ...competitionInfo }));

  await dashboard(chrome);
  const activeScript = RESOLVE_APP_MODULES + [
    "const CS = await import(B + '/src/platform/competition/seasonState.js');",
    "const st = () => profile.useProfileStore.getState();",
    "st().ensureCompetitionSeason();",
    "const fixtureToday = () => {",
    "  const state = st().competition;",
    "  const active = CS.activeCompetitionOf(state);",
    "  const ids = new Set(CS.fixturesOfCompetition(state, active?.id ?? null).map((f) => f.id));",
    "  return (st().competitionView().todayPending ?? []).find((f) => ids.has(f.id)) ?? null;",
    "};",
    "let fixture = fixtureToday();",
    "for (let i = 0; i < 60 && !fixture; i += 1) {",
    "  const pending = st().competitionView().todayPending ?? [];",
    "  if (pending.length) st().forfeitFixture(pending[0].id); else st().advanceDay(7);",
    "  fixture = fixtureToday();",
    "}",
    "if (!fixture) return { ok: false, reason: 'fixture_not_found' };",
    "const started = st().startFixtureMatch(fixture.id, 1000);",
    "if (!started.ok) return { ok: false, reason: started.errors?.[0]?.code ?? 'start_failed' };",
    "let now = 2000;",
    "for (let i = 0; i < 8; i += 1) {",
    "  st().pollMatchRoom(now);",
    "  if (st().matchmakingView(now).state === 'ready_check') break;",
    "  now += 1000;",
    "}",
    "const ready = st().confirmMatchReady(now + 1000);",
    "if (!ready.ok) return { ok: false, reason: ready.errors?.[0]?.code ?? 'ready_failed' };",
    "for (let i = 0; i < 12; i += 1) {",
    "  now += 1500; st().pollMatchRoom(now);",
    "  if (st().matchRoomView(now).state === 'confirmed') break;",
    "}",
    "const made = st().createMatchSession(now);",
    "const launched = made.ok ? st().launchMatchSession(now + 1) : made;",
    "if (!launched.ok) return { ok: false, reason: launched.errors?.[0]?.code ?? 'launch_failed' };",
    "const context = st().setActiveMatchContext({ phase: 'banpick' });",
    "return { ok: context.ok, matchId: st().activeMatchView()?.matchId ?? null, status: st().activeMatchView()?.status ?? null };",
  ].join("\n");
  const activeSetup = await chrome.evaluate(activeScript);
  ck("browser creates a real ActiveMatch.v1",
    activeSetup.ok && activeSetup.matchId && activeSetup.status === "active",
    activeSetup.reason ?? activeSetup.matchId ?? "");

  await chrome.reload();
  await waitFor(chrome, "document.querySelector('[data-testid=\"active-match-card\"]')");
  ck("ActiveMatch card survives browser reload", await chrome.evaluate(
    "return Boolean(document.querySelector('[data-testid=\"active-match-card\"]')) && " +
    "Boolean(document.querySelector('[data-testid=\"resume-active-match\"]'));"
  ));
  const resumed = await chrome.evaluate(
    "document.querySelector('[data-testid=\"resume-active-match\"]')?.click(); return true;"
  );
  ck("ActiveMatch resume returns to business route", resumed &&
    await waitFor(chrome, "document.querySelector('[data-testid=\"hero-picker\"]')"));

  for (const width of [390, 360]) {
    await chrome.send("Emulation.setDeviceMetricsOverride", {
      width, height: width === 390 ? 844 : 800, deviceScaleFactor: 1, mobile: true,
    });
    await dashboard(chrome);
    const mobile = await chrome.evaluate(
      "const root = document.querySelector('#root') ?? document.body;" +
      "const scrollers = [...root.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 1);" +
      "return { width: window.innerWidth, " +
      "development: [...document.querySelectorAll('button')].some((b) => b.innerText.includes('戰隊發展')), " +
      "active: Boolean(document.querySelector('[data-testid=\"active-match-card\"]')), overflow: scrollers.length };"
    );
    const overflowInfo = mobile.overflow ? await chrome.evaluate(
      "const root = document.querySelector('#root') ?? document.body;" +
      "return [...root.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => ({ tag: e.tagName, testid: e.dataset.testid || '', width: e.clientWidth, scrollWidth: e.scrollWidth, text: (e.innerText || '').slice(0, 50) }));"
    ) : [];
    ck("browser product presence at " + width + "px",
      mobile.width === width && mobile.development && mobile.active && mobile.overflow === 0,
      JSON.stringify({ ...mobile, overflowInfo }));
  }
} catch (error) {
  fail += 1;
  console.log("FAIL browser harness exception :: " + (error?.stack ?? error));
} finally {
  try { if (chrome) await chrome.close(); } catch (error) { console.error("Chrome cleanup: " + error.message); }
  try { if (dev) await dev.stop(); } catch (error) { console.error("Vite cleanup: " + error.message); }
}

console.log("P0.6B browser product-presence: " + pass + "/" + (pass + fail) + " " + (fail ? "FAIL" : "PASS"));
if (fail) process.exitCode = 1;
