// ============================================================================
//  platform/assets/clubAssetsState.js — ClubAssets.v1 狀態機
//
//  ── 擁有與裝備是兩件事 ───────────────────────────────────────────────────
//  `owned` 是**永久收藏**，買了就不會消失；`headCoachId` 是**這一週的選擇**。
//  分開的理由是這個系統的立足點：一個 slot、三位教練 ⇒ 選 A 就沒有 B。
//  如果買了就自動全部生效，那不是收藏，是加法。
//
//  ── 為什麼沒有「卸下」 ───────────────────────────────────────────────────
//  換教練每個 Career Week 限一次。如果可以卸下，玩家就能「卸下 → 再裝上」把
//  空槽首裝的免費規則當成無限次換人——鎖等於不存在。
//  不做卸下同時也消滅了「沒有總教練」這個對玩家毫無好處的狀態。
//
//  ── 時間 ─────────────────────────────────────────────────────────────────
//  本檔**不讀時鐘**。`careerWeek` 一律由呼叫端傳入（來自
//  `deriveTime(meta.days).week`）。它是從總天數推導的單調值 ⇒ reload 不會倒退、
//  fast-forward 自然跨週、也不存第二份計數。
//
//  ── 不扣點 ───────────────────────────────────────────────────────────────
//  `purchaseAsset` 只判定資格並回傳新的 assets，**不動任何點數**。扣點只能由
//  store 用 `spendClubPoints()` 做——那是唯一保證「lifetime 不受影響」的入口。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { CLUB_ASSET_VERSION, assetById } from "./coachCatalog.js";

/** 失敗碼 → 呼叫端可以直接對應文案。判定在這裡，文案在畫面。 */
export const ASSET_FAIL = Object.freeze({
  UNKNOWN_ASSET: "unknown_asset",
  ALREADY_OWNED: "already_owned",
  NOT_OWNED: "not_owned",
  PREREQUISITE: "prerequisite",
  INSUFFICIENT: "insufficient",
  ALREADY_EQUIPPED: "already_equipped",
  WEEKLY_LOCKED: "weekly_locked",
});

export function emptyClubAssets() {
  return { schema: CLUB_ASSET_VERSION, owned: {}, headCoachId: null, lastCoachChangeWeek: null };
}

const posInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/**
 * 舊存檔／被手改過的存檔一律由這裡補正。**fail closed**：
 *   · 型錄裡不存在的 assetId ⇒ 從 `owned` 剔除（型錄縮編時不留幽靈資產）
 *   · `headCoachId` 不在 `owned` ⇒ 歸 null（不能裝備沒買的東西）
 */
export function normalizeClubAssets(raw) {
  const out = emptyClubAssets();
  if (!raw || typeof raw !== "object") return out;

  const owned = raw.owned && typeof raw.owned === "object" ? raw.owned : {};
  for (const [assetId, entry] of Object.entries(owned)) {
    if (!assetById(assetId)) continue;
    out.owned[assetId] = { acquiredWeek: posInt(entry?.acquiredWeek) ?? 1 };
  }

  const head = typeof raw.headCoachId === "string" ? raw.headCoachId : null;
  out.headCoachId = head && out.owned[head] ? head : null;
  out.lastCoachChangeWeek = posInt(raw.lastCoachChangeWeek);
  //  沒有總教練就不該留著換人紀錄——否則第一次裝備可能莫名被鎖。
  if (!out.headCoachId) out.lastCoachChangeWeek = null;
  return out;
}

export const ownsAsset = (assets, assetId) => Boolean(normalizeClubAssets(assets).owned[assetId]);

/** prerequisite 判定。目前只有 `clubPointsLifetime` 一種。未知 kind ⇒ 擋下。 */
export function prerequisiteMet(asset, { clubPointsLifetime = 0 } = {}) {
  const pre = asset?.prerequisite ?? null;
  if (!pre) return true;
  if (pre.kind !== "clubPointsLifetime") return false;
  return Number(clubPointsLifetime) >= Number(pre.min);
}

/**
 * 買一份資產。
 *
 * ⚠ **不扣點、不自動裝備。** 回傳 `price` 讓 store 去 `spendClubPoints`，
 *   回傳 `firstOwned` 讓 store 判斷要不要觸發「空槽首裝免費」。
 *
 * @returns {{ok:boolean, assets:object, reason:string|null, code:string|null,
 *            price:number, firstOwned:boolean}}
 *   ok:false ⇒ `assets` 與輸入等值，**完全沒有寫入**。
 */
export function purchaseAsset(assets, assetId, { clubPoints = 0, clubPointsLifetime = 0, careerWeek = 1 } = {}) {
  const A = normalizeClubAssets(assets);
  const fail = (code, reason) => ({ ok: false, assets: A, reason, code, price: 0, firstOwned: false });

  const asset = assetById(assetId);
  if (!asset) return fail(ASSET_FAIL.UNKNOWN_ASSET, "找不到這份資產");
  if (A.owned[assetId]) return fail(ASSET_FAIL.ALREADY_OWNED, "已經擁有這位教練");
  if (!prerequisiteMet(asset, { clubPointsLifetime })) {
    return fail(ASSET_FAIL.PREREQUISITE, `需要俱樂部累計 ${asset.prerequisite.min} 點才能聘用`);
  }
  const price = asset.priceClubPoints;
  if (Number(clubPoints) < price) {
    return fail(ASSET_FAIL.INSUFFICIENT, `俱樂部點數不足（需要 ${price}，只有 ${Math.max(0, Math.floor(Number(clubPoints) || 0))}）`);
  }

  const week = posInt(careerWeek) ?? 1;
  return {
    ok: true,
    reason: null,
    code: null,
    price,
    firstOwned: Object.keys(A.owned).length === 0,
    assets: { ...A, owned: { ...A.owned, [assetId]: { acquiredWeek: week } } },
  };
}

/**
 * 現在換得動教練嗎。
 *
 * `first_equip`：還沒有總教練 ⇒ 免費，且**不消耗**當週換人資格。
 * `weekly_locked`：這個 Career Week 已經換過一次。
 */
export function canChangeCoach(assets, careerWeek) {
  const A = normalizeClubAssets(assets);
  if (!A.headCoachId) return { ok: true, code: "first_equip" };
  const week = posInt(careerWeek) ?? 1;
  if (A.lastCoachChangeWeek === week) return { ok: false, code: ASSET_FAIL.WEEKLY_LOCKED };
  return { ok: true, code: "ok" };
}

/**
 * 裝備總教練。
 *
 * ⚠ 「裝備現任」是**零變化**，而且不消耗當週資格——否則玩家點錯一下就要等一週。
 *
 * @returns {{ok:boolean, assets:object, reason:string|null, code:string|null, firstEquip:boolean}}
 */
export function equipHeadCoach(assets, assetId, { careerWeek = 1 } = {}) {
  const A = normalizeClubAssets(assets);
  const fail = (code, reason) => ({ ok: false, assets: A, reason, code, firstEquip: false });

  if (!assetById(assetId)) return fail(ASSET_FAIL.UNKNOWN_ASSET, "找不到這份資產");
  if (!A.owned[assetId]) return fail(ASSET_FAIL.NOT_OWNED, "還沒有聘用這位教練");
  if (A.headCoachId === assetId) return fail(ASSET_FAIL.ALREADY_EQUIPPED, "這位已經是總教練");

  const gate = canChangeCoach(A, careerWeek);
  if (!gate.ok) return fail(ASSET_FAIL.WEEKLY_LOCKED, "本週已經換過總教練，下週才能再換");

  const firstEquip = gate.code === "first_equip";
  return {
    ok: true,
    reason: null,
    code: null,
    firstEquip,
    assets: {
      ...A,
      headCoachId: assetId,
      //  首裝不寫入紀錄 ⇒ 玩家買第一位教練的當週仍能換到第二位。
      lastCoachChangeWeek: firstEquip ? A.lastCoachChangeWeek : (posInt(careerWeek) ?? 1),
    },
  };
}

/**
 * 畫面要的一整包。**畫面不得自己判任何一條規則**——買不買得起、夠不夠格、
 * 這週還能不能換，全部在這裡算完。
 */
export function clubAssetsViewOf(assets, { catalog, clubPoints = 0, clubPointsLifetime = 0, careerWeek = 1 } = {}) {
  const A = normalizeClubAssets(assets);
  const balance = Math.max(0, Math.floor(Number(clubPoints) || 0));
  const gate = canChangeCoach(A, careerWeek);
  return {
    schema: CLUB_ASSET_VERSION,
    clubPoints: balance,
    clubPointsLifetime: Math.max(0, Math.floor(Number(clubPointsLifetime) || 0)),
    careerWeek: posInt(careerWeek) ?? 1,
    headCoachId: A.headCoachId,
    ownedCount: Object.keys(A.owned).length,
    canChangeCoach: gate.ok,
    changeBlockedBy: gate.ok ? null : gate.code,
    firstEquipFree: gate.code === "first_equip",
    items: (catalog ?? []).map((asset) => {
      const owned = Boolean(A.owned[asset.assetId]);
      const equipped = A.headCoachId === asset.assetId;
      const preOk = prerequisiteMet(asset, { clubPointsLifetime });
      const affordable = balance >= asset.priceClubPoints;
      return {
        assetId: asset.assetId,
        name: asset.name,
        description: asset.description,
        capabilityText: asset.capabilityText,
        tradeoffText: asset.tradeoffText,
        specialty: asset.specialty,
        price: asset.priceClubPoints,
        prerequisite: asset.prerequisite,
        prerequisiteMet: preOk,
        competitivePolicy: asset.competitivePolicy,
        owned, equipped,
        affordable,
        shortBy: affordable ? 0 : asset.priceClubPoints - balance,
        canBuy: !owned && preOk && affordable,
        canEquip: owned && !equipped && gate.ok,
        //  給畫面一個**單一**的阻擋碼，省得它自己排優先序排錯。
        blockedBy: owned
          ? (equipped ? null : (gate.ok ? null : gate.code))
          : (!preOk ? ASSET_FAIL.PREREQUISITE : (!affordable ? ASSET_FAIL.INSUFFICIENT : null)),
        acquiredWeek: owned ? A.owned[asset.assetId].acquiredWeek : null,
      };
    }),
  };
}
