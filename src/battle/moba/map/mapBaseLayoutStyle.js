// ============================================================================
//  battle/moba/map/mapBaseLayoutStyle.js — 基地計畫（Milestone G.1 → G.15 重寫）
//
//  【G.15 起本檔不再自己算幾何】所有基地結構的形狀、尺寸、位置一律來自
//  `mapBaseBlueprint.js` 的**單一 blueprint item 清單**（只描述藍方），
//  紅方一律由 `mirrorBaseItems()` 對同一份清單做 180° 變換。
//
//  本檔剩下的職責只有一件：把 blueprint item 清單**分組**成既有消費端習慣的
//  `{ blue: sideInfo, red: sideInfo }` 形狀（apronPoly / rimRuns / exitCorridors …），
//  讓 mapTerrainShapes / mapBaseSymmetry / MobaMapPreview / verifier 不必一次全改。
//
//  ⚠ 不要再在這裡加任何 blobRing / swobble / seed：基地核心結構不得有 jitter。
//    要改形狀請改 mapBaseBlueprint.js 的 BASE_GEO 與該檔的幾何段落。
//  ⚠ 純資料、無 THREE/React、不使用 Math.random()。
// ============================================================================
import { LANES3 } from "./mapLaneStyle.js";
import { buildBaseBlueprintPair, BASE_GEO } from "./mapBaseBlueprint.js";

export { BASE_GEO };

/** 把同一種牆的 item 依 id 前綴（第幾條弧）分組回「牆段折線」的形狀。 */
function wallRunsOf(items, kind) {
  const byRun = new Map();
  for (const it of items) {
    if (it.kind !== kind) continue;
    const run = it.id.replace(/_\d+$/, "");
    if (!byRun.has(run)) byRun.set(run, []);
    byRun.get(run).push(it);
  }
  //  一段牆 = 一塊長方體；還原成折線只是給舊消費端看「有幾條弧、每條幾段」用的。
  return [...byRun.values()].map((segs) => segs.map((s) => ({ x: s.x, y: s.y })));
}

const laneOrdered = (items, pred) =>
  LANES3.map((ln) => items.find((it) => it.lane === ln && pred(it))).filter(Boolean);

/** blueprint item 清單 → 舊的 sideInfo 形狀。 */
function groupSide(items, side) {
  const byId = (suffix) => items.find((it) => it.id === `${suffix.replace("@", side)}`);
  const g = (id) => byId(id)?.poly ?? [];
  const node = (kind) => items.filter((it) => it.role === "node" && it.kind === kind);

  const gates = laneOrdered(items, (it) => it.role === "node" && it.kind === "gate")
    .map((it) => ({ lane: it.lane, x: it.x, y: it.y, angle: it.rot }));
  const hg = laneOrdered(items, (it) => it.role === "node" && it.kind === "highground_tower");

  const keepPoly = g("base_@_keep");
  const apronPoly = g("base_@_apron");
  //  平台中心：apron item 的錨點（＝多邊形重心）不等於幾何圓心（泉水凹間會拉偏），
  //  所以圓心另外由「主堡 + 朝地圖中心 offsetToCenter」還原，兩方都用同一條式子。
  const base = { x: 0, y: 0 };
  for (const p of keepPoly) { base.x += p.x / keepPoly.length; base.y += p.y / keepPoly.length; }

  const fountainPad = byId("fountain_@_pad");
  const fountain = {
    x: fountainPad ? fountainPad.x : 0, y: fountainPad ? fountainPad.y : 0,
    padPoly: g("fountain_@_pad"), stepPoly: g("fountain_@_step"),
    poolPoly: g("fountain_@_pool"), walkPoly: g("fountain_@_walk"),
    rimRuns: wallRunsOf(items, "fountain_rim"),
    toBase: Math.atan2(base.y - (fountainPad?.y ?? 0), base.x - (fountainPad?.x ?? 0)),
  };

  const centerNode = items.find((it) => it.kind === "apron_center");
  return {
    base, center: { x: centerNode.x, y: centerNode.y },
    laneAngs: gates.map((x) => x.angle), keepAngs: gates.map((x) => x.angle),
    gaps: gates.map((x) => ({ angle: x.angle, half: Math.asin(Math.min(1, BASE_GEO.gateWidth / 2 / BASE_GEO.rimR)) })),
    highlandPoly: g("highland_@"),
    corridors: laneOrdered(items, (it) => it.kind === "highland" && it.id.startsWith("highland_"))
      .map((it) => ({ lane: it.lane, poly: it.poly })),
    apronPoly, apronAngles: [],
    courtPoly: g("base_@_court"), keepPoly,
    rimRuns: wallRunsOf(items, "base_rim"),
    keepRuns: wallRunsOf(items, "base_keep"),
    gateStubs: items.filter((it) => it.kind === "base_gate")
      .map((it) => ({ lane: it.lane, side: 0, run: [{ x: it.x, y: it.y }] })),
    bastions: [],
    ramps: laneOrdered(items, (it) => it.kind === "ramp").map((it) => ({ lane: it.lane, poly: it.poly })),
    gates,
    fountain,
    exitCorridors: laneOrdered(items, (it) => it.kind === "exit_corridor")
      .map((it) => ({ lane: it.lane, poly: it.poly })),
    keepOutPoly: byId("zone_@_keepout")?.poly ?? [],
    hgTowers: hg.map((it) => ({ lane: it.lane, x: it.x, y: it.y })),
    turrets: node("nexus_turret").map((it) => ({ x: it.x, y: it.y, angle: it.rot })),
    backAng: fountain.toBase + Math.PI,
    R: BASE_GEO.apronR,
  };
}

/**
 * 建立兩方基地計畫。
 * @param L         buildMobaLayout() 輸出
 * @param lanePlan  buildLanePlan() 輸出
 * @param towerPlan buildTowerPlan() 輸出
 * @returns { blue, red, blueprint: { blue: items, red: items } }
 */
export function buildBasePlan(L, lanePlan, towerPlan) {
  const BP = buildBaseBlueprintPair(L, lanePlan, towerPlan);
  const out = {
    blue: groupSide(BP.blue, "blue"),
    red: groupSide(BP.red, "red"),
  };
  out.blueprint = { blue: BP.blue, red: BP.red };
  out.frame = BP.frame;
  return out;
}
