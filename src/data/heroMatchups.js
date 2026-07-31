// ============================================================================
//  data/heroMatchups.js — Hero Matchup Data Contract v1（Milestone K）
//
//  這是「英雄 × 英雄」多對多關係的**唯一來源**。
//  · 不得把關係資料散落在 UI（元件只能透過本檔的純函式取用）。
//  · 不得塞回 heroDatabase.js（那是「單一英雄的屬性」，不是「英雄之間的關係」）。
//  · 本檔**不修改** CHAMPIONS_100 / heroDatabase 的任何既有結構或值，只讀 id。
//
//  ── Contract v1 ──────────────────────────────────────────────────────────
//  HERO_MATCHUPS[heroId] = {
//    strongAgainst: Entry[],   // 這隻英雄「較有優勢」的對手
//    weakAgainst:   Entry[],   // 這隻英雄「較難應付」的對手
//    synergies:     Entry[],   // 這隻英雄「適合搭配」的隊友
//  }
//  Entry = {
//    heroId:     string   // 必須存在於 heroDatabase（CHAMPIONS_100）
//    reason:     string   // 非空；說明「為什麼」，不得只寫定位名稱
//    source:     "design" | "inferred" | "verified"
//    confidence: "low" | "medium" | "high"
//  }
//
//  ── source 的定義（這三個字的意思是固定的，不可以混用）──────────────────
//  design    設計資料。理由可以直接對回**雙方技能組寫明的互動**
//            （例：A 的 W 阻擋所有投射物 ⇒ 對 B「發射 N 發子彈」的大絕）。
//            這是設計意圖，不是實戰統計。
//  inferred  系統推測。沒有明確的技能互動，只依**定位／技能特性**推論。
//            UI 一律附警語：「不代表真實玩家勝率」。
//  verified  實戰驗證。**本輪一筆都沒有**，因為專案目前沒有任何真實對局樣本。
//            enum 先留著，等有可回溯的資料來源才可以用（規劃見文件）。
//
//  ── ⚠ 誠實邊界（違反就是虛構）─────────────────────────────────────────
//  本檔**不含**、往後也不得加入：勝率百分比、對局場次、版本號、玩家統計、
//  段位分佈、Pick/Ban 率。這些數字專案裡不存在，寫下去就是編的。
//
//  ── archCounterScore 的研究結論（Milestone K 要求評估）──────────────────
//  `BanPickScreen.archCounterScore` 是 Legacy 的**定位相性 7 條規則**，
//  不是逐對英雄的對位表。實測 20 隻英雄的 380 組配對後：
//    · 它的標籤判定太粗（analyzeChamp 幾乎把每隻英雄都標成「爆發」與「肉盾」），
//      抽樣中**幾乎每一對**都拿得到 ≥2 分；
//    · 方向常常同時成立（鋼鐵衛士→荊棘壁壘 2 分，反向 4 分），
//      無法單靠分數判斷「誰克制誰」。
//  ⇒ **不拿它當 inferred 的產生器**（那會把粗規則包裝成對位事實）。
//     只在撰寫 inferred 條目時當**方向性複核**：
//     archCounterScore(強方, 弱方) − archCounterScore(弱方, 強方) ≥ 3 才寫。
//     該函式**一行未改**，也**沒有**被接回 Ban/Pick 的玩家呈現。
//     複核值由 tools/check_hero_matchups_k.mjs 直接讀 BanPickScreen 原始碼重算，
//     規則若被改動，測試會立刻紅燈。
//
//  ── 本輪資料範圍 ────────────────────────────────────────────────────────
//  只放 10 隻英雄的展示資料（Milestone K 要求「少量」）。其餘 90 隻英雄
//  一律走空狀態，這是**刻意的**——沒整理的就顯示沒整理，不補假資料。
// ============================================================================
import { CHAMPIONS_100 } from "./heroDatabase.js";

export const MATCHUP_CONTRACT_VERSION = "HeroMatchups.v1";

/** 三個關係區塊的固定順序（UI 的區塊順序也吃這一份）。 */
export const MATCHUP_SECTIONS = Object.freeze(["strongAgainst", "weakAgainst", "synergies"]);
/** 區塊標題：資料層決定文案，UI 不另外寫一份。 */
export const MATCHUP_SECTION_LABEL = Object.freeze({
  strongAgainst: "較有優勢",
  weakAgainst: "較難應付",
  synergies: "適合搭配",
});
/** source 的合法值（enum）。 */
export const MATCHUP_SOURCES = Object.freeze(["design", "inferred", "verified"]);
/** confidence 的合法值（enum）。 */
export const MATCHUP_CONFIDENCES = Object.freeze(["low", "medium", "high"]);
/** source 的顯示文案（Milestone K 指定）。 */
export const MATCHUP_SOURCE_LABEL = Object.freeze({
  design: "設計資料", inferred: "系統推測", verified: "實戰驗證",
});
/** confidence 的顯示文案。 */
export const MATCHUP_CONFIDENCE_LABEL = Object.freeze({
  low: "信心低", medium: "信心中", high: "信心高",
});
/** inferred 條目必須顯示的警語（唯一來源，UI 不得自己另寫一句）。 */
export const MATCHUP_INFERRED_NOTICE = "此內容依英雄定位與技能特性推測，不代表真實玩家勝率。";
/** 空資料文案。 */
export const MATCHUP_EMPTY_TEXT = "目前尚無已整理的對位資料。";

const E = (heroId, reason, source, confidence) => Object.freeze({ heroId, reason, source, confidence });

// ════ 展示資料（10 隻）════════════════════════════════════════════════════
//  每一則 reason 都對得回英雄實際的技能敘述（design）或定位特性（inferred）。
//  ⚠ 資料**不要求對稱**：A 說克制 B，不強制 B 一定要寫「被 A 克制」。
//     對稱的幾組是刻意寫成一致的，未寫的就是還沒整理。
const RAW = {
  ironclad: {
    strongAgainst: [
      E("voidrift", "W 神聖嘲諷是範圍嘲諷，虛空裂縫 R 切到背後後必須留在近身輸出，嘲諷直接吃掉他的收割窗口。", "design", "medium"),
      E("xingchen", "高耐久近戰先手對上需要靜止蓄力、又沒有位移的站樁射手。", "inferred", "medium"),
    ],
    weakAgainst: [
      E("ravager", "毀滅者 R 覆滅之怒 6 秒免疫 CC，嘲諷與擊飛全部無效，還附帶真實傷害穿高護甲。", "design", "high"),
      E("maestro", "大師 P 第四擊附帶「已損失血量 6–12%」真實傷害，血量越高收益越大。", "design", "high"),
    ],
    synergies: [
      E("bingshuang", "R 神聖審判擊飛 1.75 秒開團，正好給冰霜術士 E／R 的範圍凍結一個穩定落點。", "design", "high"),
      E("luminary", "星輝 W 星塵護衛在承傷瞬間觸發護盾並反射，疊在 P 鑄鐵誓約的護盾層上。", "design", "medium"),
    ],
  },
  ravager: {
    strongAgainst: [
      E("ironclad", "R 覆滅之怒 6 秒免疫 CC，鋼鐵衛士整套控場（嘲諷／擊退／擊飛）在這段時間內失效。", "design", "high"),
      E("maestro", "近戰強壓型上路對上前期偏弱、需要保護的發育型射手。", "inferred", "medium"),
    ],
    weakAgainst: [
      E("stoneguard", "石衛 W 抓取反制專打「正在衝向友方的敵人」，毀滅者 E 瘋狂衝刺正好踩中這個判定。", "design", "high"),
      E("bingshuang", "W 冰霜護壁碰觸即根植、R 絕對零度半徑 800 凍結 3 秒；R 的免疫窗口一過就被接管。", "design", "medium"),
    ],
    synergies: [
      E("mantra", "真言 W 祈福加速給移速攻速並在受擊時回血，補掉毀滅者「怕風箏」的劣勢。", "design", "medium"),
    ],
  },
  stoneguard: {
    strongAgainst: [
      E("ravager", "W 抓取反制把衝向友方的敵人拉回並眩暈，直接反制 E 瘋狂衝刺的切入。", "design", "high"),
      E("sting", "P 岩石之皮在受到刺客技能傷害時反擊真實傷害，毒刺的爆發連招會被回敬。", "design", "medium"),
    ],
    weakAgainst: [
      E("leiting", "雷霆神射 Q 雷霆穿甲無視 40% 護甲，繞過 P 岩石之皮的護甲加成。", "design", "high"),
    ],
    synergies: [
      E("xingchen", "E 岩壁屏障擋下投射物，替星辰弓手 P 星光瞄準所需的 1.5 秒靜止製造安全窗口。", "design", "high"),
    ],
  },
  voidrift: {
    strongAgainst: [
      E("bingshuang", "W 虛空壓制沉默 2 秒，冰霜術士的控制鏈全部要施法，被沉默等於整套關掉。", "design", "high"),
      E("maestro", "2000 距離傳送＋相位無敵的切入，對上位移只有一次後撤的站樁射手。", "inferred", "medium"),
    ],
    weakAgainst: [
      E("ironclad", "鋼鐵衛士 W 範圍嘲諷不需指定目標，相位穿越結束後照樣被鎖住。", "design", "medium"),
      E("stoneguard", "P 岩石之皮對刺客技能傷害觸發反擊，硬換血換不贏。", "design", "medium"),
    ],
    synergies: [
      E("mantra", "真言 R 聖域免疫一次致命傷害，讓虛空裂縫敢用 R 深切後排。", "design", "medium"),
    ],
  },
  bingshuang: {
    strongAgainst: [
      E("maestro", "W 冰霜護壁阻擋所有投射物，大師 R 謝幕之鳴的 4 發音波子彈會被整個吃掉。", "design", "high"),
      E("ravager", "W 護壁碰觸即根植、R 半徑 800 凍結 3 秒，切入型戰士的進場路徑被鎖。", "design", "medium"),
    ],
    weakAgainst: [
      E("voidrift", "被 W 虛空壓制沉默 2 秒後，冰霜積累與控制鏈完全放不出來。", "design", "high"),
      E("sting", "高機動、能隱身接近的爆發刺客，對上沒有位移的遠程核心。", "inferred", "medium"),
    ],
    synergies: [
      E("ironclad", "鋼鐵衛士 R 擊飛 1.75 秒，是 E 冰晶爆破 0.7 秒延遲最穩定的命中條件。", "design", "high"),
    ],
  },
  maestro: {
    strongAgainst: [
      E("ironclad", "P 第四擊的真實傷害吃「已損失血量」百分比，越肉的前排越怕。", "design", "high"),
    ],
    weakAgainst: [
      E("bingshuang", "R 謝幕之鳴與普攻都是投射物，撞上 W 冰霜護壁等於白打一輪。", "design", "high"),
      E("ravager", "前期偏弱、需要保護的發育型射手，對上近戰強壓型上路。", "inferred", "medium"),
    ],
    synergies: [
      E("luminary", "星輝 R 繁星庇護同時給護盾與攻速，正對大師「前期弱／需保護／吃攻速成長」。", "design", "high"),
    ],
  },
  luminary: {
    // 刻意留空：輔助型英雄本輪沒有整理出可靠的「較有優勢」條目，
    // 空的就顯示空的（UI 走區塊空狀態）。
    strongAgainst: [],
    weakAgainst: [
      E("duskblade", "暮刃 W 影縛沉默 1.5 秒；星輝所有保護手段都要施法，被沉默就什麼都給不了。", "design", "high"),
    ],
    synergies: [
      E("maestro", "R 繁星庇護的護盾與攻速加成，直接補上大師需要保護與攻速成長的兩個需求。", "design", "high"),
      E("ironclad", "W 星塵護衛在承傷瞬間觸發護盾並反射，配合前排的護盾層疊。", "design", "medium"),
    ],
  },
  duskblade: {
    strongAgainst: [
      E("luminary", "W 影縛沉默 1.5 秒並暴露位置，先手關掉輔助的保護技能再開團。", "design", "high"),
    ],
    weakAgainst: [
      E("ironclad", "W 神聖嘲諷是範圍效果，影分身突入與環繞的無法被指定都躲不掉。", "design", "medium"),
    ],
    synergies: [
      E("bingshuang", "冰霜術士 R 凍結 3 秒，替 E 影分身突入的 3 秒匯聚爆發鎖住目標。", "design", "medium"),
    ],
  },
  sting: {
    strongAgainst: [
      E("bingshuang", "W 毒霧提供我方隱身、R 完全隱形接近，對上沒有位移的遠程核心。", "inferred", "medium"),
    ],
    weakAgainst: [
      E("stoneguard", "P 岩石之皮對刺客技能傷害反擊真實傷害，毒刺脆皮硬換不划算。", "design", "medium"),
    ],
    synergies: [
      E("ironclad", "鋼鐵衛士 R 擊飛開團的 1.75 秒，正好是 R 隱身後 Q 傷害 +50% 的收割窗口。", "design", "medium"),
    ],
  },
  leiting: {
    strongAgainst: [
      E("stoneguard", "Q 雷霆穿甲無視 40% 護甲，石衛 P 的護甲加成擋不住。", "design", "high"),
      E("ironclad", "同樣是無視護甲的穿甲彈道，對高護甲低輸出的前排收益最高。", "design", "medium"),
    ],
    weakAgainst: [
      E("voidrift", "R 2000 距離傳送到背後接 W 沉默 2 秒，射手沒有解控手段。", "design", "medium"),
    ],
    synergies: [
      E("mantra", "真言 R 聖域免疫一次致命傷害＋W 攻速加成，補「前期弱／需保護」。", "design", "high"),
    ],
  },
};

// 深凍結：UI 取到的是同一份唯讀資料，不可能在執行期被改掉。
const HERO_MATCHUPS = Object.freeze(
  Object.fromEntries(Object.entries(RAW).map(([heroId, rec]) => [heroId, Object.freeze({
    heroId,
    strongAgainst: Object.freeze(rec.strongAgainst.slice()),
    weakAgainst: Object.freeze(rec.weakAgainst.slice()),
    synergies: Object.freeze(rec.synergies.slice()),
  })])),
);

const NONE = Object.freeze([]);
const own = (id) => (typeof id === "string" && Object.prototype.hasOwnProperty.call(HERO_MATCHUPS, id));

/**
 * 取得一隻英雄的完整對位資料。
 * 找不到（或參數不合法）時回傳**穩定的空結構**，不 throw、不回 null。
 * @returns {{heroId:string, strongAgainst:ReadonlyArray, weakAgainst:ReadonlyArray, synergies:ReadonlyArray}}
 */
export function getHeroMatchups(heroId) {
  if (own(heroId)) return HERO_MATCHUPS[heroId];
  return Object.freeze({
    heroId: typeof heroId === "string" ? heroId : "",
    strongAgainst: NONE, weakAgainst: NONE, synergies: NONE,
  });
}

export const getStrongAgainst = (heroId) => getHeroMatchups(heroId).strongAgainst;
export const getWeakAgainst = (heroId) => getHeroMatchups(heroId).weakAgainst;
export const getSynergies = (heroId) => getHeroMatchups(heroId).synergies;

/** 這隻英雄有沒有任何一筆已整理的關係（UI 判空狀態用）。 */
export const hasMatchupData = (heroId) =>
  MATCHUP_SECTIONS.some((k) => getHeroMatchups(heroId)[k].length > 0);

/** 目前有資料的英雄 id（穩定排序；驗證與文件用，UI 不需要）。 */
export const listMatchupHeroIds = () => Object.freeze(Object.keys(HERO_MATCHUPS).slice().sort());

/**
 * 資料完整性驗證（verifier 與 dev 用；不在正式流程執行）。
 * 檢查：heroId 存在、無自我指涉、同區無重複、reason 非空、enum 合法。
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateHeroMatchups() {
  const errors = [];
  const known = new Set(CHAMPIONS_100.map((c) => c.id));
  for (const heroId of Object.keys(HERO_MATCHUPS)) {
    if (!known.has(heroId)) errors.push(`${heroId}：不是 heroDatabase 裡的英雄`);
    const rec = HERO_MATCHUPS[heroId];
    for (const section of MATCHUP_SECTIONS) {
      const list = rec[section];
      if (!Array.isArray(list)) { errors.push(`${heroId}.${section}：不是陣列`); continue; }
      const seen = new Set();
      for (const e of list) {
        const at = `${heroId}.${section}[${e?.heroId ?? "?"}]`;
        if (!e || typeof e !== "object") { errors.push(`${at}：不是物件`); continue; }
        if (typeof e.heroId !== "string" || !known.has(e.heroId)) errors.push(`${at}：heroId 不存在於 heroDatabase`);
        if (e.heroId === heroId) errors.push(`${at}：自己指向自己`);
        if (seen.has(e.heroId)) errors.push(`${at}：同一區塊重複`);
        seen.add(e.heroId);
        if (typeof e.reason !== "string" || !e.reason.trim()) errors.push(`${at}：reason 空白`);
        if (!MATCHUP_SOURCES.includes(e.source)) errors.push(`${at}：source「${e.source}」不合法`);
        if (!MATCHUP_CONFIDENCES.includes(e.confidence)) errors.push(`${at}：confidence「${e.confidence}」不合法`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
