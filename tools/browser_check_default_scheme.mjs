#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_default_scheme.mjs — 預設新制的畫面驗證（Q7a-3f.2）
//
//  執行：`node tools/browser_check_default_scheme.mjs`（自己起 vite／Chrome）。
//
//  ── 為什麼需要這一支 ────────────────────────────────────────────────────
//  `asiaCircuit` 預設翻成開啟之後，其他 browser gate 為了守住各自的情境，
//  全部把 `?asiaCircuit=0` 寫進網址。那是對的——但結果是**沒有任何 gate
//  在走玩家真正會走的那條路（不帶參數）**。這一支專門補那條。
//
//  驗五件事：
//    ① **不帶參數**開新局 ⇒ 140 場、4 個賽事，官方聯賽仍然 56 場
//    ② 畫面上巡迴積分區塊出現，而且**沒有 undefined／NaN、沒有例外**
//    ③ 整季打完 ⇒ 生涯名次顯示得出來（不是空白）
//    ④ **`?asiaCircuit=0` 仍然建得出舊制新局**（逃生口）
//    ⑤ 舊制存檔在預設（新制）下重載 ⇒ **逐 id 不變**，換季後才進新制
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5327;
const CDP_PORT = 9349;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PRELUDE = `
  ${RESOLVE_APP_MODULES}
  const SS = await import(B + "/src/platform/competition/seasonState.js");
  const st = () => profile.useProfileStore.getState();
  const shape = () => {
    const c = st().competition;
    return {
      search: location.search,
      fixtures: c.fixtures.length,
      events: Object.keys(c.events).length,
      league: SS.fixturesOfCompetition(c, SS.activeCompetitionOf(c).id).length,
      careerEventId: c.careerEventId,
      ids: c.fixtures.map((f) => f.id).join(","),
      season: c.season,
    };
  };
`;

const NEW_GAME = `
  ${PRELUDE}
  localStorage.clear();
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  st().save();
  return shape();
`;

const RELOAD_SHAPE = `${PRELUDE} return shape();`;

const FINISH_AND_ROLL = `
  ${PRELUDE}
  for (let i = 0; i < 600; i++) {
    const v = st().competitionView();
    if (v.final) break;
    const pend = v.todayPending || [];
    if (pend.length) { for (const f of pend) st().forfeitFixture(f.id); continue; }
    const b = st().meta.days; st().advanceDay(7); if (st().meta.days === b) break;
  }
  const career = SS.tryCareerFinalStandingsOf(st().competition);
  const sealedSchema = st().competition.final && st().competition.final.schema;
  const rolled = st().rollToNextCompetitionSeason();
  st().save();
  return { sealedSchema, careerRank: career && career.playerRank,
           rolledOk: !!rolled.ok, after: shape() };
`;

const READ_UI = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const on = () => /積分榜 STANDINGS/.test(document.body.innerText);
  for (let i = 0; i < 18 && !on(); i++) {
    const tile = [...document.querySelectorAll("button")].find((b) => /🏆/.test(b.innerText) && /賽事/.test(b.innerText));
    if (tile) { tile.click(); await wait(900); continue; }
    await wait(400);
  }
  await wait(700);
  const body = document.body.innerText;
  const panel = (body.split("最終名次 FINAL STANDINGS")[1] || "").split("歷屆")[0];
  const lines = (panel || "").split(String.fromCharCode(10)).map((x) => x.trim());
  const i = lines.findIndex((x) => x.includes("你的最終名次"));
  return {
    arrived: on(),
    hasCircuitPanel: body.includes("巡迴積分 CIRCUIT POINTS"),
    rankText: i < 0 ? null : (lines.slice(i + 1).find((x) => x.length > 0) ?? ""),
    hasUndefined: /undefined|NaN/.test(body),
  };
`;

console.log("══ Q7a-3f.2：預設新制的畫面 ══\n");
const dev = await startDevServer({ port: VITE_PORT });
//  ⚠ **刻意不帶參數**——這一支要驗的就是玩家不做任何事時看到的東西。
const chrome = await launchChrome({ url: dev.url, port: CDP_PORT, headless: HEADLESS });
try {
  await chrome.navigate(dev.url);
  await wait(4000);

  // ── ① 預設新局 ──────────────────────────────────────────────────────
  const def = await chrome.evaluate(NEW_GAME);
  ck("0) 網址真的沒有帶旗標參數（走的是預設值）", def.search === "", `search="${def.search}"`);
  ck("1) **預設新局 140 場、4 個賽事**", def.fixtures === 140 && def.events === 4,
    `${def.fixtures} 場 / ${def.events} 賽事`);
  ck("2) **官方聯賽仍然 56 場**", def.league === 56, `${def.league} 場`);
  ck("3) 預設新局有 careerEventId", !!def.careerEventId, def.careerEventId);

  await chrome.reload();
  await wait(4000);
  const ui = await chrome.evaluate(READ_UI);
  ck("4) 畫面到得了，而且**巡迴積分區塊出現**", ui.arrived && ui.hasCircuitPanel);
  ck("5) **沒有 undefined / NaN**", !ui.hasUndefined);

  // ── ② 整季打完 → 生涯名次 → 換季 ────────────────────────────────────
  const done = await chrome.evaluate(FINISH_AND_ROLL);
  ck("6) 整季封存：多 Event ⇒ **`state.final` 是 `SeasonSeal.v1`**",
    done.sealedSchema === "SeasonSeal.v1", done.sealedSchema);
  ck("7) 生涯名次仍然取得到", typeof done.careerRank === "number", `第 ${done.careerRank} 名`);
  ck("8) **換季後新賽季照樣是新制**（140 場、4 個賽事、聯賽 56 場）",
    done.rolledOk && done.after.fixtures === 140 && done.after.events === 4 &&
    done.after.league === 56 && done.after.season === 2,
    `第 ${done.after.season} 季 / ${done.after.fixtures} 場`);

  // ── ③ 逃生口 ────────────────────────────────────────────────────────
  await chrome.navigate(dev.url + "?asiaCircuit=0");
  await wait(4000);
  const off = await chrome.evaluate(NEW_GAME);
  ck("9) **`?asiaCircuit=0` 仍然建得出舊制新局**（56 場、1 個賽事）",
    off.fixtures === 56 && off.events === 1, `${off.fixtures} 場 / ${off.events} 賽事`);
  const uiOff = await (async () => { await chrome.reload(); await wait(4000); return chrome.evaluate(READ_UI); })();
  ck("10) 舊制畫面**看不到巡迴積分區塊**、也沒有 undefined",
    uiOff.arrived && !uiOff.hasCircuitPanel && !uiOff.hasUndefined);

  // ── ④ 舊制存檔在預設（新制）下重載：逐 id 不變 ──────────────────────
  const beforeIds = off.ids;
  await chrome.navigate(dev.url);           // 回到預設（新制）
  await wait(4500);
  const after = await chrome.evaluate(RELOAD_SHAPE);
  ck("11) **舊制存檔在預設下重載：場次數與賽事數不變**",
    after.fixtures === 56 && after.events === 1, `${after.fixtures} 場 / ${after.events} 賽事`);
  ck("12) **每一個 fixture id 逐字未變**（沒有被 retroactively 注入）",
    after.ids === beforeIds);
  const uiLegacy = await chrome.evaluate(READ_UI);
  ck("13) 舊制存檔在預設下的畫面仍然乾淨（無巡迴區塊、無 undefined）",
    uiLegacy.arrived && !uiLegacy.hasCircuitPanel && !uiLegacy.hasUndefined);

  ck("14) **全程無未捕捉例外**", chrome.pageErrors.length === 0,
    chrome.pageErrors.slice(0, 3).join(" | ") || "(無)");
} finally {
  await chrome.close();
  await dev.stop();
}
console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
