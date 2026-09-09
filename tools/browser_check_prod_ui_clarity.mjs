#!/usr/bin/env node
// ============================================================================
//  正式站 smoke：UI Clarity v1 + v1.1（桌機 1366 ＋ 手機 390）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_prod_ui_clarity.mjs --timeout 1200000`
//
//  ⚠ 正式站是打包後的 bundle，**沒有 /src**（TD-31）⇒ 只能點 UI 與讀 localStorage。
//  ⚠ 與 dev gate 的關鍵差別：正式站的 `isDebugMode()` 是 **false**（不是 dev server），
//    所以這裡看到的才真的是玩家看到的。dev gate 因為 debug 恆開，是比較嚴格的版本。
//  ⚠ 樣板字串裡不得出現反引號（本 repo 反覆踩過）。
//  ⚠ 短的導航標籤一律用**精確**比對：「戰隊」用 includes 會先命中「戰隊發展」。
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));
const PROD = "https://rayhuang0323.github.io/ESMO-/";

/** 玩家正式介面不得出現的程式識別字。 */
const FORBIDDEN = [
  "CHAMPIONS_100", "BattleResult", "profileStore", "Hero Progress",
  "heroProgress", "zustand", "LogicEngine", "MatchSession",
  "SquadSnapshot", "ChallengeInstance", "DraftPolicy", "DraftResult",
];

/** 已刪除的兩支死碼畫面，它們的舊文案不得出現在 bundle 或畫面上。 */
const DEAD_COPY = ["英雄資料庫：CHAMPIONS_100", "全部來自 BattleResult", "Legacy 內聯模組"];

const clickByText = (text, exact = false) => `
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const st = getComputedStyle(e);
    return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
  };
  const els = [...document.querySelectorAll('button,[role="button"],a,[data-testid]')].filter(vis);
  const want = ${JSON.stringify(text)};
  const el = els.find((e) => {
    const t = (e.innerText || "").trim();
    return ${JSON.stringify(exact)} ? t === want : t.includes(want);
  });
  if (!el) return JSON.stringify({ ok: false, why: "找不到 " + want });
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((d) => setTimeout(d, 1300));
  return JSON.stringify({ ok: true });
`;

const clickByTestid = (id) => `
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const sel = "[data-testid=" + JSON.stringify(${JSON.stringify(id)}) + "]";
  const list = [...document.querySelectorAll(sel)].filter(vis);
  if (!list.length) return JSON.stringify({ ok: false, why: "找不到可見的 " + ${JSON.stringify(id)} });
  list[0].scrollIntoView({ block: "center" });
  list[0].click();
  await new Promise((d) => setTimeout(d, 1300));
  return JSON.stringify({ ok: true });
`;

/** 量這一頁：術語、溢出、有沒有真的讀到文字。 */
const inspect = (terms) => `
  const seen = ((document.body.innerText || "").length > 40
    ? document.body.innerText : (document.body.textContent || ""));
  const escaped = (() => {
    const out = [];
    const name = (el) => (el.getAttribute('data-testid') || el.tagName.toLowerCase());
    for (const el of document.querySelectorAll('button, a[role="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const t = (el.innerText || "").trim();
      if (el.scrollWidth > el.clientWidth + 1) { out.push(name(el) + ':內容塞不下'); continue; }
      if (t.length >= 2 && r.height > r.width * 1.6) { out.push(name(el) + ':又高又窄'); continue; }
      let sc = el.parentElement, inSc = false;
      while (sc && sc !== document.body) {
        const ov = getComputedStyle(sc).overflowX;
        if ((ov === 'auto' || ov === 'scroll') && sc.scrollWidth > sc.clientWidth + 1) { inSc = true; break; }
        sc = sc.parentElement;
      }
      if (!inSc && (r.right > window.innerWidth + 1 || r.left < -1)) out.push(name(el) + ':超出畫面');
    }
    return out.slice(0, 6);
  })();
  return JSON.stringify({
    chars: seen.replace(/\\s+/g, "").length,
    bad: ${JSON.stringify(terms)}.filter((t) => seen.includes(t)),
    dead: ${JSON.stringify(DEAD_COPY)}.filter((t) => seen.includes(t)),
    escaped,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    text: seen.replace(/\\s+/g, " ").slice(0, 60),
  });
`;

const seedProd = () => `
  localStorage.removeItem("esmo_debug");
  return JSON.stringify({ ok: true });
`;

const result = await runGate({
  name: "正式站 UI Clarity（桌機 ＋ 手機）",
  externalUrl: PROD,
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [L, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n════ ${L} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await chrome.navigate(url); await sleep(2600);
      await chrome.evaluate(seedProd());
      await chrome.navigate(url); await sleep(2600);

      //  ⚠ 這裡**不驗存檔**：第一輪跑在全新的 Chrome profile 上，這時還沒有存檔
      //    （App 要等玩家開始操作才建新局）。存檔的前提驗在真正需要它的地方
      //    ——下面名單／天賦那一段之前。

      /** 走到某一頁、量它、回首頁。 */
      const visit = async (label, steps) => {
        await chrome.navigate(url); await sleep(2400);
        for (const [step, exact] of steps) {
          const r = J(await chrome.evaluate(
            step.startsWith("#") ? clickByTestid(step.slice(1)) : clickByText(step, exact)));
          if (!r.ok) { ck(`${L}｜${label} 進得去`, false, r.why); return null; }
        }
        const m = J(await chrome.evaluate(inspect(FORBIDDEN)));
        ck(`${L}｜${label} 進得去`, true);
        ck(`${L}｜${label} 讀得到畫面文字`, m.chars > 60, `${m.chars} 字`);
        ck(`${L}｜${label} 沒有工程術語`, m.chars > 60 && m.bad.length === 0, m.bad.join(" ") || "clean");
        ck(`${L}｜${label} 沒有已刪畫面的舊文案`, m.dead.length === 0, m.dead.join(" ") || "clean");
        ck(`${L}｜${label} 沒有元素跑出畫面`, !m.overflow && m.escaped.length === 0,
          m.escaped.join(" ") || "clean");
        return m;
      };

      const more = mobile ? [["更多", true]] : [];
      await visit("俱樂部專精", [...more, ["俱樂部專精", false]]);
      await visit("俱樂部資產", [...more, ["俱樂部資產", false]]);
      await visit("Lineup", [["#home-mode-moba", false]]);
      await visit("戰隊發展", [["戰隊發展", false]]);

      // ── 玩家挑戰：主流程（發起 → 結果）＋ CTA 溢出 ───────────────────
      await chrome.navigate(url); await sleep(2400);
      if (mobile) await chrome.evaluate(clickByText("更多", true));
      const toCh = J(await chrome.evaluate(clickByText("玩家挑戰")));
      ck(`${L}｜玩家挑戰 進得去`, toCh.ok, toCh.why ?? "");
      if (toCh.ok) {
        const m = J(await chrome.evaluate(inspect(FORBIDDEN)));
        ck(`${L}｜玩家挑戰 沒有工程術語`, m.chars > 60 && m.bad.length === 0, m.bad.join(" ") || "clean");
        //  ⭐ 上一輪修掉的 CTA 溢出，正式站要確認沒有再發生。
        ck(`${L}｜⭐ 挑戰卡 CTA 沒有再次溢出`, !m.overflow && m.escaped.length === 0,
          m.escaped.join(" ") || "clean");

        // ── Disclosure：手機必須點得開（沒有 hover）───────────────────
        const rules = J(await chrome.evaluate(`
          const el = document.querySelector('[data-testid="challenge-rules"]');
          if (!el) return JSON.stringify({ ok: false, why: "沒有規則入口" });
          const r = el.getBoundingClientRect();
          el.scrollIntoView({ block: "center" }); el.click();
          await new Promise((d) => setTimeout(d, 500));
          const s = document.querySelector('.esmo-pop, .esmo-sheet');
          const b = s ? s.getBoundingClientRect() : null;
          return JSON.stringify({ ok: !!s, h: Math.round(r.height),
            kind: document.querySelector('.esmo-sheet') ? "sheet" : document.querySelector('.esmo-pop') ? "popover" : null,
            inView: b ? (b.left >= -1 && b.right <= window.innerWidth + 1 && b.bottom <= window.innerHeight + 1) : false,
            text: s ? (s.innerText || "") : "" });
        `));
        ck(`${L}｜InfoHint 點得開（不靠 hover）`, rules.ok, rules.why ?? "");
        ck(`${L}｜InfoHint 觸控目標 ≥44px`, rules.h >= 44, `${rules.h}px`);
        ck(`${L}｜InfoHint 型態正確（${mobile ? "sheet" : "popover"}）`,
          rules.kind === (mobile ? "sheet" : "popover"), String(rules.kind));
        ck(`${L}｜InfoHint 沒有跑出畫面／safe area`, rules.inView === true);
        ck(`${L}｜收起來的說明仍取得得到`, /選手不會得到經驗/.test(rules.text ?? ""));
        await chrome.evaluate(`
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          await new Promise((d) => setTimeout(d, 300)); return JSON.stringify({});`);

        // ── 主流程：發起挑戰 → 出結果 ─────────────────────────────────
        const cand = J(await chrome.evaluate(`
          const el = document.querySelector('[data-testid^="challenge-start-"]');
          if (!el) return JSON.stringify({ ok: false, why: "沒有候選" });
          el.scrollIntoView({ block: "center" }); el.click();
          return JSON.stringify({ ok: true });
        `));
        ck(`${L}｜挑戰發起得了`, cand.ok, cand.why ?? "");
        if (cand.ok) {
          let outcome = "";
          for (let i = 0; i < 120 && !outcome; i++) {
            await sleep(1000);
            outcome = J(await chrome.evaluate(`
              const el = document.querySelector('[data-testid="challenge-outcome"]');
              return JSON.stringify({ v: el ? (el.innerText || "").trim() : "" });`)).v;
          }
          ck(`${L}｜挑戰跑得完並出結果`, /挑戰成功|挑戰失敗|未分勝負/.test(outcome), outcome || "(逾時)");
          const after = J(await chrome.evaluate(inspect(FORBIDDEN)));
          ck(`${L}｜賽後畫面也沒有工程術語`, after.bad.length === 0, after.bad.join(" ") || "clean");
        }
      }

      // ── 選手檔案 → 個人特質 → 返回 ────────────────────────────────────
      await chrome.navigate(url); await sleep(2400);
      //  ⚠ 這一段（也只有這一段）依賴存檔裡真的有選手。先證明前提成立，
      //    否則下面「選到正確的人」會在空名單上得到毫無意義的綠燈。
      const save = J(await chrome.evaluate(`
        const raw = localStorage.getItem("esmo.profile.v1");
        if (!raw) return JSON.stringify({ ok: false, players: 0 });
        return JSON.stringify({ ok: true, players: (JSON.parse(raw).players || []).length });
      `));
      ck(`${L}｜precondition：存檔裡有選手（名單／天賦這一段的前提）`,
        save.ok && save.players > 0, `${save.players} 名`);

      const toRoster = mobile
        ? [["戰隊", true], ["選手名單", false]]
        : [["查看名單", false]];
      let rosterOk = true;
      for (const [step, exact] of toRoster) {
        const r = J(await chrome.evaluate(clickByText(step, exact)));
        if (!r.ok) { rosterOk = false; ck(`${L}｜走得到選手名單`, false, r.why); break; }
      }
      if (rosterOk) {
        ck(`${L}｜走得到選手名單`, true);
        const picked = J(await chrome.evaluate(`
          const rows = [...document.querySelectorAll('[data-testid^="roster-player-"]')]
            .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
          if (rows.length < 2) return JSON.stringify({ ok: false, why: "名單不足兩人" });
          const id = (rows[1].getAttribute("data-testid") || "").replace("roster-player-", "");
          rows[1].scrollIntoView({ block: "center" }); rows[1].click();
          await new Promise((d) => setTimeout(d, 900));
          return JSON.stringify({ ok: true, id });
        `));
        ck(`${L}｜點得到名單上的選手`, picked.ok, picked.why ?? picked.id);
        if (picked.ok) {
          const d1 = J(await chrome.evaluate(clickByText("開啟完整選手檔案")));
          ck(`${L}｜開得了完整選手檔案`, d1.ok, d1.why ?? "");
          const d2 = J(await chrome.evaluate(clickByText("查看個人特質")));
          ck(`${L}｜進得了個人特質／天賦`, d2.ok, d2.why ?? "");
          const t = J(await chrome.evaluate(`
            const root = document.querySelector('[data-testid="talent-screen"]');
            return JSON.stringify({ on: !!root, player: root ? root.getAttribute("data-player") : null,
              buttons: document.querySelectorAll('[data-testid="talent-screen"] button').length });
          `));
          ck(`${L}｜⭐ 天賦頁對到正確的選手`, t.on && t.player === picked.id,
            `畫面 ${t.player} / 點的是 ${picked.id}`);
          ck(`${L}｜天賦樹有可操作內容`, t.buttons >= 3, `${t.buttons} 顆`);
          const tm = J(await chrome.evaluate(inspect(FORBIDDEN)));
          ck(`${L}｜天賦頁沒有工程術語`, tm.bad.length === 0, tm.bad.join(" ") || "clean");
          const back = J(await chrome.evaluate(`
            const el = document.querySelector('[data-testid="talent-screen"] button');
            if (!el) return JSON.stringify({ ok: false });
            el.click(); await new Promise((d) => setTimeout(d, 900));
            return JSON.stringify({ ok: true, left: !document.querySelector('[data-testid="talent-screen"]') });
          `));
          ck(`${L}｜天賦返回流程正常`, back.ok && back.left === true);
        }
      }

      // ── MOBA / CS 入口 ────────────────────────────────────────────────
      await chrome.navigate(url); await sleep(2400);
      ck(`${L}｜MOBA 入口可用`, J(await chrome.evaluate(clickByTestid("home-mode-moba"))).ok);
      await chrome.navigate(url); await sleep(2400);
      ck(`${L}｜CS 入口可用`, J(await chrome.evaluate(clickByTestid("home-mode-cs"))).ok);

      // ── reduced-motion 不壞 ───────────────────────────────────────────
      await chrome.send("Emulation.setEmulatedMedia",
        { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await chrome.navigate(url); await sleep(2600);
      if (mobile) await chrome.evaluate(clickByText("更多", true));
      await chrome.evaluate(clickByText("玩家挑戰"));
      await sleep(900);
      const rm = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid="challenge-rules"]');
        if (!el) return JSON.stringify({ ok: false, why: "沒有規則入口" });
        el.click(); await new Promise((d) => setTimeout(d, 500));
        const s = document.querySelector('.esmo-pop, .esmo-sheet');
        if (!s) return JSON.stringify({ ok: false, why: "reduced-motion 下打不開" });
        const cs = getComputedStyle(s);
        return JSON.stringify({ ok: true, opacity: cs.opacity,
          h: Math.round(s.getBoundingClientRect().height), len: (s.innerText || "").length });
      `));
      ck(`${L}｜reduced-motion 下說明仍打得開`, rm.ok, rm.why ?? "");
      ck(`${L}｜reduced-motion 下內容是完成狀態`,
        rm.ok && Number(rm.opacity) === 1 && rm.h > 40 && rm.len > 20,
        `opacity=${rm.opacity} h=${rm.h} 字=${rm.len}`);
      await chrome.send("Emulation.setEmulatedMedia", { features: [] });

      const pageErrs = chrome.pageErrors ?? [];
      ck(`${L}｜無 page-origin uncaught error`, pageErrs.length === 0,
        pageErrs.slice(0, 2).join(" ¦ ") || "clean");
    }
  },
});

finishGate(result);
