// ============================================================================
//  platform/identity/publicClubIdentity.js — 公開俱樂部識別（PublicClubIdentity.v1）
//
//  ── 這一支在回答一個問題：「別人看得到我的俱樂部的哪些部分？」──────────
//  Club Identity v1 的稱號只有自己看得到，所以它沒有社交價值：一個只有你看得
//  到的頭銜，跟改一個本機設定沒有差別。v2 把「一個俱樂部對外長什麼樣」抽成
//  **一份契約**，讓以下消費端共用同一個答案，而不是各自拼一次：
//
//    · 首頁 Home Hero（自己的俱樂部）
//    · 積分榜 → 對手俱樂部卡（Opponent Inspect）
//    · 未來：對戰點對手頭像、Competition 對手、Team profile、Match opponent inspect
//
//  ── ⚠ 這一支存在的真正理由是「什麼**不能**外流」──────────────────────
//  對手卡片如果順手把「對手現在的主義／總教練能力／賽前準備」也帶出去，
//  它就不再是社交展示，而是**免費偵察**——那會直接改變對局。
//  所以這裡有一份 `FORBIDDEN_PUBLIC_FIELDS` 白紙黑字的禁列，而且
//  `assertPublicSafe()` 會在組卡之後再掃一次。verifier 對這一條硬斷言。
//
//  規則：**新增公開欄位要先過這裡。** 不要在畫面層自己多讀一個 profile 欄位。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================

export const PUBLIC_CLUB_IDENTITY_VERSION = "PublicClubIdentity.v1";

/**
 * **絕對不得出現在公開卡片上的東西。**
 *
 * 這不是「目前剛好沒放」的清單，是禁列：每一項都會洩漏對局資訊。
 * 鍵名寫成小寫片段，`assertPublicSafe()` 用包含比對，這樣
 * `activeDoctrine` / `doctrineId` / `matchPrepState` 這類變形也擋得住。
 */
export const FORBIDDEN_PUBLIC_FIELDS = Object.freeze([
  "doctrine",      // 現行主義（戰術傾向）
  "headcoach",     // 總教練（＝能力組合）
  "capabilit",     // capability / capabilities
  "tactic",        // 隱藏戰術、戰術變體進度
  "matchprep",     // 賽前準備
  "lineup",        // 先發名單
  "loadout",
  "scout",         // 球探情報
  "mastery",       // 專精進度（＝可用變體）
]);

/**
 * 掃描一張公開卡片，回傳違規的鍵路徑（空陣列 = 安全）。
 * 遞迴掃鍵名，不看值——值可能是使用者取的隊名，不該因為叫「戰術狼」被擋。
 */
export function assertPublicSafe(card, path = "card") {
  const bad = [];
  const walk = (node, at) => {
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      const lower = k.toLowerCase();
      for (const banned of FORBIDDEN_PUBLIC_FIELDS) {
        if (lower.includes(banned)) { bad.push(`${at}.${k}`); break; }
      }
      if (v && typeof v === "object") walk(v, `${at}.${k}`);
    }
  };
  walk(card, path);
  return bad;
}

/**
 * 沒有識別資產的俱樂部（AI 對手）也該長得不一樣，否則整份積分榜點開來
 * 全部同一張卡。
 *
 * ⚠ 這裡**只借隊伍自己既有的 `color`**（`competition/aiTeams.js` 的 seed 就有），
 *   不派給它任何玩家要花點數買的 skin／banner／crest frame。理由：
 *   AI 免費拿到玩家的收藏品，會讓收藏品看起來不值錢。
 */
export function neutralIdentityOf(teamColor) {
  const accent = typeof teamColor === "string" && /^#[0-9a-fA-F]{3,8}$/.test(teamColor) ? teamColor : null;
  return {
    derived: true,
    skin: null,
    accent,
    accent2: accent,
    titleLabel: null,
    crestPattern: null,
    crestRing: accent,
    bannerMotif: null,
    bannerWash: null,
  };
}

/**
 * 組一張公開俱樂部卡。**所有輸入都必須是呼叫端已經解析好的值**——
 * 這一支不認識 store，也不去查任何型錄。
 *
 * @param {object} p
 * @param {string} p.teamId
 * @param {string} p.name           俱樂部／戰隊名稱
 * @param {string} [p.tag]          隊伍縮寫
 * @param {string} [p.emoji]        隊徽符號
 * @param {object} [p.identity]     `identityPresentationOf()` 的結果，或
 *                                  `neutralIdentityOf()`。沒有就用預設外觀。
 * @param {object} [p.clubLevel]    `clubTierOf()` 的結果（公開的俱樂部等級）
 * @param {object} [p.record]       `{ rank, wins, losses, points }`，沒有就 null
 * @param {Array}  [p.honors]       `[{ label, season, gameMode }]`，只放已封存的榮耀
 * @param {boolean}[p.isMe]
 */
export function publicClubCardOf({
  teamId, name, tag = null, emoji = null,
  identity = null, clubLevel = null, record = null, honors = [], isMe = false,
}) {
  const id = identity ?? {};
  const card = {
    schema: PUBLIC_CLUB_IDENTITY_VERSION,
    teamId: teamId ?? null,
    name: name ?? "未命名俱樂部",
    tag: tag ?? null,
    emoji: emoji ?? "◆",
    isMe: Boolean(isMe),
    //  ── 外觀（公開）──────────────────────────────────────────────────
    derived: Boolean(id.derived),
    skin: id.skin ?? null,
    accent: id.accent ?? null,
    accent2: id.accent2 ?? null,
    titleLabel: id.titleLabel ?? null,
    crestPattern: id.crestPattern ?? null,
    crestRing: id.crestRing ?? null,
    bannerMotif: id.bannerMotif ?? null,
    bannerWash: id.bannerWash ?? null,
    //  ── 公開戰績（只放已經公開在積分榜上的東西）────────────────────
    clubLevel: clubLevel
      ? { id: clubLevel.id ?? null, name: clubLevel.name ?? null, percent: clubLevel.percent ?? null }
      : null,
    record: record
      ? {
        rank: Number.isFinite(record.rank) ? record.rank : null,
        wins: Number.isFinite(record.wins) ? record.wins : null,
        losses: Number.isFinite(record.losses) ? record.losses : null,
        points: Number.isFinite(record.points) ? record.points : null,
      }
      : null,
    //  ── 榮耀（已封存的賽事結果，本來就是公開紀錄）──────────────────
    honors: (Array.isArray(honors) ? honors : []).map((h) => ({
      label: h?.label ?? null,
      season: h?.season ?? null,
      gameMode: h?.gameMode ?? null,
    })),
  };
  return card;
}
