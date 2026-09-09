#!/usr/bin/env node
// ============================================================================
//  UI Clarity Pass v1 — 漸進式說明的互動與無障礙（桌機 1366 ＋ 手機 390）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_ui_disclosure.mjs --timeout 900000`
//
//  守四件事：
//    ① **不得只靠 hover**：所有說明都必須點得開（手機沒有 hover）
//    ② 桌機開 popover、手機開 bottom sheet，而且**不會跑出畫面／safe area**
//    ③ 關得掉：關閉鍵、Esc、點外面；關掉之後焦點要回到觸發點
//    ④ 收起來的內容仍然**取得得到**——瘦身不等於刪掉
//
//  ⚠ 樣板字串裡不得出現反引號（本 repo 反覆踩過）。
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

const seed = () => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  localStorage.removeItem("esmo.profile.v1");
  localStorage.removeItem("esmo.heroProgress.v2");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 350));
  store.getState().save();
  return JSON.stringify({ players: store.getState().players.length });
`;

const clickByText = (text) => `
  const els = [...document.querySelectorAll('button,[role="button"],a,[data-testid]')];
  const el = els.find((e) => (e.innerText || "").trim().includes(${JSON.stringify(text)}));
  if (!el) return JSON.stringify({ ok: false, why: "找不到 " + ${JSON.stringify(text)} });
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((d) => setTimeout(d, 550));
  return JSON.stringify({ ok: true });
`;


/** 點某個 testid，並回報它的可觸控尺寸。 */
const tap = (testid) => `
  const el = document.querySelector('[data-testid="' + ${JSON.stringify(testid)} + '"]');
  if (!el) return JSON.stringify({ ok: false, why: "找不到觸發點" });
  const r = el.getBoundingClientRect();
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((d) => setTimeout(d, 400));
  return JSON.stringify({ ok: true, w: Math.round(r.width), h: Math.round(r.height),
    expanded: el.getAttribute("aria-expanded"), haspopup: el.getAttribute("aria-haspopup") });
`;

/** 讀目前浮層的狀態。 */
const readPanel = () => `
  const pop = document.querySelector(".esmo-pop");
  const sheet = document.querySelector(".esmo-sheet");
  const surface = pop || sheet;
  const vw = window.innerWidth, vh = window.innerHeight;
  let box = null;
  if (surface) {
    const r = surface.getBoundingClientRect();
    box = { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
      w: Math.round(r.width), h: Math.round(r.height) };
  }
  const closeBtn = surface ? surface.querySelector("button[aria-label]") : null;
  const cb = closeBtn ? closeBtn.getBoundingClientRect() : null;
  return JSON.stringify({
    open: !!surface, kind: pop ? "popover" : sheet ? "sheet" : null,
    text: surface ? (surface.innerText || "").replace(/\\s+/g, " ").trim() : "",
    box, vw, vh,
    closeW: cb ? Math.round(cb.width) : 0, closeH: cb ? Math.round(cb.height) : 0,
    role: surface ? surface.getAttribute("role") : null,
    ariaLabel: surface ? surface.getAttribute("aria-label") : null,
  });
`;

const pressEsc = () => `
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await new Promise((d) => setTimeout(d, 350));
  const el = document.activeElement;
  return JSON.stringify({ closed: !document.querySelector(".esmo-pop, .esmo-sheet"),
    focusTestid: el ? el.getAttribute("data-testid") : null });
`;

const result = await runGate({
  name: "UI 漸進式說明（桌機 ＋ 手機）",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [L, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n════ ${L} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await chrome.navigate(url); await sleep(1200);
      const s = J(await chrome.evaluate(seed()));
      ck(`${L}｜precondition：乾淨存檔`, s.players > 0, `${s.players} 名選手`);
      await chrome.navigate(url); await sleep(1300);
      if (mobile) await chrome.evaluate(clickByText("更多"));
      ck(`${L}｜進得了玩家挑戰`, J(await chrome.evaluate(clickByText("玩家挑戰"))).ok);
      await sleep(600);

      // ── ① 點得開（不是只有 hover）─────────────────────────────────────
      const t = J(await chrome.evaluate(tap("challenge-rules")));
      ck(`${L}｜① 規則入口點得開`, t.ok, t.why ?? `${t.w}x${t.h}`);
      ck(`${L}｜① 觸發點的可觸控高度 ≥44px`, t.h >= 44, `${t.h}px`);
      ck(`${L}｜① 觸發點有 aria-haspopup`, t.haspopup === "dialog", String(t.haspopup));

      let p = J(await chrome.evaluate(readPanel()));
      ck(`${L}｜① 說明真的打開了`, p.open === true);
      // ── ② 桌機 popover / 手機 bottom sheet ───────────────────────────
      ck(`${L}｜② 型態正確（${mobile ? "sheet" : "popover"}）`, p.kind === (mobile ? "sheet" : "popover"), p.kind);
      ck(`${L}｜② 沒有跑出畫面左右`, p.box.left >= -1 && p.box.right <= p.vw + 1,
        `left ${p.box.left} right ${p.box.right} / vw ${p.vw}`);
      ck(`${L}｜② 沒有超出畫面上下`, p.box.top >= -1 && p.box.bottom <= p.vh + 1,
        `top ${p.box.top} bottom ${p.box.bottom} / vh ${p.vh}`);
      ck(`${L}｜② 有 dialog 語意與名稱`, p.role === "dialog" && !!p.ariaLabel, `${p.role} / ${p.ariaLabel}`);
      ck(`${L}｜② 關閉鍵 ≥44px`, p.closeW >= 44 && p.closeH >= 44, `${p.closeW}x${p.closeH}`);

      // ── ④ 收起來的內容仍取得得到 ──────────────────────────────────────
      for (const must of ["選手不會得到經驗", "不是其他玩家的戰隊", "還沒有防作弊機制"]) {
        ck(`${L}｜④ 說明裡查得到：${must}`, p.text.includes(must));
      }

      // ── ③ Esc 關得掉，而且焦點回到觸發點 ─────────────────────────────
      const esc = J(await chrome.evaluate(pressEsc()));
      ck(`${L}｜③ Esc 關得掉`, esc.closed === true);
      ck(`${L}｜③ 關掉之後焦點回到觸發點`, esc.focusTestid === "challenge-rules", String(esc.focusTestid));

      // ── 再開一個不同的說明，確認不是只有一個能用 ─────────────────────
      const t2 = J(await chrome.evaluate(tap("challenge-entry-hint")));
      ck(`${L}｜① 欄位補充也點得開`, t2.ok, t2.why ?? "");
      p = J(await chrome.evaluate(readPanel()));
      ck(`${L}｜① 欄位補充有內容`, p.open && p.text.includes("固定"), p.text.slice(0, 40));
      ck(`${L}｜② 欄位補充也沒有跑出畫面`, p.box.left >= -1 && p.box.right <= p.vw + 1);
      await chrome.evaluate(pressEsc());

      // ── ⑤ reduced-motion：關掉動態之後內容仍要是完成狀態 ──────────────
      //  ⚠ 常見的錯誤寫法是「先做動畫、再用 reduce 關掉」，漏掉的那一條會讓
      //    元素永遠停在動畫的**起始**狀態（opacity 0 / 位移中）⇒ 內容看不見。
      //    disclosure.css 是反過來寫的（預設無動畫），這一條就是在釘住它。
      await chrome.send("Emulation.setEmulatedMedia",
        { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await chrome.navigate(url); await sleep(1300);
      if (mobile) await chrome.evaluate(clickByText("更多"));
      await chrome.evaluate(clickByText("玩家挑戰"));
      await sleep(600);
      const rm = J(await chrome.evaluate(tap("challenge-rules")));
      ck(`${L}｜⑤ reduced-motion 下說明仍打得開`, rm.ok, rm.why ?? "");
      const rmPanel = J(await chrome.evaluate(`
        const s = document.querySelector('.esmo-pop, .esmo-sheet');
        if (!s) return JSON.stringify({ ok: false });
        const cs = getComputedStyle(s);
        const r = s.getBoundingClientRect();
        return JSON.stringify({ ok: true, opacity: cs.opacity, h: Math.round(r.height),
          text: (s.innerText || '').length });
      `));
      ck(`${L}｜⑤ reduced-motion 下內容是完成狀態（不是停在動畫起點）`,
        rmPanel.ok && Number(rmPanel.opacity) === 1 && rmPanel.h > 40 && rmPanel.text > 20,
        `opacity=${rmPanel.opacity} h=${rmPanel.h} 字數=${rmPanel.text}`);
      await chrome.evaluate(pressEsc());
      await chrome.send("Emulation.setEmulatedMedia", { features: [] });

      // ── console ───────────────────────────────────────────────────────
      const pageErrs = chrome.pageErrors ?? [];
      ck(`${L}｜無 page-origin uncaught error`, pageErrs.length === 0, pageErrs.slice(0, 2).join(" ¦ ") || "clean");
    }
  },
});

finishGate(result);
