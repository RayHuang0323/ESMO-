// ============================================================================
//  battle/moba/map/mapLaneStyle.js — 三路的形狀與層次（Milestone G.1）
//
//  【v1 的問題】每條路只有「路肩 26 + 路緣 20 + 路面 13」三層，而且路面是高彩度
//  亮黃（0xd8bb82 以上）。上下路沿外圍繞一圈 ⇒ 整張圖變成一個粗黃色橢圓環，
//  比基地、比河、比塔都搶眼，讀不出兵線動線，只讀得到「一條測試用色帶」。
//
//  【G.1 的路語言】每條路 4 階（外 → 內），總佔地由 26 縮到 22：
//     草緣 lane_verge（草地→土的第一階）
//     路肩 lane_shoulder（土草混合）
//     路緣 lane_edge（石土混合，壓深一階 ⇒ 路面浮起來）
//     路面 lane_surface（低彩度沙土，不是亮黃）
//   再加：
//     · 路面色斑 lane_patch（車轍/踩踏）⇒ 路不是平塗
//     · mid 專屬路心亮帶 lane_inlay ⇒ 中路＝基地連基地的主戰線，一眼最亮
//
//  ⚠ 路的中心線仍完全取自 gameData.js 的 LANES（經 layout 傳入），只做平滑與
//    低頻擾動；塔的座標（posOnLane）因此永遠落在路面帶上。
//  ⚠ 純資料、無 THREE/React、不使用 Math.random()。
// ============================================================================
import { smoothPath, wobblePath, ribbonPolygon, hash01, blobRing } from "./mapShapePrimitives.js";
import { WIDTH } from "./mapVisualStyle.js";
import { buildBaseFan } from "./mapBaseFrame.js";
import { buildTowerPlan } from "./mapTowerLayoutStyle.js";

export const LANES3 = ["top", "mid", "bot"];

/** 由 from 往 to 的方向再延伸 d ⇒ 路真的把基地包進去，而不是剛好停在基地座標上。 */
const beyond = (from, to, d) => {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  return { x: to.x + Math.cos(a) * d, y: to.y + Math.sin(a) * d };
};

/**
 * 建立三路的形狀。
 * @returns {{ paths, bands, blockPolys, patches }}
 *   bands[ln]  = { verge, shoulder, edge, surface, inlay? } 多邊形
 *   blockPolys[ln] = 牆體禁區（恆比路面寬）
 *   patches    = [{ id, lane, poly }] 路面色斑
 */
export function buildLanePlan(L) {
  const paths = {}, bands = {}, blockPolys = {}, patches = [];

  //  G.15-final：道路的近基地段改走基地骨架的出口軸線（主堡 → 城門 → 高地塔），
  //  再接回 gameData 原本的 lane 控制點。
  //  【為什麼】三座高地塔的呈現座標已被貼到自己那個城門的軸線上（mapBaseFrame
  //   的 alignHighgroundTowers），若道路仍走原本的折線，塔就會站在路面帶外面，
  //   畫面上讀成「塔浮在路邊」，verifier 的「塔應落在路面上」也會紅。
  //  ⚠ 只換掉「比高地塔更靠近該方主堡」的控制點，其餘一個字不動 ⇒ 中段與另一端
  //    的路型、內塔/外塔的落點都不受影響（塔位來自 gameData 的 posOnLane，本來
  //    就與這條呈現用折線無關）。
  const FAN = buildBaseFan(L, buildTowerPlan(L).laneTowers);
  const exitOf = (side, ln) => FAN[side].exits.find((e) => e.lane === ln);

  LANES3.forEach((ln, k) => {
    const raw = L.lanes[ln];
    const be = exitOf("blue", ln), re = exitOf("red", ln);
    const dB = (p) => Math.hypot(p.x - L.bases.blue.x, p.y - L.bases.blue.y);
    const dR = (p) => Math.hypot(p.x - L.bases.red.x, p.y - L.bases.red.y);
    const keepB = dB(be.tower) + 4, keepR = dR(re.tower) + 4;
    const middle = raw.filter((p) => dB(p) > keepB && dR(p) > keepR);
    const ctrl = [
      beyond(be.gate, L.bases.blue, 6),   // 主堡側再往內一點，路真的把基地包進去
      be.bend, be.gate, be.tower,
      ...middle,
      re.tower, re.gate, re.bend,
      beyond(re.gate, L.bases.red, 6),
    ];
    // 擾動幅度由 1.8 降到 1.0：路變窄後，太大的側移會讓塔（posOnLane 的精確點）
    // 掉出路面帶，也會讓兵線動線讀起來歪七扭八。
    const path = wobblePath(smoothPath(ctrl, 4.5), 1.0, 21 + k * 7);
    paths[ln] = path;

    const w = ln === "mid" ? WIDTH.lane_surface_mid : WIDTH.lane_surface;
    const dw = w - WIDTH.lane_surface;   // mid 的每一階都同步加寬，維持同心
    bands[ln] = {
      verge: ribbonPolygon(path, WIDTH.lane_verge + dw, { vary: 0.24, seed: 3 + k }),
      shoulder: ribbonPolygon(path, WIDTH.lane_shoulder + dw, { vary: 0.20, seed: 31 + k }),
      edge: ribbonPolygon(path, WIDTH.lane_edge + dw, { vary: 0.15, seed: 46 + k }),
      surface: ribbonPolygon(path, w, { vary: 0.12, seed: 61 + k }),
    };
    if (ln === "mid") {
      bands[ln].inlay = ribbonPolygon(path, WIDTH.lane_inlay, { vary: 0.35, seed: 91 });
    }
    // 禁區用「與路面同一 seed、同一 vary」再加固定 margin ⇒ 保證每一點都比路面寬。
    blockPolys[ln] = ribbonPolygon(path, w + WIDTH.lane_block_margin, { vary: 0.12, seed: 61 + k });

    // 路面色斑：沿中心線取點、半徑小於路面半寬 ⇒ 一定落在路上，不會外溢到草地。
    const halfW = w / 2;
    for (let i = 6; i < path.length - 6; i += 9) {
      const p = path[i];
      const r = 1.9 + hash01(i, 200 + k) * 1.6;
      const off = (hash01(i, 300 + k) - 0.5) * (halfW - r) * 1.4;
      const nb = path[i + 1];
      let dx = nb.x - p.x, dy = nb.y - p.y;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      patches.push({
        id: `lanepatch_${ln}_${i}`, lane: ln,
        poly: blobRing(p.x - dy * off, p.y + dx * off, r,
          { n: 12, amp: 0.32, seed: 210 + k * 5 + i, squashX: 1.7, squashY: 0.75, rot: Math.atan2(dy, dx) }),
      });
    }
  });

  return { paths, bands, blockPolys, patches };
}
