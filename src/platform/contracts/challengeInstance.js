// ============================================================================
//  platform/contracts/challengeInstance.js — ChallengeInstance.v1（Player Challenge Slice 1）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  一場 Challenge 的**身分**與**不可變輸入**。它回答兩個不同的問題，
//  而這兩個問題**必須用兩個不同的欄位**回答：
//
//    · `challengeId` —— 「這是不是同一場？」  ⇒ 去重 / 重整恢復 / resume / 結果冪等
//    · `matchSeed`   —— 「這一場怎麼跑？」    ⇒ 模擬的隨機起點
//
//  ⚠ **兩者刻意不相等，也不由對方推導。**
//
//  ── 為什麼 seed 不能由內容雜湊產生（Owner 裁示，取代初版設計）────────────
//  初版寫 `seed = hash(兩份快照 ＋ 兩邊戰術)`。那確實買到可重播，
//  但也買到一件沒人要的東西：**同一組 matchup 永遠只有一種結果**
//  ⇒ 解過一次就永遠解完，Player Challenge 變成可窮舉的決定性謎題。
//
//  ⇒ `matchSeed` 是**單一 challenge instance 的不可變屬性**：
//    權威層在建立時一次性取得、立即凍結、此後永不重算。
//
//      IDEMPOTENT_SAME_CHALLENGE      = YES   同一場永遠讀同一個 matchSeed
//      REPLAY_DETERMINISTIC           = YES   reload / resume / replay / 重驗一致
//      SAME_LINEUP_ALWAYS_SAME_RESULT = NO    新的一場可以有新的 seed
//
//  ⚠ 這其實是**回到既有契約原本的形狀**：`MatchSession.v1` 一直都把 seed
//    當成「場次的屬性、由簽發者給、綁一次性 launchToken」，
//    從來不是由內容推導出來的。
//
//  ── 由此得到的一條實作紅線 ────────────────────────────────────────────────
//  ⚠ **去重的鍵是 `challengeId`，不是輸入內容的雜湊。**
//    用內容雜湊會把兩場**合法的不同 challenge** 誤判成同一場，
//    玩家會看到「我的第二次挑戰沒有發生」。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
//  ⚠ 亂數與時鐘由呼叫端（權威層）注入 ⇒ 契約層本身完全決定性、可測試。
// ============================================================================
import { MOBA_SIMULATION_VERSION, canReplay } from "./simulationVersion.js";
import { stableHash, validateSquadSnapshot } from "./squadSnapshot.js";

export const CHALLENGE_INSTANCE_VERSION = "ChallengeInstance.v1";

/**
 * 狀態機。
 *   created   已建立，尚未跑模擬
 *   settled   已產生結果（**終局**）
 *   abandoned 玩家放棄（**終局**）
 *
 * ⚠ 刻意**沒有** `running`：模擬是同步純函式，沒有「正在跑」這個可觀察狀態。
 *   加一個假的中間態，只會讓重整恢復多一條沒有意義的分支。
 */
export const CHALLENGE_STATES = Object.freeze({
  created: "created",
  settled: "settled",
  abandoned: "abandoned",
});
export const CHALLENGE_TERMINAL = Object.freeze([CHALLENGE_STATES.settled, CHALLENGE_STATES.abandoned]);

const TRANSITIONS = Object.freeze({
  created: ["settled", "abandoned"],
  settled: [],
  abandoned: [],
});
export const canTransitionChallenge = (from, to) => (TRANSITIONS[from] ?? []).includes(to);

/** 引擎慣例：seed 必須是奇數（見 `useLocalServer.js` 的 `| 1`）。 */
export const toEngineSeed = (n) => ((Number(n) >>> 0) | 1) >>> 0;

/**
 * 建立一場 challenge。
 *
 * @param {object}   p
 * @param {object}   p.challenger        挑戰方 SquadSnapshot.v1
 * @param {object}   p.defender          防守方 SquadSnapshot.v1
 * @param {string}   p.challengerTacticId 挑戰方**本場**選的戰術（可與快照預存不同）
 * @param {number}   p.seedSource        ⚠ 權威層一次性取得的亂數（**不是**內容推導）
 * @param {number}   p.createdAt         權威層給的時刻
 * @param {string}   p.issuedBy          簽發者標記
 * @param {string}   [p.nonce]           讓同一組輸入也能開出不同 challengeId 的區別碼
 * @returns {{ ok:boolean, challenge:object|null, errors:Array }}
 */
/** 挑戰種類（Slice 3）。⚠ `retry` 恆不產生獎勵，見架構文件 §7.3。 */
export const CHALLENGE_KINDS = Object.freeze({
  /** 正式挑戰：抓對方**最新**快照，計入觀測紀錄。 */
  formal: "formal",
  /** 再試一次：打**同一份舊快照**，可改我方陣容與戰術，**不計入紀錄、不給獎勵**。 */
  retry: "retry",
});

export function createChallengeInstance({
  challenger = null, defender = null, challengerTacticId = null,
  seedSource = null, createdAt = null, issuedBy = null, nonce = null,
  //  Slice 3：看板與歷史需要知道「打的是誰」與「這是不是重試」。
  //  ⚠ `opponentKey` 只是**身分標籤**，不含任何戰力資訊。
  opponentKey = null, kind = CHALLENGE_KINDS.formal,
} = {}) {
  const errors = [];
  const cv = validateSquadSnapshot(challenger);
  if (!cv.ok) errors.push(...cv.errors.map((e) => ({ ...e, code: `challenger_${e.code}` })));
  const dv = validateSquadSnapshot(defender);
  if (!dv.ok) errors.push(...dv.errors.map((e) => ({ ...e, code: `defender_${e.code}` })));
  if (!challengerTacticId) errors.push({ code: "tactic", message: "挑戰方必須指定本場戰術" });
  if (!Number.isFinite(seedSource)) errors.push({ code: "seed", message: "matchSeed 必須由權威層提供（不得由內容推導）" });
  if (!Number.isFinite(createdAt)) errors.push({ code: "created_at", message: "缺少建立時刻" });
  if (!issuedBy) errors.push({ code: "authority", message: "challenge 必須由權威層簽發" });
  if (errors.length) return { ok: false, challenge: null, errors };

  //  ⚠ 兩份快照的模擬版本必須一致，否則這一場從一開始就重播不出來。
  if (challenger.simulationVersion !== defender.simulationVersion) {
    return {
      ok: false, challenge: null,
      errors: [{ code: "simulation_version", message: `雙方模擬版本不同（${challenger.simulationVersion} / ${defender.simulationVersion}）` }],
    };
  }

  //  ── challengeId：**身分**，不是內容指紋 ────────────────────────────────
  //  它含 `nonce` 與 `createdAt` ⇒ 同樣兩份快照、同樣戰術可以開出**第二場**，
  //  而那第二場不會被誤判成重複。
  //  ⚠ 內容仍然進 id，是為了讓「同一場」在重整之後算得出同一個 id；
  //    但**光靠內容不足以構成 id**，這正是與初版的差別。
  const contentPart = stableHash([
    challenger.hash, defender.hash, challengerTacticId, defender.standingOrders.tacticId,
  ].join("|"));
  const instancePart = stableHash(`${nonce ?? ""}|${createdAt}|${seedSource}`);
  const challengeId = `chal:${contentPart}:${instancePart}`;

  return {
    ok: true, errors: [],
    challenge: {
      schema: CHALLENGE_INSTANCE_VERSION,
      challengeId,
      //  ⚠ 只存**雜湊引用**，不存快照內容：快照本身另外儲存，
      //    一份快照可能被很多場 challenge 引用，複製進來就會有很多份真相。
      challengerSnapshotHash: challenger.hash,
      defenderSnapshotHash: defender.hash,
      challengerTacticId: String(challengerTacticId),
      defenderTacticId: String(defender.standingOrders.tacticId),
      opponentKey: opponentKey ? String(opponentKey) : null,
      kind: kind in CHALLENGE_KINDS ? kind : CHALLENGE_KINDS.formal,
      //  ⚠ **凍結**：建立時取一次，之後任何路徑都只能讀，不得重新產生。
      matchSeed: toEngineSeed(seedSource),
      simulationVersion: challenger.simulationVersion ?? MOBA_SIMULATION_VERSION,
      createdAt,
      issuedBy,
      status: CHALLENGE_STATES.created,
      result: null,
    },
  };
}

/**
 * 驗證一場 challenge 的形狀。
 *
 * ⚠ 這裡**不驗**「seed 是不是從內容算出來的」——那正是本版不要的性質。
 *   要驗的是相反的事：seed 存在、是奇數、而且**沒有變過**（見 `assertSeedFrozen`）。
 */
export function validateChallengeInstance(c) {
  const errors = [];
  if (!c || typeof c !== "object") return { ok: false, errors: [{ code: "invalid", message: "challenge 不是物件" }] };
  if (c.schema !== CHALLENGE_INSTANCE_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${CHALLENGE_INSTANCE_VERSION}` });
  if (typeof c.challengeId !== "string" || !c.challengeId.startsWith("chal:")) {
    errors.push({ code: "challenge_id", message: "challengeId 無效" });
  }
  if (!Number.isFinite(c.matchSeed) || (c.matchSeed & 1) !== 1) {
    errors.push({ code: "match_seed", message: "matchSeed 必須是奇數整數（引擎慣例）" });
  }
  if (!c.simulationVersion) errors.push({ code: "simulation_version", message: "缺少 simulationVersion" });
  if (!c.challengerSnapshotHash || !c.defenderSnapshotHash) {
    errors.push({ code: "snapshot_ref", message: "缺少雙方快照雜湊" });
  }
  if (!c.issuedBy) errors.push({ code: "authority", message: "challenge 沒有簽發者" });
  if (!(c.status in CHALLENGE_STATES)) errors.push({ code: "status", message: `未知狀態 ${c.status}` });
  return { ok: errors.length === 0, errors };
}

/**
 * 這場現在還重播得出來嗎？（模擬版本 ＋ 快照雜湊都要對得上）
 *
 * ⚠ 三個失敗原因**分開回報**，因為它們的處置完全不同：
 *   版本不符 ⇒ 舊場次，只能看紀錄；
 *   快照對不上 ⇒ 引用錯快照或快照被改；
 *   缺 seed ⇒ 資料損毀。
 *   混成一句「無法重播」會讓下一個人查半天。
 */
export function challengeReplayability(challenge, { challengerSnapshot, defenderSnapshot, currentSimulationVersion } = {}) {
  const v = validateChallengeInstance(challenge);
  if (!v.ok) return { ok: false, reason: v.errors[0].message };

  const sim = canReplay(challenge.simulationVersion, currentSimulationVersion);
  if (!sim.ok) return { ok: false, reason: sim.reason };

  if (challengerSnapshot?.hash !== challenge.challengerSnapshotHash) {
    return { ok: false, reason: "挑戰方快照與這場記錄的不符" };
  }
  if (defenderSnapshot?.hash !== challenge.defenderSnapshotHash) {
    return { ok: false, reason: "防守方快照與這場記錄的不符" };
  }
  return { ok: true, reason: null };
}

/**
 * 寫入結果。**冪等**：同一場已經有結果就原樣回傳，不覆蓋、不重跑。
 *
 * ⚠ 這是「結果冪等」那一條的落點。重整、連點、resume 都會走到這裡，
 *   而它們都必須看到**同一個**結果。
 */
export function settleChallenge(challenge, result) {
  if (challenge?.status === CHALLENGE_STATES.settled) {
    return { ok: true, challenge, alreadySettled: true, errors: [] };
  }
  if (!canTransitionChallenge(challenge?.status, CHALLENGE_STATES.settled)) {
    return { ok: false, challenge, alreadySettled: false, errors: [{ code: "state", message: `${challenge?.status} 不可結算` }] };
  }
  return {
    ok: true, alreadySettled: false, errors: [],
    challenge: { ...challenge, status: CHALLENGE_STATES.settled, result },
  };
}

/**
 * 開發期護欄：seed 必須與當初凍結的一致。
 *
 * ⚠ 存在的理由很具體：如果有人在重播路徑上「順手重新產生一個 seed」，
 *   重播就會對不上，而失敗訊息看起來會像「快照漏了欄位」——
 *   那是最難查的一種假警報。這一支讓它在正確的地方就爆。
 */
export function assertSeedFrozen(challenge, seedUsed) {
  if (challenge?.matchSeed !== seedUsed) {
    return { ok: false, message: `matchSeed 被重新產生（凍結 ${challenge?.matchSeed}，實際用 ${seedUsed}）` };
  }
  return { ok: true, message: null };
}
