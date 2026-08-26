#!/usr/bin/env node
// ============================================================================
//  tools/check_offseason_session_v6.mjs — V6-3：正式 Off-season 經營流程
//
//  執行：repo 根目錄 `node tools/check_offseason_session_v6.mjs`；失敗 exit 1。
//
//  ── 這一輪把散落的年度決策收成一個流程 ───────────────────────────────────
//  V5-3 起「有人宣布退役」、V6-2 起「有人合約到期」都已經是真實決策，
//  但它們散在收件匣與首頁一行字裡。V6-3 把它們收進一個**會停下來的休賽期**。
//
//  ── 紅線 ──────────────────────────────────────────────────────────────────
//  · **沒有決策就不得多卡一道畫面**（空殼頁比沒有頁更糟）
//  · 續約要真的扣錢；**放走不得偷偷扣錢**
//  · 補強沿用既有 Recruit / 市場價值，**不建第二套**
//  · 沒錢也要走得下去——靠既有 roster floor，**不得永久卡死**
//  · MOBA / CS 共用同一個生涯年度，**不得各開一次**
//
//  §S 會期　§O 開啟條件　§M 金流　§F 安全出口　§A 快轉停下
//  §I 冪等／reload　§L 15 年長跑　§U 畫面　§N 邊界　§X sentinel
// ============================================================================
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);
const soft = async (p) => { try { return await imp(p); } catch { return null; } };

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`✅ ${n}${d ? "　" + d : ""}`); }
  else { fail++; console.log(`❌ ${n}${d ? "　" + d : ""}`); }
};
const codeOnly = (src) => src.split(/\r?\n/)
  .filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

const P_SESS = "src/platform/time/offSeasonSession.js";
const P_STORE = "src/platform/profileStore.js";
const P_FF = "src/platform/time/fastForward.js";
const P_SCREEN = "src/screens/manage/OffSeasonScreen.jsx";
const KEY = "esmo.profile.v1";

const sess = await soft(P_SESS);
const model = await imp("src/data/playerModel.js");
const market = await imp("src/platform/economy/marketValue.js");
const contract = await imp("src/platform/progress/contract.js");

const mk = (o = {}) => ({
  id: o.id ?? "p", name: o.id ?? "p", role: "中路", age: o.age ?? 25, potential: 88,
  lv: 40, energy: 100, contract: o.contract ?? 400,
  ...(o.intent ? { retirement: { intentYear: o.intent } } : {}),
  stats: Object.fromEntries(model.STAT_DEF.map((s) => [s.key, o.at ?? 70])),
});
const st = (players, meta = {}) => ({ meta: { days: 85, ...meta }, players, finance: { funds: 5_000_000 } });

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§S 會期契約】");

ck("S1) 有獨立的休賽期會期模組 `time/offSeasonSession.js`", !!sess, sess ? "" : "模組不存在");
ck("S2) 純模組", !!sess && !/profileStore|zustand|from "react"|localStorage/.test(codeOnly(read(P_SESS))));
ck("S3) 入口齊全：`pendingDecisionsOf` / `openSession` / `completeSession` / `sessionOf`",
  !!sess && ["pendingDecisionsOf", "openSession", "completeSession", "sessionOf"].every((f) => typeof sess[f] === "function"));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§O 開啟條件：沒有決策就不開】");

ck("O1) 全隊合約很長、沒人宣布退役 ⇒ **沒有待辦決策**",
  !!sess && sess.pendingDecisionsOf(st([mk({ id: "a" }), mk({ id: "b" })])).total === 0);

ck("O2) 有人宣布最後一年 ⇒ 有決策",
  !!sess && sess.pendingDecisionsOf(st([mk({ id: "a", intent: 3 }), mk({ id: "b" })])).total > 0);

ck("O3) 有人合約即將到期 ⇒ 有決策",
  !!sess && sess.pendingDecisionsOf(st([mk({ id: "a", contract: 30 }), mk({ id: "b" })])).total > 0);

ck("O4) **沒有決策時 `openSession` 不開會期**（不得多卡一道空殼畫面）",
  !!sess && (() => {
    const s = st([mk({ id: "a" }), mk({ id: "b" })]);
    const r = sess.openSession(s, { careerYear: 3 });
    return r.opened === false && r.state === s && sess.sessionOf(r.state) === null;
  })());

ck("O5) 有決策時 `openSession` 會開，並記下年度",
  !!sess && (() => {
    const r = sess.openSession(st([mk({ id: "a", intent: 3 })]), { careerYear: 3 });
    return r.opened === true && sess.sessionOf(r.state)?.careerYear === 3;
  })());

ck("O6) `completeSession` 關掉會期",
  !!sess && (() => {
    const o = sess.openSession(st([mk({ id: "a", intent: 3 })]), { careerYear: 3 });
    return sess.sessionOf(sess.completeSession(o.state).state) === null;
  })());

ck("O7) **同一年度不會重複開**（MOBA / CS 共用生涯年度，不得各開一次）",
  !!sess && (() => {
    const o1 = sess.openSession(st([mk({ id: "a", intent: 3 })]), { careerYear: 3 });
    const done = sess.completeSession(o1.state).state;
    return sess.openSession(done, { careerYear: 3 }).opened === false;
  })());

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§M 金流】");
globalThis.localStorage = globalThis.localStorage ?? {
  _d: {}, getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};
const store = await imp(P_STORE);
const S = () => store.useProfileStore.getState();

ck("M1) Store 有 `releasePlayer()` 與 `renewPlayerContract()`",
  typeof S().releasePlayer === "function" && typeof S().renewPlayerContract === "function");

ck("M2) **續約真的扣錢**，金額等於 `renewCostOf`（V4 市場價值 × 費率）",
  (() => {
    const p = (S().players ?? [])[0];
    if (!p) return false;
    const cost = contract.renewCostOf(p);
    const before = Number(S().finance?.funds);
    const r = S().renewPlayerContract(p.id);
    const after = Number(S().finance?.funds);
    return r.ok && Math.abs((before - after) - cost * 10_000) < 1;
  })(),
  (() => { const p = (S().players ?? [])[0]; return p ? `扣 ${contract.renewCostOf(p)} 萬` : ""; })());

ck("M3) **放走不扣錢**（資金逐值不變）",
  (() => {
    const before = Number(S().finance?.funds);
    const target = (S().players ?? [])[S().players.length - 1];
    const r = S().releasePlayer(target.id);
    return r.ok && Number(S().finance?.funds) === before;
  })());

ck("M4) 資金不足 ⇒ 續約被拒，**不得扣成負數**",
  (() => {
    const before = S().finance?.funds;
    store.useProfileStore.setState({ finance: { ...S().finance, funds: 100 } });
    const p = (S().players ?? [])[0];
    const r = S().renewPlayerContract(p.id);
    const ok = r.ok === false && Number(S().finance?.funds) === 100;
    store.useProfileStore.setState({ finance: { ...S().finance, funds: before } });
    return ok;
  })());

ck("M5) 補強沿用**既有** `signProspect`（不建第二套選手生成）",
  typeof S().signProspect === "function"
  && !/genProspects|makePlayer|createPlayer/.test(codeOnly(read(P_SESS))));

ck("M6) 補強候選的估值用 **V4 市場價值**，不另算一套",
  /marketValue/.test(read(P_SCREEN)) || /marketValueOf/.test(codeOnly(read(P_SESS))),
  "");

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§F 安全出口：不得永久卡死】");

//  ⚠ 這裡**不能**用 `while (length > 1)`：放走之後地板會自動補回 5 人，
//    條件永遠成立 ⇒ 無窮迴圈。（gate 第一版就是這樣掛掉的——
//    諷刺的是那正好證明地板有效。）改成有界地連放 20 次。
ck("F1) 連續放走 20 次 ⇒ **青訓補位**永遠把人數頂回地板",
  (() => {
    for (let i = 0; i < 20; i++) {
      const list = S().players ?? [];
      if (!list.length) break;
      S().releasePlayer(list[list.length - 1].id);
      if ((S().players ?? []).length < contract.CONTRACT.rosterFloor) return false;
    }
    return (S().players ?? []).length >= contract.CONTRACT.rosterFloor;
  })(),
  `連放 20 次後仍有 ${(S().players ?? []).length} 人`);

ck("F2) 破產也能完成休賽期（完成不需要任何花費）",
  (() => {
    store.useProfileStore.setState({ finance: { ...S().finance, funds: 0 } });
    const r = S().completeOffSeason();
    return r.ok !== false || S().offSeasonSessionView().open === false;
  })());

ck("F3) `ensureRosterFloor` 是**共用**的一份（不是第二套地板）",
  typeof contract.ensureRosterFloor === "function");

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§A 快轉在決策點停下】");

const ff = await imp(P_FF);

ck("A1) 停止理由多了 `offSeason`",
  !!ff.STOP_REASONS.offSeason, Object.keys(ff.STOP_REASONS).join("/"));

ck("A2) 休賽期開著時 `planAdvance` 規劃 **0 天**",
  ff.planAdvance({ day: 90, nextFixtureDay: null, offSeasonOpen: true }).days === 0);

ck("A3) 休賽期開著時，下一站就是**休賽期本身**（不是遙遠的年度邊界）",
  ff.nextStopOf({ day: 90, nextFixtureDay: null, offSeasonOpen: true })?.code === ff.STOP_REASONS.offSeason);

ck("A4) 休賽期關著時完全不影響既有行為",
  ff.planAdvance({ day: 90, nextFixtureDay: null, offSeasonOpen: false }).days > 0);

ck("A5) Store 的 `advanceWorldDays` 在休賽期開著時**擋下並說明原因**",
  (() => {
    const src = codeOnly(read(P_STORE));
    const i = src.indexOf("advanceWorldDays(n = 1");
    return i > 0 && /offSeason/i.test(src.slice(i, i + 1200));
  })());

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§I 冪等／reload】");

ck("I1) 會期狀態**落盤**（reload 之後還在）",
  (() => {
    const saved = JSON.parse(globalThis.localStorage.getItem(KEY) ?? "{}");
    return "offSeason" in (saved.meta ?? {});
  })());

ck("I2) 重複 `completeSession` 不會出事",
  !!sess && (() => {
    const o = sess.openSession(st([mk({ id: "a", intent: 3 })]), { careerYear: 3 });
    const d1 = sess.completeSession(o.state).state;
    return sess.completeSession(d1).state === d1;
  })());

ck("I3) 年度封存仍然冪等（V5-1 的保證沒有被本輪破壞）",
  await (async () => {
    const off = await imp("src/platform/time/offSeason.js");
    const s = { meta: { days: 84 }, players: [] };
    const r1 = off.sealCareerYears(s, { fromDay: 84, toDay: 85 });
    return off.sealCareerYears(r1.state, { fromDay: 84, toDay: 85 }).sealed.length === 0;
  })());

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§L 15 年長跑】");

ck("L1) 15 年逐年推進：**任何一年都不得低於地板**，且休賽期每年最多開一次",
  !!sess && (() => {
    let s = st([mk({ id: "a", age: 26, contract: 200 }), mk({ id: "b", age: 27, contract: 300 }),
      mk({ id: "c", age: 25, contract: 250 }), mk({ id: "d", age: 28, contract: 180 }),
      mk({ id: "e", age: 24, contract: 220 })]);
    for (let y = 1; y <= 15; y++) {
      s = contract.tickContracts(s, { days: 84 }).state;
      s = contract.resolveContractExpiries(s, { careerYear: y }).state;
      const o = sess.openSession(s, { careerYear: y });
      s = o.state;
      if (o.opened && sess.openSession(s, { careerYear: y }).opened) return false;   // 同年不得再開
      s = sess.completeSession(s).state;
      if (s.players.length < contract.CONTRACT.rosterFloor) return false;
    }
    return true;
  })());

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§U 畫面】");

ck("U1) 有 Off-season 專屬畫面（現在真的有決策了）", fs.existsSync(resolve(ROOT, P_SCREEN)));

ck("U2) 六個區塊都在：年度摘要／退役／合約／補強／預算／完成",
  fs.existsSync(resolve(ROOT, P_SCREEN)) && (() => {
    const s = read(P_SCREEN);
    return ["offseason-summary", "offseason-retirement", "offseason-contracts",
      "offseason-recruit", "offseason-budget", "offseason-complete"]
      .every((id) => s.includes(id));
  })());

ck("U3) 沿用既有視覺語言（`esmo-` class，不另造一套）",
  fs.existsSync(resolve(ROOT, P_SCREEN)) && /esmo-/.test(read(P_SCREEN))
  && !/styled-components|@emotion/.test(read(P_SCREEN)));

ck("U4) 路由接上了",
  /offSeason/.test(read("src/AppShell.jsx")) && /OffSeasonScreen/.test(read("src/AppShell.jsx")));

ck("U5) 首頁有進入休賽期的入口",
  /home-offseason-enter/.test(read("src/screens/DashboardScreen.jsx")));

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§N 邊界】");
const sessSrc = sess ? codeOnly(read(P_SESS)) : "";
ck("N1) 沒有做 Coach / Mentor", !!sess && !/coach|mentor|導師/i.test(sessSrc));
ck("N2) 沒有做 AI 轉會市場 / bidding", !!sess && !/bidding|aiTransfer|競標/i.test(sessSrc));
ck("N3) 沒有碰 Ranked / ServerTime", !!sess && !/ranked|serverTime|Date\.now/i.test(sessSrc));
ck("N4) 模組很小", !!sess && sessSrc.split("\n").length <= 80,
  !!sess ? `${sessSrc.split("\n").length} 行實碼` : "");

// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§X sentinel】");
const TMP = [];
async function mutated(relPath, mutate, tag) {
  const src = read(relPath);
  const out = mutate(src);
  if (out === src) throw new Error(`sentinel ${tag}：變異沒有套用（錨點已改）`);
  const tmp = resolve(ROOT, `${dirname(resolve(ROOT, relPath))}/.sentinel-v63-${tag}.js`);
  fs.writeFileSync(tmp, out, "utf8");
  TMP.push(tmp);
  return import(pathToFileURL(tmp).href);
}
try {
  if (sess) {
    const A = await mutated(P_SESS, (s) => s.replace(/if \(pending\.total <= 0\) return \{ state, opened: false, pending \};/, "if (false) return { state, opened: false, pending };"), "A-empty");
    ck("X-A) 沒有決策也開會期 ⇒ §O4 變紅（空殼頁）",
      A.openSession(st([mk({ id: "a" })]), { careerYear: 3 }).opened === true);

    const B = await mutated(P_SESS, (s) => s.replace(/lastCompletedYear: year/, "lastCompletedYear: 0"), "B-reopen");
    ck("X-B) 完成後不記年度 ⇒ §O7 變紅（同一年會重複開）",
      (() => {
        const o = B.openSession(st([mk({ id: "a", intent: 3 })]), { careerYear: 3 });
        return B.openSession(B.completeSession(o.state).state, { careerYear: 3 }).opened === true;
      })());
  } else {
    ck("X-A) 沒有決策也開會期 ⇒ §O4 變紅", false, "模組不存在");
    ck("X-B) 完成後不記年度 ⇒ §O7 變紅", false, "模組不存在");
  }
} catch (e) {
  ck("X) sentinel 執行完成", false, String(e.message ?? e));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch { /* ignore */ } }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} check_offseason_session_v6：${pass}/${pass + fail} 通過`);
if (fail === 0) {
  console.log("   休賽期**只在真的有決策時**開；完成後同一年不會再開；快轉在決策點停下。");
  console.log("   續約扣錢、放走不扣錢、補強走既有 Recruit 與 V4 估值；沒錢也能靠青訓地板走下去。");
}
process.exit(fail === 0 ? 0 : 1);
