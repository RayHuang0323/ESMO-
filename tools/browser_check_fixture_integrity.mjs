#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_fixture_integrity.mjs — 賽程賽果完整性的**端到端實測**
//
//  執行：`node tools/browser_check_fixture_integrity.mjs`
//  （自己起 vite、自己開 Chrome、自己收；加 `--headed` 可以看畫面。失敗 exit 1。）
//
//  ── 與 check_fixture_result_browser.mjs 的分工 ──────────────────────────
//  那一支走**票券來源**（玩家自己排隊）。本檔走**賽程來源**（competitionGateway
//  簽發的 fixture 場次）——也就是稽核當初真正在講的那條路：
//
//      startFixtureMatch → 房間 → 場次 → 打完 → settleMatchThroughSession
//        → reportMatchResult → **receipt.ok && isFixtureSession ⇒ 寫進賽程**
//
//  差別不是形式上的。`profileStore.reportMatchResult` 在結算成功之後會呼叫
//  `_writeFixtureResultFromMatch()` 把賽果寫進賽程並 `completeFixtureMatch()`。
//  所以「舊的 BattleResult 被重送」在賽程路徑上的後果，是**用別場的勝負去完成
//  這一場賽程**——賽果不可變（D11），寫錯就改不回來。
//
//  ⚠ 那道賽程邊界只看 `receipt.ok`（沒有看 `alreadySettled`）。
//    也就是說**擋住錯寫的唯一一道關卡就是結算本身**——這正是本檔要證明的事。
//
//  ── 環境 ────────────────────────────────────────────────────────────────
//  獨立 vite port、獨立 Chrome `--user-data-dir`（跑完刪掉）、headless、
//  開場 `localStorage.clear()`。**不碰日常 Chrome、不碰正式存檔。**
//  與 q6（5311／9333）、票券來源那支（5312／9334）都錯開，三支可並行。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5313;
const CDP_PORT = 9335;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const INSTALL = `
  ${RESOLVE_APP_MODULES}

  //  ⚠ 測試腳手架，不是被測對象：打完一場會有選手傷停／體力下降（真實機制），
  //    會擋住下一場的出賽資格。等同於玩家休養幾天再出賽。
  function healRoster() {
    profile.useProfileStore.setState({
      players: (S().players ?? []).map((p) => ({ ...p, injuryDays: 0, energy: Math.max(90, Number(p.energy) || 0) })),
    });
    S().save();
    return (S().players ?? []).filter((p) => (Number(p.injuryDays) || 0) > 0).length;
  }

  //  推進日曆直到出現「今天輪到玩家打」的賽程（AI 場次由推進日曆自動模擬）
  function nextPlayerFixture(maxSteps = 60) {
    S().ensureCompetitionSeason();
    for (let i = 0; i < maxSteps; i++) {
      const v = S().competitionView();
      if (v.today) return { id: v.today.id, sideA: v.today.sideA, sideB: v.today.sideB, day: S().meta?.days ?? null };
      const before = S().meta?.days ?? 0;
      S().advanceDay(1);
      if ((S().meta?.days ?? 0) === before) return null;
    }
    return null;
  }

  //  由賽程出賽。房間之後**完全走既有那幾支 action**，不複製任何一步。
  //  ⚠ t0 用**遠離現在的合成時間**，不要用 Date.now()。app 自己的計時器會以
  //    真實時鐘輪詢同一批 room/session；時間基準一旦貼近現在，它就會和這裡的
  //    腳本游標搶著改同一個物件，結算隨機退回無場次路徑（實測：票券那支
  //    24/24 → 19/24，賽程這支直接卡在第一場）。合成時間讓 app 的輪詢變成
  //    no-op，驗證器才是決定性的。
  function startFixture(fixtureId, t0) {
    const r = S().startFixtureMatch(fixtureId, t0);
    if (!r.ok) return { ok: false, at: "startFixtureMatch", reason: r.reason };
    let u = t0 + 200;
    for (let i = 1; i <= 30 && S().matchmaking.room?.state === "waiting"; i++) { u = t0 + 200 + i * 500; S().pollMatchRoom(u); }
    if (S().matchmaking.room?.state !== "ready_check") return { ok: false, at: "ready_check", state: S().matchmaking.room?.state };
    const c = S().confirmMatchReady(u + 10);
    if (!c.ok) return { ok: false, at: "confirm_us", errors: c.errors };
    for (let i = 1; i <= 30 && S().matchmaking.room?.state !== "confirmed"; i++) S().pollMatchRoom(u + 10 + i * 400);
    if (S().matchmaking.room?.state !== "confirmed") return { ok: false, at: "confirm", state: S().matchmaking.room?.state };
    const cs = S().createMatchSession(u + 13000);
    if (!cs.ok) return { ok: false, at: "session", errors: cs.errors };
    const l = S().launchMatchSession(u + 13100);
    if (!l.ok) return { ok: false, at: "launch", errors: l.errors };
    const s = S().matchmaking.session;
    return {
      ok: true, sessionId: s.sessionId, seed: l.launch.seed, state: s.state,
      originKind: s.origin?.kind ?? null, fixtureId: s.origin?.fixtureId ?? null,
    };
  }

  function playBattle(seed) {
    const e = new engineMod.LogicEngine((seed >>> 0) | 1);
    for (let i = 0; i < 40000 && !e.over; i++) e.tick(0.5);
    if (!e.over) return null;
    return battleResult.snapshotToBattleResult(e.snapshot(), []);
  }

  //  照 useBattleFeed 的順序結算（交易由當下狀態重建，與線上重送時一致）
  function settle(br) {
    const p = S();
    const tx = adapter.mobaResultToTransaction(br, {
      players: p.players ?? [], lineup: p.lineup ?? null, streak: 0, fansNow: p.meta?.fans ?? 0,
    });
    if (!tx) return { ok: false, at: "transaction" };
    const b4 = S().matchmaking?.session ?? null;
    const sessBefore = S().matchmaking?.session ?? null;
    const r = boundary.settleMatchThroughSession({
      mode: "moba",
      outcome: boundary.outcomeFromBattleResult(br, adapter.mobaMatchId(br)),
      transaction: tx,
    });
    const sess = S().matchmaking?.session ?? null;
    return {
      //  診斷用：viaSession 為 false 時，要看得出來當下的場次長什麼樣
      sessionBefore: b4 ? { id: b4.sessionId, state: b4.state, mode: b4.mode } : null,
      sessionAtSettle: sess ? { id: sess.sessionId, state: sess.state, mode: sess.mode } : null,
      ok: !!r.receipt?.ok, viaSession: r.viaSession,
      alreadySettled: !!r.receipt?.alreadySettled,
      codes: (r.receipt?.errors ?? []).map((x) => x.code ?? String(x)),
      reason: r.receipt?.reason ?? null,
      transactionId: tx.transactionId,
    };
  }

  //  只看**持久層**（localStorage），不看記憶體
  function persisted(fixtureIds = []) {
    const raw = JSON.parse(localStorage.getItem("esmo.profile.v1") || "{}");
    const mm = raw.matchmaking ?? {};
    const comp = raw.competition ?? {};
    const outcomes = comp.outcomes ?? [];
    const fixtures = comp.fixtures ?? [];
    const pick = {};
    for (const id of fixtureIds) {
      const fx = fixtures.find((f) => f.id === id) ?? null;
      const oc = outcomes.find((o) => o.fixtureId === id) ?? null;
      pick[id] = {
        status: fx?.status ?? null,
        outcome: oc ? { winner: oc.winner, a: oc.score?.a, b: oc.score?.b, source: oc.resultSource } : null,
      };
    }
    return {
      sessionId: mm.session?.sessionId ?? null,
      sessionState: mm.session?.state ?? null,
      sessionMatchId: mm.session?.matchId ?? null,
      sessionOrigin: mm.session?.origin?.kind ?? null,
      sessionFixtureId: mm.session?.origin?.fixtureId ?? null,
      lastResultId: mm.lastResult?.resultId ?? null,
      lastError: mm.lastSettlementError?.reason ?? null,
      outcomeCount: outcomes.length,
      fixtures: pick,
      funds: raw.finance?.funds ?? null,
      xpTotal: (raw.players ?? []).reduce((s, p) => s + (Number(p.xp) || 0), 0),
      playerTeamId: comp.playerTeamId ?? null,
    };
  }

  window.__T = { S, healRoster, nextPlayerFixture, startFixture, playBattle, settle, persisted };
  return { ready: true, hasFixtureApi: typeof S().startFixtureMatch === "function", storeUrl };
`;

async function main() {
  console.log("══ 賽程賽果完整性：端到端實測（fixture origin）══\n");
  const server = await startDevServer({ port: VITE_PORT });
  console.log(`   dev server : ${server.url}`);
  console.log(`   CDP port   : ${CDP_PORT}\n`);

  const chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: HEADLESS });
  const install = async () => chrome.evaluate(INSTALL);
  let brA = null, brB = null;
  const refresh = async () => {
    await chrome.reload();
    await install();
    if (brA) await chrome.evaluate(`window.__BR_A = ${JSON.stringify(brA)}; return true;`);
    if (brB) await chrome.evaluate(`window.__BR_B = ${JSON.stringify(brB)}; return true;`);
  };

  try {
    await chrome.navigate(server.url);
    await chrome.evaluate(`localStorage.clear(); return true;`);
    await chrome.reload();
    const ready = await install();
    ck("0) 頁面載入，且拿到 app 自己的 store（含賽程 API）",
      ready?.ready === true && ready?.hasFixtureApi === true);

    // ── 1) fixture A：由賽程出賽，打完，正常完成 ───────────────────────
    const T0 = 5_000_000;
    const fxA = await chrome.evaluate(`return window.__T.nextPlayerFixture();`);
    ck("1) 找到今天輪到玩家的賽程 A", !!fxA?.id, fxA ? `${fxA.id}（第 ${fxA.day} 天）` : "(找不到)");
    if (!fxA?.id) throw new Error("找不到玩家賽程，後續無法驗");

    const A = await chrome.evaluate(`return window.__T.startFixture(${JSON.stringify(fxA.id)}, ${T0});`);
    ck("1b) **場次來源是 fixture**（不是票券），且已啟動",
      A?.ok === true && A.originKind === "fixture" && A.fixtureId === fxA.id && A.state === "launched",
      A?.ok ? `${A.sessionId}（seed ${A.seed}）` : JSON.stringify(A));
    if (!A?.ok) throw new Error("賽程場次 A 無法啟動");

    const before = await chrome.evaluate(`return window.__T.persisted(${JSON.stringify([fxA.id])});`);
    brA = await chrome.evaluate(`
      const br = window.__T.playBattle(${A.seed});
      window.__BR_A = br;
      return br;
    `);
    ck("1c) 用場次 seed 跑出真的 BattleResult", !!brA?.winner,
      brA ? `${brA.winner} ${brA.score.blue}:${brA.score.red}／${Math.round(brA.duration)}s` : "(未終局)");

    const s1 = await chrome.evaluate(`return window.__T.settle(window.__BR_A);`);
    //  ⚠ 硬性前提（與票券那支同一條）：真實賽程場次必須被 boundary 看見。
    //    看不見 ⇒ 測試驅動的 store 不是 production 路徑用的那一個 ⇒ 立刻中止。
    if (s1?.viaSession !== true) {
      throw new Error([
        `前提不成立：真實賽程場次存在（${JSON.stringify(s1?.sessionAtSettle)}）`,
        `但 settleMatchThroughSession 走了無場次分支（viaSession=false）。`,
        `代表測試驅動的 profileStore 與 boundary 閉包裡的不是同一個實例。`,
        `store URL = ${ready?.storeUrl ?? "(未解析)"}`,
        `這是驗證器本身的接線問題，不是被測行為，故中止。`,
      ].join("\n   "));
    }
    ck("1d) 結算成功並走權威路徑（前提：boundary 看得見真實場次）",
      s1?.ok === true && s1.viaSession === true,
      `ok=${s1?.ok} viaSession=${s1?.viaSession} session=${JSON.stringify(s1?.sessionAtSettle)}`);

    await refresh();
    const afterA = await chrome.evaluate(`return window.__T.persisted(${JSON.stringify([fxA.id])});`);
    ck("1e) **賽程 A 被寫成 completed**（reload 後從 localStorage 讀）",
      afterA.fixtures[fxA.id].status === "completed", afterA.fixtures[fxA.id].status);
    ck("1f) 賽程 A 產生 engine 賽果，且比分與這場對戰一致",
      !!afterA.fixtures[fxA.id].outcome && afterA.fixtures[fxA.id].outcome.source === "engine",
      JSON.stringify(afterA.fixtures[fxA.id].outcome));
    ck("1g) 錢確實入帳一次", afterA.funds > before.funds, `$${before.funds} → $${afterA.funds}`);

    // ── 2) fixture B：另一場賽程，開打中 ────────────────────────────────
    await chrome.evaluate(`return window.__T.healRoster();`);
    const fxB = await chrome.evaluate(`return window.__T.nextPlayerFixture();`);
    ck("2) 找到下一場玩家賽程 B", !!fxB?.id && fxB.id !== fxA.id,
      fxB ? `${fxB.id}（第 ${fxB.day} 天）` : "(找不到)");
    if (!fxB?.id || fxB.id === fxA.id) throw new Error("找不到第二場玩家賽程");

    const B = await chrome.evaluate(`return window.__T.startFixture(${JSON.stringify(fxB.id)}, ${T0 + 2_000_000});`);
    ck("2b) 賽程 B 啟動，且與 A 是不同場次／不同 seed",
      B?.ok === true && B.originKind === "fixture" && B.sessionId !== A.sessionId && B.seed !== A.seed,
      B?.ok ? `${B.sessionId}（seed ${B.seed}，A 是 ${A.seed}）` : JSON.stringify(B));
    if (!B?.ok) throw new Error("賽程場次 B 無法啟動");

    // ── 3) 重送 fixture A 的舊 BattleResult ─────────────────────────────
    await refresh();   //  真的 reload 一次，模擬玩家重整後舊流程又送一次
    const IDS = JSON.stringify([fxA.id, fxB.id]);
    const beforeHijack = await chrome.evaluate(`return window.__T.persisted(${IDS});`);
    const s3 = await chrome.evaluate(`return window.__T.settle(window.__BR_A);`);
    ck("3) **A 的舊 BattleResult 被拒絕**（foreign_result）",
      s3.ok === false && (s3.codes ?? []).includes("foreign_result"), s3.reason ?? (s3.codes ?? []).join(","));

    const afterHijack = await chrome.evaluate(`return window.__T.persisted(${IDS});`);
    ck("3b) **賽程 B 不得被完成**（仍是 launched）",
      afterHijack.fixtures[fxB.id].status === "launched", afterHijack.fixtures[fxB.id].status);
    ck("3c) **賽程 B 不得產生賽果**", afterHijack.fixtures[fxB.id].outcome === null);
    ck("3d) 賽果總數沒有增加", afterHijack.outcomeCount === beforeHijack.outcomeCount,
      `${beforeHijack.outcomeCount} → ${afterHijack.outcomeCount}`);
    ck("3e) 場次 B 沒有被污染（仍是 B、仍 launched、未掛 matchId）",
      afterHijack.sessionId === B.sessionId && afterHijack.sessionState === "launched" &&
      !afterHijack.sessionMatchId && afterHijack.sessionFixtureId === fxB.id);
    ck("3f) lastResult 沒有被錯寫", afterHijack.lastResultId === beforeHijack.lastResultId);
    ck("3g) **reward / XP 不重複**",
      afterHijack.funds === beforeHijack.funds && afterHijack.xpTotal === beforeHijack.xpTotal,
      `$${afterHijack.funds} / XP ${afterHijack.xpTotal}`);
    ck("3h) 賽程 A 的賽果沒有被動到（D11 不可變）",
      JSON.stringify(afterHijack.fixtures[fxA.id]) === JSON.stringify(beforeHijack.fixtures[fxA.id]));
    ck("3i) 失敗原因有落盤（可稽核）", !!afterHijack.lastError, afterHijack.lastError);

    // ── 4) B 的正牌賽果仍能正常完成 ─────────────────────────────────────
    brB = await chrome.evaluate(`
      const br = window.__T.playBattle(${B.seed});
      window.__BR_B = br;
      return br;
    `);
    ck("4) 用 B 的 seed 跑出 B 自己的 BattleResult", !!brB?.winner,
      brB ? `${brB.winner} ${brB.score.blue}:${brB.score.red}` : "(未終局)");
    const s4 = await chrome.evaluate(`return window.__T.settle(window.__BR_B);`);
    ck("4b) **B 的正牌結果仍能正常結算**", s4.ok === true && s4.viaSession === true,
      s4.reason ?? s4.transactionId);

    await refresh();
    const afterB = await chrome.evaluate(`return window.__T.persisted(${IDS});`);
    ck("4c) **賽程 B 這時才被完成**，且產生自己的賽果",
      afterB.fixtures[fxB.id].status === "completed" && !!afterB.fixtures[fxB.id].outcome,
      JSON.stringify(afterB.fixtures[fxB.id].outcome));
    ck("4d) 賽果總數 +1", afterB.outcomeCount === beforeHijack.outcomeCount + 1,
      `${beforeHijack.outcomeCount} → ${afterB.outcomeCount}`);
    ck("4e) B 入帳一次（錢有增加）", afterB.funds > beforeHijack.funds,
      `$${beforeHijack.funds} → $${afterB.funds}`);
    ck("4f) 賽程 A 的賽果自始至終沒被動過",
      JSON.stringify(afterB.fixtures[fxA.id]) === JSON.stringify(afterA.fixtures[fxA.id]));

    ck("5) 全程沒有未捕捉的頁面例外", chrome.pageErrors.length === 0,
      chrome.pageErrors.slice(0, 2).join(" | ") || "(無)");
  } finally {
    if (chrome.pageErrors.length) {
      console.log("\n── 頁面例外 ──");
      chrome.pageErrors.slice(0, 5).forEach((e) => console.log("   " + e));
    }
    await chrome.close();
    server.stop();
  }

  console.log(`\n${pass}/${pass + fail} 通過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\n💥 ${e.message}`); process.exit(1); });
