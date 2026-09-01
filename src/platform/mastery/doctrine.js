// ============================================================================
//  platform/mastery/doctrine.js — Doctrine.v1：打法認同（V7-2.9 / Task 3）
//
//  ── Doctrine 是什麼、不是什麼 ─────────────────────────────────────────────
//  **是**：玩家對「我的戰隊怎麼打」的選擇，以及後續 progression 的聚焦點。
//  **不是**：Team Development 的第五棵樹。那一棵管的是俱樂部投資什麼
//            （訓練流程、恢復中心、球探），與「怎麼打」是兩件事。
//
//  三條 doctrine 全部都是**打法**。刻意不把「養成 / Development」放進來——
//  它是經營，混進來會讓 doctrine 同時是「戰術傾向」與「養成路線」兩種東西，
//  那是假分類：玩家會看到三個選項，其中一個根本不影響任何一場比賽。
//
//  ── 為什麼 mapping 要 data-driven 且分 mode ──────────────────────────────
//  MOBA 與 CS 的戰術池完全不同，而且成熟度差很遠（見下方 CS 的 DESIGN_ONLY）。
//  把 mapping 寫成一張依 mode 分支的資料表，而不是散在各處的 if/else，
//  是為了讓「新增一個 mode」或「調整某個戰術的歸屬」只改資料、不改邏輯。
//
//  ⚠ **本檔完全不碰 production battle behavior**：不改 `MobaTacticConfig` 的
//    任何數值、不改 `toEngineTactic`、不 import CS runtime。它只是一張表
//    加上幾個查表函式。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { MOBA_TACTICS, mobaTacticById } from "../contracts/MobaTacticConfig.js";

export const DOCTRINE_VERSION = "Doctrine.v1";

export const DOCTRINE = Object.freeze({
  TEMPO: "tempo",
  CONTROL: "control",
  ADAPTIVE: "adaptive",
});

/**
 * 三條 doctrine 的主張。`claim` 是給玩家看的一句話——**必須說得出取捨**，
 * 不能只是「更強」。高階打法不等於更強，是原則 4。
 */
export const DOCTRINES = Object.freeze([
  Object.freeze({
    id: DOCTRINE.TEMPO, zh: "強攻", emoji: "⚡",
    claim: "用節奏換先手：前期建立優勢，但容錯低、被拖久會失勢",
  }),
  Object.freeze({
    id: DOCTRINE.CONTROL, zh: "控圖", emoji: "🗺️",
    claim: "用資源與視野壓縮對手選項：穩，但需要時間，怕被快攻打穿",
  }),
  Object.freeze({
    id: DOCTRINE.ADAPTIVE, zh: "應變", emoji: "🔄",
    claim: "保留選擇權、後期決勝：上限高，但前期要吃得住壓力",
  }),
]);

export const DOCTRINE_IDS = Object.freeze(DOCTRINES.map((d) => d.id));

/**
 * **一個戰術只屬於一條 doctrine。**
 *
 * ⚠ 這條規則是明文的，不是慣例：多重標籤會讓「切換 doctrine」失去意義
 *   （每個戰術都算數 ⇒ 選哪條都一樣 ⇒ 假選擇）。
 *   未來若真要開放 multi-tag，必須先改這個常數並同時改 verifier 的互斥斷言，
 *   讓「放寬規則」是一個看得見的決定，而不是悄悄多塞一個 id。
 */
export const MULTI_TAG_ALLOWED = false;

/**
 * 依 mode 分支的 mapping 表。
 *
 * `status` 三種：
 *   · `CURRENT_RUNTIME`  已對到真實可用的戰術池
 *   · `DESIGN_ONLY`      有設計、但尚未接上 runtime
 *   · `OWNER_HANDOFF`    需要別的 owner 先動 runtime 才能做
 */
export const MODE_DOCTRINE_MAP = Object.freeze({
  moba: Object.freeze({
    status: "CURRENT_RUNTIME",
    source: "platform/contracts/MobaTacticConfig.js",
    //  依既有 archetype 歸位，**不改任何戰術定義**：
    //    m1 高風險快攻 / m7 前期入侵 / m5 下路核心   → 強攻
    //    m4 控圖資源 / m2 上路分推                   → 控圖
    //    m8 標準運營 / m6 中野聯動 / m3 團戰抱團     → 應變
    byTactic: Object.freeze({
      m1: DOCTRINE.TEMPO,
      m5: DOCTRINE.TEMPO,
      m7: DOCTRINE.TEMPO,
      m2: DOCTRINE.CONTROL,
      m4: DOCTRINE.CONTROL,
      m3: DOCTRINE.ADAPTIVE,
      m6: DOCTRINE.ADAPTIVE,
      m8: DOCTRINE.ADAPTIVE,
    }),
  }),
  cs: Object.freeze({
    //  ⚠ **無法安全 mapping ⇒ OWNER_HANDOFF，不硬做。** 兩個具體障礙：
    //    ① CS 的 `TACTICS_DB` 宣告在 `src/battle/fps/EsportsFPS3D.jsx:662`，
    //       位於 `:23` 起的 IIFE 內，模組只 export `EsportsFPS3D` 與
    //       `buildMatchResult` ⇒ **在程式上就 import 不到**。要拿到它得改
    //       CS runtime 的匯出，那是 CS owner 的地盤。
    //    ② 唯一的替代做法是把 CS 戰術 id 抄一份進平台層——那就是第二份
    //       真相，違反「不建立第二套 tactic system」。
    //  ⚠ 另有產品理由：TD-52 量到 CS 戰術之間的勝率差達 0.5%↔92.8%，
    //    在那個地形上把戰術綁成 doctrine 並接解鎖，等於直接發勝率。
    status: "OWNER_HANDOFF",
    ownerHandoff: "CS_OWNER_HANDOFF",
    source: null,
    byTactic: Object.freeze({}),
    blockers: Object.freeze([
      "TACTICS_DB 未匯出（EsportsFPS3D.jsx:662，位於 :23 的 IIFE 內）",
      "抄一份 id 到平台層 = 第二套 tactic system",
      "TD-52：CS 戰術勝率差 0.5%↔92.8%，未平衡前不得接解鎖",
    ]),
  }),
});

export const DOCTRINE_MODES = Object.freeze(Object.keys(MODE_DOCTRINE_MAP));

/** 這個 mode 的 mapping 現況（含 status 與 blockers）。 */
export const doctrineMapStatusOf = (mode) => MODE_DOCTRINE_MAP[mode] ?? null;

/**
 * 這個戰術屬於哪條 doctrine。
 * ⚠ **fail closed**：未知 mode、未知戰術、或該 mode 尚未 mapping ⇒ `null`。
 */
export function doctrineOfTactic(mode, tacticId) {
  const branch = MODE_DOCTRINE_MAP[mode];
  if (!branch || typeof tacticId !== "string" || !tacticId) return null;
  return branch.byTactic[tacticId] ?? null;
}

/** 這條 doctrine 在這個 mode 底下有哪些戰術（排序後回傳，供 UI 與驗證使用）。 */
export function tacticsOfDoctrine(mode, doctrineId) {
  const branch = MODE_DOCTRINE_MAP[mode];
  if (!branch || !DOCTRINE_IDS.includes(doctrineId)) return [];
  return Object.entries(branch.byTactic)
    .filter(([, d]) => d === doctrineId)
    .map(([id]) => id)
    .sort();
}

/** 是不是合法的 doctrine id。呼叫端不得自己比字串。 */
export const isDoctrineId = (id) => DOCTRINE_IDS.includes(id);

/** doctrine 的展示資料。未知 id ⇒ null（不回傳假的預設值）。 */
export const doctrineById = (id) => DOCTRINES.find((d) => d.id === id) ?? null;

/**
 * MOBA mapping 的自我一致性。**表與契約必須對得起來**——
 * 少一個戰術代表玩家會有一套永遠不屬於任何流派的打法；
 * 多一個代表表裡有契約不存在的 id。兩者都由 verifier 擋。
 */
export function mobaMappingIntegrity() {
  const mapped = Object.keys(MODE_DOCTRINE_MAP.moba.byTactic).sort();
  const actual = MOBA_TACTICS.map((t) => t.tacticId).sort();
  return {
    mapped,
    actual,
    missing: actual.filter((id) => !mapped.includes(id)),
    unknown: mapped.filter((id) => !mobaTacticById(id)),
    complete: JSON.stringify(mapped) === JSON.stringify(actual),
  };
}
