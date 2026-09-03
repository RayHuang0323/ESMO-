#!/usr/bin/env node
// ============================================================================
//  tools/check_club_identity_v1.mjs — Club Identity v1 契約驗證
//
//  執行：`node tools/check_club_identity_v1.mjs`；失敗 exit 1。
//
//  ── 這支在守什麼 ────────────────────────────────────────────────────────
//  ① 型錄自我一致（無 rarity、每筆都明寫 retired、visualToken 形狀正確）
//  ② **識別永遠沒有能力**：capability 為空、competitivePolicy 為 cosmeticNeutral
//  ③ **戰鬥側顏色隔離**：識別的顏色不得流進 MOBA 藍紅或 CS T／CT
//  ④ 收藏／裝備：共用 owned、三槽獨立、免費、無冷卻、與教練週鎖完全分開
//  ⑤ 永久擁有：型錄查不到不刪、retired 不可再買、重複購買不重複扣點
//  ⑥ 經濟：lifetime 不下降、Club Level 不下降
// ============================================================================
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = async (p) => import(pathToFileURL(join(ROOT, p)).href);

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const eq = (n, a, b) => ck(n, JSON.stringify(a) === JSON.stringify(b), `得到 ${JSON.stringify(a)}`);

const idMod = await imp("src/platform/assets/identityCatalog.js");
const unionMod = await imp("src/platform/assets/assetCatalog.js");
const stateMod = await imp("src/platform/assets/clubAssetsState.js");
const capMod = await imp("src/platform/assets/clubCapabilities.js");
const retentionMod = await imp("src/platform/retention/retentionState.js");

const {
  IDENTITY_CATALOG, IDENTITY_TYPES, IDENTITY_TYPE_LIST, IDENTITY_SLOT_OF, IDENTITY_SLOTS,
  validateIdentityCatalog, identityById, identitySlotOf, STYLE_TAGS,
} = idMod;
const { ALL_ASSETS, assetById, validateCatalogUnion, isCosmetic } = unionMod;
const {
  emptyClubAssets, normalizeClubAssets, purchaseAsset, equipIdentity, equipHeadCoach,
  grantEarnedIdentity,
  identityPresentationOf, identityViewOf, ASSET_FAIL,
} = stateMod;
//  v2：公開識別契約（對手俱樂部卡共用的那一份）。
const publicMod = await imp("src/platform/identity/publicClubIdentity.js");
const { publicClubCardOf, assertPublicSafe, neutralIdentityOf } = publicMod;
const { clubCapabilitiesOf, emptyCapabilities } = capMod;
const { emptyRetention, spendClubPoints, clubTierOf } = retentionMod;

const rich = { clubPoints: 9000, clubPointsLifetime: 9000, careerWeek: 3 };
const buyAll = (ids) => ids.reduce((acc, id) => purchaseAsset(acc, id, rich).assets, emptyClubAssets());

// ── ① 型錄 ────────────────────────────────────────────────────────────────
console.log("\n── ① 型錄 ──");
const errs = validateIdentityCatalog();
ck("識別型錄自我驗證無錯誤", errs.length === 0, errs.join(" / ") || "clean");
eq("兩份型錄合起來沒有重複 id", validateCatalogUnion(), []);
ck("數量在 8–16 之間", IDENTITY_CATALOG.length >= 8 && IDENTITY_CATALOG.length <= 16, `${IDENTITY_CATALOG.length} 件`);
eq("四種型別都有", [...new Set(IDENTITY_CATALOG.map((a) => a.type))].sort(), [...IDENTITY_TYPE_LIST].sort());
ck("每種型別至少 2 件",
  IDENTITY_TYPE_LIST.every((t) => IDENTITY_CATALOG.filter((a) => a.type === t).length >= 2));
ck("沒有 rarity / presentationTier / 星等欄位",
  IDENTITY_CATALOG.every((a) => !("rarity" in a) && !("presentationTier" in a) && !("stars" in a) && !("tier" in a)));
ck("每筆都明寫 retired（下架用改值，不用刪除）",
  IDENTITY_CATALOG.every((a) => a.retired === false), IDENTITY_CATALOG.map((a) => a.retired).join(","));
ck("styleTags 全部在值域內（無序分類，不是等級）",
  IDENTITY_CATALOG.every((a) => a.styleTags.every((t) => STYLE_TAGS.includes(t))));
ck("每筆都在統一查表裡找得到", IDENTITY_CATALOG.every((a) => assetById(a.assetId) === a));
ck("每筆都被認定為外觀資產", IDENTITY_CATALOG.every((a) => isCosmetic(a) === true));
ck("槽位對照完整", IDENTITY_CATALOG.every((a) => IDENTITY_SLOTS.includes(identitySlotOf(a))));

// ── ② 識別永遠沒有能力 ───────────────────────────────────────────────────
console.log("\n── ② 沒有能力、cosmeticNeutral ──");
ck("每一件的 capability 都是空物件",
  IDENTITY_CATALOG.every((a) => a.capability && Object.keys(a.capability).length === 0));
ck("每一件都是 cosmeticNeutral",
  IDENTITY_CATALOG.every((a) => a.competitivePolicy === "cosmeticNeutral"));
//  ⚠ 真的裝上去也不能長出能力——契約寫得再好，行為才算數。
{
  const owned = buyAll(["theme_ember", "title_ironclad", "crest_laurel", "banner_halo"]);
  let A = owned;
  for (const id of ["theme_ember", "title_ironclad", "crest_laurel", "banner_halo"]) A = equipIdentity(A, id).assets;
  eq("三件外觀全裝上之後，教練能力仍為空",
    clubCapabilitiesOf({ developmentEffects: {}, clubAssets: A }).sources.coach, emptyCapabilities());
  eq("合併後的能力也沒有被外觀影響",
    clubCapabilitiesOf({ developmentEffects: {}, clubAssets: A }).total, emptyCapabilities());
}
//  外觀不得被裝成總教練（兩者共用同一個 owned，只有型別擋得住）。
{
  const A = buyAll(["theme_ember"]);
  const r = equipHeadCoach(A, "theme_ember", { careerWeek: 3 });
  ck("外觀不能被裝成總教練", r.ok === false, String(r.code));
  eq("被拒時 state 零變化", JSON.stringify(r.assets), JSON.stringify(normalizeClubAssets(A)));
}

// ── ③ 戰鬥側顏色隔離（**本輪最重要的一條**）─────────────────────────────
console.log("\n── ③ 戰鬥側顏色隔離 ──");
//  識別的顏色不得出現在戰鬥側顏色的權威檔裡。
const identityColors = IDENTITY_CATALOG
  .flatMap((a) => [a.visualToken?.accent, a.visualToken?.accent2, a.visualToken?.ring])
  .filter(Boolean)
  .map((c) => c.toLowerCase());
const themeSrc = readFileSync(join(ROOT, "src/ui/theme.js"), "utf8");
ck("MOBA 側顏色權威（ui/theme.js 的 sideColor）仍只吃 GC.blueL / GC.redL",
  /export const sideColor\s*=\s*\(side\)\s*=>\s*\(side === "blue" \? GC\.blueL : GC\.redL\)/.test(themeSrc));
ck("theme.js 沒有 import 任何識別模組",
  !/identityCatalog|clubAssetsState|assetCatalog/.test(themeSrc));

//  掃描：戰鬥層與 CS 畫面都不得引用識別。
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
};
const battleFiles = [...walk(join(ROOT, "src/battle")), ...walk(join(ROOT, "src/screens/fps"))];
const leaks = [];
for (const p of battleFiles) {
  const src = readFileSync(p, "utf8");
  const r = relative(ROOT, p).split("\\").join("/");
  if (/identityCatalog|clubIdentity|identityPresentationOf|equippedIdentity|--club-accent|--club-ring/.test(src)) {
    leaks.push(r);
  }
}
ck("戰鬥層與 CS 畫面完全沒有引用識別", leaks.length === 0, leaks.join(" / ") || "clean");

//  ⚠ 反向：識別模組也不得認識戰鬥。
const idSrc = readFileSync(join(ROOT, "src/platform/assets/identityCatalog.js"), "utf8");
ck("識別型錄不 import 任何戰鬥／主題模組",
  !/from\s+["'][^"']*(battle|LogicEngine|theme\.js)/.test(idSrc));

//  識別顏色與 side 顏色不得撞色（撞了就等於視覺上覆蓋了敵我線索）。
const SIDE_COLORS = ["#93c5fd", "#fca5a5"];
const clash = identityColors.filter((c) => SIDE_COLORS.includes(c));
ck("識別顏色不與 MOBA 藍紅撞色", clash.length === 0, clash.join(",") || "clean");

//  主題只能經由 dashboard 的兩個 CSS 變數生效——那是唯一的注入點。
const dashSrc = readFileSync(join(ROOT, "src/screens/DashboardScreen.jsx"), "utf8");
ck("主題只注入 --club-accent / --club-accent-2 / --club-ring",
  /"--club-accent"/.test(dashSrc) && /"--club-accent-2"/.test(dashSrc) && /"--club-ring"/.test(dashSrc));
ck("Dashboard 讀的是 clubIdentity() 這個唯一入口",
  /profile\.clubIdentity\(\)/.test(dashSrc));

// ── ④ 收藏與裝備 ─────────────────────────────────────────────────────────
console.log("\n── ④ 收藏與裝備 ──");
eq("空袋子有三個外觀槽", Object.keys(emptyClubAssets().equippedIdentity).sort(), [...IDENTITY_SLOTS].sort());
{
  const A0 = buyAll(["theme_ember", "theme_verdant", "title_rising"]);
  const e1 = equipIdentity(A0, "theme_ember");
  ck("裝備主題色成功且落在 themeId 槽", e1.ok === true && e1.slot === IDENTITY_SLOT_OF.clubTheme);
  //  ⚠ 外觀**沒有冷卻**：同一「週」內換幾次都可以（這裡根本不傳 careerWeek）。
  const e2 = equipIdentity(e1.assets, "theme_verdant");
  ck("同一時間內可以立刻再換主題（無冷卻）", e2.ok === true);
  eq("換完之後 themeId 是後選的那個", e2.assets.equippedIdentity.themeId, "theme_verdant");
  //  三個槽彼此獨立。
  const e3 = equipIdentity(e2.assets, "title_rising");
  eq("裝稱號不影響主題槽", e3.assets.equippedIdentity.themeId, "theme_verdant");
  eq("稱號落在自己的槽", e3.assets.equippedIdentity.titleId, "title_rising");
  eq("沒買的隊徽框槽仍是 null", e3.assets.equippedIdentity.bannerId, null);
  //  卸回預設。
  const c1 = equipIdentity(e3.assets, null, { slot: IDENTITY_SLOT_OF.clubTheme });
  ck("可以卸回預設外觀", c1.ok === true);
  eq("卸下後該槽為 null", c1.assets.equippedIdentity.themeId, null);
  ck("重複卸下被拒", equipIdentity(c1.assets, null, { slot: IDENTITY_SLOT_OF.clubTheme }).ok === false);
  //  沒買不能裝。
  ck("沒買的外觀不能裝", equipIdentity(A0, "crest_laurel").ok === false);
  ck("重複裝備現用的被拒", equipIdentity(e3.assets, "title_rising").ok === false);

  //  ⚠ 教練週鎖完全不受外觀影響。
  eq("外觀操作不寫 lastCoachChangeWeek", e3.assets.lastCoachChangeWeek, null);
  eq("外觀操作不動 headCoachId", e3.assets.headCoachId, null);
}
//  裝備狀態要能 reload。
{
  let A = buyAll(["crest_hex"]);
  A = equipIdentity(A, "crest_hex").assets;
  const reloaded = normalizeClubAssets(JSON.parse(JSON.stringify(A)));
  eq("reload 後外觀仍裝備著", reloaded.equippedIdentity.crestFrameId, "crest_hex");
  eq("reload 後呈現 token 仍算得出來", identityPresentationOf(reloaded).crestPattern, "hex");
}
//  裝備 fail closed：存檔被手改成裝了沒買的東西 ⇒ 歸 null，但 ownership 不受影響。
{
  const hacked = normalizeClubAssets({
    owned: { theme_ember: { acquiredWeek: 1 } },
    equippedIdentity: { themeId: "theme_verdant", titleId: "not_a_real_id", bannerId: "theme_ember" },
  });
  eq("裝了沒買的主題 ⇒ 歸 null", hacked.equippedIdentity.themeId, null);
  eq("裝了不存在的 id ⇒ 歸 null", hacked.equippedIdentity.titleId, null);
  eq("型別對不上槽位 ⇒ 歸 null", hacked.equippedIdentity.bannerId, null);
  eq("但已擁有的東西一件都沒少", Object.keys(hacked.owned), ["theme_ember"]);
}

// ── ⑤ 永久擁有 ───────────────────────────────────────────────────────────
console.log("\n── ⑤ 永久擁有 ──");
{
  const A = buyAll(["theme_ember"]);
  const again = purchaseAsset(A, "theme_ember", rich);
  ck("重複購買被拒", again.ok === false && again.code === ASSET_FAIL.ALREADY_OWNED);
  eq("重複購買不回傳價格（不可能被扣款）", again.price, 0);
  eq("重複購買 state 零變化", JSON.stringify(again.assets), JSON.stringify(normalizeClubAssets(A)));

  const ghost = normalizeClubAssets({ owned: { retired_looking_thing: { acquiredWeek: 2 } } });
  eq("型錄查不到的外觀仍然保留", Object.keys(ghost.owned), ["retired_looking_thing"]);
  ck("並標記為 unknown 供 UI 顯示典藏", ghost.owned.retired_looking_thing.unknown === true);
}
//  ── 實績稱號（v2）：**買不到**，而且擋在 domain，不是靠 UI 不畫按鈕 ──────
{
  for (const id of ["title_champion", "title_dynasty"]) {
    const r = purchaseAsset(emptyClubAssets(), id, { clubPoints: 999999, clubPointsLifetime: 999999, careerWeek: 1 });
    ck(`實績稱號再有錢也買不到（${id}）`, r.ok === false && r.code === ASSET_FAIL.EARNED_ONLY, `code=${r.code}`);
  }
  ck("實績不足不得授予",
    grantEarnedIdentity(emptyClubAssets(), "title_champion", { annualChampionCount: 0 }).ok === false);
  const g1 = grantEarnedIdentity(emptyClubAssets(), "title_champion", { annualChampionCount: 1, careerWeek: 3 });
  ck("拿過 1 次年度冠軍 ⇒ 冠軍稱號入手", g1.ok === true && Boolean(g1.assets.owned.title_champion));
  ck("1 次還拿不到王朝",
    grantEarnedIdentity(g1.assets, "title_dynasty", { annualChampionCount: 1 }).ok === false);
  const g3 = grantEarnedIdentity(g1.assets, "title_dynasty", { annualChampionCount: 3, careerWeek: 9 });
  ck("拿過 3 次 ⇒ 王朝入手", g3.ok === true && Boolean(g3.assets.owned.title_dynasty));
  //  ⚠ 授予路徑不得變成繞過付款的萬用後門。
  ck("授予路徑不能拿來白拿可購買的外觀",
    grantEarnedIdentity(emptyClubAssets(), "theme_ember", { annualChampionCount: 99 }).ok === false);
  const back = normalizeClubAssets(JSON.parse(JSON.stringify(g3.assets)));
  ck("實績稱號 reload 後仍在", Boolean(back.owned.title_champion) && Boolean(back.owned.title_dynasty));
}

// ── ⑥ 經濟 ───────────────────────────────────────────────────────────────
console.log("\n── ⑥ 經濟 ──");
{
  const R0 = { ...emptyRetention(), clubPoints: 3000, clubPointsLifetime: 3000 };
  const tierBefore = clubTierOf(R0.clubPointsLifetime);
  const spent = spendClubPoints(R0, 700);
  eq("買外觀扣掉可用點數", spent.retention.clubPoints, 2300);
  eq("clubPointsLifetime 逐值不變", spent.retention.clubPointsLifetime, 3000);
  eq("俱樂部等級不下降", clubTierOf(spent.retention.clubPointsLifetime).id, tierBefore.id);
}
//  ⚠ 只算**買得到**的那些。實績稱號沒有價格（null），把它算進總價會讓這條
//     門檻靜默地變成 NaN，或把「買不到」誤讀成「免費」。
const buyable = IDENTITY_CATALOG.filter((a) => a.source !== "earned");
const total = buyable.reduce((s, a) => s + a.priceClubPoints, 0);
ck("全套外觀總價落在 1.5–2.5 個賽季的產速內（約 3000/季）",
  total >= 4500 && total <= 7500, `${total} 點 ≈ ${(total / 3000).toFixed(1)} 季`);
ck("最貴的單件不超過一個月的產速（避免為外觀 grind）",
  Math.max(...buyable.map((a) => a.priceClubPoints)) <= 1000,
  `最貴 ${Math.max(...buyable.map((a) => a.priceClubPoints))}`);
//  大面積橫幅要比小隊徽框貴——價格要說得出兩個槽的體積差，
//  否則玩家分不出這兩個槽為什麼要分開（那正是 v1 的語意錯誤）。
{
  const maxCrest = Math.max(...buyable.filter((a) => a.type === IDENTITY_TYPES.CREST_FRAME).map((a) => a.priceClubPoints));
  const minBanner = Math.min(...buyable.filter((a) => a.type === IDENTITY_TYPES.BANNER).map((a) => a.priceClubPoints));
  ck("大面積橫幅比小隊徽框貴", minBanner > maxCrest, `crest<=${maxCrest} banner>=${minBanner}`);
}

// ── ⑦ view ───────────────────────────────────────────────────────────────
console.log("\n── ⑦ view ──");
{
  let A = buyAll(["theme_ember"]);
  A = equipIdentity(A, "theme_ember").assets;
  const v = identityViewOf(A, { catalog: IDENTITY_CATALOG, clubPoints: 800, clubPointsLifetime: 3000 });
  eq("view 帶出全部型錄", v.items.length, IDENTITY_CATALOG.length);
  const ember = v.items.find((i) => i.assetId === "theme_ember");
  ck("已裝備的標記正確", ember.owned === true && ember.equipped === true && ember.canEquip === false);
  const verdant = v.items.find((i) => i.assetId === "theme_verdant");
  ck("買得起的可買", verdant.canBuy === true, `price=${verdant.price} balance=800`);
  const ridge = v.items.find((i) => i.assetId === "banner_ridge");
  ck("買不起的說得出差多少", ridge.canBuy === false && ridge.shortBy === 100, `shortBy=${ridge.shortBy}`);
  eq("view 直接給呈現用的 accent", v.presentation.accent, "#fb923c");
  eq("view 直接給呈現用的 skin", v.presentation.skin, "ember");
  //  實績稱號在 view 上：不可買、不當成買得起、講得出還差幾次。
  const champ = v.items.find((i) => i.assetId === "title_champion");
  ck("實績稱號在 view 上不可買",
    champ.canBuy === false && champ.earned === true && champ.affordable === false);
  eq("實績稱號說得出還差幾次", [champ.earnedHave, champ.earnedNeed], [0, 1]);
}
//  未裝備任何外觀 ⇒ 呈現全部是 null ⇒ 畫面沿用既有預設，逐像素不變。
{
  const p = identityPresentationOf(emptyClubAssets());
  ck("完全未裝備時呈現值全為 null（畫面不做任何事）",
    p.skin === null && p.accent === null && p.accent2 === null && p.titleLabel === null
    && p.crestPattern === null && p.crestRing === null
    && p.bannerMotif === null && p.bannerWash === null);
  ck("未裝備稱號時 titleEarned 是 false（不是 null）", p.titleEarned === false);
}

// ── ⑧ 公開識別契約（Social Identity v1）──────────────────────────────────
console.log("\n── ⑧ 公開識別契約 ──");
{
  const ids = ["theme_ember", "title_ironclad", "crest_laurel", "banner_halo"];
  let A = buyAll(ids);
  for (const id of ids) A = equipIdentity(A, id).assets;
  const card = publicClubCardOf({
    teamId: "t1", name: "德國海豹", tag: "GSEAL", emoji: "🦭",
    identity: identityPresentationOf(A),
    prestige: clubTierOf(3000),
    record: { rank: 2, wins: 8, losses: 4, points: 24 },
    honors: [{ label: "亞洲年度冠軍", season: 1, gameMode: "moba" }],
    isMe: true,
  });
  eq("公開卡帶得出稱號", card.titleLabel, "鐵壁");
  eq("公開卡帶得出皮膚", card.skin, "ember");
  eq("公開卡帶得出大面積橫幅", card.bannerMotif, "halo");
  eq("公開卡帶得出隊徽框", card.crestPattern, "laurel");
  ck("公開卡帶得出戰績與榮耀", card.record.rank === 2 && card.honors.length === 1);

  //  ⚠ 這一條是整張對手卡存在的前提：點對手不得變成免費偵察。
  eq("公開卡不含任何禁列欄位", assertPublicSafe(card), []);

  //  禁列真的有在擋（不是一個永遠回空陣列的裝飾）。
  ck("禁列會抓到洩漏",
    assertPublicSafe({ ...card, activeDoctrine: "aggro" }).length === 1,
    JSON.stringify(assertPublicSafe({ ...card, activeDoctrine: "aggro" })));
  ck("禁列也擋巢狀洩漏",
    assertPublicSafe({ ...card, meta: { headCoachId: "coach_tactical" } }).length === 1);

  //  AI 對手：借自己的隊色，但**不得**拿到玩家花點數買的收藏品。
  const ai = neutralIdentityOf("#7c3aed");
  ck("AI 俱樂部有自己的顏色", ai.accent === "#7c3aed" && ai.derived === true);
  ck("AI 俱樂部拿不到玩家的皮膚／橫幅／隊徽框",
    ai.skin === null && ai.bannerMotif === null && ai.crestPattern === null);
}

console.log(`\nClub Identity v2：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
