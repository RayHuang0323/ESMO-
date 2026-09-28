// ============================================================================
//  platform/online/index.js — Online Foundation 的唯一公開入口
//
//  四個部件，全部是純函式／純物件，沒有網路呼叫、沒有持久化：
//    ① 權威 ServerTime 的客戶端同步（serverTimeAuthority）
//    ② Ranked 戰績／配額的後端邊界（rankedAuthorityGateway）＋ SQL：supabase/migrations/0002
//    ③ 伺服器簽章快照（signedSnapshot）
//    （CS 線上快照 csSquadSnapshot 延後：需先登記 CS 模擬版本，見 TD-58）
//    （mock ranked authority 只在 tools/lib/localRankedAuthority.mjs，不從這裡匯出）
//  設計：docs/design/Online_Foundation_v1.md
//  ⚠ 不含配對、即時 PvP、排行榜、Live Tournament、CBR 數值；`COMPETITIVE_ENABLED` 仍為 false。
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
  verifySignedSnapshot, webCryptoEd25519Verifier,
} from "./signedSnapshot.js";
