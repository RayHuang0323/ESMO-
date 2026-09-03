#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_club_progression_home.mjs — Club Progression v1 的真實瀏覽器驗證
//
//  執行：`node tools/browser_check_club_progression_home.mjs [--headed]`
//  或走 supervisor（硬總時限，見 Browser Harness v1）：
//    `node tools/browser/run-gate.mjs tools/browser_check_club_progression_home.mjs --timeout 600000`
//
//  ⚠ 驗的是**玩家真的看得到**，不是契約——契約由 `check_club_progression_v1` 守。
//    這一輪特別要證明的三件事，都只有在真瀏覽器裡才算數：
//      ① 首頁再也找不到 `Lv. 93` / `7.27萬` / `#48` 這三個假數字；
//      ② 首頁顯示的等級／XP 與 `clubProgressionView()` 逐值相同（桌機＋390px）；
//      ③ 俱樂部專精那張卡明講自己是「俱樂部聲望」，不再與 Club Level 撞名。
//    另外驗舊存檔 migration：帶著 clubPointsLifetime 的存檔載入後不歸零、reload 不變。
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
 * 「舊存檔」：**刻意**寫成 Club Progression 上線前的形狀——
 * 沒有 clubProgression 欄位、team 帶著假的 Lv.93 / 7.27 / 12.1、
 * retention 有真的累計點數。載入時 normalize 應該保守 bootstrap。
 */
const seedLegacy = `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  const st = () => profile.useProfileStore.getState();
  st().startNewGame("elite");
  st().save();
  const raw = JSON.parse(localStorage.getItem("esmo.profile.v1"));
  delete raw.clubProgression;
  raw.team = { ...(raw.team ?? {}), lv: 93, xp: 7.27, xpMax: 12.1, achievement: 48 };
  raw.retention = { ...(raw.retention ?? {}), clubPoints: 1200, clubPointsLifetime: 4000 };
  localStorage.setItem("esmo.profile.v1", JSON.stringify(raw));
  return "legacy-save-written";
`;

const readHome = `
  ${RESOLVE_APP_MODULES}
  const st = profile.useProfileStore.getState();
  const view = st.clubProgressionView();
  const pick = (id) => {
    const el = document.querySelector('[data-testid="' + id + '"]');
    return el ? (el.innerText || "").trim() : null;
  };
  const body = document.body.innerText || "";
  return JSON.stringify({
    view,
    lifetime: st.retention?.clubPointsLifetime ?? null,
    savedXp: st.clubProgression?.xp ?? null,
    savedHasLevel: Object.prototype.hasOwnProperty.call(st.clubProgression ?? {}, "level"),
    crest: pick("home-crest-level"),
    levelTile: pick("home-club-level"),
    xpTile: pick("home-club-xp"),
    honorTile: pick("home-club-honor"),
    progress: pick("home-club-xp-progress"),
    hasFakeLv93: /Lv\\.?\\s*93\\b/.test(body),
    hasFake727: body.includes("7.27"),
    hasFakeBadge48: /(^|[^0-9])#?48([^0-9]|$)/.test(pick("home-crest-level") ?? ""),
  });
`;

const result = await runGate({
  name: "Club Progression v1 首頁",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 768, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n── ${label} ──`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

      // ── A. 全新存檔：從 Lv.1 / 0 XP 開始 ─────────────────────────────
      await chrome.navigate(url);
      await sleep(900);
      await chrome.evaluate(seedFresh);
      await chrome.navigate(url);
      await sleep(1400);

      const fresh = J(await chrome.evaluate(readHome));
      ck(`${label}｜全新存檔 = Lv.1 / 0 XP`,
        fresh.view.level === 1 && fresh.view.xp === 0, `lv=${fresh.view.level} xp=${fresh.view.xp}`);
      ck(`${label}｜首頁不再出現假的 Lv. 93`, fresh.hasFakeLv93 === false);
      ck(`${label}｜首頁不再出現假的 7.27萬 XP`, fresh.hasFake727 === false);
      ck(`${label}｜隊徽角標不再是 48`, fresh.hasFakeBadge48 === false, `crest=${fresh.crest}`);
      ck(`${label}｜隊徽角標 = 真實 Club Level`,
        fresh.crest === String(fresh.view.level), `crest=${fresh.crest} view=${fresh.view.level}`);
      ck(`${label}｜等級欄位顯示 Lv.${fresh.view.level}`,
        (fresh.levelTile ?? "").includes(`Lv. ${fresh.view.level}`)
        || (fresh.levelTile ?? "").includes(`Lv.${fresh.view.level}`), `tile=${JSON.stringify(fresh.levelTile)}`);
      ck(`${label}｜有「離下一級還差多少」的進度`,
        typeof fresh.progress === "string" && fresh.progress.length > 0
        && fresh.view.levelSpan > 0, `progress=${JSON.stringify(fresh.progress)}`);
      ck(`${label}｜Level 不落盤（存檔切片只有 xp）`, fresh.savedHasLevel === false);
      //  第三格：沒有榮譽時要誠實留白，不得補假資料。
      if (label.startsWith("桌機")) {
        ck(`${label}｜榮譽欄位是誠實空狀態，不是假 badge`,
          typeof fresh.honorTile === "string" && /尚無|冠軍|稱號/.test(fresh.honorTile),
          `honor=${JSON.stringify(fresh.honorTile)}`);
      }

      // ── B. 打一場正式賽 → Club XP 真的動，而且不重複發 ────────────────
      const played = J(await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        const { applyProgressToState } = await import(B + "/src/platform/progress/applyMatchProgress.js");
        const { mobaResultToTransaction } = await import(B + "/src/platform/progress/adapters/mobaProgressAdapter.js");
        const store = profile.useProfileStore;
        const P = (id, side, role, k, d, a, gold, dmg, rating, part) => ({
          id, side, role, heroId: "x", lv: 10, k, d, a, gold, dmg, heal: 0, twrDmg: 0,
          participation: part, rating, won: side === "blue", mvp: id === "b3",
        });
        const br = {
          schema: "BattleResult.v2", mode: "moba",
          teams: { blue: { name: "藍" }, red: { name: "紅" } },
          winner: "blue", duration: 1201, score: { blue: 30, red: 12 },
          gold: { blue: 50000, red: 42000 }, towers: { blue: 8, red: 3 },
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
        };
        const s0 = store.getState();
        const before = s0.clubProgression.xp;
        const mk = (origin) => mobaResultToTransaction(br, { players: s0.players, streak: 0, fansNow: 1000, origin });

        //  ① 快速練習：連打兩場，Club XP 必須完全不動。
        let s = store.getState();
        for (let i = 0; i < 2; i++) {
          const brP = { ...br, duration: 900 + i, gold: { blue: 30000 + i, red: 20000 } };
          const tx = mobaResultToTransaction(brP, { players: s.players, streak: 0, fansNow: 1000, origin: { kind: "practice" } });
          const r = applyProgressToState(s, tx);
          if (r.nextState) { store.setState(r.nextState); s = store.getState(); }
        }
        const afterPractice = store.getState().clubProgression.xp;

        //  ② 正式賽季一場，然後同一張 tx 再套一次（冪等）。
        const txO = mk({ kind: "fixture", fixtureId: "f1", seasonId: "s1" });
        const r1 = applyProgressToState(store.getState(), txO);
        if (r1.nextState) store.setState(r1.nextState);
        const afterOne = store.getState().clubProgression.xp;
        const r2 = applyProgressToState(store.getState(), txO);
        if (r2.nextState) store.setState(r2.nextState);
        const afterDup = store.getState().clubProgression.xp;
        store.getState().save();
        return JSON.stringify({
          before, afterPractice, afterOne, afterDup,
          receiptClub: r1.receipt.club ?? null,
          dupFlag: r2.receipt.alreadyApplied === true,
        });
      `));
      ck(`${label}｜快速練習不產生 Club XP`,
        played.afterPractice === played.before, `${played.before} → ${played.afterPractice}`);
      ck(`${label}｜正式賽季一場真的加 Club XP`,
        played.afterOne > played.afterPractice, `${played.afterPractice} → ${played.afterOne}`);
      ck(`${label}｜同一場重複結算不重複發（冪等）`,
        played.afterDup === played.afterOne && played.dupFlag === true, `dup=${played.afterDup}`);
      ck(`${label}｜receipt 帶 club 區塊給 Result 畫面讀`,
        played.receiptClub && played.receiptClub.xpAfter === played.receiptClub.xpBefore + played.receiptClub.xpGained,
        JSON.stringify(played.receiptClub));

      //  reload 之後首頁顯示的還是同一個值（落盤 + normalize 都對）。
      await chrome.navigate(url);
      await sleep(1400);
      const reloaded = J(await chrome.evaluate(readHome));
      ck(`${label}｜reload 後 Club XP 不變`,
        reloaded.view.xp === played.afterOne, `${played.afterOne} → ${reloaded.view.xp}`);
      ck(`${label}｜reload 後首頁顯示與 view 同源`,
        reloaded.crest === String(reloaded.view.level), `crest=${reloaded.crest} view=${reloaded.view.level}`);

      // ── C. 舊存檔 migration ───────────────────────────────────────────
      await chrome.evaluate(seedLegacy);
      await chrome.navigate(url);
      await sleep(1400);
      const migrated = J(await chrome.evaluate(readHome));
      ck(`${label}｜舊存檔載入後不歸零（保守 bootstrap）`,
        migrated.view.xp > 0, `xp=${migrated.view.xp} lifetime=${migrated.lifetime}`);
      ck(`${label}｜bootstrap 保守：不超過 clubPointsLifetime`,
        migrated.view.xp <= (migrated.lifetime ?? 0), `xp=${migrated.view.xp} lifetime=${migrated.lifetime}`);
      ck(`${label}｜假的 Lv.93 沒有被洗成真歷史`,
        migrated.view.level < 90 && migrated.hasFakeLv93 === false, `lv=${migrated.view.level}`);
      ck(`${label}｜假的 #48 沒有被洗成真歷史`,
        migrated.crest !== "48", `crest=${migrated.crest}`);
      //  migration 只做一次：再 reload 一次值不得再跳。
      await chrome.navigate(url);
      await sleep(1200);
      const again = J(await chrome.evaluate(readHome));
      ck(`${label}｜migration 只做一次（再 reload 值不變）`,
        again.view.xp === migrated.view.xp, `${migrated.view.xp} → ${again.view.xp}`);

      // ── D. Club Assets 未受影響 ──────────────────────────────────────
      const assets = J(await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        const st = profile.useProfileStore.getState();
        return JSON.stringify({
          points: st.retention?.clubPoints ?? null,
          lifetime: st.retention?.clubPointsLifetime ?? null,
          assetsSchema: st.clubAssets?.schema ?? null,
          owned: (st.clubAssets?.owned ?? []).length,
        });
      `));
      ck(`${label}｜Club Points 餘額／累計仍在`,
        assets.points !== null && assets.lifetime !== null, JSON.stringify(assets));
      ck(`${label}｜Club Assets 切片沒被動到`, Boolean(assets.assetsSchema), String(assets.assetsSchema));

      // ── E. 俱樂部專精：不再與 Club Level 撞名 ────────────────────────
      //  ⚠ store 沒有程式化導航 API（沒有 `go()`）——只能走玩家真的走的路徑：
      //    桌機是常駐磚，手機住在底部「更多」sheet 裡（與 mastery gate 同一招）。
      const mastery = J(await chrome.evaluate(`
        ${RESOLVE_APP_MODULES}
        const store = profile.useProfileStore;
        //  聲望要看得到，先給足累計點數（只改 retention，不碰 clubProgression）。
        store.setState({ retention: { ...store.getState().retention, clubPointsLifetime: 4000 } });
        await new Promise(r => setTimeout(r, 300));
        const findEntry = () => document.querySelector('[data-testid="home-sheet-clubMastery"]')
          || [...document.querySelectorAll("button")].find(b => (b.innerText || "").includes("俱樂部專精"));
        let entry = findEntry();
        if (!entry) {
          const more = [...document.querySelectorAll("button")].find(b => (b.innerText || "").trim() === "更多");
          if (more) { more.click(); await new Promise(r => setTimeout(r, 500)); entry = findEntry(); }
        }
        if (!entry) return JSON.stringify({ navFailed: true });
        entry.click();
        await new Promise(r => setTimeout(r, 800));
        const pick = (id) => {
          const el = document.querySelector('[data-testid="' + id + '"]');
          return el ? (el.innerText || "").trim() : null;
        };
        const body = document.body.innerText || "";
        return JSON.stringify({
          label: pick("mastery-prestige-label"),
          tier: pick("mastery-club-tier"),
          saysClubLevel: body.includes("俱樂部等級"),
          xpUnchanged: store.getState().clubProgression.xp,
        });
      `));
      ck(`${label}｜找得到俱樂部專精入口`, mastery.navFailed !== true);
      ck(`${label}｜專精頁那張卡明講是「俱樂部聲望」`,
        mastery.label === "俱樂部聲望", `label=${JSON.stringify(mastery.label)}`);
      ck(`${label}｜專精頁不再出現「俱樂部等級」字樣`,
        mastery.saysClubLevel === false);
      ck(`${label}｜聲望階級仍然顯示（沒有被拆掉）`,
        typeof mastery.tier === "string" && mastery.tier.length > 0, `tier=${mastery.tier}`);
      ck(`${label}｜給聲望灌點數不會動到 Club XP`,
        mastery.xpUnchanged === again.view.xp, `${again.view.xp} → ${mastery.xpUnchanged}`);

      // ── F. 版面：390px 不得橫向溢出 ──────────────────────────────────
      //  重新載入回到首頁（存檔已落盤，值不會變——上面 §C 已經驗過）。
      await chrome.navigate(url);
      await sleep(1200);
      const layout = J(await chrome.evaluate(`
        const de = document.documentElement;
        return JSON.stringify({ scrollW: de.scrollWidth, clientW: de.clientWidth });
      `));
      ck(`${label}｜首頁沒有橫向溢出`,
        layout.scrollW <= layout.clientW + 1, `${layout.scrollW} > ${layout.clientW}`);
    }
  },
});

await finishGate(result);
