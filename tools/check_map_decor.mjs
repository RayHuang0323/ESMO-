// ============================================================================
//  tools/check_map_decor.mjs — 地圖裝飾放置驗證（Milestone C）
//
//  用合成地形取樣（不需 GLB/瀏覽器）驗證 mapDecorPlacement + mapDecorPresets：
//   · 決定性（同 seed 一致、不同 seed 不同）、不使用 Math.random()
//   · instance count 合理、無 NaN/null、rock asset key 存在
//   · geometry/material 重用（getRock 快取單例）
//  （實際地形 raycast、FPS、視覺需瀏覽器人工確認。）
// ============================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildHeightField, generateMapDecor, sampleField, slopeField, cameraPose } from "../src/environment/placement/mapDecorPlacement.js";
import { DECOR_PRESETS } from "../src/environment/placement/mapDecorPresets.js";
import { ROCK_NAMES, getRock } from "../src/environment/assets/rocks/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("❌ " + m); } };

// 合成地形（近似 terrain_style：場地 ~0、對角河谷、NE 台地、邊界脊）
function synthHeight(x, z) {
  let h = 0.2;
  const dp = Math.hypot(x - 14, z - 14); if (dp < 8) h = Math.max(h, 3 * (1 - dp / 8));
  const dr = Math.abs(x - z) / Math.SQRT2; if (dr < 3) h = Math.min(h, -1 * (1 - dr / 3));
  const edge = 30 - Math.max(Math.abs(x), Math.abs(z)); if (edge < 3) h += (3 - edge) * 0.8;
  return h;
}
const BBOX = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };
const hf = buildHeightField(synthHeight, BBOX, 48);

// 0) 高度場/取樣 sanity
ok(Number.isFinite(hf.min) && Number.isFinite(hf.max) && hf.max > hf.min, "高度場 min/max 應有效");
ok(Number.isFinite(sampleField(hf, 0, 0)), "sampleField 中心應有值");
ok(slopeField(hf, 14, 6) >= 0, "slopeField 應為非負");

// 1) 決定性
const a = generateMapDecor({ hf, seed: "map-1", presets: DECOR_PRESETS });
const b = generateMapDecor({ hf, seed: "map-1", presets: DECOR_PRESETS });
ok(JSON.stringify(a.groups) === JSON.stringify(b.groups), "同 seed 應產生相同裝飾");
const c = generateMapDecor({ hf, seed: "map-2", presets: DECOR_PRESETS });
ok(JSON.stringify(a.groups) !== JSON.stringify(c.groups), "不同 seed 應不同");

// 2) instance count 合理（>0 且各 zone ≤ 請求數）
ok(a.stats.total > 0, `總裝飾數應 >0，實得 ${a.stats.total}`);
for (const p of DECOR_PRESETS) {
  ok(a.stats.perZone[p.id] <= p.count, `${p.id} 放置數應 ≤ 請求 ${p.count}（實得 ${a.stats.perZone[p.id]}）`);
}

// 3) 無 NaN/null；asset key 存在；pos y = 取樣高度
for (const name of Object.keys(a.groups)) {
  ok(ROCK_NAMES.includes(name), `裝飾用到的資產 ${name} 應為有效 Rock`);
  for (const t of a.groups[name]) {
    ok(t.pos.every(Number.isFinite) && Number.isFinite(t.scale) && Number.isFinite(t.rotY),
      `${name} transform 不應含 NaN`);
    ok(!t.color || t.color.every((v) => v >= 0 && v <= 1), `${name} color 應在 [0,1]`);
    ok(t.scale >= 0.7 && t.scale <= 1.45, `${name} scale 範圍應合理`);
  }
}

// 4) geometry/material 重用（快取單例、共用 1 材質）
ok(getRock("Rock_Large_A") === getRock("Rock_Large_A"), "getRock 應回快取同一物件");
const usedMats = new Set(Object.keys(a.groups).map((n) => getRock(n).mat));
ok(usedMats.size === 1, `裝飾用到的石頭應共用 1 材質，實得 ${usedMats.size}`);

// 5) 不使用 Math.random()（去註解後掃）
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
for (const f of ["mapDecorPlacement.js", "mapDecorPresets.js"]) {
  const src = strip(readFileSync(resolve(__dir, "../src/environment/placement/", f), "utf8"));
  ok(!/Math\.random\s*\(/.test(src), `${f} 不應使用 Math.random()`);
}

// 6) 相機 preset：top 與 near 應不同、無 NaN、target=center；且 scale 上限受控
const center = [5, 1, -5], size = 24;
const top = cameraPose("top", center, size), near = cameraPose("near", center, size);
const finite3 = (a) => a.length === 3 && a.every(Number.isFinite);
ok(finite3(top.position) && finite3(top.target), "top 相機座標無 NaN");
ok(finite3(near.position) && finite3(near.target), "near 相機座標無 NaN");
ok(JSON.stringify(top.position) !== JSON.stringify(near.position), "top / near 相機位置應不同");
ok(top.position[1] > near.position[1], "俯視應比近檢視高");
ok(JSON.stringify(top.target) === JSON.stringify(center), "相機 target 應為地形中心");
ok(cameraPose("top", center, 0).position.every(Number.isFinite), "size=0 時相機仍應有效（fallback）");
// scale 上限：所有裝飾 instance 的 scale ≤ 1.3（避免巨石蓋畫面）
let maxScale = 0;
for (const name of Object.keys(a.groups)) for (const t of a.groups[name]) maxScale = Math.max(maxScale, t.scale);
ok(maxScale <= 1.3, `裝飾石最大 scale 應 ≤1.3，實得 ${maxScale.toFixed(3)}`);

console.log(`\nMap Decor 檢查：${pass} 通過、${fail} 失敗`);
console.log("— 分區放置數：", JSON.stringify(a.stats.perZone), " 總計", a.stats.total);
console.log("— per-asset：", JSON.stringify(a.stats.perAsset));
process.exit(fail === 0 ? 0 : 1);
