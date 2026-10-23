// ============================================================================
//  screens/moba/tacticBook/tacticBookOptions.js — 戰術書畫面的 view-model（Phase 3a T13；純函式）
//
//  畫面上每一個可以點的選項都從這裡來，而這裡只轉述三個來源，不自己判斷：
//    · 選項清單   tacticResolver.tacticBookOptions()（＝ Capability Registry 的 live 選擇，扣掉量測不到效果的）
//    · 解析結果   mergeTacticConfig（與引擎吃到的是同一個合併函式）＋ bindTacticPlanToCurrentVersions
//    · 指標       platform/tactics/tacticIndicators.js
//  ⚠ design 維度、被排除的選擇不會出現在回傳值裡 ⇒ 畫面不可能畫出「可點但無效」的選項。
//  ⚠ 本檔的中文標籤是呈現用文字；鍵（維度／選擇 id）以 Registry 為準，gate 逐鍵核對沒有漏標。
//
//  不 import React、store、引擎。Node 可直接載入（tools/check_tactic_book_view_3a.mjs）。
// ============================================================================
import { createTacticPlan } from "../../../platform/tactics/tacticPlan.js";
import { TACTIC_TEMPLATE_LIST, templateById } from "../../../platform/tactics/tacticTemplates.js";
import { leavesOf, nestedOf, mergeTacticConfig } from "../../../platform/tactics/tacticChoiceMapping.js";
import { tacticBookOptions, bindTacticPlanToCurrentVersions } from "../../../battle/moba/tactics/tacticResolver.js";
import { planProfile, seatMissionFit, coordinationLoad, contradictions, PROFILE_AXES, SEATS } from "../../../platform/tactics/tacticIndicators.js";

export const DIMENSION_GROUPS = Object.freeze([
  { id: "team", label: "團隊" },
  { id: "jungle", label: "打野" },
  { id: "lanes", label: "三路" },
  { id: "seats", label: "席位" },
  { id: "phases", label: "時期" },
]);

/** 維度 → 群組與中文名。 */
export const DIMENSION_LABELS = Object.freeze({
  "teamfight.posture": { group: "team", label: "團戰姿態" },
  "teamfight.grouping": { group: "team", label: "集結" },
  "risk.tolerance": { group: "team", label: "風險" },
  "objectives.tower": { group: "team", label: "推塔重心" },
  "objectives.dragon": { group: "team", label: "巨龍重心" },
  "objectives.baron": { group: "team", label: "巴龍重心" },
  "jungle.focus": { group: "jungle", label: "打野重心" },
  "jungle.tempo": { group: "jungle", label: "打野節奏" },
  "lanes.top.stance": { group: "lanes", label: "上路" },
  "lanes.mid.stance": { group: "lanes", label: "中路" },
  "lanes.bot.stance": { group: "lanes", label: "下路" },
  "seats.b5.mission": { group: "seats", label: "輔助任務" },
  "seats.b1.priority": { group: "seats", label: "上路資源" },
  "seats.b3.priority": { group: "seats", label: "中路資源" },
  "seats.b4.priority": { group: "seats", label: "射手資源" },
  "phases.early.stance": { group: "phases", label: "前期" },
  "phases.mid.stance": { group: "phases", label: "中期" },
  "phases.late.stance": { group: "phases", label: "後期" },
  //  Phase 3a-C：每時期的選擇（只在 v21 規則集顯示）
  "phases.early.grouping": { group: "phases", label: "前期集結" },
  "phases.mid.grouping": { group: "phases", label: "中期集結" },
  "phases.late.grouping": { group: "phases", label: "後期集結" },
  "phases.early.objectiveOrder": { group: "phases", label: "前期物件優先" },
  "phases.mid.objectiveOrder": { group: "phases", label: "中期物件優先" },
  "phases.late.objectiveOrder": { group: "phases", label: "後期物件優先" },
});

const STANCE = { aggressive: "進攻", standard: "標準", defensive: "防守", split: "帶線", scaling: "發育" };
const LEVEL = { low: "低", standard: "標準", high: "高" };
//  每時期：成團＝更常決定去參團；物件優先＝更常出現在那個物件的坑邊（文案寫「多去」，不寫「拿到」）；推塔優先連帶三路站位前壓（文案揭露）。
const GROUPING = { standard: "標準", group: "成團" };
const OBJECTIVE_ORDER = { none: "不指定", dragon: "多去龍坑", baron: "多去巴龍坑", towers: "推塔優先（站位前壓）" };
/** 選擇 id → 中文（依維度；找不到就用共用表）。 */
export const CHOICE_LABELS = Object.freeze({
  "teamfight.posture": { passive: "保守", standard: "標準", aggressive: "積極" },
  "teamfight.grouping": { standard: "標準", tight: "緊密" },
  "risk.tolerance": { cautious: "謹慎", balanced: "平衡", bold: "大膽" },
  "objectives.tower": LEVEL, "objectives.dragon": LEVEL, "objectives.baron": LEVEL,
  "jungle.focus": { gank: "抓人", farm: "刷野", invade: "入侵" },
  "jungle.tempo": { slow: "慢", standard: "標準", fast: "快" },
  "lanes.top.stance": STANCE, "lanes.mid.stance": STANCE, "lanes.bot.stance": STANCE,
  "seats.b5.mission": { roam: "遊走", protect: "保護", standard: "標準" },
  "seats.b1.priority": { core: "核心", normal: "一般" },
  "seats.b3.priority": { core: "核心", normal: "一般" },
  "seats.b4.priority": { core: "核心", normal: "一般" },
  "phases.early.stance": STANCE, "phases.mid.stance": STANCE, "phases.late.stance": STANCE,
  "phases.early.grouping": GROUPING, "phases.mid.grouping": GROUPING, "phases.late.grouping": GROUPING,
  "phases.early.objectiveOrder": OBJECTIVE_ORDER, "phases.mid.objectiveOrder": OBJECTIVE_ORDER, "phases.late.objectiveOrder": OBJECTIVE_ORDER,
});
export const dimensionLabel = (dim) => DIMENSION_LABELS[dim]?.label ?? dim;
export const choiceLabel = (dim, choice) => CHOICE_LABELS[dim]?.[choice] ?? choice;

export const PROFILE_AXIS_LABELS = Object.freeze({
  early: "前期", midControl: "中期控圖", lateTeamfight: "後期團戰", objectives: "物件", splitPressure: "分推", risk: "風險",
});
export const MISSION_LABELS = Object.freeze({
  split: "帶線", pressure: "壓制", hold: "守線", lane: "對線", gank: "抓人", farm: "刷野", invade: "入侵", roam: "遊走", protect: "保護", support: "支援",
});
export const SEAT_LABELS = Object.freeze({ b1: "上路", b2: "打野", b3: "中路", b4: "射手", b5: "輔助" });

/** 模板列：依分類分組（經典八套、標準、v2 五類）。 */
export function templateGroups() {
  const groups = [];
  const push = (id, label, list) => { if (list.length) groups.push({ id, label, templates: list.map((t) => ({ templateId: t.templateId, name: t.name, desc: t.desc, kind: t.kind, legacyTacticId: t.legacyTacticId, risk: t.config.risk ?? null, emoji: t.kind === "v2" ? null : t.config.emoji ?? null })) }); };
  push("classic", "經典", TACTIC_TEMPLATE_LIST.filter((t) => t.kind === "classic"));
  for (const cat of [...new Set(TACTIC_TEMPLATE_LIST.filter((t) => t.kind === "v2").map((t) => t.category))]) {
    push(`v2:${cat}`, cat, TACTIC_TEMPLATE_LIST.filter((t) => t.kind === "v2" && t.category === cat));
  }
  push("std", "標準", TACTIC_TEMPLATE_LIST.filter((t) => t.kind === "std"));
  return groups;
}

/** 在巢狀 choices 上設定／取消一個維度的選擇。value 為 null、或等於模板自己的值（own）⇒ 取消（跟著模板）。 */
export function withChoice(choices, dimension, value, own = null) {
  const leaves = leavesOf(choices ?? {}).filter(([d]) => d !== dimension);
  if (value !== null && value !== undefined && value !== own) leaves.push([dimension, value]);
  return nestedOf(leaves);
}

/**
 * 把「目前不提供」的選擇拿掉（量測排除的、design 的、與模板／變體不相容的）。
 * 存檔裡的計畫只驗結構，所以可能帶著後來被排除的選擇（或在 v20 規則集下用不到的每時期選擇，opts.tacticalDirector）；畫面載入時一律先過這一關，
 * 送出的計畫才會與畫面上看得到的選項一致。逐一檢查：每個選擇都要在「其他選擇已套用」的前提下仍被提供。
 * @returns {{ choices: object, dropped: Array<{dimension:string, choice:string}> }}
 */
export function offeredChoicesOnly(templateId, overlayIds = [], choices = {}, opts = {}) {
  let leaves;
  try { leaves = leavesOf(choices ?? {}); } catch { return { choices: {}, dropped: [] }; }
  const dropped = [];
  for (let changed = true; changed;) {
    changed = false;
    let rows;
    try { rows = Object.fromEntries(tacticBookOptions(templateId, overlayIds, nestedOf(leaves), opts).map((r) => [r.dimension, r])); } catch { rows = {}; }
    for (const [dim, v] of leaves) {
      const row = rows[dim];
      //  要畫得出來才留：這個維度至少有兩個選項，而且這個值在裡面。
      if (!row || row.offered.length < 2 || !row.offered.includes(v)) {
        dropped.push({ dimension: dim, choice: String(v) });
        leaves = leaves.filter(([d]) => d !== dim);
        changed = true;
        break;
      }
    }
  }
  return { choices: nestedOf(leaves), dropped };
}

/**
 * 整個戰術書畫面要畫的東西。
 * @param {object} o
 * @param {string} o.templateId
 * @param {string[]} [o.overlayIds]   變體（由畫面依俱樂部專精的資格決定要不要帶）
 * @param {object} [o.choices]        巢狀選擇
 * @param {Array|object} [o.seatPlayers]  buildPlayerStatSlots 的輸出
 * @param {Function|object} [o.heroLookup]  (seat) → 英雄戰鬥原型
 * @param {string} [o.tacticalDirector]  目前規則集的 Director 模式（缺少 ≡ "static"＝v20：不畫需要每時期方針的維度）
 * @returns {{ok:true, plan, binding, config, dimensions, groups, profile, seats, load, contradictions} | {ok:false, errors}}
 */
export function tacticBookView({ templateId, overlayIds = [], choices = {}, seatPlayers = null, heroLookup = null, tacticalDirector = "static" } = {}) {
  const created = createTacticPlan({ templateId, overlayIds, choices });
  if (!created.ok) return { ok: false, errors: created.errors };
  const plan = created.plan;
  const binding = bindTacticPlanToCurrentVersions(plan);
  if (!binding) return { ok: false, errors: [{ code: "bind_failed", field: "", message: "這份計畫無法綁定目前的資料版本" }] };
  const tpl = templateById(plan.templateId);
  const config = mergeTacticConfig(tpl, plan.overlayIds, plan.choices);
  const explicit = Object.fromEntries(leavesOf(plan.choices));
  const dimensions = tacticBookOptions(plan.templateId, plan.overlayIds, plan.choices, { tacticalDirector })
    //  只有一個可選（＝模板自己的值）的維度不畫：沒有東西可以選。
    .filter((row) => row.offered.length >= 2)
    .map((row) => {
      const value = Object.hasOwn(explicit, row.dimension) ? explicit[row.dimension] : row.own;
      return {
        dimension: row.dimension,
        group: DIMENSION_LABELS[row.dimension]?.group ?? "team",
        label: dimensionLabel(row.dimension),
        own: row.own,
        value,
        explicit: Object.hasOwn(explicit, row.dimension),
        //  模板在這個維度的數值不等於任何一個選項（例如速推流的風險 0.6 介於平衡與大膽之間）⇒ 沒有選項可以標成「預設」，
        //  畫面另外畫一顆「模板值」代表「跟著模板」。
        templateCustom: row.own === null,
        choices: row.offered.map((c) => ({ id: c, label: choiceLabel(row.dimension, c), selected: c === value, isTemplateDefault: c === row.own })),
      };
    });
  const groups = DIMENSION_GROUPS.map((g) => ({ ...g, dimensions: dimensions.filter((d) => d.group === g.id) })).filter((g) => g.dimensions.length);
  const profile = planProfile(binding);
  return {
    ok: true, plan, binding, config, dimensions, groups,
    profile: PROFILE_AXES.map((axis) => ({ axis, label: PROFILE_AXIS_LABELS[axis], value: profile[axis] })),
    seats: (() => { const fit = seatMissionFit({ binding, seatPlayers, heroLookup }); return SEATS.map((seat) => ({ seat, label: SEAT_LABELS[seat], missionLabel: MISSION_LABELS[fit[seat].mission] ?? fit[seat].mission, ...fit[seat] })); })(),
    load: coordinationLoad(binding, seatPlayers),
    contradictions: contradictions(binding),
  };
}
