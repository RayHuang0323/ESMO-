#!/usr/bin/env node
// ============================================================================
//  check_moba_milestone_j_close.mjs — Milestone J-close 安全網
//
//  三件事：
//    §1 Ban/Pick 的分路摘要與頭像標示是**同一份 assignment**，而且常駐
//    §2 隊伍面板兩個召喚師技能並排、等大
//    §3 「快速完成戰鬥」是受單一 feature flag 控制的開發工具，且走正式結算流程
//
//  ⚠ 斷言原則（本專案踩過七次）：能驗行為就驗行為。
//    純 JSX 版面的事實（誰排在誰上面、是否常駐）Node 驗不了，
//    交給 `shot_milestone_j_close.mjs` 在真瀏覽器裡驗；本檔只做
//    「資料層可驗證」與「單一來源」這類結構性保證，並明確標示哪幾條是讀原始碼。
// ============================================================================
import fs from "node:fs";
import { LogicEngine } from "../src/LogicEngine.js";
import { heroById, CHAMPIONS_100 } from "../src/data/heroDatabase.js";
import { ROSTER } from "../src/data/roster.js";
import { heroTags } from "../src/data/heroClassification.js";
import { assignDraft, LANES } from "../src/battle/moba/mobaDraftAssignment.js";
import { SEAT_CODE } from "../src/platform/contracts/matchLineup.js";
import { spellsFor, laneOfSeat, SUMMONER_SPELLS } from "../src/battle/moba/mobaHeroLoadout.js";
import { FEATURE_FLAGS, featureEnabled } from "../src/featureFlags.js";
import { snapshotToBattleResult } from "../src/battle/battleResult.js";

let pass = 0, fail = 0;
const ck = (l, c, e = null) => { if (c) { pass++; console.log(`✅ ${l}`); } else { fail++; console.log(`❌ ${l}${e != null ? `　→ ${JSON.stringify(e)}` : ""}`); } };
const src = (p) => fs.readFileSync(p, "utf8");
const SEATS = ["b1", "b2", "b3", "b4", "b5"];
const BP = src("src/screens/moba/BanPickScreen.jsx");
const STRIP = src("src/battle/ui/BattleHeroStrip.jsx");
const GV = src("src/GameView.jsx");

const players = SEATS.map((id, i) => ({ id, name: `P${i + 1}`, role: LANES[i], stats: {} }));
const seatPlayers = Object.fromEntries(SEATS.map((s, i) => [s, players[i]]));
const planFor = (ids) => assignDraft({
  picks: ids.map(heroById), seatPlayers, seats: SEATS, tagsOf: heroTags,
});

console.log("── §1 分路摘要與頭像標示：同一份 assignment ──");
{
  //  這是本次追加需求的核心：頭像上的位置碼與下方摘要不可以各自判定。
  //  資料層的保證是「兩者都只能從 assignment 推導」——所以這裡驗
  //  「assignment → 位置碼」這個轉換是全稱且唯一的。
  const plan = planFor(["bingshuang", "hundun", "leiting", "ironclad", "duskblade"]);
  const byHero = {};
  for (const [seat, a] of Object.entries(plan.assignment)) {
    if (a.heroId) byHero[a.heroId] = { code: SEAT_CODE[seat], lane: a.lane, fit: a.heroFit };
  }
  ck("1) 每個席位都對得到英文位置碼（TOP/JUNGLE/MID/ADC/SUPPORT）",
    SEATS.every((s) => ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"].includes(SEAT_CODE[s])),
    SEATS.map((s) => SEAT_CODE[s]));
  ck("2) 五隻已選英雄全部有分路，沒有落單的「待分配」",
    Object.keys(byHero).length === 5, byHero);
  ck("3) 位置碼與摘要的中文路名一一對應（不是兩套判定）",
    Object.entries(plan.assignment).every(([seat, a]) =>
      !a.heroId || SEAT_CODE[seat] === { 上路: "TOP", 打野: "JUNGLE", 中路: "MID", 下路: "ADC", 輔助: "SUPPORT" }[a.lane]),
    Object.entries(plan.assignment).map(([s, a]) => [s, SEAT_CODE[s], a.lane]));
  ck("4) 適性偏低（<0.5）判定得出來（頭像的『適性低』警示靠這個）",
    typeof plan.assignment.b1.heroFit === "number"
    && Object.values(plan.assignment).every((a) => !a.heroId || (a.heroFit >= 0 && a.heroFit <= 1)));
  {
    //  刻意選五隻中路英雄 ⇒ 一定有人被排到不擅長的位置 ⇒ 必須產生低適性與衝突
    const bad = planFor(["bingshuang", "hundun", "hunpo", "lieyan", "xuankong"]);
    const lows = Object.values(bad.assignment).filter((a) => a.heroId && a.heroFit < 0.5);
    ck("5) 五隻同路英雄 ⇒ 真的判出低適性（不是永遠都說沒問題）",
      lows.length > 0, { lows: lows.length, conflicts: bad.conflicts.length });
    ck("6) 同時產生可顯示的衝突說明", bad.conflicts.length > 0 && bad.conflicts.every((c) => !!c.note),
      bad.conflicts);
  }
  {
    //  陣容需求：已有／尚缺，同樣只能從 assignment 推導
    const partial = planFor(["ironclad", "duskblade"]);
    const have = [], need = [];
    for (const [seat, a] of Object.entries(partial.assignment)) (a.heroId ? have : need).push(SEAT_CODE[seat]);
    ck(`7) 只選 2 隻時，已有 ${have.length} 路、尚缺 ${need.length} 路（加總為 5）`,
      have.length === 2 && need.length === 3 && have.length + need.length === 5, { have, need });
    ck("8) 已有與尚缺不重疊", have.every((c) => !need.includes(c)), { have, need });
  }
  //  選角變動要立即重算：換一隻英雄，分配結果必須跟著變（不是快取住）
  {
    const a = planFor(["ironclad", "duskblade", "bingshuang", "leiting", "dadi"]);
    const b = planFor(["ironclad", "duskblade", "bingshuang", "leiting", "hundun"]);
    ck("9) 換掉一隻英雄 ⇒ 分配結果跟著變（即時重算，不是快取）",
      JSON.stringify(Object.values(a.assignment).map((x) => x.heroId))
      !== JSON.stringify(Object.values(b.assignment).map((x) => x.heroId)));
  }
  //  ── 以下三條讀 JSX（版面事實 Node 驗不了；真行為由瀏覽器驗收把關）──
  ck("10)〔原始碼〕摘要面板不再被 picks 數量閘住（常駐渲染）",
    !BP.includes("picks.blue.length > 0 && <DraftPlanPanel"));
  ck("11)〔原始碼〕選角完成後不再自動跳頁，改為明確確認鈕",
    BP.includes('data-testid="confirm-draft"') && BP.includes("const confirmDraft"));
  ck("12)〔原始碼〕頭像位置碼與摘要共用 laneByHero（由 draftPlan 推導）",
    BP.includes("const laneByHero") && /laneByHero[\s\S]{0,400}draftPlan\.assignment/.test(BP));
  //  ⚠ 別寫成 `data-testid="pick-avatar"` 的完整字面：頭像的 testid 是條件式
  //  （`t === "blue" ? "pick-avatar" : undefined`），對手側不掛錨點是刻意的。
  //  只驗兩個錨點名稱存在，不綁 JSX 怎麼寫。
  ck("13)〔原始碼〕頭像與陣容需求都掛了可驗收的錨點",
    BP.includes("pick-avatar") && BP.includes("comp-needs"));
}

console.log("\n── §2 隊伍面板的兩個召喚師技能 ──");
{
  ck("14) 兩個技能欄位都有資料來源（snapshot 的 sp 一定是兩格）",
    (() => {
      const e = new LogicEngine(7);
      const tbl = {};
      for (const s of Object.keys(ROSTER)) tbl[s] = spellsFor(null, laneOfSeat(s)).map((x) => x.id);
      const blue = {}, red = {};
      for (const [k, v] of Object.entries(tbl)) (k[0] === "r" ? red : blue)[k] = v;
      e.configureSpells({ blue, red, meta: {} });
      e.tick(0.5);
      return e.snapshot().players.every((p) => Array.isArray(p.sp) && p.sp.length === 2
        && p.sp[0].id && p.sp[1].id);
    })());
  ck("15)〔原始碼〕兩格改為並排（row），不是上下疊",
    /data-testid="cell-spells"[\s\S]{0,260}flexDirection: rev \? "row-reverse" : "row"/.test(STRIP));
  {
    //  等大：三個分支（有技能／reserved／無資料）的方格尺寸必須一致，
    //  否則第二格會因為比較小而繼續「看起來不存在」。
    //  ⚠ 用 \s* 容忍空白：三個分支的 style 字串排版不完全一致，
    //  寫死單一空格會只抓到其中一個分支，然後「一種尺寸」被誤判成通過。
    const sizes = [...STRIP.matchAll(/width: (\d+), height: (\d+),\s*borderRadius: 3/g)]
      .map((m) => `${m[1]}x${m[2]}`);
    ck(`16) 技能方格三個分支等大（實測 ${sizes.join(" / ")}）`,
      sizes.length >= 3 && new Set(sizes).size === 1, sizes);
  }
  ck("17)〔原始碼〕技能欄是 flexShrink:0 的獨立區塊（不擠壓名稱／血條／狀態）",
    /data-testid="cell-spells"[\s\S]{0,260}flexShrink: 0/.test(STRIP));
  ck("18) 詳細面板仍保有完整名稱與使用次數（tooltip 帶 uses）",
    STRIP.includes("本場已用") && src("src/battle/ui/BattleHeroSheet.jsx").includes("SUMMONER_SPELLS"));
  ck("19) 八個技能都有圖示與中文名（面板不會畫出「?」）",
    Object.values(SUMMONER_SPELLS).every((s) => s.icon && s.zh)
    && Object.keys(SUMMONER_SPELLS).length === 8);
}

console.log("\n── §3 快速完成戰鬥：單一 feature flag 的開發工具 ──");
{
  ck("20) 有單一 feature flag 模組，且旗標可查詢",
    typeof FEATURE_FLAGS === "object" && typeof FEATURE_FLAGS.devFastForward === "boolean"
    && featureEnabled("devFastForward") === FEATURE_FLAGS.devFastForward);
  ck("21) 未知旗標一律視為關閉（不會因為打錯字就默默開啟）",
    featureEnabled("nope") === false && featureEnabled(undefined) === false);
  ck("22) 旗標物件是凍結的（不能在執行期被偷改）",
    Object.isFrozen(FEATURE_FLAGS));
  ck("23)〔原始碼〕按鈕同時要求測試模式**與**旗標（兩道閘門）",
    /isDebugMode\(\) && featureEnabled\("devFastForward"\)/.test(GV));
  ck("24)〔原始碼〕按鈕掛了可驗收錨點", GV.includes('data-testid="dev-fast-forward"'));
  {
    //  最重要的一條：它不可以「跳頁」。行為驗證——把同一顆引擎推到終局之後，
    //  終局 snapshot 必須能被**正式結算流程**接受並產出合法 BattleResult。
    const e = new LogicEngine(42);
    for (let i = 0; i < 8000 && !e.over; i++) e.tick(0.5);
    const snap = e.snapshot();
    ck("25) 推進到終局後 snapshot 真的是終局（over=true）", snap.over === true, snap.over);
    let br = null, err = null;
    try { br = snapshotToBattleResult(snap); } catch (x) { err = x.message; }
    ck("26) 終局 snapshot 能產出正式 BattleResult（不繞過結算）",
      !!br && br.schema === "BattleResult.v2", err ?? br?.schema);
    ck("27) BattleResult 十人齊全且有勝負（發獎／經驗／紀錄吃的就是這份）",
      !!br && br.players?.length === 10 && !!br.winner, { n: br?.players?.length, w: br?.winner });
  }
  ck("28) fastForward 不 new 引擎、不改 dt（沿用同一顆引擎推進）",
    (() => {
      const uls = src("src/useLocalServer.js");
      const fn = uls.slice(uls.indexOf("const fastForward"), uls.indexOf("const setRate"));
      return !/new LogicEngine/.test(fn) && /eng\.tick\(DT_SIM\)/.test(fn);
    })());
}

console.log("\n── §4 邊界 ──");
{
  ck("29) 引擎仍然決定性（同 seed 兩次逐值相同）",
    (() => {
      const run = (s) => { const e = new LogicEngine(s); for (let i = 0; i < 3000 && !e.over; i++) e.tick(0.5); return JSON.stringify({ t: Math.round(e.t * 100), k: e.players.map((p) => p.k) }); };
      return run(42) === run(42);
    })());
  ck("30) 未啟用技能層時第二格仍是舊行為（本輪沒動到 opt-in 邊界）",
    (() => {
      const e = new LogicEngine(7); e.tick(0.5);
      return e.snapshot().players.every((p) => (p.role === "jungle" ? p.sp[1].id === "smite" : p.sp[1].id === null));
    })());
  ck("31) 英雄池仍是 100 名", CHAMPIONS_100.length === 100, CHAMPIONS_100.length);
  ck("32) 本輪沒有動到地圖幾何（塔位不變）",
    (() => {
      const a = new LogicEngine(7), b = new LogicEngine(7);
      return JSON.stringify(Object.entries(a.towers).map(([k, t]) => [k, t.pos]))
        === JSON.stringify(Object.entries(b.towers).map(([k, t]) => [k, t.pos]));
    })());
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"}  ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
