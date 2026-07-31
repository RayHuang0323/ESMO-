#!/usr/bin/env node
// ============================================================================
//  tools/check_hero_presentation_l.mjs — Milestone L 資料層／Adapter 安全網
//
//    §1 Hero Combat Presentation Contract v1 的結構與完整性
//    §2 fallback、非法輸入、決定性、唯讀
//    §3 沒有污染 heroDatabase，也沒有把平衡數值偷渡進呈現層
//    §4 Adapter：不修改原始 event、保留 timestamp 與身分、不虛構 Q/W/E/R
//    §5 引擎逐值不變（本輪只加呈現，不動模擬）
//    §6 UI 原始碼的結構性保證（版面／實際演出由 shot 腳本在瀏覽器驗）
//
//  ⚠ 斷言原則：能驗行為就驗行為。3D 特效長什麼樣 Node 驗不了 ⇒ 交給 shot 腳本。
// ============================================================================
import fs from "node:fs";
import { CHAMPIONS_100, heroById } from "../src/data/heroDatabase.js";
import { LogicEngine } from "../src/LogicEngine.js";
import { adaptEffects } from "../src/battle/moba/map/mobaRuntimeMapAdapter.js";
import {
  getHeroCombatPresentation, getHeroSkillPresentation, getHeroPresentationTheme,
  getFallbackHeroPresentation, listPresentationHeroIds, hasAuthoredPresentation,
  validateHeroCombatPresentation, HERO_PRESENTATION_CONTRACT_VERSION,
  PRESENTATION_ARCHETYPES, PRESENTATION_EFFECTS, PRESENTATION_EMPHASIS,
  AUDIO_PROFILES, CAMERA_EMPHASIS, PERFORMANCE_TIERS, SKILL_SLOTS,
  ARCHETYPE_LABEL, PRESENTATION_DISCLAIMER, FORBIDDEN_PRESENTATION_KEYS,
  COMBAT_CLASSES, combatClassOf,
} from "../src/data/heroCombatPresentation.js";
import {
  describeFxPresentation, toPresentationEvent, toPresentationEvents,
  describeTimelinePresentation, resolveHeroId, parseAbility, pickCallouts,
  CALLOUT_LIMIT, SUPPORTED_TEMPLATES, CALLOUT_ARCHETYPES, CALLOUT_DEDUPE_SEC,
} from "../src/battle/moba/heroPresentationAdapter.js";

let pass = 0, fail = 0;
const ck = (l, c, e = null) => { if (c) { pass++; console.log(`✅ ${l}`); } else { fail++; console.log(`❌ ${l}${e != null ? `　→ ${JSON.stringify(e)}` : ""}`); } };
const src = (p) => fs.readFileSync(p, "utf8");
const PRES_SRC = src("src/data/heroCombatPresentation.js");
const ADAPTER_SRC = src("src/battle/moba/heroPresentationAdapter.js");
const FX_SRC = src("src/battle/moba/presentation/HeroSkillEffects.jsx");
const CALLOUT_SRC = src("src/battle/moba/presentation/HeroSkillCallout.jsx");
const TIMELINE_SRC = src("src/battle/ui/BattleTimeline.jsx");
const MAP_ADAPTER_SRC = src("src/battle/moba/map/mobaRuntimeMapAdapter.js");

const IDS = listPresentationHeroIds();
//  10 位代表英雄：上/打/中/射/輔 各 2（報告 §3 有選擇理由）
const EXPECTED = ["bingshuang", "chichuan", "cinderfist", "dadi", "duskblade",
  "ironclad", "leiting", "lieyan", "stoneguard", "yanfeng"];

console.log("── §1 Contract v1 結構 ──");
{
  ck(`1) 契約版本常數存在（${HERO_PRESENTATION_CONTRACT_VERSION}）`,
    HERO_PRESENTATION_CONTRACT_VERSION === "HeroCombatPresentation.v1");
  ck("2) 八個模板就是規格那八個，且順序固定、常數凍結",
    Object.isFrozen(PRESENTATION_ARCHETYPES)
    && JSON.stringify(PRESENTATION_ARCHETYPES) === JSON.stringify(
      ["projectile", "line", "area", "dash", "shield", "heal", "control", "ultimate"]),
    PRESENTATION_ARCHETYPES);
  ck("3) 其餘 enum 都存在且凍結（effect / emphasis / audio / camera / tier）",
    [PRESENTATION_EFFECTS, PRESENTATION_EMPHASIS, AUDIO_PROFILES, CAMERA_EMPHASIS, PERFORMANCE_TIERS]
      .every((e) => Object.isFrozen(e) && e.length > 0));
  ck(`4) 10 位代表英雄全部存在（實測 ${IDS.length} 位）`,
    IDS.length === 10 && JSON.stringify(IDS) === JSON.stringify(EXPECTED), IDS);
  {
    //  上/打/中/射/輔 各 2 位——這是任務指定的分佈，用 Hero Database 的 lane 實際核對
    const byLane = {};
    for (const id of IDS) {
      const h = heroById(id);
      byLane[h.lane] = (byLane[h.lane] ?? 0) + 1;
    }
    //  ⚠ 用排序後的 entries 比對，不要比 JSON 字串——物件 key 順序取決於插入順序，
    //    分佈完全正確也會因為順序不同而紅燈（第一版就踩了這個）。
    ck("5) 分佈為上路 2／打野 2／中路 2／下路 2／輔助 2",
      JSON.stringify(Object.entries(byLane).sort())
      === JSON.stringify([["上路", 2], ["下路", 2], ["中路", 2], ["打野", 2], ["輔助", 2]].sort()),
      byLane);
    //  每一路兩位英雄的「演出風格」不得相同（否則同一路看起來一樣）
    const laneStyles = {};
    for (const id of IDS) {
      const h = heroById(id), p = getHeroCombatPresentation(id);
      const sig = p.skills[p.signatureSlot];
      (laneStyles[h.lane] ??= []).push(`${p.basicAttack.archetype}/${sig.archetype}/${sig.effect}`);
    }
    const dupLane = Object.entries(laneStyles).filter(([, v]) => new Set(v).size !== v.length);
    ck("6) 每一路的兩位英雄演出風格不同（不是同一路長一樣）", dupLane.length === 0, laneStyles);
  }
  ck("7) 所有 heroId 都存在於 heroDatabase",
    IDS.every((id) => CHAMPIONS_100.some((c) => c.id === id)),
    IDS.filter((id) => !CHAMPIONS_100.some((c) => c.id === id)));
  {
    const bad = [];
    for (const id of IDS) {
      const p = getHeroCombatPresentation(id);
      if (!PRESENTATION_ARCHETYPES.includes(p.basicAttack.archetype)) bad.push([id, "basicAttack.archetype"]);
      if (!PRESENTATION_EFFECTS.includes(p.basicAttack.effect)) bad.push([id, "basicAttack.effect"]);
      if (!AUDIO_PROFILES.includes(p.audioProfile)) bad.push([id, "audioProfile"]);
      if (!CAMERA_EMPHASIS.includes(p.cameraEmphasis)) bad.push([id, "cameraEmphasis"]);
      if (!PERFORMANCE_TIERS.includes(p.performanceTier)) bad.push([id, "performanceTier"]);
      if (!p.theme?.primaryColor || !p.theme?.secondaryColor || !p.theme?.symbol || !p.theme?.shapeLanguage) bad.push([id, "theme"]);
      for (const slot of SKILL_SLOTS) {
        const s = p.skills[slot];
        if (!s) { bad.push([id, slot, "missing"]); continue; }
        if (!PRESENTATION_ARCHETYPES.includes(s.archetype)) bad.push([id, slot, "archetype", s.archetype]);
        if (!PRESENTATION_EFFECTS.includes(s.effect)) bad.push([id, slot, "effect", s.effect]);
        if (!PRESENTATION_EMPHASIS.includes(s.emphasis)) bad.push([id, slot, "emphasis", s.emphasis]);
      }
    }
    ck("8) 每位英雄的五個 slot、theme、audio/camera/tier 全部合法", bad.length === 0, bad.slice(0, 8));
  }
  ck("9) 八個模板每一個都至少被一位英雄用到（沒有驗不到的模板）",
    (() => {
      const used = new Set();
      for (const id of IDS) {
        const p = getHeroCombatPresentation(id);
        used.add(p.basicAttack.archetype);
        for (const s of SKILL_SLOTS) used.add(p.skills[s].archetype);
      }
      return PRESENTATION_ARCHETYPES.every((a) => used.has(a));
    })());
  ck("10) 每個模板都有中文演出文案，且一律是「演出」不是「技能」",
    PRESENTATION_ARCHETYPES.every((a) => typeof ARCHETYPE_LABEL[a] === "string" && ARCHETYPE_LABEL[a].endsWith("演出")),
    ARCHETYPE_LABEL);
  {
    const v = validateHeroCombatPresentation();
    ck("11) 內建 validateHeroCombatPresentation() 全綠", v.ok, v.errors.slice(0, 8));
  }
}

console.log("\n── §2 fallback、非法輸入、決定性、唯讀 ──");
{
  const noData = CHAMPIONS_100.map((c) => c.id).filter((id) => !IDS.includes(id));
  ck(`12) 沒有專屬設定的 ${noData.length} 位英雄全部拿得到合法 fallback（不 throw、不回 null）`,
    noData.every((id) => {
      try {
        const p = getHeroCombatPresentation(id);
        return p && p.source === "fallback" && p.heroId === id
          && PRESENTATION_ARCHETYPES.includes(p.basicAttack.archetype)
          && SKILL_SLOTS.every((s) => PRESENTATION_ARCHETYPES.includes(p.skills[s].archetype));
      } catch { return false; }
    }));
  ck("13) fallback 依定位推導（法師走彈道、坦克走近戰），不是全部長一樣",
    (() => {
      const mage = CHAMPIONS_100.find((c) => c.arch === "法師" && !IDS.includes(c.id));
      const tank = CHAMPIONS_100.find((c) => c.arch === "坦克" && !IDS.includes(c.id));
      return getHeroCombatPresentation(mage.id).basicAttack.archetype === "projectile"
        && getHeroCombatPresentation(tank.id).basicAttack.archetype === "line";
    })());
  {
    const weird = [undefined, null, 0, 42, "", "nope", "constructor", "__proto__", {}, [], NaN];
    let bad = null;
    for (const w of weird) {
      try {
        const p = getHeroCombatPresentation(w);
        if (!p || p.source !== "fallback" || !p.theme) bad = String(w);
        getHeroSkillPresentation(w, "ZZZ"); getHeroPresentationTheme(w); getFallbackHeroPresentation(w);
      } catch (e) { bad = `${String(w)} → ${e.message}`; }
    }
    ck("14) 非法／原型鏈輸入全部回 fallback，四支純函式都不 throw", bad === null, bad);
  }
  ck("15) slot 不合法時退回該英雄的 signature 槽（不 throw、不回 undefined）",
    (() => {
      const p = getHeroCombatPresentation("ironclad");
      const s = getHeroSkillPresentation("ironclad", "ZZZ");
      return s && s === p.skills[p.signatureSlot];
    })());
  ck("16) 決定性：連續 3 次呼叫逐值相同，且參考也相同（含 fallback）",
    CHAMPIONS_100.every((c) => {
      const a = getHeroCombatPresentation(c.id), b = getHeroCombatPresentation(c.id), d = getHeroCombatPresentation(c.id);
      return a === b && b === d && JSON.stringify(a) === JSON.stringify(d);
    }));
  ck("17) 回傳資料是凍結的（UI 拿到手也改不動）",
    IDS.every((id) => {
      const p = getHeroCombatPresentation(id);
      return Object.isFrozen(p) && Object.isFrozen(p.theme) && Object.isFrozen(p.skills)
        && SKILL_SLOTS.every((s) => Object.isFrozen(p.skills[s]));
    }));
  ck("18) 實際嘗試竄改後資料原封不動",
    (() => {
      const before = JSON.stringify(getHeroCombatPresentation("leiting"));
      try { getHeroCombatPresentation("leiting").theme.primaryColor = "#000000"; } catch { /* frozen */ }
      try { getHeroSkillPresentation("leiting", "R").archetype = "heal"; } catch { /* frozen */ }
      return JSON.stringify(getHeroCombatPresentation("leiting")) === before;
    })());
  ck("19) 原始表沒有 export（UI 只能走純函式）",
    !/export\s+(const|let|var)\s+PRESENTATIONS/.test(PRES_SRC) && !/export\s*\{[^}]*PRESENTATIONS/.test(PRES_SRC));
}

console.log("\n── §3 沒有污染 heroDatabase，也沒有平衡數值 ──");
{
  ck("20) CHAMPIONS_100 仍是 100 隻，且沒有被塞進呈現欄位",
    CHAMPIONS_100.length === 100
    && CHAMPIONS_100.every((c) => !("presentation" in c) && !("theme" in c) && !("basicAttack" in c)));
  ck("21) heroDatabase 既有欄位不變（抽驗 leiting）",
    (() => {
      const h = heroById("leiting");
      return h && h.zh === "雷霆神射" && h.arch === "射手" && h.stats?.ad === 56 && !!h.skills?.R?.name;
    })(), heroById("leiting")?.stats?.ad);
  ck("22) 相依方向正確：呈現層 → heroDatabase，heroDatabase 不反過來 import",
    !src("src/data/heroDatabase.js").includes("heroCombatPresentation")
    && PRES_SRC.includes('from "./heroDatabase.js"'));
  {
    //  遞迴掃整棵呈現資料：不得出現任何禁止欄位或裸數值
    const hits = [];
    const scan = (n, path) => {
      if (!n || typeof n !== "object") return;
      for (const [k, v] of Object.entries(n)) {
        if (FORBIDDEN_PRESENTATION_KEYS.includes(k)) hits.push(`${path}.${k}`);
        if (typeof v === "number") hits.push(`${path}.${k}=${v}`);
        if (v && typeof v === "object") scan(v, `${path}.${k}`);
      }
    };
    for (const id of IDS) scan(getHeroCombatPresentation(id), id);
    ck("23) 呈現資料裡沒有傷害／冷卻／勝率／命中率，連裸數值都沒有", hits.length === 0, hits.slice(0, 6));
  }
  ck("24) 呈現層沒有亂數、沒有時間相依",
    !/Math\.random|Date\.now|new Date\(|performance\.now/.test(PRES_SRC)
    && !/Math\.random|Date\.now/.test(ADAPTER_SRC));
  ck("25) 顏色不是第二套：主題色讀 heroArchetypes 的既有英雄視覺",
    PRES_SRC.includes('from "../battle/moba/presentation/heroArchetypes.js"')
    && PRES_SRC.includes("heroVisualFor("),
    getHeroPresentationTheme("ironclad"));
}

console.log("\n── §4 Adapter：不改原事件、保留身分、不虛構技能 ──");
{
  //  ⚠ roster 有**三種**形狀，三種都要吃。第一版只測了前兩種，
  //    結果 `useGameStore.roster`（第三種：英雄物件本身）在實戰整場解析不到英雄，
  //    HUD callout 一個都出不來——由瀏覽器驗收抓到，補在這裡當回歸。
  const roster = {
    b1: { heroId: "ironclad" },
    b2: { hero: { id: "duskblade" } },
    b3: heroById("bingshuang"),          // useGameStore.roster 的實際形狀
  };
  ck("26) resolveHeroId 吃得下 roster 的三種既有形狀，找不到回 null",
    resolveHeroId("b1", roster) === "ironclad" && resolveHeroId("b2", roster) === "duskblade"
    && resolveHeroId("b3", roster) === "bingshuang"
    && resolveHeroId("zz", roster) === null && resolveHeroId(null, null) === null,
    ["b1", "b2", "b3"].map((k) => resolveHeroId(k, roster)));
  ck("26a) 三種形狀與 mobaRuntimeMapAdapter 的解析鏈一致（不是兩套解讀）",
    /rosterEntry\?\.hero\?\.id \?\? rosterEntry\?\.heroId \?\? rosterEntry\?\.id/.test(MAP_ADAPTER_SRC)
    && ADAPTER_SRC.includes("e.hero?.id ?? e.heroId ?? e.id"));
  ck("27) parseAbility 解析引擎實際值域，壞輸入回穩定預設",
    JSON.stringify(parseAbility("top:power")) === JSON.stringify({ group: "top", variant: "power" })
    && JSON.stringify(parseAbility(null)) === JSON.stringify({ group: null, variant: "basic" })
    && parseAbility("tower:basic").group === "tower");
  {
    const fx = Object.freeze({
      id: "fx7", type: "line", ability: "top:basic", feedback: "attack",
      sourceId: "b1", targetId: "r1", at: 12.5, pos: { x: 1, y: 2 },
    });
    const before = JSON.stringify(fx);
    const out = toPresentationEvent(fx, roster);
    ck("28) toPresentationEvent 回新物件，原始 event 一個欄位都沒被改",
      JSON.stringify(fx) === before && out !== fx && !("presentation" in fx));
    ck("29) timestamp 與身分原封保留",
      out.at === 12.5 && out.id === "fx7" && out.sourceId === "b1" && out.targetId === "r1"
      && out.ability === "top:basic" && out.type === "line");
    ck("30) basic ⇒ 走該英雄的 basicAttack 演出",
      out.presentation.heroId === "ironclad"
      && out.presentation.archetype === getHeroCombatPresentation("ironclad").basicAttack.archetype
      && out.presentation.basis === "engine:basic", out.presentation);
    const power = toPresentationEvent({ ...fx, ability: "top:power", type: "ult", feedback: "skill" }, roster);
    ck("31) power ⇒ 走該英雄的 signature 槽演出，且標記 basis=engine:power",
      power.presentation.basis === "engine:power"
      && power.presentation.slot === getHeroCombatPresentation("ironclad").signatureSlot,
      power.presentation);
  }
  ck("32) ⚠ 任何情況都不宣稱「實際施放了技能」（isActualSkillCast 恆為 false）",
    (() => {
      const abilities = ["top:basic", "top:power", "mid:power", "tower:basic", "neutral:defeated",
        "boss:dragon", "buff:redBuff", null, "garbage"];
      return abilities.every((a) => describeFxPresentation({ ability: a, sourceId: "b1", type: "ult" }, roster).isActualSkillCast === false);
    })());
  ck("33) ⚠ Adapter 原始碼裡沒有任何「把 Q/W/E/R 當成引擎事實」的映射",
    !/ability[\s\S]{0,80}["'`][QWER]["'`]/.test(ADAPTER_SRC)
    && ADAPTER_SRC.includes("isActualSkillCast: false"));
  ck("34) 非英雄來源（塔／野怪／首領／buff）有穩定演出且 heroId 為 null",
    ["tower:basic", "neutral:defeated", "boss:baron", "buff:blueBuff"].every((a) => {
      const p = describeFxPresentation({ ability: a, sourceId: "blue_t1" }, roster);
      return p.heroId === null && SUPPORTED_TEMPLATES.includes(p.archetype);
    }));
  ck("35) 沒有 roster 時仍回 fallback 演出（畫面不會空白）",
    (() => {
      const p = describeFxPresentation({ ability: "mid:power", sourceId: "b9", type: "ult" }, null);
      return p.source === "fallback" && SUPPORTED_TEMPLATES.includes(p.archetype) && p.theme === null;
    })());
  ck("36) 批次轉換：長度不變、順序不變、逐筆都是新物件",
    (() => {
      const list = [{ id: "a", at: 1, ability: "top:basic", sourceId: "b1" },
        { id: "b", at: 2, ability: "mid:power", sourceId: "b3" }];
      const snapshot = JSON.stringify(list);
      const out = toPresentationEvents(list, roster);
      return out.length === 2 && out[0].id === "a" && out[1].id === "b"
        && out[0] !== list[0] && JSON.stringify(list) === snapshot;
    })());
  ck("37) Adapter 決定性：同一輸入兩次逐值相同",
    JSON.stringify(describeFxPresentation({ ability: "top:power", sourceId: "b1", type: "ult" }, roster))
    === JSON.stringify(describeFxPresentation({ ability: "top:power", sourceId: "b1", type: "ult" }, roster)));
  //  ── L Hotfix 1 §2：callout 降低干擾 ────────────────────────────────────
  ck(`38) callout 限流：桌機 ${CALLOUT_LIMIT.desktop}、手機 ${CALLOUT_LIMIT.mobile}，且挑選是決定性的`,
    (() => {
      //  五隻不同英雄、時間錯開 ⇒ 不會被去重擋掉，純測上限
      const rs = { b1: { heroId: "ironclad" }, b2: { heroId: "duskblade" }, b3: { heroId: "bingshuang" },
        b4: { heroId: "dadi" }, b5: { heroId: "stoneguard" } };
      const many = Object.keys(rs).map((sid, i) => ({
        id: `e${i}`, at: i * 10, ability: "top:power", type: "ult", sourceId: sid,
      }));
      const evs = toPresentationEvents(many, rs);
      const d = pickCallouts(evs, { mobile: false }), m = pickCallouts(evs, { mobile: true });
      return CALLOUT_LIMIT.desktop === 2 && CALLOUT_LIMIT.mobile === 1
        && d.length === 2 && m.length === 1
        && JSON.stringify(d.map((x) => x.id)) === JSON.stringify(pickCallouts(evs, { mobile: false }).map((x) => x.id));
    })());
  ck("38a) 普攻永遠不跳 callout（basic 推導出來的一律被擋）",
    (() => {
      const basics = ["b1", "b2", "b3"].map((sid, i) => ({
        id: `bb${i}`, at: i * 10, ability: "top:basic", feedback: "attack", sourceId: sid,
      }));
      return pickCallouts(toPresentationEvents(basics, roster), { mobile: false }).length === 0;
    })());
  ck(`38b) 只有看得出戰術意義的分類才跳（白名單 ${CALLOUT_ARCHETYPES.join("/")}）`,
    Array.isArray(CALLOUT_ARCHETYPES) && CALLOUT_ARCHETYPES.length > 0
    && !CALLOUT_ARCHETYPES.includes("projectile") && !CALLOUT_ARCHETYPES.includes("line")
    && CALLOUT_ARCHETYPES.every((a) => SUPPORTED_TEMPLATES.includes(a)),
    CALLOUT_ARCHETYPES);
  ck(`38c) 同英雄同分類 ${CALLOUT_DEDUPE_SEC} 秒內去重（洗版被擋掉）`,
    (() => {
      const spam = [0, 1, 2, 3].map((i) => ({
        id: `s${i}`, at: 100 + i * 0.5, ability: "top:power", type: "ult", sourceId: "b1",
      }));
      const kept = pickCallouts(toPresentationEvents(spam, roster), { mobile: false });
      const later = [{ id: "s9", at: 100, ability: "top:power", type: "ult", sourceId: "b1" },
        { id: "s10", at: 100 + CALLOUT_DEDUPE_SEC + 1, ability: "top:power", type: "ult", sourceId: "b1" }];
      const two = pickCallouts(toPresentationEvents(later, roster), { mobile: false });
      return CALLOUT_DEDUPE_SEC >= 3 && CALLOUT_DEDUPE_SEC <= 5 && kept.length === 1 && two.length === 2;
    })());
  ck("39) Timeline 呈現描述：主角解析正確、團隊級事件不掛頭像",
    (() => {
      const kill = describeTimelinePresentation({ type: "KILL", data: { killer: "b1", victim: "r1" } }, roster);
      const ace = describeTimelinePresentation({ type: "ACE" }, roster);
      const tower = describeTimelinePresentation({ type: "TOWER_DESTROYED", data: { lane: "top" } }, roster);
      return kill.heroId === "ironclad" && kill.showPortrait === true
        && ace.showPortrait === false && ace.isHighlight === true
        && tower.showPortrait === false && tower.isHighlight === false;
    })());
  ck("40) describeTimelinePresentation 不修改輸入事件",
    (() => {
      const ev = { type: "KILL", data: { killer: "b1" } };
      const before = JSON.stringify(ev);
      describeTimelinePresentation(ev, roster);
      return JSON.stringify(ev) === before && !("presentation" in ev);
    })());
}

console.log("\n── §5 引擎與既有 adapter：逐值不變 ──");
{
  ck("41) 引擎仍然決定性（同 seed 兩次逐值相同）",
    (() => {
      const run = (s) => { const e = new LogicEngine(s); for (let i = 0; i < 3000 && !e.over; i++) e.tick(0.5); return JSON.stringify({ t: Math.round(e.t * 100), k: e.players.map((p) => p.k), g: e.players.map((p) => Math.round(p.g ?? 0)) }); };
      return run(42) === run(42) && run(7) === run(7);
    })());
  {
    //  adaptEffects 只多了 `presentation` 欄位——其餘欄位必須逐值不變。
    //  ⚠ fx 有生命期：拿任意一幀常常整批都過期了（第一版就是這樣拿到 0 筆，
    //    然後「每一筆都合法」變成空集合恆真）。這裡推進到**真的有在演出**的那一幀。
    const e = new LogicEngine(42);
    //  ⚠ roster 要覆蓋十個席位。只塞三個的話，其餘席位的事件會正確地走 fallback，
    //    然後「解析得出英雄」這條就會因為**測試資料不完整**而紅燈。
    const roster = {
      b1: { heroId: "ironclad" }, b2: { heroId: "duskblade" }, b3: { heroId: "bingshuang" },
      b4: { heroId: "leiting" }, b5: { heroId: "stoneguard" },
      r1: { heroId: "cinderfist" }, r2: { heroId: "chichuan" }, r3: { heroId: "lieyan" },
      r4: { heroId: "yanfeng" }, r5: { heroId: "dadi" },
    };
    let snap = null, out = [];
    for (let i = 0; i < 900 && !e.over; i++) {
      e.tick(0.5);
      snap = e.snapshot();
      out = adaptEffects(snap, snap.ts, { roster });
      if (out.length >= 3) break;
    }
    const fxBefore = JSON.stringify(snap.fx);
    adaptEffects(snap, snap.ts, { roster });
    ck(`42) adaptEffects 沒有修改 snapshot.fx（${snap.fx.length} 筆原始事件、${out.length} 筆演出）`,
      JSON.stringify(snap.fx) === fxBefore);
    ck(`43) 每一筆輸出都帶 presentation，且模板落在八個白名單內（實測 ${out.length} 筆）`,
      out.length >= 3 && out.every((x) => x.presentation && SUPPORTED_TEMPLATES.includes(x.presentation.archetype)),
      { n: out.length, bad: out.filter((x) => !x.presentation).length });
    ck("43a) 真實對戰事件裡確實解析得出英雄（不是全部走 fallback）",
      out.some((x) => x.presentation.heroId !== null),
      out.map((x) => [x.sourceId, x.presentation.heroId, x.presentation.archetype]).slice(0, 6));
    ck("44) 既有欄位一個都沒被 presentation 蓋掉（id/type/phase/world 仍在）",
      out.every((x) => x.id != null && x.type != null && x.phase != null && x.world != null
        && x.skillVisual != null && x.combatClass != null));
    ck("45) 同一份 snapshot 呼叫兩次，輸出逐值相同（呈現層無副作用）",
      JSON.stringify(adaptEffects(snap, snap.ts, { roster })) === JSON.stringify(out));
  }
}

console.log("\n── §6 UI 原始碼結構（實際演出由 shot 腳本在瀏覽器驗）──");
{
  ck("46)〔原始碼〕特效模板一次建立資源，useFrame 內不 new geometry/material",
    /useMemo\(\(\) => \(\{[\s\S]{0,600}new THREE\.RingGeometry/.test(FX_SRC)
    && !/useFrame\([\s\S]*new THREE\.(Ring|Cylinder|Octahedron|Torus)Geometry/.test(FX_SRC));
  ck("47)〔原始碼〕卸載時 dispose 全部 geometry 與 material",
    /countUnmount\("heroSkillEffects"\)[\s\S]{0,240}dispose\(\)[\s\S]{0,120}dispose\(\)/.test(FX_SRC));
  ck("48)〔原始碼〕池容量依畫質分級，且手機（low）明顯較小",
    (() => {
      const m = FX_SRC.match(/low: Object\.freeze\(\{ halo: (\d+), bar: (\d+), bolt: (\d+), guard: (\d+) \}\)/);
      const h = FX_SRC.match(/high: Object\.freeze\(\{ halo: (\d+), bar: (\d+), bolt: (\d+), guard: (\d+) \}\)/);
      return m && h && Number(m[1]) < Number(h[1]) && Number(m[3]) < Number(h[3]);
    })());
  ck("49)〔原始碼〕疊加層用 NormalBlending（不用 additive 造成過曝 overdraw）",
    FX_SRC.includes("blending: THREE.NormalBlending") && !FX_SRC.includes("AdditiveBlending"));
  ck("50)〔原始碼〕大招半徑有上限（不可遮住整個戰場）",
    /Math\.min\(3\.2,/.test(FX_SRC));
  ck("51)〔原始碼〕HUD callout 顯示的是「演出分類」，不是技能名",
    CALLOUT_SRC.includes("{p.label}") && CALLOUT_SRC.includes("PRESENTATION_DISCLAIMER")
    && !/skills\?\.\[|sk\.name/.test(CALLOUT_SRC));
  ck("52) 誠實聲明的文案講明「不代表引擎實際施放了該技能」",
    PRESENTATION_DISCLAIMER.includes("不代表引擎實際施放了該技能"), PRESENTATION_DISCLAIMER);
  ck("53)〔原始碼〕Timeline 的英雄身分走同一支 Adapter，且不自己查 roster 推英雄",
    TIMELINE_SRC.includes("describeTimelinePresentation")
    && TIMELINE_SRC.includes('data-testid="timeline-portrait"')
    && TIMELINE_SRC.includes('data-testid="timeline-row"'));
  ck("54)〔原始碼〕adaptEffects 只是**新增** presentation 欄位（純附加接線）",
    /presentation: describeFxPresentation\(f, opts\.roster \?\? null\),/.test(MAP_ADAPTER_SRC)
    && !/f\.presentation\s*=/.test(MAP_ADAPTER_SRC));
  ck("55)〔原始碼〕現場與 Replay 讀同一份 mapping（callout 沒有第二條資料流）",
    CALLOUT_SRC.includes("toPresentationEvents") && CALLOUT_SRC.includes("source ? source.getState()")
    && !CALLOUT_SRC.includes("LogicEngine"));
  ck("56)〔原始碼〕演出畫廊是 lazy debug 路由，不進正式流程",
    src("src/main.jsx").includes('debugMode === "hero-presentation"')
    && src("src/main.jsx").includes("React.lazy(() => import(\"./debug/HeroPresentation/HeroPresentationGallery.jsx\"))"));
  //  ⚠ 不可以用 includes("presentation") 掃——replayBuffer 早就有 `presentationKey`
  //    這個 S29B5 的既有欄位，那樣寫會把既有程式碼誤判成本輪改動。
  //    要問的是「本輪的呈現層有沒有滲進契約檔」。
  ck("57) BattleResult / Replay contract 沒有被呈現層滲入",
    ["src/battle/battleResult.js", "src/battle/moba/replay/replayBuffer.js",
      "src/battle/moba/snapshotToBattleResult.js"].every((f) => {
      const t = src(f);
      return !t.includes("heroPresentationAdapter") && !t.includes("heroCombatPresentation")
        && !/presentation\s*:/.test(t);
    }));
}

console.log("\n── §7 L Hotfix 1：職業 shape language / 三段式戰報 / 塔 debug ──");
{
  const FX = src("src/battle/moba/presentation/HeroSkillEffects.jsx");
  const TOWER = src("src/battle/moba/presentation/TowerRangeDebug.jsx");
  const VIEW = src("src/battle/moba/render/MobaRuntimeView3D.jsx");
  const MP = src("src/battle/moba/matchProgression.js");

  ck("58) 六個職業都對得到 combatClass，且落在白名單",
    COMBAT_CLASSES.length === 6
    && CHAMPIONS_100.every((c) => COMBAT_CLASSES.includes(combatClassOf(c.id)))
    && combatClassOf("ironclad") === "tank" && combatClassOf("duskblade") === "assassin"
    && combatClassOf("bingshuang") === "mage" && combatClassOf("leiting") === "marksman",
    COMBAT_CLASSES);
  ck("59) presentation 帶得出 combatClass（英雄有、非英雄來源為 null）",
    describeFxPresentation({ ability: "top:power", type: "ult", sourceId: "b1" },
      { b1: { heroId: "ironclad" } }).combatClass === "tank"
    && describeFxPresentation({ ability: "tower:basic", sourceId: "blue_t1" }, null).combatClass === null);
  {
    //  這一條是本 Hotfix §4 的核心：差異**不能只在顏色**。
    //  直接抽出 CLASS_STYLE 與 ENVELOPE 執行，比對六職業的動態參數真的互不相同。
    let mod = null, why = null;
    try {
      const i = FX.indexOf("export const CLASS_STYLE");
      const j = FX.indexOf("export const envelopeFor");
      const code = FX.slice(i, FX.indexOf(";", j) + 1).replace(/export /g, "");
      mod = new Function(code + "\nreturn { CLASS_STYLE, styleFor, ENVELOPE, envelopeFor };")();
    } catch (e) { why = e.message; }
    ck("60) 抽得出 CLASS_STYLE / ENVELOPE（shape language 真的在程式碼裡）", !!mod, why);
    if (mod) {
      const keys = ["speed", "width", "height", "hug", "spin", "env"];
      const rows = COMBAT_CLASSES.map((c) => mod.styleFor(c));
      ck("61) 六職業都有完整的 shape language 參數",
        rows.every((r) => keys.every((k) => r[k] != null)), rows);
      for (const k of ["speed", "width", "height", "hug"]) {
        const vals = rows.map((r) => r[k]);
        ck(`62-${k}) ${k} 六職業幾乎互不相同（不是只換顏色）`, new Set(vals).size >= 5, vals);
      }
      ck("63) 出現／消失節奏有四種且行為不同（同一個 t 給出不同值）",
        (() => {
          const names = Object.keys(mod.ENVELOPE);
          const at = names.map((n) => mod.ENVELOPE[n](0.15).toFixed(3));
          return names.length === 4 && new Set(at).size === 4;
        })(), Object.keys(mod.ENVELOPE));
      ck("64) 未知職業回 fallback，不 throw",
        mod.styleFor("nope") === mod.styleFor("fighter") && !!mod.envelopeFor("nope"));
    }
  }
  ck("65)〔原始碼〕shape language 只影響呈現（沒有把它乘進任何傷害／命中）",
    !/damage|dmg/i.test(FX));
  ck("66)〔原始碼〕三段式戰報：hidden / compact / expanded，且沒有自由拖拉 resize",
    TIMELINE_SRC.includes('TIMELINE_MODES = Object.freeze(["hidden", "compact", "expanded"])')
    && TIMELINE_SRC.includes('data-testid="timeline-root"')
    && TIMELINE_SRC.includes('data-testid="timeline-body"')
    && !/onMouseMove|onPointerMove/i.test(TIMELINE_SRC));
  ck("67)〔原始碼〕戰報預設 compact，且使用者選擇記在 localStorage",
    TIMELINE_SRC.includes('return "compact";') && TIMELINE_SRC.includes("esmo.timeline.mode.v1")
    && TIMELINE_SRC.includes("saveTimelineMode"));
  ck("68)〔原始碼〕戰報高度是固定檔位（桌機 compact 84／手機 50；expanded 手機 30vh）",
    /isMobile \? 50 : 84/.test(TIMELINE_SRC) && /isMobile \? "30vh" : "40vh"/.test(TIMELINE_SRC));
  ck("69)〔原始碼〕塔射程圈／鎖定線**只在 debug 模式**掛載",
    /diagnosticsEnabled\(\) && <TowerRangeDebug/.test(VIEW));
  ck("70)〔原始碼〕鎖定線來自引擎真實 tower fx，不是自己重算誰該被打",
    TOWER.includes('fx?.ability !== "tower:basic"') && TOWER.includes("towerRangeWorld"));
  ck("71) 塔射程圈的半徑就是規則裡的 towerAggroRange 換算（沒有偷偷放大）",
    /\(rules\?\.towerAggroRange \?\? 5\.5\) \* S/.test(TOWER));
  ck("72) 本輪沒有改動任何戰鬥規則常數（塔射程／傷害／間隔原封不動）",
    /towerAggroDmg: 66,/.test(MP) && /towerAggroRange: 5\.5,/.test(MP)
    && /towerAttackInterval: 0\.5,/.test(MP) && /towerMinionDamage: 60,/.test(MP));
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"}  ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
