#!/usr/bin/env node
// ============================================================================
//  正式站 B1D smoke — 沒有 Supabase 設定時，一切照舊
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_prod_b1d.mjs \
//          --external https://rayhuang0323.github.io/ESMO-/ --timeout 1800000`
//
//  ── 這一支要證明的其實只有一件事 ─────────────────────────────────────────
//  B1D 把 Supabase 接了進來，但**正式站沒有設定憑證**
//  （GitHub Actions 沒有注入任何 `VITE_SUPABASE_*`，實際查過 workflow）。
//  所以這裡驗的是：**加了雲端之後，沒設定的玩家什麼都沒變。**
//
//    · 存檔仍然完整寫在這台裝置上（LocalSaveProvider）
//    · 雲端存檔那一頁**照實說**「這個版本還沒有開放雲端存檔」
//    · 不給一顆按了什麼都不會發生的登入鍵
//    · 不誤顯「雲端同步失敗」
//    · Career / Challenge / Season / 390 都跟 B1C 當時一樣
//
//  ⚠ **驗不到**任何真正的雲端行為 —— 正式站沒有憑證。
//    那要等 B1D.1，見 `notCoveredHere`。
//  ⚠ 正式站沒有 `/src/`、也沒有把 store 掛到 window（TD-31）⇒
//    互動走真實 UI，狀態讀原始 localStorage。
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };
const OUT = new URL("../review/prod-b1d/", import.meta.url);

const PROFILE_KEY = "esmo.profile.v1";
const HERO_KEY = "esmo.heroProgress.v2";
const SEASON_KEY = "esmo.season.v1";

const waitFor = async (chrome, sleep, expr, timeoutMs) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate(`return JSON.stringify({ v: Boolean(${expr}) });`));
    if (r?.v) return { ok: true };
    await sleep(250);
  }
  return { ok: false };
};

const storage = () => `
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const pj = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const pRaw = read(${JSON.stringify(PROFILE_KEY)}) || "";
  const p = pj(pRaw);
  const h = pj(read(${JSON.stringify(HERO_KEY)}));
  const ch = p && p.challenge ? p.challenge : null;
  return JSON.stringify({
    keys: Object.keys(localStorage).filter((k) => k.indexOf("esmo") === 0).sort(),
    //  ⚠ Supabase 的 session 會存在 localStorage 的 sb-* 鍵。沒設定就不該有。
    supabaseKeys: Object.keys(localStorage).filter((k) => k.indexOf("sb-") === 0),
    profileRaw: pRaw, profileBytes: pRaw.length,
    players: p && p.players ? p.players.length : 0,
    days: p && p.meta ? p.meta.days : null,
    training: p && p.players ? p.players.filter((x) => x.training).map((x) => x.id) : [],
    heroSchema: h && h.schema ? h.schema : null,
    challengeOrder: ch && ch.order ? ch.order.length : 0,
    challengeSnapshots: ch && ch.snapshots ? Object.keys(ch.snapshots).length : 0,
  });
`;

const screen = () => `
  const q = (s) => document.querySelector(s);
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"; };
  const text = document.body.innerText || "";
  return JSON.stringify({
    onBoard: !!q('[data-testid="challenge-board"]'),
    cards: document.querySelectorAll('[data-testid^="challenge-candidate-"]').length,
    verify: (q('[data-testid="challenge-verify-result"]')?.innerText || "").replace(/\\s+/g, " ").trim(),
    history: document.querySelectorAll('[data-testid^="challenge-history-"]').length,
    cloudAuthMsg: (q('[data-testid="cloud-auth-message"]')?.innerText || "").trim(),
    cloudScope: (q('[data-testid="cloud-scope-note"]')?.innerText || "").replace(/\\s+/g, " ").trim(),
    hasGoogleBtn: vis(q('[data-testid="cloud-signin-google"]')),
    hasAnonBtn: vis(q('[data-testid="cloud-signin-anonymous"]')),
    hasSyncCard: vis(q('[data-testid="cloud-sync-card"]')),
    cloudNotice: vis(q('[data-testid="cloud-sync-notice"]')),
    saveNotice: vis(q('[data-testid="save-status-notice"]')),
    //  ⚠ 玩家看得到的字裡不得出現工程詞。
    banned: ["Supabase", "supabase", "RLS", "JWT", "anon key", "service_role"].filter((w) => text.includes(w)),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    bodyLen: text.length,
  });
`;

async function goto(chrome, sleep, id, marker) {
  for (const step of [
    `document.querySelector('[data-testid="home-utility-${id}"]')?.click()`,
    `document.querySelector('[data-testid="home-nav-more"]')?.click()`,
    `document.querySelector('[data-testid="home-sheet-${id}"]')?.click()`,
  ]) {
    await chrome.evaluate(`${step}; return JSON.stringify({});`);
    await sleep(600);
    if ((await waitFor(chrome, sleep, `document.querySelector('${marker}')`, 4000)).ok) return true;
  }
  return false;
}
const gotoBoard = (c, s) => goto(c, s, "playerChallenge", '[data-testid="challenge-board"]');
const gotoCloud = (c, s) => goto(c, s, "cloudSave", '[data-testid="cloud-auth-card"]');

async function playFormal(chrome, sleep, key) {
  if (!(await gotoBoard(chrome, sleep))) return { ok: false, why: "沒有進到挑戰看板" };
  const started = J(await chrome.evaluate(`
    const b = document.querySelector('[data-testid="challenge-start-${key}"]');
    if (!b || b.disabled) return JSON.stringify({ ok: false, why: b ? "按鈕被停用" : "找不到那張卡" });
    b.scrollIntoView({ block: "center" }); b.click();
    return JSON.stringify({ ok: true });
  `));
  if (!started?.ok) return { ok: false, why: started?.why ?? "點不到挑戰" };
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 25000)).ok) {
    return { ok: false, why: "沒有進到手動選角" };
  }
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
  name: "正式站 B1D — 沒有雲端設定時一切照舊",
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

    await chrome.evaluate(`
      for (const k of Object.keys(localStorage)) { if (k.indexOf("esmo") === 0 || k.indexOf("sb-") === 0) localStorage.removeItem(k); }
      return JSON.stringify({});
    `);
    await chrome.navigate(url); await sleep(2500);

    // ══ ① 雲端存檔那一頁：沒設定就要誠實 ═══════════════════════════════
    const onCloud = await gotoCloud(chrome, sleep);
    ck("① 進得了雲端存檔頁", onCloud);
    await sleep(500);
    let v = J(await chrome.evaluate(screen()));
    report.cloudScreen = v;
    ck("⭐ ① 照實說「這個版本還沒有開放雲端存檔」",
      v.cloudAuthMsg === "這個版本還沒有開放雲端存檔", v.cloudAuthMsg);
    ck("⭐ ① **不給**按了沒反應的登入鍵",
      v.hasGoogleBtn === false && v.hasAnonBtn === false);
    ck("① 沒登入就不顯示同步狀態卡", v.hasSyncCard === false);
    ck("⭐ ① **不誤顯**雲端同步失敗", v.cloudNotice === false);
    ck("⭐ ① 明說這不是防作弊機制", /不是.{0,6}防作弊/.test(v.cloudScope), v.cloudScope.slice(0, 50));
    ck("① 玩家看得到的字裡沒有工程詞", v.banned.length === 0, v.banned.join(","));
    ck("⭐ ① 沒有任何 Supabase session 鍵（真的沒連過）",
      (J(await chrome.evaluate(storage())).supabaseKeys ?? []).length === 0);

    // ══ ② LocalSaveProvider 仍然正常（本輪最重要的一條）═════════════════
    await chrome.navigate(url); await sleep(2200);
    const okBoard = await gotoBoard(chrome, sleep);
    ck("② 進得了挑戰看板", okBoard);
    await sleep(600);
    const key = J(await chrome.evaluate(`
      const n = document.querySelector('[data-testid^="challenge-start-"]');
      return JSON.stringify({ key: (n ? n.getAttribute("data-testid") : "").replace("challenge-start-", "") });
    `))?.key;
    ck("② 取得候選對手", !!key, String(key));
    if (!key) return;

    const played = await playFormal(chrome, sleep, key);
    ck("⭐ ② CHALLENGE：Manual Draft → Battle → Result 走得完", played.ok, played.why ?? "");
    if (!played.ok) return;
    await chrome.evaluate(`document.querySelector('[data-testid="challenge-verify-btn"]')?.click(); return JSON.stringify({});`);
    await waitFor(chrome, sleep, `document.querySelector('[data-testid="challenge-verify-result"]')`, 180000);
    await sleep(500);
    v = J(await chrome.evaluate(screen()));
    ck("⭐ ② REPLAY 與當初一致", /一致|相同/.test(v.verify) && !/不一致/.test(v.verify), v.verify);

    const st1 = J(await chrome.evaluate(storage()));
    report.afterPlay = { keys: st1.keys, players: st1.players, order: st1.challengeOrder };
    ck("⭐ ② LOCAL_FALLBACK：存檔完整寫在這台裝置上",
      st1.players > 0 && st1.challengeOrder > 0 && st1.challengeSnapshots > 0,
      `players=${st1.players} 挑戰=${st1.challengeOrder} 快照=${st1.challengeSnapshots}`);
    ck("⭐ ② 磁碟上只有既有那三個鍵（沒有新增雲端相關的東西）",
      st1.keys.every((k) => [PROFILE_KEY, HERO_KEY, SEASON_KEY].includes(k)), st1.keys.join(","));
    ck("② heroProgress 仍帶 B1C 的版本信封", st1.heroSchema === "HeroProgress.v3", String(st1.heroSchema));
    ck("② 正常情況沒有存檔失敗提示", v.saveNotice === false);

    // ══ ③ Training → reload 仍在（永久狀態）═════════════════════════════
    await chrome.navigate(url); await sleep(2400);
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
    await chrome.evaluate(`
      const names = ["覆盤分析", "戰術研討", "心理訓練", "走位特訓", "團隊默契"];
      const hit = [...document.querySelectorAll("button")].filter((n) => {
        const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !n.disabled;
      }).find((n) => names.some((x) => (n.innerText || "").includes(x)));
      if (hit) { hit.scrollIntoView({ block: "center" }); hit.click(); }
      return JSON.stringify({});
    `);
    await sleep(1600);
    const afterTrain = J(await chrome.evaluate(storage()));
    const trained = afterTrain.training.length > beforeTrain.training.length;
    ck("③ TRAINING：真的安排到訓練（否則下一條空過）", intoTraining?.ok && trained,
      `${beforeTrain.training.length} → ${afterTrain.training.length}`);
    if (trained) {
      await chrome.navigate(url); await sleep(2600);
      ck("⭐ ③ CAREER：reload 之後訓練仍在",
        JSON.stringify(J(await chrome.evaluate(storage())).training) === JSON.stringify(afterTrain.training));
    }

    // ══ ④ Season ═══════════════════════════════════════════════════════
    const seasonClicked = J(await chrome.evaluate(`
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
    ck("⭐ ④ SEASON：賽事頁打得開且有內容",
      seasonClicked.clicked && seasonBody.len > 200 && seasonBody.looksLikeSeason && !seasonBody.crashed,
      JSON.stringify(seasonBody));

    // ══ ⑤ Mobile 390 ═══════════════════════════════════════════════════
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await chrome.navigate(url); await sleep(2500);
    const mBoard = await gotoBoard(chrome, sleep);
    ck("⑤ MOBILE_390：進得了挑戰看板", mBoard);
    if (mBoard) {
      await sleep(600);
      const m = J(await chrome.evaluate(screen()));
      report.mobile = m;
      ck("⑤ MOBILE_390：看板正常", m.cards === 5, `${m.cards} 卡`);
      ck("⑤ MOBILE_390：不橫向溢出", m.overflow === false);
      ck("⑤ MOBILE_390：沒有存檔／同步失敗提示", m.saveNotice === false && m.cloudNotice === false);
    }
    await chrome.navigate(url); await sleep(2200);
    const mCloud = await gotoCloud(chrome, sleep);
    ck("⑤ MOBILE_390：雲端存檔頁也進得去", mCloud);
    if (mCloud) {
      await sleep(500);
      const mc = J(await chrome.evaluate(screen()));
      ck("⭐ ⑤ MOBILE_390：雲端頁照實說沒開放，且不橫向溢出",
        mc.cloudAuthMsg === "這個版本還沒有開放雲端存檔" && mc.overflow === false, mc.cloudAuthMsg);
    }

    // ══ console ═════════════════════════════════════════════════════════
    const pageErrs = chrome.pageErrors ?? [];
    report.pageErrors = pageErrs;
    ck("⑥ CONSOLE：無 page-origin uncaught error",
      pageErrs.length === 0, pageErrs.slice(0, 3).join(" ¦ ") || "clean");

    report.notCoveredHere = {
      reason: "正式站沒有設定 VITE_SUPABASE_*（GitHub Actions 沒有注入任何 secret，已查過 workflow）",
      cloudBehaviour: "真正的登入 / 寫入 / 讀回 / RLS 全部未驗證 —— 那是 B1D.1，需要 Owner 先在 Supabase 後台完成設定",
      whatThisProves: "只證明『加了雲端之後，沒設定的玩家什麼都沒變』",
    };
    writeFileSync(new URL("prod-b1d.json", OUT), JSON.stringify(report, null, 2), "utf8");
  },
});

finishGate(result);
