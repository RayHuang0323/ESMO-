// ============================================================================
//  tools/export_esmo_rift_source.mjs — 地圖資料 → Blender 美術 source（art/moba-rift/source.json）
//
//  用法：
//    node tools/export_esmo_rift_source.mjs [out]                      全量匯出（舊行為；會連帶覆寫整張圖）
//    node tools/export_esmo_rift_source.mjs --scope=pits [--base=<source.json>] [--radius=22] [out]
//        只更新兩個大型物件坑（v16 Objective Pit art fix）：
//          · 牆：坑壁（pit_wall／entrance_taper）＋ 坑心半徑 radius 內的其他牆（坑底縮放後被重新裁切的野區牆）
//                一律換成 runtime 碰撞的版本；範圍外的牆與順序原封不動（含 main 既有的不同步，另案處理）。
//          · 地面：pit_{dragon,baron}_{floor,glow,core} 換成 runtime 版本；光暈改中性色（pit_neutral）。
//          · 美術中性：兩坑壁高統一為 HEIGHT.pit_wall_neutral（巴龍坑牆段本來就是巨龍坑的 180° 鏡射）
//            ⇒ 兩坑在 GLB 裡形狀、高度、顏色完全互為鏡射，身分只由 runtime ObjectivePitMarkers 表示。
//          · 樹：沿用 base 的 explicit.v1 樹高（位置相同的牆保留原值）；新牆以「鏡像對稱雜湊」決定
//            ⇒ 鏡像的一對牆得到同一棵樹；不再依 index／共用亂數串流，改牆不會牽動其他地形。
//  base 必須已是 treeModel=explicit.v1（見 art/moba-rift/freeze_legacy_trees.py）。
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { buildMobaLayout } from '../src/battle/moba/map/mobaMapLayout.js';
import { buildTerrainShapes } from '../src/battle/moba/map/mapTerrainShapes.js';
import { PALETTE, HEIGHT } from '../src/battle/moba/map/mapVisualStyle.js';
import { LANES, RIVER, BASE, FOUNTAIN, PITS, CAMPS, BUSHES, WORLD_BOUNDS, WORLD_SCALE } from '../src/gameData.js';

const argv = process.argv.slice(2);
const flag = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? null;
const positional = argv.filter((a) => !a.startsWith('--'));
const destination = positional[0] ?? 'art/moba-rift/source.json';
const t = buildTerrainShapes(buildMobaLayout());

if (flag('scope') !== 'pits') {
  const source = { schema: 'EsmoRiftArtSource.v1', assetSpan: WORLD_BOUNDS.width, WORLD_BOUNDS, WORLD_SCALE,
    LANES, RIVER, BASE, FOUNTAIN, PITS, CAMPS, BUSHES,
    ground: t.groundLayers, walls: t.wallItems,
    bushes: t.bushClusters, arena: t.meta.arena };
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(source));
  console.log(JSON.stringify({ ground: source.ground.length, walls: source.walls.length, bushSample: source.bushes?.[0], arena: source.arena?.length }));
} else {
  const base = JSON.parse(fs.readFileSync(flag('base') ?? 'art/moba-rift/source.json', 'utf8'));
  if (base.treeModel !== 'explicit.v1') throw new Error('base source must be treeModel=explicit.v1 (run art/moba-rift/freeze_legacy_trees.py first)');
  const R = Number(flag('radius') ?? 22);
  const pits = [t.meta.pits.dragon, t.meta.pits.baron];
  const PIT_KINDS = new Set(['pit_wall', 'entrance_taper']);
  const inScope = (w) => PIT_KINDS.has(w.kind) || pits.some((p) => Math.hypot(w.x - p.x, w.y - p.y) <= R);
  const SPAN = WORLD_BOUNDS.width;
  const key = (w) => [w.kind, w.x.toFixed(4), w.y.toFixed(4), w.len.toFixed(4), w.thick.toFixed(4)].join('|');
  //  鏡像對稱雜湊：(x,y) 與 (span−x, span−y) 取字典序較小者 ⇒ 一對鏡像牆得到同一個值
  const canon = (w) => { const a = [w.x, w.y], b = [SPAN - w.x, SPAN - w.y]; const c = (a[0] < b[0] - 1e-6 || (Math.abs(a[0] - b[0]) <= 1e-6 && a[1] <= b[1])) ? a : b;
    return `${w.kind}|${c[0].toFixed(3)}|${c[1].toFixed(3)}|${w.len.toFixed(3)}|${w.thick.toFixed(3)}`; };
  const hash01 = (s, salt) => { let h = 0x811c9dc5 ^ salt; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h / 4294967296; };
  const newTree = (w) => (hash01(canon(w), 1) < 1 / 3 && Math.min(w.len, w.thick) > 1.4 && !String(w.kind).includes('base'))
    ? 7 + 5 * hash01(canon(w), 2) : null;

  const baseByKey = new Map(base.walls.map((w) => [key(w), w]));
  const firstPit = base.walls.findIndex((w) => PIT_KINDS.has(w.kind));
  const kept = base.walls.filter((w) => !inScope(w));
  const neutralH = (w) => {
    if (!PIT_KINDS.has(w.kind)) return w.h;
    //  runtime：巨龍側牆段高度以 pit_wall_dragon 為基準、巴龍側為鏡射後 ×(baron／dragon)；統一換成中性高度
    const near = Math.hypot(w.x - t.meta.pits.dragon.x, w.y - t.meta.pits.dragon.y) < Math.hypot(w.x - t.meta.pits.baron.x, w.y - t.meta.pits.baron.y) ? 'dragon' : 'baron';
    return w.h * HEIGHT.pit_wall_neutral / (near === 'dragon' ? HEIGHT.pit_wall_dragon : HEIGHT.pit_wall_baron);
  };
  let reused = 0, created = 0;
  const scoped = t.wallItems.filter(inScope).map((w) => {
    const prev = baseByKey.get(key(w));
    const out = { ...w, h: neutralH(w) };
    const tree = prev ? prev.tree : newTree(w);
    if (prev) reused++; else created++;
    if (tree) out.tree = tree; else delete out.tree;
    return out;
  });
  //  牆的順序：範圍外保持原序；範圍內整批放在原本坑壁的位置（順序只影響合批，不影響外觀）
  const insertAt = kept.findIndex((w, i) => base.walls.indexOf(w) >= firstPit);
  const walls = [...kept.slice(0, insertAt), ...scoped, ...kept.slice(insertAt)];

  const PIT_GROUND = /^pit_(dragon|baron)_(floor|glow|core)$/;
  const runtimeGround = new Map(t.groundLayers.filter((g) => PIT_GROUND.test(g.id)).map((g) => [g.id, g]));
  const ground = base.ground.map((g) => {
    if (!PIT_GROUND.test(g.id)) return g;
    const r = runtimeGround.get(g.id);
    if (!r) throw new Error(`runtime ground layer missing: ${g.id}`);
    return /_glow$/.test(g.id) ? { ...r, colorKey: 'pit_neutral', color: PALETTE.pit_neutral } : r;
  });

  const source = { ...base, ground, walls };
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(source));
  console.log(JSON.stringify({ scope: 'pits', radius: R, walls: { before: base.walls.length, after: walls.length, keptOutside: kept.length,
    inScope: scoped.length, reusedWithTree: reused, newWalls: created, newTrees: scoped.filter((w) => w.tree).length },
    groundReplaced: runtimeGround.size }));
}
