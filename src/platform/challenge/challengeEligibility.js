//  ════════════════════════════════════════════════════════════════════════
//   Slice 7：一場挑戰「算不算正式、能不能拿獎勵」的**唯一判定**
//
//   ⚠ 這裡**不發明任何獎勵數值**。repo 目前沒有任何 Challenge 獎勵契約
//     （`src/platform/challenge/` 全域搜尋不到 clubPoints/reward），
//     所以本檔只回答三個問題，把數字留給未來的 economy layer：
//         SETTLEMENT_CLASS ／ REWARD_ELIGIBLE ／ REWARD_REASON
//
//   ⚠ 判定鍵是**兩份快照的身分**，不是按鈕文案、不是 opponentKey：
//         challengerSnapshotHash + defenderSnapshotHash
//     換了自己的陣容、或對手換了快照，才是新的一場正式挑戰。
//     只靠 `kind === "formal"` 是擋不住刷的——`startFixtureChallenge`
//     每次都開 formal，對同一份快照連打十次就會有十筆正式紀錄。
//
//   ⚠ 這支必須在**建立時**與**結算時**各跑一次（見 profileStore）。
//     只在 UI 擋等於沒擋：reload、手改存檔、直接呼叫 runner 都繞得過去。
//  ════════════════════════════════════════════════════════════════════════
import { CHALLENGE_KINDS } from "../contracts/challengeInstance.js";
import { stableHash } from "../contracts/squadSnapshot.js";

//  ── Owner 裁示（2026-09-10，Slice 7 Review）─────────────────────────────
//    這三個計數是**三件事**，任何一個併回另一個都是回歸：
//
//                    observed   formal   eligible
//      首次 Formal     YES        YES      YES
//      Repeat          YES        NO       NO
//      Retry           NO         NO       NO
//      Rechallenge（對手快照身分**真的**改變後）
//                      YES        YES      YES
//
//    observed = 「你對這支隊伍打過幾場」（看板文案與候選位分類讀它）
//    formal   = 「算幾次正式挑戰」（`observedRecords(...).formal`）
//    eligible = 「這一場有沒有獎勵資格」（本檔的 `rewardEligible`）
//  ────────────────────────────────────────────────────────────────────────

/** 這一場在結算層的類別。 */
export const SETTLEMENT_CLASS = Object.freeze({
  /** 首次以這組陣容挑戰這份對手快照 ⇒ 正式紀錄 ＋ 具獎勵資格。 */
  formal: "formal",
  /** 同一組快照配對又打了一次 ⇒ 不計入正式紀錄、不具獎勵資格。 */
  repeat: "repeat",
  /** 再試一次（打同一份凍結快照）⇒ 恆不計入、恆無資格。 */
  retry: "retry",
});

export const REWARD_REASONS = Object.freeze({
  firstFormal: "首次以這組陣容挑戰這份對手快照",
  retry: "再試一次不計入正式紀錄，也不產生獎勵資格",
  repeatPair: "這組陣容對這份對手快照已經正式挑戰過",
});

/**
 * 一支隊伍的**身分**。
 *
 * ⚠ 這**不是**快照雜湊。快照雜湊含 `issuedAt`（發布時刻），所以同一支隊伍
 *   每簽發一次就換一個雜湊——拿它當防刷鍵等於沒擋：連打兩場的
 *   `challengerSnapshotHash` 本來就不同（實測 313d0da0 vs 另一個）。
 *   `snapshotAuthority.js` 自己的註解也講過同一件事：
 *   「狀態變了 ⇒ 快照雜湊變了 ⇒ 看起來像換了一支隊伍」。
 * ⚠ 所以身分 = 快照內容**扣掉發布時刻**：席位、能力、裝配、常規指令。
 *   換先發、換戰術、練了熟練 ⇒ 身分改變（本來就該算新的一場）。
 *   只是再按一次挑戰 ⇒ 身分不變。
 */
export function squadIdentityOf(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const { issuedAt, hash, ...rest } = snapshot;
  return stableHash(JSON.stringify(rest));
}

/**
 * 一場挑戰的「身分配對」。⚠ 兩邊都要：只看對手的話，玩家換自己的陣容
 * 也拿不到新紀錄；只看自己的話，換對手就刷不完了。
 *
 * ⚠ 優先用建立時凍結的 `identity`。舊資料沒有那個欄位 ⇒ 退回快照雜湊
 *   （行為與 Slice 7 之前相同，不追溯改寫既有紀錄）。
 */
export const pairKeyOf = (inst) => {
  const ch = inst?.identity?.challenger ?? inst?.challengerSnapshotHash ?? null;
  const df = inst?.identity?.defender ?? inst?.defenderSnapshotHash ?? null;
  return ch && df ? `${ch}::${df}` : null;
};

/**
 * 判定一場挑戰。
 *
 * @param {object}   instance   要判定的 ChallengeInstance
 * @param {object[]} priorInstances
 *   **這一場之前**已經存在的場次（順序不拘）。判定只看已經**結算過**的
 *   正式場次——沒打完的不算數，否則連點兩次「挑戰」就會互相把對方判成重複。
 * @returns {{ settlementClass:string, rewardEligible:boolean, rewardReason:string }}
 */
export function classifyChallenge(instance, priorInstances = []) {
  if (!instance) {
    return { settlementClass: SETTLEMENT_CLASS.repeat, rewardEligible: false, rewardReason: REWARD_REASONS.repeatPair };
  }
  if (instance.kind === CHALLENGE_KINDS.retry) {
    return { settlementClass: SETTLEMENT_CLASS.retry, rewardEligible: false, rewardReason: REWARD_REASONS.retry };
  }
  const key = pairKeyOf(instance);
  //  ⚠ 缺 hash ⇒ 判成 repeat（保守）。寧可少給資格，不可以因為資料不全就白送。
  if (!key) {
    return { settlementClass: SETTLEMENT_CLASS.repeat, rewardEligible: false, rewardReason: REWARD_REASONS.repeatPair };
  }
  const clash = priorInstances.some((p) => {
    if (!p || p.challengeId === instance.challengeId) return false;
    if (p.kind === CHALLENGE_KINDS.retry) return false;
    //  ⚠ 只有**已經打完**的才算佔位。用「存在即佔位」會讓一場沒跑完的
    //    場次永久卡住那個配對。
    if (!p.result) return false;
    return pairKeyOf(p) === key;
  });
  return clash
    ? { settlementClass: SETTLEMENT_CLASS.repeat, rewardEligible: false, rewardReason: REWARD_REASONS.repeatPair }
    : { settlementClass: SETTLEMENT_CLASS.formal, rewardEligible: true, rewardReason: REWARD_REASONS.firstFormal };
}

/**
 * 結算時的再驗。
 *
 * ⚠ 只會**往嚴格的方向**改：建立時判為 formal、結算時發現配對已被佔走，
 *   就降級成 repeat。反過來**永遠不會**把 repeat 升級成 formal——
 *   否則手改存檔（把先前那場的 result 刪掉）就能把資格洗回來。
 */
export function reconcileAtSettlement(stored, recomputed) {
  if (!stored) return recomputed;
  if (!recomputed.rewardEligible) return recomputed;
  if (!stored.rewardEligible) return stored;
  return recomputed;
}

/**
 * 看板／結果頁要顯示的三種狀態。
 *
 *   `available` 尚未正式挑戰過這個對手
 *   `played`    這組陣容對這份對手快照已經打過（再打不會有正式紀錄）
 *   `updated`   打過這個對手，但**他現在這份快照是新的** ⇒ 可以再打一場正式的
 *
 * ⚠ 判定一律看**快照身分**，不看名字、不看時間、更不看任何戰力估算。
 * ⚠ `updated` 不是我們生出來的：`defenderSnapshotHash` 變了才會出現。
 *   目前 fixture provider 的快照用固定 `issuedAt`，只有在對手等級隨玩家
 *   熟練度重算時才會換雜湊——所以這個狀態**不會被憑空製造**。
 */
export function formalStateFor({
  opponentKey = null, challengerIdentity = null, defenderIdentity = null, instances = [],
} = {}) {
  if (!defenderIdentity) return "unknown";
  const settledFormals = instances.filter((p) =>
    p?.result && p.kind !== CHALLENGE_KINDS.retry);

  //  這組配對打過了 ⇒ 再打不會有正式紀錄。
  if (challengerIdentity) {
    const key = `${challengerIdentity}::${defenderIdentity}`;
    if (settledFormals.some((p) => pairKeyOf(p) === key)) return "played";
  }

  //  這個對手打過，但那是**別份**快照 ⇒ 他更新了，可以再打一場正式的。
  if (opponentKey) {
    const forOpponent = settledFormals.filter((p) => p.opponentKey === opponentKey);
    if (forOpponent.length > 0) {
      return forOpponent.some((p) => (p.identity?.defender ?? p.defenderSnapshotHash) === defenderIdentity)
        ? "available"   // 同一份快照、但換了我方陣容 ⇒ 仍是新的一場正式挑戰
        : "updated";
    }
  }
  return "available";
}
