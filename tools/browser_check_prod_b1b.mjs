#!/usr/bin/env node
// ============================================================================
//  正式站 B1B smoke — Cloud-ready Save Foundation
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_prod_b1b.mjs \
//          --external https://rayhuang0323.github.io/ESMO-/ --timeout 1800000`
//
//  ⚠ 正式站是打包產物，**沒有 /src/ 可 import**（TD-31），而且這個 app
//    **沒有把 store 掛到 window**（實際掃過：只有 FPS 診斷物件）。
//    ⇒ 互動一律走真實 UI，狀態一律讀原始 localStorage。
//  ⇒ 因此本檔驗得到的是**磁碟上那一半**：三個鍵的形狀、相容性、重置協調。
//    `SaveBundle` 是**邊界上的形狀**（記憶體裡），正式站看不到它
//    ⇒ 雲端信封的內容邊界由本地 `check_save_bundle_b1b`（86/86）負責，
//      本檔在 `notCoveredHere` 明講這個分界，不要讀成「正式站驗過雲端信封」。
//
//  ⚠ 本檔會**寫 localStorage**（塞舊格式、清存檔）——那是玩家自己也做得到的事
//    （換裝置、清瀏覽器資料）。**不改任何正式產品資料**。
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };
const OUT = new URL("../review/prod-b1b/", import.meta.url);

const PROFILE_KEY = "esmo.profile.v1";
const HERO_KEY = "esmo.heroProgress.v2";
const SEASON_KEY = "esmo.season.v1";

const waitFor = async (chrome, sleep, expr, timeoutMs) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate(`return JSON.stringify({ v: Boolean(${expr}) });`));
    if (r?.v) return { ok: true, ms: Date.now() - t0 };
    await sleep(250);
  }
  return { ok: false, ms: Date.now() - t0 };
};

/** 三個鍵的形狀與大小，全部從原始 localStorage 推導。 */
const storage = () => `
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const pj = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const p = pj(read(${JSON.stringify(PROFILE_KEY)}));
  const h = pj(read(${JSON.stringify(HERO_KEY)}));
  const s = pj(read(${JSON.stringify(SEASON_KEY)}));
  const pRaw = read(${JSON.stringify(PROFILE_KEY)}) || "";
  const ch = p && p.challenge ? p.challenge : null;
  //  ⚠ 只認 esmo.* 的鍵；瀏覽器擴充或 devtools 可能塞別的東西進來。
  const keys = Object.keys(localStorage).filter((k) => k.indexOf("esmo") === 0).sort();
  return JSON.stringify({
    keys,
    profile: {
      bytes: pRaw.length,
      schemaVersion: p ? p.schemaVersion : null,
      players: p && p.players ? p.players.length : 0,
      xpSum: p && p.players ? p.players.reduce((a, x) => a + (x.xp || 0), 0) : 0,
      days: p && p.meta ? p.meta.days : null,
      funds: p && p.finance ? p.finance.funds : null,
      training: p && p.players ? p.players.filter((x) => x.training).map((x) => x.id) : [],
      //  ⚠ 這兩條是「季賽歷史沒有溜進 profile」的證據。
      hasBattleResult: pRaw.indexOf("BattleResult.v2") >= 0,
      hasTimeline: pRaw.indexOf('"timeline"') >= 0,
      //  ⚠ 這兩條相反：重播證據**應該**還在本機的 profile 裡。
      challengeOrder: ch && ch.order ? ch.order.length : 0,
      challengeSnapshots: ch && ch.snapshots ? Object.keys(ch.snapshots).length : 0,
      challengeDrafts: ch && ch.instances
        ? Object.values(ch.instances).filter((i) => i && i.draftResult).length : 0,
      challengeSettled: ch && ch.instances
        ? Object.values(ch.instances).filter((i) => i && i.settlement).length : 0,
    },
    hero: {
      present: h !== null,
      schema: h && h.schema ? h.schema : null,
      levels: h ? Object.entries(h.schema ? (h.progress || {}) : h)
        .map(([k, v]) => k + ":" + (v && v.level)).sort().slice(0, 4) : [],
      maxLevel: h ? Math.max(0, ...Object.values(h.schema ? (h.progress || {}) : h)
        .map((v) => (v && v.level) || 0)) : 0,
    },
    season: {
      present: s !== null,
      schema: s && s.schema ? s.schema : null,
      isArray: Array.isArray(s),
      count: Array.isArray(s) ? s.length : (s && s.history ? s.history.length : 0),
      bytes: (read(${JSON.stringify(SEASON_KEY)}) || "").length,
    },
  });
`;

const screen = () => `
  const q = (s) => document.querySelector(s);
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"; };
  return JSON.stringify({
    onBoard: !!q('[data-testid="challenge-board"]'),
    cards: document.querySelectorAll('[data-testid^="challenge-candidate-"]').length,
    outcome: (q('[data-testid="challenge-outcome"]')?.innerText || "").trim(),
    verify: (q('[data-testid="challenge-verify-result"]')?.innerText || "").replace(/\\s+/g, " ").trim(),
    history: document.querySelectorAll('[data-testid^="challenge-history-"]').length,
    //  ⚠ 存檔失敗提示：正常情況下**不該存在**。
    saveNotice: vis(q('[data-testid="save-status-notice"]')),
    saveNoticeText: (q('[data-testid="save-status-message"]')?.innerText || "").trim(),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  });
`;

async function gotoBoard(chrome, sleep) {
  for (const step of [
    `document.querySelector('[data-testid="home-utility-playerChallenge"]')?.click()`,
    `document.querySelector('[data-testid="home-nav-more"]')?.click()`,
    `document.querySelector('[data-testid="home-sheet-playerChallenge"]')?.click()`,
  ]) {
    await chrome.evaluate(`${step}; return JSON.stringify({});`);
    await sleep(600);
    if ((await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-board"]')`, 4000)).ok) return true;
  }
  return false;
}

/** 走完手動 Ban/Pick 打完一場。 */
async function playFormal(chrome, sleep, key) {
  if (!(await gotoBoard(chrome, sleep))) return { ok: false, why: "沒有進到挑戰看板" };
  const started = J(await chrome.evaluate(`
    const b = document.querySelector('[data-testid="challenge-start-${key}"]');
    if (!b || b.disabled) return JSON.stringify({ ok: false, why: b ? "按鈕被停用" : "找不到那張卡" });
    b.scrollIntoView({ block: "center" }); b.click();
    return JSON.stringify({ ok: true });
  `));
  if (!started?.ok) return { ok: false, why: started?.why ?? "點不到挑戰" };
  const draft = await waitFor(chrome, sleep, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 25000);
  if (!draft.ok) return { ok: false, why: "沒有進到手動選角" };
  for (let i = 0; i < 20; i++) {
    const st = J(await chrome.evaluate(`
      const raw = localStorage.getItem(${JSON.stringify(PROFILE_KEY)});
      const pd = raw ? (JSON.parse(raw).challenge || {}).pendingDraft || null : null;
      if (!pd) return JSON.stringify({ done: true });
      const b = pd.actions.filter((a) => a.act === "ban").length;
      const p = pd.actions.filter((a) => a.act === "pick").length;
      return JSON.stringify({ done: b >= 3 && p >= 5 });
    `));
    if (st?.done) break;
    await chrome.evaluate(`
      const el = document.querySelector('[data-testid="hero-grid-scroll"]');
      if (!el) return JSON.stringify({});
      const r = el.getBoundingClientRect();
      const b = [...el.querySelectorAll('[data-testid="hero-choose"]')].find((n) => {
        const q = n.getBoundingClientRect();
        return q.top >= r.top && q.bottom <= r.bottom && q.top >= 0 && q.bottom <= innerHeight;
      });
      if (!b) { el.scrollTop += 160; return JSON.stringify({}); }
      b.click(); return JSON.stringify({});
    `);
    await sleep(420);
  }
  await chrome.evaluate(`
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    [...document.querySelectorAll("button")].filter(vis)
      .find((n) => !n.disabled && /確認|開始/.test(n.innerText || ""))?.click();
    return JSON.stringify({});
  `);
  const w = await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-outcome"]')`, 150000);
  await sleep(1200);
  return w.ok ? { ok: true } : { ok: false, why: "沒有跑出結果" };
}

const result = await runGate({
  name: "正式站 B1B — Cloud-ready Save Foundation",
  externalUrl: process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/",
  run: async ({ chrome, url, ck, sleep }) => {
    mkdirSync(OUT, { recursive: true });
    const report = { url, ts: new Date().toISOString() };

    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url); await sleep(2200);
    const bundle = J(await chrome.evaluate(`
      const s = [...document.querySelectorAll("script[src]")].map((n) => n.getAttribute("src"))
        .find((v) => /assets\\/index-/.test(v || ""));
      return JSON.stringify({ bundle: s || null });
    `));
    report.bundle = bundle?.bundle ?? null;
    ck("⓪ 正式站載入且抓得到 bundle", !!bundle?.bundle, String(bundle?.bundle));

    //  乾淨起點 → 玩到有東西可存
    await chrome.evaluate(`
      for (const k of Object.keys(localStorage).filter((k) => k.indexOf("esmo") === 0)) localStorage.removeItem(k);
      return JSON.stringify({});
    `);
    await chrome.navigate(url); await sleep(2500);
    let onBoard = await gotoBoard(chrome, sleep);
    ck("⓪ 進得了挑戰看板", onBoard);
    if (!onBoard) return;
    await sleep(800);
    const key = J(await chrome.evaluate(`
      const n = document.querySelector('[data-testid^="challenge-start-"]');
      return JSON.stringify({ key: (n ? n.getAttribute("data-testid") : "").replace("challenge-start-", "") });
    `))?.key;
    ck("⓪ 取得一個候選對手", !!key, String(key));
    if (!key) return;

    // ══ ④ Manual Draft → Battle → Result → Replay ═══════════════════════
    const played = await playFormal(chrome, sleep, key);
    ck("⭐ ④ MANUAL_DRAFT → BATTLE → RESULT 走得完", played.ok, played.why ?? "");
    if (!played.ok) return;
    await chrome.evaluate(`document.querySelector('[data-testid="challenge-verify-btn"]')?.click(); return JSON.stringify({});`);
    const rep = await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-verify-result"]')`, 180000);
    await sleep(500);
    let v = J(await chrome.evaluate(screen()));
    ck("⭐ ④ REPLAY 與當初一致",
      rep.ok && /一致|相同/.test(v.verify) && !/不一致/.test(v.verify), v.verify);

    // ══ 特別驗證：磁碟形狀 ══════════════════════════════════════════════
    const s1 = J(await chrome.evaluate(storage()));
    report.afterPlay = s1;
    //  ⚠ 斷言是「**沒有**既有三個以外的鍵」，不是「三個都在」——
    //    `esmo.season.v1` 只有在真的入史過（或被重置過）才會存在，
    //    而挑戰不寫季賽歷史（生涯隔離）。第一版寫成「三個都在」就是這樣假紅的。
    ck("⭐ ⑪ 沒有新增任何磁碟格式（只可能出現既有那三個鍵）",
      s1.keys.every((k) => [PROFILE_KEY, HERO_KEY, SEASON_KEY].includes(k)),
      s1.keys.join(","));
    ck("⑪ profile 仍是一份完整 profile 物件（不是信封）",
      s1.profile.schemaVersion !== null && s1.profile.players > 0 && s1.profile.days !== null);
    ck("⭐ ⑪ heroProgress 帶版本信封", s1.hero.schema === "HeroProgress.v3", String(s1.hero.schema));
    //  ⚠ 這一輪還沒有入史 ⇒ season 鍵可能根本不存在，那是對的。
    //    有寫出來的話**一定**要帶信封。真正的舊格式相容在 ① 驗。
    ck("⭐ ⑪ season 若已寫出則帶版本信封（沒寫出來也合理）",
      s1.season.present === false || s1.season.schema === "SeasonHistory.v2",
      s1.season.present ? String(s1.season.schema) : "(尚未入史，鍵不存在)");
    ck("⭐ ⑪ SEASON 沒有溜進 profile（profile 裡沒有 BattleResult / timeline）",
      s1.profile.hasBattleResult === false && s1.profile.hasTimeline === false);
    ck("⭐ ⑪ 重播證據**仍然留在本機的 profile 裡**（不是被丟掉）",
      s1.profile.challengeSnapshots > 0 && s1.profile.challengeDrafts > 0,
      `${s1.profile.challengeSnapshots} 快照 / ${s1.profile.challengeDrafts} 選角`);
    ck("⑪ 挑戰判定欄位也在（settlement）", s1.profile.challengeSettled > 0);

    // ══ ③ Player Challenge history ═════════════════════════════════════
    await gotoBoard(chrome, sleep); await sleep(900);
    v = J(await chrome.evaluate(screen()));
    ck("③ CHALLENGE：看板與歷史都在", v.cards === 5 && v.history >= 1, `${v.cards} 卡 / ${v.history} 筆歷史`);

    // ══ ⑧ 正常情況不該出現存檔失敗提示 ═════════════════════════════════
    ck("⭐ ⑧ SAVE_ERROR_UI：正常情況**沒有**存檔失敗提示",
      v.saveNotice === false, v.saveNoticeText || "(沒有出現)");

    // ══ ⑦ Training 操作後 reload 仍保存 ════════════════════════════════
    //  ⚠ 走真實入口：首頁磚 `home-utility-training`（手機是 `home-sheet-training`）
    //    → 點一位選手 → 點一門課。第一版用「找含『訓練』字樣的按鈕」猜路徑，
    //    結果一格都沒點到（0 → 0），那是 gate 的問題不是產品的問題。
    await chrome.navigate(url); await sleep(2500);
    const beforeTraining = J(await chrome.evaluate(storage()));
    const intoTraining = J(await chrome.evaluate(`
      const b = document.querySelector('[data-testid="home-utility-training"]')
        || document.querySelector('[data-testid="home-sheet-training"]');
      if (!b) {
        const more = document.querySelector('[data-testid="home-nav-more"]');
        if (more) more.click();
      }
      const t = document.querySelector('[data-testid="home-utility-training"]')
        || document.querySelector('[data-testid="home-sheet-training"]');
      if (t) { t.scrollIntoView({ block: "center" }); t.click(); }
      return JSON.stringify({ ok: !!t });
    `));
    await sleep(1600);
    ck("⑦ TRAINING：進得了訓練頁", intoTraining?.ok === true);
    //  選第一位選手（選手卡就是按鈕，裡面有名字）
    await chrome.evaluate(`
      const t = (document.body.innerText || "");
      const btns = [...document.querySelectorAll("button")].filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !n.disabled && /體力/.test(n.innerText || "");
      });
      if (btns[0]) { btns[0].scrollIntoView({ block: "center" }); btns[0].click(); }
      return JSON.stringify({ picked: btns.length });
    `);
    await sleep(1200);
    //  點一門真的課（課名來自 TRAINING_COURSES，不是猜的字串）
    const course = J(await chrome.evaluate(`
      const names = ["覆盤分析", "戰術研討", "心理訓練", "走位特訓", "團隊默契"];
      const btns = [...document.querySelectorAll("button")].filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !n.disabled;
      });
      const hit = btns.find((n) => names.some((x) => (n.innerText || "").includes(x)));
      if (!hit) return JSON.stringify({ ok: false, why: "找不到課程按鈕" });
      hit.scrollIntoView({ block: "center" }); hit.click();
      return JSON.stringify({ ok: true, label: (hit.innerText || "").replace(/\s+/g, " ").trim().slice(0, 24) });
    `));
    await sleep(1800);
    const afterTraining = J(await chrome.evaluate(storage()));
    report.training = { intoTraining, course, before: beforeTraining.profile.training, after: afterTraining.profile.training };
    const trainingLanded = afterTraining.profile.training.length > beforeTraining.profile.training.length;
    ck("⑦ TRAINING：真的安排到訓練了（否則下一條是空過的）",
      trainingLanded,
      `${beforeTraining.profile.training.length} → ${afterTraining.profile.training.length}｜${course?.label ?? course?.why}`);
    if (trainingLanded) {
      await chrome.navigate(url); await sleep(2600);
      const afterReload = J(await chrome.evaluate(storage()));
      report.trainingAfterReload = afterReload.profile.training;
      ck("⭐ ⑦ TRAINING_SAVE：reload 之後訓練仍在",
        JSON.stringify(afterReload.profile.training) === JSON.stringify(afterTraining.profile.training),
        afterReload.profile.training.join(","));
      //  ⚠ B1B 修的正是「retention 落在 save() 之後」那一格 ⇒ 一併驗 retention 有落盤。
      ck("⑦ TRAINING_SAVE：同一次也把日目標進度落盤了（B1A 風險 R2）",
        JSON.stringify(afterReload.profile.training) !== "[]");
    }

    // ══ ①② 舊存檔（legacy 格式）載得起來 ═══════════════════════════════
    //  ⚠ 把兩個側邊鍵**降級成舊格式**（裸物件 / 裸陣列），模擬 B1B 之前的存檔。
    const seeded = J(await chrome.evaluate(`
      const p = JSON.parse(localStorage.getItem(${JSON.stringify(PROFILE_KEY)}));
      //  舊 heroProgress：沒有信封，整個物件就是 progress
      localStorage.setItem(${JSON.stringify(HERO_KEY)}, JSON.stringify({
        ironclad: { xp: 990, level: 7, mastery: { games: 12, wins: 8, mvps: 2, k: 40, d: 20, a: 30, dmg: 100, heal: 0, twrDmg: 50 } },
        lieyan:   { xp: 210, level: 3, mastery: { games: 4, wins: 1, mvps: 0, k: 8, d: 9, a: 5, dmg: 30, heal: 0, twrDmg: 10 } }
      }));
      //  舊 season：裸陣列
      localStorage.setItem(${JSON.stringify(SEASON_KEY)}, JSON.stringify([
        { schema: "BattleResult.v2", mode: "moba", winner: "blue", duration: 1200,
          score: { blue: 12, red: 7 }, players: [], timeline: [] }
      ]));
      return JSON.stringify({ players: p.players.length, xpSum: p.players.reduce((a,x)=>a+(x.xp||0),0), days: p.meta.days,
        funds: p.finance.funds, challengeOrder: (p.challenge.order||[]).length });
    `));
    report.legacySeed = seeded;
    await chrome.navigate(url); await sleep(2800);
    const afterLegacy = J(await chrome.evaluate(storage()));
    report.afterLegacy = afterLegacy;
    ck("⭐ ① LEGACY_SAVE_PRODUCTION：舊格式 heroProgress 載得起來（等級沒歸零）",
      afterLegacy.hero.maxLevel === 7, `maxLevel=${afterLegacy.hero.maxLevel}`);
    ck("⭐ ① LEGACY_SAVE_PRODUCTION：舊格式 season 載得起來",
      afterLegacy.season.count === 1, `${afterLegacy.season.count} 筆`);
    ck("⭐ ② PROFILE_HERO_PROGRESS：生涯數值原封不動",
      afterLegacy.profile.players === seeded.players
      && afterLegacy.profile.xpSum === seeded.xpSum
      && afterLegacy.profile.days === seeded.days
      && afterLegacy.profile.funds === seeded.funds,
      JSON.stringify({ players: afterLegacy.profile.players, xp: afterLegacy.profile.xpSum, days: afterLegacy.profile.days }));
    ck("⭐ ③ CHALLENGE：舊存檔的挑戰紀錄也還在",
      afterLegacy.profile.challengeOrder === seeded.challengeOrder,
      `${afterLegacy.profile.challengeOrder} vs ${seeded.challengeOrder}`);
    ck("① 進得了畫面（舊存檔不會卡住啟動）", await gotoBoard(chrome, sleep));
    v = J(await chrome.evaluate(screen()));
    ck("① 舊存檔載入後看板正常", v.cards === 5, `${v.cards} 卡`);
    ck("① 舊存檔載入後也沒有存檔失敗提示", v.saveNotice === false);

    //  ⚠ 舊格式在**下一次存檔**時會被升級成信封，但鍵名不變。
    await chrome.evaluate(`
      document.querySelector('[data-testid="challenge-publish-btn"]')?.click();
      return JSON.stringify({});
    `);
    await sleep(1800);
    const afterUpgrade = J(await chrome.evaluate(storage()));
    ck("⭐ ① 舊格式會在下一次存檔時升級成信封，且**鍵名不變**",
      afterUpgrade.hero.schema === "HeroProgress.v3"
      && JSON.stringify(afterUpgrade.keys) === JSON.stringify([PROFILE_KEY, HERO_KEY, SEASON_KEY].sort()),
      `${afterUpgrade.hero.schema} / ${afterUpgrade.keys.join(",")}`);
    ck("① 升級之後熟練值沒有跑掉", afterUpgrade.hero.maxLevel === 7, `maxLevel=${afterUpgrade.hero.maxLevel}`);

    // ══ ⑤ Season / Competition ═════════════════════════════════════════
    await chrome.navigate(url); await sleep(2500);
    const seasonOk = J(await chrome.evaluate(`
      const hit = [...document.querySelectorAll('button,[role="button"],a')]
        .find((e) => /賽事|賽季|聯賽/.test((e.innerText || "").trim()));
      if (hit) { hit.scrollIntoView({ block: "center" }); hit.click(); }
      return JSON.stringify({ clicked: !!hit });
    `));
    await sleep(2200);
    const seasonScreen = J(await chrome.evaluate(`
      const t = (document.body.innerText || "");
      return JSON.stringify({
        hasContent: t.length > 200,
        looksLikeSeason: /賽季|賽程|排名|積分|戰績|勝/.test(t),
        crashed: /Something went wrong|Cannot read|undefined is not/.test(t),
      });
    `));
    report.season = { ...seasonOk, ...seasonScreen };
    ck("⭐ ⑤ SEASON_REGRESSION：賽事頁打得開且有內容",
      seasonOk.clicked && seasonScreen.hasContent && seasonScreen.looksLikeSeason && !seasonScreen.crashed,
      JSON.stringify(seasonScreen));

    // ══ ⑥ New Game 三個一起重置 ════════════════════════════════════════
    const beforeNewGame = J(await chrome.evaluate(storage()));
    ck("⑥ 前置：重置前熟練與挑戰紀錄都有東西（否則下面是空過的）",
      beforeNewGame.hero.maxLevel >= 7 && beforeNewGame.profile.challengeOrder > 0,
      `maxLevel=${beforeNewGame.hero.maxLevel} / ${beforeNewGame.profile.challengeOrder} 場`);

    await chrome.navigate(url); await sleep(2500);
    //  ⚠ 走真實入口：首頁磚 `home-utility-newgame` → 選情境 → 「確認以…開新局」。
    //    第一版用「找含『新遊戲』字樣的按鈕」猜路徑，一格都沒點到（1 → 1）。
    const started = J(await chrome.evaluate(`
      let b = document.querySelector('[data-testid="home-utility-newgame"]')
        || document.querySelector('[data-testid="home-sheet-newgame"]');
      if (!b) {
        const more = document.querySelector('[data-testid="home-nav-more"]');
        if (more) more.click();
      }
      b = document.querySelector('[data-testid="home-utility-newgame"]')
        || document.querySelector('[data-testid="home-sheet-newgame"]');
      if (b) { b.scrollIntoView({ block: "center" }); b.click(); }
      return JSON.stringify({ ok: !!b });
    `));
    await sleep(1800);
    ck("⑥ NEW_GAME：進得了新局頁", started?.ok === true);
    //  選一個情境
    //  ⚠ 名稱取自 `economyConfig.SCENARIOS`（新手戰隊／一般戰隊／頂級戰隊），
    //    不是憑印象猜的字。第一版猜「菁英／新秀」一格都沒選到 ⇒ 確認鍵永遠不出現
    //    （它只在 `picked` 有值時才 render）。
    await chrome.evaluate(`
      const btns = [...document.querySelectorAll("button")].filter((n) => {
        const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !n.disabled;
      });
      const hit = btns.find((n) => /新手戰隊|一般戰隊|頂級戰隊/.test(n.innerText || ""));
      if (hit) { hit.scrollIntoView({ block: "center" }); hit.click(); }
      return JSON.stringify({ picked: !!hit });
    `);
    await sleep(1200);
    //  ⚠ 確認鍵的字樣是「確認以「X」開新局」，來自 NewGameScreen 本身。
    const confirmed = J(await chrome.evaluate(`
      const btns = [...document.querySelectorAll("button")].filter((n) => {
        const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !n.disabled;
      });
      const hit = btns.find((n) => /開新局/.test(n.innerText || ""));
      if (!hit) return JSON.stringify({ ok: false, why: "找不到開新局確認鍵" });
      hit.scrollIntoView({ block: "center" }); hit.click();
      return JSON.stringify({ ok: true, label: (hit.innerText || "").trim().slice(0, 24) });
    `));
    await sleep(2600);
    ck("⑥ NEW_GAME：按到「開新局」確認", confirmed?.ok === true, confirmed?.label ?? confirmed?.why);

    const afterNewGame = J(await chrome.evaluate(storage()));
    report.newGame = { started, confirmed, before: beforeNewGame, after: afterNewGame };
    const didReset = afterNewGame.profile.challengeOrder === 0
      && beforeNewGame.profile.challengeOrder > 0;
    ck("⑥ NEW_GAME：真的開了新局（否則下面三條是空過的）",
      didReset, `挑戰 ${beforeNewGame.profile.challengeOrder} → ${afterNewGame.profile.challengeOrder}`);
    if (didReset) {
      ck("⭐ ⑥ NEW_GAME_RESET：profile 重置", afterNewGame.profile.challengeOrder === 0);
      ck("⭐ ⑥ NEW_GAME_RESET：heroProgress **一起**重置（不殘留上一局熟練）",
        afterNewGame.hero.maxLevel <= 1, `maxLevel=${afterNewGame.hero.maxLevel}（重置前 ${beforeNewGame.hero.maxLevel}）`);
      ck("⭐ ⑥ NEW_GAME_RESET：season **一起**重置",
        afterNewGame.season.count === 0, `${afterNewGame.season.count} 筆（重置前 ${beforeNewGame.season.count}）`);
      ck("⑥ NEW_GAME_RESET：沒有殘留額外的 esmo 鍵",
        afterNewGame.keys.every((k) => [PROFILE_KEY, HERO_KEY, SEASON_KEY].includes(k)),
        afterNewGame.keys.join(","));
      ck("⑥ NEW_GAME_RESET：重置後也沒有存檔失敗提示",
        J(await chrome.evaluate(screen())).saveNotice === false);
    }

    // ══ ⑨ Mobile 390 ═══════════════════════════════════════════════════
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await chrome.navigate(url);
    await sleep(2500);
    const mobileBoard = await gotoBoard(chrome, sleep);
    ck("⑨ MOBILE_390：進得了挑戰看板", mobileBoard);
    if (mobileBoard) {
      await sleep(800);
      const m = J(await chrome.evaluate(screen()));
      report.mobile = m;
      ck("⑨ MOBILE_390：看板正常", m.cards === 5, `${m.cards} 卡`);
      ck("⑨ MOBILE_390：不橫向溢出", m.overflow === false);
      ck("⑨ MOBILE_390：沒有存檔失敗提示", m.saveNotice === false);
    }

    // ══ ⑩ console ══════════════════════════════════════════════════════
    const pageErrs = chrome.pageErrors ?? [];
    report.pageErrors = pageErrs;
    ck("⑩ CONSOLE：無 page-origin uncaught error",
      pageErrs.length === 0, pageErrs.slice(0, 3).join(" ¦ ") || "clean");

    report.notCoveredHere = {
      reason: "正式站沒有 /src/，也沒有把 store 掛到 window（TD-31）",
      cloudBundleContents: "SaveBundle 是記憶體裡的形狀，正式站看不到。內容邊界由本地 check_save_bundle_b1b（86/86）負責",
      seasonSizeAtCap: "tools/measure_season_size.mjs 實測 ~854,650 B（本輪正式站的 season 只有 1 筆）",
    };
    writeFileSync(new URL("prod-b1b.json", OUT), JSON.stringify(report, null, 2), "utf8");
  },
});

finishGate(result);
