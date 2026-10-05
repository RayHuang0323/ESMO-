#!/usr/bin/env node
// ============================================================================
//  MOBA Combat Feedback Polish — 驗證（純資料層＋真引擎整場）
//
//  執行：`node tools/check_moba_combat_feedback.mjs`（跑兩場正式設定的對局，約 10–30 秒）
//
//    F 浮動數字：每個數字都等於引擎**內部**真實 hp 差（不是 UI 重算）；英雄／野怪／龍巴龍／塔都有；
//      合併後不洗版；重要傷害有強調；推導不改 snapshot
//    G +Gold：顯示的金額來自累計收入差；與引擎個人帳本（非被動來源）對得上；被動收入不跳字
//    R 回城：引導中 ⇔ 引擎 recallT > 0；進度單調；done／cancel 與引擎事件同格；完成後英雄在泉水
//    O 頭頂 UI：名牌改等級徽章＋英雄短名；預設開、手機也開；Shield 疊在血條
//    X 邊界：沒改引擎與語意指紋檔、沒碰 CS、Replay 不掛（不造假）
// ============================================================================
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};
const url = (p) => new URL(`../${p}`, import.meta.url);
const read = (p) => readFileSync(url(p), "utf8");
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const { LogicEngine } = await import("../src/LogicEngine.js");
const { CHAMPIONS_100, heroById } = await import("../src/data/heroDatabase.js");
const { toEngineHeroSkills } = await import("../src/battle/moba/skills/heroSkillGameplay.js");
const { selectBattleTalents } = await import("../src/battle/moba/talents/heroBattleTalents.js");
const { matchItemsConfig } = await import("../src/battle/moba/items/buildStrategyPrep.js");
const { rulesFor } = await import("../src/battle/moba/matchProgression.js");
const CF = await import("../src/battle/moba/presentation/combatFeedback.js");

const R = rulesFor();
const DT = 0.5;                     // useLocalServer 的 DT_SIM
const MAX_TICKS = 3600;

function makeEngine(seed, heroIds) {
  const seats = ["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"];
  const roster = Object.fromEntries(seats.map((s, i) => [s, { heroId: heroIds[i], hero: heroById(heroIds[i]), player: `P${i}` }]));
  const eng = new LogicEngine(seed);
  eng.configureHeroSkills(toEngineHeroSkills(roster, selectBattleTalents(roster)));
  const items = matchItemsConfig({ roster, heroLookup: heroById, buildStrategy: "standard" });
  if (items) eng.configureItems(items);
  return eng;
}

/** 跑一整場：逐格（與現場同樣每 tick 一格）餵推導層，並記下引擎**內部**真值做對照。 */
function runMatch(seed, heroIds) {
  const eng = makeEngine(seed, heroIds);
  const agg = CF.createFeedbackAggregator();
  const out = {
    raw: [], shown: [], ticks: 0, mismatches: [], recall: { channelsSeen: 0, mismatch: [], progressBack: [], done: [], cancel: [], doneNotAtFountain: [] },
    mutated: 0, goldShown: {}, perSecond: new Map(),
  };
  let prev = eng.snapshot();
  //  ⚠ 護盾到期時引擎不清 p.shield（只看 shieldUntil）⇒ 記下 until，對照時區分「被打掉」與「自然到期」
  const internalHp = (e) => new Map(e.players.map((p) => [p.id, { hp: p.hp, shield: (p.shield > 0 && e.t < (p.shieldUntil ?? 0)) ? p.shield : 0, until: p.shieldUntil ?? 0, dead: p.dead }]));
  let prevHp = internalHp(eng);
  const prevTower = () => new Map(Object.entries(eng.towers).map(([k, t]) => [k, t.hp]));
  let prevTw = prevTower();
  const lastProgress = new Map();
  const seen = new Set();
  for (let i = 0; i < MAX_TICKS && !eng.over; i++) {
    eng.tick(DT);
    const snap = eng.snapshot();
    const frozen = JSON.stringify(snap);
    const ev = CF.deriveFeedbackEvents(prev, snap);
    if (JSON.stringify(snap) !== frozen) out.mutated++;
    out.raw.push(...ev.map((e) => ({ ...e, ts: snap.ts })));
    //  對照：英雄傷害／補血 vs 引擎內部絕對血量（含護盾）
    const nowHp = internalHp(eng);
    for (const e of ev) {
      if (e.targetKind === "hero" && (e.kind === "damage" || e.kind === "heal")) {
        const a = prevHp.get(e.targetId), b = nowHp.get(e.targetId);
        const expect = e.kind === "damage"
          ? (b.dead ? a.hp + a.shield : Math.max(0, a.hp - b.hp) + (b.until === a.until && eng.t >= b.until && b.shield === 0 ? 0 : Math.max(0, a.shield - b.shield)))
          : b.hp - a.hp;
        if (Math.abs(expect - e.amount) > Math.max(2, expect * 0.02)) out.mismatches.push({ ts: snap.ts, ...e, expect: Math.round(expect) });
      }
      if (e.targetKind === "tower") {
        //  塔被打爆那一格內部 hp 會是負數（溢傷）；snapshot 夾到 0 ⇒ 實際掉的是剩餘血量
        const expect = Math.max(0, prevTw.get(e.targetId)) - Math.max(0, eng.towers[e.targetId].hp);
        if (Math.abs(expect - e.amount) > Math.max(2, expect * 0.02)) out.mismatches.push({ ts: snap.ts, ...e, expect: Math.round(expect) });
      }
    }
    const shown = agg.push(ev, snap.ts);
    for (const e of shown) {
      out.shown.push({ ...e, ts: snap.ts });
      const sec = Math.floor(snap.ts);
      out.perSecond.set(sec, (out.perSecond.get(sec) ?? 0) + 1);
      if (e.kind === "gold") out.goldShown[e.targetId] = (out.goldShown[e.targetId] ?? 0) + e.amount;
    }
    //  回城：呈現狀態 vs 引擎內部 recallT
    const view = CF.recallViewOf(snap);
    const chanIds = new Set(view.channels.map((c) => c.id));
    for (const p of eng.players) {
      const inner = p.recallT > 0 && !p.dead;
      if (inner !== chanIds.has(p.id)) out.recall.mismatch.push({ ts: snap.ts, id: p.id, inner });
    }
    for (const c of view.channels) {
      out.recall.channelsSeen++;
      const lp = lastProgress.get(c.id);
      if (lp != null && c.progress + 1e-9 < lp) out.recall.progressBack.push({ ts: snap.ts, id: c.id, lp, p: c.progress });
      lastProgress.set(c.id, c.progress);
    }
    for (const p of eng.players) if (!chanIds.has(p.id)) lastProgress.delete(p.id);
    for (const e of CF.newRecallEvents(view.events, seen)) {
      if (e.phase === "done") {
        out.recall.done.push(e);
        const p = snap.players.find((x) => x.id === e.playerId);
        const prevP = prev.players.find((x) => x.id === e.playerId);
        //  完成那一格：英雄已離開起點（被傳回泉水），而且起點就是上一格的位置
        const moved = Math.hypot(p.pos.x - e.from.x, p.pos.y - e.from.y);
        const fromIsPrev = Math.hypot(prevP.pos.x - e.from.x, prevP.pos.y - e.from.y) < 1e-6;
        if (!(moved > R.recallMinDist * 0.5) || !fromIsPrev || p.rc !== 0) out.recall.doneNotAtFountain.push({ e, moved, fromIsPrev, rc: p.rc });
      }
      if (e.phase === "cancel") {
        out.recall.cancel.push(e);
        const p = snap.players.find((x) => x.id === e.playerId);
        if (p.rc !== 0) out.recall.mismatch.push({ ts: snap.ts, id: e.playerId, cancelButRc: p.rc });
      }
    }
    prev = snap; prevHp = nowHp; prevTw = prevTower(); out.ticks++;
  }
  //  終局：把還在合併窗裡的一併結算（含金錢）——漏記這段曾讓 G1 少算最後一筆
  for (const e of agg.flush()) {
    out.shown.push({ ...e, ts: Infinity });
    if (e.kind === "gold") out.goldShown[e.targetId] = (out.goldShown[e.targetId] ?? 0) + e.amount;
  }
  out.engine = eng;
  return out;
}

const heroSetA = ["ironclad", "cinderfist", "bingshuang", "leiting", "sting", "shengming", "dadi", "gambler", "hanbing", "chichuan"];
const heroSetB = CHAMPIONS_100.slice(20, 30).map((h) => h.id);
console.log("── 跑兩場正式設定對局（Hero Skills＋Talent＋Items，DT 0.5）──");
const A = runMatch(4242, heroSetA);
const B = runMatch(9091, heroSetB);
const both = [A, B];
console.log(`   A：${A.ticks} tick、勝方 ${A.engine.winner}；B：${B.ticks} tick、勝方 ${B.engine.winner}`);

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── F 浮動數字 ──");
{
  const all = both.flatMap((m) => m.shown);
  const kinds = (k, t) => all.filter((e) => e.kind === k && (!t || e.targetKind === t)).length;
  ck("F1 英雄傷害數字", kinds("damage", "hero") > 50, `${kinds("damage", "hero")}`);
  ck("F2 野怪／龍／巴龍傷害數字", kinds("damage", "neutral") > 20, `${kinds("damage", "neutral")}`);
  const dragonBaron = all.filter((e) => e.kind === "damage" && e.targetKind === "neutral" && /dragon|baron/i.test(e.targetId)).length;
  ck("F3 其中有龍或巴龍", dragonBaron > 0, `${dragonBaron}`);
  ck("F4 塔傷害數字", kinds("damage", "tower") > 10, `${kinds("damage", "tower")}`);
  ck("F5 補血數字", kinds("heal") > 5, `${kinds("heal")}`);
  ck("F6 護盾數字", kinds("shield") > 0, `${kinds("shield")}`);
  const mism = both.flatMap((m) => m.mismatches);
  ck("F7 每個英雄／塔數字都等於引擎**內部**真實 hp（＋護盾）差（誤差 ≤ 2% 或 2 點，來自 mhp 取整）", mism.length === 0,
    mism.length ? JSON.stringify(mism.slice(0, 3)) : `${both.reduce((s, m) => s + m.raw.length, 0)} 筆原始事件`);
  ck("F8 推導不改 snapshot（純讀）", both.every((m) => m.mutated === 0));
  const under = all.filter((e) => (e.kind === "damage" && e.amount < CF.FEEDBACK_POLICY.minDamage) || (e.kind === "heal" && e.amount < CF.FEEDBACK_POLICY.minHeal) || (e.kind === "shield" && e.amount < CF.FEEDBACK_POLICY.minShield));
  ck("F9 小於門檻的碎片不單獨跳字", under.length === 0, `${under.length}`);
  const rawCount = both.reduce((s, m) => s + m.raw.filter((e) => e.kind !== "gold").length, 0);
  const shownCount = all.filter((e) => e.kind !== "gold").length;
  ck("F10 合併：顯示數 ≤ 原始事件 60%（不每 tick 洗版）", shownCount <= rawCount * 0.6, `${shownCount}/${rawCount}`);
  const peak = Math.max(...both.flatMap((m) => [...m.perSecond.values()]));
  ck("F11 任一 sim 秒同時產生的數字 ≤ 物件池上限", peak <= CF.FEEDBACK_POLICY.maxActive, `peak ${peak}/${CF.FEEDBACK_POLICY.maxActive}`);
  const major = all.filter((e) => e.major);
  ck("F12 重要傷害有強調（major）且只出現在傷害", major.length > 0 && major.every((e) => e.kind === "damage"), `${major.length}`);
  //  合併後總量守恆：同一目標顯示的傷害總和 ≤ 原始總和，且 ≥ 原始總和的 90%（只丟門檻以下的碎片）
  const sum = (arr) => arr.reduce((s, e) => s + e.amount, 0);
  const dmgRaw = sum(both.flatMap((m) => m.raw.filter((e) => e.kind === "damage")));
  const dmgShown = sum(all.filter((e) => e.kind === "damage"));
  ck("F13 合併後傷害總量守恆（≥ 原始 90%、不超過原始 +0.5%）", dmgShown >= dmgRaw * 0.9 && dmgShown <= dmgRaw * 1.005, `${Math.round(dmgShown)}/${Math.round(dmgRaw)}`);
  const minionTargets = all.filter((e) => /^(b|r)m|minion/i.test(e.targetId));
  ck("F14 小兵不出數字（snapshot 沒有絕對最大血量 ⇒ 不猜）", minionTargets.length === 0);
  //  合成：自然到期的護盾不算傷害
  const mk = (sh, rem) => ({ ts: 10, players: [{ id: "b1", side: "blue", hp: 1, mhp: 1000, dead: false, gold: 0, statusEffects: sh ? [{ id: "shield", amount: sh, remaining: rem }] : [] }], towers: {}, objectives: [] });
  const expire = CF.deriveFeedbackEvents(mk(200, 0.3), { ...mk(0, 0), ts: 10.5 });
  const broken = CF.deriveFeedbackEvents(mk(200, 3), { ...mk(0, 0), ts: 10.5 });
  ck("F15 護盾自然到期不跳傷害；被打破才算傷害", expire.length === 0 && broken.some((e) => e.kind === "damage" && e.amount === 200));
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── G +Gold ──");
{
  for (const [name, m] of [["A", A], ["B", B]]) {
    const rows = m.engine.players.map((p) => {
      const led = m.engine.items.ps.get(p.id).ledger.earnedMilli;
      const nonPassive = Object.entries(led).filter(([k]) => k !== "passive" && k !== "tithe").reduce((s, [, v]) => s + v, 0) / 1000;
      const npMilli = Object.entries(led).filter(([k]) => !CF.PASSIVE_GOLD_SOURCES.includes(k)).reduce((s, [, v]) => s + v, 0);
      return { id: p.id, nonPassive, expect: Math.floor(npMilli / 1000), shown: m.goldShown[p.id] ?? 0, total: Object.values(led).reduce((s, v) => s + v, 0) / 1000 };
    });
    //  ⚠ 2026-10-06：由「比例 0.9–1.15」收緊成**逐英雄精確相等**。舊算法因同格被動收入多算 ~3.8%。
    const off = rows.filter((r) => r.shown !== r.expect);
    const ratio = rows.reduce((s, r) => s + r.shown, 0) / rows.reduce((s, r) => s + r.nonPassive, 0);
    ck(`G1 場次 ${name}：每位英雄顯示的 +Gold 總和 ＝ ⌊帳本非被動收入⌋（逐英雄精確相等）`, off.length === 0,
      off.length ? JSON.stringify(off) : `總和 ${rows.reduce((s, r) => s + r.shown, 0)}／帳本 ${rows.reduce((s, r) => s + r.nonPassive, 0).toFixed(3)}（比例 ${ratio.toFixed(5)}）`);
    ck(`G2 場次 ${name}：每位英雄顯示金額不超過其總收入`, rows.every((r) => r.shown <= r.total + 1), JSON.stringify(rows.filter((r) => r.shown > r.total + 1)));
  }
  //  帳本路徑（正式）：只看非被動來源；被動／守護徽章分成再多也不跳；零頭留到下一筆
  const ledSnap = (ts, by) => ({ ts, players: [{ id: "b1", side: "blue", hp: 1, gold: 0, dead: false }], towers: {}, objectives: [], items: { players: { b1: { gold: { earnedMilliBySource: by } } } } });
  const l1 = CF.deriveFeedbackEvents(ledSnap(100, { passive: 50000, minion: 6667 }), ledSnap(100.5, { passive: 51400, tithe: 900, minion: 6667 }));
  const l2 = CF.deriveFeedbackEvents(ledSnap(100, { passive: 50000, kill: 0 }), ledSnap(100.5, { passive: 51400, kill: 300000 }));
  ck("G5 帳本路徑：只有被動／tithe 增加 ⇒ 不跳；擊殺 300 ⇒ 恰好 300（同格被動不混進來）", l1.length === 0 && l2.length === 1 && l2[0].amount === 300 && l2[0].source === "ledger");
  const ag = CF.createFeedbackAggregator();
  const step = (ts, m) => ag.push([{ kind: "gold", targetKind: "hero", targetId: "b1", amount: m / 1000, amountMilli: m, maxHp: null, team: "blue", source: "ledger" }], ts);
  let tot = 0;
  for (let i = 0; i < 30; i++) for (const e of step(i * 1.5, 6667)) tot += e.amount;   // 三人分一隻小兵 20 ⇒ 每人 6.667
  for (const e of ag.flush()) tot += e.amount;
  ck("G6 零頭不丟：30 筆 6.667 金 ⇒ 顯示總和 ＝ ⌊200.01⌋ ＝ 200", tot === 200, `${tot}`);
  //  沒有帳本（裝備系統關閉）⇒ 不顯示 +Gold：UI 不自行扣被動收入、不從累計收入猜（Owner 2026-10-06）
  const base = (g, ts) => ({ ts, players: [{ id: "b1", side: "blue", hp: 1, gold: g, dead: false }], towers: {}, objectives: [] });
  const noLedger = CF.deriveFeedbackEvents(base(1000, 100), base(1301, 100.5));
  ck("G3 沒有帳本 ⇒ 不出 +Gold（不從累計收入推算）", noLedger.filter((e) => e.kind === "gold").length === 0);
  const fb = code(read("src/battle/moba/render/CombatFeedbackRuntime.jsx"));
  const cfSrc = code(read("src/battle/moba/presentation/combatFeedback.js"));
  ck("G4 UI 沒有寫死任何獎勵數字，也不自行計算被動收入（不 import INCOME_V1、不讀 passivePerSec）",
    !/INCOME_V1|passivePerSec/.test(fb + cfSrc) && !/\b(300|250|400)\b/.test(fb.replace(/0x[0-9a-f]+/gi, "")));
  const allGold = both.flatMap((m) => m.shown.filter((e) => e.kind === "gold"));
  ck("G7 每一個顯示的 +Gold 都來自帳本（source: ledger）", allGold.length > 0 && allGold.every((e) => e.source === "ledger"), `${allGold.length} 筆`);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── L 帳本唯讀例外（Owner 2026-10-06：凍結模組的單一唯讀 contract exception）──");
{
  const { checkItemsFreeze, ITEMS_FREEZE_BASE, READONLY_EXCEPTION } = await import("./lib/itemsFreeze.mjs");
  const cwd = new URL("..", import.meta.url);
  const readBase = (p) => execFileSync("git", ["show", `${ITEMS_FREEZE_BASE}:${p}`], { cwd, encoding: "utf8" });
  const cur = (p) => read(p);
  const live = checkItemsFreeze({ readCurrent: cur, readBase });
  ck("L1 目前程式碼：M1／M2 裝備模組與凍結基準逐字相同，唯一差異是唯讀例外", live.ok && live.exceptionPresent, live.violations.join(" ¦ "));
  //  突變：證明 freeze 不是形式檢查——改任何 item 規則都會紅
  const E = READONLY_EXCEPTION;
  const mutate = (file, fn) => (p) => (p === file ? fn(cur(p)) : cur(p));
  const bumpDigit = (t) => t.replace(/(\d)(?=\D)/, (d) => String((Number(d) + 1) % 10));
  const cases = {
    "改小兵收入 20→21（itemEconomy）": mutate("src/battle/moba/items/itemEconomy.js", (t) => t.replace("minion: 20,", "minion: 21,")),
    "改被動收入計算（itemsEngineRuntime）": mutate(E.file, (t) => t.replace("Math.round(INCOME_V1.passivePerSec * dt * MILLI)", "Math.round(INCOME_V1.passivePerSec * dt * MILLI * 1.01)")),
    "例外欄位改成計算值": mutate(E.file, (t) => t.replace("earnedMilliBySource: { ...s.ledger.earnedMilli },", "earnedMilliBySource: { ...s.ledger.earnedMilli, bonus: 1 },")),
    "例外搬到別的物件": mutate(E.file, (t) => t.replace(E.anchor + E.block, E.anchor).replace("        inventory: s.inventory.slots.slice(),\n", E.block + "        inventory: s.inventory.slots.slice(),\n")),
    "例外出現兩次": mutate(E.file, (t) => t.replace(E.anchor + E.block, E.anchor + E.block + E.block)),
    "改購買規則（buildPolicy 一個數字）": mutate("src/battle/moba/items/buildPolicy.js", bumpDigit),
    "改屬性（combatStatsV1 一個數字）": mutate("src/battle/moba/items/combatStatsV1.js", bumpDigit),
    "改被動效果（itemEffects 一個數字）": mutate("src/battle/moba/items/itemEffects.js", bumpDigit),
  };
  const missed = [];
  for (const [name, readCurrent] of Object.entries(cases)) if (checkItemsFreeze({ readCurrent, readBase }).ok) missed.push(name);
  ck(`L2 突變 ${Object.keys(cases).length} 種（收入／被動／購買／屬性／效果、例外改成計算、搬位置、重複）全部讓 freeze 紅`, missed.length === 0, missed.join(", "));
  const removed = checkItemsFreeze({ readCurrent: mutate(E.file, (t) => t.replace(E.anchor + E.block, E.anchor)), readBase });
  ck("L3 拿掉例外 ＝ 回到基準（仍綠、exceptionPresent=false）⇒ 例外是唯一差異", removed.ok && !removed.exceptionPresent);

  //  Replay／BattleResult 語意不受這個欄位影響：同一串 snapshot，有欄位 vs 拿掉欄位，輸出逐字相同
  const RB = await import("../src/battle/moba/replay/replayBuffer.js");
  const BR = await import("../src/battle/moba/snapshotToBattleResult.js");
  const eng = makeEngine(31337, heroSetA);
  const snaps = [];
  for (let i = 0; i < 900 && !eng.over; i++) { eng.tick(DT); if (i % 2 === 0 || eng.over) snaps.push(eng.snapshot()); }
  const strip = (sn) => { const c = JSON.parse(JSON.stringify(sn)); for (const p of Object.values(c.items?.players ?? {})) delete p.gold?.earnedMilliBySource; return c; };
  const hasField = snaps.some((sn) => Object.values(sn.items?.players ?? {}).some((p) => p.gold?.earnedMilliBySource));
  const capture = (list) => {
    RB.beginReplayCapture({ seed: 31337, config: {}, roster: null });
    for (const sn of list) RB.captureReplayFrame(sn);
    const r = RB.finalizeReplay({ matchId: "cf-ledger-test" });
    //  只排除擷取當下的牆鐘時刻（startedAt／finishedAt）；L4a 證明這就是「同輸入跑兩次」唯一會變的欄位
    return JSON.stringify(r, (key, v) => (key === "startedAt" || key === "finishedAt" ? undefined : v));
  };
  const rA = capture(snaps), rA2 = capture(snaps), rB = capture(snaps.map(strip));
  ck("L4a 比較方法自檢：同一串 snapshot 擷取兩次，排除牆鐘時刻後逐字相同", rA === rA2);
  ck("L4 Replay：有／無 earnedMilliBySource 的同一串 snapshot ⇒ 擷取結果逐字相同", hasField && rA === rB && rA.length > 1000, `${rA.length} bytes`);
  const last = snaps[snaps.length - 1];
  //  BattleResult 的 id 是 moba_<時刻>_<亂數>（每次產生都不同）⇒ 只排除頂層 id；L5a 自檢同上
  const brOf = (sn) => { const r = BR.snapshotToBattleResult(sn, { matchId: "m" }); const { id: _id, ...rest } = r; return JSON.stringify(rest); };
  const b1 = brOf(last), b1b = brOf(last), b2 = brOf(strip(last));
  ck("L5a 比較方法自檢：同一份 snapshot 轉兩次，排除 id 後逐字相同", b1 === b1b);
  ck("L5 BattleResult：有／無這個欄位 ⇒ 結果逐字相同", b1 === b2 && b1.length > 100, `${b1.length} bytes`);
  const eng2 = makeEngine(31337, heroSetA);
  let same = true, k = 0;
  for (let i = 0; i < 900 && !eng2.over; i++) { eng2.tick(DT); if (i % 2 === 0 || eng2.over) { if (JSON.stringify(strip(eng2.snapshot())) !== JSON.stringify(strip(snaps[k++]))) { same = false; break; } } }
  ck("L6 同 seed 重跑：snapshot 串流逐字相同（決定性；這個欄位不回頭影響模擬）", same && k > 100, `${k} 格`);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── R 回城 ──");
{
  const rc = both.map((m) => m.recall);
  ck("R1 有實際發生回城引導", rc.reduce((s, r) => s + r.channelsSeen, 0) > 0, `${rc.reduce((s, r) => s + r.channelsSeen, 0)} 格`);
  ck("R2 每一格：呈現的「引導中」⇔ 引擎內部 recallT > 0（逐英雄逐格）", rc.every((r) => r.mismatch.length === 0), JSON.stringify(rc.flatMap((r) => r.mismatch).slice(0, 3)));
  ck("R3 進度單調不倒退（同一次引導內）", rc.every((r) => r.progressBack.length === 0), JSON.stringify(rc.flatMap((r) => r.progressBack).slice(0, 3)));
  const done = rc.flatMap((r) => r.done), cancel = rc.flatMap((r) => r.cancel);
  ck("R4 有完成事件；完成那一格英雄已被傳離起點、起點＝上一格位置、rc 歸零", done.length > 0 && rc.every((r) => r.doneNotAtFountain.length === 0), `done ${done.length}，不符 ${rc.reduce((s, r) => s + r.doneNotAtFountain.length, 0)}`);
  ck("R5 取消事件那一格 rc 已歸零（特效與引擎同格結束）", rc.every((r) => !r.mismatch.some((x) => "cancelButRc" in x)), `cancel ${cancel.length}`);
  const fx = code(read("src/battle/moba/render/RecallChannelFx.jsx"));
  ck("R6 回城特效沒有自己的計時器（不用 setTimeout／setInterval，總長讀 rules.recallChannelT）",
    !/setTimeout|setInterval/.test(fx) && /recallViewOf/.test(fx) && /recallChannelT/.test(read("src/battle/moba/presentation/combatFeedback.js")));
  const v = CF.recallViewOf({ players: [{ id: "b1", side: "blue", rc: R.recallChannelT / 2, dead: false }], recallEvents: [] });
  ck("R7 進度 = 1 − rc／recallChannelT", v.channels.length === 1 && Math.abs(v.channels[0].progress - 0.5) < 1e-9);
  ck("R8 迷霧中的敵方英雄不畫回城（fogHidden 檢查）", /fogHidden/.test(fx));
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── O 頭頂 UI ──");
{
  const heroes = code(read("src/battle/moba/render/MobaRuntimeHeroes.jsx"));
  const view = read("src/battle/moba/render/MobaRuntimeView3D.jsx");
  ck("O1 名牌＝等級徽章＋英雄短名（來自英雄資料庫 heroById.zh），不再用選手名", /makeHeroLabelTexture\(shortHeroName\(hero\)/.test(heroes) && /heroById\(hero\?\.championId\)\?\.zh/.test(heroes));
  ck("O2 名牌預設開，且不因低畫質（手機）關掉", /heroNameplates = true/.test(view) && /showLabels=\{heroNameplates\}/.test(view));
  ck("O3 血條上仍有 Shield 段（讀 statusEffects.shield.amount）", /e\.id === "shield" && e\.amount > 0/.test(heroes) && /hero-hpbar-shield/.test(heroes));
  ck("O4 名牌沒有「藍方／紅方」文字（隊伍識別靠徽章色＋血條色＋側標）", !/藍方|紅方|BLUE TEAM|RED TEAM/.test(heroes));
  const { shortHeroName } = await import("../src/battle/moba/render/MobaRuntimeHeroes.jsx").catch(() => ({}));
  if (shortHeroName) {
    const names = CHAMPIONS_100.map((h) => shortHeroName({ championId: h.id }));
    ck("O5 100 隻英雄短名都 ≤ 4 個中文字（或 8 個拉丁字）", names.every((n) => n.length <= 8 && (!/[㐀-鿿]/.test(n) || n.length <= 4)), names.filter((n) => n.length > 4).slice(0, 5).join(","));
  } else {
    //  jsx 不能直接在 node import ⇒ 以原始碼確認上限規則
    ck("O5 短名上限規則：中文 4、拉丁 8", /isCjk \? 4 : 8/.test(heroes));
  }
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── X 邊界 ──");
{
  const view = code(read("src/battle/moba/render/MobaRuntimeView3D.jsx"));
  ck("X1 兩個新元件都把 source 傳進去（Replay 時 source 非 null ⇒ 不掛）", /<RecallChannelFx frameRef=\{frameRef\} source=\{source\}/.test(view) && /<CombatFeedbackRuntime frameRef=\{frameRef\} source=\{source\}/.test(view));
  ck("X2 兩個新元件在 source 非 null 時 return null", ["CombatFeedbackRuntime", "RecallChannelFx"].every((n) => /const active = enabled && !source;/.test(read(`src/battle/moba/render/${n}.jsx`)) && /if \(!active\) return null;/.test(read(`src/battle/moba/render/${n}.jsx`))));
  let diff = [];
  try {
    const cwd = new URL("..", import.meta.url);
    const base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { cwd, encoding: "utf8" }).trim();
    diff = [...execFileSync("git", ["diff", "--name-only", base], { cwd, encoding: "utf8" }).split("\n"),
      ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd, encoding: "utf8" }).split("\n")].map((s) => s.trim()).filter(Boolean);
  } catch { diff = null; }
  const SV = await import("../src/platform/contracts/simulationVersion.js");
  ck("X3 沒動任何語意指紋檔（LogicEngine／規則／items runtime…）⇒ 不需升 sim version",
    diff !== null && !diff.some((f) => SV.SIMULATION_SEMANTICS_FILES.includes(f)), diff ? diff.filter((f) => SV.SIMULATION_SEMANTICS_FILES.includes(f)).join(",") : "git 不可用");
  ck("X4 沒碰 CS／FPS、Online、地圖 topology、戰術 AI", diff !== null
    && !diff.some((f) => /battle\/fps\/|screens\/fps\/|fpsRoster|platform\/online|supabase\/|battle\/moba\/map\/(mobaMapLayout|mapTerrainShapes|riftMapMetrics|mobaTowerPlacement)|nav\/|tactic/i.test(f)), diff ? diff.join(",") : "");
  ck("X5 沒動 Replay 契約與擷取（mobaReplay／replayBuffer／replayPresentationSource）", diff !== null
    && !diff.some((f) => /mobaReplay\.js|replayBuffer\.js|replayPresentationSource\.js/.test(f)));
}

console.log(`\nMOBA Combat Feedback：${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
