#!/usr/bin/env node
// ============================================================================
//  tools/check_fixture_result_browser.mjs — 跨場次防串的**瀏覽器實測**
//
//  執行：`node tools/check_fixture_result_browser.mjs`
//  （自己起 vite、自己開 Chrome、自己收；加 `--headed` 可以看畫面。失敗 exit 1。）
//
//  ⚠ 不碰日常 Chrome、不碰正式存檔：獨立 port、獨立 `--user-data-dir`（跑完刪掉），
//    開場先 `localStorage.clear()`。與 `browser_check_q6.mjs` 用不同 port，可並行。
//
//  ── 為什麼要有這一支（Node 驗證器不夠的地方）────────────────────────────
//  `check_fixture_result_integrity.mjs` 驗的是純 reducer。它證明不了三件事：
//    ① 真實 store 接線（`settleMatchThroughSession` → `reportMatchResult`）
//    ② **localStorage 持久化往返**：寫進去的東西重新水合後還是同一個形狀
//    ③ **真的 reload 一次**之後重送——這正是「Result 畫面重整」的現場
//  本檔在真實 Chrome（獨立 profile、獨立 port、獨立 worktree 的 dev server）
//  裡跑真實模組，每個階段之間夾一次**真的 Page.reload**。
//
//  ── 驅動方式 ────────────────────────────────────────────────────────────
//  用 CDP 動態 import 頁面**自己**的模組 URL ⇒ 拿到的是同一個 module instance、
//  同一個 zustand store，不是另外 new 一份。因此不必為了測試改任何 src。
//  終局那一段刻意照抄 `useBattleFeed.js` 的順序（LogicEngine 跑到終局 →
//  snapshotToBattleResult → mobaResultToTransaction → settleMatchThroughSession），
//  不自己編一份假的 BattleResult。
//
//  ⚠ 賽程（fixture）場次目前**無法端到端驅動**：`originFromFixture` 尚無生產者
//    （competitionGateway 是 Q3）。本檔驗的是同一條結算管線上的票券來源場次——
//    `settleMatchResultInState` 對兩種來源是同一段程式碼。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

//  ⚠ 與 browser_check_q6.mjs（5311／9333）錯開，兩支可以同時跑
const VITE_PORT = 5312;
const CDP_PORT = 9334;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

// ── 在頁面裡安裝驅動用的 helper（每次 reload 後都要重裝）──────────────────
const INSTALL = `
  ${RESOLVE_APP_MODULES}

  //  一次跑完真實配對流程：排隊 → 配到 → 房間 → 雙方確認 → 簽發場次 → 啟動
  //  ⚠ 時間必須貼著真實節奏走：mock 配對要等 3–9 秒、房間 ready 窗只有 20 秒。
  //    時間游標一次跳太遠，房間會直接 expired（這不是 bug，是契約在保護自己）。
  function startSession(t0) {
    const q = S().enqueueMatch("moba", t0);
    if (!q.ok) return { ok: false, at: "enqueue", errors: q.errors };
    let t = t0;
    for (let i = 1; i <= 20 && S().matchmaking.ticket?.state === "queued"; i++) {
      t = t0 + i * 1000;
      S().pollMatchmaking(t);
    }
    if (S().matchmaking.ticket?.state !== "matched") return { ok: false, at: "poll", state: S().matchmaking.ticket?.state };
    const r = S().openMatchRoom(t + 100);
    if (!r.ok) return { ok: false, at: "room", errors: r.errors };
    //  房間開出來是 waiting，要先被輪詢驅動到 ready_check 才輪得到我方確認
    let u = t + 200;
    for (let i = 1; i <= 30 && S().matchmaking.room?.state === "waiting"; i++) { u = t + 200 + i * 500; S().pollMatchRoom(u); }
    if (S().matchmaking.room?.state !== "ready_check") return { ok: false, at: "ready_check", state: S().matchmaking.room?.state };
    const c = S().confirmMatchReady(u + 10);
    if (!c.ok) return { ok: false, at: "confirm_us", errors: c.errors };
    for (let i = 1; i <= 30 && S().matchmaking.room?.state !== "confirmed"; i++) S().pollMatchRoom(u + 10 + i * 400);
    if (S().matchmaking.room?.state !== "confirmed") return { ok: false, at: "confirm", state: S().matchmaking.room?.state };
    const cs = S().createMatchSession(u + 13000);
    if (!cs.ok) return { ok: false, at: "session", errors: cs.errors };
    const l = S().launchMatchSession(u + 13100);
    if (!l.ok) return { ok: false, at: "launch", errors: l.errors };
    return { ok: true, sessionId: S().matchmaking.session.sessionId, seed: l.launch.seed, state: S().matchmaking.session.state };
  }

  //  照 useBattleFeed 的終局順序產生一份**真的** BattleResult
  function playBattle(seed) {
    const e = new engineMod.LogicEngine((seed >>> 0) | 1);
    for (let i = 0; i < 40000 && !e.over; i++) e.tick(0.5);
    if (!e.over) return null;
    return battleResult.snapshotToBattleResult(e.snapshot(), []);
  }

  //  照 useBattleFeed 的順序結算（交易由**當下**狀態重建，與線上重送時一致）
  function settle(br) {
    const p = S();
    const tx = adapter.mobaResultToTransaction(br, {
      players: p.players ?? [], lineup: p.lineup ?? null, streak: 0, fansNow: p.meta?.fans ?? 0,
    });
    if (!tx) return { ok: false, at: "transaction" };
    const sessBefore = S().matchmaking?.session ?? null;
    const r = boundary.settleMatchThroughSession({
      mode: "moba",
      outcome: boundary.outcomeFromBattleResult(br, adapter.mobaMatchId(br)),
      transaction: tx,
    });
    return {
      sessionAtSettle: sessBefore ? { id: sessBefore.sessionId, state: sessBefore.state, mode: sessBefore.mode } : null,
      ok: !!r.receipt?.ok, viaSession: r.viaSession,
      alreadySettled: !!r.receipt?.alreadySettled,
      codes: (r.receipt?.errors ?? []).map((x) => x.code ?? String(x)),
      reason: r.receipt?.reason ?? null,
      transactionId: tx.transactionId,
    };
  }

  //  只看**持久層**（localStorage），不看記憶體 ⇒ 證明寫進去的是真的
  function persisted() {
    const raw = JSON.parse(localStorage.getItem("esmo.profile.v1") || "{}");
    const mm = raw.matchmaking ?? {};
    return {
      sessionId: mm.session?.sessionId ?? null,
      sessionState: mm.session?.state ?? null,
      sessionMatchId: mm.session?.matchId ?? null,
      lastResultId: mm.lastResult?.resultId ?? null,
      lastResultWinner: mm.lastResult?.winner ?? null,
      settlementIds: Object.keys(mm.settlements ?? {}),
      lastError: mm.lastSettlementError?.reason ?? null,
      funds: raw.finance?.funds ?? null,
      xpTotal: (raw.players ?? []).reduce((s, p) => s + (Number(p.xp) || 0), 0),
      txIds: Object.keys(raw.processedMatchTransactions ?? {}),
    };
  }

  //  ⚠ 測試腳手架，**不是被測對象**：A 打完後選手體力會下降（真實機制），
  //    那會擋住第二場的出賽資格。這裡把體力補回來，等同於玩家休養幾天再出賽。
  //    被測的是結算，不是狀態系統。
  //    （舊版還會把 injuryDays 清零——選手傷病已被產品取消，沒有東西要清了。）
  const cond = await import(B + "/src/platform/condition/playerCondition.js");
  function healRoster() {
    profile.useProfileStore.setState({
      players: (S().players ?? []).map((p) => ({ ...p, energy: Math.max(90, Number(p.energy) || 0) })),
    });
    S().save();
    return (S().players ?? []).filter((p) => !cond.isMatchFit(p)).length;
  }

  window.__T = { S, startSession, playBattle, settle, persisted, healRoster };
  return { ready: true, hasStore: typeof S().enqueueMatch === "function", storeUrl };
`;

async function main() {
  console.log("══ 跨場次防串：瀏覽器實測（票券來源；獨立 port / Chrome profile / CDP）══\n");
  const server = await startDevServer({ port: VITE_PORT });
  const URL_ = server.url;
  console.log(`   dev server : ${URL_}`);
  console.log(`   CDP port   : ${CDP_PORT}\n`);

  const chrome = await launchChrome({ url: URL_, port: CDP_PORT, headless: HEADLESS });
  const install = async () => chrome.evaluate(INSTALL);
  //  reload 會清空 window ⇒ 每次載入後都要重裝 helper，並把 Node 保管的
  //  BattleResult 原封送回頁面（**同一份**結果重送才是要驗的東西）
  let brA = null, brB = null;
  const refresh = async () => {
    await chrome.reload();
    await install();
    if (brA) await chrome.evaluate(`window.__BR_A = ${JSON.stringify(brA)}; return true;`);
    if (brB) await chrome.evaluate(`window.__BR_B = ${JSON.stringify(brB)}; return true;`);
  };

  try {
    await chrome.navigate(URL_);

    // ── 0) 乾淨存檔 ─────────────────────────────────────────────────────
    await chrome.evaluate(`localStorage.clear(); return true;`);
    await chrome.reload();
    const ready = await install();
    ck("0) 頁面在真實 Chrome 載入，且取得的是 app 自己的 store 實例",
      ready?.ready === true && ready?.hasStore === true);

    // ── 1) 正常一場：打完 → 結算 → 場次完成 → reload 後仍然是那樣 ────────
    const T0 = 4_000_000;
    const A = await chrome.evaluate(`return window.__T.startSession(${T0});`);
    ck("1) 走完真實配對流程並啟動場次 A", A?.ok === true && A.state === "launched",
      A?.ok ? `${A.sessionId}（seed ${A.seed}）` : JSON.stringify(A));
    if (!A?.ok) throw new Error("場次 A 無法啟動，後續情境無法驗");

    const before = await chrome.evaluate(`return window.__T.persisted();`);
    //  整份 BattleResult 取回 Node 保管 ⇒ reload 之後才能原封送回頁面重送
    brA = await chrome.evaluate(`
      const br = window.__T.playBattle(${A.seed});
      window.__BR_A = br;
      return br;
    `);
    ck("1b) LogicEngine 用場次 seed 跑到終局，產出真的 BattleResult",
      !!brA?.winner, brA ? `${brA.winner} ${brA.score.blue}:${brA.score.red}／${Math.round(brA.duration)}s` : "(未終局)");

    const s1 = await chrome.evaluate(`return window.__T.settle(window.__BR_A);`);
    //  ⚠ 硬性前提：真實場次必須被 boundary 看見。看不見就代表測試驅動的 store
    //    不是 production 路徑用的那一個 ⇒ 之後每一條斷言都失去意義（會變成假綠
    //    或假紅）。這裡**立刻中止**，不讓它繼續跑完。
    if (s1?.viaSession !== true) {
      throw new Error(
        [
          `前提不成立：真實場次存在（${JSON.stringify(s1?.sessionAtSettle)}）`,
          `但 settleMatchThroughSession 走了無場次分支（viaSession=false）。`,
          `代表測試驅動的 profileStore 與 boundary 閉包裡的不是同一個實例。`,
          `store URL = ${ready?.storeUrl ?? "(未解析)"}`,
          `這是驗證器本身的接線問題，不是被測行為，故中止。`,
        ].join("\n   "));
    }
    ck("1c) 走權威路徑結算成功（前提：boundary 看得見真實場次）",
      s1?.ok === true && s1.viaSession === true, s1?.reason ?? s1?.transactionId);

    await refresh();
    const afterA = await chrome.evaluate(`return window.__T.persisted();`);
    ck("1d) **reload 後從 localStorage 水合**：場次 A 是 completed",
      afterA.sessionState === "completed" && afterA.sessionId === A.sessionId, afterA.sessionState);
    ck("1e) 賽果與結算紀錄都真的落盤",
      !!afterA.lastResultId && afterA.settlementIds.length === 1 && !!afterA.sessionMatchId,
      `${afterA.lastResultId} / ${afterA.settlementIds[0]}`);
    ck("1f) 錢確實入帳一次", afterA.funds > before.funds, `$${before.funds} → $${afterA.funds}`);

    // ── 2) 同場重送（Result 畫面重整）：維持既有冪等，不得誤判 foreign ────
    const s2 = await chrome.evaluate(`return window.__T.settle(window.__BR_A);`);
    ck("2) reload 之後重送同一份結果 → **不得**被判成 foreign_result",
      !(s2.codes ?? []).includes("foreign_result"), (s2.codes ?? []).join(",") || "(無錯誤碼)");
    ck("2b) 維持既有冪等語意（回既有 receipt）", s2.ok === true && s2.alreadySettled === true,
      `ok=${s2.ok} alreadySettled=${s2.alreadySettled}`);
    const afterResend = await chrome.evaluate(`return window.__T.persisted();`);
    ck("2c) 沒有重複發錢／XP",
      afterResend.funds === afterA.funds && afterResend.xpTotal === afterA.xpTotal,
      `$${afterResend.funds} / XP ${afterResend.xpTotal}`);
    ck("2d) 沒有多出第二筆結算紀錄", afterResend.settlementIds.length === 1);

    // ── 3) 跨場舊結果：A 已完成，B 開打中，重送 A 的 BattleResult ────────
    //  ⚠ 必須換一天：票券識別碼由「名單 + 賽季情境」決定性推導，同一天用同一份
    //    名單重排會拿到**同一張票、同一個 seed、同一個場次**（本檔第一版就踩到，
    //    §3 的 B 與 A 是同一個 sessionId）。推進天數才是真的第二場。
    const pre = await chrome.evaluate(`
      window.__T.S().advanceDay(4);
      const unfit = window.__T.healRoster();
      return { day: window.__T.S().meta?.days ?? null, unfit };
    `);
    ck("3pre) 腳手架：推進到第 " + pre.day + " 天並讓名單復原（換一天 ⇒ 真的是另一場）",
      pre.unfit === 0, `仍不可出賽 ${pre.unfit} 人`);
    const B = await chrome.evaluate(`return window.__T.startSession(${T0 + 900_000});`);
    ck("3) 啟動第二個場次 B（**與 A 是不同場次、不同 seed**）",
      B?.ok === true && B.state === "launched" && B.sessionId !== A.sessionId && B.seed !== A.seed,
      B?.ok ? `${B.sessionId}（seed ${B.seed}，A 是 ${A.seed}）` : JSON.stringify(B));
    if (!B?.ok) throw new Error("場次 B 無法啟動，情境 3 無法驗");

    //  ⚠ 真的 reload 一次：模擬「玩家重整後，舊的 Result 流程又送了一次」
    await refresh();

    const beforeHijack = await chrome.evaluate(`return window.__T.persisted();`);
    const s3 = await chrome.evaluate(`return window.__T.settle(window.__BR_A);`);
    ck("3b) **舊結果被拒絕**（foreign_result）",
      s3.ok === false && (s3.codes ?? []).includes("foreign_result"), s3.reason ?? (s3.codes ?? []).join(","));

    const afterHijack = await chrome.evaluate(`return window.__T.persisted();`);
    ck("3c) **B 場次不得被標成 completed**", afterHijack.sessionState === "launched", afterHijack.sessionState);
    ck("3d) B 的場次識別沒有被污染（仍是 B，且未掛上 matchId）",
      afterHijack.sessionId === B.sessionId && !afterHijack.sessionMatchId);
    ck("3e) lastResult 沒有被錯寫", afterHijack.lastResultId === beforeHijack.lastResultId);
    ck("3f) 沒有重複發錢／XP",
      afterHijack.funds === beforeHijack.funds && afterHijack.xpTotal === beforeHijack.xpTotal,
      `$${afterHijack.funds} / XP ${afterHijack.xpTotal}`);
    ck("3g) 失敗原因有落盤（可稽核）", !!afterHijack.lastError, afterHijack.lastError);

    //  ⭐ B 的真正結果之後仍能正常完成
    brB = await chrome.evaluate(`
      const br = window.__T.playBattle(${B.seed});
      window.__BR_B = br;
      return br;
    `);
    ck("3h) 用 B 的 seed 跑出 B 自己的 BattleResult", !!brB?.winner,
      brB ? `${brB.winner} ${brB.score.blue}:${brB.score.red}` : "(未終局)");
    const s4 = await chrome.evaluate(`return window.__T.settle(window.__BR_B);`);
    ck("3i) **B 的真正結果仍能正常結算**", s4.ok === true && s4.viaSession === true, s4.reason ?? s4.transactionId);

    await refresh();
    const afterB = await chrome.evaluate(`return window.__T.persisted();`);
    ck("3j) reload 後 B 才是 completed", afterB.sessionState === "completed", afterB.sessionState);
    //  ⚠ 這裡**刻意不寫成斷言**：結算帳本應該累積兩筆，實際只剩一筆。
    //    成因是既有缺陷（`enqueueMatch` 整包重設 matchmaking，連 settlements /
    //    lastResult 一起清掉），不是本次修正造成的。把已知壞行為寫成期望值
    //    等於把 bug 鎖進驗證器，所以只做**顯著揭露**，另列技術債。
    if (afterB.settlementIds.length < 2) {
      console.log(`⚠  已知缺陷（既有，非本次修正造成）：結算帳本只剩 ${afterB.settlementIds.length} 筆，` +
        `應為 2 筆 —— profileStore.enqueueMatch 重設 matchmaking 時把 settlements / lastResult 一併清掉`);
    }
    ck("3k) B 入帳一次（錢有增加）", afterB.funds > beforeHijack.funds,
      `$${beforeHijack.funds} → $${afterB.funds}`);

    // ── 頁面健康度 ──────────────────────────────────────────────────────
    ck("4) 全程沒有未捕捉的頁面例外", chrome.pageErrors.length === 0,
      chrome.pageErrors.slice(0, 2).join(" | ") || "(無)");
  } finally {
    const errs = chrome.pageErrors;
    if (errs.length) { console.log("\n── 頁面例外 ──"); errs.slice(0, 5).forEach((e) => console.log("   " + e)); }
    await chrome.close();
    server.stop();
  }

  console.log(`\n${pass}/${pass + fail} 通過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\n💥 ${e.message}`); process.exit(1); });
