// ============================================================================
//  platform/persistence/saveBundle.js — 存檔信封 SaveBundle.v1（Backend B1B）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  B1A 盤點出的第一號問題不是「怎麼接 Supabase」，是：
//  **沒有任何一個地方可以原子地存下「玩家的全部進度」。**
//  `profileStore` / `heroProgressStore` / `seasonStore` 三個 store 各寫各的鍵、
//  各有各的時機 ⇒ 還原時很容易得到「生涯是新的、英雄熟練是舊的」，
//  而熟練是勝負的主要決定者（271b31d），也會被寫進 `SquadSnapshot.v1`。
//
//  ⇒ 本檔就是那個「一起」：把要一起存、一起還原的東西裝進**一個信封**。
//
//  ── 分層：cloud / local ──────────────────────────────────────────────────
//  信封刻意分兩段，因為這兩段的**保存需求根本不同**：
//
//    bundle.cloud   跨裝置必須逐值一致的東西（生涯、名單、帳本、熟練）
//    bundle.local   只要「在這台機器上找得回來」的東西（重播證據、提示流）
//
//  ⚠ 這不是為了省流量，是 B1A 的實測結論：
//      生涯本體                 7,049 B
//      挑戰重播證據           113,050 B   ← 佔存檔 94%
//      對戰歷史（50 場上限）  ~854,650 B   ← 比 profile 大 7 倍
//    把後兩者塞進雲端信封，等於用「同步」的成本去搬「找得回來就好」的東西。
//
//  ── ⚠ C 類（推導 / runtime）在這裡就被剔掉，不靠呼叫端記得 ────────────────
//  `competition` / `competitionHistory`（`*ByMode` 的別名投影）與
//  `opponentDirectory`（Slice 8 的來源快取）一律不進信封。
//  把推導值存起來，遲早會出現「存檔裡的推導值」與「重算的推導值」不一致，
//  而那種 bug 沒有人會發現，直到某天畫面對不上為止。
//
//  ⚠ **B1A 的一個分類錯誤，在這裡更正**：`seasonStateV2` 被我列為「純推導」，
//    但它**不是**。`seasonSealingV2.sealSeasonBoundary()` 會把它寫成
//    `status: sealed` / `active: null`，而 `migrateSeasonStateV2()` 對一份
//    已經合法的 v2 state 是**保留不重建**（只有 legacy 換季才重建）。
//    ⇒ 丟掉它＝丟掉「這一季已經封存」這件事，而那件事重算不回來。
//    ⇒ 它屬 **A 類**，見 `CLOUD_PROFILE_KEYS`。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
//  ⚠ 時刻由呼叫端注入（`now`）⇒ 本層完全決定性，verifier 可逐值重跑。
// ============================================================================

export const SAVE_BUNDLE_VERSION = "SaveBundle.v1";

/**
 * A 類：**必須跨裝置一致**的 profile 欄位。
 *
 * ⚠ 這份清單是 B1A §2 的落地，**它是唯一的事實來源**。
 *   新增 store 切片時要自己決定進哪一類，漏了就是「換裝置後那塊不見了」。
 * ⚠ 加欄位前先問一句：**弄丟之後重建得回來嗎？**
 *   重建得回來（推導、提示、偏好）就不該在這裡。
 */
export const CLOUD_PROFILE_KEYS = Object.freeze([
  //  生涯本體
  "schemaVersion", "manager", "team", "meta", "lineup", "csLineup",
  //  ⚠ 賽季狀態 v2：**不是**純推導（見檔頭的更正）。封存狀態重算不回來。
  "seasonStateV2",
  //  名單與選手成長（能力 / xp / 天賦 / 合約 / 訓練 / 成長紀錄都在 players 裡）
  "players",
  //  訓練 / 招募 / 球探
  "recruitment", "scouted", "teamDevelopment",
  //  俱樂部 / 資產 / 專精
  "clubAssets", "clubProgression", "clubMastery", "retention",
  //  經濟
  "finance", "economy", "activeSponsor",
  //  賽季 / 賽事帳本
  "competitionByMode", "competitionHistoryByMode", "circuitHistory",
  "circuitPointsLedger", "honors", "csHistory", "csMapPreferences",
  //  ⚠ 冪等帳本：**比金額本身更重要**。只還原「錢與名次」而不還原帳本，
  //    玩家在另一台裝置重跑一次結算就能再領一次。
  "processedMatchTransactions", "processedCompetitionAwards",
]);

/**
 * B 類：只留本機的 profile 欄位。
 *
 * ⚠ 弄丟的代價是**提示流重來一次**（紅點重現、世界快訊回到預設），
 *   不是生涯數字改變。這些欄位一個都不影響結算。
 */
export const LOCAL_PROFILE_KEYS = Object.freeze([
  "inbox", "notifications", "events", "worldNews",
]);

/**
 * C 類：**永遠不進信封**。
 *
 * · `competition` / `competitionHistory`  `*ByMode` 的別名投影
 *   （`routeCompetitionWrite` 投出來的；`load()` 本來就不讀它們）
 * · `opponentDirectory`  Slice 8 的對手來源快取（已經被 `save()` 剔掉一次了）
 *
 * ⚠ `seasonStateV2` **不在這裡**——它看起來像推導值，但封存狀態重算不回來。
 *   這是 B1A 判斷錯、B1B 更正的一條，`check_save_bundle_b1b` §② 有斷言釘住。
 */
export const TRANSIENT_KEYS = Object.freeze([
  "competition", "competitionHistory", "opponentDirectory",
]);

/**
 * `matchmaking` 切片裡**唯一**要跨裝置的東西。
 *
 * ⚠ `ticket` / `room` / `session` / `launch` / `fixtureAssignment` 是**這台機器上
 *   進行中的比賽**——`normalizeMatchmaking` 載入時本來就會把 `queued` /
 *   `validating` 判成 `cancelled`（「沒有伺服器會回應它」）⇒ 跨裝置 resume
 *   在語意上不成立，硬搬過去只會讓另一台裝置看到一張永遠不會有結果的票。
 * ⚠ 但 `settlements` 是**結算冪等帳本**，跟上面那兩個帳本同一個道理，必須跨裝置。
 */
export const CLOUD_MATCHMAKING_KEYS = Object.freeze(["settlements"]);

/** 從一個物件挑出指定的鍵（不存在的鍵不會變成 `undefined` 欄位）。 */
function pick(src, keys) {
  const out = {};
  if (!src || typeof src !== "object") return out;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════
//  Challenge：判定（core）與重播證據（evidence）分離
//
//  ⚠ 為什麼要拆：B1A 實測挑戰切片佔存檔 94%，其中
//      snapshots  61,316 B（25 份 × 2,440 B）
//      draftResult 每筆 1,894 B × 20 筆
//    但真正決定「我打過誰、算不算數」的欄位加起來只有幾百 bytes。
//  ⚠ 拆法不動任何契約、不動任何判定邏輯：`challengeEligibility` 讀的欄位
//    （`identity` / 兩個 hash / `kind` / `opponentKey` / `settlement` / `result`）
//    **全部留在 core**，所以看板狀態與獎勵資格在只有 core 的機器上照樣算得出來。
//  ⚠ 缺 evidence 時**不編造**：重播會走既有那條路——跨模擬版本的舊挑戰本來
//    就明確拒絕重播，不靜默重算。缺快照時同理。
// ══════════════════════════════════════════════════════════════════════════

/**
 * 一筆挑戰裡屬於「重播證據」的欄位。**其餘一律留在 core。**
 *
 * ⚠ 這裡刻意是**黑名單**，不是白名單。我第一版寫成白名單，漏了
 *   `issuedBy` ⇒ `validateChallengeInstance` 驗不過 ⇒
 *   `normalizeChallengeState` 把**整筆場次丟掉**，reload 之後挑戰紀錄變 0。
 *   白名單的失敗方式是「靜靜少一個欄位」，而 `ChallengeInstance` 契約
 *   往後一定還會長欄位（Slice 5 的 draftResult、Slice 7 的 settlement/identity
 *   都是後來加的）⇒ 每加一個就要記得回來改這裡，那條規則一定會被忘記。
 * ⇒ 黑名單的失敗方式是「多存了一點東西」，那是安全的方向。
 */
const INSTANCE_EVIDENCE_KEYS = Object.freeze(["draftResult"]);

/** 把 challenge 切片拆成 `core`（上雲）與 `evidence`（留本機）。 */
export function splitChallenge(challenge) {
  if (!challenge || typeof challenge !== "object") {
    return { core: null, evidence: null };
  }
  const instances = challenge.instances ?? {};
  const coreInstances = {};
  const drafts = {};
  for (const [id, inst] of Object.entries(instances)) {
    if (!inst || typeof inst !== "object") continue;
    //  ⚠ `draftResult` 是**凍結的**選角結果（1.9KB/筆）。它只有重播時才需要，
    //    而重播本來就只在「這台機器上放得回來」的前提下成立。
    const core = { ...inst };
    const ev = {};
    for (const k of INSTANCE_EVIDENCE_KEYS) {
      if (core[k] === undefined) continue;
      ev[k] = core[k];
      delete core[k];
    }
    coreInstances[id] = core;
    if (Object.keys(ev).length) drafts[id] = ev;
  }
  return {
    core: {
      schema: challenge.schema ?? null,
      defense: challenge.defense ?? null,
      lastPublishedCareerDay: challenge.lastPublishedCareerDay ?? null,
      order: Array.isArray(challenge.order) ? [...challenge.order] : [],
      instances: coreInstances,
      //  ⚠ `pendingDraft` 是「這台機器上選到一半的那一手」⇒ 不跨裝置。
    },
    evidence: {
      snapshots: challenge.snapshots ?? {},
      drafts,
      pendingDraft: challenge.pendingDraft ?? null,
    },
  };
}

/**
 * 把 core 與 evidence 併回一個完整的 challenge 切片。
 *
 * ⚠ `evidence` 為 null（例如從雲端還原到一台新機器）**不是錯誤**：
 *   併出來的切片仍然是合法的，只是重播不出來——那是誠實的降級，
 *   而 `normalizeChallengeState` 會把引用不全的場次自己清掉。
 */
export function joinChallenge(core, evidence) {
  if (!core) return null;
  const drafts = evidence?.drafts ?? {};
  const instances = {};
  for (const [id, inst] of Object.entries(core.instances ?? {})) {
    //  ⚠ `drafts[id]` 是**一包**證據欄位（目前只有 `draftResult`），
    //    這樣日後多一個證據欄位時 join 這一側不用跟著改。
    instances[id] = drafts[id] ? { ...inst, ...drafts[id] } : { ...inst };
  }
  return {
    schema: core.schema ?? null,
    defense: core.defense ?? null,
    lastPublishedCareerDay: core.lastPublishedCareerDay ?? null,
    order: Array.isArray(core.order) ? [...core.order] : [],
    instances,
    snapshots: evidence?.snapshots ?? {},
    pendingDraft: evidence?.pendingDraft ?? null,
  };
}

// ══════════════════════════════════════════════════════════════════════════
//  信封
// ══════════════════════════════════════════════════════════════════════════

/**
 * 組一個 `SaveBundle.v1`。
 *
 * @param {object}  p
 * @param {object}  p.profile       `profileStore` 的完整 state（函式會被忽略）
 * @param {object}  p.heroProgress  `heroProgressStore` 的 `progress`
 * @param {number} [p.now]          存檔時刻（由呼叫端注入）
 */
export function buildSaveBundle({ profile = null, heroProgress = null, now = 0 } = {}) {
  const { core, evidence } = splitChallenge(profile?.challenge);
  return {
    schema: SAVE_BUNDLE_VERSION,
    savedAt: Number(now) || 0,
    cloud: {
      profile: {
        ...pick(profile, CLOUD_PROFILE_KEYS),
        //  ⚠ 只帶結算帳本，不帶進行中的比賽（見 `CLOUD_MATCHMAKING_KEYS`）。
        matchmaking: pick(profile?.matchmaking, CLOUD_MATCHMAKING_KEYS),
        challenge: core,
      },
      //  ⚠ 熟練**必須**與生涯同一個信封：它直接決定戰力，也會被寫進快照。
      //    只有 1.16 KB，沒有理由讓它自己一條路。
      heroProgress: heroProgress ?? null,
    },
    local: {
      profile: pick(profile, LOCAL_PROFILE_KEYS),
      //  進行中的比賽：留本機（跨裝置 resume 語意上不成立）。
      matchmaking: profile?.matchmaking ?? null,
      challengeEvidence: evidence,
    },
  };
}

/**
 * 把信封還原成「一份完整的 profile state ＋ 一份 heroProgress」。
 *
 * ⚠ 回傳的 profile **刻意不含** C 類欄位：那些由 `profileStore.load()` 的
 *   `withIdentity()` 自己重算，這裡補一份只會製造第二個真相來源。
 * ⚠ `local` 缺席（雲端還原到新機器）⇒ 提示流與重播證據是空的，
 *   其餘一切照常。**不編造**任何一格。
 */
export function applySaveBundle(bundle) {
  if (!isSaveBundle(bundle)) return { ok: false, profile: null, heroProgress: null, errors: [{ code: "schema", message: "不是 SaveBundle.v1" }] };
  const cp = bundle.cloud?.profile ?? {};
  const lp = bundle.local?.profile ?? {};
  const localMm = bundle.local?.matchmaking ?? null;
  return {
    ok: true,
    errors: [],
    profile: {
      ...cp,
      ...lp,
      //  ⚠ 合併順序有意義：本機那份 matchmaking 是完整的（含進行中的比賽），
      //    但**結算帳本以雲端那份為準**——帳本漏了會重複發獎，比多一張作廢的票嚴重。
      matchmaking: { ...(localMm ?? {}), ...(cp.matchmaking ?? {}) },
      challenge: joinChallenge(cp.challenge, bundle.local?.challengeEvidence ?? null),
    },
    heroProgress: bundle.cloud?.heroProgress ?? null,
  };
}

/** 只取要上雲的那一半（未來 `CloudSaveProvider` 送出去的就是這個）。 */
export const cloudSectionOf = (bundle) => bundle?.cloud ?? null;

/** 這個信封的雲端段有多大（bytes）。⚠ verifier 直接讀這一支，不自己算。 */
export function cloudBundleSize(bundle) {
  try { return JSON.stringify(cloudSectionOf(bundle) ?? null).length; } catch { return -1; }
}

/** 形狀檢查。⚠ 只驗信封，不驗內容——內容各切片自己有 normalize。 */
export function isSaveBundle(b) {
  return !!b && typeof b === "object" && b.schema === SAVE_BUNDLE_VERSION
    && !!b.cloud && typeof b.cloud === "object";
}

/**
 * 驗一個信封。
 *
 * ⚠ 刻意**很淺**：這一層只回答「這是不是一個信封、雲端段在不在」。
 *   逐欄位的正規化仍然由 `profileStore.load()` 的白名單負責——
 *   那是既有的、有 migration 的那一條路，不在這裡複製第二份。
 */
export function validateSaveBundle(b) {
  const errors = [];
  if (!isSaveBundle(b)) return { ok: false, errors: [{ code: "schema", message: "不是 SaveBundle.v1" }] };
  if (!b.cloud.profile || typeof b.cloud.profile !== "object") {
    errors.push({ code: "profile", message: "雲端段缺少 profile" });
  }
  for (const k of TRANSIENT_KEYS) {
    //  ⚠ 這條是**回歸守門**：推導值溜進信封就是第二個真相來源的開始。
    if (Object.prototype.hasOwnProperty.call(b.cloud.profile ?? {}, k)) {
      errors.push({ code: "transient", message: `雲端段不得包含推導欄位 ${k}` });
    }
  }
  return { ok: errors.length === 0, errors };
}
