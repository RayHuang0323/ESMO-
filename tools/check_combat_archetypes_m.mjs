#!/usr/bin/env node
// ============================================================================
//  tools/check_combat_archetypes_m.mjs — Milestone M 基礎層安全網
//
//  本輪只交付**兩樣東西**，所以只驗這兩樣：
//    §1 Hero Combat Archetype Contract v1（100 位英雄的資料層）
//    §2 第五個 opt-in 行為層（configureArchetypes / _engageRange / _archPosition）
//
//  ⚠ 本輪**沒有**接進正式對戰流程。最重要的一條保證是：
//     **不呼叫 configureArchetypes ⇒ 引擎逐位元回到 main 基準。**
//     跨版本的比對沒辦法寫在單一檔案裡（那要同時載入兩份 LogicEngine），
//     所以那一條用 `git stash` 對照跑 SHA-256 摘要驗證，證據記在
//     `review/moba-runtime/milestone-m-foundation/` 的報告裡。
//     這裡驗的是**同一份程式碼內**可驗證的等價性質。
// ============================================================================
import { LogicEngine } from "../src/LogicEngine.js";
import { CHAMPIONS_100, heroById } from "../src/data/heroDatabase.js";
import { COMBAT_CLASSES } from "../src/data/heroCombatPresentation.js";
import {
  getHeroCombatArchetype, listArchetypeHeroIds, validateHeroCombatArchetypes,
  toEngineArchetypes, toEngineRange, isRanged,
  COMBAT_ARCHETYPE_CONTRACT_VERSION, ATTACK_TYPES, BASIC_ATTACK_STYLES,
  MOVEMENT_PROFILES, TARGETING_PROFILES, FORMATION_LINES, RANGED_DISPLAY_THRESHOLD,
} from "../src/data/heroCombatArchetypes.js";

let pass = 0, fail = 0;
const ck = (l, c, e = null) => { if (c) { pass++; console.log(`✅ ${l}`); } else { fail++; console.log(`❌ ${l}${e != null ? `　→ ${JSON.stringify(e)}` : ""}`); } };

console.log("── §1 Combat Archetype Contract v1 ──");
{
  ck(`1) 契約版本常數（${COMBAT_ARCHETYPE_CONTRACT_VERSION}）`,
    COMBAT_ARCHETYPE_CONTRACT_VERSION === "HeroCombatArchetype.v1");
  const ids = listArchetypeHeroIds();
  ck(`2) 100 位英雄全部解析得出契約（實測 ${ids.length}）`,
    ids.length === 100 && CHAMPIONS_100.every((c) => ids.includes(c.id)), ids.length);
  {
    const bad = [];
    for (const c of CHAMPIONS_100) {
      const a = getHeroCombatArchetype(c.id);
      if (!COMBAT_CLASSES.includes(a.combatClass)) bad.push([c.id, "combatClass", a.combatClass]);
      if (!ATTACK_TYPES.includes(a.attackType)) bad.push([c.id, "attackType", a.attackType]);
      if (!BASIC_ATTACK_STYLES.includes(a.basicAttackStyle)) bad.push([c.id, "style", a.basicAttackStyle]);
      if (!MOVEMENT_PROFILES.includes(a.movementProfile)) bad.push([c.id, "movement", a.movementProfile]);
      if (!TARGETING_PROFILES.includes(a.targetingProfile)) bad.push([c.id, "targeting", a.targetingProfile]);
      if (!FORMATION_LINES.includes(a.formationLine)) bad.push([c.id, "line", a.formationLine]);
    }
    ck("3) 每一位的 combatClass / attackType / style / movement / targeting / line 都合法",
      bad.length === 0, bad.slice(0, 6));
  }
  {
    const v = validateHeroCombatArchetypes();
    ck("4) 內建 validateHeroCombatArchetypes() 全綠", v.ok, v.errors.slice(0, 6));
    ck(`5) 近戰最大攻擊距離 ${v.meleeMax} < 遠程最小 ${v.rangedMin}（兩群不重疊）`,
      v.meleeMax < v.rangedMin, { meleeMax: v.meleeMax, rangedMin: v.rangedMin });
  }
  {
    //  attackType 必須由 heroDatabase.stats.range 推導，不是看定位——
    //  輔助裡的坦克（range 150）就該是近戰。
    const wrong = CHAMPIONS_100.filter((c) => {
      const want = c.stats.range >= RANGED_DISPLAY_THRESHOLD ? "ranged" : "melee";
      return getHeroCombatArchetype(c.id).attackType !== want;
    });
    ck("6) attackType 完全由 stats.range 推導（不是看定位）", wrong.length === 0,
      wrong.slice(0, 4).map((c) => [c.id, c.arch, c.stats.range]));
    const meleeSupports = CHAMPIONS_100.filter((c) => c.lane === "輔助" && c.stats.range < RANGED_DISPLAY_THRESHOLD);
    ck(`7) 輔助路的近戰英雄確實被判為 melee（實測 ${meleeSupports.length} 位）`,
      meleeSupports.length > 0 && meleeSupports.every((c) => !isRanged(c.id)),
      meleeSupports.slice(0, 3).map((c) => c.id));
  }
  ck("8) 換算式單調且夾在 [4.0, 8.6]",
    toEngineRange(150) === 4 && toEngineRange(550) === 8.4
    && toEngineRange(150) < toEngineRange(175) && toEngineRange(175) < toEngineRange(500)
    && toEngineRange(-999) >= 4 && toEngineRange(99999) <= 8.6,
    [150, 175, 500, 525, 550].map((d) => [d, toEngineRange(d)]));
  {
    //  近戰必須打得到野怪（野怪攻擊距離 3.2），否則打野會變成永遠搆不著
    const meleeMin = Math.min(...CHAMPIONS_100.filter((c) => !isRanged(c.id))
      .map((c) => getHeroCombatArchetype(c.id).baseAttackRange));
    ck(`9) 近戰最小攻擊距離 ${meleeMin} > 野怪攻擊距離 3.2`, meleeMin > 3.2, meleeMin);
  }
  ck("10) 近戰沒有假彈道、遠程都有彈道輪廓",
    CHAMPIONS_100.every((c) => {
      const a = getHeroCombatArchetype(c.id);
      return a.attackType === "melee" ? a.projectileProfile === null : !!a.projectileProfile;
    }));
  ck("11) 射手與法師的彈道輪廓不同（不是換顏色）",
    (() => {
      const mm = getHeroCombatArchetype("leiting").projectileProfile;
      const mg = getHeroCombatArchetype("bingshuang").projectileProfile;
      return mm.id !== mg.id && mm.speed !== mg.speed && mm.width !== mg.width;
    })(), {
      marksman: getHeroCombatArchetype("leiting").projectileProfile,
      mage: getHeroCombatArchetype("bingshuang").projectileProfile,
    });
  ck("12) 六職業的站位線位不是全部一樣",
    new Set(COMBAT_CLASSES.map((cls) => {
      const hero = CHAMPIONS_100.find((c) => getHeroCombatArchetype(c.id).combatClass === cls);
      return getHeroCombatArchetype(hero.id).formationLine;
    })).size >= 4);
  ck("13) 決定性：同一 heroId 連續三次呼叫連參考都相同",
    CHAMPIONS_100.every((c) => {
      const a = getHeroCombatArchetype(c.id);
      return a === getHeroCombatArchetype(c.id) && a === getHeroCombatArchetype(c.id);
    }));
  ck("14) 非法／原型鏈輸入回穩定 fallback，不 throw",
    (() => {
      for (const w of [undefined, null, 0, 42, "", "nope", "__proto__", "constructor", {}, []]) {
        try {
          const a = getHeroCombatArchetype(w);
          if (!a || a.source !== "fallback" || !ATTACK_TYPES.includes(a.attackType)) return false;
          if (a !== getHeroCombatArchetype(w)) return false;      // 參考也要穩定
        } catch { return false; }
      }
      return true;
    })());
  ck("15) 回傳資料凍結（拿到手也改不動）",
    (() => {
      const a = getHeroCombatArchetype("leiting");
      const before = JSON.stringify(a);
      try { a.baseAttackRange = 99; } catch { /* frozen */ }
      return Object.isFrozen(a) && JSON.stringify(getHeroCombatArchetype("leiting")) === before;
    })());
  ck("16) 沒有污染 heroDatabase（100 隻、沒有被塞新欄位）",
    CHAMPIONS_100.length === 100
    && CHAMPIONS_100.every((c) => !("attackType" in c) && !("baseAttackRange" in c)
      && !("formationLine" in c))
    && heroById("leiting").stats.range === 550);
  ck("17) 契約不含任何平衡結果欄位（damage/dps/winrate/cooldown…）",
    CHAMPIONS_100.every((c) => {
      const ks = Object.keys(getHeroCombatArchetype(c.id));
      return !ks.some((k) => /damage|dmg|dps|winrate|cooldown|accuracy/i.test(k));
    }));
  ck("18) 沒有亂數、沒有時間相依",
    !/Math\.random|Date\.now|performance\.now/.test(
      (await import("node:fs")).readFileSync("src/data/heroCombatArchetypes.js", "utf8")));
}

console.log("\n── §2 第五個 opt-in 行為層 ──");
{
  const roster = {
    b1: { heroId: "ironclad" }, b2: { heroId: "duskblade" }, b3: { heroId: "bingshuang" },
    b4: { heroId: "leiting" }, b5: { heroId: "dadi" },
  };
  const mods = toEngineArchetypes(roster);
  ck("19) Adapter 產出的形狀就是引擎要的欄位（引擎不認得 heroId）",
    Object.keys(mods).length === 5
    && ["engageRange", "preferredDistance", "chaseDistance", "retreatDistance",
      "formationLine", "attackType"].every((k) => k in mods.b1),
    mods.b1);
  ck("20) Adapter 吃得下 roster 的三種形狀",
    (() => {
      const m = toEngineArchetypes({
        a: { heroId: "leiting" }, b: { hero: { id: "leiting" } }, c: heroById("leiting"),
      });
      return m.a.engageRange === m.b.engageRange && m.b.engageRange === m.c.engageRange;
    })());
  {
    //  ⚠ 本層最重要的性質：不呼叫 = 舊行為。
    const off = new LogicEngine(42);
    ck("21) 未呼叫 configureArchetypes ⇒ 交戰距離維持舊的硬編碼 8",
      off._engageRange(off.players[0]) === 8 && off.archOn !== true);
    ck("22) 未呼叫時 _archPosition 原樣回傳目標點（一個位元都不動）",
      (() => {
        const tgt = { x: 12.5, y: 33.25 };
        const out = off._archPosition(off.players[0], tgt, off.players);
        return out === tgt;
      })());
  }
  {
    const on = new LogicEngine(42);
    on.configureArchetypes({ blue: mods, red: null, meta: null });
    const p1 = on.players.find((p) => p.id === "b1");   // ironclad 近戰
    const p4 = on.players.find((p) => p.id === "b4");   // leiting 遠程
    ck(`23) 呼叫後：近戰交戰距離 ${on._engageRange(p1)} < 遠程 ${on._engageRange(p4)}`,
      on._engageRange(p1) < on._engageRange(p4) && on._engageRange(p1) < 5
      && on._engageRange(p4) > 7, [on._engageRange(p1), on._engageRange(p4)]);
    ck("24) 沒有給原型的席位仍走舊行為（8）", on._engageRange(on.players.find((p) => p.id === "r1")) === 8);
    ck("25) _archPosition 是決定性的（同輸入兩次同輸出）",
      (() => {
        const tgt = { x: 100, y: 100 };
        const a = on._archPosition(p4, tgt, on.players);
        const b = on._archPosition(p4, tgt, on.players);
        return JSON.stringify(a) === JSON.stringify(b);
      })());
    //  ⚠ 附近沒有敵人時 _archPosition 是 identity（維持推線目標），那是正確行為，
    //     所以不能拿一個界外的 tgt 去驗夾邊界——第一版就是這樣自己判自己紅。
    //     這裡把敵人搬到身邊，讓它真的進入調整分支再驗。
    ck("26) 真的調整時，產出的點是有限值且落在地圖內",
      (() => {
        const foe = on.players.find((q) => q.side !== on.players[0].side);
        let checked = 0;
        for (const p of on.players.filter((q) => q.side === "blue")) {
          foe.pos.x = p.pos.x + 2; foe.pos.y = p.pos.y + 2;   // 貼到身邊 ⇒ 一定進調整分支
          const out = on._archPosition(p, { x: p.pos.x, y: p.pos.y }, on.players);
          if (out.x === p.pos.x && out.y === p.pos.y) continue;  // 沒調整就跳過
          checked++;
          if (!Number.isFinite(out.x) || !Number.isFinite(out.y)) return false;
          if (out.x < 0 || out.x > 220 || out.y < 0 || out.y > 220) return false;
        }
        return checked > 0;
      })());
  }
  {
    //  引擎不得 import 英雄資料（形狀由呼叫端準備，沿用既有 opt-in 慣例）
    const src = (await import("node:fs")).readFileSync("src/LogicEngine.js", "utf8");
    //  ⚠ 只看 import 敘述——註解裡寫「引擎不 import heroDatabase」不算違規
    //     （第一版用 includes 掃全文，把自己的說明文字判成違規）。
    const imports = src.split(/\r?\n/).filter((l) => /^\s*import\s/.test(l)).join("|");
    ck("27) LogicEngine 沒有 import 英雄資料（形狀全由呼叫端準備）",
      !/heroCombatArchetypes|heroDatabase|heroCombatPresentation/.test(imports), imports.slice(0, 200));
    //  M 基礎層時這條驗的是「尚未接線」；**M1 已接線**，所以反轉成
    //  「有接、而且只經 Adapter 接」——UI 不得自己拼形狀。
    const uls = (await import("node:fs")).readFileSync("src/useLocalServer.js", "utf8");
    ck("28) 原型層已接進正式流程的唯一計算點（useLocalServer）",
      uls.includes("configureArchetypes") && uls.includes("toEngineArchetypes"));
    ck("29) 只有 opts.roster 有值才呼叫（無名單 ⇒ 逐位元回到舊行為）",
      /opts\.roster \? toEngineArchetypes\(opts\.roster\) : null/.test(uls));
    {
      //  UI 不得直接拼原型資料：只有 Adapter 與引擎接線點可以碰
      const fs = await import("node:fs");
      const offenders = [];
      const walk = (dir) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          const q = `${dir}/${f.name}`;
          if (f.isDirectory()) { walk(q); continue; }
          if (!/\.jsx$/.test(f.name)) continue;
          if (fs.readFileSync(q, "utf8").includes("toEngineArchetypes")) offenders.push(q);
        }
      };
      walk("src");
      ck("30) 沒有任何 UI（.jsx）自己拼原型資料", offenders.length === 0, offenders);
    }
  }
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"}  ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
