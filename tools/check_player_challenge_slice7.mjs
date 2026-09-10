#!/usr/bin/env node
// ============================================================================
//  Player Challenge Slice 7 — Lifecycle Closure & Repeat Control
//
//  執行：`node tools/check_player_challenge_slice7.mjs`
//
//  ⚠ 這支驗的是**判定層**，不是畫面。畫面 disable 一顆按鈕不算防刷：
//    reload、手改存檔、直接呼叫 runner 都繞得過去，所以這裡一律直接
//    對 `classifyChallenge` / `formalStateFor` / `observedRecords` 施壓。
//  ⚠ 本檔**不驗任何獎勵數值**——repo 目前沒有 Challenge 獎勵契約，
//    Slice 7 只產出 eligible / reason / class 三個欄位給未來的 economy layer。
// ============================================================================
import {
  classifyChallenge, reconcileAtSettlement, formalStateFor, pairKeyOf,
  SETTLEMENT_CLASS, REWARD_REASONS,
} from "../src/platform/challenge/challengeEligibility.js";
import { observedRecords } from "../src/platform/challenge/challengeBoard.js";
import { CHALLENGE_KINDS } from "../src/platform/contracts/challengeInstance.js";

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};

//  ── 素材：一場挑戰只需要四個欄位就能被判定 ────────────────────────────────
let n = 0;
const inst = ({ ch = "CH1", def = "DF1", kind = CHALLENGE_KINDS.formal, opponentKey = "rival_a",
  result = { outcome: "challengerWin" }, seed = null } = {}) => ({
  challengeId: `c${++n}`,
  challengerSnapshotHash: ch, defenderSnapshotHash: def,
  kind, opponentKey, result,
  matchSeed: seed ?? 1000 + n,
});

console.log("\n── ① A. 第一次正式挑戰 ⇒ eligible ──");
const first = inst();
const c1 = classifyChallenge(first, []);
ck("① SETTLEMENT_CLASS = formal", c1.settlementClass === SETTLEMENT_CLASS.formal, c1.settlementClass);
ck("① REWARD_ELIGIBLE = true", c1.rewardEligible === true);
ck("① REWARD_REASON 說得出為什麼", c1.rewardReason === REWARD_REASONS.firstFormal, c1.rewardReason);

console.log("\n── ② B. 同快照 Retry ⇒ not eligible ──");
const r1 = inst({ kind: CHALLENGE_KINDS.retry });
const c2 = classifyChallenge(r1, [first]);
ck("② SETTLEMENT_CLASS = retry", c2.settlementClass === SETTLEMENT_CLASS.retry, c2.settlementClass);
ck("② REWARD_ELIGIBLE = false", c2.rewardEligible === false);
//  ⚠ retry 的無資格必須是**無條件**的：就算它是史上第一場也不給。
ck("⭐ ② retry 即使沒有任何前例也不具資格",
  classifyChallenge(inst({ kind: CHALLENGE_KINDS.retry }), []).rewardEligible === false);

console.log("\n── ③ C. 連續 Retry ⇒ 正式紀錄不增加 ──");
const retries = Array.from({ length: 8 }, () => inst({ kind: CHALLENGE_KINDS.retry }));
const stateC = {
  instances: Object.fromEntries([first, ...retries].map((i) => [i.challengeId, i])),
  order: [first, ...retries].map((i) => i.challengeId),
};
for (const i of Object.values(stateC.instances)) {
  i.settlement = classifyChallenge(i, Object.values(stateC.instances).filter((p) => p.challengeId !== i.challengeId));
}
const recC = observedRecords(stateC);
ck("⭐ C. 打 1 場正式 ＋ 8 場 retry ⇒ 正式挑戰次數仍是 1",
  recC.rival_a?.challenged === 1, `challenged=${recC.rival_a?.challenged}`);
ck("⭐ C. 勝率沒有被 retry 洗動", recC.rival_a?.broke === 1 && recC.rival_a?.held === 0,
  JSON.stringify(recC.rival_a));

console.log("\n── ③b Owner 裁示：observed / formal / eligible 是三個計數 ──");
//            observed  formal  eligible
//  首次       YES       YES     YES
//  Repeat     YES       NO      NO
//  Retry      NO        NO      NO
//  ⚠ 這一節把裁示釘進 verifier：日後有人把 repeat 併回 formal，或把 repeat
//    從 observed 拿掉（我第一版就做錯過，弄壞了看板的 coldStart），這裡會紅。
{
  const f1 = inst();                        // 首次 formal
  const rep = inst({ seed: 777 });          // 同配對再打一場
  const ret = inst({ kind: CHALLENGE_KINDS.retry });
  const all = [f1, rep, ret];
  const st = {
    instances: Object.fromEntries(all.map((i) => [i.challengeId, i])),
    order: all.map((i) => i.challengeId),
  };
  f1.settlement = classifyChallenge(f1, []);
  rep.settlement = classifyChallenge(rep, [f1]);
  ret.settlement = classifyChallenge(ret, [f1]);
  const r = observedRecords(st).rival_a;
  ck("⭐ 首次 formal：formal ＋ eligible",
    f1.settlement.settlementClass === SETTLEMENT_CLASS.formal && f1.settlement.rewardEligible === true);
  ck("⭐ Repeat：observed 有增加", r.challenged === 2, `observed=${r.challenged}`);
  ck("⭐ Repeat：formal 沒有增加", r.formal === 1, `formal=${r.formal}`);
  ck("⭐ Repeat：不具 reward eligibility", rep.settlement.rewardEligible === false);
  ck("⭐ Retry：observed 沒有增加（是 2 不是 3）", r.challenged === 2, `observed=${r.challenged}`);
  ck("⭐ Retry：formal 沒有增加", r.formal === 1, `formal=${r.formal}`);
  ck("⭐ Retry：不具 reward eligibility", ret.settlement.rewardEligible === false);
  ck("③b 勝負數只算觀測到的那兩場", r.broke + r.held === r.challenged, JSON.stringify(r));
}

console.log("\n── ④ D. 換 seed 的 Retry 仍拿不回資格 ──");
//  ⚠ seed 不在判定鍵裡，這一條就是要證明「改 seed 沒用」。
const seeded = inst({ kind: CHALLENGE_KINDS.retry, seed: 999999 });
ck("⭐ D. 改 seed 的 retry 仍 not eligible",
  classifyChallenge(seeded, [first]).rewardEligible === false);
//  formal 但同配對、換 seed ⇒ 也不行（這才是真正想刷的人會做的事）
const sameFormal = inst({ seed: 424242 });
const cD = classifyChallenge(sameFormal, [first]);
ck("⭐ D. 同配對再開一場 formal（換 seed）⇒ 降為 repeat",
  cD.settlementClass === SETTLEMENT_CLASS.repeat && cD.rewardEligible === false, cD.settlementClass);
ck("④ 判定鍵不含 seed", pairKeyOf(sameFormal) === pairKeyOf(first), pairKeyOf(sameFormal));

console.log("\n── ⑤ E. 對手快照身分改變 ⇒ 可成為新的正式挑戰 ──");
const newSnap = inst({ def: "DF2" });
const cE = classifyChallenge(newSnap, [first]);
ck("⭐ E. 對手換了快照 ⇒ formal ＋ eligible",
  cE.settlementClass === SETTLEMENT_CLASS.formal && cE.rewardEligible === true, cE.settlementClass);
//  我方換陣容也算新的一場（Owner §3 明定判定鍵是「挑戰方身分 ＋ 對手身分」）
const myNew = inst({ ch: "CH2" });
ck("⑤ 我方換了出賽陣容 ⇒ 同樣是新的一場正式挑戰",
  classifyChallenge(myNew, [first]).rewardEligible === true);

console.log("\n── ⑥ F. reload 後 eligibility 不變 ──");
//  ⚠ 判定只讀「已結算的先前場次」，是純函式 ⇒ 同一份存檔重算必然同值。
const prior = [first, ...retries];
const a = classifyChallenge(sameFormal, prior);
const b = classifyChallenge(sameFormal, [...prior].reverse());
ck("⭐ F. 重算結果與順序無關（reload 不會改變資格）",
  JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a));
ck("⑥ 重算兩次完全相同",
  JSON.stringify(classifyChallenge(first, [])) === JSON.stringify(classifyChallenge(first, [])));

console.log("\n── ⑦ G. 繞過 UI 直接結算 ⇒ 仍拿不到重複收益 ──");
//  情境：畫面上那顆按鈕被 disable，但有人直接呼叫 runner／改存檔。
//  結算層的 `reconcileAtSettlement` 必須把它壓回 repeat。
const storedEligible = { settlementClass: SETTLEMENT_CLASS.formal, rewardEligible: true, rewardReason: REWARD_REASONS.firstFormal };
const recomputedRepeat = classifyChallenge(sameFormal, [first]);
const reconciled = reconcileAtSettlement(storedEligible, recomputedRepeat);
ck("⭐ G. 建立時判 formal、結算時發現重複 ⇒ 降級為 repeat",
  reconciled.rewardEligible === false && reconciled.settlementClass === SETTLEMENT_CLASS.repeat,
  JSON.stringify(reconciled));
//  ⚠ 反方向**永遠不可以**：把先前那場的 result 刪掉不能把資格洗回來。
const storedRepeat = { settlementClass: SETTLEMENT_CLASS.repeat, rewardEligible: false, rewardReason: REWARD_REASONS.repeatPair };
const recomputedFormal = classifyChallenge(sameFormal, []);
ck("⭐ G. 已判 repeat 的場次不會被重算成 formal（刪掉前例也洗不回來）",
  reconcileAtSettlement(storedRepeat, recomputedFormal).rewardEligible === false,
  JSON.stringify(reconcileAtSettlement(storedRepeat, recomputedFormal)));

console.log("\n── ⑧ 看板狀態：三種，且不憑空製造「對手更新」 ──");
const boardInstances = [first];
ck("⑧ 沒打過的對手 ⇒ available",
  formalStateFor({ opponentKey: "rival_b", challengerIdentity: "CH1", defenderIdentity: "DFX", instances: boardInstances }) === "available");
ck("⑧ 同配對打過 ⇒ played",
  formalStateFor({ opponentKey: "rival_a", challengerIdentity: "CH1", defenderIdentity: "DF1", instances: boardInstances }) === "played");
ck("⭐ ⑧ 對手換了快照 ⇒ updated",
  formalStateFor({ opponentKey: "rival_a", challengerIdentity: "CH1", defenderIdentity: "DF2", instances: boardInstances }) === "updated");
ck("⑧ 只有 retry 紀錄 ⇒ 不算打過（不會誤標成 played）",
  formalStateFor({ opponentKey: "rival_a", challengerIdentity: "CH1", defenderIdentity: "DF9",
    instances: [inst({ def: "DF9", kind: CHALLENGE_KINDS.retry })] }) === "available");
ck("⑧ 沒打完的場次不佔位",
  formalStateFor({ opponentKey: "rival_a", challengerIdentity: "CH1", defenderIdentity: "DF8",
    instances: [inst({ def: "DF8", result: null })] }) === "available");

console.log("\n── ⑨ 保守失敗：資料不全一律不給資格 ──");
ck("⑨ 缺 challengerSnapshotHash ⇒ 不具資格",
  classifyChallenge({ challengeId: "x", defenderSnapshotHash: "DF1", kind: CHALLENGE_KINDS.formal }, []).rewardEligible === false);
ck("⑨ 缺 defenderSnapshotHash ⇒ 不具資格",
  classifyChallenge({ challengeId: "x", challengerSnapshotHash: "CH1", kind: CHALLENGE_KINDS.formal }, []).rewardEligible === false);
ck("⑨ null instance ⇒ 不具資格", classifyChallenge(null, []).rewardEligible === false);

console.log("\n── ⑩ 舊資料相容：沒有 settlement 欄位的既有紀錄不被改寫 ──");
const legacy = { challengeId: "old1", opponentKey: "rival_c", kind: CHALLENGE_KINDS.formal,
  challengerSnapshotHash: "OLD", defenderSnapshotHash: "OLDDF", result: { outcome: "defenderWin" } };
const recLegacy = observedRecords({ instances: { old1: legacy }, order: ["old1"] });
ck("⑩ 舊紀錄（無 settlement）仍計入正式挑戰次數",
  recLegacy.rival_c?.challenged === 1, JSON.stringify(recLegacy.rival_c));

console.log("\n── ⑪ 反向測試：拿掉配對判定，⭐ 那幾條必須紅 ──");
//  ⚠ 檢定力證明。如果「只看 kind」也能全綠，代表上面驗的其實不是防刷。
const kindOnly = (i) => ({
  settlementClass: i.kind === CHALLENGE_KINDS.retry ? SETTLEMENT_CLASS.retry : SETTLEMENT_CLASS.formal,
  rewardEligible: i.kind !== CHALLENGE_KINDS.retry,
});
ck("⑪ 只看 kind 的話，同配對重打會被誤判為可領獎 ⇒ 證明配對判定是必要的",
  kindOnly(sameFormal).rewardEligible === true && classifyChallenge(sameFormal, [first]).rewardEligible === false);

console.log(`\nPlayer Challenge Slice 7：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
process.exit(fail === 0 ? 0 : 1);
