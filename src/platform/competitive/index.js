// ============================================================================
//  platform/competitive/index.js — 競技排位（Competitive）的**唯一公開入口**
//
//  畫面、Store、未來的後端轉接層一律從這裡 import，不直接深入各檔。
//  ⚠ 本目錄全部是純函式：沒有 Store、沒有持久化、沒有網路。
//    `COMPETITIVE_ENABLED = false`，且沒有權威伺服器時間 ⇒ 入口恆為不可用。
//  設計與邊界：docs/design/Competitive_Enablement_v1.md
// ============================================================================
export {
  COMPETITIVE_MODE_VERSION, COMPETITIVE_ENABLED, COMPETITIVE_MODE,
  SEASON_LEDGER_KEYS, CAREER_WRITE_KEYS, findSeasonLedgerKeys, findCareerWriteKeys,
  competitiveAvailability,
} from "./competitiveMode.js";
export { RATED_QUOTA, ratedQuotaOf, consumeRatedQuota } from "./ratedQuota.js";
export {
  COMPETITIVE_RESULT_VERSION, COMPETITIVE_RECORD_VERSION, COMPETITIVE_RECORD_OWNER, HISTORY_LIMIT,
  emptyCompetitiveRecord, createCompetitiveResult, validateCompetitiveResult, applyCompetitiveResult,
} from "./competitiveRecord.js";
export {
  CBR_PIPELINE_VERSION, CBR_STAGES, DEFAULT_CBR_POLICIES,
  UNSET_CAP_POLICY, OPEN_BRACKET_POLICY, UNRATED_POLICY,
  validateCbrPolicies, evaluateCbr,
} from "./cbrPipeline.js";
export { COMPETITIVE_ENTRY_VERSION, CS_ENTRY_DEFERRED, buildCompetitiveEntry, powerInputsOf } from "./rosterBridge.js";
export {
  SERVER_TIME_VERSION, createServerClock, serverDayOf,
} from "../time/serverClock.js";
