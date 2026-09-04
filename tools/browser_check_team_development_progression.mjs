#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_team_development_progression.mjs — TD-56 真實瀏覽器驗證
//
//  執行：`node tools/browser_check_team_development_progression.mjs [--headed]`
//  或走 supervisor（硬總時限，Browser Harness v1）：
//    `node tools/browser/run-gate.mjs tools/browser_check_team_development_progression.mjs --timeout 600000`
//
//  ⚠ 驗的是**玩家真的看得到、真的按得到**，不是契約——契約由
//    `check_team_development_progression_v1` 守，這裡不重寫一份斷言。
//
//  這一輪只有在真瀏覽器裡才算數的四件事：
//    ① 打正式賽推過俱樂部等級里程碑 ⇒ 畫面上的可用發展點**真的變多**
//    ② reload 之後點數不變（不重發、也不消失）
//    ③ 「下一個發展點」看得到，完整規則**預設收合**、點得開
//    ④ 390px 不水平溢出，而且主要操作按得到
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

/** 全新存檔。 */
const seedFresh = `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  const st = () => profile.useProfileStore.getState();
  st().startNewGame("elite");
  st().save();
  return "seeded";
`;

/**
 * 「TD-56 之前的存檔」：**刻意**寫成沒有 grants 帳本的形狀，而且已經跑了
 * 好幾季、Club XP 很高。載入時應該一次補齊整段生涯應得的點，且不重複。
 */
const seedLegacy = `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  const st = () => profile.useProfileStore.getState();
  st().startNewGame("elite");
  st().save();
  const raw = JSON.parse(localStorage.getItem("esmo.profile.v1"));
  //  舊形狀：只有餘額，沒有帳本。
  raw.teamDevelopment = { version: "TeamDevelopmentState.v1", availablePoints: 1, spentPoints: 0, ranks: {}, updatedAt: null };
  raw.clubProgression = { schema: "ClubProgression.v1", xp: 9000 };
  raw.meta = { ...(raw.meta ?? {}), days: 84 * 3 + 1 };
  localStorage.setItem("esmo.profile.v1", JSON.stringify(raw));
  return "legacy-save-written";
`;

/** 走真實導覽路徑進戰隊發展頁（桌機是主要動線磚，手機在底部「更多」sheet 裡）。 */
const ENTER = `
  const find = () => document.querySelector('[data-testid="home-utility-development"]')
    || document.querySelector('[data-testid="home-sheet-development"]')
    || [...document.querySelectorAll("button,[role=button]")]
        .find((x) => (x.innerText || "").includes("戰隊發展"));
  let b = find();
  if (!b) {
    const more = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").trim() === "更多");
    if (more) { more.click(); await new Promise((r) => setTimeout(r, 520)); b = find(); }
  }
  if (!b) return "no-entry";
  b.click();
  await new Promise((r) => setTimeout(r, 900));
  return (document.body.innerText || "").includes("可用發展點") ? "open" : "not-open";
`;

/** 讀畫面上的發展點資訊 ＋ store 的供給視圖（兩邊必須同源）。 */
const readScreen = `
  ${RESOLVE_APP_MODULES}
  const st = profile.useProfileStore.getState();
  const view = st.developmentPointsView();
  const body = document.body.innerText || "";
  const pick = (id) => {
    const el = document.querySelector('[data-testid="' + id + '"]');
    return el ? (el.innerText || "").trim() : null;
  };
  return JSON.stringify({
    view,
    stored: st.teamDevelopment?.availablePoints ?? null,
    grantKeys: Object.keys(st.teamDevelopment?.grants ?? {}),
    clubXp: st.clubProgression?.xp ?? 0,
    days: st.meta?.days ?? 0,
    showsAvailable: body.includes("可用發展點"),
    showsNextHeading: body.includes("下一個發展點"),
    nextLevel: pick("development-next-level"),
    nextSeason: pick("development-next-season"),
    detailToggle: pick("development-point-detail-toggle"),
    detailOpen: document.querySelector('[data-testid="development-point-detail"]') !== null,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    //  玩家端不得出現工程術語
    leaksJargon: /ledger|reconcile|canonical|authority|grants|schema/i.test(body),
  });
`;

const result = await runGate({
  name: "Team Development Progression v1",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 768, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n── ${label} ──`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

      // ── A. 全新存檔 ────────────────────────────────────────────────────
      await chrome.navigate(url);
      await sleep(900);
      await chrome.evaluate(seedFresh);
      await chrome.navigate(url);
      await sleep(1400);
      const entered = String(await chrome.evaluate(ENTER)).replace(/"/g, "");
      ck(`${label}｜從首頁走得進戰隊發展`, entered === "open", `entry=${entered}`);

      const fresh = J(await chrome.evaluate(readScreen));
      ck(`${label}｜新存檔看得到 1 點（開局行為沒被改掉）`,
        fresh.view.available === 1 && fresh.stored === 1, `available=${fresh.view.available}`);
      ck(`${label}｜新存檔的帳本只有種子`,
        fresh.grantKeys.length === 1 && fresh.grantKeys[0] === "seed", fresh.grantKeys.join(","));
      ck(`${label}｜畫面顯示「可用發展點」`, fresh.showsAvailable === true);
      ck(`${label}｜畫面顯示「下一個發展點」`, fresh.showsNextHeading === true);
      ck(`${label}｜下一個等級里程碑看得到`,
        typeof fresh.nextLevel === "string" && fresh.nextLevel.includes("俱樂部升到"), JSON.stringify(fresh.nextLevel));
      ck(`${label}｜下一個賽季獎勵看得到`,
        typeof fresh.nextSeason === "string" && fresh.nextSeason.includes("賽季"), JSON.stringify(fresh.nextSeason));
      ck(`${label}｜完整規則預設收合（progressive disclosure）`, fresh.detailOpen === false);
      ck(`${label}｜玩家端沒有工程術語`, fresh.leaksJargon === false);
      ck(`${label}｜畫面數字與供給視圖同源`,
        fresh.stored === fresh.view.available, `stored=${fresh.stored} view=${fresh.view.available}`);

      // ── B. 規則層點得開 ────────────────────────────────────────────────
      const opened = J(await chrome.evaluate(`
        const t = document.querySelector('[data-testid="development-point-detail-toggle"]');
        if (!t) return JSON.stringify({ clicked: false, open: false });
        t.click();
        await new Promise((r) => setTimeout(r, 320));
        const d = document.querySelector('[data-testid="development-point-detail"]');
        return JSON.stringify({ clicked: true, open: d !== null, text: d ? (d.innerText || "").trim() : null });
      `));
      ck(`${label}｜規則層點得開`, opened.clicked === true && opened.open === true);
      ck(`${label}｜規則層說得出各來源累計`,
        typeof opened.text === "string" && opened.text.includes("累計獲得"), (opened.text ?? "").slice(0, 40));

      // ── C. 打正式賽推過里程碑 ⇒ 點數真的變多 ───────────────────────────
      const played = J(await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        const { applyProgressToState } = await import(B + "/src/platform/progress/applyMatchProgress.js");
        const { mobaResultToTransaction } = await import(B + "/src/platform/progress/adapters/mobaProgressAdapter.js");
        const store = profile.useProfileStore;
        const P = (id, side, role, k, d, a, gold, dmg, rating, part) => ({
          id, side, role, heroId: "x", lv: 10, k, d, a, gold, dmg, heal: 0, twrDmg: 0,
          participation: part, rating, won: side === "blue", mvp: id === "b3",
        });
        const mkBr = (n) => ({
          schema: "BattleResult.v2", mode: "moba",
          teams: { blue: { name: "藍" }, red: { name: "紅" } },
          winner: "blue", duration: 1200 + n, score: { blue: 30, red: 12 },
          gold: { blue: 50000 + n, red: 42000 }, towers: { blue: 8, red: 3 },
          dragon: { blue: 2, red: 1 }, baron: { blue: 1, red: 0 },
          tactic: null, tacticExecution: null, timeline: [], mvpId: "b3",
          players: [
            P("b1", "blue", "top", 6, 4, 8, 9000, 30000, 30, 0.55),
            P("b2", "blue", "jungle", 5, 5, 12, 8500, 24000, 28, 0.60),
            P("b3", "blue", "mid", 14, 2, 6, 13000, 52000, 62, 0.70),
            P("b4", "blue", "adc", 9, 3, 7, 11000, 41000, 44, 0.58),
            P("b5", "blue", "sup", 1, 6, 20, 5000, 9000, 10, 0.72),
            P("r1", "red", "top", 3, 7, 5, 7000, 20000, 12, 0.4),
          ],
        });
        const before = store.getState().teamDevelopment.availablePoints;

        //  ① 快速練習連打三場：發展點必須完全不動。
        let s = store.getState();
        for (let i = 0; i < 3; i++) {
          const tx = mobaResultToTransaction(mkBr(900 + i), { players: s.players, streak: 0, fansNow: 1000, origin: { kind: "practice" } });
          const r = applyProgressToState(s, tx);
          if (r.nextState) { store.setState(r.nextState); s = store.getState(); }
        }
        const afterPractice = store.getState().teamDevelopment.availablePoints;

        //  ② 正式賽季連打到跨過第一個等級里程碑。
        for (let i = 0; i < 6; i++) {
          const cur = store.getState();
          const tx = mobaResultToTransaction(mkBr(i), { players: cur.players, streak: 0, fansNow: 1000, origin: { kind: "fixture", fixtureId: "f" + i, seasonId: "s1" } });
          const r = applyProgressToState(cur, tx);
          if (r.nextState) store.setState(r.nextState);
        }
        const afterOfficial = store.getState().teamDevelopment.availablePoints;

        //  ③ 同一張 tx 再套一次：不得重複發。
        const cur = store.getState();
        const dupTx = mobaResultToTransaction(mkBr(0), { players: cur.players, streak: 0, fansNow: 1000, origin: { kind: "fixture", fixtureId: "f0", seasonId: "s1" } });
        const rDup = applyProgressToState(cur, dupTx);
        if (rDup.nextState) store.setState(rDup.nextState);
        const afterDup = store.getState().teamDevelopment.availablePoints;
        store.getState().save();
        return JSON.stringify({
          before, afterPractice, afterOfficial, afterDup,
          clubXp: store.getState().clubProgression.xp,
          grantKeys: Object.keys(store.getState().teamDevelopment.grants ?? {}),
          dupFlag: rDup.receipt.alreadyApplied === true,
        });
      `));
      ck(`${label}｜快速練習打三場發出 0 點`,
        played.afterPractice === played.before, `${played.before} → ${played.afterPractice}`);
      ck(`${label}｜打正式賽推過里程碑後點數真的變多`,
        played.afterOfficial > played.afterPractice,
        `${played.afterPractice} → ${played.afterOfficial}（Club XP ${played.clubXp}）`);
      ck(`${label}｜發出來的點掛在等級里程碑上`,
        played.grantKeys.some((k) => k.startsWith("level:")), played.grantKeys.join(","));
      ck(`${label}｜同一場重複結算不重複發點`,
        played.afterDup === played.afterOfficial && played.dupFlag === true, `dup=${played.afterDup}`);

      // ── D. reload 不重發、不消失 ───────────────────────────────────────
      await chrome.navigate(url);
      await sleep(1400);
      await chrome.evaluate(ENTER);
      const reloaded = J(await chrome.evaluate(readScreen));
      ck(`${label}｜reload 後點數不變`,
        reloaded.view.available === played.afterOfficial,
        `${played.afterOfficial} → ${reloaded.view.available}`);
      ck(`${label}｜reload 後帳本還在（不會重跑遷移）`,
        reloaded.grantKeys.length === played.grantKeys.length, reloaded.grantKeys.join(","));

      // ── E. 真的投入一點 ⇒ 扣點且路線生效 ───────────────────────────────
      const bought = J(await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        const store = profile.useProfileStore;
        const before = store.getState().teamDevelopment.availablePoints;
        const receipt = store.getState().purchaseTeamDevelopment("general_training_flow");
        const after = store.getState();
        return JSON.stringify({
          before, success: receipt.success, reason: receipt.failureReason ?? null,
          after: after.teamDevelopment.availablePoints,
          spent: after.teamDevelopment.spentPoints,
          rank: after.teamDevelopment.ranks.general_training_flow ?? 0,
          capability: after.clubCapabilities().total.trainingDaysReduction,
        });
      `));
      ck(`${label}｜投入一級成功`, bought.success === true, bought.reason ?? "");
      ck(`${label}｜投入後扣 1 點`, bought.after === bought.before - 1, `${bought.before} → ${bought.after}`);
      ck(`${label}｜投入後路線能力真的生效`,
        bought.rank === 1 && bought.capability >= 1, `rank=${bought.rank} trainingDaysReduction=${bought.capability}`);

      // ── F. 舊存檔一次補齊 ──────────────────────────────────────────────
      await chrome.navigate(url);
      await sleep(900);
      await chrome.evaluate(seedLegacy);
      await chrome.navigate(url);
      await sleep(1500);
      await chrome.evaluate(ENTER);
      const legacy = J(await chrome.evaluate(readScreen));
      ck(`${label}｜舊存檔載入後補齊生涯應得的點`,
        legacy.view.available > 1, `available=${legacy.view.available}（Club XP ${legacy.clubXp} / 第 ${legacy.days} 天）`);
      ck(`${label}｜舊存檔補的點分別來自等級與賽季`,
        legacy.view.bySource.clubLevel > 0 && legacy.view.bySource.careerSeason > 0,
        JSON.stringify(legacy.view.bySource));
      //  ⚠ 用 navigate 重載，不在 evaluate 裡呼叫 location.reload()——
      //    後者會把當下這個 evaluate 的 CDP 連線一起打斷。
      await chrome.navigate(url);
      await sleep(1600);
      await chrome.evaluate(ENTER);
      const afterLegacyReload = J(await chrome.evaluate(readScreen));
      ck(`${label}｜舊存檔補齊後 reload 不再加點（遷移只跑一次）`,
        afterLegacyReload.view.available === legacy.view.available,
        `${legacy.view.available} → ${afterLegacyReload.view.available}`);

      // ── G. 版面 ────────────────────────────────────────────────────────
      ck(`${label}｜不水平溢出`,
        afterLegacyReload.horizontalOverflow === false,
        `scrollWidth=${afterLegacyReload.scrollWidth} innerWidth=${afterLegacyReload.innerWidth}`);
      if (mobile) {
        const touch = J(await chrome.evaluate(`
          const t = document.querySelector('[data-testid="development-point-detail-toggle"]');
          const r = t ? t.getBoundingClientRect() : null;
          return JSON.stringify({ h: r ? Math.round(r.height) : 0, w: r ? Math.round(r.width) : 0 });
        `));
        ck(`${label}｜規則層開關的觸控目標夠大`, touch.h >= 32, `${touch.w}×${touch.h}px`);
      }
    }
  },
});

finishGate(result);
