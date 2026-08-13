#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_same_day_fixtures.mjs — 同一天多場賽事的**畫面**驗證
//
//  執行：`node tools/browser_check_same_day_fixtures.mjs`（自己起 vite／Chrome）。
//
//  ── 為什麼要一支畫面 gate ────────────────────────────────────────────────
//  `competitionView().todayPending` 早就把當天全部場次給出去了，但那只是資料。
//  上一輪就是因為只做到資料層、沒有人渲染它，導致「同一天多場」在正式站實測
//  只看得到一場——資料對、日曆阻擋也對，**玩家卻不知道還要打什麼**。
//  所以這件事必須由畫面來驗，Node 驗不到。
//
//  驗三件事：
//    ① 同一天兩場，賽事頁**兩場都列得出來**（不是只有第一場）
//    ② 有一場進行中時，那一場顯示「返回比賽」、另一場仍顯示「出賽」
//    ③ 按另一場的「出賽」⇒ 被 Store 擋下，而且**理由有顯示在畫面上**
//       （畫面不自己判規則，但必須把 Store 的拒絕理由讓玩家看見）
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5315;
const CDP_PORT = 9337;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };

//  在頁面裡把狀態擺成「今天兩場、其中一場進行中」
const SETUP = `
  ${RESOLVE_APP_MODULES}
  const season = await import(B + "/src/platform/competition/seasonState.js");
  const st = () => profile.useProfileStore.getState();

  st().startNewGame("standard");
  st().ensureCompetitionSeason();

  //  推進到玩家賽事日
  let today = null;
  for (let i = 0; i < 60 && !today; i++) {
    today = st().competitionView().today;
    if (!today) { const b = st().meta.days; st().advanceDay(7); if (st().meta.days === b) break; }
  }
  if (!today) throw new Error("找不到玩家賽程");

  //  把另一場玩家賽事搬到同一天
  const comp = st().competition;
  const second = comp.fixtures.find((f) => f.id !== today.id && season.isPlayerFixture(comp, f) && f.status === "scheduled");
  profile.useProfileStore.setState({
    competition: { ...comp, fixtures: comp.fixtures.map((f) => (f.id === second.id ? { ...f, day: today.day } : f)) },
  });
  st().save();
  return { today: today.id, second: second.id, pending: st().competitionView().todayPending.length };
`;

const LAUNCH_FIRST = `
  const { useProfileStore } = await import(
    (location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname) + "/src/platform/profileStore.js");
  const st = () => useProfileStore.getState();
  const T0 = 4000000;
  st().startFixtureMatch(${JSON.stringify("__FX__")}, T0);
  let u = T0 + 200;
  for (let i = 1; i <= 30 && st().matchmaking.room?.state === "waiting"; i++) { u = T0 + 200 + i * 500; st().pollMatchRoom(u); }
  st().confirmMatchReady(u + 10);
  for (let i = 1; i <= 30 && st().matchmaking.room?.state !== "confirmed"; i++) st().pollMatchRoom(u + 10 + i * 400);
  st().createMatchSession(u + 13000);
  const l = st().launchMatchSession(u + 13100);
  st().save();
  return { ok: l.ok, state: st().matchmaking.session?.state };
`;

//  導到賽事頁（沿用 q6 的做法：點 🏆 賽事 磚，確認到站再讀）
const GOTO_COMPETITION = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const on = () => /聯賽/.test(document.body.innerText) && /積分榜|今日賽事/.test(document.body.innerText);
  for (let i = 0; i < 14 && !on(); i++) {
    const tile = [...document.querySelectorAll("button")].find((b) => /🏆/.test(b.innerText) && /賽事/.test(b.innerText));
    if (tile) { tile.click(); await wait(1000); continue; }
    await wait(400);
  }
  return { arrived: on(), text: document.body.innerText.replace(/\\n/g, " | ").slice(0, 400) };
`;

async function main() {
  console.log("══ 同一天多場：畫面驗證 ══\n");
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
    ck("0) 擺好「同一天兩場」的狀態", setup.pending === 2, `${setup.today} / ${setup.second}`);

    await chrome.reload();
    const ui1 = await chrome.evaluate(GOTO_COMPETITION);
    ck("1) 進得了賽事頁", ui1.arrived, ui1.text.slice(0, 80));
    ck("2) **同一天兩場都列得出來**",
      /今天 · 2 場/.test(ui1.text) && (ui1.text.match(/VS/g) ?? []).length >= 2,
      ui1.text.match(/今天[^|]*/)?.[0] ?? "(找不到場數標示)");

    //  讓第一場進行中
    const lit = await chrome.evaluate(LAUNCH_FIRST.replace("__FX__", setup.today));
    ck("3) 第一場推到 launched session", lit.ok === true && lit.state === "launched", lit.state);

    await chrome.reload();
    const ui2 = await chrome.evaluate(GOTO_COMPETITION);
    const btns = await chrome.evaluate(`
      return [...document.querySelectorAll("button")].map((b) => b.innerText.trim()).filter(Boolean);
    `);
    ck("4) 進行中那一場顯示「返回比賽」，另一場仍是「出賽」",
      btns.some((t) => /返回比賽/.test(t)) && btns.some((t) => /^⚔️ 出賽$/.test(t)),
      btns.filter((t) => /出賽|返回/.test(t)).join(" / "));

    //  按另一場的「出賽」⇒ 應被擋，且理由要顯示出來
    const refused = await chrome.evaluate(`
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const b = [...document.querySelectorAll("button")].find((x) => /^⚔️ 出賽$/.test(x.innerText.trim()));
      if (!b) return { clicked: false };
      b.click();
      await wait(900);
      const t = document.body.innerText;
      return { clicked: true, refused: /請先打完或放棄那一場/.test(t), snippet: (t.match(/你有一場[^|\\n]*/) ?? [""])[0] };
    `);
    ck("5) **按另一場的「出賽」被擋下，且理由顯示在畫面上**",
      refused.clicked && refused.refused, refused.snippet || "(畫面上找不到理由)");

    ck("6) 全程無未捕捉例外", chrome.pageErrors.length === 0,
      chrome.pageErrors.slice(0, 2).join(" | ") || "(無)");
  } finally {
    await chrome.close();
    server.stop();
  }
  console.log(`\n${pass}/${pass + fail} 通過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\n💥 ${e.message}`); process.exit(1); });
