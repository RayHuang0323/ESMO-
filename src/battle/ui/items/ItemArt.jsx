// ============================================================================
//  battle/ui/items/ItemArt.jsx — 裝備專屬圖示（MOBA Mobile & Presentation Polish）
//
//  Audit（改版前）：T3 44 件只有 8 個「流派圖紋」、鞋 6 雙共用 1 個 ⇒ 同流派的裝備
//    在 HUD 上長得一模一樣，只能靠名字分辨（例：破曉長弓／收割連弩／血誓長弓全是同一個準星）。
//  本輪：最高階、最常看到、最容易混淆的一批——**全部 T3（44）＋鞋（6）＝50 件**——各給一個專屬輪廓。
//    T1／T2 組件與起始裝不在本輪（沒有給圖的一律退回原本的 ItemGlyphs 圖紋，行為不變）。
//
//  視覺語言（不只靠換色）：
//    · 武器（A 射手／B 攻速／C 刺客／D 戰士）：鋼材主體＋金色握柄，斜向動勢
//    · 法術（E 法爆／F 法續）：紫色奧術材質＋發光核心，對稱／環狀構圖
//    · 防具（G 坦克／H 輔助）：青銅／石材／聖光材質，厚重、正面構圖
//    · 鞋：青綠皮革，側面輪廓，差異在鞋身附件（護甲片／羽翼／符文…）
//  每個圖都有深色外描邊 ⇒ HUD 20px 以下仍保住輪廓；與新版 Skill Icons 同一套
//  「漸層金屬＋亮描邊」材質語彙，但是 ESMO 自己的 stylized competitive fantasy 造型。
//
//  ⚠ 純呈現：只依 itemId 選圖，不讀目錄數值、不影響任何戰鬥資料。
// ============================================================================
import React, { useId } from "react";
//  色票一律放 itemsTheme（check_moba_items_m3 G3：裝備 UI 元件不自寫色碼）。
import { ITEM_ART_INK, ITEM_ART_MATERIALS } from "./itemsTheme.js";

export { ITEM_ART_MATERIALS };

/** 視覺類別（給 gate 與圖鑑用）。 */
export const ITEM_ART_CATEGORY = Object.freeze({ weapon: "weapon", magic: "magic", armor: "armor", boots: "boots" });

// 形狀：[fill, d]。fill ∈ m(主體) a(點綴) d(暗部) g(發光面) l(亮線) gl(發光線)；l／gl 只描邊不填色
const m = (d) => ["m", d], a = (d) => ["a", d], dk = (d) => ["d", d], g = (d) => ["g", d], l = (d) => ["l", d], gl = (d) => ["gl", d];
const LINE = new Set(["l", "gl"]);

// ── 可重用零件（48×48）────────────────────────────────────────────────────
const BOW = "M13 5c14 6 22 18 20 38l-3-.4c1.6-17.6-5.6-28-18.6-34z";
const STRING = "M13.4 6.6 31.6 42.2";
const ARROW = "M7 41 36 12";
const ARROW_HEAD = "M33 9.5 41 7l-2.5 8-3-1.8z";
const DAGGER_BLADE = "M30 6 38 4l-2 8-17 17-4-4z";
const DAGGER_GRIP = "M15.5 28.5l4 4-3 3-4-4zM11 33l4 4-4.5 4.5-4-4z";
const AXE_SHAFT = "M12 44 34 10l3 2-22 34z";
const CROWN = "M8 34 10 14l8 9 6-13 6 13 8-9 2 20z";
const CROWN_BAND = "M9 34h30v6H9z";
const SHIELD = "M24 4 40 9v13c0 11-7 18-16 22C15 40 8 33 8 22V9z";
const BOOT = "M13 5h13v19l12 5c3 1.3 5 4 5 7v4H8v-8l5-6z";
const BOOT_SOLE = "M8 40h35v4H8z";
const STAFF = "M11 45 31 16l3 2-20 29z";
const ORB = "M34 4a9 9 0 1 1 0 18 9 9 0 0 1 0-18z";

/**
 * 50 件專屬圖示（T3 44 ＋ 鞋 6）。
 * ⚠ 新增或改名裝備時，id 必須與 itemCatalog 一致（gate 會比對）。
 */
export const ITEM_ART = Object.freeze({
  // ─── A 射手／暴擊：長弓家族，靠「弓的附件」區分 ────────────────────────
  t3_dawnbow: { mat: "steel", cat: "weapon", shapes: [
    g("M12 1a11 11 0 1 1 0 22 11 11 0 0 1 0-22z"), gl("M1 12h-1M12 24v2M24 12h2"), m(BOW), l(STRING), m(ARROW), a(ARROW_HEAD)] },
  t3_hunter: { mat: "steel", cat: "weapon", shapes: [
    m(BOW), l(STRING), m(ARROW), a(ARROW_HEAD), a("M1 26c6-9 18-9 24 0-6 9-18 9-24 0z"), dk("M13 22a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"), g("M14.2 23.4a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z")] },
  t3_reaper: { mat: "steel", cat: "weapon", shapes: [
    m("M6 30 42 30l0 5H6z"), m("M20 14c8 2 14 8 16 16h-4c-2-6-6-10-12-12z"), m("M20 46c8-2 14-8 16-16h-4c-2 6-6 10-12 12z"),
    a("M6 26h10v13H6z"), l("M20 16 20 44"), a("M40 28l6 4.5-6 4.5z")] },
  t3_pierce: { mat: "steel", cat: "weapon", shapes: [
    m(BOW), l(STRING), m("M6 42 32 16l3 3L9 45z"), a("M30 10 44 4l-6 14-4-4z"), a("M28 12l8 8-2 2-8-8z")] },
  t3_bloodoath: { mat: "steel", cat: "weapon", shapes: [
    m(BOW), l(STRING), m(ARROW), a(ARROW_HEAD), ["a", "M10 20c5 7 8 11 8 14.6a8 8 0 0 1-16 0c0-3.6 3-7.6 8-14.6z"]] },
  t3_rendspear: { mat: "steel", cat: "weapon", shapes: [
    m("M6 44 34 16l3 3L9 47z"), m("M33 6 45 3l-3 12-9 5-4-5z"), a("M29 16l-6-2 3 6zM35 22l2 6-6-3z"), a("M10 36l4 4-3 3-4-4z")] },

  // ─── B 攻速／On-hit：握在手上的武器與護具 ───────────────────────────────
  t3_stormfork: { mat: "steel", cat: "weapon", shapes: [
    m("M8 46 30 16l3 2L11 48z"), m("M26 4l4 12 5-10 2 12 8-6-6 12-14 4z"), a("M24 20l6 4-3 3-6-4z"), gl("M40 26l-4 6h4l-3 6")] },
  t3_thunderfist: { mat: "steel", cat: "weapon", shapes: [
    m("M12 22c0-5 3-8 7-8h10c4 0 7 3 7 8v10c0 6-5 10-12 10s-12-4-12-10z"), m("M16 10h4v8h-4zM22 8h4v9h-4zM28 10h4v8h-4z"),
    a("M10 40h28v6H10z"), g("M26 18 18 30h6l-3 10 9-13h-6z")] },
  t3_torrent: { mat: "steel", cat: "weapon", shapes: [
    m("M10 12h28v24H10z"), a("M10 12h28v4H10zM10 32h28v4H10z"), gl("M13 25c3-4 6-4 9 0s6 4 9 0 5-3 5-3"), a("M20 20a4 4 0 1 1 8 0 4 4 0 0 1-8 0z")] },
  t3_serpent: { mat: "steel", cat: "weapon", shapes: [
    m("M38 4c-2 4 2 6 0 10s-6 4-8 8 2 6-2 10l-6 4-4-4 4-6c4-4 2-6 4-10s6-4 8-8-1-4 4-6z"), a("M14 30l6 6-3 3-6-6z"), a("M8 38l4 4-4 4-4-4z"),
    dk("M37 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z")] },
  t3_shieldbreaker: { mat: "steel", cat: "weapon", shapes: [
    m("M8 44 26 20l3 2L11 46z"), m("M20 6l20 10-8 14-20-10z"), a("M38 15l6 3-5 9-6-3z"), dk("M24 12l-3 6 6 3z")] },

  // ─── C 刺客／穿透：短刃、鐮、斗篷 ─────────────────────────────────────
  t3_shadowblade: { mat: "steel", cat: "weapon", shapes: [
    dk("M34 4c6 8 6 18-2 26l-4-4c6-6 7-13 6-22z"), m("M36 4c2 10-2 18-12 26l-4-4c8-6 12-12 16-22z"), a(DAGGER_GRIP)] },
  t3_nightscythe: { mat: "steel", cat: "weapon", shapes: [
    m("M10 46 28 8l3 1.4L13 47.4z"), m("M28 6c8-2 16 2 18 10-6-4-12-4-17 0z"), a("M18 30l4 2-2 4-4-2z"), g("M40 26a4 4 0 1 1 0 8 4 4 0 0 1-3.4-6 3 3 0 0 0 3.4-2z")] },
  t3_headsman: { mat: "steel", cat: "weapon", shapes: [
    m("M18 6h22v14c0 6-4 10-10 10h-6l-6-6z"), dk("M34 10a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"), a("M18 24l6 6-12 12-6-6z"), a("M6 38l4 4-3 3-4-4z")] },
  t3_ghostcloak: { mat: "steel", cat: "weapon", shapes: [
    m("M24 4c8 0 12 7 12 14l6 26c-6-3-9-3-12 0-2-3-4-4-6-4s-4 1-6 4c-3-3-6-3-12 0l6-26c0-7 4-14 12-14z"),
    dk("M24 10c4 0 6 4 6 8s-2 7-6 7-6-3-6-7 2-8 6-8z"), g("M21 17h2v2h-2zM25 17h2v2h-2z")] },
  t3_finalstring: { mat: "steel", cat: "weapon", shapes: [
    a("M4 10h8v6H4zM36 32h8v6h-8z"), l("M12 13c8 0 18 6 24 22"), l("M12 15c10 2 16 8 24 20"), m("M22 18l8-8 3 3-8 8z"), dk("M30 10l4-4 3 3-4 4z")] },
  t3_heartpierce: { mat: "steel", cat: "weapon", shapes: [
    ["a", "M16 22c-6-6-14-2-12 5 1 5 8 10 12 13 4-3 11-8 12-13 2-7-6-11-12-5z"], m(DAGGER_BLADE), dk("M12 34l4 4-6 6-4-4z")] },

  // ─── D 戰士：斧、錘、旗、重甲 ─────────────────────────────────────────
  t3_warbringer: { mat: "steel", cat: "weapon", shapes: [
    m(AXE_SHAFT), m("M24 4c10-2 18 4 20 14-8 0-14-2-18-6z"), m("M26 12c-6 4-12 6-18 4 4-8 12-12 20-10z"), a("M28 10l4 3-3 4-4-3z")] },
  t3_unbroken: { mat: "steel", cat: "weapon", shapes: [
    m("M10 4h3v42h-3z"), ["a", "M13 6h26l-6 8 6 8H13z"], dk("M22 9l3 5-3 5-3-5z"), m("M8 2h7v4H8z")] },
  t3_bloodforge: { mat: "steel", cat: "weapon", shapes: [
    m("M10 10 18 6h12l8 4 4 10-6 2v20H12V22l-6-2z"), dk("M20 12h8l-4 6z"), ["a", "M24 24c3 4.5 5 7 5 9.4a5 5 0 0 1-10 0c0-2.4 2-4.9 5-9.4z"]] },
  t3_ragemaul: { mat: "steel", cat: "weapon", shapes: [
    m("M10 46 24 24l3 2-14 22z"), m("M20 10a12 10 0 1 1 20 12L28 30 16 20z"), a("M30 4l2 5-4-1zM42 12l-4 3 1-5zM44 24l-5-1 3-3zM18 8l5 1-3 3z")] },
  t3_twinaxe: { mat: "steel", cat: "weapon", shapes: [
    m("M22 8h4v38h-4z"), m("M26 10c8-2 14 2 16 10-6 2-12 0-16-4z"), m("M22 10c-8-2-14 2-16 10 6 2 12 0 16-4z"), a("M20 4h8v6h-8z"), a("M20 30h8v4h-8z")] },
  t3_bloodplate: { mat: "steel", cat: "weapon", shapes: [
    ["a", "M22 2h4l3 10h-10z"], m("M10 20c0-8 6-12 14-12s14 4 14 12v18l-6 6H16l-6-6z"),
    dk("M13 24h22v4H13z"), dk("M22.5 28h3v12h-3z"), ["a", "M10 36h28v3H10z"]] },

  // ─── E 法術爆發：冠、杖、典、珠、刃 ──────────────────────────────────
  t3_starcrown: { mat: "arcane", cat: "magic", shapes: [
    m(CROWN), a(CROWN_BAND), g("M24 2l2.2 5.2 5.6.4-4.3 3.6 1.4 5.4-4.9-3-4.9 3 1.4-5.4-4.3-3.6 5.6-.4z")] },
  t3_voidstaff: { mat: "arcane", cat: "magic", shapes: [
    m(STAFF), dk("M34 3a10 10 0 1 1 0 20 10 10 0 0 1 0-20z"), l("M34 6a7 7 0 1 1 0 14 7 7 0 0 1 0-14z"), g("M34 10a3 3 0 1 1 0 6 3 3 0 0 1 0-6z")] },
  t3_scorchtome: { mat: "arcane", cat: "magic", shapes: [
    m("M6 14 24 10l18 4v28l-18-4-18 4z"), dk("M23 10h2v28h-2z"), ["a", "M24 30c-5-3-6-8-3-12 0 3 2 4 3 4-1-4 1-8 5-10-1 4 3 6 3 10 0 5-4 8-8 8z"]] },
  t3_thunderorb: { mat: "arcane", cat: "magic", shapes: [
    m("M24 6a15 15 0 1 1 0 30 15 15 0 0 1 0-30z"), a("M14 38h20l-3 7H17z"), g("M27 11 18 23h6l-3 10 9-13h-6z")] },
  t3_tideedge: { mat: "arcane", cat: "magic", shapes: [
    m("M40 4 42 8 18 32l-4-4z"), a("M12 26l10 10-3 3-10-10z"), a("M8 36l4 4-4 4-4-4z"), gl("M26 10c4 2 6 6 4 10M32 16c3 2 4 5 2 8")] },
  t3_soulrend: { mat: "arcane", cat: "magic", shapes: [
    m(STAFF), m("M34 2 42 12l-8 12-8-12z"), gl("M34 6l-2 6 3 3-1 6"), gl("M44 6c2 2 2 5 0 7M24 6c-2 2-2 5 0 7")] },

  // ─── F 法術續戰：泉、冠、沙漏、戒、護符 ──────────────────────────────
  t3_lifespring: { mat: "arcane", cat: "magic", shapes: [
    m("M10 18h28c0 8-6 14-14 14S10 26 10 18z"), m("M21 32h6v8h-6z"), a("M14 40h20v5H14z"), g("M24 4c3 5 5 8 5 11a5 5 0 0 1-10 0c0-3 2-6 5-11z")] },
  t3_frostcrown: { mat: "arcane", cat: "magic", shapes: [
    m("M8 36 11 20l5 6 3-16 5 10 5-10 3 16 5-6 3 16z"), a(CROWN_BAND), gl("M24 2v8M20 4l8 4M28 4l-8 4")] },
  t3_hourglass: { mat: "arcane", cat: "magic", shapes: [
    a("M10 4h28v5H10zM10 39h28v5H10z"), m("M13 9h22c0 8-8 11-8 15s8 7 8 15H13c0-8 8-11 8-15s-8-7-8-15z"), g("M18 13h12l-6 9zM18 36c0-3 3-5 6-6 3 1 6 3 6 6z")] },
  t3_orbitring: { mat: "arcane", cat: "magic", shapes: [
    m("M24 12a14 12 0 1 1 0 24 14 12 0 0 1 0-24zm0 5a9 7 0 1 0 0 14 9 7 0 0 0 0-14z"), a("M24 8a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"),
    g("M40 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"), l("M6 30c4 10 22 14 34 4")] },
  t3_psyward: { mat: "arcane", cat: "magic", shapes: [
    l("M14 4c0 6 4 10 10 10s10-4 10-10"), m("M24 14 36 26 24 44 12 26z"), a("M24 20l6 6-6 10-6-10z"), g("M24 24a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z")] },

  // ─── G 坦克：正面、厚重 ──────────────────────────────────────────────
  t3_thornmail: { mat: "bronze", cat: "armor", shapes: [
    m("M8 14 16 8h16l8 6v24l-16 6-16-6z"), a("M4 12l6 2-2 4zM44 12l-6 2 2 4zM24 2l2 6h-4zM4 30l6-1-2 4zM44 30l-6-1 2 4z"), dk("M24 12v26")] },
  t3_colossus: { mat: "stone", cat: "armor", shapes: [
    m("M10 12 20 4h10l10 8 4 14-8 16H14L6 26z"), l("M16 16 12 26M34 14l4 12M22 36l2-6"), ["a", "M24 14c-5-4-11-1-10 4 1 4 6 7 10 10 4-3 9-6 10-10 1-5-5-8-10-4z"]] },
  t3_bulwark: { mat: "bronze", cat: "armor", shapes: [
    m("M8 4h32v26c0 8-8 14-16 16-8-2-16-8-16-16z"), a("M8 4h32v5H8z"), dk("M22 9h4v34h-4zM10 20h28v4H10z"), a("M24 16a6 6 0 1 1 0 12 6 6 0 0 1 0-12z")] },
  t3_calmveil: { mat: "stone", cat: "armor", shapes: [
    m("M10 6c8-4 20-4 28 0-2 10 0 22 6 34-6-2-10 0-12 4-4-4-12-4-16 0-2-4-6-6-12-4C10 28 12 16 10 6z"), gl("M14 24c4-3 8-3 10 0s6 3 10 0M14 32c4-3 8-3 10 0s6 3 10 0")] },
  t3_magmacore: { mat: "bronze", cat: "armor", shapes: [
    m("M8 14 16 8h16l8 6v24l-16 6-16-6z"), dk("M16 16h16v18H16z"), ["a", "M24 17c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"], g("M24 24c1.6 2 2.4 3.4 2.4 4.6a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2.6 2.4-4.6z")] },
  t3_statue: { mat: "stone", cat: "armor", shapes: [
    a("M8 38h32v8H8z"), m("M14 38V16c0-6 4-12 10-12s10 6 10 12v22z"), dk("M18 18h4v4h-4zM26 18h4v4h-4zM20 28h8v2h-8z"), g("M11 30h26v2H11z")] },

  // ─── H 輔助：光環、祭壇、號角、誓盾 ─────────────────────────────────
  t3_wardaltar: { mat: "holy", cat: "armor", shapes: [
    m("M10 26h28l-4 8H14z"), m("M16 34h16v6H16z"), a("M8 40h32v5H8z"), g("M24 4c4 6 6 10 6 13a6 6 0 0 1-12 0c0-3 2-7 6-13z"), l("M6 18c4-8 10-12 18-12s14 4 18 12")] },
  t3_redemption: { mat: "holy", cat: "armor", shapes: [
    m("M24 6a18 18 0 1 1 0 36 18 18 0 0 1 0-36zm0 6a12 12 0 1 0 0 24 12 12 0 0 0 0-24z"), a("M21 14h6v8h8v6h-8v8h-6v-8h-8v-6h8z")] },
  t3_warhorn: { mat: "holy", cat: "armor", shapes: [
    m("M6 32c10 0 18-6 24-18l6 2c-4 14-14 24-28 24z"), a("M30 12c4-4 10-4 14 0-2 6-8 8-14 4z"), a("M10 30h4v10h-4z"), l("M40 22c3 3 4 7 3 11M36 26c2 2 3 5 2 8")] },
  t3_vowshield: { mat: "holy", cat: "armor", shapes: [
    a("M4 14c6 0 10 4 12 10-6 0-10-4-12-10zM44 14c-6 0-10 4-12 10 6 0 10-4 12-10z"), m("M24 8a15 15 0 1 1 0 30 15 15 0 0 1 0-30z"),
    dk("M24 13a10 10 0 1 1 0 20 10 10 0 0 1 0-20z"), g("M24 16l2.6 5 5.4.8-4 3.8 1 5.4-5-2.6-5 2.6 1-5.4-4-3.8 5.4-.8z")] },

  // ─── 鞋：同一個鞋身側影，差異在附件 ─────────────────────────────────
  bt_base: { mat: "leather", cat: "boots", shapes: [m(BOOT), dk(BOOT_SOLE), a("M13 12h13v3H13z")] },
  bt_iron: { mat: "leather", cat: "boots", shapes: [m(BOOT), dk(BOOT_SOLE), ["a", "M11 6h17v8H11zM28 26l8 3v6h-8z"], dk("M14 8h2v4h-2zM22 8h2v4h-2z")] },
  bt_quiet: { mat: "leather", cat: "boots", shapes: [m(BOOT), dk(BOOT_SOLE), g("M4 6c10 0 16 6 18 16C12 20 6 14 4 6z"), l("M5 7c6 4 10 8 16 14")] },
  bt_swift: { mat: "leather", cat: "boots", shapes: [m(BOOT), dk(BOOT_SOLE), a("M26 10c6-6 14-8 20-6-4 4-10 8-20 10z"), a("M26 16c6-2 12-2 18 2-5 2-12 2-18 0z"), l("M2 28h8M2 34h6")] },
  bt_arcane: { mat: "leather", cat: "boots", shapes: [m(BOOT), dk(BOOT_SOLE), g("M19 14l2 5 5 .5-4 3.3 1.3 5-4.3-2.8-4.3 2.8 1.3-5-4-3.3 5-.5z")] },
  bt_focus: { mat: "leather", cat: "boots", shapes: [m(BOOT), dk(BOOT_SOLE), a("M10 16c4-6 14-6 18 0-4 6-14 6-18 0z"), dk("M19 13.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z")] },
});

export const hasItemArt = (itemId) => !!(itemId && ITEM_ART[itemId]);

/** 專屬裝備圖示。沒有給圖的 itemId 回 null（呼叫端退回 ItemGlyphs 圖紋）。 */
export function ItemArt({ itemId, size = 24, style }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const art = ITEM_ART[itemId];
  if (!art) return null;
  const mt = ITEM_ART_MATERIALS[art.mat] ?? ITEM_ART_MATERIALS.steel;
  const gm = `im${uid}`, ga = `ia${uid}`, gg = `ig${uid}`;
  const fillOf = (k) => (k === "m" ? `url(#${gm})` : k === "a" ? `url(#${ga})` : k === "g" ? `url(#${gg})` : k === "d" ? ITEM_ART_INK.shade : "none");
  return (
    <svg data-item-art={itemId} data-item-art-cat={art.cat} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false"
      style={{ display: "block", flexShrink: 0, overflow: "visible", ...style }}>
      <defs>
        <linearGradient id={gm} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={mt.hi} /><stop offset="0.5" stopColor={mt.mid} /><stop offset="1" stopColor={mt.lo} />
        </linearGradient>
        <linearGradient id={ga} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={mt.accent} /><stop offset="1" stopColor={mt.accentLo} />
        </linearGradient>
        <radialGradient id={gg} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor={ITEM_ART_INK.white} /><stop offset="0.55" stopColor={mt.glow} /><stop offset="1" stopColor={mt.accent} />
        </radialGradient>
      </defs>
      {/* 第一層：深色外描邊（小尺寸保輪廓）；第二層：材質填色＋細亮邊 */}
      <g stroke={ITEM_ART_INK.outline} strokeWidth="4.2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9">
        {art.shapes.map(([k, d], i) => <path key={`o${i}`} d={d} fill={LINE.has(k) ? "none" : ITEM_ART_INK.outline} />)}
      </g>
      {art.shapes.map(([k, d], i) => (
        <path key={i} d={d} fill={fillOf(k)}
          stroke={k === "l" ? mt.hi : k === "gl" ? mt.glow : k === "g" ? mt.glow : ITEM_ART_INK.rim}
          strokeWidth={k === "l" ? 1.8 : k === "gl" ? 2.2 : k === "g" ? 1.2 : 0.9} strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}
