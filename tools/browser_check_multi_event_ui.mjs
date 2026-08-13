#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_multi_event_ui.mjs — 同季多 Event 的**畫面**驗證（3b.5）
//
//  執行：`node tools/browser_check_multi_event_ui.mjs`（自己起 vite／Chrome）。
//
//  ── 為什麼要一支畫面 gate ────────────────────────────────────────────────
//  3b 讓資料層支援同季多賽事，但畫面只呈現聚焦的那一個——玩家看不到第二個
//  Event。那個落差前一輪在同日多場已經發生過一次（資料對、畫面沒跟上），
//  所以這次補 UI 就必須由畫面來驗，Node 驗不到。
//
//  驗四件事：
//    ① 兩個 Event 都在畫面上列得出來，各自帶狀態（已封存／進行中／未開始）
//    ② 點另一張卡 ⇒ **積分榜跟著換**（8 隊聯賽 ↔ 2 隊盃賽）
//    ③ 切換**不影響規則**：主賽制、封存判定在切換前後逐值不變
//    ④ legacy 單 Event **不出現切換列**（畫面維持現況）
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5316;
const CDP_PORT = 9338;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };

//  在頁面裡合成第二個 Event（與 Node 驗證器同一套做法）
const SETUP = `
  ${RESOLVE_APP_MODULES}
  const SS = await import(B + "/src/platform/competition/seasonState.js");
  const C  = await import(B + "/src/platform/contracts/circuit.js");
  const CC = await import(B + "/src/platform/contracts/competition.js");
  const st = () => profile.useProfileStore.getState();

  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  const base = st().competition;
  const all = SS.activeStageOf(base).participants;
  const me = all.find((p) => p.id === base.playerTeamId) ?? all[0];
  const other = all.find((p) => p.id !== me.id);
  const parts = [me, other];

  const circuit = C.createCircuit({ gameMode: "moba", season: base.season, circuitKey: "cup" }).circuit;
  const event = C.createEvent({ circuit, eventKey: "spring-cup", tier: "cup" }).event;
  const c0 = CC.createCompetition({ gameMode: "moba", season: base.season, organizerId: "cup", tier: "cup" }).competition;
  const comp = { ...c0, id: C.competitionIdForEvent(event, "cup"), eventId: event.id, circuitId: circuit.id, idScheme: "event-v2" };
  const stage = CC.createStage({ competition: comp, format: CC.STAGE_FORMATS.round_robin,
    participants: parts, dayRange: { from: 1, to: 3 }, key: "cup", legs: 1 }).stage;
  const fx = CC.createFixture({ stage, round: 1, day: 2, sideA: parts[0].id, sideB: parts[1].id }).fixture;

  profile.useProfileStore.setState({ competition: {
    ...base,
    circuits: { ...base.circuits, [circuit.id]: { ...circuit, eventIds: [event.id] } },
    events: { ...base.events, [event.id]: { ...event, competitionIds: [comp.id],
      rankingCompetitionId: comp.id, prizePolicy: null, final: null } },
    competitions: { ...base.competitions, [comp.id]: {
      competition: { ...comp, stageIds: [stage.id] }, stage, playoff: null, expectsPlayoff: false } },
    fixtures: [...base.fixtures, fx],
  } });
  st().save();
  window.__IDS = { league: base.activeEventId, cup: event.id };
  return { events: Object.keys(st().competition.events).length, ...window.__IDS };
`;

const GOTO = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  //  ⚠ 到站判斷**不能靠標題**：3b.5 之後頁首會跟著聚焦的 Event 改名，
  //    寫死「聯賽」會在切換後判成沒到站（本檔第一版就這樣紅過）。
  //    改用這一頁必然存在、且與聚焦無關的區塊。
  const on = () => /積分榜 STANDINGS/.test(document.body.innerText);
  for (let i = 0; i < 14 && !on(); i++) {
    const tile = [...document.querySelectorAll("button")].find((b) => /🏆/.test(b.innerText) && /賽事/.test(b.innerText));
    if (tile) { tile.click(); await wait(1000); continue; }
    await wait(400);
  }
  return { arrived: on(), text: document.body.innerText.replace(/\\n/g, " | ") };
`;

const RULE_SNAPSHOT = `
  const B2 = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;
  const S = await import(B2 + "/src/platform/competition/seasonState.js");
  const p = await import(B2 + "/src/platform/profileStore.js");
  const c = p.useProfileStore.getState().competition;
  return JSON.stringify({
    primary: S.activeEntryOf(c).competition.id,
    standings: S.seasonStandings(c).rows.length,
    sealable: S.sealableEventIds(c),
    canSeason: S.canSealSeason(c).ok,
  });
`;

async function main() {
  console.log("══ 同季多 Event：畫面驗證 ══\n");
  const server = await startDevServer({ port: VITE_PORT });
//  ⚠ Q7a-3f.2：**旗標狀態寫進網址，不吃預設值**。
//    asiaCircuit 預設已經翻成開啟（新賽季含亞洲巡迴賽三站）。本檔的情境是
//    自己組出來的，巡迴賽對它只是雜訊——不明確關掉的話，測的就不是原本那件事。
const APP = server.url + "?asiaCircuit=0";
  const chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: HEADLESS });
  try {
    await chrome.navigate(APP);
    await chrome.evaluate(`localStorage.clear(); return true;`);
    await chrome.reload();

    const setup = await chrome.evaluate(SETUP);
    ck("0) 擺好「同季兩個 Event」的狀態", setup.events === 2, `${setup.league} ＋ ${setup.cup}`);

    await chrome.reload();
    const ui = await chrome.evaluate(GOTO);
    ck("1) 進得了賽事頁", ui.arrived);
    ck("2) **兩個 Event 都列在畫面上**，且看得到狀態",
      /本季賽事 EVENTS/.test(ui.text) && /2 項/.test(ui.text) && /未開始/.test(ui.text),
      (ui.text.match(/本季賽事 EVENTS[^|]*(\\|[^|]*){0,8}/) ?? [""])[0].slice(0, 110));

    const before = await chrome.evaluate(RULE_SNAPSHOT);
    const rowsBefore = await chrome.evaluate(`
      const t = document.body.innerText;
      const m = t.match(/積分榜[\\s\\S]*/);
      return (m ? m[0].match(/\\n/g) ?? [] : []).length;
    `);

    //  點第二張卡（盃賽）
    const clicked = await chrome.evaluate(`
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const cards = [...document.querySelectorAll("button")].filter((b) => /未開始|進行中|已封存/.test(b.innerText));
      const cup = cards.find((b) => /cup|盃/i.test(b.innerText)) ?? cards[1];
      if (!cup) return { clicked: false, cards: cards.length };
      cup.click(); await wait(1000);
      const p = await import((location.pathname.endsWith("/") ? location.pathname.slice(0,-1) : location.pathname) + "/src/platform/profileStore.js");
      return { clicked: true, cards: cards.length,
               active: p.useProfileStore.getState().competition.activeEventId,
               rows: p.useProfileStore.getState().competitionView().standings.rows.length };
    `);
    ck("3) 點得到第二張卡，聚焦真的換過去", clicked.clicked && clicked.active === setup.cup,
      `找到 ${clicked.cards} 張卡`);
    ck("4) **積分榜跟著換**（聯賽 8 隊 → 盃賽 2 隊）", clicked.rows === 2, `${clicked.rows} 列`);

    const after = await chrome.evaluate(RULE_SNAPSHOT);
    ck("5) **切換不影響規則**（主賽制／封存判定逐值不變）", before === after, before);

    //  legacy：單一 Event 不該出現切換列
    await chrome.evaluate(`
      const B2 = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;
      const p = await import(B2 + "/src/platform/profileStore.js");
      p.useProfileStore.getState().startNewGame("standard");
      p.useProfileStore.getState().ensureCompetitionSeason();
      p.useProfileStore.getState().save();
      return true;
    `);
    await chrome.reload();
    const legacyUi = await chrome.evaluate(GOTO);
    ck("6) **legacy 單 Event 不出現切換列**（畫面維持現況）",
      legacyUi.arrived && !/本季賽事 EVENTS/.test(legacyUi.text));

    ck("7) 全程無未捕捉例外", chrome.pageErrors.length === 0,
      chrome.pageErrors.slice(0, 2).join(" | ") || "(無)");
  } finally {
    await chrome.close();
    server.stop();
  }
  console.log(`\n${pass}/${pass + fail} 通過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\n💥 ${e.message}`); process.exit(1); });
