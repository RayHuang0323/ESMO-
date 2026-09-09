#!/usr/bin/env node
// ============================================================================
//  Player Challenge Slice 5 — 瀏覽器 smoke（桌機 1366 ＋ 手機 390）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_player_challenge_slice5.mjs --timeout 900000`
//
//  Node verifier 證明「Draft 真的進了引擎」；這一支證明**玩家看得到、看得懂**：
//  賽後攤得開雙方 Ban/Pick 與最終陣容、英雄顯示的是名字不是 id、
//  措辭誠實（對手依預存方針回應，不是即時 Ban/Pick）、
//  再試一次會解出新的一份選角、舊版本紀錄的重播被明確拒絕。
//
//  ⚠ 三個既有的坑，這裡都避開：
//    · 樣板字串裡**不得出現反引號**（會提早結束字串）
//    · 選擇器一律 `JSON.stringify` 注入（testid 自己含雙引號）
//    · **不用固定 sleep 等模擬**（會變成「機器夠快才會綠」）⇒ 輪詢
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";
//  ⚠ 從本機原始碼讀版號，拿去比對畫面上真的記下來的值。
import { MOBA_SIMULATION_VERSION } from "../src/platform/contracts/simulationVersion.js";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

const seed = () => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  localStorage.removeItem("esmo.profile.v1");
  localStorage.removeItem("esmo.heroProgress.v2");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 300));
  store.getState().save();
  return JSON.stringify({ players: store.getState().players.length });
`;

const clickBy = (sel) => `
  const sel = ${JSON.stringify(sel)};
  const el = document.querySelector(sel);
  if (!el) return JSON.stringify({ ok: false, why: "找不到 " + sel });
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return JSON.stringify({ ok: false, why: "元素不可見" });
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((done) => setTimeout(done, 420));
  return JSON.stringify({ ok: true, w: Math.round(r.width), h: Math.round(r.height) });
`;

const clickByText = (text) => `
  const els = [...document.querySelectorAll('button,[role="button"],a')];
  const el = els.find((e) => (e.innerText || "").trim().includes(${JSON.stringify(text)}));
  if (!el) return JSON.stringify({ ok: false, why: "找不到含該文字的按鈕" });
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((done) => setTimeout(done, 450));
  return JSON.stringify({ ok: true });
`;

const readScreen = () => `
  const q = (s) => document.querySelector(s);
  const txt = (s) => (q(s)?.innerText || "").trim();
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"; };
  const own = [...document.querySelectorAll('[data-testid^="challenge-"] button, button[data-testid^="challenge-"], [data-testid^="challenge-"] select, select[data-testid^="challenge-"]')];
  const small = own.filter(vis).filter((el) => el.getBoundingClientRect().height < 44)
    .map((el) => (el.innerText || el.tagName).trim().slice(0, 14));
  const cards = [...document.querySelectorAll('[data-testid^="challenge-candidate-"]')].map((el) => ({
    key: el.getAttribute("data-testid").replace("challenge-candidate-", ""),
    slot: el.getAttribute("data-slot"),
  }));
  return JSON.stringify({
    onScreen: !!q('[data-testid="challenge-tier-banner"]'),
    cards,
    outcome: txt('[data-testid="challenge-outcome"]'),
    verifyText: txt('[data-testid="challenge-verify-result"]'),
    draftOpen: !!q('[data-testid="challenge-draft"]'),
    draftText: txt('[data-testid="challenge-draft"]'),
    draftMine: txt('[data-testid="challenge-draft-mine"]'),
    draftOpp: txt('[data-testid="challenge-draft-opponent"]'),
    draftNote: txt('[data-testid="challenge-draft-async-note"]'),
    draftCompare: txt('[data-testid="challenge-draft-compare"]'),
    retryTag: txt('[data-testid="challenge-result-retry"]'),
    historyCount: document.querySelectorAll('[data-testid^="challenge-history-chal:"]').length,
    small, smallCount: small.length,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  });
`;

/** 直接讀存檔（畫面看不到的凍結欄位只能從這裡驗）。 */
const readSave = () => `
  const raw = localStorage.getItem("esmo.profile.v1");
  if (!raw) return JSON.stringify({ ok: false, why: "沒有存檔" });
  const st = (JSON.parse(raw).challenge) || {};
  const ids = st.order || [];
  //  order 是最近在前（challengeState.putInstance 用 unshift）。
  //  讀成最後一筆就會拿到最舊的那場，於是「再試一次」的斷言會落在正式場上。
  //  這行註解在樣板字串裡面：不可以出現反引號。
  const rows = ids.map((id) => {
    const i = st.instances[id] || {};
    return {
      id, kind: i.kind, version: i.simulationVersion,
      draftHash: i.draftResult && i.draftResult.hash,
      chSnap: i.challengerSnapshotHash, defSnap: i.defenderSnapshotHash,
      draftCh: i.draftResult && i.draftResult.challengerSnapshotHash,
      draftDef: i.draftResult && i.draftResult.defenderSnapshotHash,
      seats: i.draftResult ? Object.keys(i.draftResult.assignment).length : 0,
    };
  });
  return JSON.stringify({ ok: true, rows });
`;

async function waitFor(chrome, sleep, script, done, timeoutMs) {
  const t0 = Date.now();
  let value = null;
  while (Date.now() - t0 < timeoutMs) {
    value = J(await chrome.evaluate(script()));
    if (done(value)) return { ok: true, value, ms: Date.now() - t0 };
    await sleep(1000);
  }
  return { ok: false, value, ms: Date.now() - t0 };
}

const result = await runGate({
  name: "Player Challenge Slice 5（桌機 ＋ 手機）",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [L, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n════ ${L} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await chrome.navigate(url); await sleep(1100);
      const s = J(await chrome.evaluate(seed()));
      ck(`${L}｜precondition：乾淨存檔`, s.players > 0, `${s.players} 名選手`);
      await chrome.navigate(url); await sleep(1300);

      if (mobile) await chrome.evaluate(clickByText("更多"));
      ck(`${L}｜① 首頁點得到入口`, J(await chrome.evaluate(clickByText("玩家挑戰"))).ok);
      let v = J(await chrome.evaluate(readScreen()));
      ck(`${L}｜① 進到玩家挑戰畫面`, v.onScreen === true);

      // ── ② 打一場 ─────────────────────────────────────────────────────
      const warm = v.cards.find((c) => c.slot === "warmup") ?? v.cards[0];
      ck(`${L}｜② 有可挑戰的候選`, !!warm, warm?.key ?? "(沒有)");
      ck(`${L}｜② 發起挑戰點得到`, J(await chrome.evaluate(clickBy(`[data-testid="challenge-start-${warm.key}"]`))).ok);
      const w = await waitFor(chrome, sleep, readScreen, (x) => !!x.outcome, 120000);
      ck(`${L}｜② 模擬在時限內完成`, w.ok, `${(w.ms / 1000).toFixed(1)}s`);
      v = w.value;
      ck(`${L}｜② 出現結果`, /挑戰成功|挑戰失敗|未分勝負/.test(v.outcome), v.outcome);

      // ── ③ 選角面板 ───────────────────────────────────────────────────
      ck(`${L}｜③ 賽後看得到這一場的選角`, v.draftOpen === true);
      ck(`${L}｜③ 我方五個席位都有英雄`,
        ["b1", "b2", "b3", "b4", "b5"].every((x) => v.draftMine.includes(x)),
        v.draftMine.replace(/\n/g, " ").slice(0, 60));
      ck(`${L}｜③ 對手五個席位都有英雄`,
        ["r1", "r2", "r3", "r4", "r5"].every((x) => v.draftOpp.includes(x)),
        v.draftOpp.replace(/\n/g, " ").slice(0, 60));
      ck(`${L}｜③ 有路名（不是只有席位代號）`,
        ["上路", "打野", "中路", "下路", "輔助"].every((x) => v.draftMine.includes(x)));
      //  ⚠ heroById 是函式；寫成物件索引的話這裡會顯示成英文 id ⇒ 這條就是那個回歸測試。
      ck(`${L}｜③ 英雄顯示中文名而不是 id`,
        !/\b(ironclad|duskblade|bingshuang|lieyan|cinderfist)\b/.test(v.draftMine + v.draftOpp),
        (v.draftOpp || "").replace(/\n/g, " ").slice(0, 50));

      // ── ④ 誠實措辭 ───────────────────────────────────────────────────
      ck(`${L}｜④ 明說對手依預存選角方針回應`, /預存選角方針/.test(v.draftNote), v.draftNote);
      ck(`${L}｜④ 明說對手不在線上 / 不是即時 Ban·Pick`, /不在線上|不是即時/.test(v.draftNote));
      ck(`${L}｜④ **不出現**「等待對手」這種假的即時感`, !/等待對手|對手正在|思考中/.test(v.draftText));
      ck(`${L}｜④ 沒有假的 AI 教練結論`, !/教練建議|建議先禁|你應該|推薦選角/.test(v.draftText));
      ck(`${L}｜④ 有「方針 vs 實際」對照且只列事實`,
        /他拿到了|被我禁掉|被我先選走|沒拿到/.test(v.draftCompare), v.draftCompare.replace(/\n/g, " ").slice(0, 50));

      // ── ⑤ 存檔裡真的凍結了（畫面看不到的部分）───────────────────────
      const save1 = J(await chrome.evaluate(readSave()));
      ck(`${L}｜⑤ 存檔讀得到這一場`, save1.ok && save1.rows.length >= 1, `${save1.rows?.length} 場`);
      const row1 = save1.rows[0];
      ck(`${L}｜⑤ 場次身上凍結了 DraftResult`, !!row1.draftHash, row1.draftHash ?? "(沒有)");
      ck(`${L}｜⑤ 十個席位都有英雄`, row1.seats === 10, `${row1.seats} 個席位`);
      ck(`${L}｜⑤ DraftResult 綁的是這一場的兩份快照`,
        row1.draftCh === row1.chSnap && row1.draftDef === row1.defSnap);
      ck(`${L}｜⑤ 記錄的是目前的模擬版本`, row1.version === MOBA_SIMULATION_VERSION,
        `${row1.version} vs 本機 ${MOBA_SIMULATION_VERSION}`);

      // ── ⑥ 重播一致 ───────────────────────────────────────────────────
      await chrome.evaluate(clickBy('[data-testid="challenge-verify-btn"]'));
      const vw = await waitFor(chrome, sleep, readScreen, (x) => !!x.verifyText, 120000);
      ck(`${L}｜⑥ 重播與當初完全一致`, /完全一致/.test(vw.value?.verifyText ?? ""),
        vw.value?.verifyText || "(逾時)");

      // ── ⑦ 再試一次：新的一份選角，不套用舊的 ─────────────────────────
      ck(`${L}｜⑦ 再試一次點得到`, J(await chrome.evaluate(clickBy('[data-testid="challenge-retry-btn"]'))).ok);
      const w2 = await waitFor(chrome, sleep, readSave, (x) => x.ok && x.rows.length > save1.rows.length, 120000);
      ck(`${L}｜⑦ 產生新的場次`, w2.ok, `${w2.value?.rows?.length} 場`);
      const row2 = w2.value.rows[0];
      ck(`${L}｜⑦ 新場次標示為 retry`, row2.kind === "retry", row2.kind);
      ck(`${L}｜⑦ 打的是同一份對手快照`, row2.defSnap === row1.defSnap);
      //  ⚠ 這是本輪的紅線之一：不得把舊 DraftResult 套到新快照上。
      ck(`${L}｜⑦ ⭐ 新場次的 DraftResult 綁的是**新的**我方快照`,
        row2.draftCh === row2.chSnap, `${String(row2.draftCh).slice(0, 8)} vs ${String(row2.chSnap).slice(0, 8)}`);

      // ── ⑧ 舊版本紀錄：明確拒絕重播，不得靜默重算 ─────────────────────
      const forged = J(await chrome.evaluate(`
        const raw = localStorage.getItem("esmo.profile.v1");
        const save = JSON.parse(raw);
        const id = save.challenge.order[0];
        save.challenge.instances[id].simulationVersion = "moba-sim.v1";
        localStorage.setItem("esmo.profile.v1", JSON.stringify(save));
        return JSON.stringify({ ok: true, id });
      `));
      ck(`${L}｜⑧ 偽造得出一筆舊版本紀錄`, forged.ok === true);
      await chrome.navigate(url); await sleep(1400);
      if (mobile) await chrome.evaluate(clickByText("更多"));
      await chrome.evaluate(clickByText("玩家挑戰"));
      await sleep(600);
      ck(`${L}｜⑧ 歷史紀錄點得開`,
        J(await chrome.evaluate(clickBy(`[data-testid="challenge-history-${forged.id}"]`))).ok);
      await chrome.evaluate(clickBy('[data-testid="challenge-verify-btn"]'));
      const refused = await waitFor(chrome, sleep, readScreen, (x) => !!x.verifyText, 60000);
      ck(`${L}｜⑧ 舊版本的重播**沒有**回報一致`,
        !/完全一致/.test(refused.value?.verifyText ?? ""), refused.value?.verifyText || "(逾時)");
      ck(`${L}｜⑧ 拒絕理由明講是模擬版本／語意不符`,
        /模擬語意|模擬版本|不可重播/.test(refused.value?.verifyText ?? ""),
        refused.value?.verifyText || "");

      // ── ⑨ 版面 ───────────────────────────────────────────────────────
      v = J(await chrome.evaluate(readScreen()));
      ck(`${L}｜⑨ 不造成水平溢出`, v.overflow === false);
      if (mobile) ck(`${L}｜⑨ 本頁互動元素都 ≥44px`, v.smallCount === 0, v.small.join(",") || "clean");

      // ── ⑩ console 錯誤 ──────────────────────────────────────────────
      const pageErrs = chrome.pageErrors ?? [];
      ck(`${L}｜⑩ 無 page-origin uncaught error`, pageErrs.length === 0,
        pageErrs.slice(0, 2).join(" ¦ ") || "clean");
    }
  },
});

finishGate(result);
