// ============================================================================
//  platform/online/battleTalentBinding.js — BattleTalentBinding.v1（Online Foundation v2A）
//
//  ── 為什麼需要這一層 ────────────────────────────────────────────────────────
//  v15 起玩家在戰術頁為每個席位選一個戰鬥天賦（`HeroBattleTalent.v1`），它會**改變模擬**。
//  `SquadSnapshot.v1` 不含它：天賦綁的是**本場選到的英雄**，選角之前不存在，
//  所以它是「這一場」的輸入，不是「這支隊伍」的輸入。
//  ⇒ Ranked 開放前，票券與裁決輸入必須帶本場的天賦 ID，否則伺服器重算 ≠ 玩家實際出賽。
//
//  ── 契約 ────────────────────────────────────────────────────────────────────
//    · 客戶端只送**選擇**（席位 → 天賦 ID），不送任何數值（倍率、效果、欄位）。
//    · 解析只走引擎用的那一支 `selectBattleTalents()`——同一個函式、同一套 AI 補位，
//      不另寫第二套解析。沒選的席位照引擎規則由 AI 決定性補上（`source:"ai"`）。
//    · 天賦 ID 必須屬於**該席位本場的英雄**，否則拒絕（不替玩家改成別的）。
//    · `bindingHash` 只涵蓋會影響模擬的欄位（席位、英雄、天賦 ID、天賦契約版本、模擬版本）。
//    · **只支援 MOBA**。CS 沒有戰鬥天賦，也沒有登記的模擬版本（TD-58）⇒ 一律拒，不猜、不補資料。
//
//  ⚠ 不改 `SquadSnapshot.v1`：改它會讓已上線 Player Challenge 的防守快照雜湊全部變動。
//  純函式：不 import React / zustand / localStorage / Supabase SDK，不讀時鐘。
// ============================================================================
import {
  HERO_BATTLE_TALENT_CONTRACT, battleTalentById, battleTalentOptions, selectBattleTalents,
} from "../../battle/moba/talents/heroBattleTalents.js";
import { MOBA_SIMULATION_VERSION } from "../contracts/simulationVersion.js";
import { stableHash, stableStringify } from "../contracts/squadSnapshot.js";

export const BATTLE_TALENT_BINDING_VERSION = "BattleTalentBinding.v1";
export const TALENT_BINDING_MODES = Object.freeze(["moba"]);
export const CS_TALENT_UNSUPPORTED = Object.freeze({
  code: "cs_talent_unsupported", message: "CS 沒有戰鬥天賦契約（且 CS 模擬版本未登記，TD-58），不建立天賦綁定",
});
const SIDE_SEATS = Object.freeze({ b: ["b1", "b2", "b3", "b4", "b5"], r: ["r1", "r2", "r3", "r4", "r5"] });
const ALL_SEATS = Object.freeze([...SIDE_SEATS.b, ...SIDE_SEATS.r]);

/** 選擇單上不得出現的鍵：出現代表客戶端在送數值，不是在送選擇。 */
export const FORBIDDEN_TALENT_KEYS = Object.freeze([
  "effects", "multiplier", "field", "primitive", "slot", "trigger", "value", "stats", "power",
]);

const heroIdOf = (entry) => entry?.hero?.id ?? entry?.heroId ?? entry?.id ?? null;

/** 只取影響模擬的欄位 → 雜湊。 */
export function talentBindingHashOf(binding) {
  return stableHash(stableStringify({
    contract: binding?.contract ?? null,
    simulationVersion: binding?.simulationVersion ?? null,
    seats: Object.fromEntries(ALL_SEATS.filter((s) => binding?.seats?.[s]).map((s) => [s, {
      heroId: binding.seats[s].heroId, talentId: binding.seats[s].talentId,
    }])),
  }));
}

/**
 * 由本場名單＋玩家的選擇建立天賦綁定。
 *
 * @param {object} p
 * @param {"moba"|"cs"} p.mode
 * @param {object} p.roster     本場名單 { b1..r5: { hero:{id} | heroId } }（選角之後）
 * @param {object} [p.requested]  玩家的選擇 { seat: talentId }——只准己方席位
 * @param {"b"|"r"} [p.side]    玩家這一方（預設藍方 b）
 * @param {string} [p.simulationVersion]
 */
export function createBattleTalentBinding({
  mode = "moba", roster = null, requested = {}, side = "b", simulationVersion = MOBA_SIMULATION_VERSION,
} = {}) {
  if (mode === "cs") return { ok: false, binding: null, errors: [{ ...CS_TALENT_UNSUPPORTED }] };
  if (!TALENT_BINDING_MODES.includes(mode)) return { ok: false, binding: null, errors: [{ code: "mode", message: `未知的模式：${mode}` }] };
  const errors = [];
  if (!SIDE_SEATS[side]) errors.push({ code: "side", message: `未知的陣營：${side}` });
  if (!roster || typeof roster !== "object") errors.push({ code: "roster", message: "缺少本場名單（天賦要在選角之後才能綁定）" });
  if (errors.length) return { ok: false, binding: null, errors };

  for (const seat of ALL_SEATS) {
    if (!heroIdOf(roster[seat])) errors.push({ code: "roster_seat", message: `席位 ${seat} 沒有英雄` });
  }
  const req = requested ?? {};
  if (typeof req !== "object" || Array.isArray(req)) errors.push({ code: "requested", message: "天賦選擇必須是 { 席位: 天賦ID }" });
  else {
    for (const [seat, id] of Object.entries(req)) {
      if (!SIDE_SEATS[side]?.includes(seat)) { errors.push({ code: "foreign_seat", message: `不能替 ${seat} 選天賦（不是己方席位）` }); continue; }
      if (typeof id !== "string") { errors.push({ code: "value_not_id", message: `席位 ${seat} 送的不是天賦 ID（只接受選擇，不接受數值）` }); continue; }
      const row = battleTalentById(id);
      const heroId = heroIdOf(roster[seat]);
      if (!row) errors.push({ code: "unknown_talent", message: `未知的天賦：${id}` });
      else if (row.heroId !== heroId) errors.push({ code: "talent_hero_mismatch", message: `天賦 ${id} 不屬於席位 ${seat} 的英雄 ${heroId}` });
    }
  }
  if (errors.length) return { ok: false, binding: null, errors };

  //  ⚠ 與引擎同一支解析（useLocalServer.start → selectBattleTalents）。
  const resolved = selectBattleTalents(roster, req);
  const seats = {};
  for (const seat of ALL_SEATS) {
    const r = resolved.players[seat];
    if (!r) continue;   // 該英雄沒有天賦選項 ⇒ 引擎也不套
    seats[seat] = { heroId: r.heroId, talentId: r.id, source: r.source };
  }
  const binding = {
    schema: BATTLE_TALENT_BINDING_VERSION,
    mode,
    contract: resolved.version,
    simulationVersion,
    side,
    seats,
  };
  return { ok: true, errors: [], binding: { ...binding, bindingHash: talentBindingHashOf(binding) } };
}

/** 綁定 → 引擎吃的 `talentSelections`（只回己方玩家的選擇；AI 補位由引擎同一支函式重做）。 */
export const talentSelectionsOf = (binding) => Object.fromEntries(
  Object.entries(binding?.seats ?? {}).filter(([seat, r]) => seat[0] === binding.side && r.source === "player").map(([seat, r]) => [seat, r.talentId]),
);

/**
 * 驗證一份綁定：形狀、雜湊、每個天賦 ID 都屬於該席位英雄。
 * 帶 `roster` 時另做**重算比對**：用同一份名單＋同一份選擇重解析，必須逐席位一致
 * （伺服器裁決前就是做這件事）。
 */
export function validateBattleTalentBinding(binding, { roster = null } = {}) {
  const errors = [];
  if (!binding || binding.schema !== BATTLE_TALENT_BINDING_VERSION) return { ok: false, errors: [{ code: "schema", message: `schema 必須為 ${BATTLE_TALENT_BINDING_VERSION}` }] };
  if (binding.mode === "cs") return { ok: false, errors: [{ ...CS_TALENT_UNSUPPORTED }] };
  if (!TALENT_BINDING_MODES.includes(binding.mode)) errors.push({ code: "mode", message: `未知的模式：${binding.mode}` });
  if (binding.contract !== HERO_BATTLE_TALENT_CONTRACT) errors.push({ code: "contract", message: `天賦契約必須為 ${HERO_BATTLE_TALENT_CONTRACT}` });
  if (!binding.simulationVersion) errors.push({ code: "simulation_version", message: "缺少模擬版本" });
  if (binding.bindingHash !== talentBindingHashOf(binding)) errors.push({ code: "binding_hash", message: "天賦綁定雜湊不符——內容被改過" });
  for (const [seat, r] of Object.entries(binding.seats ?? {})) {
    if (!ALL_SEATS.includes(seat)) { errors.push({ code: "seat", message: `未知的席位：${seat}` }); continue; }
    const leaked = Object.keys(r ?? {}).filter((k) => FORBIDDEN_TALENT_KEYS.includes(k));
    if (leaked.length) errors.push({ code: "value_leak", message: `席位 ${seat} 帶了數值欄位：${leaked.join(", ")}` });
    const row = battleTalentById(r?.talentId);
    if (!row || row.heroId !== r?.heroId) errors.push({ code: "talent_hero_mismatch", message: `席位 ${seat} 的天賦 ${r?.talentId} 不屬於英雄 ${r?.heroId}` });
    if (r?.source !== "player" && r?.source !== "ai") errors.push({ code: "source", message: `席位 ${seat} 的天賦來源不合法：${r?.source}` });
  }
  if (!errors.length && roster) {
    const again = createBattleTalentBinding({
      mode: binding.mode, roster, requested: talentSelectionsOf(binding), side: binding.side, simulationVersion: binding.simulationVersion,
    });
    if (!again.ok) errors.push(...again.errors);
    else if (again.binding.bindingHash !== binding.bindingHash) errors.push({ code: "resolve_mismatch", message: "以本場名單重算的天賦與綁定不一致" });
  }
  return { ok: !errors.length, errors };
}

/** 該英雄有沒有天賦可選（畫面與 gate 用；不建立第二份清單）。 */
export const hasBattleTalents = (heroId) => battleTalentOptions(heroId).length > 0;
