#!/usr/bin/env node
// ============================================================================
//  tools/check_battle_condition_ux.mjs — Battle Condition UX（本輪五件事的守門）
//
//  執行：repo 根目錄 `node tools/check_battle_condition_ux.mjs`；失敗 exit 1。
//
//  守的五件事（對應使用者需求）：
//    R 角色呈現：英雄／野怪腳下不再有隊伍環、Buff 環、地面符文環、拉回環
//    C 體力規則：體力不擋出賽；低體力 ⇒ 平滑的能力衰減（單一曲線，MOBA/CS/顯示共用）
//    N 名牌    ：一般對戰不顯示常駐英雄名稱（身分留在 HUD）
//    S 技能標籤：文字更小、依欄位有不同動畫、同時顯示數量有上限
//    E 休息入口：首頁提醒可直接安排休息；只用既有 assignTraining("rest")，不碰 energy
//
//  ⚠ 這支只驗**契約與純函式**（原始碼掃描 + 純函式行為）。3D 實際畫面與流程
//    由 browser gate 負責（browser_check_moba_battle_ux_hotfix 等）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const heroes = read("src/battle/moba/render/MobaRuntimeHeroes.jsx");
const neutrals = read("src/battle/moba/render/MobaRuntimeNeutrals.jsx");
const view3d = read("src/battle/moba/render/MobaRuntimeView3D.jsx");
const callouts = read("src/battle/moba/render/SkillCastCallouts.jsx");
const restPanel = read("src/screens/dashboard/RestPlannerPanel.jsx");
const dashboard = read("src/screens/DashboardScreen.jsx");
const playerDetail = read("src/screens/manage/PlayerDetailScreen.jsx");

console.log("══ Battle Condition UX ══\n");

// ── R 角色呈現：地面圓圈退場、本體光效上場 ────────────────────────────────
console.log("── R 角色呈現 ──");
for (const [label, token] of [
  ["英雄隊伍選取環", "hero-ring"], ["英雄 Buff 環", "hero-buff-ring"],
  ["英雄環 geometry", "geo.ring"], ["英雄環材質", "ringBlue"],
]) ck(`R1 ${label}已移除`, !heroes.includes(token), token);
for (const [label, token] of [
  ["野怪地面符文環", "buff-ground-rune"], ["野怪拉回環", "geo.leash"],
  ["符文環 geometry", "blueBuffRune"],
]) ck(`R2 ${label}已移除`, !neutrals.includes(token), token);
ck("R3 英雄改用接地陰影＋柔光＋Buff 光點",
  ["hero-contact-shadow", "hero-aura", "hero-buff-motes"].every((t) => heroes.includes(t)));
ck("R4 野怪改用營地柔光（Buff 色／返回時琥珀色）",
  ["neutral-aura", "auraBlueBuff", "auraRedBuff", "auraReturn"].every((t) => neutrals.includes(t)));
ck("R5 柔光工廠是共用模組（英雄與野怪不各做一套）",
  heroes.includes('from "./auraSprite.js"') && neutrals.includes('from "./auraSprite.js"')
    && fs.existsSync(path.join(ROOT, "src/battle/moba/render/auraSprite.js")));
ck("R6 接地陰影不帶隊色（是陰影不是隊伍圖示）",
  /contactShadow: new THREE\.MeshBasicMaterial\(\{\s*\n?\s*color: 0x05080d/.test(heroes), "color 0x05080d");
ck("R7 技能／鎖定這類 gameplay 指示仍在（沒有被一起拿掉）",
  view3d.includes("TowerRangeDebug") && read("src/battle/moba/skills/HeroVfxRuntime.jsx").length > 0);

// ── N 名牌 ────────────────────────────────────────────────────────────────
console.log("\n── N 常駐名牌 ──");
ck("N1 一般對戰預設不顯示英雄名牌（heroNameplates 預設 false）",
  /heroNameplates = false/.test(view3d) && /showLabels=\{heroNameplates/.test(view3d));
ck("N2 GameView／Replay 都沒有打開名牌",
  !/heroNameplates/.test(read("src/GameView.jsx"))
    && !/heroNameplates/.test(read("src/screens/moba/MobaReplayScreen.jsx")));
ck("N3 名牌實作仍保留（觀戰／除錯可開，不是砍掉功能）",
  heroes.includes("hero-name-level") && heroes.includes("makeHeroLabelTexture"));

// ── S 技能施放標籤 ───────────────────────────────────────────────────────
console.log("\n── S 技能施放標籤 ──");
const ultSize = Number(/font: `800 \$\{n\.ult \? (\d+) : (\d+)\}px/.exec(callouts)?.[1]);
const normalSize = Number(/font: `800 \$\{n\.ult \? (\d+) : (\d+)\}px/.exec(callouts)?.[2]);
ck("S1 文字比 hotfix 更小（R ≤ 10px、其餘 ≤ 9px）",
  ultSize <= 10 && normalSize <= 9, `R ${ultSize}px／其餘 ${normalSize}px`);
ck("S2 四個欄位各有自己的動畫（可重用的 keyframes）",
  ["esmo-callout-q", "esmo-callout-w", "esmo-callout-e", "esmo-callout-r"].every((k) => callouts.includes(k)));
ck("S3 動畫都很短（≤ 0.42s）⇒ 不會蓋過技能特效",
  [...callouts.matchAll(/esmo-callout-[qwer] \.(\d+)s/g)].every((m) => Number(m[1]) <= 42),
  [...callouts.matchAll(/esmo-callout-[qwer] \.(\d+)s/g)].map((m) => `.${m[1]}s`).join(" "));
ck("S4 同時顯示數量有上限（2×／4× 不會整片都是字）",
  Number(/const MAX_CALLOUTS = (\d+)/.exec(callouts)?.[1]) <= 3);
ck("S5 keyframes 只注入一次，且尊重 prefers-reduced-motion",
  callouts.includes("esmo-skill-callout-css") && callouts.includes("prefers-reduced-motion"));

// ── C 體力規則（純函式行為）───────────────────────────────────────────────
console.log("\n── C 體力規則 ──");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const cond = await load("src/platform/condition/playerCondition.js");
const squad = await load("src/platform/contracts/matchSquad.js");
const mkP = (id, role, energy) => ({
  id, name: id, role, status: "主力", rosterTier: "active", energy, morale: 70,
  stats: Object.fromEntries("reflex accuracy apm positioning mapAware tacticalIQ decision adaptability courage clutch focus resilience comms leadership synergy learning".split(" ").map((k) => [k, 70])),
});
const LANES = ["上路", "打野", "中路", "下路", "輔助"];

ck("C1 體力 0／10／20／100 都可以出賽",
  [0, 10, 20, 100].every((e) => cond.matchFitness(mkP("x", "中路", e)).ok));
const seats = Object.fromEntries(["b1", "b2", "b3", "b4", "b5"].map((s, i) => [s, `p${i}`]));
const zeroTeam = LANES.map((role, i) => mkP(`p${i}`, role, 0));
const v = squad.validateSquad({ mode: "moba", seats, players: zeroTeam });
ck("C2 全隊 0 體力的陣容仍然通過驗證（只給警告，不給錯誤）",
  v.ok && v.errors.length === 0 && v.warnings.some((w) => w.code === "low_energy"),
  `errors ${v.errors.length}／warnings ${v.warnings.map((w) => w.code).join(",")}`);
ck("C3 疲勞曲線：滿體力 1.000、單調不增、0 體力 = floorFactor",
  cond.fatigueFactor(100) === 1 && cond.fatigueFactor(70) === 1
    && Math.abs(cond.fatigueFactor(0) - cond.FATIGUE.floorFactor) < 1e-9
    && [100, 70, 50, 30, 20, 10, 0].every((e, i, a) => i === 0 || cond.fatigueFactor(e) <= cond.fatigueFactor(a[i - 1]) + 1e-9),
  [70, 40, 20, 0].map((e) => `${e}→${cond.fatigueFactor(e).toFixed(3)}`).join(" "));
ck("C4 曲線連續（沒有門檻斷崖）：相鄰 1 點體力的落差 ≤ 0.01",
  Array.from({ length: 100 }, (_, i) => Math.abs(cond.fatigueFactor(i + 1) - cond.fatigueFactor(i))).every((d) => d <= 0.01));
ck("C5 發揮層（power/tough）比行為層溫和（不會低體力＝直接輸）",
  cond.executionFactor(0) > cond.fatigueFactor(0) && cond.executionFactor(70) === 1,
  `exec0 ${cond.executionFactor(0).toFixed(3)} / stat0 ${cond.fatigueFactor(0).toFixed(3)}`);

//  MOBA 與 CS 都吃同一條曲線（不是各做一套）
const roster = await load("src/battle/moba/mobaRosterAdapter.js");
const lineup = Object.fromEntries(["b1", "b2", "b3", "b4", "b5"].map((s, i) => [s, `p${i}`]));
const fresh = roster.buildPlayerStatSlots(LANES.map((r, i) => mkP(`p${i}`, r, 100)), "blue", lineup);
const tired = roster.buildPlayerStatSlots(zeroTeam, "blue", lineup);
ck("C6 MOBA：滿體力的能力 slots 逐鍵不變；0 體力全面下降",
  JSON.stringify(fresh[0].stats) === JSON.stringify(cond.applyFatigueToStats(fresh[0].stats, { energy: 100 }))
    && tired[0].stats.reflex < fresh[0].stats.reflex,
  `${fresh[0].stats.reflex} → ${tired[0].stats.reflex}`);
const lo = roster.applyFatigueToLoadout(
  { b1: { level: 4, powerMult: 1.2, toughMult: 1.1 } }, zeroTeam, lineup);
ck("C7 MOBA：熟練 loadout 的 power/tough 也吃疲勞（發揮層）",
  lo.b1.powerMult < 1.2 && lo.b1.powerMult > 1.2 * 0.9,
  `powerMult 1.2 → ${lo.b1.powerMult.toFixed(4)}`);
ck("C8 MOBA：滿體力的 loadout 逐鍵不變",
  roster.applyFatigueToLoadout({ b1: { level: 4, powerMult: 1.2, toughMult: 1.1 } },
    LANES.map((r, i) => mkP(`p${i}`, r, 100)), lineup).b1.powerMult === 1.2);
ck("C9 CS 與 MOBA 共用同一支 applyFatigueToStats（沒有第二套）",
  read("src/battle/fps/fpsRoster.js").includes("applyFatigueToStats")
    && read("src/battle/moba/mobaRosterAdapter.js").includes("applyFatigueToStats"));
ck("C10 顯示戰力也讀同一條曲線（不再用 condition 文字查表）",
  read("src/data/playerModel.js").includes("fatigueFactorOf(player)")
    && !/return Math\.round\(base \* MORALE_EFFECT[^\n]*CONDITION_EFFECT/.test(read("src/data/playerModel.js")));
ck("C11 沒有人再把體力當出賽阻擋（原始碼掃描）",
  !read("src/platform/contracts/matchSquad.js").includes("code: fit.code, seat, playerId: pid, message: `${seatLabel(mode, seat)}：${fit.message}`\n      });\n      continue;\n    }\n    filled++")
    && !/unfitBelow/.test(read("src/platform/condition/playerCondition.js")));
ck("C12 自動填入不再排除低體力選手，但同分層優先體力高的",
  (() => {
    const mixed = [...LANES.map((r, i) => mkP(`lo${i}`, r, 3)), ...LANES.map((r, i) => mkP(`hi${i}`, r, 95))];
    const filled = squad.autoFillSquad({ mode: "moba", seats: {}, players: mixed });
    const onlyLow = squad.autoFillSquad({ mode: "moba", seats: {}, players: LANES.map((r, i) => mkP(`lo${i}`, r, 3)) });
    return Object.values(filled).every((id) => String(id).startsWith("hi"))
      && Object.values(onlyLow).filter(Boolean).length === 5;
  })());

// ── E 休息入口 ───────────────────────────────────────────────────────────
console.log("\n── E 休息入口 ──");
ck("E1 首頁提醒直接開體力管理面板（不是跳去名單）",
  dashboard.includes("setRestOpen(true)") && dashboard.includes("<RestPlannerPanel"));
ck("E2 首頁文案不再說「不能出賽」",
  !/體力低到不能出賽/.test(dashboard) && /出賽能力會下降|能力會下降/.test(dashboard + restPanel));
ck("E3 面板支援單選／多選／全選",
  ["rest-player-check", "rest-select-all", "rest-assign"].every((t) => restPanel.includes(t)));
ck("E4 只用既有的正式動作 assignTraining(id,\"rest\")，不直接改 energy",
  dashboard.includes('assignTraining?.(id, "rest")')
    && !/energy\s*[:=]/.test(restPanel)
    && !/patchPlayer|setState|_patchPlayer/.test(restPanel));
ck("E5 不會偷偷推進遊戲日期",
  !/advanceDay|advanceWorldDays|advanceToNextStop/.test(restPanel)
    && restPanel.includes("推進日期後生效"));
ck("E6 Player Detail 也有單人快捷休息（同一個正式動作）",
  playerDetail.includes("player-quick-rest") && playerDetail.includes('assignTraining?.(p.id, "rest")')
    && !/patchPlayer/.test(playerDetail));

console.log(`\nBattle Condition UX：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
console.log(`   疲勞倍率（行為層）：${[100, 70, 40, 20, 0].map((e) => `${e}→${cond.fatigueFactor(e).toFixed(3)}`).join("、")}`);
console.log(`   疲勞倍率（發揮層）：${[100, 70, 40, 20, 0].map((e) => `${e}→${cond.executionFactor(e).toFixed(3)}`).join("、")}`);
process.exit(fail ? 1 : 0);
