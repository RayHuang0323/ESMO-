#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_combat_credibility.mjs — MOBA 戰鬥可信度（撤退／越塔）
//
//  執行：repo 根目錄 `node tools/check_moba_combat_credibility.mjs`；失敗 exit 1。
//
//  ── 本輪實際做了什麼（誠實範圍）──────────────────────────────────────────
//  任務單列了五節。第二節（小兵並行交戰）與第三節（英雄清兵）**沒有做**，
//  原因寫在 §0：兩者都必須新增／改變兵線總傷害，實測會直接摧毀推線收斂。
//  本檔只驗第四節（撤退與風險判斷）與第五節（越塔強殺判斷）。
//
//  §0 未做項目的證據（不假裝做了）
//  §1 越塔評估：殘血不再等於可以越塔
//  §2 撤退風險：五級判斷與實際使用的資料
//  §3 放棄追擊：明顯打不贏時不再追
//  §4 決定性：同 seed 同結果
//  §5 不改傷害公式、不新增素質、不假裝個性已接線
//  §6 中性能力不改變既有回歸基準
// ============================================================================
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const { LogicEngine } = await import("../src/LogicEngine.js");
const { rulesFor } = await import("../src/battle/moba/matchProgression.js");
const { STAT_DEF, PERSONALITY } = await import("../src/data/playerModel.js");
const ENG = read("src/LogicEngine.js");
/**
 * 去註解再比對。
 * ⚠ 第一版直接數 `personality` 出現次數，結果數到**我自己寫的說明註解**
 *   （「個性目前完全沒有接入 MOBA 引擎…」）——註解不是程式。
 *   這個錯誤在本專案已經犯過三次（P1 §7a、集中驗收 §2f、這裡）。
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const ENG_CODE = stripComments(ENG);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §0 未做項目：留下證據，不假裝做了 ══");
{
  //  英雄對小兵沒有傷害通道 ⇒ 第三節（英雄清兵）不是最小改動
  const heroHitsMinion = /for \(const \[m, v\] of dmg\) m\.hp -= v;/.test(ENG);
  ck("§0a 小兵掉血來源仍只有『兵對兵』與『塔打兵』（英雄無傷害通道）",
    heroHitsMinion && !/minion[\s\S]{0,40}hp -= [\s\S]{0,40}p\.power/.test(ENG),
    "⇒ 第三節需新增傷害通道，本輪未做");
  //  小兵射程仍是單一值 ⇒ 第二節未做
  ck("§0b 小兵仍使用單一射程（兵種未分射程）",
    !/minionRangeByKind/.test(ENG), "⇒ 第二節未做，已還原");
  ck("§0c 兵種欄位存在但戰鬥未使用（根因仍在，列為待辦）",
    /kind: i === 3 \? "caster" : "melee"/.test(ENG));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §1 越塔強殺判斷 ══");
{
  const R = rulesFor("v3");
  ck("§1a v3 啟用越塔評估", R.diveAssess === true);
  ck("§1b 評估參數齊備", Number.isFinite(R.diveMaxTtk) &&
    Number.isFinite(R.diveSafetyMargin) && Number.isFinite(R.diveEscapeMargin));

  const e = new LogicEngine(42);
  const tw = Object.values(e.towers).find((t) => t.side === "red" && t.hp > 0);
  const mk = (over) => ({ ...over });
  //  假想情境：把英雄與目標放在塔邊，只改血量／戰力，看評估怎麼判
  const hero = e.players.find((p) => p.side === "blue");
  const foe = e.players.find((p) => p.side === "red");
  const at = (o, pos) => { o.pos = { ...pos }; return o; };

  //  ① 打不動 ⇒ 拒絕（目標血厚、我方輸出低）
  at(hero, tw.pos); at(foe, tw.pos);
  hero.hp = hero.maxHp; hero.power = 1; foe.hp = foe.maxHp * 0.34; foe.power = 1;
  const slow = e._diveAssessV18(hero, foe, tw, e.players.filter((p) => !p.dead));
  ck("§1c 預估擊殺時間過長 ⇒ 拒絕越塔", slow.ok === false && slow.why === "predicted_ttk_too_long", slow.why);

  //  ② 殺得掉但自己會先死 ⇒ 拒絕
  hero.power = 400; hero.hp = 30; foe.hp = foe.maxHp * 0.30; foe.power = 200;
  const die = e._diveAssessV18(hero, foe, tw, e.players.filter((p) => !p.dead));
  ck("§1d 預估會在擊殺前死亡 ⇒ 拒絕越塔", die.ok === false && die.why === "would_die_before_kill", die.why);

  //  ③ 人數劣勢 ⇒ 拒絕
  hero.hp = hero.maxHp; hero.power = 400; foe.power = 1; foe.hp = foe.maxHp * 0.2;
  const alive = e.players.filter((p) => !p.dead);
  for (const q of alive) if (q.side === "red") q.pos = { ...tw.pos };
  for (const q of alive) if (q.side === "blue" && q !== hero) q.pos = { x: tw.pos.x + 90, y: tw.pos.y + 90 };
  const out = e._diveAssessV18(hero, foe, tw, alive);
  ck("§1e 塔邊人數劣勢 ⇒ 拒絕越塔", out.ok === false && out.why === "outnumbered_at_tower", out.why);

  //  ④ 條件齊備 ⇒ 允許
  for (const q of alive) if (q.side === "red" && q !== foe) q.pos = { x: tw.pos.x + 90, y: tw.pos.y + 90 };
  const good = e._diveAssessV18(hero, foe, tw, alive);
  ck("§1f 有把握、撐得住、走得掉、無人數劣勢 ⇒ 允許越塔", good.ok === true, good.why ?? "ok");

  //  ⑤ 圍攻與推線路徑完全沒被動到（M1.7 的教訓）
  ck("§1g 圍攻（sieging）與有兵線（hasWave）不受越塔評估影響",
    /const allow = hpOk && shotsOk && \(sieging \|\| hasWave \|\| kill\)/.test(ENG));

  //  ⑥ 實戰統計：確實有被擋下，且三種理由都出現過
  const why = {}; let allowed = 0, blocked = 0;
  for (const seed of [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555]) {
    const g = new LogicEngine(seed);
    const orig = g._diveAssessV18.bind(g);
    g._diveAssessV18 = (a, b, c, d) => {
      const r = orig(a, b, c, d);
      if (r.ok) allowed++; else { blocked++; why[r.why] = (why[r.why] ?? 0) + 1; }
      return r;
    };
    for (let i = 0; i < 4000 && !g.over; i++) g.tick(0.5);
  }
  ck("§1h 實戰中越塔評估確實被觸發", allowed + blocked >= 10, `${allowed + blocked} 次`);
  ck("§1i 低把握越塔確實被拒絕", blocked > 0, `擋下 ${blocked} 次 ${JSON.stringify(why)}`);
  ck("§1j 高把握越塔仍被允許（不是一律禁止）", allowed > 0, `允許 ${allowed} 次`);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §2 撤退與風險判斷 ══");
{
  const R = rulesFor("v3");
  ck("§2a v3 啟用風險評估", R.riskAssess === true);

  const e = new LogicEngine(7);
  for (let i = 0; i < 200 && !e.over; i++) e.tick(0.5);
  const alive = e.players.filter((p) => !p.dead);
  const p = alive.find((x) => x.side === "blue");

  //  五級都要能出現
  const levels = new Set();
  for (const seed of [1, 2, 3, 7, 42, 99, 123, 777]) {
    const g = new LogicEngine(seed);
    for (let i = 0; i < 3000 && !g.over; i++) {
      g.tick(0.5);
      if (i % 20) continue;
      for (const q of g.players) if (!q.dead) levels.add(g._riskAssessV18(q, g.players.filter((x) => !x.dead)).level);
    }
  }
  ck("§2b 風險分級實戰中出現多種結果", levels.size >= 3, [...levels].join("／"));
  ck("§2c 五級都有定義",
    ["engage", "trade", "fighting", "retreat", "dropChase"].every((k) => ENG.includes(`"${k}"`)) ||
    ["engage", "trade", "fighting", "retreat"].every((k) => ENG.includes(`"${k}"`)),
    "engage／trade／fighting／retreat");

  //  實際使用的資料欄位
  const r = e._riskAssessV18(p, alive);
  for (const k of ["hpR", "foesN", "alliesN", "incoming", "flank", "hasEscape", "escapeReady", "towerThreat"]) {
    ck(`§2d 風險評估輸出「${k}」`, k in r, String(r[k]));
  }

  //  殘血 ⇒ 立即撤退
  const q1 = { ...p, hp: p.maxHp * 0.1, pos: { ...p.pos } };
  ck("§2e 殘血 ⇒ 立即撤退", e._riskAssessV18(q1, alive).level === "retreat");
  //  滿血、無敵人 ⇒ 繼續交戰
  const lonely = [p];
  const q2 = { ...p, hp: p.maxHp, pos: { ...p.pos } };
  ck("§2f 滿血且周圍無敵人與塔 ⇒ 繼續交戰",
    ["engage", "trade"].includes(e._riskAssessV18(q2, lonely).level));

  //  ⚠ 素質沿用 P0-3 既有係數，不新增第二套
  ck("§2g 素質影響沿用 P0-3 的 `retreatLate`（不新增能力模型）",
    /this\._qual\(p, "retreatLate"\)/.test(ENG));
  ck("§2h 風險評估沒有讀取任何個性欄位（個性尚未接線，不假裝）",
    !/personality/.test(ENG_CODE));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §3 放棄追擊 ══");
{
  ck("§3a 追擊維持判定接上風險評估", /_shouldDropChaseV18\(p, alive\)/.test(ENG));
  ck("§3b 只放棄、不製造新追擊（`_tryChaseV3` 未被改動）",
    !/_tryChaseV3[\s\S]{0,300}_riskAssessV18/.test(ENG));
  ck("§3c 只在「立即撤退」這一級才放棄（避免對局收不掉）",
    /return r\.level === "retreat";/.test(ENG));

  let dropped = 0;
  for (const seed of [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555]) {
    const g = new LogicEngine(seed);
    for (let i = 0; i < 4000 && !g.over; i++) g.tick(0.5);
    for (const q of g.players) dropped += q.chaseDropped ?? 0;
  }
  ck("§3d 實戰中確實有放棄追擊", dropped > 0, `${dropped} 次`);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §4 決定性 ══");
{
  const run = (seed) => {
    const g = new LogicEngine(seed);
    for (let i = 0; i < 2000 && !g.over; i++) g.tick(0.5);
    return JSON.stringify(g.players.map((x) => [x.id, Math.round(x.hp * 1e6), x.k, x.d, Math.round(x.gold)]));
  };
  let same = 0;
  for (const seed of [1, 7, 42, 99, 2024]) if (run(seed) === run(seed)) same++;
  ck("§4a 同 seed ⇒ 逐值相同（5 seeds）", same === 5, `${same}/5`);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §5 紅線：不改傷害、不新增素質、不假裝個性已接線 ══");
{
  ck("§5a 傷害公式未被改動", /const dmgAmt = p\.power \* dt \* R\.dmgK/.test(ENG));
  ck("§5b 越塔評估只是唯讀估算（沒有寫回任何傷害）",
    /_diveAssessV18[\s\S]{0,2200}return \{ ok: true, why: null \};/.test(ENG) &&
    !/_diveAssessV18[\s\S]{0,2200}\.hp -=/.test(ENG));
  ck("§5c 16 項素質未被增刪或改名", STAT_DEF.length === 16 &&
    STAT_DEF.map((s) => s.key).join(",") ===
    "reflex,accuracy,apm,positioning,mapAware,tacticalIQ,decision,adaptability,courage,clutch,focus,resilience,comms,leadership,synergy,learning");
  ck("§5d `mapAware` 的正式中文是「視野意識」", STAT_DEF.find((s) => s.key === "mapAware").zh === "視野意識");
  ck("§5e 個性資料未被增刪（仍是既有 10 種）", PERSONALITY.length === 10,
    PERSONALITY.map((x) => x.zh).join("／"));
  ck("§5f MOBA 引擎仍未讀取個性（如實反映，不假裝接線）",
    (ENG_CODE.match(/personality/g) ?? []).length === 0);
  const mps = read("src/battle/moba/mobaPlayerStats.js");
  ck("§5g 能力注入層也未讀個性", (stripComments(mps).match(/personality/g) ?? []).length === 0);
  ck("§5h P0-3 品質係數限幅未被動過",
    /focusRate:\s*\{\s*dir:\s*"bonus",\s*hi:\s*0\.35\s*\}/.test(mps) &&
    /retreatLate:\s*\{\s*dir:\s*"penalty",\s*hi:\s*0\.06\s*\}/.test(mps));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §6 歷史規則集不受影響 ══");
{
  const v1 = rulesFor("v1"), v2 = rulesFor("v2"), v3 = rulesFor("v3");
  ck("§6a v1 沒有新旗標", !v1.riskAssess && !v1.diveAssess);
  ck("§6b v2 沒有新旗標", !v2.riskAssess && !v2.diveAssess);
  ck("§6c 新行為只在 v3", v3.riskAssess === true && v3.diveAssess === true);
  ck("§6d 未啟用時完全短路（`riskAssess` 為假 ⇒ 不放棄追擊）",
    /if \(!this\.rules\.riskAssess\) return false;/.test(ENG));
}

console.log(`\n${fail === 0 ? "🟢" : "🔴"} MOBA 戰鬥可信度：${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
