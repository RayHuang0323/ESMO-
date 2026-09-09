#!/usr/bin/env node
// ============================================================================
//  Ban/Pick 英雄列表捲動量測（Bug C 的證據蒐集，**不修任何東西**）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_measure_banpick_scroll.mjs --timeout 900000`
//
//  ⚠ 必須用**真的觸控事件**（touchstart/touchmove/touchend）驗，不能用 wheel。
//    桌機的 wheel 走的是完全不同的路徑，這個 bug 正是「桌機修好了、手機沒有」。
//  ⚠ 先量「容器到底能不能捲」（scrollHeight vs clientHeight），
//    再量「手指滑了之後 scrollTop 有沒有動」。兩件事分開量，
//    才分得出「不能捲」與「能捲但手勢被吃掉」。
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };

const seed = () => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  localStorage.removeItem("esmo.profile.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 400));
  store.getState().save();
  return JSON.stringify({ players: store.getState().players.length });
`;

const clickText = (needle, exact = false) => `
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const want = ${JSON.stringify(needle)};
  const el = [...document.querySelectorAll('button,[role="button"],a,[data-testid]')].filter(vis)
    .find((n) => { const t = (n.innerText || "").trim(); return ${JSON.stringify(exact)} ? t === want : t.includes(want); });
  if (!el) return JSON.stringify({ ok: false, why: "找不到 " + want });
  el.scrollIntoView({ block: "center" }); el.click();
  await new Promise((d) => setTimeout(d, 1200));
  return JSON.stringify({ ok: true });
`;

const clickTestid = (id) => `
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const el = [...document.querySelectorAll('[data-testid=' + JSON.stringify(${JSON.stringify(id)}) + ']')].filter(vis)[0];
  if (!el) return JSON.stringify({ ok: false, why: "找不到 " + ${JSON.stringify(id)} });
  el.scrollIntoView({ block: "center" }); el.click();
  await new Promise((d) => setTimeout(d, 1300));
  return JSON.stringify({ ok: true });
`;

/** 量捲動容器的幾何：能不能捲、祖先鏈有沒有把高度框住。 */
const geometry = () => `
  const el = document.querySelector('[data-testid="hero-grid-scroll"]');
  if (!el) return JSON.stringify({ ok: false, why: "找不到 hero-grid-scroll" });
  const cs = getComputedStyle(el);
  const chain = [];
  let n = el.parentElement, depth = 0;
  while (n && n !== document.body && depth < 8) {
    const s = getComputedStyle(n);
    chain.push({
      tag: n.tagName.toLowerCase() + (n.getAttribute("data-testid") ? "#" + n.getAttribute("data-testid") : ""),
      h: Math.round(n.getBoundingClientRect().height),
      overflowY: s.overflowY, display: s.display, minHeight: s.minHeight, flex: s.flex,
    });
    n = n.parentElement; depth++;
  }
  const cards = document.querySelectorAll('[data-testid="hero-card"]').length;
  return JSON.stringify({
    ok: true,
    clientH: el.clientHeight, scrollH: el.scrollHeight, scrollTop: el.scrollTop,
    scrollable: el.scrollHeight > el.clientHeight + 1,
    overflowY: cs.overflowY, touchAction: cs.touchAction, overscroll: cs.overscrollBehaviorY,
    cards, chain,
    docScrollable: document.documentElement.scrollHeight > window.innerHeight + 1,
  });
`;

/** 用真的 touch 事件做一次單指上滑。 */
const touchDrag = (dy) => `
  const el = document.querySelector('[data-testid="hero-grid-scroll"]');
  if (!el) return JSON.stringify({ ok: false, why: "找不到容器" });
  const r = el.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2);
  const y0 = Math.round(r.top + r.height * 0.75);
  const before = el.scrollTop;
  const mk = (type, cy) => {
    const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: cy, pageX: x, pageY: cy });
    return new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [t],
      targetTouches: type === "touchend" ? [] : [t], changedTouches: [t] });
  };
  el.dispatchEvent(mk("touchstart", y0));
  for (let i = 1; i <= 6; i++) el.dispatchEvent(mk("touchmove", y0 - (${dy} * i) / 6));
  el.dispatchEvent(mk("touchend", y0 - ${dy}));
  await new Promise((d) => setTimeout(d, 500));
  return JSON.stringify({ ok: true, before, after: el.scrollTop, moved: el.scrollTop - before });
`;

const result = await runGate({
  name: "Ban/Pick 捲動量測",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [L, width, height, mobile] of [["手機 390px", 390, 844, true], ["桌機 1366px", 1366, 900, false]]) {
      console.log(`\n════ ${L} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      //  ⚠ maxTouchPoints 必須是 1–16；關閉觸控時不可以傳 0（CDP 會直接報錯）。
      await chrome.send("Emulation.setTouchEmulationEnabled",
        mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      await chrome.navigate(url); await sleep(1500);
      const s = J(await chrome.evaluate(seed()));
      ck(`${L}｜precondition：乾淨存檔`, s?.players > 0, `${s?.players ?? 0} 名`);
      await chrome.navigate(url); await sleep(1800);

      //  進 MOBA → 賽前 → 配對 → Ban/Pick
      if (!J(await chrome.evaluate(clickTestid("home-mode-moba")))?.ok) { ck(`${L}｜進得了賽前`, false, "點不到 MOBA"); continue; }
      //  ⚠ 走「快速練習」而不是正式配對：兩者共用同一條進場 effect（見
      //    MatchPrepFrame 的註解），但練習不必等真的配到對手 —— 量的是
      //    Ban/Pick 的捲動，不是配對。
      const prep = J(await chrome.evaluate(clickTestid("prep-start-practice")));
      if (!prep?.ok) { ck(`${L}｜按得到快速練習`, false, prep?.why ?? ""); continue; }
      //  配對→房間→Ban/Pick 需要時間，輪詢等
      let atDraft = false;
      for (let i = 0; i < 60 && !atDraft; i++) {
        await sleep(1000);
        //  中途若出現要確認的關卡就按掉（練習流程多半不會出現）
        await chrome.evaluate(clickText("確認進入對戰"));
        atDraft = !!J(await chrome.evaluate(`return JSON.stringify({ v: !!document.querySelector('[data-testid="hero-grid-scroll"]') });`))?.v;
      }
      ck(`${L}｜進得了 Ban/Pick`, atDraft);
      if (!atDraft) continue;
      await sleep(800);

      const g = J(await chrome.evaluate(geometry()));
      ck(`${L}｜找得到英雄列表容器`, g?.ok === true, g?.why ?? "");
      if (!g?.ok) continue;
      console.log(`   容器: clientH=${g.clientH} scrollH=${g.scrollH} 可捲=${g.scrollable} 卡片=${g.cards}`);
      console.log(`   樣式: overflowY=${g.overflowY} touchAction=${g.touchAction} overscroll=${g.overscroll}`);
      console.log(`   祖先鏈:`);
      for (const c of g.chain) console.log(`     ${c.tag.padEnd(28)} h=${String(c.h).padStart(4)} overflowY=${c.overflowY.padEnd(8)} minH=${c.minHeight} flex=${c.flex}`);
      //  ⭐ 這一條分辨「不能捲」與「能捲但手勢被吃掉」
      ck(`${L}｜⭐ 容器本身是可捲動的（scrollH > clientH）`, g.scrollable,
        `${g.scrollH} vs ${g.clientH}`);

      if (mobile) {
        const d = J(await chrome.evaluate(touchDrag(220)));
        ck(`${L}｜⭐ 單指上滑之後 scrollTop 有變`, (d?.moved ?? 0) > 20,
          `${d?.before} → ${d?.after}（移動 ${d?.moved}）`);
      } else {
        const d = J(await chrome.evaluate(`
          const el = document.querySelector('[data-testid="hero-grid-scroll"]');
          const before = el.scrollTop;
          el.dispatchEvent(new WheelEvent("wheel", { deltaY: 240, bubbles: true, cancelable: true }));
          el.scrollTop = before + 240;
          await new Promise((d) => setTimeout(d, 300));
          return JSON.stringify({ before, after: el.scrollTop, moved: el.scrollTop - before });
        `));
        ck(`${L}｜桌機捲動仍正常`, (d?.moved ?? 0) > 20, `${d?.before} → ${d?.after}`);
      }
    }
  },
});

finishGate(result);
