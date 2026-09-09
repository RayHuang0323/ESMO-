#!/usr/bin/env node
// ============================================================================
//  正式站 smoke：玩家可見 Bug 修復批次（A CS 生命週期／B MOBA 野怪／C 手機捲動）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_prod_bugfix_release.mjs \
//          --external https://rayhuang0323.github.io/ESMO-/ --timeout 1800000`
//
//  ⚠ 這支跑的是**線上那一份**，不是本地 dist。正式站是打包產物，讀不到 `/src/`，
//    所以互動一律走真實 UI（真 touch／真滾輪），狀態只讀 localStorage。
//    野怪座標與模擬版本改為對線上 bundle 檔案本身做內容比對（不在這支裡）。
//
//  ⚠ 正式站不重跑 15 分鐘的 CS lifecycle benchmark（local 22/22 ＋ 反向測試已完成）。
//    這裡只做一次真實的「進入 → 離開 → 返回同一場」。
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };
const OUT = new URL("../review/prod-bugfix-release/", import.meta.url);

const waitFor = async (chrome, sleep, expr, timeoutMs, label) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate(`return JSON.stringify({ v: Boolean(${expr}) });`));
    if (r?.v) return { ok: true, ms: Date.now() - t0 };
    await sleep(300);
  }
  return { ok: false, ms: Date.now() - t0, label };
};

//  ⚠ 正式站是打包產物，**沒有 `/src/` 可以 import**（本地 gate 用的
//    `RESOLVE_APP_MODULES` 在這裡一定失敗）。只能走 UI ＋ localStorage。
//    存檔不自己捏：清掉之後讓 App 依它自己的流程重建，再從存檔讀回來確認。
const clearSave = () => `
  localStorage.removeItem("esmo.profile.v1");
  return JSON.stringify({ cleared: true });
`;
const readSave = () => `
  const raw = localStorage.getItem("esmo.profile.v1");
  const st = raw ? JSON.parse(raw) : null;
  return JSON.stringify({ has: !!st, players: st?.players?.length ?? 0 });
`;

async function touchDrag(chrome, sleep, { dy, steps = 10 }) {
  const card = J(await chrome.evaluate(`
    const el = document.querySelector('[data-testid="hero-grid-scroll"]');
    if (!el) return JSON.stringify({ ok: false });
    const r = el.getBoundingClientRect();
    const cards = [...el.querySelectorAll('[data-testid="hero-card"]')].filter((c) => {
      const cr = c.getBoundingClientRect();
      return cr.top >= r.top && cr.bottom <= r.bottom;
    });
    const c = cards[Math.floor(cards.length / 2)] ?? cards[0];
    if (!c) return JSON.stringify({ ok: false });
    const cr = c.getBoundingClientRect();
    return JSON.stringify({ ok: true, x: Math.round(cr.left + cr.width / 2), y: Math.round(cr.top + cr.height / 2),
      hero: c.getAttribute("data-hero"),
      scrollTop: el.scrollTop, doc: document.scrollingElement.scrollTop,
      picked: document.querySelectorAll('[data-testid="pick-avatar"]').length });
  `));
  if (!card?.ok) return { ok: false };
  const touch = (type, py) => chrome.send("Input.dispatchTouchEvent", {
    type, touchPoints: type === "touchEnd" ? [] : [{ x: card.x, y: py, radiusX: 12, radiusY: 12, force: 1 }],
  });
  await touch("touchStart", card.y);
  await sleep(30);
  for (let i = 1; i <= steps; i++) { await touch("touchMove", Math.round(card.y - (dy * i) / steps)); await sleep(24); }
  await sleep(60);
  await touch("touchEnd", Math.round(card.y - dy));
  await sleep(500);
  const after = J(await chrome.evaluate(`
    const el = document.querySelector('[data-testid="hero-grid-scroll"]');
    return JSON.stringify({ scrollTop: el ? el.scrollTop : null, doc: document.scrollingElement.scrollTop,
      picked: document.querySelectorAll('[data-testid="pick-avatar"]').length,
      stillOnBanPick: !!document.querySelector('[data-testid="hero-grid-scroll"]') });
  `));
  return { ok: true, before: { scrollTop: card.scrollTop, doc: card.doc, picked: card.picked }, after, hero: card.hero };
}

async function touchTap(chrome, sleep) {
  const target = J(await chrome.evaluate(`
    const el = document.querySelector('[data-testid="hero-grid-scroll"]');
    const r = el.getBoundingClientRect();
    const b = [...el.querySelectorAll('[data-testid="hero-choose"]')].find((n) => {
      const q = n.getBoundingClientRect();
      return q.top >= r.top && q.bottom <= r.bottom && q.top >= 0 && q.bottom <= innerHeight;
    });
    if (!b) return JSON.stringify({ ok: false });
    const q = b.getBoundingClientRect();
    return JSON.stringify({ ok: true, x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2),
      hero: b.getAttribute("data-hero") });
  `));
  if (!target?.ok) return { ok: false };
  const pt = [{ x: target.x, y: target.y, radiusX: 12, radiusY: 12, force: 1 }];
  await chrome.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
  await sleep(60);
  await chrome.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(800);
  const after = J(await chrome.evaluate(`
    return JSON.stringify({ log: document.querySelector('[data-testid="draft-log"]')?.innerText?.slice(0, 60) ?? null });
  `));
  return { ok: true, hero: target.hero, ...after };
}

/** 正式玩家路徑：首頁 → 賽前配置 → 配對過場 → Ban/Pick。 */
async function gotoBanPick(chrome, sleep) {
  const t0 = Date.now();
  const fail = (why) => ({ ok: false, ms: Date.now() - t0, why });
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="home-mode-moba"]')`, 40000)).ok) {
    return fail("首頁沒有 MOBA 入口");
  }
  await chrome.evaluate(`
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    [...document.querySelectorAll('[data-testid="home-mode-moba"]')].find(vis)?.click();
    return JSON.stringify({});
  `);
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')`, 40000)).ok) {
    return fail("沒有進到賽前配置");
  }
  const seen = [];
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    if (J(await chrome.evaluate(`return JSON.stringify({ v: !!document.querySelector('[data-testid="matchmaking-enter-banpick"]') });`))?.v) break;
    if (J(await chrome.evaluate(`return JSON.stringify({ v: !!document.querySelector('[data-testid="hero-grid-scroll"]') });`))?.v) break;
    const a = J(await chrome.evaluate(`
      const el = document.querySelector('[data-testid="prep-primary-action"]');
      return JSON.stringify({ action: el?.dataset.action ?? null, disabled: !!el?.disabled });
    `));
    if (!a?.action) { await sleep(500); continue; }
    const tag = `${a.action}${a.disabled ? "(disabled)" : ""}`;
    if (seen[seen.length - 1] !== tag) seen.push(tag);
    if (a.action === "blocked") {
      await chrome.evaluate(`
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        [...document.querySelectorAll("button")].filter(vis)
          .find((n) => !n.disabled && (n.innerText || "").includes("自動"))?.click();
        return JSON.stringify({});
      `);
      await sleep(700); continue;
    }
    if (!a.disabled) {
      await chrome.evaluate(`document.querySelector('[data-testid="prep-primary-action"]')?.click(); return JSON.stringify({});`);
      await sleep(800); continue;
    }
    await sleep(600);
  }
  console.log(`   賽前 action 序列：${seen.join(" → ") || "(直接返回進行中的場次)"}`);
  if (J(await chrome.evaluate(`return JSON.stringify({ v: !!document.querySelector('[data-testid="matchmaking-enter-banpick"]') });`))?.v) {
    await waitFor(chrome, sleep, `!document.querySelector('[data-testid="matchmaking-enter-banpick"]').disabled`, 25000);
    await chrome.evaluate(`document.querySelector('[data-testid="matchmaking-enter-banpick"]')?.click(); return JSON.stringify({});`);
  }
  const w = await waitFor(chrome, sleep, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 40000);
  return w.ok ? { ok: true, ms: Date.now() - t0 } : fail(`沒有進到 Ban/Pick（序列：${seen.join(" → ") || "無"}）`);
}

const result = await runGate({
  name: "正式站 Bugfix Release smoke",
  externalUrl: process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/",
  run: async ({ chrome, url, ck, sleep }) => {
    mkdirSync(OUT, { recursive: true });
    const report = { url };
    console.log(`\n目標：${url}`);

    // ══ §5/§B 野怪座標與模擬版本 ═══════════════════════════════════════════
    //  ⚠ 正式站沒有 `/src/` 可 import，讀不到 gameData / simulationVersion 模組。
    //    這兩項改為對**線上實際 bundle 檔案本身**做內容比對（見
    //    review/prod-bugfix-release/bundle-facts.json，由 release 流程產生），
    //    這裡只驗「線上真的載得起來、MOBA 真的進得去」——不假裝驗了讀不到的東西。
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url); await sleep(2500);
    const boot = J(await chrome.evaluate(`
      return JSON.stringify({ title: document.title,
        bundle: [...document.querySelectorAll("script[src]")].map((n) => n.getAttribute("src")).find((v) => /index-/.test(v)) ?? null,
        home: !!document.querySelector('[data-testid="home-mode-moba"]') });
    `));
    report.boot = boot;
    ck("① 正式站載得起來且首頁就緒", !!boot?.home, JSON.stringify(boot));

    //  存檔不自己捏：清掉之後讓 App 依它自己的流程重建。
    await chrome.evaluate(clearSave());
    await chrome.navigate(url); await sleep(2500);

    // ══ §6 桌機 Ban/Pick ════════════════════════════════════════════════════
    const dn = await gotoBanPick(chrome, sleep);
    ck("④ 桌機進得了 Ban/Pick（MOBA entry）", dn.ok, dn.ok ? `${(dn.ms / 1000).toFixed(1)}s` : dn.why);
    if (dn.ok) {
      const gd = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid="hero-grid-scroll"]');
        const r = el.getBoundingClientRect();
        return JSON.stringify({ client: el.clientHeight, scroll: el.scrollHeight,
          x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), before: el.scrollTop });
      `));
      await chrome.send("Input.dispatchMouseEvent",
        { type: "mouseWheel", x: gd.x, y: gd.y, deltaX: 0, deltaY: 300, pointerType: "mouse" });
      await sleep(400);
      const wheel = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid="hero-grid-scroll"]');
        return JSON.stringify({ after: el.scrollTop, doc: document.scrollingElement.scrollTop });
      `));
      ck("④ DESKTOP_BANPICK：滾輪捲得動英雄格", gd.scroll > gd.client && wheel.after > gd.before,
        `${gd.scroll}/${gd.client}｜top ${gd.before}→${wheel.after}`);
      const dpos = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid="hero-grid-scroll"]');
        const r = el.getBoundingClientRect();
        const b = [...el.querySelectorAll('[data-testid="hero-choose"]')].find((n) => {
          const q = n.getBoundingClientRect(); return q.top >= r.top && q.bottom <= r.bottom;
        });
        const q = b.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2) });
      `));
      for (const type of ["mousePressed", "mouseReleased"]) {
        await chrome.send("Input.dispatchMouseEvent", { type, x: dpos.x, y: dpos.y, button: "left", clickCount: 1 });
      }
      await sleep(800);
      const dlog = J(await chrome.evaluate(`
        return JSON.stringify({ log: document.querySelector('[data-testid="draft-log"]')?.innerText?.slice(0, 60) ?? null });
      `));
      report.desktop = { gd, wheel, dlog };
      ck("④ 桌機點擊仍可選角", !!dlog?.log && /禁用|選擇/.test(dlog.log), dlog?.log ?? "(無)");
    }

    // ══ §6 手機 390 真 touch ════════════════════════════════════════════════
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await chrome.navigate(url); await sleep(2000);
    const mn = await gotoBanPick(chrome, sleep);
    ck("⑤ 390px 走正式流程進得了 Ban/Pick", mn.ok, mn.ok ? `${(mn.ms / 1000).toFixed(1)}s` : mn.why);
    if (mn.ok) {
      const g = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid="hero-grid-scroll"]');
        const r = el.getBoundingClientRect();
        return JSON.stringify({ client: el.clientHeight, scroll: el.scrollHeight, bottom: Math.round(r.bottom), vh: innerHeight });
      `));
      ck("⑤ 版面有形成可捲 viewport", g.scroll > g.client, `scroll ${g.scroll} vs client ${g.client}`);
      ck("⑤ 捲動區沒有掉出畫面", g.bottom <= g.vh + 1, `bottom ${g.bottom} vs ${g.vh}`);

      const d = await touchDrag(chrome, sleep, { dy: 220 });
      report.mobileDrag = d;
      ck("⑤ MOBILE_TOUCH_SCROLL：單指上滑 scrollTop 改變",
        d.ok && d.after.scrollTop > d.before.scrollTop, `${d.before?.scrollTop} → ${d.after?.scrollTop}`);
      ck("⑤ document 沒有跟著滑", d.ok && d.after.doc === d.before.doc, `${d.before?.doc} → ${d.after?.doc}`);
      ck("⑤ 滑動沒有誤選英雄",
        d.ok && d.after.picked === d.before.picked && d.after.stillOnBanPick,
        `已選 ${d.before?.picked} → ${d.after?.picked}（起點卡 ${d.hero}）`);

      for (let i = 0; i < 12; i++) {
        const at = J(await chrome.evaluate(`
          const el = document.querySelector('[data-testid="hero-grid-scroll"]');
          return JSON.stringify({ end: el.scrollHeight - el.scrollTop - el.clientHeight <= 4 });
        `));
        if (at?.end) break;
        await touchDrag(chrome, sleep, { dy: 260, steps: 8 });
      }
      const last = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid="hero-grid-scroll"]');
        const r = el.getBoundingClientRect();
        const cards = [...el.querySelectorAll('[data-testid="hero-card"]')];
        const cr = cards[cards.length - 1]?.getBoundingClientRect();
        return JSON.stringify({ total: cards.length,
          atEnd: el.scrollHeight - el.scrollTop - el.clientHeight <= 4,
          lastInViewport: !!cr && cr.top >= 0 && cr.bottom <= innerHeight + 1, scrollTop: el.scrollTop });
      `));
      report.mobileLast = last;
      ck("⑤ 最後一排英雄看得到", !!last?.atEnd && !!last?.lastInViewport, JSON.stringify(last));

      const tap = await touchTap(chrome, sleep);
      report.mobileTap = tap;
      ck("⑤ 正常 tap 可以選英雄（BAN phase）",
        !!tap?.ok && /禁用/.test(tap.log ?? ""), JSON.stringify(tap));

      for (let i = 0; i < 10; i++) {
        const st = J(await chrome.evaluate(`
          const t = document.querySelector('[data-testid="hero-picker"]')?.innerText ?? "";
          return JSON.stringify({ pick: t.includes("選擇你的英雄"), open: !!document.querySelector('[data-testid="hero-grid-scroll"]') });
        `));
        if (st?.pick) break;
        if (st?.open) await touchTap(chrome, sleep);
        await sleep(900);
      }
      const inPick = J(await chrome.evaluate(`
        const t = document.querySelector('[data-testid="hero-picker"]')?.innerText ?? "";
        return JSON.stringify({ pick: t.includes("選擇你的英雄") });
      `));
      ck("⑤ 進到 PICK phase", !!inPick?.pick, JSON.stringify(inPick));
      if (inPick?.pick) {
        const d2 = await touchDrag(chrome, sleep, { dy: 200 });
        report.mobilePickDrag = d2;
        ck("⑤ phase 切換後仍可單指捲動",
          d2.ok && d2.after.scrollTop > d2.before.scrollTop, `${d2.before?.scrollTop} → ${d2.after?.scrollTop}`);
      }
    }

    // ══ §7 CS 進入 → 離開 → 返回 ════════════════════════════════════════════
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    //  ⚠ 上一段留下一場**進行中的 MOBA 對戰**。帶著它走 CS 流程，賽前頁給的是
    //    「返回對戰」而不是配對，於是永遠走不到地圖選擇——第一版就是這樣紅的。
    //    先清存檔讓 App 依它自己的流程重建，再證明「真的是乾淨狀態」才往下走。
    await chrome.navigate(url); await sleep(1500);
    await chrome.evaluate(clearSave());
    await chrome.navigate(url); await sleep(2500);
    const fresh = J(await chrome.evaluate(`
      const raw = localStorage.getItem("esmo.profile.v1");
      const st = raw ? JSON.parse(raw) : null;
      return JSON.stringify({ hasSave: !!st, hasSession: !!st?.matchmaking?.session,
        home: !!document.querySelector('[data-testid="home-mode-moba"]') });
    `));
    ck("⑥ CS 段的前置：沒有殘留的進行中場次", fresh?.hasSession !== true, JSON.stringify(fresh));

    const cs = await enterCs(chrome, sleep);
    ck("⑥ CS_FIRST_ENTRY：首次 CS → Loading → Battle", cs.ok,
      cs.ok ? `${(cs.ms / 1000).toFixed(1)}s` : cs.why);
    if (cs.ok) {
      const m1 = J(await chrome.evaluate(matchState()));
      const r1 = J(await chrome.evaluate(runtimeState()));
      console.log(`   進場後 ｜ ${JSON.stringify(r1)}\n   比賽 ｜ ${JSON.stringify(m1)}`);
      await chrome.evaluate(`
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        [...document.querySelectorAll("button")].filter(vis)
          .find((n) => /返回|離開|首頁/.test(n.innerText || "") || n.getAttribute("aria-label") === "返回")?.click();
        return JSON.stringify({});
      `);
      await sleep(2500);
      const rLeave = J(await chrome.evaluate(runtimeState()));
      console.log(`   離開後 ｜ ${JSON.stringify(rLeave)}`);
      ck("⑥ 離開後沒有殘留 canvas", rLeave?.canvas === 0, `canvas ${rLeave?.canvas}`);
      ck("⑥ 離開後全域場景參照已清掉", rLeave?.sceneHandle === false, String(rLeave?.sceneHandle));

      const back = await resumeCs(chrome, sleep);
      ck("⑥ CS_LEAVE_RESUME：返回同一場", back.ok, back.ok ? `${(back.ms / 1000).toFixed(1)}s` : back.why);
      if (back.ok) {
        const m2 = J(await chrome.evaluate(matchState()));
        const r2 = J(await chrome.evaluate(runtimeState()));
        report.cs = { first: { m: m1, r: r1 }, leave: rLeave, resume: { m: m2, r: r2 },
          firstMs: cs.ms, resumeMs: back.ms };
        console.log(`   返回後 ｜ ${JSON.stringify(r2)}\n   比賽 ｜ ${JSON.stringify(m2)}`);
        //  ⚠ 先證明「讀得到」再比「有沒有變」——否則 null === null 會假綠。
        ck("⑥ 進場時讀得到進行中的場次（不是 null 空過）",
          !!m1?.hasSession && typeof m1?.sessionId === "string" && m1.sessionId.length > 0,
          JSON.stringify(m1));
        for (const k of ["sessionId", "seed", "mapKey", "roster"]) {
          const readable = m1?.[k] != null;
          ck(`⑥ CS_SESSION_IDENTITY：${k} 不變`,
            readable && String(m1?.[k]) === String(m2?.[k]),
            readable ? `${m1?.[k]} → ${m2?.[k]}` : `讀不到（${m1?.[k]} → ${m2?.[k]}）⇒ 視為未驗證`);
        }
        ck("⑥ 返回不比首次慢（沒有舊的「返回後更卡」）", back.ms <= cs.ms * 1.15,
          `${(cs.ms / 1000).toFixed(1)}s → ${(back.ms / 1000).toFixed(1)}s`);
        ck("⑥ 沒有產生第二個 canvas", r2?.canvas === 1, `canvas ${r2?.canvas}`);
        ck("⑥ 對戰可繼續（速度控制仍在）", r2?.battleUi === true, String(r2?.battleUi));
      }
    }

    const pageErrs = chrome.pageErrors ?? [];
    ck("⑦ CS_RUNTIME_ERROR：無 page-origin uncaught error", pageErrs.length === 0,
      pageErrs.slice(0, 3).join(" ¦ ") || "clean");

    writeFileSync(new URL("prod-bugfix-release.json", OUT), JSON.stringify(report, null, 2));
    console.log(`\n數據：review/prod-bugfix-release/prod-bugfix-release.json`);
  },
});

//  ── CS 相關輔助（放在最後，讓上面的流程讀起來連貫）────────────────────────
function matchState() {
  //  ⚠ 正式站讀不到 store 模組，只能讀原始存檔。路徑取自 `activeMatchView()`
  //    實際讀的那幾個欄位（matchmaking.session.activeMatch），不是猜的。
  //    ⚠ 讀不到就要看得出來是 null，不能讓 null===null 空過斷言。
  return `
    const raw = localStorage.getItem("esmo.profile.v1");
    const st = raw ? JSON.parse(raw) : null;
    const se = st?.matchmaking?.session ?? null;
    const am = se?.activeMatch ?? null;
    return JSON.stringify({
      hasSession: !!se, state: se?.state ?? null, status: am?.status ?? null, phase: am?.phase ?? null,
      sessionId: se?.sessionId ?? null,
      seed: am?.seed ?? se?.seed ?? null,
      mapKey: am?.config?.csConfig?.mapKey ?? null,
      roster: Array.isArray(am?.lineup) ? am.lineup.length
        : (am?.lineup && typeof am.lineup === "object" ? Object.keys(am.lineup).length : null),
    });
  `;
}
function runtimeState() {
  return `
    return JSON.stringify({
      canvas: document.querySelectorAll("canvas").length,
      sceneHandle: !!window.__ESMO_FPS_SCENE__,
      battleUi: !!document.querySelector('[data-testid="cs-match-speed-controls"]'),
    });
  `;
}
async function enterCs(chrome, sleep) {
  const t0 = Date.now();
  const fail = (why) => ({ ok: false, ms: Date.now() - t0, why });
  if (!(await waitFor(chrome, sleep, `document.body.innerText.includes("CS")`, 40000)).ok) return fail("首頁沒有 CS");
  await chrome.evaluate(`
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    [...document.querySelectorAll("button")].filter(vis)
      .find((n) => !n.disabled && (n.innerText || "").includes("CS"))?.click();
    return JSON.stringify({});
  `);
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')`, 40000)).ok) {
    return fail("沒有 CS 賽前畫面");
  }
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    if (J(await chrome.evaluate(`return JSON.stringify({ v: !!document.querySelector('[data-map-key]') });`))?.v) break;
    const a = J(await chrome.evaluate(`
      const el = document.querySelector('[data-testid="prep-primary-action"]');
      return JSON.stringify({ action: el?.dataset.action ?? null, disabled: !!el?.disabled });
    `));
    if (!a?.action) { await sleep(500); continue; }
    if (a.action === "blocked") {
      await chrome.evaluate(`
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        [...document.querySelectorAll("button")].filter(vis)
          .find((n) => !n.disabled && (n.innerText || "").includes("自動"))?.click();
        return JSON.stringify({});
      `);
      await sleep(700); continue;
    }
    if (!a.disabled) {
      await chrome.evaluate(`document.querySelector('[data-testid="prep-primary-action"]')?.click(); return JSON.stringify({});`);
      await sleep(800); continue;
    }
    await sleep(600);
  }
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-map-key]')`, 40000)).ok) return fail("沒有地圖選擇");
  await chrome.evaluate(`document.querySelector('[data-map-key]')?.click(); return JSON.stringify({});`);
  await sleep(500);
  await chrome.evaluate(`
    const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled && !n.dataset.mapKey);
    b.at(-1)?.click(); return JSON.stringify({});
  `);
  await sleep(1000);
  await chrome.evaluate(`
    const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled && (n.innerText || "").length > 20);
    b[0]?.click(); return JSON.stringify({});
  `);
  await sleep(500);
  await chrome.evaluate(`
    const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled);
    b.at(-1)?.click(); return JSON.stringify({});
  `);
  const w = await waitFor(chrome, sleep,
    `document.querySelector('[data-testid="cs-match-speed-controls"]') && document.querySelector("canvas")`, 240000);
  return w.ok ? { ok: true, ms: Date.now() - t0 } : fail("沒有進到 CS 戰鬥畫面");
}
async function resumeCs(chrome, sleep) {
  const t0 = Date.now();
  const r = J(await chrome.evaluate(`
    const el = document.querySelector('[data-testid="resume-active-match"]');
    if (!el) return JSON.stringify({ ok: false, why: "首頁沒有『返回對戰』入口" });
    el.scrollIntoView({ block: "center" }); el.click();
    return JSON.stringify({ ok: true });
  `));
  if (!r?.ok) return { ok: false, ms: Date.now() - t0, why: r?.why };
  const w = await waitFor(chrome, sleep,
    `document.querySelector('[data-testid="cs-match-speed-controls"]') && document.querySelector("canvas")`, 240000);
  return w.ok ? { ok: true, ms: Date.now() - t0 } : { ok: false, ms: Date.now() - t0, why: "resume 後沒回到戰鬥畫面" };
}

finishGate(result);
