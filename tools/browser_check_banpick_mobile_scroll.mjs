#!/usr/bin/env node
// ============================================================================
//  Ban/Pick 英雄列表：手機單指捲動（Bug C）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_banpick_mobile_scroll.mjs --timeout 900000`
//
//  ⚠ 這支不驗 CSS 字串。`overflow-y:auto` 寫在那裡不代表捲得動——上一輪就是
//    因為只看樣式宣告，才會把「已經有 overflowY:auto / minHeight:0 /
//    overscrollBehavior:contain / touchAction:pan-y」誤讀成「捲動已經沒問題」。
//    這裡一律問 DOM 幾何與**真的送 touch 事件之後 scrollTop 有沒有變**。
//
//  ⚠ 進場一律走正式玩家路徑（home-mode-moba → prep-primary-action →
//    matchmaking-enter-banpick），不用 setScreen 硬跳——硬跳會跳過
//    `setActiveMatchContext`，量到的是一個真實玩家永遠走不到的狀態。
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };
const OUT = new URL("../review/banpick-scroll/", import.meta.url);

const waitFor = async (chrome, sleep, expr, timeoutMs, label) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate(`return JSON.stringify({ v: Boolean(${expr}) });`));
    if (r?.v) return { ok: true, ms: Date.now() - t0 };
    await sleep(250);
  }
  return { ok: false, ms: Date.now() - t0, label };
};

const seed = () => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  localStorage.removeItem("esmo.profile.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 400));
  store.getState().save();
  return JSON.stringify({ players: store.getState().players.length });
`;

/** 量捲動區與**整條祖先鏈**的實際幾何。§2 要回答的兩個問題都在這裡。 */
const geometry = () => `
  const el = document.querySelector('[data-testid="hero-grid-scroll"]');
  if (!el) return JSON.stringify({ found: false });
  const pick = (n) => {
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    return {
      tag: n.tagName.toLowerCase(),
      testid: n.getAttribute("data-testid") || null,
      clientHeight: n.clientHeight, scrollHeight: n.scrollHeight, offsetHeight: n.offsetHeight,
      rectHeight: Math.round(r.height), rectTop: Math.round(r.top), rectBottom: Math.round(r.bottom),
      height: cs.height, maxHeight: cs.maxHeight, minHeight: cs.minHeight,
      flex: cs.flex, flexGrow: cs.flexGrow, flexShrink: cs.flexShrink, flexBasis: cs.flexBasis,
      display: cs.display, overflowY: cs.overflowY, overflowX: cs.overflowX,
      position: cs.position, touchAction: cs.touchAction, overscrollBehaviorY: cs.overscrollBehaviorY,
    };
  };
  const chain = [];
  for (let n = el; n && n !== document.documentElement.parentNode; n = n.parentElement) chain.push(pick(n));
  const doc = document.scrollingElement;
  return JSON.stringify({
    found: true,
    grid: chain[0],
    chain,
    docScroll: { clientHeight: doc.clientHeight, scrollHeight: doc.scrollHeight, scrollTop: doc.scrollTop },
    viewport: { w: innerWidth, h: innerHeight },
  });
`;

/**
 *  真的送單指 touch。⚠ 不能用 wheel，也不能寫 scrollTop——那兩種都會在
 *  「版面根本沒形成捲動 viewport」的情況下給出假象或直接無效。
 *  回傳手勢前後的 scrollTop 與這段手勢有沒有意外選到英雄。
 */
async function touchDrag(chrome, sleep, { dy, steps = 10 }) {
  const box = J(await chrome.evaluate(`
    const el = document.querySelector('[data-testid="hero-grid-scroll"]');
    if (!el) return JSON.stringify({ ok: false });
    const r = el.getBoundingClientRect();
    window.__ESMO_PICKED__ = null;
    return JSON.stringify({ ok: true, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      h: Math.round(r.height), scrollTop: el.scrollTop });
  `));
  if (!box?.ok) return { ok: false };

  //  起點刻意壓在一張 hero card 上（§5：手指按在卡片上拖動不可以變成點選）。
  const card = J(await chrome.evaluate(`
    const el = document.querySelector('[data-testid="hero-grid-scroll"]');
    const r = el.getBoundingClientRect();
    const cards = [...el.querySelectorAll('[data-testid="hero-card"]')].filter((c) => {
      const cr = c.getBoundingClientRect();
      return cr.top >= r.top && cr.bottom <= r.bottom;
    });
    const c = cards[Math.floor(cards.length / 2)] ?? cards[0];
    if (!c) return JSON.stringify({ ok: false });
    const cr = c.getBoundingClientRect();
    return JSON.stringify({ ok: true, x: Math.round(cr.left + cr.width / 2), y: Math.round(cr.top + cr.height / 2),
      hero: c.getAttribute("data-hero") });
  `));
  const x = card?.ok ? card.x : box.x;
  const y0 = card?.ok ? card.y : box.y;

  const before = J(await chrome.evaluate(`
    const el = document.querySelector('[data-testid="hero-grid-scroll"]');
    return JSON.stringify({ scrollTop: el.scrollTop, doc: document.scrollingElement.scrollTop,
      picked: document.querySelectorAll('[data-testid="pick-avatar"]').length });
  `));

  const touch = (type, py) => chrome.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y: py, radiusX: 12, radiusY: 12, force: 1 }],
  });

  await touch("touchStart", y0);
  await sleep(30);
  for (let i = 1; i <= steps; i++) {
    await touch("touchMove", Math.round(y0 - (dy * i) / steps));
    await sleep(24);
  }
  await sleep(60);
  await touch("touchEnd", Math.round(y0 - dy));
  await sleep(500);

  const after = J(await chrome.evaluate(`
    const el = document.querySelector('[data-testid="hero-grid-scroll"]');
    return JSON.stringify({ scrollTop: el ? el.scrollTop : null, doc: document.scrollingElement.scrollTop,
      picked: document.querySelectorAll('[data-testid="pick-avatar"]').length,
      stillOnBanPick: !!document.querySelector('[data-testid="hero-grid-scroll"]') });
  `));
  return { ok: true, before, after, hero: card?.hero ?? null };
}

/** 單指輕點一張**看得見**的英雄卡：touchStart → touchEnd，中間不位移。 */
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
      hero: b.getAttribute("data-hero"),
      before: document.querySelectorAll('[data-testid="pick-avatar"]').length });
  `));
  if (!target?.ok) return { ok: false };
  const pt = [{ x: target.x, y: target.y, radiusX: 12, radiusY: 12, force: 1 }];
  await chrome.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
  await sleep(60);
  await chrome.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(700);
  const after = J(await chrome.evaluate(`
    return JSON.stringify({ picked: document.querySelectorAll('[data-testid="pick-avatar"]').length,
      log: document.querySelector('[data-testid="draft-log"]')?.innerText?.slice(0, 60) ?? null });
  `));
  return { ok: true, hero: target.hero, before: target.before, ...after };
}

/** 正式玩家路徑：首頁 → 賽前配置 → 配對過場 → Ban/Pick。 */
async function gotoBanPick(chrome, sleep) {
  const t0 = Date.now();
  const fail = (why) => ({ ok: false, ms: Date.now() - t0, why });

  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="home-mode-moba"]')`, 30000)).ok) {
    return fail("首頁沒有 MOBA 入口");
  }
  await chrome.evaluate(`
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const el = [...document.querySelectorAll('[data-testid="home-mode-moba"]')].find(vis);
    el?.click(); return JSON.stringify({ ok: !!el });
  `);
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')`, 30000)).ok) {
    return fail("沒有進到賽前配置");
  }

  //  ⚠ 賽前流程是**多段**的：enqueue → 等對手 → confirm → 簽發場次 → 自動進場。
  //    第一版寫成「按幾次就好」，於是卡在等待態空轉。改成輪詢狀態機：
  //    看到什麼 action 就做什麼，等待態就等，並把序列記下來當證據。
  const seen = [];
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (J(await chrome.evaluate(`return JSON.stringify({ v: !!document.querySelector('[data-testid="matchmaking-enter-banpick"]') });`))?.v) break;
    const a = J(await chrome.evaluate(`
      const el = document.querySelector('[data-testid="prep-primary-action"]');
      return JSON.stringify({ action: el?.dataset.action ?? null, disabled: !!el?.disabled,
        label: (el?.innerText || "").trim().slice(0, 20) });
    `));
    if (!a?.action) { await sleep(500); continue; }
    const tag = `${a.action}${a.disabled ? "(disabled)" : ""}`;
    if (seen[seen.length - 1] !== tag) seen.push(tag);
    if (a.action === "blocked") {
      await chrome.evaluate(`
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const el = [...document.querySelectorAll("button")].filter(vis)
          .find((n) => !n.disabled && (n.innerText || "").includes("自動"));
        el?.click(); return JSON.stringify({ ok: !!el });
      `);
      await sleep(600);
      continue;
    }
    if (!a.disabled) {
      await chrome.evaluate(`document.querySelector('[data-testid="prep-primary-action"]')?.click(); return JSON.stringify({});`);
      await sleep(700);
      continue;
    }
    await sleep(600);   // 等待態（等對手確認／倒數）
  }
  console.log(`   賽前 action 序列：${seen.join(" → ") || "(無)"}`);

  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="matchmaking-enter-banpick"]')`, 40000)).ok) {
    return fail(`沒有進到配對過場（action 序列：${seen.join(" → ") || "無"}）`);
  }
  if (!(await waitFor(chrome, sleep,
    `!document.querySelector('[data-testid="matchmaking-enter-banpick"]').disabled`, 20000)).ok) {
    return fail("配對過場的進入鍵一直是 disabled");
  }
  await chrome.evaluate(`document.querySelector('[data-testid="matchmaking-enter-banpick"]').click(); return JSON.stringify({});`);

  const w = await waitFor(chrome, sleep, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 30000);
  return w.ok ? { ok: true, ms: Date.now() - t0 } : fail("沒有進到 Ban/Pick 的英雄格");
}

const setMobile = (chrome, width) => chrome.send("Emulation.setDeviceMetricsOverride",
  { width, height: 844, deviceScaleFactor: 2, mobile: true });

const result = await runGate({
  name: "Ban/Pick 手機捲動",
  run: async ({ chrome, url, ck, sleep }) => {
    mkdirSync(OUT, { recursive: true });
    const report = {};

    //  觸控模擬必須開，否則 Input.dispatchTouchEvent 進不到頁面。
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await setMobile(chrome, 390);
    await chrome.navigate(url); await sleep(1500);
    const s = J(await chrome.evaluate(seed()));
    ck("precondition：乾淨存檔", s?.players > 0, `${s?.players ?? 0} 名`);
    await chrome.navigate(url); await sleep(1800);

    // ── §1 先證明走得到 Ban/Pick ────────────────────────────────────────
    const nav = await gotoBanPick(chrome, sleep);
    ck("① 390px 走正式流程進得了 Ban/Pick", nav.ok, nav.ok ? `${(nav.ms / 1000).toFixed(1)}s` : nav.why);
    if (!nav.ok) return;

    // ── §2 DOM 幾何 ─────────────────────────────────────────────────────
    const g = J(await chrome.evaluate(geometry()));
    report.geometry390 = g;
    console.log("\n── 捲動區 ──");
    console.log(JSON.stringify(g.grid, null, 2));
    console.log("\n── 祖先鏈（由內而外）──");
    for (const n of g.chain) {
      console.log(`${(n.testid ?? n.tag).padEnd(20)} h=${String(n.height).padEnd(9)} min=${String(n.minHeight).padEnd(7)} max=${String(n.maxHeight).padEnd(7)} flex=${String(n.flex).padEnd(12)} of-y=${String(n.overflowY).padEnd(8)} pos=${String(n.position).padEnd(8)} client=${String(n.clientHeight).padEnd(5)} scroll=${n.scrollHeight}`);
    }
    console.log(`\ndocument: client=${g.docScroll.clientHeight} scroll=${g.docScroll.scrollHeight}`);

    ck("② SCROLL_CONTAINER_EXISTS", g.grid.overflowY === "auto" || g.grid.overflowY === "scroll", g.grid.overflowY);
    ck("② SCROLL_HEIGHT_GT_CLIENT_HEIGHT（版面有形成可捲 viewport）",
      g.grid.scrollHeight > g.grid.clientHeight,
      `scrollHeight ${g.grid.scrollHeight} vs clientHeight ${g.grid.clientHeight}`);
    ck("② 捲動區沒有被外框裁到畫面外",
      g.grid.rectBottom <= g.viewport.h + 1,
      `bottom ${g.grid.rectBottom} vs viewport ${g.viewport.h}`);

    // ── §3 真 touch 手勢 ────────────────────────────────────────────────
    const drag = await touchDrag(chrome, sleep, { dy: 220 });
    report.drag390 = drag;
    console.log(`\n── 單指拖曳 ──\n${JSON.stringify(drag, null, 2)}`);
    ck("③ TOUCH_SCROLL_WORKS：單指上滑後 scrollTop 改變", drag.ok && drag.after.scrollTop > drag.before.scrollTop,
      `SCROLL_TOP_BEFORE=${drag.before?.scrollTop} → SCROLL_TOP_AFTER=${drag.after?.scrollTop}`);
    ck("③ SCROLL_DID_NOT_SELECT_HERO：拖曳沒有誤選英雄",
      drag.ok && drag.after.picked === drag.before.picked && drag.after.stillOnBanPick,
      `已選 ${drag.before?.picked} → ${drag.after?.picked}（起點卡片 ${drag.hero}）`);
    ck("③ 拖曳沒有把整頁一起帶走", drag.ok && drag.after.doc === drag.before.doc,
      `document.scrollTop ${drag.before?.doc} → ${drag.after?.doc}`);

    // ── §5 最後一排要拿得到 ─────────────────────────────────────────────
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
      const lastCard = cards[cards.length - 1];
      const cr = lastCard?.getBoundingClientRect();
      //  ⚠ 只比「卡片在容器矩形內」會假綠：容器本身長到 1620px 掉在畫面外時，
      //    卡片當然「在容器內」，但玩家根本看不到。要比**視窗**。
      return JSON.stringify({
        total: cards.length,
        scrollable: el.scrollHeight > el.clientHeight,
        atEnd: el.scrollHeight - el.scrollTop - el.clientHeight <= 4,
        lastInContainer: !!cr && cr.top >= r.top - 1 && cr.bottom <= r.bottom + 1,
        lastInViewport: !!cr && cr.top >= 0 && cr.bottom <= innerHeight + 1,
        scrollTop: el.scrollTop,
      });
    `));
    report.last390 = last;
    ck("④ LAST_HERO_REACHABLE：捲到底後最後一張卡真的落在**視窗**內",
      !!last?.scrollable && !!last?.atEnd && !!last?.lastInContainer && !!last?.lastInViewport,
      JSON.stringify(last));

    // ── §5 正常點擊仍要能選角 ───────────────────────────────────────────
    //  ⚠ 必須送**真的** touch tap，不能用 `el.click()`。畫面用
    //    pointerdown → pointermove → pointerup 判斷「這是捲動還是點選」；
    //    `.click()` 不產生 pointerdown，於是會繼承前一次捲動手勢留下的
    //    suppress 旗標而被吞掉——那是測法的假紅，不是產品行為。
    const tap = await touchTap(chrome, sleep);
    report.tap390 = tap;
    ck("⑤ NORMAL_TAP_SELECTS_HERO：單指輕點仍可選角",
      !!tap?.ok && !!tap.log && /禁用|選擇/.test(tap.log), JSON.stringify(tap));

    // ── §7 phase 切換之後仍可捲 ─────────────────────────────────────────
    //  step0 是我方 ban。選掉之後 AI 走兩步，step2 又是我方 ban，
    //  step4 才進入 pick。這裡等到畫面標題從「禁用」變成「選擇你的英雄」。
    const banPhaseOk = !!tap?.log && /禁用/.test(tap.log);
    ck("⑥ BAN_PHASE：ban 階段可選且有落帳", banPhaseOk, tap?.log ?? "(無)");

    for (let i = 0; i < 10; i++) {
      const st = J(await chrome.evaluate(`
        const t = document.querySelector('[data-testid="hero-picker"]')?.innerText ?? "";
        return JSON.stringify({ pick: t.includes("選擇你的英雄"), open: !!document.querySelector('[data-testid="hero-grid-scroll"]') });
      `));
      if (st?.pick) break;
      if (st?.open) {
        await chrome.evaluate(`
          const el = document.querySelector('[data-testid="hero-grid-scroll"]');
          el?.querySelector('[data-testid="hero-choose"]')?.click();
          return JSON.stringify({});
        `);
      }
      await sleep(900);
    }
    const inPick = J(await chrome.evaluate(`
      const t = document.querySelector('[data-testid="hero-picker"]')?.innerText ?? "";
      return JSON.stringify({ pick: t.includes("選擇你的英雄") });
    `));
    ck("⑦ PICK_PHASE：進到 pick 階段", !!inPick?.pick, JSON.stringify(inPick));

    if (inPick?.pick) {
      const g2 = J(await chrome.evaluate(geometry()));
      const drag2 = await touchDrag(chrome, sleep, { dy: 200 });
      report.pickPhase = { geometry: g2, drag: drag2 };
      ck("⑦ PHASE_CHANGE_SCROLL：phase 切換後仍 scrollHeight > clientHeight",
        g2.grid.scrollHeight > g2.grid.clientHeight,
        `${g2.grid.scrollHeight} vs ${g2.grid.clientHeight}`);
      ck("⑦ PHASE_CHANGE_SCROLL：phase 切換後單指仍捲得動",
        drag2.ok && drag2.after.scrollTop > drag2.before.scrollTop,
        `${drag2.before?.scrollTop} → ${drag2.after?.scrollTop}`);
    }

    // ── §6 四種手機寬度 ─────────────────────────────────────────────────
    report.widths = {};
    for (const w of [320, 360, 390, 430]) {
      await setMobile(chrome, w);
      await chrome.navigate(url); await sleep(1500);
      const n = await gotoBanPick(chrome, sleep);
      if (!n.ok) { ck(`⑧ MOBILE_${w}`, false, n.why); continue; }
      const gg = J(await chrome.evaluate(geometry()));
      const d = await touchDrag(chrome, sleep, { dy: 200 });
      //  捲到底，確認最後一排拿得到、且沒有水平溢出、CTA 沒掉出畫面。
      for (let i = 0; i < 12; i++) {
        const at = J(await chrome.evaluate(`
          const el = document.querySelector('[data-testid="hero-grid-scroll"]');
          return JSON.stringify({ end: el.scrollHeight - el.scrollTop - el.clientHeight <= 4 });
        `));
        if (at?.end) break;
        await touchDrag(chrome, sleep, { dy: 260, steps: 8 });
      }
      const fin = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid="hero-grid-scroll"]');
        const r = el.getBoundingClientRect();
        const cards = [...el.querySelectorAll('[data-testid="hero-card"]')];
        const cr = cards[cards.length - 1]?.getBoundingClientRect();
        const first = cards[0];
        el.scrollTop = 0;
        const fr = first?.getBoundingClientRect();
        return JSON.stringify({
          gridHeight: el.clientHeight,
          scrollable: el.scrollHeight > el.clientHeight,
          lastReachable: !!cr && cr.bottom <= r.bottom + 1 && cr.bottom <= innerHeight + 1 && cr.top >= 0,
          firstReachable: !!fr && fr.top >= r.top - 1 && fr.top >= 0,
          hOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          //  溢出的話要**指名是哪一顆**，否則只知道紅了、不知道改什麼。
          //  ⚠ 住在水平捲動容器裡的按鈕（例如職業篩選列）超出視窗是**設計狀態**，
          //    不是缺陷——但也不能就這樣放過：要證明那一列真的捲得到它。
          //    容器外的按鈕一律不得出界。
          ...(() => {
            const hScroller = (n) => {
              for (let p = n.parentElement; p; p = p.parentElement) {
                const cs = getComputedStyle(p);
                if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && p.scrollWidth > p.clientWidth) return p;
              }
              return null;
            };
            const out = [...document.querySelectorAll("button")]
              .filter((b) => { const q = b.getBoundingClientRect(); return q.width > 0 && q.height > 0; })
              .filter((b) => { const q = b.getBoundingClientRect(); return q.right > innerWidth + 1 || q.left < -1; });
            const desc = (b) => { const q = b.getBoundingClientRect();
              return { t: (b.innerText || "").trim().slice(0, 12), testid: b.getAttribute("data-testid"),
                left: Math.round(q.left), right: Math.round(q.right), w: Math.round(q.width) }; };
            const inStrip = out.filter((b) => hScroller(b));
            const loose = out.filter((b) => !hScroller(b));
            //  把每個「在水平捲動列裡」的按鈕捲進來，確認真的拿得到。
            const unreachable = [];
            for (const b of inStrip) {
              const sc = hScroller(b);
              const keep = sc.scrollLeft;
              b.scrollIntoView({ block: "nearest", inline: "nearest" });
              const q = b.getBoundingClientRect();
              if (q.right > innerWidth + 1 || q.left < -1) unreachable.push(desc(b));
              sc.scrollLeft = keep;
            }
            return { ctaOut: loose.map(desc), stripUnreachable: unreachable,
              stripScrolled: inStrip.map(desc) };
          })(),
        });
      `));
      report.widths[w] = { geometry: gg, drag: d, fin };
      //  ⚠ `gridHeight >= 150`：不接受「把清單壓扁到剩一列」這種過關方式。
      const pass = gg.grid.scrollHeight > gg.grid.clientHeight
        && gg.grid.rectBottom <= gg.viewport.h + 1 && fin?.gridHeight >= 150
        && d.ok && d.after.scrollTop > d.before.scrollTop && d.after.doc === d.before.doc
        && !!fin?.lastReachable && !!fin?.firstReachable && !fin?.hOverflow && (fin?.ctaOut ?? []).length === 0
        && (fin?.stripUnreachable ?? []).length === 0;
      ck(`⑧ MOBILE_${w}`, pass,
        `scroll ${gg.grid.scrollHeight}/${gg.grid.clientHeight}｜top ${d.before?.scrollTop}→${d.after?.scrollTop}｜${JSON.stringify(fin)}`);
    }

    // ── §8 桌機不可回歸 ─────────────────────────────────────────────────
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await chrome.send("Emulation.setDeviceMetricsOverride",
      { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url); await sleep(1500);
    const dn = await gotoBanPick(chrome, sleep);
    ck("⑨ 桌機仍進得了 Ban/Pick", dn.ok, dn.ok ? `${(dn.ms / 1000).toFixed(1)}s` : dn.why);
    if (dn.ok) {
      const gd = J(await chrome.evaluate(geometry()));
      //  ⚠ 桌機這條必須是**真的滾輪**。寫 `el.scrollTop = x` 只證明「這個元素
      //    的 scrollTop 可以被賦值」，在版面根本沒形成捲動區時一樣會通過。
      const wpos = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid="hero-grid-scroll"]');
        const r = el.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
          before: el.scrollTop, docBefore: document.scrollingElement.scrollTop });
      `));
      await chrome.send("Input.dispatchMouseEvent", {
        type: "mouseWheel", x: wpos.x, y: wpos.y, deltaX: 0, deltaY: 300, pointerType: "mouse",
      });
      await sleep(400);
      const wheel = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid="hero-grid-scroll"]');
        return JSON.stringify({ before: ${wpos.before}, after: el.scrollTop,
          docBefore: ${wpos.docBefore}, docAfter: document.scrollingElement.scrollTop });
      `));
      //  ⚠ 同樣不能用裸 `.click()`：剛送過滾輪，suppress 旗標還在。
      //    真實滑鼠點擊會先 mousedown（產生 pointerdown）把旗標清掉。
      const dpos = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid="hero-grid-scroll"]');
        const r = el.getBoundingClientRect();
        const b = [...el.querySelectorAll('[data-testid="hero-choose"]')].find((n) => {
          const q = n.getBoundingClientRect();
          return q.top >= r.top && q.bottom <= r.bottom;
        });
        if (!b) return JSON.stringify({ ok: false });
        const q = b.getBoundingClientRect();
        return JSON.stringify({ ok: true, x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2),
          hero: b.getAttribute("data-hero") });
      `));
      for (const type of ["mousePressed", "mouseReleased"]) {
        await chrome.send("Input.dispatchMouseEvent",
          { type, x: dpos.x, y: dpos.y, button: "left", clickCount: 1 });
      }
      await sleep(700);
      const dclick = J(await chrome.evaluate(`
        return JSON.stringify({ hero: ${JSON.stringify(dpos?.hero ?? null)},
          log: document.querySelector('[data-testid="draft-log"]')?.innerText?.slice(0, 60) ?? null });
      `));
      report.desktop = { geometry: gd, wheel, dclick };
      ck("⑨ DESKTOP_SCROLL_REGRESSION：桌機真滾輪捲得動英雄格",
        gd.grid.scrollHeight > gd.grid.clientHeight && wheel?.after > wheel?.before,
        `scroll ${gd.grid.scrollHeight}/${gd.grid.clientHeight}｜top ${wheel?.before}→${wheel?.after}｜doc ${wheel?.docBefore}→${wheel?.docAfter}`);
      ck("⑨ 桌機點擊仍可選角", !!dclick?.log && /禁用|選擇/.test(dclick.log), dclick?.log ?? "(無)");
      ck("⑨ 桌機版面沒有被壓縮（捲動區高度仍合理）",
        gd.grid.clientHeight >= 120, `clientHeight ${gd.grid.clientHeight}`);
    }

    const pageErrs = chrome.pageErrors ?? [];
    ck("⑩ 無 page-origin uncaught error", pageErrs.length === 0,
      pageErrs.slice(0, 2).join(" ¦ ") || "clean");

    writeFileSync(new URL("banpick-scroll.json", OUT), JSON.stringify(report, null, 2));
    console.log(`\n數據：review/banpick-scroll/banpick-scroll.json`);
  },
});

finishGate(result);
