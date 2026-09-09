#!/usr/bin/env node
// ============================================================================
//  天賦頁：**從正式導航走得到**（桌機 1366 ＋ 手機 390）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_talent_reachable.mjs --timeout 900000`
//
//  ⚠ 這支刻意**不驗元件存在**。「PlayerTalentScreen.jsx 在 repo 裡」和
//    「玩家點得到它」是兩件事——我上一輪就是只看原始碼，錯誤地回報
//    「天賦頁可能根本進不去」。實際路徑是：
//      名單 → 點選手（開啟摘要）→ 開啟完整選手檔案 → 選手詳情 → 查看個人特質
//    當時我只查到 `talentMode` 的「查看天賦」就停手，沒往下找。
//
//  ⚠ 也不用 `setScreen` 抄捷徑：那會讓「入口壞掉」永遠驗不出來。
//  ⚠ 樣板字串裡不得出現反引號（本 repo 反覆踩過，本 session 已四次）。
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
  await new Promise((r) => setTimeout(r, 400));
  store.getState().save();
  const ps = store.getState().players ?? [];
  return JSON.stringify({ n: ps.length, ids: ps.map((p) => p.id).slice(0, 6), names: ps.map((p) => p.name).slice(0, 6) });
`;

/**
 * 只點**看得見**的元素：首頁的卡片在桌機／手機各有一份，隱藏的那份點了沒反應。
 *
 * ⚠ `exact` 是必要的，不是講究：底部導航的「戰隊」用 includes 比對，會先命中
 *   首頁那張「戰隊發展」卡（DOM 順序在前），結果跑去戰隊發展頁，
 *   然後看起來像「手機找不到選手名單」。短的導航標籤一律用精確比對。
 */
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
  if (!el) return JSON.stringify({ ok: false, why: "找不到 " + ${JSON.stringify(text)} });
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((d) => setTimeout(d, 1300));
  return JSON.stringify({ ok: true });
`;

/** 點名單上第 n 位選手，並回報點的是誰。 */
const clickPlayer = (idx) => `
  const rows = [...document.querySelectorAll('[data-testid^="roster-player-"]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  const el = rows[${idx}];
  if (!el) return JSON.stringify({ ok: false, why: "名單上沒有第 ${idx + 1} 位可見選手（共 " + rows.length + " 位）" });
  const id = (el.getAttribute("data-testid") || "").replace("roster-player-", "");
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((d) => setTimeout(d, 900));
  return JSON.stringify({ ok: true, id });
`;

const readTalent = () => `
  const root = document.querySelector('[data-testid="talent-screen"]');
  const nameEl = document.querySelector('[data-testid="talent-player-name"]');
  return JSON.stringify({
    on: !!root,
    player: root ? root.getAttribute("data-player") : null,
    name: nameEl ? (nameEl.innerText || "").trim() : null,
    //  天賦樹本身有沒有東西可操作（不是只有殼）
    buttons: document.querySelectorAll('[data-testid="talent-screen"] button').length,
  });
`;

const where = () => `
  return JSON.stringify({
    roster: !!document.querySelector('[data-testid^="roster-player-"]'),
    talent: !!document.querySelector('[data-testid="talent-screen"]'),
    text: (document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 50),
  });
`;

/** 名單入口：桌機在戰隊狀態卡的「查看名單」，手機在「戰隊」分頁的「選手名單」。 */
const TO_ROSTER = {
  desktop: [["查看名單", false]],
  //  ⚠ 底部導航的「戰隊」必須精確比對（見 clickByText 的說明）。
  mobile: [["戰隊", true], ["選手名單", false]],
};

const result = await runGate({
  name: "天賦頁可達性（桌機 ＋ 手機）",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [L, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n════ ${L} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await chrome.navigate(url); await sleep(1200);
      const s = J(await chrome.evaluate(seed()));
      ck(`${L}｜precondition：存檔有選手`, s.n > 0, `${s.n} 名`);
      await chrome.navigate(url); await sleep(1500);

      // ── ① 走到名單 ────────────────────────────────────────────────────
      let ok = true, why = "";
      for (const [step, exact] of (mobile ? TO_ROSTER.mobile : TO_ROSTER.desktop)) {
        const r = J(await chrome.evaluate(clickByText(step, exact)));
        if (!r.ok) { ok = false; why = `${step}：${r.why}`; break; }
      }
      const atRoster = ok ? J(await chrome.evaluate(where())).roster : false;
      ck(`${L}｜① 從首頁走得到選手名單`, atRoster, why || (atRoster ? "" : "點得到但沒到名單"));
      if (!atRoster) continue;

      // ── ② 選第二位選手（不是第一位——才驗得出「選到正確的人」）────────
      const picked = J(await chrome.evaluate(clickPlayer(1)));
      ck(`${L}｜② 點得到名單上的選手`, picked.ok, picked.why ?? picked.id);
      if (!picked.ok) continue;

      // ── ③ 名單摘要 → 選手詳情 ────────────────────────────────────────
      const toDetail = J(await chrome.evaluate(clickByText("開啟完整選手檔案")));
      ck(`${L}｜③ 開得了完整選手檔案`, toDetail.ok, toDetail.why ?? "");
      if (!toDetail.ok) continue;

      // ── ④ 選手詳情 → 天賦樹 ──────────────────────────────────────────
      const toTalent = J(await chrome.evaluate(clickByText("查看個人特質")));
      ck(`${L}｜④ 從選手詳情進得了天賦樹`, toTalent.ok, toTalent.why ?? "");
      const t = J(await chrome.evaluate(readTalent()));
      ck(`${L}｜④ 真的在天賦頁上`, t.on === true);
      //  ⭐ 這一條才是重點：走到的必須是**剛才點的那位**選手。
      ck(`${L}｜④ ⭐ 天賦頁對到的是剛才點的選手`, t.player === picked.id,
        `畫面 ${t.player} / 點的是 ${picked.id}`);
      ck(`${L}｜④ 顯示的是同一個人的名字`, !!t.name && s.names.includes(t.name.split(" ")[0]),
        t.name ?? "(沒有名字)");
      ck(`${L}｜④ 天賦樹有可操作的內容（不是空殼）`, t.buttons >= 3, `${t.buttons} 顆按鈕`);

      // ── ⑤ 返回：要回到選手詳情，不是掉回首頁 ─────────────────────────
      const back = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid="talent-screen"] button');
        if (!el) return JSON.stringify({ ok: false, why: "找不到返回鍵" });
        el.click();
        await new Promise((d) => setTimeout(d, 900));
        const t = (document.body.innerText || "").replace(/\\s+/g, " ");
        return JSON.stringify({ ok: true, backToTalent: !!document.querySelector('[data-testid="talent-screen"]'), text: t.slice(0, 60) });
      `));
      ck(`${L}｜⑤ 返回鍵離得開天賦頁`, back.ok && back.backToTalent === false, back.text ?? back.why ?? "");

      // ── ⑥ reload 之後不會跑到別人身上 ────────────────────────────────
      //  ⚠ 這一頁的畫面狀態存在 React state，reload 會回首頁——那是既有行為。
      //    要驗的是**不會把別人的天賦樹當成這個人的**，而不是硬要它記住位置。
      await chrome.navigate(url); await sleep(1500);
      const afterReload = J(await chrome.evaluate(where()));
      ck(`${L}｜⑥ reload 後不會停在別人的天賦頁`, afterReload.talent === false, afterReload.text);

      const pageErrs = chrome.pageErrors ?? [];
      ck(`${L}｜⑦ 無 page-origin uncaught error`, pageErrs.length === 0, pageErrs.slice(0, 2).join(" ¦ ") || "clean");
    }
  },
});

finishGate(result);
