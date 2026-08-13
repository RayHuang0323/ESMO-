#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_career_final_ui.mjs — 生涯成績**畫面**驗證（Q7a-3f.1）
//
//  執行：`node tools/browser_check_career_final_ui.mjs`（自己起 vite／Chrome）。
//
//  ── 為什麼一定要畫面 gate ────────────────────────────────────────────────
//  3f 量到的阻擋是**畫面**上的：多 Event 時 `state.final` 是 SeasonSeal，
//  賽季結算頁會渲染「第 undefined 名」。Node 驗證器驗得到資料層，
//  **驗不到那個 undefined 有沒有真的從畫面上消失**。
//
//  驗三種情境：
//    ① 單 Event（legacy）：名次與冠軍照舊顯示
//    ② 多 Event：`state.final` 仍是 SeasonSeal，但畫面顯示**官方聯賽**的名次
//    ③ 指不到生涯賽事：顯示「—」，不 crash、不出現 undefined
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5325;
const CDP_PORT = 9347;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };

const PRELUDE = `
  ${RESOLVE_APP_MODULES}
  const SS = await import(B + "/src/platform/competition/seasonState.js");
  const AC = await import(B + "/src/platform/competition/asiaCircuit.js");
  const st = () => profile.useProfileStore.getState();
  const finish = () => {
    for (let i = 0; i < 500; i++) {
      const v = st().competitionView();
      if (v.final) return;
      const pend = v.todayPending || [];
      if (pend.length) { for (const f of pend) st().forfeitFixture(f.id); continue; }
      const b = st().meta.days; st().advanceDay(7); if (st().meta.days === b) return;
    }
  };
`;

const SETUP_SINGLE = `
  ${PRELUDE}
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  finish();
  st().save();
  const c = st().competition;
  const career = SS.tryCareerFinalStandingsOf(c);
  return { seasonSchema: c.final && c.final.schema, careerEventId: c.careerEventId,
           rank: career && career.playerRank, teams: career && career.rows.length,
           champion: (c.competitions[SS.activeCompetitionOf(c).id].stage.participants
             .find((p) => p.id === (career && career.championTeamId)) || {}).name };
`;

const SETUP_MULTI = `
  ${PRELUDE}
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  const r = AC.applyAsiaCircuit(st().competition, { playerTeam: st().team, seasonSeed: st().meta.seasonSeed });
  profile.useProfileStore.setState({ competition: r.state });
  finish();
  st().save();
  const c = st().competition;
  const career = SS.tryCareerFinalStandingsOf(c);
  return { seasonSchema: c.final && c.final.schema, careerEventId: c.careerEventId,
           events: Object.keys(c.events).length,
           rank: career && career.playerRank, teams: career && career.rows.length,
           champion: (c.competitions[SS.activeCompetitionOf(c).id].stage.participants
             .find((p) => p.id === (career && career.championTeamId)) || {}).name };
`;

/** 把指標拿掉（模擬回填不了的舊多 Event 存檔）。 */
const SETUP_NO_POINTER = `
  ${PRELUDE}
  profile.useProfileStore.setState({ competition: { ...st().competition, careerEventId: null } });
  st().save();
  return { careerEventId: st().competition.careerEventId,
           career: SS.tryCareerFinalStandingsOf(st().competition) };
`;

const GOTO = `
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
  return {
    arrived: on(),
    hasPanel: body.includes("最終名次 FINAL STANDINGS"),
    panel,
    hist: (body.split("歷屆成績 HISTORY")[1] || "").slice(0, 300),
    //  ⚠ **結構化**讀出名次欄位的實際文字：抓「你的最終名次」後面第一個非空行。
    //    這才是本檔的核心證據。
    //    ⚠ 不能只掃全頁有沒有 undefined——React 把 undefined 渲染成**空白**，
    //      不是字串。實測過：把畫面改回直讀 final.playerRank，全頁掃描照樣綠
    //      （名次那格只是變成空的），連「包含 — 」也照樣綠（獎金那列有一個）。
    rankText: (() => {
      const lines = (panel || "").split(String.fromCharCode(10)).map((x) => x.trim());
      const i = lines.findIndex((x) => x.includes("你的最終名次"));
      if (i < 0) return null;
      return lines.slice(i + 1).find((x) => x.length > 0) ?? "";
    })(),
    //  仍然保留：模板字串內插（例如歷屆成績那行「我 第 N 名」）真的會印出 undefined
    hasUndefined: /undefined|NaN/.test(body),
  };
`;

console.log("══ Q7a-3f.1：生涯成績畫面 ══\n");
const dev = await startDevServer({ port: VITE_PORT });
//  ⚠ Q7a-3f.2：**旗標狀態寫進網址，不吃預設值**。
//    asiaCircuit 預設已經翻成開啟（新賽季含亞洲巡迴賽三站）。本檔的情境是
//    自己組出來的，巡迴賽對它只是雜訊——不明確關掉的話，測的就不是原本那件事。
const APP = dev.url + "?asiaCircuit=0";
const chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: HEADLESS });
try {
  await chrome.navigate(APP);
  await new Promise((r) => setTimeout(r, 3500));

  // ── ① 單 Event（legacy）────────────────────────────────────────────
  const one = await chrome.evaluate(SETUP_SINGLE);
  ck("0) 單 Event：賽季封存是 FinalStandings、有生涯指標",
    one.seasonSchema === "FinalStandings.v1" && !!one.careerEventId,
    `我第 ${one.rank} 名`);
  await chrome.reload();
  await new Promise((r) => setTimeout(r, 3500));
  const uiOne = await chrome.evaluate(GOTO);
  ck("1) **legacy 畫面照舊**：名次欄位就是那個名次，冠軍也對",
    uiOne.hasPanel && uiOne.rankText === String(one.rank) &&
    uiOne.panel.includes(`／ ${one.teams} 隊`) && uiOne.panel.includes(one.champion),
    `名次欄位「${uiOne.rankText}」· ${one.champion}`);
  ck("1b) **頁面沒有 undefined / NaN**", !uiOne.hasUndefined);

  // ── ② 多 Event ──────────────────────────────────────────────────────
  const many = await chrome.evaluate(SETUP_MULTI);
  ck("2) 多 Event：**`state.final` 仍是 `SeasonSeal.v1`**（Season-level 語意未動）",
    many.seasonSchema === "SeasonSeal.v1" && many.events === 4, many.seasonSchema);
  ck("2b) 生涯指標指向官方聯賽，名次取得到",
    !!many.careerEventId && typeof many.rank === "number", `我第 ${many.rank} 名`);
  await chrome.reload();
  await new Promise((r) => setTimeout(r, 3500));
  const uiMany = await chrome.evaluate(GOTO);
  ck("3) **多 Event 的名次欄位就是官方聯賽的名次**（不是空白、不是別的數字）",
    uiMany.hasPanel && uiMany.rankText === String(many.rank) &&
    uiMany.panel.includes(`／ ${many.teams} 隊`) && uiMany.panel.includes(many.champion),
    `名次欄位「${uiMany.rankText}」· ${many.champion}`);
  ck("4) **整頁沒有 undefined / NaN**（3f 量到的那個阻擋消失了）",
    !uiMany.hasUndefined);

  // ── ③ 指不到生涯賽事 ────────────────────────────────────────────────
  const none = await chrome.evaluate(SETUP_NO_POINTER);
  ck("5) 資料層：指標拿掉後 optional accessor 回 null（不猜其他 Event）",
    none.careerEventId === null && none.career === null);
  await chrome.reload();
  await new Promise((r) => setTimeout(r, 3500));
  const uiNone = await chrome.evaluate(GOTO);
  ck("6) **名次欄位顯示「—」與說明**（不是空白，也不是 undefined）",
    uiNone.hasPanel && uiNone.rankText === "—" &&
    uiNone.panel.includes("生涯主要賽事尚無資料"), uiNone.panel.slice(0, 60).replace(/\n/g, " | "));
  ck("7) **仍然沒有 undefined / NaN**", !uiNone.hasUndefined);
  ck("8) **沒有 crash**（賽事頁仍然到得了）", uiNone.arrived);
  ck("9) **全程無未捕捉例外**", chrome.pageErrors.length === 0,
    chrome.pageErrors.slice(0, 3).join(" | ") || "(無)");
} finally {
  await chrome.close();
  await dev.stop();
}
console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
