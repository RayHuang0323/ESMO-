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
const PX = 5;                       // 每模擬單位的像素數
const DEBUG = process.argv.includes("--labels");

// ── 極簡光柵器 ────────────────────────────────────────────────────────────
const W = 220 * PX, H = 220 * PX;
const buf = Buffer.alloc(W * H * 3);
const sx = (x) => x * PX, sy = (y) => y * PX;

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

// 2) 量體：先畫投影（往 +x/+y 偏移，模擬 renderer 的方向光），再畫頂面
const VOL_COLOR = {
  cliff: 0x6a6257, cliff_mass: 0x6a6257, wall: 0x5f584e,
  pit_wall: 0x554d45, base_rim: 0x5a544b, river_stone: 0x555044,
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

// 4) 主堡 / 泉水 / 野怪
for (const n of S.meta.nexus) {
  const dia = (r) => [{ x: n.x, y: n.y - r }, { x: n.x + r, y: n.y }, { x: n.x, y: n.y + r }, { x: n.x - r, y: n.y }];
  fillPoly(toPx(dia(9)), shade(n.platformTop, 1.0));
  fillPoly(toPx(dia(6)), rgb(n.color));
  const f = n.fountain;
  fillPoly(toPx(Array.from({ length: 16 }, (_, k) => ({
    x: f.x + Math.cos((k / 16) * Math.PI * 2) * 6, y: f.y + Math.sin((k / 16) * Math.PI * 2) * 6,
  }))), shade(n.color, 0.72));
}
for (const c of S.meta.camps) {
  const col = c.type === "buff" ? (c.side === "red" ? 0xf97316 : 0x38bdf8) : 0x8ec63f;
  fillPoly(toPx([{ x: c.x, y: c.y - 3.4 }, { x: c.x + 3, y: c.y + 2.4 }, { x: c.x - 3, y: c.y + 2.4 }]), rgb(col));
}

// 5) Debug 模式才畫的節點標記（門柱等）
if (DEBUG) {
  for (const g of S.gates) {
    const r = 2.2 * (g.scale ?? 1);
    const px = Math.cos(g.angle + Math.PI / 2), py = Math.sin(g.angle + Math.PI / 2);
    for (const s of [1, -1]) {
      const gx = g.x + px * 6 * s, gy = g.y + py * 6 * s;
      fillPoly(toPx(Array.from({ length: 10 }, (_, k) => ({
        x: gx + Math.cos((k / 10) * Math.PI * 2) * r, y: gy + Math.sin((k / 10) * Math.PI * 2) * r,
      }))), rgb(g.color));
    }
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const file = resolve(OUT_DIR, DEBUG ? "preview_topdown_debug.png" : "preview_topdown.png");
writeFileSync(file, encodePNG(W, H, buf));
console.log(`俯視圖已輸出：${file}  (${W}×${H}, ${PX}px/unit)`);
console.log(`— 地面色塊 ${S.groundLayers.length} 層｜量體 ${S.wallItems.length} 段｜塔 ${S.towers.length}｜門 ${S.gates.length}｜裝飾岩 ${S.rocks.length}`);
