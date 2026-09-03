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
import { CLUB_ASSET_VERSION } from "./coachCatalog.js";
import { assetById, isRetired, isCosmetic, identitySlotOf } from "./assetCatalog.js";
import { IDENTITY_SLOTS, IDENTITY_SLOT_OF, isEarnedIdentity, EARNED_KINDS } from "./identityCatalog.js";

/** 失敗碼 → 呼叫端可以直接對應文案。判定在這裡，文案在畫面。 */
export const ASSET_FAIL = Object.freeze({
  UNKNOWN_ASSET: "unknown_asset",
  ALREADY_OWNED: "already_owned",
  NOT_OWNED: "not_owned",
  PREREQUISITE: "prerequisite",
  INSUFFICIENT: "insufficient",
  ALREADY_EQUIPPED: "already_equipped",
  WEEKLY_LOCKED: "weekly_locked",
  //  已下架：**已擁有的照樣保留**，只是不能再新購買（Permanent Ownership Contract）。
  RETIRED: "retired",
  //  只能靠實績取得的稱號。**購買路徑硬擋**，不是靠 UI 不畫按鈕。
  EARNED_ONLY: "earned_only",
  //  實績還沒達標。
  NOT_EARNED: "not_earned",
});

/**
 * ⚠ **Club Identity v1 是擴充，不是第二套 store。**
 *   識別與教練共用同一個 `owned`（同一套購買規則、同一個永久擁有契約），
 *   只是裝備欄位不同：教練一個槽 ＋ 每週鎖；識別三個槽 ＋ **免費、隨時可換**。
 *   schema 仍是 `ClubAssets.v1`——新欄位是純附加，舊存檔由 normalize 補成空槽，
 *   行為與識別上線前完全相同，沒有 migration 分支的必要。
 */
export function emptyClubAssets() {
  return {
    schema: CLUB_ASSET_VERSION,
    owned: {},
    headCoachId: null,
    lastCoachChangeWeek: null,
    //  四個外觀槽（v2）。`null` = 使用俱樂部預設外觀。
    //  ⚠ `crestFrameId`（小型隊徽框）與 `bannerId`（大面積主視覺）是**兩個槽**。
    //    v1 只有 bannerId 而且畫的其實是框——那個語意錯誤在 release 前修掉了。
    equippedIdentity: { themeId: null, titleId: null, crestFrameId: null, bannerId: null },
  };
}

const posInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/**
 * 舊存檔／被手改過的存檔一律由這裡補正。
 *
 * ⚠ **Permanent Ownership Contract（2026-09-03）**
 *   以前這裡會把「型錄查不到的 assetId」從 `owned` 剔除。那條規則是錯的：
 *   型錄一改名或下架，玩家花 Club Points 買到的東西就會**靜默消失**，
 *   而且下次存檔之後永久消失。已購買的東西不該因為型錄變動而不見。
 *
 *   現在的規則：**`owned` 只增不減。** 型錄查不到的 id 保留成
 *   `{ acquiredWeek, unknown: true }` —— 擁有、但沒有型錄資料可顯示，
 *   由 UI 標成「典藏」，不由這裡刪掉。
 *   下架請用型錄的 `retired: true`（見 `coachCatalog.js`），**不要刪那一筆**。
 *
 *   仍然 fail closed 的是**裝備與能力**：`headCoachId` 不在 `owned` ⇒ 歸 null，
 *   而查不到型錄的資產不提供任何能力（`clubCapabilities.js` 的 `coachCapabilitiesOf`）。
 */
export function normalizeClubAssets(raw) {
  const out = emptyClubAssets();
  if (!raw || typeof raw !== "object") return out;

  const owned = raw.owned && typeof raw.owned === "object" ? raw.owned : {};
  for (const [assetId, entry] of Object.entries(owned)) {
    if (typeof assetId !== "string" || !assetId) continue;
    out.owned[assetId] = {
      acquiredWeek: posInt(entry?.acquiredWeek) ?? 1,
      //  型錄查不到 ⇒ 標記給 UI，但**絕不刪除**。
      ...(assetById(assetId) ? {} : { unknown: true }),
    };
  }

  const head = typeof raw.headCoachId === "string" ? raw.headCoachId : null;
  out.headCoachId = head && out.owned[head] ? head : null;
  out.lastCoachChangeWeek = posInt(raw.lastCoachChangeWeek);
  //  沒有總教練就不該留著換人紀錄——否則第一次裝備可能莫名被鎖。
  if (!out.headCoachId) out.lastCoachChangeWeek = null;

  //  外觀槽：**裝備仍然 fail closed**——沒買、查不到型錄、或型別對不上槽位的，
  //  一律歸 null。ownership 不會因此消失（它還在 `owned` 裡），只是不生效。
  const eq = raw.equippedIdentity && typeof raw.equippedIdentity === "object" ? raw.equippedIdentity : {};
  for (const slot of IDENTITY_SLOTS) {
    const id = typeof eq[slot] === "string" ? eq[slot] : null;
    if (!id || !out.owned[id]) { out.equippedIdentity[slot] = null; continue; }
    const asset = assetById(id);
    out.equippedIdentity[slot] = asset && identitySlotOf(asset) === slot ? id : null;
  }
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
 * 實績門檻判定（earned 稱號專用）。
 *
 * ⚠ **fail closed**：kind 不在 `EARNED_KINDS` 白名單就一律不滿足。這樣「有人
 *   新造了一個假成就欄位」不會靜默地變成一個可取得的稱號。
 *
 * `annualChampionCount` 由呼叫端從 `competition/honors.js` 的 `teamHonorCount`
 * 算出來——**本檔不讀 honors**，它是純函式，不認識賽事資料。
 */
export function earnedRequirementProgress(asset, { annualChampionCount = 0 } = {}) {
  const req = asset?.earnedRequirement ?? null;
  if (!req) return { applicable: false, met: true, have: 0, need: 0 };
  if (!EARNED_KINDS.includes(req.kind)) return { applicable: true, met: false, have: 0, need: Number(req.min) || 0 };
  const have = Math.max(0, Math.floor(Number(annualChampionCount) || 0));
  const need = Number(req.min) || 0;
  return { applicable: true, met: have >= need, have, need };
}

/**
 * 授予一份資產（**不扣點**）。earned 稱號達標時由 store 呼叫。
 *
 * ⚠ 這條路徑刻意**不檢查價格也不檢查 retired**：它不是購買。它檢查的是
 *   「這份資產是不是 earned，而且實績真的到了」——其餘一律拒絕，
 *   免得它變成一個繞過付款的萬用後門。
 */
export function grantEarnedIdentity(assets, assetId, { annualChampionCount = 0, careerWeek = 1 } = {}) {
  const A = normalizeClubAssets(assets);
  const fail = (code, reason) => ({ ok: false, assets: A, reason, code });

  const asset = assetById(assetId);
  if (!asset) return fail(ASSET_FAIL.UNKNOWN_ASSET, "找不到這份資產");
  if (!isEarnedIdentity(asset)) return fail(ASSET_FAIL.UNKNOWN_ASSET, "這份資產不是實績取得的稱號");
  if (A.owned[assetId]) return fail(ASSET_FAIL.ALREADY_OWNED, "已經擁有這個稱號");

  const p = earnedRequirementProgress(asset, { annualChampionCount });
  if (!p.met) return fail(ASSET_FAIL.NOT_EARNED, `還需要 ${p.need - p.have} 次年度冠軍`);

  return {
    ok: true, reason: null, code: null,
    assets: { ...A, owned: { ...A.owned, [assetId]: { acquiredWeek: posInt(careerWeek) ?? 1, earned: true } } },
  };
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
  if (A.owned[assetId]) return fail(ASSET_FAIL.ALREADY_OWNED, "已經擁有這份資產");
  //  ⚠ retired = 下架，不是刪除：已擁有的照樣保留，但不能再新購買。
  if (isRetired(asset)) return fail(ASSET_FAIL.RETIRED, "這份資產已經下架，無法再取得");
  //  ⚠ **實績稱號買不到。** 擋在這裡（而不是靠 UI 不畫購買鍵）才是真的擋住：
  //    這是唯一的購買入口，任何呼叫端都繞不過去。
  if (isEarnedIdentity(asset)) {
    return fail(ASSET_FAIL.EARNED_ONLY, "這個稱號只能靠比賽實績取得，點數買不到");
  }
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

  const target = assetById(assetId);
  if (!target) return fail(ASSET_FAIL.UNKNOWN_ASSET, "找不到這份資產");
  //  ⚠ 外觀資產與教練共用同一個 `owned` ⇒ 這裡必須擋，否則一件主題色可以被
  //    裝成總教練（型別檢查是唯一擋得住的地方）。
  if (isCosmetic(target)) return fail(ASSET_FAIL.UNKNOWN_ASSET, "這是外觀資產，不能當總教練");
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
 * 裝備／卸下一件外觀。
 *
 * ⚠ **與教練的規則刻意不同，這不是不一致：**
 *   教練會改變數值，所以換人有每週一次的成本；外觀不影響任何數值，
 *   對它設冷卻只會懲罰玩家換造型，換不到任何設計上的好處。
 *   ⇒ **免費、隨時可換、可以卸回預設**（`assetId = null`）。
 *   教練的 `lastCoachChangeWeek` 完全不受這裡影響。
 *
 * @param {string|null} assetId `null` ⇒ 把該槽卸回俱樂部預設外觀。
 * @param {string=} slotHint 卸下時要指定槽位（`null` 沒有型別可以推斷）。
 */
export function equipIdentity(assets, assetId, { slot: slotHint = null } = {}) {
  const A = normalizeClubAssets(assets);
  const fail = (code, reason) => ({ ok: false, assets: A, reason, code, slot: null });

  //  卸下：只要槽位合法就成立。
  if (assetId === null) {
    if (!IDENTITY_SLOTS.includes(slotHint)) return fail(ASSET_FAIL.UNKNOWN_ASSET, "找不到這個外觀槽位");
    if (A.equippedIdentity[slotHint] === null) return fail(ASSET_FAIL.ALREADY_EQUIPPED, "這個槽位已經是預設外觀");
    return {
      ok: true, reason: null, code: null, slot: slotHint,
      assets: { ...A, equippedIdentity: { ...A.equippedIdentity, [slotHint]: null } },
    };
  }

  const asset = assetById(assetId);
  if (!asset) return fail(ASSET_FAIL.UNKNOWN_ASSET, "找不到這份資產");
  if (!isCosmetic(asset)) return fail(ASSET_FAIL.UNKNOWN_ASSET, "這不是外觀資產");
  if (!A.owned[assetId]) return fail(ASSET_FAIL.NOT_OWNED, "還沒有取得這個外觀");

  const slot = identitySlotOf(asset);
  if (!IDENTITY_SLOTS.includes(slot)) return fail(ASSET_FAIL.UNKNOWN_ASSET, "這份外觀沒有對應的槽位");
  if (A.equippedIdentity[slot] === assetId) return fail(ASSET_FAIL.ALREADY_EQUIPPED, "這個外觀已經在使用中");

  return {
    ok: true, reason: null, code: null, slot,
    assets: { ...A, equippedIdentity: { ...A.equippedIdentity, [slot]: assetId } },
  };
}

/**
 * 現在生效的外觀 token。**呈現層唯一該讀的東西**——畫面不要自己去查型錄。
 *
 * ⚠ 回傳的顏色只能流進管理／俱樂部呈現層。戰鬥側顏色（MOBA 藍紅、CS T/CT）
 *   有自己的權威，識別一個都不准覆蓋（見 `identityCatalog.js` 檔頭）。
 */
export function identityPresentationOf(assets) {
  const A = normalizeClubAssets(assets);
  const of = (slot) => {
    const id = A.equippedIdentity[slot];
    const asset = id ? assetById(id) : null;
    return asset ? { assetId: id, name: asset.name, token: asset.visualToken } : null;
  };
  const theme = of(IDENTITY_SLOT_OF.clubTheme);
  const title = of(IDENTITY_SLOT_OF.clubTitle);
  const crestFrame = of(IDENTITY_SLOT_OF.clubCrestFrame);
  const banner = of(IDENTITY_SLOT_OF.clubBanner);
  return {
    schema: CLUB_ASSET_VERSION,
    theme, title, crestFrame, banner,
    //  攤平成畫面直接可用的值；沒裝備就是 null ⇒ 畫面沿用既有預設，不做任何事。
    skin: theme?.token?.skin ?? null,
    accent: theme?.token?.accent ?? null,
    accent2: theme?.token?.accent2 ?? null,
    titleLabel: title?.token?.label ?? null,
    //  買來的與打來的看得出來不一樣——呈現層靠這個旗標換銘牌樣式。
    titleEarned: title ? isEarnedIdentity(assetById(title.assetId)) : false,
    //  小型隊徽框
    crestPattern: crestFrame?.token?.pattern ?? null,
    crestRing: crestFrame?.token?.ring ?? null,
    //  大面積主視覺
    bannerMotif: banner?.token?.motif ?? null,
    bannerWash: banner?.token?.wash ?? null,
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
        retired: isRetired(asset),
      };
    }),
  };
}

/**
 * 外觀型錄要的一整包。與教練的 view 分開，因為**規則不同**：
 * 外觀沒有週鎖、可以卸回預設、而且分三個槽各自獨立。
 */
export function identityViewOf(assets, {
  catalog, clubPoints = 0, clubPointsLifetime = 0, annualChampionCount = 0,
} = {}) {
  const A = normalizeClubAssets(assets);
  const balance = Math.max(0, Math.floor(Number(clubPoints) || 0));
  const present = identityPresentationOf(A);
  return {
    schema: CLUB_ASSET_VERSION,
    clubPoints: balance,
    annualChampionCount: Math.max(0, Math.floor(Number(annualChampionCount) || 0)),
    equipped: { ...A.equippedIdentity },
    presentation: present,
    items: (catalog ?? []).map((asset) => {
      const slot = identitySlotOf(asset);
      const owned = Boolean(A.owned[asset.assetId]);
      const equipped = A.equippedIdentity[slot] === asset.assetId;
      const preOk = prerequisiteMet(asset, { clubPointsLifetime });
      const retired = isRetired(asset);
      const earned = isEarnedIdentity(asset);
      //  ⚠ earned 沒有價格（`priceClubPoints` 是 null）。這裡**不要**讓它掉進
      //    數字比較——`balance >= null` 會是 true，一路把「買不到的稱號」
      //    算成「買得起」。earned 一律 affordable:false、canBuy:false。
      const affordable = earned ? false : balance >= asset.priceClubPoints;
      const progress = earnedRequirementProgress(asset, { annualChampionCount });
      return {
        assetId: asset.assetId,
        type: asset.type,
        slot,
        name: asset.name,
        description: asset.description,
        styleTags: asset.styleTags ?? [],
        visualToken: asset.visualToken,
        source: asset.source ?? null,
        earned,
        //  earned 的進度給畫面顯示「還差幾次」，判定仍在 domain。
        earnedRequirement: asset.earnedRequirement ?? null,
        earnedMet: earned ? progress.met : true,
        earnedHave: earned ? progress.have : 0,
        earnedNeed: earned ? progress.need : 0,
        price: asset.priceClubPoints,
        prerequisite: asset.prerequisite,
        prerequisiteMet: preOk,
        competitivePolicy: asset.competitivePolicy,
        owned, equipped, affordable, retired,
        shortBy: affordable || earned ? 0 : asset.priceClubPoints - balance,
        //  下架品仍可裝備（已擁有的話），只是不能再買。
        canBuy: !owned && !earned && !retired && preOk && affordable,
        //  外觀裝備**沒有任何冷卻**：擁有且不是現用的，隨時可換。
        canEquip: owned && !equipped,
        blockedBy: owned
          ? null
          : (earned ? (progress.met ? null : ASSET_FAIL.NOT_EARNED)
            : (retired ? ASSET_FAIL.RETIRED
              : (!preOk ? ASSET_FAIL.PREREQUISITE
                : (!affordable ? ASSET_FAIL.INSUFFICIENT : null)))),
        acquiredWeek: owned ? A.owned[asset.assetId].acquiredWeek : null,
      };
    }),
  };
}
