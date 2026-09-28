// ============================================================================
//  tools/check_challenge_snapshot_fatigue_g4.mjs — G4 Hotfix：快照不得吃到當下體力（I13）
//
//  根因：`snapshotAuthority.publishDefensiveSnapshot` 把帶 `energy` 的生涯選手直接送進
//  `buildPlayerStatSlots`，而它自 Battle Condition UX（6eda6a2）起會套疲勞倍率 ⇒
//  energy 3 的選手 reflex 60 進快照成 52。白名單正規化發生在縮放之後，擋不住。
//  修正：取值前把狀態欄位寫成唯一的 `ONLINE_NORMALIZATION` 基準值（只給權威層的副本）。
//
//  本 gate 守：
//    A 同一選手不同 energy ⇒ 防守／出賽快照能力逐值相同（含最小案例 60 → 60）
//    B 既有 online normalization 仍正確（morale／condition 不影響、基準值宣告不變、狀態欄位不進 stats）
//    C Career 的 `buildPlayerStatSlots` 仍如實反映疲勞（沒有改全域行為）
//    D Player Challenge 防守快照（profileStore 走的同一支）不受當下 energy 污染，也不改生涯選手物件
//    E 原始碼：只用 `ONLINE_NORMALIZATION`，沒有第二套寫死的 energy／morale 基準值
//  General／Practice 流程由既有 gate（general_match_v7a、practice_match_v0d）守，不在這裡重寫。
// ============================================================================
import { readFileSync } from "node:fs";

const SA = await import("../src/platform/challenge/snapshotAuthority.js");
const SS = await import("../src/platform/contracts/squadSnapshot.js");
const RA = await import("../src/battle/moba/mobaRosterAdapter.js");
const PC = await import("../src/platform/condition/playerCondition.js");

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? `　${detail}` : ""}`); }
};

const STAT_KEYS = SA.COMBAT_STAT_KEYS;
const statsAt = (v) => Object.fromEntries(STAT_KEYS.map((k) => [k, v]));
const mkPlayers = (status = {}) => SS.SNAPSHOT_SEATS.map((seat, i) => ({
  id: seat, name: `選手${i}`, role: ["top", "jungle", "mid", "adc", "sup"][i],
  status: "主力", rosterTier: "active", stats: statsAt(60), ...status,
}));
const careerStateOf = (players, day = 10) => ({
  players,
  lineup: Object.fromEntries(SS.SNAPSHOT_SEATS.map((s) => [s, s])),
  heroProgress: Object.fromEntries(SS.SNAPSHOT_SEATS.map((s, i) => [`hero_${s}`, { level: 3 + i }])),
  heroAssign: Object.fromEntries(SS.SNAPSHOT_SEATS.map((s) => [s, `hero_${s}`])),
  team: { teamId: "team:alpha", teamName: "測試戰隊", tag: "TST" },
  careerDay: day, lastPublishedCareerDay: null,
});
const request = { teamId: "team:alpha", tacticId: "m1" };
const publish = (players, intent = SA.SNAPSHOT_INTENT.defense) =>
  SA.publishDefensiveSnapshot({ request, careerState: careerStateOf(players), now: 1000, intent });
const statsOf = (r) => r.snapshot?.combat?.stats ?? null;

// ── A 不同 energy ⇒ 快照能力相同 ─────────────────────────────────────────
console.log("\n── A 當下體力不進快照能力 ──");
const energies = [100, 85, 70, 50, 30, 10, 3, 0];
for (const intent of [SA.SNAPSHOT_INTENT.defense, SA.SNAPSHOT_INTENT.entry]) {
  const results = energies.map((energy) => publish(mkPlayers({ energy }), intent));
  const allOk = results.every((r) => r.ok && statsOf(r)?.b1?.reflex != null);
  const base = JSON.stringify(statsOf(results[0]));
  const same = results.every((r) => JSON.stringify(statsOf(r)) === base);
  ck(`A1[${intent}] energy ${energies.join("/")} 全部發布成功且能力逐值相同`, allOk && same,
    allOk ? energies.map((e, i) => `${e}:${statsOf(results[i])?.b1?.reflex}`).join(" ") : JSON.stringify(results.find((r) => !r.ok)?.errors));
}
const low = publish(mkPlayers({ energy: 3 }));
const full = publish(mkPlayers({ energy: 100 }));
ck("A2 最小案例：energy 3、reflex 60 ⇒ 快照 reflex 60（修正前為 52）", low.ok && statsOf(low).b1.reflex === 60, `got ${statsOf(low)?.b1?.reflex}`);
ck("A3 體力充足（≥70）時快照與修正前逐值相同（沒有改到正常情況）", full.ok && STAT_KEYS.every((k) => statsOf(full).b1[k] === 60));
const mixed = publish(mkPlayers().map((p, i) => ({ ...p, energy: [100, 3, 55, 0, 70][i] })));
ck("A4 同隊體力參差 ⇒ 五個席位能力皆為原值", mixed.ok && SS.SNAPSHOT_SEATS.every((s) => statsOf(mixed)[s].reflex === 60));

// ── B 既有 online normalization ──────────────────────────────────────────
console.log("\n── B Online normalization（I13）──");
ck("B1 基準值宣告未變（online-normalize.v1／正常／70／100）",
  JSON.stringify(SS.ONLINE_NORMALIZATION) === JSON.stringify({ policy: "online-normalize.v1", condition: "正常", morale: 70, energy: 100 }));
ck("B2 快照宣告的 normalization ＝ ONLINE_NORMALIZATION", JSON.stringify(full.snapshot.normalization) === JSON.stringify(SS.ONLINE_NORMALIZATION));
const variants = [{ morale: 5 }, { morale: 100 }, { condition: "低潮" }, { condition: "精神飽滿" }, { morale: 5, condition: "低潮", energy: 3 }];
const vres = variants.map((v) => publish(mkPlayers(v)));
ck("B3 morale／condition（含與 energy 疊加）都不改變快照能力",
  vres.every((r) => r.ok && JSON.stringify(statsOf(r)) === JSON.stringify(statsOf(full))),
  variants.map((v, i) => `${JSON.stringify(v)}→${statsOf(vres[i])?.b1?.reflex}`).join(" "));
const leakedKeys = SS.SNAPSHOT_SEATS.flatMap((s) => Object.keys(statsOf(low)[s]).filter((k) => ["condition", "morale", "energy"].includes(k)));
ck("B4 狀態三欄不進 stats（白名單仍有效）", leakedKeys.length === 0, leakedKeys.join(","));
ck("B5 快照雜湊不隨當下體力改變（同日、同陣容 ⇒ 同一支隊伍）",
  low.snapshot.hash != null && low.snapshot.hash === full.snapshot.hash,
  `${low.snapshot.hash} vs ${full.snapshot.hash}`);

// ── C Career 疲勞仍正常 ─────────────────────────────────────────────────
console.log("\n── C Career buildPlayerStatSlots 行為不變 ──");
const lineup = Object.fromEntries(SS.SNAPSHOT_SEATS.map((s) => [s, s]));
const careerLow = RA.buildPlayerStatSlots(mkPlayers({ energy: 3 }), "blue", lineup);
const careerFull = RA.buildPlayerStatSlots(mkPlayers({ energy: 100 }), "blue", lineup);
const expected = Math.round(60 * PC.fatigueFactor(3));
ck("C1 Career：energy 3 仍套疲勞（reflex < 60）", careerLow[0].stats.reflex < 60, `got ${careerLow[0].stats.reflex}`);
ck("C2 Career：疲勞值仍出自 playerCondition 同一條曲線", Math.abs(careerLow[0].stats.reflex - expected) <= 1, `got ${careerLow[0].stats.reflex}, curve ${expected}`);
ck("C3 Career：體力充足時不打折", careerFull[0].stats.reflex === 60);

// ── D Player Challenge 防守快照 ─────────────────────────────────────────
console.log("\n── D Player Challenge 防守快照 ──");
const tired = mkPlayers({ energy: 3, morale: 12, condition: "疲勞" });
const before = JSON.stringify(tired);
const def = publish(tired, SA.SNAPSHOT_INTENT.defense);
ck("D1 疲勞隊伍的防守快照能力 ＝ 滿體力隊伍", def.ok && JSON.stringify(statsOf(def)) === JSON.stringify(statsOf(full)));
ck("D2 發布不改生涯選手物件（energy／morale／condition 原樣保留）", JSON.stringify(tired) === before);
const store = readFileSync(new URL("../src/platform/profileStore.js", import.meta.url), "utf8");
const storeCalls = (store.match(/publishDefensiveSnapshot\(/g) ?? []).length;
const storeSlots = /buildPlayerStatSlots/.test(store);
ck("D3 profileStore 的防守／出賽快照都走 publishDefensiveSnapshot，沒有自己取值", storeCalls >= 2 && !storeSlots, `calls=${storeCalls}, slots=${storeSlots}`);

// ── E 原始碼：唯一正規化來源 ─────────────────────────────────────────────
console.log("\n── E 沒有第二套正規化 ──");
const saSrc = readFileSync(new URL("../src/platform/challenge/snapshotAuthority.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
ck("E1 snapshotAuthority 取值前使用 ONLINE_NORMALIZATION",
  /=\s*ONLINE_NORMALIZATION\s*;/.test(saSrc) && /buildPlayerStatSlots\(\s*onlinePlayers/.test(saSrc));
ck("E2 snapshotAuthority 沒有寫死 energy／morale 基準值", !/\b(energy|morale)\s*:\s*\d/.test(saSrc));

console.log(`\nG4 challenge snapshot fatigue：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
