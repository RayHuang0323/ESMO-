// ============================================================================
//  environment/assets/rocks/index.js — Rock Pack 匯出（Milestone B）
//
//  對外提供 ROCK_ASSETS：形狀與 fakeAssets 相容的 { name, mat, lod0, lod1 }，
//  可直接餵給既有 InstancedLODGroup（不另建 runtime）。
//  ⚠ 模組層單例：8 件幾何在首次 import 時各建立一次並快取重用；共用 1 個材質。
//  ⚠ 決定性：幾何由 seededRandom 生成（見 rockGeometry.js），無 Math.random()。
// ============================================================================
import { rockMaterial } from "./rockMaterial.js";
import { buildRockGeometries, ROCK_PARAMS } from "./rockGeometry.js";

export const ROCK_NAMES = [
  "Rock_Small_A", "Rock_Small_B",
  "Rock_Medium_A", "Rock_Medium_B",
  "Rock_Large_A", "Rock_Large_B",
  "Rock_Cliff_A", "Rock_Riverbank_A",
];

// 適用區域（供 Placement / 文件；對齊 PLACEMENT_RULES）
export const ROCK_ZONES = {
  Rock_Small_A: "草地/路緣散石", Rock_Small_B: "路面/平坦地表薄石",
  Rock_Medium_A: "路口/營地圍邊", Rock_Medium_B: "崖腳/分層中石",
  Rock_Large_A: "地標大岩塊", Rock_Large_B: "分層立石/地標",
  Rock_Cliff_A: "台地緣/岩壁銜接", Rock_Riverbank_A: "河岸/水線銜接",
};

const _cache = {};
const _mat = rockMaterial();

/** 取得單件 Rock asset（{ name, mat, lod0, lod1 }）；建立一次後快取。 */
export function getRock(name) {
  if (_cache[name]) return _cache[name];
  const { lod0, lod1 } = buildRockGeometries(name);
  _cache[name] = { name, mat: _mat, lod0, lod1 };
  return _cache[name];
}

/** 全部 8 件（供 Debug / 壓測）。 */
export function getAllRocks() {
  const out = {};
  for (const n of ROCK_NAMES) out[n] = getRock(n);
  return out;
}

/** 中繼資料（tris/材質/適用區域），供文件與 verifier。 */
export function rockMeta() {
  return ROCK_NAMES.map((name) => {
    const a = getRock(name);
    return {
      name,
      lod0Tris: a.lod0.userData.tris,
      lod1Tris: a.lod1.userData.tris,
      material: _mat.name,
      zone: ROCK_ZONES[name],
      params: ROCK_PARAMS[name],
    };
  });
}
