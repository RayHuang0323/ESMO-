// ============================================================================
//  battle/moba/matchAssemblerDeps.js — 組裝器 deps 的唯一來源（Phase 3a Task 4；Task 5 拆出 core）
//
//  【為什麼要有】`assembleMatch(setup, deps)` 的引擎與三個英雄 adapter 由呼叫端注入（組裝器本身
//  不得碰 heroDatabase.js，見 matchAssembler.js 檔頭）。注入點一多，「同一份 setup 在兩個呼叫點
//  組出不同的引擎」就只差一個手拼的 deps 物件。⇒ 正式呼叫端（src/，排除 src/debug/**）一律從這裡
//  （或 core）取 deps；tools/check_live_setup_3a.mjs §S 掃原始碼守住。
//
//  【兩層】
//   · matchAssemblerDepsCore.js：adapter 清單＋manifest＋指紋（唯一一份），**沒有預設查表**。
//     查表由呼叫端注入的場合（Challenge runner）直接用 core 的 buildMatchAssemblerDepsFrom。
//   · 本檔（Live 用的那一層）：在 core 上補預設查表 heroDatabase.heroById 與模組內單例。
//     ⚠ 本檔靜態 import heroDatabase.js（~396KB data URI）——這正是它存在的理由：把重模組留在
//       組裝器與 core 的**直接**import 之外，由呼叫端（已經載入英雄表的那一側）帶進來。
//
//  【manifest → applied.depsFingerprint】
//   每一份 deps 都帶一份凍結的 `manifest`：引擎標記（模擬版本＋CombatState 契約）、heroLookup 來源、
//   各 adapter 模組匯出的契約常數。和正式值不同的注入（覆寫函式、別棵原始碼樹的引擎）一律標成
//   `override:<名稱>`／呼叫端給的 marker ⇒ 兩個呼叫點只要 deps 不同，指紋就不同。
//   組裝器把 manifest 雜湊成 `applied.depsFingerprint`（沒有 manifest 的手拼 deps 也有指紋，但標成 unmanaged）。
//
//  【執行環境】純 ESM、無瀏覽器 API ⇒ 瀏覽器（Vite）與 Node 工具都能 import。
// ============================================================================
import { heroById, CHAMPIONS_100 } from "../../data/heroDatabase.js";
import { buildMatchAssemblerDepsFrom, MATCH_ASSEMBLER_DEPS_VERSION } from "./matchAssemblerDepsCore.js";

export { MATCH_ASSEMBLER_DEPS_VERSION };

/**
 * 建一份組裝器 deps。不帶參數 ⇒ 正式 deps（與 sharedMatchAssemblerDeps() 指紋相同）。
 * 覆寫只給工具／測試用（例如平衡工具從另一棵原始碼樹載入引擎），manifest 會如實標出覆寫。
 *
 * @param {object} [o]
 * @param {Function} [o.LogicEngine]   引擎類別（預設 src/LogicEngine.js）
 * @param {string}   [o.engineMarker]  覆寫引擎時的標記（例如 "tree:<commit>"）；未給 ⇒ override:<類別名>
 * @param {Function} [o.heroLookup]    heroId → hero（預設 heroDatabase.heroById）
 * @param {object}   [o.heroAdapters]  局部覆寫 { toEngineHeroSkills, selectBattleTalents, battleTalentOptions,
 *                                      toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION }
 * @returns {Readonly<{ LogicEngine, heroLookup, heroAdapters, manifest }>}
 */
export function buildMatchAssemblerDeps({ LogicEngine, engineMarker = null, heroLookup = heroById, heroAdapters = {} } = {}) {
  return buildMatchAssemblerDepsFrom({
    ...(LogicEngine === undefined ? {} : { LogicEngine }), engineMarker, heroLookup, heroAdapters,
    heroLookupLabel: heroLookup === heroById ? `heroDatabase.heroById@${CHAMPIONS_100.length}` : null,
  });
}

let shared = null;
/** 正式呼叫端用的 deps（模組內單例；凍結）。 */
export function sharedMatchAssemblerDeps() {
  if (!shared) shared = buildMatchAssemblerDeps();
  return shared;
}
