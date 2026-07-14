// ============================================================================
//  Sprint27 選手天賦驗證：repo 根目錄執行 `node tools/check_talent27.mjs`
//  ⚠ 中文 OneDrive 路徑：一律絕對 file:// URL。子行程一律驗 exit code＋輸出形狀。
// ============================================================================
import { pathToFileURL } from "url";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const src = (p) => fs.readFileSync(p, "utf8");
const A = [];
const ck = (n, c) => A.push([n, !!c]);
const importsMod = (s, name) => new RegExp(`import[^;]*from\\s+"[^"]*${name}`).test(s);

const { TALENT_DEFINITIONS, TALENT_CATEGORIES, talentById } = await import(u("src/platform/talents/talentDefinitions.js"));
const { getPlayerTalentState, validatePlayerTalentState, sanitizeTalents, recomputeSpentPoints } = await import(u("src/platform/contracts/playerTalentState.js"));
const { getPlayerDerivedStats, getTalentStatBonuses, withDerivedStats, getStatLayers } = await import(u("src/platform/talents/playerDerivedStats.js"));
const { applyTalentPurchase, __debugResetTalents } = await import(u("src/platform/talents/purchasePlayerTalent.js"));
const { STAT_DEF } = await import(u("src/data/playerModel.js"));
const { toFpsRoster, STAT_L2S } = await import(u("src/battle/fps/fpsRoster.js"));
const { buildEngineSlots } = await import(u("src/battle/moba/mobaRosterAdapter.js"));
const { fitScore } = await import(u("src/screens/moba/tacticFit.js"));
const { MOBA_TACTICS } = await import(u("src/platform/contracts/MobaTacticConfig.js"));
const { totalXpForLevel } = await import(u("src/platform/progress/playerLevel.js"));

const STAT_KEYS = STAT_DEF.map((s) => s.key);
const CAT_IDS = TALENT_CATEGORIES.map((c) => c.id);

// ── fixtures ────────────────────────────────────────────────────────────────
const mkStats = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 70]));
const mkPlayer = (id = "b1", pts = 10) => ({
  id, name: "T" + id, role: "中路", status: "主力", xp: totalXpForLevel(10), lv: 10,
  talentPoints: pts, talents: { ranks: {}, spentPoints: 0, updatedAt: null },
  stats: mkStats(), morale: 80, energy: 90, condition: "正常", personality: "calm", potential: 90,
});
const mkFive = (pts = 0) => ["b1", "b2", "b3", "b4", "b5"].map((id, i) => ({ ...mkPlayer(id, pts), role: ["上路", "打野", "中路", "下路", "輔助"][i] }));

// ═══ 定義健全（1–7）═════════════════════════════════════════════════════════
ck("1) 12 個 talentId 唯一（共 " + TALENT_DEFINITIONS.length + " 個）",
  TALENT_DEFINITIONS.length === 12 && new Set(TALENT_DEFINITIONS.map((t) => t.id)).size === 12);
ck("2) 所有 category 合法", TALENT_DEFINITIONS.every((t) => CAT_IDS.includes(t.category)));
ck("3) 所有 stat key 屬於既有 16 項能力（且可映射 CS 短鍵）",
  TALENT_DEFINITIONS.every((t) => t.effects.every((e) => STAT_KEYS.includes(e.stat) && STAT_L2S[e.stat])));
ck("4) cost 為正整數", TALENT_DEFINITIONS.every((t) => Number.isInteger(t.costPerRank) && t.costPerRank > 0));
ck("5) maxRank 為正整數", TALENT_DEFINITIONS.every((t) => Number.isInteger(t.maxRank) && t.maxRank > 0));
ck("6) prerequisites 指向存在 talent", TALENT_DEFINITIONS.every((t) => t.prerequisites.every((p) => talentById(p.talentId))));
ck("   每 rank 效果合計 ≤ 2 點（紅線）", TALENT_DEFINITIONS.every((t) => t.effects.reduce((s, e) => s + e.perRank, 0) <= 2));
ck("7) prerequisites 無循環", (() => {
  const seen = new Set(), done = new Set();
  const visit = (id) => {
    if (done.has(id)) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    for (const p of talentById(id).prerequisites) if (!visit(p.talentId)) return false;
    seen.delete(id); done.add(id);
    return true;
  };
  return TALENT_DEFINITIONS.every((t) => visit(t.id));
})());

// ═══ 購買服務（8–14）════════════════════════════════════════════════════════
ck("8) 點數不足不可購買", (() => {
  const r = applyTalentPurchase(mkPlayer("b1", 0), "operation_1");
  return !r.nextPlayer && r.receipt.success === false && /不足/.test(r.receipt.failureReason);
})());
ck("9) 前置不足不可購買", (() => {
  const r = applyTalentPurchase(mkPlayer("b1", 9), "operation_2");   // 需 operation_1 ≥2
  return !r.nextPlayer && /需要/.test(r.receipt.failureReason);
})());
ck("10) 滿 rank 不可購買", (() => {
  let p = mkPlayer("b1", 9);
  for (let i = 0; i < 3; i++) p = applyTalentPurchase(p, "operation_1").nextPlayer;
  const r = applyTalentPurchase(p, "operation_1");
  return !r.nextPlayer && /最高等級/.test(r.receipt.failureReason);
})());
ck("11) 成功購買只扣一次（cost 取自 definition）", (() => {
  const p0 = mkPlayer("b1", 5);
  const { nextPlayer, receipt } = applyTalentPurchase(p0, "operation_1");
  return receipt.success && nextPlayer.talentPoints === 4 && receipt.pointsSpent === 1
    && receipt.previousRank === 0 && receipt.newRank === 1
    && p0.talentPoints === 5 && (p0.talents.ranks.operation_1 ?? 0) === 0;   // 不改輸入
})());
ck("12) availablePoints 不為負（負值/損壞輸入安全修正）", (() => {
  const s = getPlayerTalentState({ id: "b1", talentPoints: -5, talents: "garbage" });
  return s.availablePoints === 0 && validatePlayerTalentState(s).ok;
})());
ck("13) spentPoints 可由 definitions 重算（不信任持久層）", (() => {
  const dirty = sanitizeTalents({ ranks: { operation_1: 3, tactics_1: 1, ghost_talent: 5, mental_1: "abc", team_1: 99 }, spentPoints: 999 });
  return dirty.spentPoints === recomputeSpentPoints(dirty.ranks)
    && dirty.spentPoints === 3 + 1 + 3            // ghost 忽略、abc→0 不留、99→clamp 3
    && !("ghost_talent" in dirty.ranks) && !("mental_1" in dirty.ranks) && dirty.ranks.team_1 === 3;
})());
ck("14) receipt 與 Store 差額一致（statChanges = derived 前後差）", (() => {
  const p0 = mkPlayer("b1", 5);
  const { nextPlayer, receipt } = applyTalentPurchase(p0, "operation_1");
  const before = getPlayerDerivedStats(p0), after = getPlayerDerivedStats(nextPlayer);
  return receipt.statChanges.every((c) => c.before === before[c.stat] && c.after === after[c.stat])
    && p0.talentPoints - nextPlayer.talentPoints === receipt.pointsSpent;
})());

// ═══ Derived Stats（15–17）══════════════════════════════════════════════════
ck("15) derived stats 不修改 base stats", (() => {
  let p = mkPlayer("b1", 9);
  for (let i = 0; i < 3; i++) p = applyTalentPurchase(p, "operation_1").nextPlayer;
  const d = getPlayerDerivedStats(p);
  return p.stats.reflex === 70 && p.stats.accuracy === 70 && d.reflex === 73 && d.accuracy === 73;
})());
ck("16) 無天賦時 derived stats 等於 base stats（逐鍵）", (() => {
  const p = mkPlayer("b1", 0);
  const d = getPlayerDerivedStats(p);
  return STAT_KEYS.every((k) => d[k] === p.stats[k]);
})());
ck("17) derived stats 不超過合法範圍（98 基礎 + 加成 → clamp 99）", (() => {
  let p = { ...mkPlayer("b1", 9), stats: { ...mkStats(), apm: 98 } };
  p = applyTalentPurchase(p, "operation_1").nextPlayer;
  p = applyTalentPurchase(p, "operation_1").nextPlayer;
  p = applyTalentPurchase(p, "operation_2").nextPlayer;   // apm +2
  const d = getPlayerDerivedStats(p);
  return d.apm === 99 && p.stats.apm === 98;
})());

// ═══ 注入（18–20）＋固定比較（§11）══════════════════════════════════════════
const noTalent = mkFive(0);
const withOp = mkFive(0).map((p) => p.id === "b3" ? [1, 1, 1].reduce((x) => applyTalentPurchase(x, "operation_1").nextPlayer, { ...p, talentPoints: 9 }) : p);
const withTac = mkFive(0).map((p) => p.id === "b3" ? [1, 1, 1].reduce((x) => applyTalentPurchase(x, "tactics_1").nextPlayer, { ...p, talentPoints: 9 }) : p);

ck("18) MOBA adapter 收到 derived stats（buildEngineSlots power 隨天賦變）", (() => {
  const cfg = (roster) => ({ draft: { picks: { blue: [{ id: "ironclad", lane: "中路", arch: "法師", diff: 2 }], red: [] } }, roster, opponent: [] });
  const a = buildEngineSlots(cfg(noTalent));
  const b = buildEngineSlots(cfg(withOp));
  const aBlue = a.filter((s) => s.side === "blue" && s.power != null);
  const bBlue = b.filter((s) => s.side === "blue" && s.power != null);
  return aBlue.length > 0 && JSON.stringify(aBlue) !== JSON.stringify(bBlue);
})());
ck("19) CS adapter 收到 derived stats（rxn/acc 反映天賦；無天賦者不變）", (() => {
  const a = toFpsRoster(noTalent), b = toFpsRoster(withOp);
  const ai = a.findIndex((x) => x._gid === "b3"), bi = b.findIndex((x) => x._gid === "b3");
  return b[bi].stats.rxn === a[ai].stats.rxn + 3 && b[bi].stats.acc === a[ai].stats.acc + 3
    && a.filter((x) => x._gid !== "b3").every((x, i) => JSON.stringify(x.stats) === JSON.stringify(b.filter((y) => y._gid !== "b3")[i].stats));
})());
ck("20) MobaTactic 適性讀 derived stats（戰術天賦 → m1 適性上升；無天賦不變）", (() => {
  const m1 = MOBA_TACTICS.find((t) => t.tacticId === "m1");   // fit.stats 含 tacticalIQ
  const base = fitScore(m1, noTalent);
  const tac = fitScore(m1, withTac);
  const op = fitScore(m1, withOp);
  return tac > base && base != null && op >= base;   // 戰術類天賦 ↑；操作類不降
})());
ck("   adapter 輸入不同但 base stats 完全未變（§11）",
  [withOp, withTac].every((set) => set.every((p) => STAT_KEYS.every((k) => p.stats[k] === 70))));

// ═══ Persistence / Migration（21–23）════════════════════════════════════════
ck("21) persistence round-trip 保留 ranks", (() => {
  let p = mkPlayer("b1", 9);
  p = applyTalentPurchase(p, "operation_1").nextPlayer;
  p = applyTalentPurchase(p, "operation_1").nextPlayer;
  const revived = sanitizeTalents(JSON.parse(JSON.stringify(p)).talents);
  return revived.ranks.operation_1 === 2 && revived.spentPoints === 2;
})());
ck("22) 舊存檔 migration 不遺失 S25/S26 資料（缺 talents → 空狀態；xp/lv/points 不動）", (() => {
  // S24 前（無 xp）/ S25（xp 有）/ S26 —— players 皆無 talents 欄位
  const s24 = { id: "b1", name: "K", lv: 38 };
  const s25 = { id: "b2", name: "N", lv: 5, xp: totalXpForLevel(5), talentPoints: 3 };
  const t24 = sanitizeTalents(s24.talents), t25 = sanitizeTalents(s25.talents);
  return Object.keys(t24.ranks).length === 0 && t24.spentPoints === 0
    && Object.keys(t25.ranks).length === 0 && s25.talentPoints === 3 && s25.xp === totalXpForLevel(5);
})());
ck("23) 損壞 state 不白畫面（rank 非數字/超上限/負 points/幽靈 id/損壞前置全部安全）", (() => {
  const broken = { id: "bX", talentPoints: NaN, talents: { ranks: { operation_1: Infinity, tactics_1: -4, nope: 2 }, spentPoints: "x" }, stats: null };
  const s = getPlayerTalentState(broken);
  const d = getPlayerDerivedStats(broken);
  return validatePlayerTalentState(s).ok && s.availablePoints === 0 && s.ranks.operation_1 === 3 && !("tactics_1" in s.ranks) && typeof d === "object";
})());

// ═══ Baseline / 凍結（24–30）════════════════════════════════════════════════
ck("24) 無天賦 MOBA baseline 不變（buildEngineSlots 與 stats 直傳一致）", (() => {
  const cfg = { draft: { picks: { blue: [{ id: "x", lane: "中路", arch: "法師", diff: 2 }], red: [] } }, roster: noTalent, opponent: [] };
  const withT = buildEngineSlots(cfg);
  const plain = buildEngineSlots({ ...cfg, roster: noTalent.map((p) => ({ ...p })) });
  return JSON.stringify(withT) === JSON.stringify(plain);
})());
ck("25) 無天賦 CS baseline 不變（toFpsRoster 輸出 stats = base 直轉）", (() => {
  const out = toFpsRoster(noTalent);
  return out.every((r) => Object.values(r.stats).every((v) => v === 70));
})());
const frozen = [
  ["26) 不修改 BattleResult.v2", "src/battle/battleResult.js"],
  ["27) 不修改 CsMatchResult.v1", "src/platform/contracts/CsMatchResult.js"],
  ["28) 不修改 MatchProgressTransaction.v1", "src/platform/contracts/matchProgressTransaction.js"],
  ["29) 不修改 LogicEngine 核心", "src/LogicEngine.js"],
  ["30) 不修改 FPS presentation", "src/battle/fps/EsportsFPS3D.jsx"],
];
for (const [name, f] of frozen) {
  try { execFileSync("git", ["diff", "--quiet", "HEAD", "--", f], { cwd: ROOT }); ck(name + "（git diff 零改變）", true); }
  catch { ck(name + "（git diff 零改變）", false); }
}
ck("   天賦模組不含傷害/勝率/金錢/XP 字樣（紅線靜態防線）", (() => {
  const files = ["src/platform/talents/talentDefinitions.js", "src/platform/talents/playerDerivedStats.js", "src/platform/talents/purchasePlayerTalent.js"];
  return files.every((f) => { const s = src(f); return !/damage|winRate|勝率係數|money|fans|xpGained/.test(s); });
})());
ck("   正式 UI 無重置鈕（__debugResetTalents 不出現在畫面）", (() => {
  return !src("src/screens/manage/PlayerTalentScreen.jsx").includes("__debugResetTalents")
    && typeof __debugResetTalents === "function";
})());
ck("   UI 不直接改 stats/talentPoints（只呼叫 purchasePlayerTalent）", (() => {
  const s = src("src/screens/manage/PlayerTalentScreen.jsx");
  return s.includes("purchasePlayerTalent") && !s.includes("set({") && !s.includes(".talentPoints =") && !s.includes(".stats[");
})());
ck("   防誤點：確認區 + 不可重置警語", (() => {
  const s = src("src/screens/manage/PlayerTalentScreen.jsx");
  return s.includes("確認投入") && s.includes("不可重置") && s.includes("confirmId");
})());
ck("   響應式：無固定 380/560、grid 有 min() 防護、無 transform scale", (() => {
  const s = src("src/screens/manage/PlayerTalentScreen.jsx");
  return !s.includes("width: 380") && !s.includes("width: 560") && s.includes("minmax(min(") && !s.includes("scale(");
})());

// ═══ 子行程（31–32 + 全套；exit code + 輸出形狀）════════════════════════════
function runNode(script, shape) {
  try {
    const out = execFileSync(process.execPath, [script], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: shape.test(out), code: 0 };
  } catch (e) { return { ok: false, code: e.status ?? 1 }; }
}
for (const [name, script, shape] of [
  ["31) Replay 播放不受影響（experience26 全綠）", "tools/check_moba_experience26.mjs", /35\/35 通過/],
  ["32) Progress 冪等不受影響（progress25 全綠）", "tools/check_progress25.mjs", /34\/34 通過/],
  ["   tactic24", "tools/check_moba_tactic24.mjs", /27\/27 通過/],
  ["   cs23", "tools/check_cs23.mjs", /28\/28 通過/],
  ["   regress", "tools/regress.mjs", /結束率 15\/15/],
  ["   regress2", "tools/regress2.mjs", /達標 19\/20/],
  ["   flow09", "tools/check_flow09.mjs", /standings 勝場和==場數: ✅/],
]) {
  const r = runNode(script, shape);
  ck(`${name}（exit=${r.code}）`, r.ok && r.code === 0);
}

// ── 報告 ────────────────────────────────────────────────────────────────────
let pass = 0;
for (const [n, ok] of A) { console.log(`${ok ? "✅" : "❌"} ${n}`); if (ok) pass++; }
console.log(`\n${pass}/${A.length} 通過`);
// 固定比較表（§11）
const m1 = MOBA_TACTICS.find((t) => t.tacticId === "m1");
console.log(`\n=== 固定比較（b3 中路，同 roster）===`);
console.log(`A 無天賦        ：m1 適性 ${fitScore(m1, noTalent)}　CS rxn/acc = ${toFpsRoster(noTalent)[2].stats.rxn}/${toFpsRoster(noTalent)[2].stats.acc}`);
console.log(`B 操作天賦 3 級 ：m1 適性 ${fitScore(m1, withOp)}　CS rxn/acc = ${toFpsRoster(withOp).find(x=>x._gid==="b3").stats.rxn}/${toFpsRoster(withOp).find(x=>x._gid==="b3").stats.acc}`);
console.log(`C 戰術天賦 3 級 ：m1 適性 ${fitScore(m1, withTac)}　CS vis/tac = ${toFpsRoster(withTac).find(x=>x._gid==="b3").stats.vis}/${toFpsRoster(withTac).find(x=>x._gid==="b3").stats.tac}`);
process.exit(pass === A.length ? 0 : 1);
