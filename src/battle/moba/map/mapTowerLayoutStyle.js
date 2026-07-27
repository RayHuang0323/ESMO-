// ============================================================================
//  battle/moba/map/mapTowerLayoutStyle.js — 塔位層級的閱讀語言
//  Milestone G.1 建立、G.2（Structure Correction）大改。
//
//  【G.1 已修】層級名稱曾經是反的（見 mobaMapLayout.js）：
//    TOWER_T.blue = [0.15, 0.33, 0.48]，t 是「沿 lane 從藍基地往紅基地」的比例，
//    所以 tier 0 離自己基地最近、tier 2 幾乎在地圖中央。
//    ⇒ tier0 = 高地塔、tier1 = 內塔、tier2 = 外塔。
//
//  【G.2 修的兩件事】人工目視後對照 Summoner's Rift 的結構，還有兩個問題：
//
//   (1) 中路最外側的兩座塔幾乎黏在一起。
//       實測：blue mid tier2 在 (106.8,113.2)、red mid tier2 在 (113.2,106.8)，
//       兩塔只差 **9.1 單位**，而且都壓在地圖正中心（各距中心 4.5）。
//       未來一放上英雄模型、兵線、血條、技能特效，中央就完全糊掉。
//   (2) 三座高地塔離自己基地 48–56 單位，遠在高地牆體之外，
//       讀起來像「路上的第三座塔」而不是「守著高地出口的塔」。
//
//  【怎麼修】**只在呈現層重新取樣塔的位置**：
//    塔仍然畫在同一條 lane 的中心線上（posOnLane），只是用另一組 t（DISPLAY_T）。
//    模擬用的 t（gameData.TOWER_T）、tier 索引、LogicEngine 一律沒有動，
//    每座塔仍保留 `sim: { t, x, y }` 讓之後可以對照。
//
//  ⚠ 這代表**呈現座標 ≠ 模擬座標**（最大偏移見報告）。
//    這是刻意的 blockout 決策：這張地圖目前不接戰鬥。
//    真正接上戰鬥時必須二選一：
//      (a) 在後續 sprint 調整 gameData.TOWER_T（要連 check_moba_runtime29 的
//          對稱/公平性 invariant 一起驗），或
//      (b) 保留這層 display offset，並讓戰鬥層一律走 layout 的 display 座標。
//    DISPLAY_T 刻意保持左右對稱（blue t ↔ red 1−t），不引入任何單邊優勢。
//
//  ⚠ 純資料、無 THREE/React、不使用 Math.random()。
// ============================================================================
import { posOnLane, BASE, TOWER_T } from "../../../gameData.js";

/**
 * 呈現用的塔位 t（藍方；紅方一律取 1 − t，維持 180° 對稱）。
 *
 *   lane      高地塔        內塔(二塔)     外塔(一塔)
 *   sim       0.15          0.33           0.48
 *   top/bot   0.11          0.26           0.40
 *   mid       0.12          0.34           0.44
 *
 * ⚠ G.3 為什麼再動一次：G.2 只把中路外塔往回拉，結果「內塔↔外塔」被壓到
 *   中心距 18.1、**塔前廣場邊緣只剩 0.3 單位**（等於兩座塔的鋪面直接相接）。
 *   這一輪改成整條鏈一起校正，而且判準從「中心距」換成
 *   **邊緣淨距 = 中心距 − 兩塔的塔前廣場半徑**，這才是眼睛真正看到的間隔。
 *
 * ⚠ mid 為什麼跟 top/bot 不同：
 *   `camp_blue_buff` 就在中路旁邊（gameData 的營地選點規則只保證「距三路 ≥5.5」）。
 *   實測 mid 的 t = 0.155 ~ 0.32 這一整段，塔位離 Buff 中心都不到 17 單位
 *   ⇒ 內塔只能擺在 0.33 之後（0.34 時距 Buff 中心 20.6）。
 *   內塔被釘住之後，「外塔要退離中央」與「內塔↔外塔要拉開」就是一組取捨；
 *   G.3 選 0.44，兩者的邊緣淨距分別是 9.6 與 15.6，都過得了門檻。
 *   要同時再放寬只能動 gameData 的 Buff 座標，那不在本輪範圍。
 */
export const DISPLAY_T = Object.freeze({
  top: Object.freeze([0.11, 0.26, 0.40]),
  //  G.8：中路外塔 0.44→0.43，兩座外塔中心距 27.2→31.7 ⇒ 中央交戰區容得下
  //  2 英雄 + 6 小兵 + 1 技能提示；內-外邊緣淨距仍 8.7（≥8）、外塔距中心 15.8（≥12）。
  mid: Object.freeze([0.12, 0.34, 0.43]),
  bot: Object.freeze([0.11, 0.26, 0.40]),
});

/**
 * 塔距的最低要求（模擬單位）。判準一律是「邊緣淨距」，不是中心距：
 * 中心距再大，只要塔前廣場夠大，看起來還是黏在一起。
 */
export const TOWER_GAP = Object.freeze({
  chain: 8,        // 同一條鏈上相鄰兩塔的塔前廣場邊緣最小淨距
  midCenter: 12,   // 中路兩座外塔之間的邊緣淨距（＝中央交戰區的最小寬度）
});

/** 塔位與野怪營地 / 坑心的最小淨空（模擬單位）。verifier 以此把關。 */
export const TOWER_CLEARANCE = Object.freeze({ camp: 15, pit: 18 });

/**
 * 三種兵線塔的量體規格。padR / plazaR 為模擬單位；tiers 的 h 為世界高度。
 *
 * ⚠ G.3 全面縮小（底座 −25%、塔前廣場 −30%、塔身 −18%）。
 *   G.2 的高地塔塔前廣場半徑 13.2 ＝直徑 26 模擬單位 ＝ 44 世界單位，
 *   在 374 世界單位寬的地圖上等於一座塔就吃掉 12% 的寬度；
 *   「塔跟塔太近」有一半其實是塔太胖，不是位置太近。
 */
//  ⚠ G.7 比例校正：底座 / 塔身半徑 −13%、塔前廣場 −10%、塔身高度 −8%。
//    G.3 已縮過一輪；本輪再縮，是因為放上英雄 / 兵線 / 血條後塔仍偏大、吃畫面空間。
//    三階的**相對**大小順序完全不變（高地 > 內 > 外），只是整體再收一號。
//  ⚠ G.9 再縮視覺半徑 −11%（底座 / 塔身 / 塔前廣場），高度只微降 ⇒ 塔更不吃地面空間，
//    給未來英雄 / 兵線 / 血條 / 技能範圍讓位；三階相對大小順序不變。
//  ⚠ G.11 再略縮視覺半徑 −6%（地圖偏擠）；高度不動，維持三階可讀。
export const TOWER_SPEC = Object.freeze({
  outer: {
    rank: 0, padR: 2.9, plazaR: 4.4, plinth: "tower_plinth_outer",
    tiers: [{ r: 1.9, h: 2.3 }, { r: 1.35, h: 3.7 }], crown: 1.05,
  },
  inner: {
    rank: 1, padR: 3.7, plazaR: 5.5, plinth: "tower_plinth_inner",
    tiers: [{ r: 2.25, h: 2.7 }, { r: 1.7, h: 4.6 }, { r: 1.15, h: 2.7 }], crown: 1.2,
  },
  highground: {
    rank: 2, padR: 4.5, plazaR: 6.9, plinth: "tower_plinth_high",
    tiers: [{ r: 2.8, h: 3.0 }, { r: 2.05, h: 5.1 }, { r: 1.45, h: 3.8 }], crown: 1.45,
  },
  // 門牙塔（Nexus Turret）：主堡最後防線。比高地塔細、但比外塔高，
  // 而且是**成對**出現 ⇒ 靠「兩座並排夾住主堡」這件事被認出來，不靠尺寸。
  nexus_turret: {
    rank: 3, padR: 3.1, plazaR: 0, plinth: "tower_plinth_high",
    tiers: [{ r: 2.0, h: 2.8 }, { r: 1.45, h: 4.8 }, { r: 1.0, h: 3.0 }], crown: 1.3,
  },
});

/** 由基地往外的閱讀順序（verifier 與文件共用同一份定義）。 */
export const TOWER_ORDER = Object.freeze(["highground", "inner", "outer"]);
const KIND_BY_TIER = ["highground", "inner", "outer"];

/** 門牙塔相對主堡的擺法：朝地圖中心、左右各一。 */
export const NEXUS_TURRET_GEO = Object.freeze({
  radius: 11.5,   // 距主堡的距離（模擬單位；必須小於 keepR=14 ⇒ 站在主堡台上）
  spread: 0.72,   // 相對「主堡→地圖中心」方向的左右張角（rad）
});

/**
 * G.14：180° 鏡射時的 lane 對應。
 *  gameData 的 top lane 沿左／上緣走、bot lane 沿下／右緣走，兩者本來就互為鏡像
 *  ⇒ 藍 top 的鏡射伙伴是紅 bot，不是紅 top。mid 鏡射到自己。
 */
export const MIRROR_LANE = Object.freeze({ top: "bot", bot: "top", mid: "mid" });

/**
 * G.14：高地塔應落在「出了高地牆、但仍站在自己高地上」的環帶（距主堡，模擬單位）。
 *  下限擋「貼著主堡／門牙塔」，上限擋「跑到路中段變成第三座路塔」。
 */
export const HIGHGROUND_BAND = Object.freeze({ min: 30, max: 50 });

const LANES3 = ["top", "mid", "bot"];

/**
 * G.14：把 18 座兵線塔的**呈現座標**校正成嚴格 180° 鏡射。
 *
 * 【為什麼要做】gameData 的 top / bot lane 只是「大致」互為鏡像：實測折線最大鏡射
 *   誤差 5.66 單位。照 posOnLane 各自取樣，紅方塔位會比藍方偏 0.6~4.3 單位，
 *   高地塔尤其明顯（藍 top 距主堡 43.2、紅 top 只有 36.8）⇒ 兩邊的高地出口、
 *   高地走廊、出口淨空通道全部跟著對不齊，肉眼看得出「紅方基地比較擠」。
 *
 * 【怎麼修】每一組鏡射對（藍 top↔紅 bot、藍 bot↔紅 top、藍 mid↔紅 mid）取
 *   **鏡射中點**：兩座塔各只移動誤差的一半（最大 2.2 單位，仍在自己的路面帶內），
 *   之後兩側嚴格互為 180° 鏡射（誤差 0）。
 *
 * ⚠ 只動呈現座標；sim{t,x,y} 仍是 gameData 的模擬座標，一個字都沒改。
 */
function symmetrizeDisplayPos(pos, cx, cy) {
  const done = new Set();
  for (const k of Object.keys(pos)) {
    if (done.has(k)) continue;
    const [side, lane, tier] = k.split("|");
    const mk = `${side === "blue" ? "red" : "blue"}|${MIRROR_LANE[lane]}|${tier}`;
    const a = pos[k], b = pos[mk];
    done.add(k); done.add(mk);
    // b 的 180° 鏡射點與 a 取中點 ⇒ 兩者各移動誤差的一半
    const sx = (a.x + (2 * cx - b.x)) / 2, sy = (a.y + (2 * cy - b.y)) / 2;
    a.x = sx; a.y = sy;
    b.x = 2 * cx - sx; b.y = 2 * cy - sy;
  }
}

/**
 * 建立 18 座兵線塔 + 4 座門牙塔的呈現資料。
 * @param L buildMobaLayout() 的輸出
 * @returns {{ laneTowers, nexusTurrets, all }}
 */
export function buildTowerPlan(L) {
  const cx = L.bounds.centerX, cy = L.bounds.centerY;

  //  先取樣原始呈現座標，再整批做 180° 鏡射校正，最後才組出塔物件
  //  （距離欄位必須用校正後的座標算，否則層級判斷會拿到舊值）。
  const rawPos = {};
  for (const lane of LANES3) {
    for (const side of ["blue", "red"]) {
      DISPLAY_T[lane].forEach((tBlue, tier) => {
        const dt = side === "blue" ? tBlue : 1 - tBlue;
        rawPos[`${side}|${lane}|${tier}`] = { ...posOnLane(lane, dt), dt };
      });
    }
  }
  symmetrizeDisplayPos(rawPos, cx, cy);

  const laneTowers = [];
  for (const lane of LANES3) {
    for (const side of ["blue", "red"]) {
      DISPLAY_T[lane].forEach((tBlue, tier) => {
        const kind = KIND_BY_TIER[tier];
        const S = TOWER_SPEC[kind];
        const p = rawPos[`${side}|${lane}|${tier}`];
        const simT = TOWER_T[side][tier];
        const sp = posOnLane(lane, simT);
        const b = BASE[side];
        laneTowers.push({
          id: `${side}_${lane}_${tier}`, side, lane, tier, kind, rank: S.rank,
          x: p.x, y: p.y, displayT: p.dt,
          sim: { t: simT, x: sp.x, y: sp.y },
          padR: S.padR, plazaR: S.plazaR, plinth: S.plinth,
          tiers: S.tiers, crown: S.crown,
          distToOwnBase: Math.hypot(p.x - b.x, p.y - b.y),
          distToCenter: Math.hypot(p.x - cx, p.y - cy),
        });
      });
    }
  }

  // ── 門牙塔：主堡前方左右各一 ──────────────────────────────────────────
  const S = TOWER_SPEC.nexus_turret;
  const nexusTurrets = [];
  ["blue", "red"].forEach((side) => {
    const b = L.bases[side];
    const toCenter = Math.atan2(cy - b.y, cx - b.x);
    [-1, 1].forEach((sgn, i) => {
      const a = toCenter + sgn * NEXUS_TURRET_GEO.spread;
      nexusTurrets.push({
        id: `${side}_nexus_${i}`, side, lane: "nexus", tier: -1,
        kind: "nexus_turret", rank: S.rank,
        x: b.x + Math.cos(a) * NEXUS_TURRET_GEO.radius,
        y: b.y + Math.sin(a) * NEXUS_TURRET_GEO.radius,
        angle: a,
        padR: S.padR, plazaR: S.plazaR, plinth: S.plinth,
        tiers: S.tiers, crown: S.crown,
        distToOwnBase: NEXUS_TURRET_GEO.radius,
        distToCenter: Math.hypot(b.x + Math.cos(a) * NEXUS_TURRET_GEO.radius - cx,
          b.y + Math.sin(a) * NEXUS_TURRET_GEO.radius - cy),
      });
    });
  });

  return { laneTowers, nexusTurrets, all: [...laneTowers, ...nexusTurrets] };
}
