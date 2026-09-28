#!/usr/bin/env node
// ============================================================================
//  tools/browser_review_vfx_archetypes.mjs — 技能階段層「地面語彙」俯視足跡圖（只截圖）
//
//  執行：node tools/browser_review_vfx_archetypes.mjs [--out=review/moba-mobile-hud/vfx]
//  直接呼叫 emitGroundArchetype（與 HeroVfxRuntime 同一支），把每種語彙在 6 個時間點的輸出
//  投影成俯視圖：pool 3 方塊＝旋轉矩形、pool 0 地面環＝圓、pool 2 八面體＝點。
//  左欄「改版前」＝原本對每一招都畫的圓環階段層（逐行照舊實作重現），右側 11 欄＝現在的語彙。
//  ⚠ 這是足跡示意（真實的 3D 發光、高度、Bloom 要看戰鬥畫面），用來比對「形狀語言」是否不同。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";
import { emitGroundArchetype, groundArchetypeOf, GROUND_ARCHETYPES } from "../src/battle/moba/skills/skillGroundArchetype.js";
import { CHAMPIONS_100 } from "../src/data/heroDatabase.js";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `=${d}`).split("=").slice(1).join("=");
const OUT = arg("out", "review/moba-mobile-hud/vfx");
mkdirSync(OUT, { recursive: true });

const LABEL = { strip: "直線 strip", fan: "扇形 fan", wall: "牆 wall", crescent: "連斬 crescent", chain: "鎖鏈 chain", dash: "衝刺 dash",
  fracture: "地裂 fracture", orbit: "環繞 orbit", cross: "重擊 cross", trail: "彈道 trail", ring: "範圍 ring" };
const counts = {};
const sample = {};
for (const h of CHAMPIONS_100) for (const s of ["Q", "W", "E", "R"]) {
  const id = `${h.id}:${s}`, a = groundArchetypeOf(id);
  counts[a] = (counts[a] ?? 0) + 1;
  if (!sample[a] || (s === "Q" && sample[a][1] !== "Q")) sample[a] = [id, s, h.zh ?? h.id];
}
//  改版前的階段層（原 HeroVfxRuntime.layers，逐行重現）
function oldLayers(e, slot, emit) {
  const t = e.progress, r = e.radius, o = e.origin, b = e.target;
  if (t < 0.3) { const k = t / 0.3, a = (1 - k) * 0.85, cr = r * (0.7 + 0.3 * k) * 2; emit(0, o.x, 0, o.z, cr, cr, 1, a, e.color); if (slot === "R") emit(0, o.x, 0, o.z, r * 2.7, r * 2.7, 1, a * 0.8, "#fbbf24"); }
  if (t > 0.65) { const k = (t - 0.65) / 0.35, a = 1 - k; const rings = slot === "R" ? 3 : (slot === "E" || slot === "W") ? 2 : 1; const grow = slot === "R" ? 2.2 : 1.6;
    for (let i = 0; i < rings; i++) { const kk = Math.max(0, k - i * 0.18), rr = r * (0.5 + kk * grow) * 2; emit(0, b.x, 0, b.z, rr, rr, 1, a * (1 - i * 0.2), slot === "R" && i === rings - 1 ? "#fbbf24" : e.color); }
    if (slot === "W") emit(0, b.x, 0, b.z, r * 0.9, r * 0.9, 1, a * 0.7, "#ffffff"); }
}
const W = 130, SCALE = 9, TS = [0.1, 0.25, 0.45, 0.6, 0.75, 0.9];
function cell(draw, color) {
  const shapes = [];
  const emit = (pool, x, y, z, sx, sy, sz, a, hex, rot = 0) => {
    const X = 22 + x * SCALE, Y = W - 22 - z * SCALE, al = Math.max(0.08, Math.min(1, a ?? 1));
    const col = hex ?? color;
    if (pool === 0) shapes.push(`<circle cx="${X}" cy="${Y}" r="${(sx / 2) * SCALE}" fill="none" stroke="${col}" stroke-width="2" opacity="${al}"/>`);
    else if (pool === 3) shapes.push(`<rect x="${X - (sx / 2) * SCALE}" y="${Y - (sz / 2) * SCALE}" width="${Math.max(1.2, sx * SCALE)}" height="${Math.max(1.2, sz * SCALE)}" fill="${col}" opacity="${al}" transform="rotate(${(rot * 180) / Math.PI} ${X} ${Y})"/>`);
    else shapes.push(`<circle cx="${X}" cy="${Y}" r="${Math.max(1.8, sx * SCALE)}" fill="${col}" opacity="${al}"/>`);
  };
  for (const t of TS) draw(t, emit);
  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" style="background:#0b1220;border:1px solid #1f2937;border-radius:6px">`
    + `<circle cx="22" cy="${W - 22}" r="4" fill="#e5e7eb"/><circle cx="${22 + 6 * SCALE}" cy="${W - 22 - 4 * SCALE}" r="4" fill="none" stroke="#e5e7eb" stroke-dasharray="2 2"/>${shapes.join("")}</svg>`;
}
const mkE = (skillId, t, color) => ({ skillId, progress: t, radius: 1.4, color, origin: { x: 0, y: 0, z: 0 }, target: { x: 6, y: 0, z: 4 } });
const PAL = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee", "#fb923c", "#e879f9", "#4ade80", "#93c5fd"];
const cols = GROUND_ARCHETYPES.map((a, i) => {
  const [id, slot, name] = sample[a] ?? [null, "Q", "—"];
  const color = PAL[i % PAL.length];
  const before = cell((t, emit) => oldLayers(mkE(id, t, color), slot, emit), color);
  const after = cell((t, emit) => emitGroundArchetype(mkE(id, t, color), slot, a, emit), color);
  return `<div class="col"><div class="h">${LABEL[a]}</div><div class="n">${counts[a] ?? 0} 招 · 例：${name} ${slot}</div>${before}<div class="arrow">↓ 改版前 → 現在</div>${after}</div>`;
}).join("");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;background:#060a12;color:#e5e7eb;font:13px system-ui}h1{font-size:16px;margin:0 0 4px}p{margin:0 0 12px;color:#94a3b8}
.grid{display:flex;flex-wrap:wrap;gap:12px}.col{display:grid;gap:4px;justify-items:center}.h{font-weight:800}.n{font-size:11px;color:#94a3b8}.arrow{font-size:10px;color:#64748b}</style></head><body>
<h1>技能階段層：地面語彙（俯視足跡，6 個時間點疊合）</h1><p>白點＝施放者、虛線圈＝目標。上排：改版前（每一招都是圓環，只換顏色）；下排：現在依技能資料換成不同語彙。分布：${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join("、")}</p>
<div class="grid">${cols}</div></body></html>`;
writeFileSync(`${OUT}/vfx-archetypes.html`, html);

const result = await runGate({
  name: "技能地面語彙足跡圖",
  timeoutMs: 180000,
  async run({ chrome, ck, sleep }) {
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1680, height: 820, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate("data:text/html;charset=utf-8," + encodeURIComponent(html));
    await sleep(800);
    const s = await chrome.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(`${OUT}/vfx-archetypes.png`, Buffer.from(s.data, "base64"));
    ck("足跡圖已輸出", true);
  },
});
finishGate(result);
