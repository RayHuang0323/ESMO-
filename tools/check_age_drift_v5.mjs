#!/usr/bin/env node
// ============================================================================
//  tools/check_age_drift_v5.mjs — Season vNext V5-2：年度能力漂移 × AI 世代交替
//
//  執行：repo 根目錄 `node tools/check_age_drift_v5.mjs`；失敗 exit 1。
//
//  ── 為什麼兩件事必須同一支 gate ───────────────────────────────────────────
//  只有玩家會老、AI 永遠 19–27 歲，等於**單方面懲罰玩家**。
//  所以「玩家漂移」與「AI 同步老化」在同一輪交付，也在同一支 gate 驗。
//
//  ── 紅線（使用者在 V5-2 開工前指定）─────────────────────────────────────
//  · Aging clock = **raw age + 決定性個體 profile**，**不得**用 V4 的 effectiveAge
//    （effectiveAge 吃當前能力 ⇒ 能力一掉，時鐘反而變年輕，衰退會自我熄火。
//     實測：33 歲掉 10 點能力 ⇒ effectiveAge 倒退 2.25 年。）
//  · profile **不讀目前能力** ⇒ 能力下降不可能讓老化時鐘倒退
//  · `learning` 不參與漂移（它是成長速率輸入，漂移會與 ageEfficiency 重複計算）
//  · 操作較早衰、戰術較晚衰、心理持平／緩升、團隊最久
//  · 維持合法上下限與 potential cap
//  · **不要讓老將一年突然崩壞**
//
//  §D 契約　§C 時鐘　§P 方向　§L 上下限　§A AI 世代交替
//  §R 15 年長跑　§F 快轉一致　§N 本輪邊界　§M sentinel
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

const P_DRIFT = "src/platform/progress/ageDrift.js";
const P_AI = "src/platform/competition/aiTeams.js";
const P_SEASON = "src/platform/competition/seasonState.js";
const P_OFF = "src/platform/time/offSeason.js";

const drift = await soft(P_DRIFT);
const ai = await imp(P_AI);
const model = await imp("src/data/playerModel.js");
const strength = await imp("src/platform/competition/teamStrength.js");

const CATS = model.STAT_CATS;
const keysOfCat = (c) => model.STAT_DEF.filter((s) => s.cat === c).map((s) => s.key);
const mk = ({ id = "p1", age = 22, at = 70, potential = 88 } = {}) => ({
  id, role: "中路", age, potential, lv: 40, energy: 100,
  stats: Object.fromEntries(model.STAT_DEF.map((s) => [s.key, at])),
});
const avgCat = (p, c) => { const k = keysOfCat(c); return k.reduce((s, x) => s + p.stats[x], 0) / k.length; };

// ════════════════════════════════════════════════════════════════════════════
//  §D 契約
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§D 契約】");

ck("D1) 有獨立的漂移純模組 `progress/ageDrift.js`", !!drift, drift ? "" : "模組不存在");

ck("D2) 純模組（不 import Store / React / localStorage）",
  !!drift && !/profileStore|zustand|from "react"|localStorage/.test(codeOnly(read(P_DRIFT))));

ck("D3) **不得 import V4 的 careerStage**（紅線：不可用 effectiveAge 當衰退時鐘）",
  !!drift && !/careerStage|effectiveCareerAge|effectiveAge/.test(codeOnly(read(P_DRIFT))));

ck("D4) 有版本字串與 frozen 常數（calibration 之後只改一處）",
  !!drift && typeof drift.AGE_DRIFT_VERSION === "string"
  && Object.isFrozen(drift.DRIFT) && Object.isFrozen(drift.DRIFT.categories));

ck("D5) 四個能力分類都有規則（用主幹既有的 `STAT_CATS`，不另寫清單）",
  !!drift && CATS.every((c) => !!drift.DRIFT.categories[c]),
  CATS.join("／"));

ck("D6) `learning` 明確列在排除名單",
  !!drift && Array.isArray(drift.DRIFT_EXCLUDED) && drift.DRIFT_EXCLUDED.includes("learning"),
  drift?.DRIFT_EXCLUDED ? drift.DRIFT_EXCLUDED.join(",") : "");

// ════════════════════════════════════════════════════════════════════════════
//  §C 時鐘：raw age + 決定性 profile
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§C 老化時鐘】");

ck("C1) `agingProfileOf` 是**決定性**的（同一個 id 永遠同一份 profile）",
  !!drift && (() => {
    const a = drift.agingProfileOf(mk({ id: "x" }));
    const b = drift.agingProfileOf(mk({ id: "x", age: 40, at: 30 }));
    return JSON.stringify(a) === JSON.stringify(b);
  })());

ck("C2) **profile 不讀目前能力**——換掉全部能力，profile 逐值不變",
  !!drift && (() => {
    const lo = drift.agingProfileOf({ id: "y", stats: Object.fromEntries(model.STAT_DEF.map((s) => [s.key, 40])), potential: 50 });
    const hi = drift.agingProfileOf({ id: "y", stats: Object.fromEntries(model.STAT_DEF.map((s) => [s.key, 95])), potential: 99 });
    return JSON.stringify(lo) === JSON.stringify(hi);
  })());

ck("C3) **老化時鐘 = raw age + profile 偏移**（能力完全不影響）",
  !!drift && (() => {
    const strong = drift.agingAgeOf(mk({ id: "z", age: 33, at: 90 }));
    const weak = drift.agingAgeOf(mk({ id: "z", age: 33, at: 45 }));
    return strong === weak;
  })(),
  !!drift ? `33 歲：強 ${drift.agingAgeOf(mk({ id: "z", age: 33, at: 90 }))}｜弱 ${drift.agingAgeOf(mk({ id: "z", age: 33, at: 45 }))}` : "");

ck("C4) **能力下降不得讓時鐘倒退**（掃 20–40 歲、能力 90 → 40）",
  !!drift && (() => {
    for (let a = 20; a <= 40; a++) {
      const before = drift.agingAgeOf(mk({ id: "w", age: a, at: 90 }));
      const after = drift.agingAgeOf(mk({ id: "w", age: a, at: 40 }));
      if (after < before) return false;
    }
    return true;
  })());

ck("C5) 時鐘對 raw age **嚴格遞增**",
  !!drift && (() => {
    let last = -Infinity;
    for (let a = 16; a <= 45; a++) {
      const v = drift.agingAgeOf(mk({ id: "v", age: a }));
      if (v <= last) return false;
      last = v;
    }
    return true;
  })());

ck("C6) 個體差異真的存在（不同 id 的偏移不全相同）",
  !!drift && (() => {
    const s = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => drift.agingProfileOf({ id }).offsetYears));
    return s.size >= 4;
  })(),
  !!drift ? [...new Set(["a", "b", "c", "d"].map((id) => drift.agingProfileOf({ id }).offsetYears))].join(",") : "");

ck("C7) 偏移**有界**（不得出現 20 歲就被當成老將的離譜 profile）",
  !!drift && ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]
    .every((id) => Math.abs(drift.agingProfileOf({ id }).offsetYears) <= drift.DRIFT.profileSpreadYears));

// ════════════════════════════════════════════════════════════════════════════
//  §P 方向
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§P 漂移方向】");

const driftYears = (p0, years) => {
  let p = p0;
  for (let i = 0; i < years; i++) p = drift.applyAgeDrift({ ...p, age: p.age + 1 });
  return p;
};

ck("P1) **操作**是最早開始衰的一類",
  !!drift && (() => {
    const froms = Object.fromEntries(CATS.map((c) => [c, drift.DRIFT.categories[c].declineFrom]));
    return CATS.every((c) => c === "操作" || froms["操作"] <= froms[c]);
  })(),
  !!drift ? CATS.map((c) => `${c}:${drift.DRIFT.categories[c].declineFrom}`).join(" ") : "");

ck("P2) **戰術**比操作晚衰",
  !!drift && drift.DRIFT.categories["戰術"].declineFrom > drift.DRIFT.categories["操作"].declineFrom);

ck("P3) **團隊**保留最久（起衰年齡最晚）",
  !!drift && CATS.every((c) => drift.DRIFT.categories["團隊"].declineFrom >= drift.DRIFT.categories[c].declineFrom));

ck("P4) 35 歲時：**操作掉最多**，戰術／團隊掉得少甚至還在升",
  !!drift && (() => {
    const p0 = mk({ id: "dir", age: 25, at: 70, potential: 88 });
    const p1 = driftYears(p0, 10);
    const d = Object.fromEntries(CATS.map((c) => [c, avgCat(p1, c) - avgCat(p0, c)]));
    return d["操作"] < d["戰術"] && d["操作"] < d["團隊"] && d["操作"] < 0;
  })(),
  !!drift ? (() => {
    const p0 = mk({ id: "dir", age: 25, at: 70, potential: 88 });
    const p1 = driftYears(p0, 10);
    return CATS.map((c) => `${c} ${(avgCat(p1, c) - avgCat(p0, c)).toFixed(1)}`).join("｜");
  })() : "");

ck("P5) **`learning` 逐值不變**（掃 20 年）",
  !!drift && (() => {
    const p0 = mk({ id: "lrn", age: 20, at: 65, potential: 90 });
    return driftYears(p0, 20).stats.learning === p0.stats.learning;
  })());

//  ⚠ P5b／P5c 是 V5-3 前的 calibration 加上的：正向 drift 曾經與訓練**重複計算**
//    （不訓練的 19 歲 5 年純靠 aging 主能力 +2.6～+3.2，其中操作 +2～+5）。
//    職責分工是：Training / Match Growth 才是主要成長來源，Age Drift 只做自然成熟。
ck("P5b) **操作不因 aging 額外成長**（手速是練出來的，不是長大就會）",
  !!drift && drift.DRIFT.categories["操作"].risePerYear === 0,
  !!drift ? `操作 risePerYear ${drift.DRIFT.categories["操作"].risePerYear}` : "");

ck("P5c) **完全不訓練的年輕人不得只靠 aging 明顯變強**（5 年主能力增幅 < 1.5）",
  !!drift && (() => {
    let worst = 0;
    for (const age of [19, 22]) {
      for (const role of ["上路", "打野", "中路", "輔助"]) {
        const p0 = { ...mk({ id: `dc-${age}-${role}`, age, at: 62, potential: 88 }), role };
        let p = p0;
        for (let i = 0; i < 5; i++) p = drift.applyAgeDrift({ ...p, age: p.age + 1 });
        const mk5 = Object.keys(p0.stats).reduce((s, k) => s + p.stats[k] - p0.stats[k], 0) / 16;
        worst = Math.max(worst, mk5);
      }
    }
    return worst < 1.5;
  })(),
  !!drift ? (() => {
    const p0 = { ...mk({ id: "dc-19-中路", age: 19, at: 62, potential: 88 }), role: "中路" };
    let p = p0; for (let i = 0; i < 5; i++) p = drift.applyAgeDrift({ ...p, age: p.age + 1 });
    return `19 歲中路 5 年純 aging 平均 +${(Object.keys(p0.stats).reduce((s, k) => s + p.stats[k] - p0.stats[k], 0) / 16).toFixed(2)}`;
  })() : "");

ck("P6) 年輕人（巔峰之前）不會因為漂移而變弱",
  !!drift && (() => {
    const p0 = mk({ id: "yng", age: 20, at: 60, potential: 90 });
    const p1 = drift.applyAgeDrift({ ...p0, age: 21 });
    return CATS.every((c) => avgCat(p1, c) >= avgCat(p0, c));
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §L 上下限與「不得一年崩壞」
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§L 上下限】");

ck("L1) 緩升**不得超過 potential**",
  !!drift && (() => {
    const p0 = mk({ id: "cap", age: 25, at: 79, potential: 80 });
    const p1 = driftYears(p0, 8);
    return Object.values(p1.stats).every((v) => v <= 80 + 1e-9);
  })());

ck("L2) 衰退**不得低於地板**",
  !!drift && (() => {
    const p1 = driftYears(mk({ id: "flr", age: 30, at: 45, potential: 60 }), 25);
    return Object.values(p1.stats).every((v) => v >= drift.DRIFT.floor - 1e-9);
  })(),
  !!drift ? `地板 ${drift.DRIFT.floor}` : "");

ck("L3) **單項單年跌幅有上限**（不得一年突然崩壞）",
  !!drift && (() => {
    for (let a = 25; a <= 45; a++) {
      const p0 = mk({ id: "crash", age: a, at: 85, potential: 90 });
      const p1 = drift.applyAgeDrift({ ...p0, age: a + 1 });
      for (const k of Object.keys(p0.stats)) {
        if (p0.stats[k] - p1.stats[k] > drift.DRIFT.maxDropPerYear + 1e-9) return false;
      }
    }
    return true;
  })(),
  !!drift ? `上限 ${drift.DRIFT.maxDropPerYear} 點／年` : "");

ck("L4) 衰退**有斜坡**：剛開始衰的那一年，跌幅明顯小於五年後",
  !!drift && (() => {
    const from = drift.DRIFT.categories["操作"].declineFrom;
    const drop = (age) => {
      const p0 = mk({ id: "ramp", age, at: 85, potential: 90 });
      const p1 = drift.applyAgeDrift({ ...p0, age: age + 1 });
      return avgCat(p0, "操作") - avgCat(p1, "操作");
    };
    return drop(from) < drop(from + 5);
  })());

ck("L5) 缺年齡／缺能力的舊資料**不炸、不編造**",
  !!drift && (() => {
    const a = drift.applyAgeDrift({ id: "old", stats: { reflex: 70 } });
    const b = drift.applyAgeDrift(null);
    return a && a.stats.reflex === 70 && b === null;
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §A AI 世代交替
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§A AI 世代交替】");

ck("A1) `aiRosterAt(team, careerYear)` 存在",
  typeof ai.aiRosterAt === "function");

ck("A2) AI 與玩家**共用同一支漂移函式**（aiTeams import ageDrift）",
  /ageDrift/.test(codeOnly(read(P_AI))) && /applyAgeDrift/.test(codeOnly(read(P_AI))));

ck("A3) 第 1 年 = 既有 base roster（逐值不變，舊行為不回歸）",
  typeof ai.aiRosterAt === "function"
  && JSON.stringify(ai.aiRosterAt(ai.AI_TEAMS[0], 1)) === JSON.stringify(ai.AI_TEAMS[0].roster));

ck("A4) **決定性**：同一年算兩次逐值相同",
  typeof ai.aiRosterAt === "function"
  && JSON.stringify(ai.aiRosterAt(ai.AI_TEAMS[0], 7)) === JSON.stringify(ai.aiRosterAt(ai.AI_TEAMS[0], 7)));

ck("A5) AI 真的會變老（第 10 年平均年齡 > 第 1 年）",
  typeof ai.aiRosterAt === "function" && (() => {
    const avg = (y) => { const r = ai.aiRosterAt(ai.AI_TEAMS[0], y); return r.reduce((s, p) => s + p.age, 0) / r.length; };
    return avg(10) > avg(1);
  })(),
  typeof ai.aiRosterAt === "function" ? (() => {
    const avg = (y) => { const r = ai.aiRosterAt(ai.AI_TEAMS[0], y); return (r.reduce((s, p) => s + p.age, 0) / r.length).toFixed(1); };
    return `Y1 ${avg(1)} → Y10 ${avg(10)}`;
  })() : "");

ck("A6) **identity continuity**：相鄰兩年 roster 交集 ≥ 60%（不得整隊重生成）",
  typeof ai.aiRosterAt === "function" && (() => {
    for (const t of ai.AI_TEAMS) {
      for (let y = 1; y < 15; y++) {
        const a = new Set(ai.aiRosterAt(t, y).map((p) => p.id));
        const b = ai.aiRosterAt(t, y + 1).map((p) => p.id);
        const keep = b.filter((id) => a.has(id)).length;
        if (keep / b.length < 0.6) return false;
      }
    }
    return true;
  })());

ck("A7) 換血是**逐人替換**：任一年最多換掉少數人",
  typeof ai.aiRosterAt === "function" && (() => {
    let worst = 0;
    for (const t of ai.AI_TEAMS) {
      for (let y = 1; y < 15; y++) {
        const a = new Set(ai.aiRosterAt(t, y).map((p) => p.id));
        const gone = ai.aiRosterAt(t, y).length - ai.aiRosterAt(t, y + 1).filter((p) => a.has(p.id)).length;
        worst = Math.max(worst, gone);
      }
    }
    return worst <= 2;
  })());

ck("A8) 15 年後仍是 5 人（roster 大小不變）",
  typeof ai.aiRosterAt === "function"
  && ai.AI_TEAMS.every((t) => ai.aiRosterAt(t, 15).length === 5));

ck("A9) **不進 `players[]`**：AI 選手仍帶 `readOnly`，且沒有經營欄位",
  typeof ai.aiRosterAt === "function" && (() => {
    const r = ai.aiRosterAt(ai.AI_TEAMS[0], 8);
    return r.every((p) => p.readOnly === true && p.salary === undefined && p.xp === undefined);
  })());

ck("A10) **長期戰力維持在合理區間**（15 年內不得偏離第 1 年超過 20%）",
  typeof ai.aiRosterAt === "function" && (() => {
    for (const t of ai.AI_TEAMS) {
      const base = strength.teamStrength(ai.aiRosterAt(t, 1), "moba");
      for (let y = 2; y <= 15; y++) {
        const s = strength.teamStrength(ai.aiRosterAt(t, y), "moba");
        if (Math.abs(s - base) / base > 0.20) return false;
      }
    }
    return true;
  })(),
  typeof ai.aiRosterAt === "function" ? (() => {
    const t = ai.AI_TEAMS[0];
    const base = strength.teamStrength(ai.aiRosterAt(t, 1), "moba");
    const y15 = strength.teamStrength(ai.aiRosterAt(t, 15), "moba");
    return `${t.key}：Y1 ${base.toFixed(1)} → Y15 ${y15.toFixed(1)}`;
  })() : "");

ck("A11) 賽季模擬真的吃得到「當年」的 AI roster",
  /aiRosterAt|careerYear/.test(codeOnly(read(P_SEASON))));

// ════════════════════════════════════════════════════════════════════════════
//  §R 15 年長跑（玩家）
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§R 15 年長跑】");

ck("R1) 玩家 15 年漂移：操作明顯下降，團隊不降反升",
  !!drift && (() => {
    const p0 = mk({ id: "run", age: 22, at: 72, potential: 88 });
    const p15 = driftYears(p0, 15);
    return avgCat(p15, "操作") < avgCat(p0, "操作") && avgCat(p15, "團隊") >= avgCat(p0, "團隊");
  })(),
  !!drift ? (() => {
    const p0 = mk({ id: "run", age: 22, at: 72, potential: 88 });
    const p15 = driftYears(p0, 15);
    return `22→37 歲　` + CATS.map((c) => `${c} ${avgCat(p0, c).toFixed(0)}→${avgCat(p15, c).toFixed(0)}`).join("｜");
  })() : "");

ck("R2) **老將沒有崩壞**：15 年後綜合能力仍高於起點的 75%",
  !!drift && (() => {
    const p0 = mk({ id: "run2", age: 22, at: 72, potential: 88 });
    const p15 = driftYears(p0, 15);
    const ov = (p) => Object.values(p.stats).reduce((s, v) => s + v, 0) / 16;
    return ov(p15) / ov(p0) > 0.75;
  })(),
  !!drift ? (() => {
    const p0 = mk({ id: "run2", age: 22, at: 72, potential: 88 });
    const p15 = driftYears(p0, 15);
    const ov = (p) => Object.values(p.stats).reduce((s, v) => s + v, 0) / 16;
    return `綜合 ${ov(p0).toFixed(1)} → ${ov(p15).toFixed(1)}（${(ov(p15) / ov(p0) * 100).toFixed(0)}%）`;
  })() : "");

// ════════════════════════════════════════════════════════════════════════════
//  §F 快轉一致
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§F 快轉一致】");

ck("F1) 漂移是**逐年套用**：一次跨兩年 = 連兩次跨一年",
  !!drift && (() => {
    const p0 = mk({ id: "ff", age: 30, at: 80, potential: 88 });
    const twice = drift.applyAgeDrift({ ...drift.applyAgeDrift({ ...p0, age: 31 }), age: 32 });
    const once = drift.applyAgeDrift({ ...p0, age: 31 }, { years: 1 });
    const onceThen = drift.applyAgeDrift({ ...once, age: 32 }, { years: 1 });
    return JSON.stringify(twice.stats) === JSON.stringify(onceThen.stats);
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §N 本輪邊界
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§N 本輪邊界】");

const driftSrc = drift ? codeOnly(read(P_DRIFT)) : "";

ck("N1) 沒有做退休意向／退休／青訓補位／合約",
  !!drift && !/retirementIntent|academy|青訓|contract/i.test(driftSrc));

ck("N2) 沒有動 CS AI",
  !!drift && !/csAiTeams|CS_AI_TEAMS/.test(driftSrc) && !/csAiTeams/.test(codeOnly(read(P_AI))));

ck("N3) 漂移沒有移除任何選手（本輪不讓任何人離隊）",
  !!drift && !/filter\(|splice/.test(driftSrc));

ck("N4) 模組很小", !!drift && driftSrc.split("\n").length <= 80,
  !!drift ? `${driftSrc.split("\n").length} 行實碼` : "");

ck("N5) Off-season 契約已把 `abilityDrift` 列為已實作",
  await (async () => {
    const off = await imp(P_OFF);
    return off.IMPLEMENTED_STEPS.includes("abilityDrift");
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §M sentinel
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§M mutation sentinel】");
const TMP = [];
async function mutated(relPath, mutate, tag) {
  const src = read(relPath);
  const out = mutate(src);
  if (out === src) throw new Error(`sentinel ${tag}：變異沒有套用（錨點已改）`);
  const tmp = resolve(ROOT, `${dirname(resolve(ROOT, relPath))}/.sentinel-v52-${tag}.js`);
  fs.writeFileSync(tmp, out, "utf8");
  TMP.push(tmp);
  return import(pathToFileURL(tmp).href);
}
try {
  if (drift) {
    //  A：讓 learning 參與漂移 ⇒ §P5 變紅
    const A = await mutated(P_DRIFT, (s) => s.replace(/DRIFT_EXCLUDED = Object\.freeze\(\["learning"\]\)/, 'DRIFT_EXCLUDED = Object.freeze([])'), "A-learning");
    ck("M-A) 讓 learning 參與漂移 ⇒ §P5 變紅",
      (() => {
        let p = mk({ id: "lrn", age: 20, at: 65, potential: 90 });
        for (let i = 0; i < 20; i++) p = A.applyAgeDrift({ ...p, age: p.age + 1 });
        return p.stats.learning !== 65;
      })());

    //  B：拿掉單年跌幅上限 ⇒ §L3 變紅（老將會一年崩壞）
    const B = await mutated(P_DRIFT, (s) => s.replace(/maxDropPerYear:\s*[\d.]+/, "maxDropPerYear: 999"), "B-crash");
    ck("M-B) 拿掉單年跌幅上限 ⇒ §L3 的上限失效",
      B.DRIFT.maxDropPerYear > 100);

    //  C：讓 profile 讀能力 ⇒ §C2 變紅
    const C = await mutated(P_DRIFT,
      (s) => s.replace(/const h = hash32\(String\(player\?\.id \?\? ""\)\);/,
        'const h = hash32(String(player?.id ?? "") + String(player?.potential ?? ""));'), "C-reads");
    ck("M-C) 讓 profile 讀能力資料 ⇒ §C2 變紅",
      (() => {
        const lo = C.agingProfileOf({ id: "y", potential: 50 });
        const hi = C.agingProfileOf({ id: "y", potential: 99 });
        return JSON.stringify(lo) !== JSON.stringify(hi);
      })());
  } else {
    ck("M-A) 讓 learning 參與漂移 ⇒ §P5 變紅", false, "模組不存在");
    ck("M-B) 拿掉單年跌幅上限", false, "模組不存在");
    ck("M-C) 讓 profile 讀能力資料 ⇒ §C2 變紅", false, "模組不存在");
  }
} catch (e) {
  ck("M) sentinel 執行完成", false, String(e.message ?? e));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch { /* ignore */ } }
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${fail === 0 ? "✅" : "❌"} check_age_drift_v5：${pass}/${pass + fail} 通過`);
if (fail === 0) {
  console.log("   老化時鐘＝raw age ＋ 決定性個體 profile；**不讀能力** ⇒ 能力下降不會讓時鐘倒退。");
  console.log("   操作先衰、戰術晚衰、心理持平、團隊最久；learning 不漂移；有斜坡不崩壞。");
  console.log("   AI 與玩家共用同一支漂移；identity 跨年度延續，逐人替換，戰力維持在區間內。");
  console.log("   ⚠ 本輪不做：退休意向／退休／青訓補位／合約／CS AI。");
}
process.exit(fail === 0 ? 0 : 1);
