// ============================================================================
//  tools/preview_moba_map.mjs — MOBA 地圖俯視圖 PNG（無瀏覽器自檢用）
//
//  用途：專案沒有 puppeteer/playwright，AI 無法自己開瀏覽器看畫面。這支工具讀取
//  **與 renderer 完全相同的形狀資料**（mapTerrainShapes），在 Node 內把地圖的俯視
//  footprint 光柵化成 PNG，讓「關掉標籤後還看不看得出結構」可以被實際檢查。
//
//  它畫的是**形狀與色塊**（含以高度模擬的投影），不是 three.js 的真實光照結果；
//  用來判讀構圖/可讀性可以，不能取代瀏覽器目視。
//
//  用法：node tools/preview_moba_map.mjs [--labels]
//  產物：review/moba-map/preview_topdown.png（純地圖）
//        review/moba-map/preview_topdown_debug.png（--labels：加節點標記）
//  無相依（PNG 以 Node 內建 zlib 編碼）。
// ============================================================================
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMobaLayout } from "../src/battle/moba/map/mobaMapLayout.js";
import { buildTerrainShapes } from "../src/battle/moba/map/mapTerrainShapes.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dir, "../review/moba-map");
const DEBUG = process.argv.includes("--labels");
// --zoom x,y,size：只畫地圖的一塊（模擬座標），用來近距離檢查基地/河口等局部構圖。
const zoomArg = process.argv.find((a) => a.startsWith("--zoom="));
const ZOOM = zoomArg ? zoomArg.slice(7).split(",").map(Number) : null;
const VIEW = ZOOM
  ? { x: ZOOM[0], y: ZOOM[1], size: ZOOM[2] ?? 70 }
  : { x: 0, y: 0, size: 220 };
const PX = Math.round(1100 / VIEW.size);   // 產物固定約 1100px 寬

// ── 極簡光柵器 ────────────────────────────────────────────────────────────
const W = VIEW.size * PX, H = VIEW.size * PX;
const buf = Buffer.alloc(W * H * 3);
const sx = (x) => (x - VIEW.x) * PX, sy = (y) => (y - VIEW.y) * PX;

function setPx(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
}
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const shade = (hex, k) => rgb(hex).map((c) => Math.max(0, Math.min(255, Math.round(c * k))));

/** 掃描線填多邊形（像素座標）。 */
function fillPoly(poly, [r, g, b]) {
  if (poly.length < 3) return;
  let minY = Infinity, maxY = -Infinity;
  for (const p of poly) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  const y0 = Math.max(0, Math.ceil(minY)), y1 = Math.min(H - 1, Math.floor(maxY));
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], c = poly[j];
      if ((a.y > y) !== (c.y > y)) xs.push(((c.x - a.x) * (y - a.y)) / (c.y - a.y) + a.x);
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k])), xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) setPx(x, y, r, g, b);
    }
  }
}
const toPx = (poly) => poly.map((p) => ({ x: sx(p.x), y: sy(p.y) }));

/** 旋轉矩形（牆段）→ 像素多邊形。angle 定義同 renderer：atan2(dx,dy)。 */
function wallQuad(it, grow = 0) {
  const ux = Math.sin(it.angle), uy = Math.cos(it.angle);   // 長軸方向
  const vx = uy, vy = -ux;                                   // 厚度方向
  const hl = (it.len + it.thick * 0.55) / 2 + grow, ht = it.thick / 2 + grow;
  return [
    { x: it.x + ux * hl + vx * ht, y: it.y + uy * hl + vy * ht },
    { x: it.x + ux * hl - vx * ht, y: it.y + uy * hl - vy * ht },
    { x: it.x - ux * hl - vx * ht, y: it.y - uy * hl - vy * ht },
    { x: it.x - ux * hl + vx * ht, y: it.y - uy * hl + vy * ht },
  ];
}

// ── PNG 編碼（Node 內建 zlib；不裝任何相依）────────────────────────────────
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
const crc32 = (b) => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
function encodePNG(width, height, pix) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) pix.copy(raw, y * stride + 1, y * width * 3, (y + 1) * width * 3);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── 繪製 ──────────────────────────────────────────────────────────────────
const L = buildMobaLayout();
const S = buildTerrainShapes(L);

// 1) 地面色塊（已依 y 排序，照順序畫）
for (const layer of S.groundLayers) fillPoly(toPx(layer.poly), rgb(layer.color));

// 1b) 草叢 / cover（低模灌木團塊：投影 + 暗叢 + 亮叢，讀成可藏人的遮蔽）
for (const c of S.bushClusters) {
  for (const b of c.blobs) {
    const disc = (r) => Array.from({ length: 12 }, (_, k) => ({
      x: c.x + b.dx + Math.cos((k / 12) * Math.PI * 2) * r,
      y: c.y + b.dy + Math.sin((k / 12) * Math.PI * 2) * r,
    }));
    fillPoly(toPx(disc(b.r * 1.02).map((p) => ({ x: p.x + b.h * 0.09, y: p.y + b.h * 0.09 }))), [10, 15, 8]);
    fillPoly(toPx(disc(b.r)), rgb(b.lit ? 0x37481f : 0x2b3a1b));
  }
}

// 2) 量體：先畫投影（往 +x/+y 偏移，模擬 renderer 的方向光），再畫頂面
const VOL_COLOR = {
  cliff: 0x6a6257, cliff_mass: 0x6a6257, wall: 0x5f584e,
  pit_wall: 0x554d45, base_rim: 0x6e6659, base_keep: 0x7b7263, base_gate: 0x847a68,
  entrance_taper: 0x635b50, fountain_rim: 0x7a756a, river_stone: 0x555044,
};
for (const it of S.wallItems) {
  const off = it.h * 0.11;
  fillPoly(toPx(wallQuad({ ...it, x: it.x + off, y: it.y + off }, 0.3)), [12, 13, 11]);
}
for (const it of S.wallItems) {
  const base = VOL_COLOR[it.kind] ?? VOL_COLOR.wall;
  fillPoly(toPx(wallQuad(it)), shade(base, 0.62 + Math.min(1, it.h / 20) * 0.55));
}

// 3) 塔（底座 + 依等級不同大小的塔身 + 隊色冠）
for (const t of S.towers) {
  const totalH = t.tiers.reduce((m, x) => m + x.h, 0);
  const topR = t.tiers[t.tiers.length - 1].r;
  const octa = (cx0, cy0, r) => Array.from({ length: 8 }, (_, k) => ({
    x: cx0 + Math.cos((k / 8) * Math.PI * 2 + 0.39) * r, y: cy0 + Math.sin((k / 8) * Math.PI * 2 + 0.39) * r,
  }));
  fillPoly(toPx(octa(t.x + totalH * 0.11, t.y + totalH * 0.11, t.tiers[0].r)), [14, 15, 13]);
  fillPoly(toPx(octa(t.x, t.y, t.tiers[0].r)), shade(0x5c564d, 0.85));
  fillPoly(toPx(octa(t.x, t.y, topR)), shade(0x5c564d, 1.25));
  fillPoly(toPx(octa(t.x, t.y, topR * 0.62)), rgb(t.side === "blue" ? 0x4d95f0 : 0xf0574d));
}

// 3b) 門牙塔（畫法同兵線塔）
for (const t of S.nexusTurrets) {
  const topR = t.tiers[t.tiers.length - 1].r;
  const octa = (cx0, cy0, r) => Array.from({ length: 8 }, (_, k) => ({
    x: cx0 + Math.cos((k / 8) * Math.PI * 2 + 0.39) * r, y: cy0 + Math.sin((k / 8) * Math.PI * 2 + 0.39) * r,
  }));
  fillPoly(toPx(octa(t.x, t.y, t.tiers[0].r)), shade(0x5c564d, 0.9));
  fillPoly(toPx(octa(t.x, t.y, topR)), shade(0x5c564d, 1.3));
  fillPoly(toPx(octa(t.x, t.y, topR * 0.6)), rgb(t.side === "blue" ? 0x4d95f0 : 0xf0574d));
}

// 3c) 野怪剪影：把每個組件的俯視 footprint 依高度由低到高畫上去
//     （這只是自檢用的近似投影，真正的形體以 three.js 畫面為準）
function monsterFootprints(m) {
  const out = [];
  for (const mem of m.members) {
    const ca = Math.cos(m.facing), sa = Math.sin(m.facing);
    const mx = m.x + mem.dx * ca - mem.dy * sa;
    const my = m.y + mem.dx * sa + mem.dy * ca;
    const ra = m.facing + (mem.rot ?? 0);
    const cb = Math.cos(ra), sb = Math.sin(ra);
    for (const p of mem.parts) {
      const px = mx + p.dx * cb - p.dy * sb;
      const py = my + p.dx * sb + p.dy * cb;
      const top = (p.z ?? 0) + (p.h ?? 1);
      let poly;
      if (p.shape === "box") {
        const a = ra + (p.rot ?? 0), c = Math.cos(a), s = Math.sin(a);
        const hw = p.w / 2, hd = p.d / 2;
        poly = [[hw, hd], [hw, -hd], [-hw, -hd], [-hw, hd]]
          .map(([u, v]) => ({ x: px + u * c - v * s, y: py + u * s + v * c }));
      } else {
        const r = p.r ?? p.rBot ?? 1;
        poly = Array.from({ length: 10 }, (_, k) => ({
          x: px + Math.cos((k / 10) * Math.PI * 2) * r,
          y: py + Math.sin((k / 10) * Math.PI * 2) * r,
        }));
      }
      out.push({ poly, top, color: p.color });
    }
  }
  return out.sort((a, b) => a.top - b.top);
}
for (const m of S.monsters) {
  const fps = monsterFootprints(m);
  for (const f of fps) fillPoly(toPx(f.poly.map((p) => ({ x: p.x + f.top * 0.1, y: p.y + f.top * 0.1 }))), [10, 11, 9]);
  for (const f of fps) fillPoly(toPx(f.poly), shade(f.color, 0.7 + Math.min(1, f.top / 14) * 0.55));
}

// 4) 主堡 / 泉水
for (const n of S.meta.nexus) {
  const dia = (r) => [{ x: n.x, y: n.y - r }, { x: n.x + r, y: n.y }, { x: n.x, y: n.y + r }, { x: n.x - r, y: n.y }];
  fillPoly(toPx(dia(9)), shade(n.platformTop, 1.0));
  fillPoly(toPx(dia(6)), rgb(n.color));
  // 溫泉：平台 / 台階 / 水面都已經是地面圖層，這裡只補中央水柱與頂端光體
  const f = n.fountain;
  const disc = (r) => Array.from({ length: 14 }, (_, k) => ({
    x: f.x + Math.cos((k / 14) * Math.PI * 2) * r, y: f.y + Math.sin((k / 14) * Math.PI * 2) * r,
  }));
  fillPoly(toPx(disc(2.1)), shade(n.platformTop, 1.1));
  fillPoly(toPx(disc(1.3)), shade(n.color, 1.15));
}

// 5) Debug 模式才畫的節點標記（入口位置；正式畫面上沒有任何造型物件）
if (DEBUG) {
  for (const g of S.entrances) {
    fillPoly(toPx(Array.from({ length: 10 }, (_, k) => ({
      x: g.x + Math.cos((k / 10) * Math.PI * 2) * 1.6,
      y: g.y + Math.sin((k / 10) * Math.PI * 2) * 1.6,
    }))), rgb(g.color ?? 0xffffff));
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const file = resolve(OUT_DIR, ZOOM ? `preview_zoom_${VIEW.x}_${VIEW.y}.png`
  : DEBUG ? "preview_topdown_debug.png" : "preview_topdown.png");
writeFileSync(file, encodePNG(W, H, buf));
console.log(`俯視圖已輸出：${file}  (${W}×${H}, ${PX}px/unit)`);
console.log(`— 地面色塊 ${S.groundLayers.length} 層｜量體 ${S.wallItems.length} 段｜塔 ${S.towers.length}｜入口 ${S.entrances.length}｜裝飾岩 ${S.rocks.length}｜草叢 ${S.bushClusters.length} 叢`);
