#!/usr/bin/env node
// ============================================================================
//  Player Challenge Slice 1–3 — **正式站** production smoke（桌機 ＋ 手機 390）
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_prod_player_challenge.mjs --timeout 900000`
//
//  ⚠ 正式站是打包後的 bundle，**沒有 `/src/...`** ⇒ 只能點 UI 與讀 localStorage
//    （TD-31 的教訓）。所有斷言都必須是玩家看得到的東西。
//  ⚠ 生涯隔離的比對讀的是 `esmo.profile.v1` 的**實際內容**，
//    而且**先驗證前提成立**（存檔真的存在、真的有選手）才比對——
//    憑 localStorage 推定會產生假綠（既有教訓）。
//  ⚠ 不用固定 sleep 等模擬（會變成「機器夠快才會綠」）⇒ 輪詢。
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";
//  ⚠ 從**本機原始碼**讀目前版本，拿去比對正式站存下來的值。
//    這正是要抓的東西：部署沒生效 ⇒ 正式站記的還是舊版號 ⇒ 這裡會紅。
import { MOBA_SIMULATION_VERSION } from "../src/platform/contracts/simulationVersion.js";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));
const PROD = "https://rayhuang0323.github.io/ESMO-/";

const clickByText = (text) => `
  const els = [...document.querySelectorAll('button,[role="button"],a')];
  const el = els.find((e) => (e.innerText || "").trim().includes(${JSON.stringify(text)}));
  if (!el) return JSON.stringify({ ok: false, why: "找不到含該文字的按鈕" });
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((done) => setTimeout(done, 500));
  return JSON.stringify({ ok: true });
`;

const clickBy = (sel) => `
  const sel = ${JSON.stringify(sel)};
  const el = document.querySelector(sel);
  if (!el) return JSON.stringify({ ok: false, why: "找不到 " + sel });
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return JSON.stringify({ ok: false, why: "元素不可見" });
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((done) => setTimeout(done, 450));
  return JSON.stringify({ ok: true, w: Math.round(r.width), h: Math.round(r.height) });
`;

/** 生涯指紋：直接讀存檔內容。⚠ 不含 `challenge` 切片（那一格本來就該變）。 */
const CAREER = `
  const raw = localStorage.getItem("esmo.profile.v1");
  if (!raw) return JSON.stringify({ ok: false, why: "存檔還不存在" });
  const s = JSON.parse(raw);
  return JSON.stringify({
    ok: true,
    players: Array.isArray(s.players) ? s.players.length : 0,
    fp: JSON.stringify({
      players: s.players, meta: s.meta, lineup: s.lineup, team: s.team,
      competition: s.competition, competitionHistory: s.competitionHistory,
      retention: s.retention, clubMastery: s.clubMastery,
      processedMatchTransactions: s.processedMatchTransactions, honors: s.honors,
    }),
    funds: s.meta?.funds ?? null, fans: s.meta?.fans ?? null, days: s.meta?.days ?? null,
    xpSum: (s.players ?? []).reduce((a, p) => a + (Number(p.xp) || 0), 0),
    energySum: (s.players ?? []).reduce((a, p) => a + (Number(p.energy) || 0), 0),
    block: JSON.stringify(s.meta?.competitiveBlock ?? null),
  });
`;

const readScreen = () => `
  const q = (s) => document.querySelector(s);
  const txt = (s) => (q(s)?.innerText || "").trim();
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"; };
  const own = [...document.querySelectorAll('[data-testid^="challenge-"] button, [data-testid^="challenge-"] select, button[data-testid^="challenge-"], select[data-testid^="challenge-"]')];
  const small = own.filter(vis).filter((el) => el.getBoundingClientRect().height < 44)
    .map((el) => (el.innerText || el.tagName).trim().slice(0, 14));
  const cards = [...document.querySelectorAll('[data-testid^="challenge-candidate-"]')].map((el) => ({
    key: el.getAttribute("data-testid").replace("challenge-candidate-", ""),
    slot: el.getAttribute("data-slot"),
    text: (el.innerText || "").trim(),
  }));
  return JSON.stringify({
    onScreen: !!q('[data-testid="challenge-tier-banner"]'),
    tierName: txt('[data-testid="challenge-tier-name"]'),
    careerSafe: txt('[data-testid="challenge-career-safe"]'),
    cards,
    hasDefense: !!q('[data-testid="challenge-defense-card"]'),
    detailText: txt('[data-testid^="challenge-detail-body-"]'),
    outcome: txt('[data-testid="challenge-outcome"]'),
    score: txt('[data-testid="challenge-score"]'),
    evidenceMine: txt('[data-testid="challenge-evidence-mine"]'),
    verifyText: txt('[data-testid="challenge-verify-result"]'),
    historyCount: document.querySelectorAll('[data-testid^="challenge-history-chal:"]').length,
    small, smallCount: small.length,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  });
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
  name: "正式站 Player Challenge（桌機 ＋ 手機）",
  externalUrl: PROD,
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [L, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n════ ${L} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

      //  乾淨起點：清存檔再重載（正式站沒有存檔時會自建預設局）。
      await chrome.navigate(url); await sleep(2200);
      await chrome.evaluate(`localStorage.clear(); return "1";`);
      await chrome.navigate(url); await sleep(2800);

      // ── ① 入口 ───────────────────────────────────────────────────────
      if (mobile) await chrome.evaluate(clickByText("更多"));
      const entry = J(await chrome.evaluate(clickByText("玩家挑戰")));
      ck(`${L}｜① 首頁點得到「玩家挑戰」`, entry.ok, entry.why ?? "");
      let v = J(await chrome.evaluate(readScreen()));
      ck(`${L}｜① 進到玩家挑戰畫面`, v.onScreen === true);
      ck(`${L}｜① 標示為玩家挑戰`, v.tierName === "玩家挑戰", v.tierName);
      //  ⚠ 2026-09-10：這五條原本斷言的是長句（「不增加生涯成長」…）。
      //    `c99bfed`（UI Clarity）把第一層改成短標籤、完整說明移進第二層，
      //    所以那些長句在 bundle 裡已經不存在 —— 本 gate 從那時起就是紅的，
      //    與 Slice 6 無關。這裡改成驗**現行第一層標籤**，並額外要求第二層
      //    仍講得出完整保證：兩層都驗，檢定力不比原本低。
      for (const t of ["0 生涯成長", "不耗體力", "不推進日期", "不影響正式賽季", "無排位"]) {
        ck(`${L}｜① 第一層看得到「${t}」`, v.careerSafe.includes(t), v.careerSafe);
      }
      const deep = J(await chrome.evaluate(`
        //  用 testid 定位第二層（challenge-rules 是規則的 InfoHint），
        //  不要靠按鈕文字猜：文字會隨文案調整而變，testid 才是穩定識別。
        const el = document.querySelector('[data-testid="challenge-rules"]');
        const btn = el?.tagName === "BUTTON" ? el : el?.querySelector("button") ?? el;
        btn?.click();
        await new Promise((r) => setTimeout(r, 600));
        return JSON.stringify({ opened: !!btn, text: document.body.innerText });
      `));
      ck(`${L}｜① 第二層仍講得出完整生涯隔離保證`,
        !!deep?.text && /經驗/.test(deep.text) && /體力/.test(deep.text)
        && /日期/.test(deep.text) && /排位/.test(deep.text),
        (deep?.text ?? "").includes("不寫回生涯") ? "含「不寫回生涯」" : "(未找到完整說明)");

      // ── ② 發布防守陣容 ───────────────────────────────────────────────
      const pub = J(await chrome.evaluate(clickBy('[data-testid="challenge-publish-btn"]')));
      ck(`${L}｜② 發布按鈕點得到`, pub.ok, pub.why ?? "");
      v = J(await chrome.evaluate(readScreen()));
      ck(`${L}｜② 出現防守陣容卡`, v.hasDefense === true);

      //  ⚠ **先驗證前提成立**再談生涯隔離：存檔真的寫出來、真的有選手。
      const before = J(await chrome.evaluate(CAREER));
      ck(`${L}｜② precondition：正式站存檔已寫出且有選手`, before.ok === true && before.players > 0,
        before.ok ? `${before.players} 名選手 / 第 ${before.days} 天` : before.why);

      // ── ③ Challenge Board ────────────────────────────────────────────
      ck(`${L}｜③ 看板列出 5 個候選`, v.cards.length === 5, `${v.cards.length} 個`);
      ck(`${L}｜③ 每張卡都有候選位`, v.cards.every((c) => !!c.slot), v.cards.map((c) => `${c.key}:${c.slot}`).join(" "));
      ck(`${L}｜③ 至少一個「可以先試手」`, v.cards.some((c) => c.slot === "warmup"));
      ck(`${L}｜③ 卡片有熟練與新鮮度`,
        v.cards.every((c) => /英雄熟練 平均 Lv\./.test(c.text) && /(今天發布|天前發布)/.test(c.text)));
      //  ⚠ 2026-09-10：原本斷言「每張卡都要有紀錄行」。`c99bfed`（UI Clarity）
      //    刻意改成**打過之後才出現**（冷啟時每張都寫「還沒挑戰過」是重複，
      //    看板頂端已經說過一次）⇒ 這條從那時起就與設計相反，本來就該紅，
      //    與 Slice 6 無關。改成驗真正的意圖：冷啟不出現、打完才出現。
      ck(`${L}｜③ 冷啟時卡片不重複「還沒挑戰過」`,
        v.cards.every((c) => !/還沒有挑戰過這支隊伍/.test(c.text)),
        v.cards.filter((c) => /還沒有挑戰過這支隊伍/.test(c.text)).map((c) => c.key).join(",") || "都沒有");
      ck(`${L}｜③ 卡片不出現戰力／勝率宣告`, v.cards.every((c) => !/戰力|勝率|評分|星等/.test(c.text)));

      const warm = v.cards.find((c) => c.slot === "warmup") ?? v.cards[0];
      const det = J(await chrome.evaluate(clickBy(`[data-testid="challenge-detail-${warm.key}"]`)));
      ck(`${L}｜③ 對手詳情展得開`, det.ok, det.why ?? "");
      v = J(await chrome.evaluate(readScreen()));
      ck(`${L}｜③ 詳情有流派與取捨`, /強攻|控圖|應變/.test(v.detailText));
      ck(`${L}｜③ 詳情有預存戰術與弱點`, /預存戰術/.test(v.detailText) && /弱點/.test(v.detailText));
      ck(`${L}｜③ 詳情有五名先發`, ["b1", "b2", "b3", "b4", "b5"].every((x) => v.detailText.includes(x)));

      // ── ④ 發起挑戰 → 手動選角 → 真的跑完 ───────────────────────────
      //  ⚠ Slice 6 起，「發起挑戰」進的是**手動 Ban/Pick**，不是直接開打。
      //    這不是把斷言放寬，是流程真的多了一段：下面照樣要求真 MOBA 模擬
      //    跑完、結果顯示、重播一致，只是中間多走玩家自己選角這一步。
      const start = J(await chrome.evaluate(clickBy(`[data-testid="challenge-start-${warm.key}"]`)));
      ck(`${L}｜④ 發起挑戰點得到`, start.ok, start.why ?? "");
      const onDraft = await waitFor(chrome, sleep,
        () => `return JSON.stringify({ grid: !!document.querySelector('[data-testid="hero-grid-scroll"]') });`,
        (x) => x.grid === true, 30000);
      ck(`${L}｜④ 進到手動選角`, onDraft.ok);
      //  選滿 3 ban + 5 pick（點看得見的第一張卡，選不到就往下捲）。
      for (let i = 0; i < 20; i++) {
        const st = J(await chrome.evaluate(`
          const raw = localStorage.getItem("esmo.profile.v1");
          const pd = raw ? JSON.parse(raw)?.challenge?.pendingDraft ?? null : null;
          if (!pd) return JSON.stringify({ done: true });
          const b = pd.actions.filter((a) => a.act === "ban").length;
          const p = pd.actions.filter((a) => a.act === "pick").length;
          return JSON.stringify({ done: b >= 3 && p >= 5, b, p });
        `));
        if (st?.done) break;
        const tapped = J(await chrome.evaluate(`
          const el = document.querySelector('[data-testid="hero-grid-scroll"]');
          if (!el) return JSON.stringify({ ok: false });
          const r = el.getBoundingClientRect();
          const b = [...el.querySelectorAll('[data-testid="hero-choose"]')].find((n) => {
            const q = n.getBoundingClientRect();
            return q.top >= r.top && q.bottom <= r.bottom && q.top >= 0 && q.bottom <= innerHeight;
          });
          if (!b) { el.scrollTop += 160; return JSON.stringify({ ok: false, scrolled: true }); }
          b.click();
          return JSON.stringify({ ok: true, hero: b.getAttribute("data-hero") });
        `));
        await sleep(tapped?.ok ? 450 : 250);
      }
      const drafted = J(await chrome.evaluate(`
        const raw = localStorage.getItem("esmo.profile.v1");
        const pd = raw ? JSON.parse(raw)?.challenge?.pendingDraft ?? null : null;
        return JSON.stringify({
          bans: (pd?.actions ?? []).filter((a) => a.act === "ban").map((a) => a.heroId),
          picks: (pd?.actions ?? []).filter((a) => a.act === "pick").map((a) => a.heroId),
        });
      `));
      ck(`${L}｜④ 玩家選滿 3 ban + 5 pick`,
        drafted?.bans?.length === 3 && drafted?.picks?.length === 5,
        `${drafted?.bans?.length} ban / ${drafted?.picks?.length} pick`);
      await chrome.evaluate(`
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        [...document.querySelectorAll("button")].filter(vis)
          .find((n) => !n.disabled && /確認|開始/.test(n.innerText || ""))?.click();
        return JSON.stringify({});
      `);
      const w = await waitFor(chrome, sleep, readScreen, (x) => !!x.outcome, 120000);
      ck(`${L}｜④ 真 MOBA 模擬在時限內完成`, w.ok, `${(w.ms / 1000).toFixed(1)}s`);
      v = w.value;
      ck(`${L}｜④ 結果立即顯示`, /挑戰成功|挑戰失敗|未分勝負/.test(v.outcome), v.outcome);
      ck(`${L}｜④ 有比分與時長`, /擊殺 \d+ : \d+/.test(v.score), v.score);
      ck(`${L}｜④ 有「宣告 vs 實際」對照`, /目標 \d+/.test(v.evidenceMine));
      //  ⚠ Slice 6：凍結的那一份必須就是玩家剛剛選的，不是方針補出來的。
      const frozen = J(await chrome.evaluate(`
        const cur = JSON.parse(localStorage.getItem("esmo.profile.v1")).challenge;
        const id = (cur.order ?? [])[0];
        const d = cur.instances[id]?.draftResult ?? null;
        return JSON.stringify({ bans: d?.bans?.challenger ?? null, picks: d?.picks?.challenger ?? null,
          autofill: d?.resolution?.challengerAutofillTrace?.length ?? null });
      `));
      ck(`${L}｜④ 凍結的選角就是玩家選的那一手`,
        JSON.stringify(frozen?.bans) === JSON.stringify(drafted?.bans)
        && JSON.stringify(frozen?.picks) === JSON.stringify(drafted?.picks),
        `${JSON.stringify(frozen?.bans)} / ${JSON.stringify(frozen?.picks)}`);
      ck(`${L}｜④ 玩家選滿 ⇒ 沒有自動補位`, frozen?.autofill === 0, `${frozen?.autofill} 手`);

      // ── ⑤ 重播驗證 ───────────────────────────────────────────────────
      await chrome.evaluate(clickBy('[data-testid="challenge-verify-btn"]'));
      const vw = await waitFor(chrome, sleep, readScreen, (x) => !!x.verifyText, 120000);
      ck(`${L}｜⑤ 重播與當初一致`, /完全一致/.test(vw.value.verifyText), vw.value.verifyText || "(逾時)");

      //  ⚠ 承上：打完之後，**被挑戰的那一隊**的卡片必須長出紀錄行。
      //    只驗「冷啟沒有」會讓「永遠不顯示」也過關 —— 兩端都要驗才有檢定力。
      const boardAfter = J(await chrome.evaluate(readScreen()));
      const chall = boardAfter.cards?.find((c) => c.key === warm.key) ?? null;
      ck(`${L}｜③ 打完之後該隊卡片出現「你挑戰過」`,
        !!chall && /你挑戰過/.test(chall.text), chall ? chall.text.slice(0, 60) : "(找不到那張卡)");

      // ── ⑥ 生涯隔離（正式站實測）─────────────────────────────────────
      const after = J(await chrome.evaluate(CAREER));
      ck(`${L}｜⑥ 生涯狀態逐值一致`, after.ok && after.fp === before.fp);
      ck(`${L}｜⑥ 0 Career growth（選手 XP 不變）`, after.xpSum === before.xpSum, `${before.xpSum} → ${after.xpSum}`);
      ck(`${L}｜⑥ 0 stamina（體力總和不變）`, after.energySum === before.energySum, `${before.energySum} → ${after.energySum}`);
      ck(`${L}｜⑥ 0 money / fans`, after.funds === before.funds && after.fans === before.fans,
        `$${before.funds}/${before.fans} → $${after.funds}/${after.fans}`);
      ck(`${L}｜⑥ 0 world-time（生涯日不變）`, after.days === before.days, `第 ${before.days} 天`);
      ck(`${L}｜⑥ 0 formal standings（賽季帳本不變）`, after.fp.includes('"competition"') === before.fp.includes('"competition"'));
      ck(`${L}｜⑥ 不吃每日競技容量`, after.block === before.block, `${before.block} → ${after.block}`);
      //  ⚠ LadderRating 在產品裡根本不存在 ⇒ 斷言「存檔裡沒有這個欄位」。
      const ladder = J(await chrome.evaluate(`
        const raw = localStorage.getItem("esmo.profile.v1") || "";
        return JSON.stringify({ has: /ladderRating|ladder_rating|mmr/i.test(raw) });
      `));
      ck(`${L}｜⑥ 0 LadderRating（存檔裡沒有任何 ladder/mmr 欄位）`, ladder.has === false);

      // ── ⑦ reload 後紀錄仍在 ─────────────────────────────────────────
      await chrome.navigate(url); await sleep(2600);
      if (mobile) await chrome.evaluate(clickByText("更多"));
      await chrome.evaluate(clickByText("玩家挑戰"));
      await sleep(700);
      v = J(await chrome.evaluate(readScreen()));
      ck(`${L}｜⑦ reload 後挑戰紀錄仍在`, v.historyCount >= 1, `${v.historyCount} 筆`);
      ck(`${L}｜⑦ reload 後防守陣容仍在`, v.hasDefense === true);
      const open = J(await chrome.evaluate(`
        const el = document.querySelector('[data-testid^="challenge-history-chal:"]');
        if (!el) return JSON.stringify({ ok: false, why: "沒有紀錄可點" });
        el.scrollIntoView({ block: "center" }); el.click();
        await new Promise((d) => setTimeout(d, 500));
        return JSON.stringify({ ok: true });
      `));
      ck(`${L}｜⑦ reload 後點得開那一場`, open.ok, open.why ?? "");
      v = J(await chrome.evaluate(readScreen()));
      ck(`${L}｜⑦ reload 後看得到同一場結果`, /挑戰成功|挑戰失敗|未分勝負/.test(v.outcome), v.outcome);

      // ── ⑧ 這一場的選角（Slice 5）─────────────────────────────────────
      //  ⚠ 對手不在線：畫面必須說「依預存選角方針回應」，
      //    不得寫成「等待對手 Ban/Pick」那種假的即時感。
      const draftUi = J(await chrome.evaluate(`
        const box = document.querySelector('[data-testid="challenge-draft"]');
        if (!box) return JSON.stringify({ ok: false });
        const t = (s) => (document.querySelector('[data-testid="' + s + '"]')?.innerText || "");
        return JSON.stringify({
          ok: true, text: box.innerText || "",
          mine: t("challenge-draft-mine"), opp: t("challenge-draft-opponent"),
          note: t("challenge-draft-async-note"), compare: t("challenge-draft-compare"),
        });
      `));
      ck(`${L}｜⑧ 看得到這一場的選角面板`, draftUi.ok === true);
      ck(`${L}｜⑧ 我方五個席位都有英雄`,
        ["b1", "b2", "b3", "b4", "b5"].every((s) => (draftUi.mine || "").includes(s)));
      ck(`${L}｜⑧ 對手五個席位都有英雄`,
        ["r1", "r2", "r3", "r4", "r5"].every((s) => (draftUi.opp || "").includes(s)));
      ck(`${L}｜⑧ 英雄顯示的是名字不是 id`,
        !/\b(ironclad|duskblade|bingshuang)\b/.test(draftUi.mine + draftUi.opp),
        (draftUi.mine || "").replace(/\s+/g, " ").slice(0, 60));
      ck(`${L}｜⑧ 明說對手是依預存方針回應、且不在線上`,
        /預存選角方針/.test(draftUi.note) && /不在線上|不是即時/.test(draftUi.note), draftUi.note);
      ck(`${L}｜⑧ **不出現**「等待對手」這種假的即時感`,
        !/等待對手|對手正在|思考中/.test(draftUi.text));
      ck(`${L}｜⑧ 有賽後「方針 vs 實際」對照`,
        /他拿到了|被我禁掉|被我先選走|沒拿到/.test(draftUi.compare), (draftUi.compare || "").slice(0, 50));

      // ── ⑧b 模擬版本閘門（正式站實測）───────────────────────────────
      //  ⚠ 這一段原本只活在 scratchpad 的一次性腳本裡。
      //    只在 scratchpad 存在的關鍵驗證＝下一次沒有人會跑＝等於沒有驗證。
      const verBefore = J(await chrome.evaluate(`
        const raw = localStorage.getItem("esmo.profile.v1");
        if (!raw) return JSON.stringify({ ok: false, why: "沒有存檔" });
        const st = JSON.parse(raw).challenge || {};
        const ids = st.order || [];
        const vs = ids.map((id) => st.instances?.[id]?.simulationVersion).filter(Boolean);
        const drafts = ids.map((id) => st.instances?.[id]?.draftResult?.hash).filter(Boolean);
        return JSON.stringify({ ok: true, n: ids.length, versions: [...new Set(vs)], drafts: drafts.length, firstId: ids[0] || null });
      `));
      ck(`${L}｜⑧b precondition：正式站真的存下了挑戰場次`,
        verBefore.ok === true && verBefore.n > 0, `${verBefore.n} 場`);
      ck(`${L}｜⑧b 正式站記錄的是目前的模擬版本`,
        verBefore.versions.length === 1 && verBefore.versions[0] === MOBA_SIMULATION_VERSION,
        `${verBefore.versions.join(",")} vs 本機 ${MOBA_SIMULATION_VERSION}`);
      ck(`${L}｜⑧b 每一場都凍結了自己的 DraftResult`,
        verBefore.drafts === verBefore.n, `${verBefore.drafts}/${verBefore.n}`);

      //  把其中一場改成舊版號 ⇒ 重播必須被**明確拒絕**，不得靜默用新規則重算。
      //  ⚠ v1 與 v2 **各驗一次**。只驗 v1 的話，v2 就只是推論——
      //    而 v2 才是玩家手上真的會有的舊存檔（v1 是 Rift 330 之前的）。
      for (const legacy of ["moba-sim.v1", "moba-sim.v2"]) {
        const forged = J(await chrome.evaluate(`
          const raw = localStorage.getItem("esmo.profile.v1");
          const save = JSON.parse(raw);
          const id = save.challenge.order[0];
          save.challenge.instances[id].simulationVersion = "${legacy}";
          localStorage.setItem("esmo.profile.v1", JSON.stringify(save));
          return JSON.stringify({ ok: true, id });
        `));
        ck(`${L}｜⑧b ${legacy}：偽造得出一筆舊版本紀錄`, forged.ok === true);
        await chrome.navigate(url); await sleep(2600);
        if (mobile) await chrome.evaluate(clickByText("更多"));
        await chrome.evaluate(clickByText("玩家挑戰"));
        await sleep(700);
        //  ⚠ 舊結果**必須讀得到**（只是不可重播）——先證明這一點。
        const stillThere = J(await chrome.evaluate(clickBy(`[data-testid="challenge-history-${forged.id}"]`)));
        ck(`${L}｜⑧b ${legacy}：舊場次的紀錄仍讀得到（不是被刪掉）`, stillThere.ok, stillThere.why ?? "");
        await chrome.evaluate(clickBy('[data-testid="challenge-verify-btn"]'));
        const refused = await waitFor(chrome, sleep, readScreen, (x) => !!x.verifyText, 60000);
        ck(`${L}｜⑧b ${legacy}：重播被拒絕（不是靜默用 v3 重算）`,
          !/完全一致/.test(refused.value?.verifyText ?? ""), refused.value?.verifyText || "(逾時)");
        ck(`${L}｜⑧b ${legacy}：拒絕理由明講版本不相容`,
          /模擬語意|模擬版本|不可重播/.test(refused.value?.verifyText ?? "")
          && (refused.value?.verifyText ?? "").includes(legacy),
          refused.value?.verifyText || "");
      }

      // ── ⑧c 版面 ─────────────────────────────────────────────────────
      v = J(await chrome.evaluate(readScreen()));
      ck(`${L}｜⑧c 不造成水平溢出`, v.overflow === false);
      if (mobile) ck(`${L}｜⑧c 本頁互動元素都 ≥44px`, v.smallCount === 0, v.small.join(",") || "clean");

      // ── ⑨ CS 入口未被破壞（只確認入口，不重跑 Codex 全套）───────────
      await chrome.navigate(url); await sleep(2600);
      const cs = J(await chrome.evaluate(clickByText("CS")));
      ck(`${L}｜⑨ 首頁 CS 入口點得到`, cs.ok, cs.why ?? "");
      await sleep(1200);
      const csScreen = J(await chrome.evaluate(`
        const t = (document.body.innerText || "").trim();
        return JSON.stringify({ len: t.length, sample: t.replace(/\\s+/g, " ").slice(0, 90) });
      `));
      ck(`${L}｜⑨ CS 畫面開得起來`, csScreen.len > 40, csScreen.sample);
      await chrome.navigate(url); await sleep(2400);
      const backMoba = J(await chrome.evaluate(clickByText("MOBA")));
      ck(`${L}｜⑨ 回首頁後 MOBA 入口仍可用`, backMoba.ok, backMoba.why ?? "");

      // ── ⑩ console 錯誤 ──────────────────────────────────────────────
      const errs = (chrome.consoleLines ?? []).filter((l) => /^\[error\]/i.test(l));
      const pageErrs = chrome.pageErrors ?? [];
      ck(`${L}｜⑩ 無 page-origin uncaught error`, pageErrs.length === 0,
        pageErrs.slice(0, 2).join(" ¦ ") || "clean");
      if (errs.length) console.log(`   ⓘ console [error] ${errs.length} 筆：${errs.slice(0, 2).join(" ¦ ")}`);
    }
  },
});

finishGate(result);
