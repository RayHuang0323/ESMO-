// ============================================================================
//  platform/online/index.js — Online Foundation 的唯一公開入口
//
//  四個部件，全部是純函式／純物件，沒有網路呼叫、沒有持久化：
//    ① 權威 ServerTime 的客戶端同步（serverTimeAuthority）
//    ② Ranked 戰績／配額的後端邊界（rankedAuthorityGateway）＋ SQL：supabase/migrations/0002
//    ③ 伺服器簽章快照（signedSnapshot）
//    （CS 線上快照 csSquadSnapshot 延後：需先登記 CS 模擬版本，見 TD-58）
//    （mock ranked authority 只在 tools/lib/localRankedAuthority.mjs，不從這裡匯出）
//    ④ v2A：本場戰鬥天賦綁定（battleTalentBinding）、伺服器簽發的票券（matchTicket）、
//       伺服器裁決的最小介面（matchAdjudication）——客戶端只驗，簽章與裁決只在伺服器
//  設計：docs/design/Online_Foundation_v1.md、docs/design/Online_Foundation_v2A.md
//  ⚠ 不含配對、即時 PvP、排行榜、Live Tournament、CBR 數值；`COMPETITIVE_ENABLED` 仍為 false。
//  ⚠ v2A 契約目前**沒有任何畫面或 Store import**（Ranked UI 不在本輪）。
// ============================================================================
export {
  SERVER_TIME_SAMPLE_VERSION, SERVER_TIME_POLICY,
  createServerTimeSample, createSyncedServerClock, createServerDayGuard,
} from "./serverTimeAuthority.js";
export {
  RANKED_GATEWAY_VERSION, RANKED_GATEWAY_METHODS, FORBIDDEN_CLIENT_METHODS,
  validateRankedGateway,
} from "./rankedAuthorityGateway.js";
export {
  SIGNED_SNAPSHOT_VERSION, SIGNATURE_ALGS, LOCAL_UNSIGNED,
  validateEnvelopeShape, createUnsignedEnvelope, signingBytes, attachSignature,
  verifySignedSnapshot, verifyEnvelopeSignature, webCryptoEd25519Verifier,
} from "./signedSnapshot.js";
export {
  BATTLE_TALENT_BINDING_VERSION, TALENT_BINDING_MODES, CS_TALENT_UNSUPPORTED, FORBIDDEN_TALENT_KEYS,
  createBattleTalentBinding, validateBattleTalentBinding, talentBindingHashOf, talentSelectionsOf, hasBattleTalents,
} from "./battleTalentBinding.js";
export {
  MATCH_TICKET_VERSION, MATCH_TICKET_REQUEST_VERSION, TICKET_MODES, TICKET_POLICY, CS_TICKET_DEFERRED,
  FORBIDDEN_TICKET_REQUEST_KEYS, createTicketRequest, validateTicketRequest, validateTicketShape,
  createUnsignedTicket, verifyMatchTicket, ticketBindsEntry,
} from "./matchTicket.js";
export {
  ADJUDICATION_INPUTS_VERSION, ADJUDICATED_RESULT_VERSION, SERVER_AUTHORITY_INTERFACE,
  adjudicationInputsHashOf, createAdjudicationInputs, validateAdjudicatedShape, createUnsignedAdjudication,
  verifyAdjudicatedResult, competitiveOutcomeOf, revalidateTicketTalents,
} from "./matchAdjudication.js";
