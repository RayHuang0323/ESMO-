// ============================================================================
//  presentation/fogOfWar.js — MOBA 戰爭迷霧（feature/moba-spectacle-vision，最小可行版）
//
//  ⚠ 這是**呈現層的衍生可見度**，不是第二套 visibility state：
//    · 每一幀由 RuntimeFrameFeeder 對「同一份 adapter frame」呼叫 applyFogToFrame，
//      結果只掛在這一幀上（frame.fog），下一幀重算；沒有 store、沒有存檔、不進 Replay。
//    · 引擎完全不知道有迷霧：AI、命中、勝負都不受影響（presentation 不回寫戰鬥結果）。
//
//  視野來源（模擬座標半徑；地圖寬 330，比例對齊 LoL 的英雄視野≈地圖寬 8%）：
//  我方存活英雄 27、我方小兵 22、我方存活塔 30、主堡 34。
//  迷霧中的敵方：英雄標記 fogHidden（渲染層隱藏，不改掛載結構）、小兵從本幀清單移除、
//  來源在迷霧中且目標也不在視野內的戰鬥特效移除（敵人從迷霧裡打我方看得到的單位 ⇒ 仍顯示）。
//  建築、野怪、龍／巴龍維持可見（地圖上固定已知的物件）。
// ============================================================================
import { scaleLen } from "../map/coordinateMapping.js";

export const FOG_VISION_SIM = Object.freeze({ hero: 27, minion: 22, tower: 30, nexus: 34 });
export const FOG_MAX_SOURCES = 64;

const other = (side) => (side === "blue" ? "red" : "blue");

/**
 * 在這一幀上套用迷霧（會就地改寫 frame 的 heroes 標記、minions、effects，並掛上 frame.fog）。
 * @param {object} frame  RuntimeFrameFeeder 產生的 adapter frame（每幀新物件）
 * @param {"blue"|"red"} side  視角方
 */
export function applyFogToFrame(frame, side) {
  if (!frame || (side !== "blue" && side !== "red")) return frame;
  const sources = [];
  const add = (w, simR) => { if (w && sources.length < FOG_MAX_SOURCES) sources.push({ x: w.x, z: w.z, r: scaleLen(simR) }); };
  for (const h of frame.heroes ?? []) if (h.team === side && h.alive) add(h.world, FOG_VISION_SIM.hero);
  for (const s of frame.structures ?? []) {
    if (s.team === side && s.alive) add(s.world, s.type === "nexus" ? FOG_VISION_SIM.nexus : FOG_VISION_SIM.tower);
  }
  for (const m of frame.minions ?? []) if (m.team === side) add(m.world, FOG_VISION_SIM.minion);
  const seen = (w) => !!w && sources.some((s) => (w.x - s.x) ** 2 + (w.z - s.z) ** 2 <= s.r * s.r);

  const enemy = other(side);
  const hidden = new Set();
  for (const h of frame.heroes ?? []) {
    h.fogHidden = h.team === enemy && h.alive && !seen(h.world);
    if (h.fogHidden) hidden.add(h.id);
  }
  if (Array.isArray(frame.minions)) {
    frame.minions = frame.minions.filter((m) => {
      if (m.team !== enemy || seen(m.world)) return true;
      hidden.add(m.id);
      return false;
    });
  }
  if (Array.isArray(frame.effects)) {
    frame.effects = frame.effects.filter((fx) => {
      if (!hidden.has(String(fx.sourceId ?? ""))) return true;
      return seen(fx.targetWorld) || (fx.targetId != null && !hidden.has(String(fx.targetId)) && frame.heroes?.some((h) => h.id === String(fx.targetId) && h.team === side));
    });
  }
  frame.fog = { side, sources, hiddenCount: hidden.size };
  return frame;
}
