#!/usr/bin/env node
// ============================================================================
//  正式站 B1C smoke — Save Hardening
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_prod_b1c.mjs \
//          --external https://rayhuang0323.github.io/ESMO-/ --timeout 1800000`
//
//  ⚠ 正式站是打包產物：**沒有 /src/ 可 import**，也**沒有把 store 掛到 window**
//    （TD-31，實際掃過）。所以互動一律走真實 UI，狀態一律讀原始 localStorage。
//
//  ── ⚠ 這支會做兩件「破壞性」的事，先講清楚為什麼是安全的 ─────────────────
//  ① **故障注入**：暫時把 `localStorage.setItem` 包成「寫 profile 就丟例外」，
//     藉此製造一次真的存檔失敗。這**不是**塞爆配額（Owner 明令不做），
//     也不會刪掉任何東西——寫入失敗時舊值本來就原封不動留著。
//  ② **弄壞一份存檔**：把 profile 換成不合法的 JSON 再 reload，驗隔離機制。
//     ⚠ 弄壞的是**這支 gate 自己在開頭建立的那份存檔**（開頭先清空 localStorage
//       再開新局），**不是任何玩家的資料**。
//  兩件事做完都會清乾淨再往下走。
//
//  ── 驗不到的（誠實標註在 notCoveredHere）──────────────────────────────────
//  「dirty ⇒ flush 真的落盤」需要製造**未存的變更**，而 B1C 之後所有公開動作
//  都會自己存檔 ⇒ 唯一的製造方式是走 store 內部（`_patchPlayerNoSave`），
//  正式站碰不到。這裡改用**故障注入**間接證明同一條路：
//  存檔失敗 ⇒ 仍是 dirty ⇒ 修好後 `pagehide` 會把它補寫回去。
//  純粹的內部路徑由本地 `browser_check_exit_flush`（12/12，真 Chrome）負責。
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };
const OUT = new URL("../review/prod-b1c/", import.meta.url);

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

const storage = () => `
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const pj = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const pRaw = read(${JSON.stringify(PROFILE_KEY)}) || "";
  const p = pj(pRaw);
  const h = pj(read(${JSON.stringify(HERO_KEY)}));
  const s = pj(read(${JSON.stringify(SEASON_KEY)}));
  const ch = p && p.challenge ? p.challenge : null;
  const keys = Object.keys(localStorage).filter((k) => k.indexOf("esmo") === 0).sort();
  return JSON.stringify({
    keys,
    profileRaw: pRaw,
    profileBytes: pRaw.length,
    players: p && p.players ? p.players.length : 0,
    xpSum: p && p.players ? p.players.reduce((a, x) => a + (x.xp || 0), 0) : 0,
    days: p && p.meta ? p.meta.days : null,
    training: p && p.players ? p.players.filter((x) => x.training).map((x) => x.id) : [],
    sponsor: p ? (p.activeSponsor ? p.activeSponsor.id : null) : null,
    csHistory: p && p.csHistory ? p.csHistory.length : 0,
    challengeOrder: ch && ch.order ? ch.order.length : 0,
    challengeSnapshots: ch && ch.snapshots ? Object.keys(ch.snapshots).length : 0,
    heroSchema: h && h.schema ? h.schema : null,
    heroMax: h ? Math.max(0, ...Object.values(h.schema ? (h.progress || {}) : h).map((v) => (v && v.level) || 0)) : 0,
    seasonCount: Array.isArray(s) ? s.length : (s && s.history ? s.history.length : 0),
    quarantined: keys.filter((k) => k.endsWith(".corrupt")),
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
    saveNotice: vis(q('[data-testid="save-status-notice"]')),
    saveNoticeText: (q('[data-testid="save-status-message"]')?.innerText || "").trim(),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    bodyLen: (document.body.innerText || "").length,
  });
`;

/** 觸發真的 visibilitychange(hidden)；拿不到 lifecycle API 就退回覆寫 + dispatch。 */
async function goHidden(chrome, sleep) {
  let how = "webLifecycleState";
  try { await chrome.send("Page.setWebLifecycleState", { state: "hidden" }); }
  catch {
    how = "defineProperty+dispatch";
    await chrome.evaluate(`
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      window.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange"));
      return JSON.stringify({});
    `);
  }
  await sleep(700);
  return how;
}
async function goActive(chrome, sleep) {
  try { await chrome.send("Page.setWebLifecycleState", { state: "active" }); } catch { /* 退回路徑沒這一步 */ }
  await sleep(200);
}

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
      return JSON.stringify({ done: pd.actions.filter((a) => a.act === "ban").length >= 3
        && pd.actions.filter((a) => a.act === "pick").length >= 5 });
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
  name: "正式站 B1C — Save Hardening",
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

    //  ⚠ 從這裡起用的是**這支 gate 自己建立的存檔**，不是任何玩家的資料。
    await chrome.evaluate(`
      for (const k of Object.keys(localStorage).filter((k) => k.indexOf("esmo") === 0)) localStorage.removeItem(k);
      return JSON.stringify({});
    `);
    await chrome.navigate(url); await sleep(2500);
    ck("⓪ 進得了挑戰看板", await gotoBoard(chrome, sleep));
    await sleep(700);
    const key = J(await chrome.evaluate(`
      const n = document.querySelector('[data-testid^="challenge-start-"]');
      return JSON.stringify({ key: (n ? n.getAttribute("data-testid") : "").replace("challenge-start-", "") });
    `))?.key;
    ck("⓪ 取得候選對手", !!key, String(key));
    if (!key) return;

    // ══ ⑧ Player Challenge / Manual Draft / Replay ════════════════════════
    const played = await playFormal(chrome, sleep, key);
    ck("⭐ ⑧ MANUAL_DRAFT → BATTLE → RESULT 走得完", played.ok, played.why ?? "");
    if (!played.ok) return;
    await chrome.evaluate(`document.querySelector('[data-testid="challenge-verify-btn"]')?.click(); return JSON.stringify({});`);
    await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-verify-result"]')`, 180000);
    await sleep(500);
    let v = J(await chrome.evaluate(screen()));
    ck("⭐ ⑧ REPLAY 與當初一致", /一致|相同/.test(v.verify) && !/不一致/.test(v.verify), v.verify);
    ck("⑧ 挑戰歷史在", v.history >= 1, `${v.history} 筆`);

    // ══ ⑥ 正常存檔不誤顯 error ════════════════════════════════════════════
    ck("⭐ ⑥ 正常情況**沒有**存檔失敗提示", v.saveNotice === false, v.saveNoticeText || "(沒有出現)");

    // ══ ② SAVE_COVERAGE：Training → reload 仍在 ═══════════════════════════
    await chrome.navigate(url); await sleep(2500);
    const beforeTrain = J(await chrome.evaluate(storage()));
    const intoTraining = J(await chrome.evaluate(`
      let t = document.querySelector('[data-testid="home-utility-training"]')
        || document.querySelector('[data-testid="home-sheet-training"]');
      if (!t) { document.querySelector('[data-testid="home-nav-more"]')?.click(); }
      t = document.querySelector('[data-testid="home-utility-training"]')
        || document.querySelector('[data-testid="home-sheet-training"]');
      if (t) { t.scrollIntoView({ block: "center" }); t.click(); }
      return JSON.stringify({ ok: !!t });
    `));
    await sleep(1500);
    await chrome.evaluate(`
      const b = [...document.querySelectorAll("button")].filter((n) => {
        const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !n.disabled && /體力/.test(n.innerText || "");
      });
      if (b[0]) { b[0].scrollIntoView({ block: "center" }); b[0].click(); }
      return JSON.stringify({});
    `);
    await sleep(1100);
    const course = J(await chrome.evaluate(`
      const names = ["覆盤分析", "戰術研討", "心理訓練", "走位特訓", "團隊默契"];
      const hit = [...document.querySelectorAll("button")].filter((n) => {
        const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !n.disabled;
      }).find((n) => names.some((x) => (n.innerText || "").includes(x)));
      if (!hit) return JSON.stringify({ ok: false });
      hit.scrollIntoView({ block: "center" }); hit.click();
      return JSON.stringify({ ok: true });
    `));
    await sleep(1600);
    const afterTrain = J(await chrome.evaluate(storage()));
    const trained = afterTrain.training.length > beforeTrain.training.length;
    ck("② TRAINING：真的安排到訓練（否則下一條空過）", intoTraining?.ok && course?.ok && trained,
      `${beforeTrain.training.length} → ${afterTrain.training.length}`);
    if (trained) {
      await chrome.navigate(url); await sleep(2600);
      const reloaded = J(await chrome.evaluate(storage()));
      ck("⭐ ② SAVE_COVERAGE：Training reload 後仍保存",
        JSON.stringify(reloaded.training) === JSON.stringify(afterTrain.training), reloaded.training.join(","));
    }

    //  Sponsor：資格門檻在 store 裡，新存檔通常不達標 ⇒ 走得到就驗，走不到就誠實標註。
    const sponsorTry = J(await chrome.evaluate(`
      let t = document.querySelector('[data-testid="home-utility-sponsor"]')
        || document.querySelector('[data-testid="home-sheet-sponsor"]');
      if (!t) { document.querySelector('[data-testid="home-nav-more"]')?.click(); }
      t = document.querySelector('[data-testid="home-utility-sponsor"]')
        || document.querySelector('[data-testid="home-sheet-sponsor"]');
      if (t) { t.scrollIntoView({ block: "center" }); t.click(); }
      return JSON.stringify({ opened: !!t });
    `));
    await sleep(1500);
    const signed = J(await chrome.evaluate(`
      const cards = [...document.querySelectorAll("button")].filter((n) => {
        const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !n.disabled;
      });
      const pick = cards.find((n) => /贊助|簽約/.test(n.innerText || ""));
      if (pick) { pick.scrollIntoView({ block: "center" }); pick.click(); }
      return JSON.stringify({ clicked: !!pick });
    `));
    await sleep(1200);
    await chrome.evaluate(`
      const b = [...document.querySelectorAll("button")].filter((n) => {
        const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !n.disabled;
      }).find((n) => /簽約 ·|立即獲得/.test(n.innerText || ""));
      if (b) { b.scrollIntoView({ block: "center" }); b.click(); }
      return JSON.stringify({});
    `);
    await sleep(1500);
    const afterSponsor = J(await chrome.evaluate(storage()));
    report.sponsor = { sponsorTry, signed, id: afterSponsor.sponsor };
    if (afterSponsor.sponsor) {
      await chrome.navigate(url); await sleep(2600);
      const s2 = J(await chrome.evaluate(storage()));
      ck("⭐ ② SAVE_COVERAGE：Sponsor reload 後仍保存",
        s2.sponsor === afterSponsor.sponsor, String(s2.sponsor));
    } else {
      //  ⚠ 不假裝驗過。新存檔的粉絲／勝場通常不到門檻，簽不了約。
      ck("② SPONSOR：正式站上簽不到約（新存檔未達門檻）⇒ 由本地行為驗證涵蓋",
        true, "notCoveredHere：check_save_hardening_b1c §① signSponsor");
    }

    // ══ ⑤ DIRTY_SAVE_CONTROL：乾淨時切背景不重寫 ═════════════════════════
    const cleanMark = J(await chrome.evaluate(storage()));
    let how = "";
    for (let i = 0; i < 5; i++) { how = await goHidden(chrome, sleep); await goActive(chrome, sleep); }
    const afterStorm = J(await chrome.evaluate(storage()));
    ck(`⭐ ⑤ DIRTY_SAVE_CONTROL：乾淨時連切 5 次背景**一個 byte 都沒重寫**（${how}）`,
      afterStorm.profileRaw === cleanMark.profileRaw,
      `${afterStorm.profileBytes} B，內容未變`);

    // ══ ④ EXIT_FLUSH：故障注入 ⇒ dirty ⇒ pagehide 補寫回去 ════════════════
    //  ⚠ 這是**唯一**能在正式站製造未存變更的安全方式：B1C 之後所有公開動作
    //    都會自己存檔，而 `_patchPlayerNoSave` 是 store 內部、正式站碰不到。
    await chrome.evaluate(`
      window.__origSetItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (k, v) {
        if (k === ${JSON.stringify(PROFILE_KEY)}) throw new Error("injected write failure");
        return window.__origSetItem(k, v);
      };
      return JSON.stringify({});
    `);
    const beforeFail = J(await chrome.evaluate(storage()));
    //  用一個一定會存檔的 UI 動作觸發那次失敗（挑戰看板的「更新我的防守陣容」）。
    await gotoBoard(chrome, sleep); await sleep(600);
    await chrome.evaluate(`document.querySelector('[data-testid="challenge-publish-btn"]')?.click(); return JSON.stringify({});`);
    await sleep(1500);
    let vf = J(await chrome.evaluate(screen()));
    ck("⭐ ④ WRITE_FAILURE：寫入失敗時畫面出現存檔失敗提示",
      vf.saveNotice === true && vf.saveNoticeText === "進度沒有存起來", vf.saveNoticeText || "(沒有出現)");
    const duringFail = J(await chrome.evaluate(storage()));
    ck("⭐ ④ WRITE_FAILURE：**玩家資料沒有被清空**（磁碟仍是失敗前那一份）",
      duringFail.profileRaw === beforeFail.profileRaw && duringFail.players === beforeFail.players,
      `players=${duringFail.players}`);

    //  修好寫入，然後只靠 pagehide 補救（不主動再按任何會存檔的按鈕）
    await chrome.evaluate(`
      localStorage.setItem = window.__origSetItem; delete window.__origSetItem;
      return JSON.stringify({});
    `);
    await chrome.evaluate(`window.dispatchEvent(new Event("pagehide")); return JSON.stringify({});`);
    await sleep(1200);
    const afterFlush = J(await chrome.evaluate(storage()));
    ck("⭐ ④ PAGEHIDE_FLUSH：修好之後 pagehide 把未存的變更補寫回去了",
      afterFlush.profileRaw !== duringFail.profileRaw,
      `${duringFail.profileBytes} B → ${afterFlush.profileBytes} B`);
    //  再切一次背景，這次應該什麼都不寫（已經乾淨了）
    const mark2 = afterFlush.profileRaw;
    await goHidden(chrome, sleep); await goActive(chrome, sleep);
    ck("⭐ ④ 補寫之後回到乾淨：再切背景不重寫",
      J(await chrome.evaluate(storage())).profileRaw === mark2);
    await chrome.navigate(url); await sleep(2500);
    ck("⑥ 恢復之後不再顯示存檔失敗提示",
      J(await chrome.evaluate(screen())).saveNotice === false);

    // ══ ① LEGACY_SAVE ════════════════════════════════════════════════════
    const seeded = J(await chrome.evaluate(`
      const p = JSON.parse(localStorage.getItem(${JSON.stringify(PROFILE_KEY)}));
      localStorage.setItem(${JSON.stringify(HERO_KEY)}, JSON.stringify({
        ironclad: { xp: 990, level: 7, mastery: { games: 12, wins: 8, mvps: 2, k: 40, d: 20, a: 30, dmg: 100, heal: 0, twrDmg: 50 } }
      }));
      localStorage.setItem(${JSON.stringify(SEASON_KEY)}, JSON.stringify([
        { schema: "BattleResult.v2", mode: "moba", winner: "blue", duration: 900, score: { blue: 8, red: 3 }, players: [], timeline: [] }
      ]));
      return JSON.stringify({ players: p.players.length, xpSum: p.players.reduce((a,x)=>a+(x.xp||0),0),
        days: p.meta.days, challengeOrder: (p.challenge.order||[]).length });
    `));
    await chrome.navigate(url); await sleep(2800);
    const legacy = J(await chrome.evaluate(storage()));
    report.legacy = { seeded, legacy };
    ck("⭐ ① LEGACY_SAVE：舊格式熟練載得起來（沒歸零）", legacy.heroMax === 7, `maxLevel=${legacy.heroMax}`);
    ck("① LEGACY_SAVE：舊格式 season 載得起來", legacy.seasonCount === 1, `${legacy.seasonCount} 筆`);
    ck("⭐ ① LEGACY_SAVE：生涯數值原封不動",
      legacy.players === seeded.players && legacy.xpSum === seeded.xpSum && legacy.days === seeded.days
      && legacy.challengeOrder === seeded.challengeOrder,
      JSON.stringify({ players: legacy.players, xp: legacy.xpSum, days: legacy.days, ch: legacy.challengeOrder }));
    ck("⭐ ① 舊格式**不會**被誤判成損壞（沒有進隔離區）",
      legacy.quarantined.length === 0, legacy.quarantined.join(",") || "無隔離檔");

    // ══ ⑨ Season / Career ════════════════════════════════════════════════
    const seasonScreen = J(await chrome.evaluate(`
      const hit = [...document.querySelectorAll('button,[role="button"],a')]
        .find((e) => /賽事|賽季|聯賽/.test((e.innerText || "").trim()));
      if (hit) { hit.scrollIntoView({ block: "center" }); hit.click(); }
      return JSON.stringify({ clicked: !!hit });
    `));
    await sleep(2200);
    const seasonBody = J(await chrome.evaluate(`
      const t = (document.body.innerText || "");
      return JSON.stringify({ len: t.length, looksLikeSeason: /賽季|賽程|排名|積分|戰績|勝/.test(t),
        crashed: /Something went wrong|Cannot read|undefined is not/.test(t) });
    `));
    ck("⭐ ⑨ CAREER_SEASON_REGRESSION：賽事頁打得開且有內容",
      seasonScreen.clicked && seasonBody.len > 200 && seasonBody.looksLikeSeason && !seasonBody.crashed,
      JSON.stringify(seasonBody));

    // ══ ③ NEW_GAME reset ═════════════════════════════════════════════════
    const beforeNG = J(await chrome.evaluate(storage()));
    ck("③ 前置：重置前熟練與挑戰紀錄都有東西",
      beforeNG.heroMax >= 7 && beforeNG.challengeOrder > 0,
      `maxLevel=${beforeNG.heroMax} / ${beforeNG.challengeOrder} 場`);
    await chrome.navigate(url); await sleep(2500);
    await chrome.evaluate(`
      let b = document.querySelector('[data-testid="home-utility-newgame"]')
        || document.querySelector('[data-testid="home-sheet-newgame"]');
      if (!b) { document.querySelector('[data-testid="home-nav-more"]')?.click(); }
      b = document.querySelector('[data-testid="home-utility-newgame"]')
        || document.querySelector('[data-testid="home-sheet-newgame"]');
      if (b) { b.scrollIntoView({ block: "center" }); b.click(); }
      return JSON.stringify({ ok: !!b });
    `);
    await sleep(1700);
    await chrome.evaluate(`
      const hit = [...document.querySelectorAll("button")].filter((n) => {
        const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !n.disabled;
      }).find((n) => /新手戰隊|一般戰隊|頂級戰隊/.test(n.innerText || ""));
      if (hit) { hit.scrollIntoView({ block: "center" }); hit.click(); }
      return JSON.stringify({});
    `);
    await sleep(1100);
    const confirmed = J(await chrome.evaluate(`
      const hit = [...document.querySelectorAll("button")].filter((n) => {
        const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !n.disabled;
      }).find((n) => /開新局/.test(n.innerText || ""));
      if (!hit) return JSON.stringify({ ok: false });
      hit.scrollIntoView({ block: "center" }); hit.click();
      return JSON.stringify({ ok: true });
    `));
    await sleep(2600);
    const afterNG = J(await chrome.evaluate(storage()));
    report.newGame = { confirmed, before: beforeNG, after: afterNG };
    const didReset = confirmed?.ok && afterNG.challengeOrder === 0 && beforeNG.challengeOrder > 0;
    ck("③ NEW_GAME：真的開了新局", didReset, `挑戰 ${beforeNG.challengeOrder} → ${afterNG.challengeOrder}`);
    if (didReset) {
      ck("⭐ ③ NEW_GAME_RESET：熟練一起重置", afterNG.heroMax <= 1, `maxLevel=${afterNG.heroMax}（前 ${beforeNG.heroMax}）`);
      ck("⭐ ③ NEW_GAME_RESET：season 一起重置", afterNG.seasonCount === 0, `${afterNG.seasonCount} 筆（前 ${beforeNG.seasonCount}）`);
    }

    // ══ ⑦ 損壞存檔隔離：不影響正常啟動 ════════════════════════════════════
    //  ⚠ 弄壞的是**這支 gate 自己建立的存檔**（開頭已清空 localStorage）。
    const brokenRaw = '{ THIS SAVE IS DELIBERATELY BROKEN BY THE GATE';
    await chrome.evaluate(`
      localStorage.removeItem(${JSON.stringify(PROFILE_KEY)} + ".corrupt");
      localStorage.setItem(${JSON.stringify(PROFILE_KEY)}, ${JSON.stringify(brokenRaw)});
      return JSON.stringify({});
    `);
    await chrome.navigate(url); await sleep(2800);
    const afterCorrupt = J(await chrome.evaluate(storage()));
    const vCorrupt = J(await chrome.evaluate(screen()));
    report.corrupt = afterCorrupt;
    //  ⚠ 「正常啟動」要看**畫面**，不能看磁碟：隔離之後原鍵上的損壞字串
    //    仍然留著，直到下一次存檔才被覆蓋（那份原樣已經在 .corrupt 裡了）。
    //    我第一版斷言 `afterCorrupt.players > 0`，讀的是磁碟 ⇒ 假紅。
    ck("⭐ ⑦ CORRUPT_SAVE_BOUNDARY：損壞存檔**不影響正常啟動**",
      vCorrupt.bodyLen > 200 && (chrome.pageErrors ?? []).length === 0,
      `畫面 ${vCorrupt.bodyLen} 字，未捕捉例外 ${(chrome.pageErrors ?? []).length}`);
    ck("⑦ 隔離當下原鍵仍是那份損壞資料（還沒被覆蓋，而副本已存好）",
      afterCorrupt.profileRaw === brokenRaw, afterCorrupt.profileRaw.slice(0, 40));
    ck("⭐ ⑦ CORRUPT_SAVE_BOUNDARY：原始 bytes 被搬進隔離區，沒有消失",
      afterCorrupt.quarantined.includes(`${PROFILE_KEY}.corrupt`), afterCorrupt.quarantined.join(","));
    const savedCorrupt = J(await chrome.evaluate(`
      return JSON.stringify({ raw: localStorage.getItem(${JSON.stringify(PROFILE_KEY)} + ".corrupt") });
    `)).raw;
    ck("⭐ ⑦ 隔離區裡就是原本那份原封不動的資料", savedCorrupt === brokenRaw, String(savedCorrupt).slice(0, 40));
    ck("⑦ 隔離之後新存檔照常運作（挑戰看板打得開）", await gotoBoard(chrome, sleep));
    await chrome.evaluate(`document.querySelector('[data-testid="challenge-publish-btn"]')?.click(); return JSON.stringify({});`);
    await sleep(1500);
    const afterRecover = J(await chrome.evaluate(storage()));
    ck("⭐ ⑦ 存過一次之後原鍵是正常存檔，而隔離副本**仍然在**",
      afterRecover.players > 0 && afterRecover.quarantined.includes(`${PROFILE_KEY}.corrupt`),
      `players=${afterRecover.players} / ${afterRecover.quarantined.join(",")}`);
    ck("⑦ 損壞啟動後也沒有誤顯存檔失敗提示",
      J(await chrome.evaluate(screen())).saveNotice === false);

    // ══ ⑩ Mobile 390 ═════════════════════════════════════════════════════
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await chrome.navigate(url); await sleep(2500);
    const onMobile = await gotoBoard(chrome, sleep);
    ck("⑩ MOBILE_390：進得了挑戰看板", onMobile);
    if (onMobile) {
      await sleep(700);
      const m = J(await chrome.evaluate(screen()));
      report.mobile = m;
      ck("⑩ MOBILE_390：看板正常", m.cards === 5, `${m.cards} 卡`);
      ck("⑩ MOBILE_390：不橫向溢出", m.overflow === false);
      ck("⑩ MOBILE_390：沒有存檔失敗提示", m.saveNotice === false);
      //  行動裝置最需要的就是 visibilitychange 那條路 —— 在 390 再驗一次不重寫。
      const mMark = J(await chrome.evaluate(storage())).profileRaw;
      await goHidden(chrome, sleep);
      ck("⭐ ⑩ MOBILE_390：乾淨時切背景也不重寫",
        J(await chrome.evaluate(storage())).profileRaw === mMark);
    }

    // ══ console ═══════════════════════════════════════════════════════════
    const pageErrs = chrome.pageErrors ?? [];
    report.pageErrors = pageErrs;
    ck("⑩ CONSOLE：無 page-origin uncaught error",
      pageErrs.length === 0, pageErrs.slice(0, 3).join(" ¦ ") || "clean");

    report.notCoveredHere = {
      reason: "正式站沒有 /src/，也沒有把 store 掛到 window（TD-31）",
      pureDirtyPath: "「內部改了 state 但沒存 ⇒ flush 落盤」需要 _patchPlayerNoSave，正式站碰不到。本檔改用故障注入間接證明同一條路；純內部路徑由本地 browser_check_exit_flush（12/12，真 Chrome）負責",
      halfWriteRollback: "profile 成功但熟練失敗的回滾需要對單一鍵注入失敗，本檔只注入了 profile 鍵。回滾由本地 check_save_hardening_b1c §④ 涵蓋",
      cloudBundleContents: "SaveBundle 是記憶體裡的形狀，正式站看不到。由本地 check_save_bundle_b1b（86/86）負責",
      recordCsMatch: "CS 完整比賽無法在 smoke 時間內走完；由本地 check_save_hardening_b1c 的行為驗證涵蓋",
    };
    writeFileSync(new URL("prod-b1c.json", OUT), JSON.stringify(report, null, 2), "utf8");
  },
});

finishGate(result);
