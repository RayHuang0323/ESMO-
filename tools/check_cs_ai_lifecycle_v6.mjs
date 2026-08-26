#!/usr/bin/env node
// ============================================================================
//  tools/check_cs_ai_lifecycle_v6.mjs — V6-1：CS AI 世代交替（與 MOBA 同一套核心）
//
//  執行：repo 根目錄 `node tools/check_cs_ai_lifecycle_v6.mjs`；失敗 exit 1。
//
//  ── 一個要先更正的前提 ────────────────────────────────────────────────────
//  V5 設計文件寫「`csAiTeams` 完全沒有年齡欄位 ⇒ CS AI 老化列 V6」。
//  **那句話是錯的**（grep `age` 被 `courage` / `damage` 淹沒導致的誤判）。
//  實測：CS AI 40 名選手**全部都有 age**，範圍 18–28、平均 23.1。
//  ⇒ V6-1 不需要「建立年齡資料」，只需要把它接上既有的老化核心。
//
//  ── 紅線 ──────────────────────────────────────────────────────────────────
//  · **不得建立第二套 AgeDrift**：CS 與 MOBA 共用同一支 `applyAgeDrift`
//  · identity 跨年度延續，不得整隊重生成
//  · CS 的 `lineup`（f1–f5 → 選手 id）在換人之後必須仍然有效
//  · 長期戰力不得凍結不變，也不得漂走
//
//  §D 年齡資料　§C 契約與共用核心　§A 老化與換世代　§L lineup 完整性
//  §S 戰力穩定　§R 15 年長跑　§W 接線　§N 邊界　§M sentinel
// ============================================================================
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`✅ ${n}${d ? "　" + d : ""}`); }
  else { fail++; console.log(`❌ ${n}${d ? "　" + d : ""}`); }
};
const codeOnly = (src) => src.split(/\r?\n/)
  .filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

const P_CS = "src/data/csAiTeams.js";
const P_MOBA = "src/platform/competition/aiTeams.js";
const P_SEASON = "src/platform/competition/seasonState.js";

const cs = await imp(P_CS);
const moba = await imp(P_MOBA);
const drift = await imp("src/platform/progress/ageDrift.js");
const strength = await imp("src/platform/competition/teamStrength.js");
const csSrc = codeOnly(read(P_CS));
const has = typeof cs.csAiRosterAt === "function";
const at = (t, y) => (has ? cs.csAiRosterAt(t, y) : t.roster);

// ════════════════════════════════════════════════════════════════════════════
//  §D 年齡資料
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§D 年齡資料】");

ck("D1) CS AI 每一名選手都有合法年齡（V5 文件說「沒有」是誤判）",
  cs.CS_AI_TEAMS.every((t) => t.roster.every((p) => Number.isFinite(Number(p.age)) && p.age > 0)),
  `${cs.CS_AI_TEAMS.reduce((s, t) => s + t.roster.length, 0)} 名，0 缺`);

ck("D2) 年齡分布落在職業選手的合理區間（16–34）",
  cs.CS_AI_TEAMS.every((t) => t.roster.every((p) => p.age >= 16 && p.age <= 34)),
  (() => {
    const a = cs.CS_AI_TEAMS.flatMap((t) => t.roster.map((p) => p.age)).sort((x, y) => x - y);
    return `${a[0]}–${a[a.length - 1]}｜平均 ${(a.reduce((s, v) => s + v, 0) / a.length).toFixed(1)}`;
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §C 契約與共用核心
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§C 共用核心】");

ck("C1) 有 `csAiRosterAt(team, careerYear)`", has, has ? "" : "尚未實作");

ck("C2) **共用同一支 `applyAgeDrift`**（不得建立第二套 AgeDrift）",
  /ageDrift/.test(csSrc) && /applyAgeDrift/.test(csSrc));

ck("C3) **共用同一個離隊門檻**（沿用 MOBA 的 `AI_DEPARTURE`，不另訂一組）",
  /AI_DEPARTURE/.test(csSrc),
  `MOBA 門檻 agingAge ${moba.AI_DEPARTURE?.agingAgeFrom}`);

ck("C4) CS 檔內**沒有**自己的漂移／老化曲線（沒有第二套引擎）",
  !/declineFrom|risePerYear|declinePerYear|rampYears/.test(csSrc));

ck("C5) 第 1 年 = 既有 base roster（逐值不變，舊行為不回歸）",
  has && cs.CS_AI_TEAMS.every((t) => JSON.stringify(at(t, 1)) === JSON.stringify(t.roster)));

// ════════════════════════════════════════════════════════════════════════════
//  §A 老化與換世代
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§A 老化與換世代】");

ck("A1) **決定性**：同一年算兩次逐值相同",
  has && JSON.stringify(at(cs.CS_AI_TEAMS[0], 9)) === JSON.stringify(at(cs.CS_AI_TEAMS[0], 9)));

ck("A2) CS AI 真的會變老（第 8 年平均年齡 > 第 1 年）",
  has && (() => {
    const avg = (y) => { const r = at(cs.CS_AI_TEAMS[0], y); return r.reduce((s, p) => s + p.age, 0) / r.length; };
    return avg(8) > avg(1);
  })(),
  has ? (() => {
    const avg = (y) => { const r = at(cs.CS_AI_TEAMS[0], y); return (r.reduce((s, p) => s + p.age, 0) / r.length).toFixed(1); };
    return `Y1 ${avg(1)} → Y8 ${avg(8)}`;
  })() : "");

ck("A3) **能力真的有漂移**（不是只有年齡數字在變）",
  has && (() => {
    const a = at(cs.CS_AI_TEAMS[0], 1)[4], b = at(cs.CS_AI_TEAMS[0], 8).find((p) => p.id === a.id);
    return !!b && JSON.stringify(a.stats) !== JSON.stringify(b.stats);
  })());

ck("A4) **identity continuity**：相鄰兩年 roster 交集 ≥ 60%",
  has && cs.CS_AI_TEAMS.every((t) => {
    for (let y = 1; y < 15; y++) {
      const prev = new Set(at(t, y).map((p) => p.id));
      const now = at(t, y + 1);
      if (now.filter((p) => prev.has(p.id)).length / now.length < 0.6) return false;
    }
    return true;
  }));

ck("A5) 換血是**逐人替換**（任一年最多換 2 人）",
  has && (() => {
    let worst = 0;
    for (const t of cs.CS_AI_TEAMS) {
      for (let y = 1; y < 15; y++) {
        const prev = new Set(at(t, y).map((p) => p.id));
        worst = Math.max(worst, at(t, y + 1).filter((p) => !prev.has(p.id)).length);
      }
    }
    return worst <= 2;
  })());

ck("A6) 15 年後仍是 5 人",
  has && cs.CS_AI_TEAMS.every((t) => at(t, 15).length === 5));

ck("A7) 15 年內**真的有人換掉**（世代交替不是空談）",
  has && cs.CS_AI_TEAMS.some((t) => {
    const base = new Set(t.roster.map((p) => p.id));
    return at(t, 15).some((p) => !base.has(p.id));
  }));

//  ⚠ 要看**他出現的那一年**——新人之後每年也會跟著變老，
//    到第 15 年當然已經不年輕了。用「相鄰兩年的新面孔」才問得對。
ck("A8) 新人**在他出現的那一年**是年輕人，且帶得出 CS 定位",
  has && (() => {
    for (const t of cs.CS_AI_TEAMS) {
      for (let y = 2; y <= 15; y++) {
        const prev = new Set(at(t, y - 1).map((p) => p.id));
        for (const p of at(t, y)) {
          if (prev.has(p.id)) continue;
          if (!(p.age <= 22) || !cs.CS_AI_ROLES.includes(p.csRole ?? p.role)) return false;
        }
      }
    }
    return true;
  })());

ck("A9) **不進 `players[]`**：仍帶 `readOnly`，沒有經營欄位",
  has && at(cs.CS_AI_TEAMS[0], 12).every((p) => p.readOnly === true && p.salary === undefined));

// ════════════════════════════════════════════════════════════════════════════
//  §L lineup 完整性（CS 專屬：MOBA 沒有這個結構）
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§L lineup 完整性】");

ck("L1) 有 `csAiLineupAt(team, careerYear)`（換人後 lineup 必須跟著更新）",
  typeof cs.csAiLineupAt === "function");

ck("L2) **任何年度的 lineup 五個席位都指向該年度真的存在的選手**",
  typeof cs.csAiLineupAt === "function" && cs.CS_AI_TEAMS.every((t) => {
    for (let y = 1; y <= 15; y++) {
      const ids = new Set(at(t, y).map((p) => p.id));
      const lu = cs.csAiLineupAt(t, y);
      const seats = Object.values(lu);
      if (seats.length !== 5 || seats.some((id) => !id || !ids.has(id))) return false;
    }
    return true;
  }));

ck("L3) 第 1 年的 lineup 與既有 `team.lineup` 逐值相同",
  typeof cs.csAiLineupAt === "function"
  && cs.CS_AI_TEAMS.every((t) => JSON.stringify(cs.csAiLineupAt(t, 1)) === JSON.stringify(t.lineup)));

// ════════════════════════════════════════════════════════════════════════════
//  §S 戰力：不得凍結、也不得漂走
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§S 戰力穩定】");

const sOf = (t, y) => strength.teamStrength(at(t, y), "cs");

ck("S1) 15 年內戰力**不得偏離第 1 年超過 20%**",
  has && cs.CS_AI_TEAMS.every((t) => {
    const base = sOf(t, 1);
    for (let y = 2; y <= 15; y++) if (Math.abs(sOf(t, y) - base) / base > 0.20) return false;
    return true;
  }),
  has ? cs.CS_AI_TEAMS.slice(0, 3).map((t) => `${t.key} ${sOf(t, 1).toFixed(0)}→${sOf(t, 15).toFixed(0)}`).join("｜") : "");

ck("S2) 戰力**不得凍結不變**（15 年至少要有變化）",
  has && cs.CS_AI_TEAMS.every((t) => Math.abs(sOf(t, 15) - sOf(t, 1)) > 0.01));

ck("S3) **隊伍之間的強弱排序大致維持**（強隊不會變成最弱）",
  has && (() => {
    const rank = (y) => [...cs.CS_AI_TEAMS].sort((a, b) => sOf(b, y) - sOf(a, y)).map((t) => t.key);
    const r1 = rank(1), r15 = rank(15);
    //  第 1 年最強的隊，15 年後不得掉到後半段
    return r15.indexOf(r1[0]) < cs.CS_AI_TEAMS.length / 2;
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §R 15 年長跑（MOBA / CS 對照）
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§R 15 年長跑：MOBA / CS 對照】");

ck("R1) 兩邊都會老（15 年平均年齡曲線都不是平的）",
  has && (() => {
    const csAvg = (y) => at(cs.CS_AI_TEAMS[0], y).reduce((s, p) => s + p.age, 0) / 5;
    const mbAvg = (y) => moba.aiRosterAt(moba.AI_TEAMS[0], y).reduce((s, p) => s + p.age, 0) / 5;
    return csAvg(7) > csAvg(1) && mbAvg(7) > mbAvg(1);
  })(),
  has ? (() => {
    const csAvg = (y) => (at(cs.CS_AI_TEAMS[0], y).reduce((s, p) => s + p.age, 0) / 5).toFixed(1);
    const mbAvg = (y) => (moba.aiRosterAt(moba.AI_TEAMS[0], y).reduce((s, p) => s + p.age, 0) / 5).toFixed(1);
    return `CS Y1 ${csAvg(1)}→Y7 ${csAvg(7)}→Y15 ${csAvg(15)}｜MOBA Y1 ${mbAvg(1)}→Y7 ${mbAvg(7)}→Y15 ${mbAvg(15)}`;
  })() : "");

ck("R2) 兩邊都有換血（15 年後都不是原班人馬）",
  has && (() => {
    const csTurn = cs.CS_AI_TEAMS.some((t) => { const b = new Set(t.roster.map((p) => p.id)); return at(t, 15).some((p) => !b.has(p.id)); });
    const mbTurn = moba.AI_TEAMS.some((t) => { const b = new Set(t.roster.map((p) => p.id)); return moba.aiRosterAt(t, 15).some((p) => !b.has(p.id)); });
    return csTurn && mbTurn;
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §W 接線
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§W 賽季接線】");

ck("W1) `rostersFor` 對 CS 也用**當年**的 roster（不再固定回 base）",
  /csAiRosterAt/.test(codeOnly(read(P_SEASON))));

ck("W2) MOBA 那一側沒有被改壞（仍用 `aiRosterAt`）",
  /aiRosterAt\(/.test(codeOnly(read(P_SEASON))));

// ════════════════════════════════════════════════════════════════════════════
//  §N 邊界
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§N 本輪邊界】");

ck("N1) 沒有動玩家 Lifecycle（CS 檔沒有 retirement / 青訓）",
  !/retirement|academy|青訓/i.test(csSrc));

ck("N2) 沒有動 Training / PCGM",
  !/trainingCalculator|careerGrowth|calculateTrainingResult/.test(csSrc));

ck("N3) 沒有碰真人 Ranked / ServerTime",
  !/ranked|serverTime|Date\.now/i.test(csSrc));

ck("N4) `ageEfficiency` 曲線逐值不變",
  await (async () => {
    const t = await imp("src/data/trainingCalculator.js");
    return [20, 28, 29, 34].map((a) => t.ageEfficiency(a)).join(",") === "1.1,0.98,0.87,0.32";
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
  const tmp = resolve(ROOT, `${dirname(resolve(ROOT, relPath))}/.sentinel-v61-${tag}.js`);
  fs.writeFileSync(tmp, out, "utf8");
  TMP.push(tmp);
  return import(pathToFileURL(tmp).href);
}
try {
  if (has) {
    //  A：改成每年整隊重生成 ⇒ §A4 identity 變紅
    const A = await mutated(P_CS, (s) => s.replace(/let roster = team\?\.roster \?\? \[\];/, "let roster = (team?.roster ?? []).map((p, i) => ({ ...p, id: `regen:${i}:${Math.random()}` }));"), "A-regen");
    ck("M-A) 改成每年重生成 identity ⇒ §A4 變紅",
      (() => {
        const t = cs.CS_AI_TEAMS[0];
        const prev = new Set(A.csAiRosterAt(t, 3).map((p) => p.id));
        return A.csAiRosterAt(t, 4).filter((p) => prev.has(p.id)).length / 5 < 0.6;
      })());

    //  B：拿掉離隊 ⇒ §A7 變紅（沒有人會被換掉，世界凍結）
    const B = await mutated(P_CS, (s) => s.replace(/agingAgeOf\(p\) < AI_DEPARTURE\.agingAgeFrom/, "true"), "B-nodepart");
    ck("M-B) 拿掉離隊判定 ⇒ §A7 變紅（15 年仍是原班人馬）",
      cs.CS_AI_TEAMS.every((t) => {
        const base = new Set(t.roster.map((p) => p.id));
        return B.csAiRosterAt(t, 15).every((p) => base.has(p.id));
      }));
  } else {
    ck("M-A) 改成每年重生成 identity ⇒ §A4 變紅", false, "尚未實作");
    ck("M-B) 拿掉離隊判定 ⇒ §A7 變紅", false, "尚未實作");
  }
} catch (e) {
  ck("M) sentinel 執行完成", false, String(e.message ?? e));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch { /* ignore */ } }
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${fail === 0 ? "✅" : "❌"} check_cs_ai_lifecycle_v6：${pass}/${pass + fail} 通過`);
if (fail === 0) {
  console.log("   CS 與 MOBA 共用**同一支** `applyAgeDrift` 與同一個離隊門檻——沒有第二套 aging engine。");
  console.log("   identity 跨年度延續、逐人替換；lineup 在換人之後仍然五席有效；戰力不凍結也不漂走。");
}
process.exit(fail === 0 ? 0 : 1);
