#!/usr/bin/env node
// ============================================================================
//  tools/compare_rift_glb.mjs — 兩個 Rift GLB 的幾何比對（坑位美術修正的「其他地形不動」證據）
//
//  用法：node tools/compare_rift_glb.mjs <a.glb> <b.glb> [--exclude-r=24] [--json=<檔>]
//    逐網格（依名稱）取 POSITION 頂點（套用 node 平移），換回模擬座標 (x = X + span/2, y = Z + span/2)，
//    四捨五入到 1e-4 後比對頂點多重集合。`--exclude-r` ⇒ 距任一坑心（source 的 PITS）該半徑內的頂點不列入比對。
//  輸出：網格數、三角形數、各網格差異頂點數、排除區外是否完全相同。
// ============================================================================
import fs from "node:fs";

const argv = process.argv.slice(2);
const files = argv.filter((a) => !a.startsWith("--"));
const flag = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? null;
const EXCL = Number(flag("exclude-r") ?? 0);
const SRC = JSON.parse(fs.readFileSync(flag("source") ?? "art/moba-rift/source.json", "utf8"));
const HALF = SRC.WORLD_BOUNDS.width / 2;
const PITS = Object.values(SRC.PITS);

function parseGlb(file) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));
  const meshes = new Map();
  for (const node of json.nodes ?? []) {
    if (node.mesh === undefined) continue;
    const t = node.translation ?? [0, 0, 0];
    const mesh = json.meshes[node.mesh];
    const verts = [];
    let tris = 0;
    for (const prim of mesh.primitives) {
      const acc = json.accessors[prim.attributes.POSITION];
      const bv = json.bufferViews[acc.bufferView];
      const off = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      const f = new Float32Array(bin.buffer, bin.byteOffset + off, acc.count * 3);
      for (let i = 0; i < acc.count; i++) verts.push([f[i * 3] + t[0], f[i * 3 + 1] + t[1], f[i * 3 + 2] + t[2]]);
      if (prim.indices !== undefined) tris += json.accessors[prim.indices].count / 3;
    }
    //  Blender 在同一個 .blend 重跑會替名稱加上 .001／.005 之類的後綴 ⇒ 比對前去掉；同名則合併
    const name = String(node.name ?? mesh.name).replace(/\.\d{3}$/, "");
    const prev = meshes.get(name);
    if (prev) { prev.verts.push(...verts); prev.tris += tris; } else meshes.set(name, { verts, tris });
  }
  return { meshes, generator: json.asset?.generator ?? null };
}

const [A, B] = files.map(parseGlb);
const simOf = ([x, , z]) => ({ x: x + HALF, y: z + HALF });
const inExcl = (v) => EXCL > 0 && PITS.some((p) => { const s = simOf(v); return Math.hypot(s.x - p.x, s.y - p.y) <= EXCL; });
const key = (v) => v.map((c) => c.toFixed(4)).join(",");
const bag = (verts) => { const m = new Map(); for (const v of verts) { if (inExcl(v)) continue; const k = key(v); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
const names = [...new Set([...A.meshes.keys(), ...B.meshes.keys()])].sort();
let diffTotal = 0; const perMesh = [];
for (const n of names) {
  const a = bag(A.meshes.get(n)?.verts ?? []), b = bag(B.meshes.get(n)?.verts ?? []);
  let d = 0;
  for (const [k, c] of a) d += Math.abs(c - (b.get(k) ?? 0));
  for (const [k, c] of b) if (!a.has(k)) d += c;
  if (d) perMesh.push({ mesh: n, diffVerts: d });
  diffTotal += d;
}
//  全域（不分網格）頂點多重集合 ⇒ 分網格／合批方式不同也能判斷幾何本身是否相同
const all = (G) => [...G.meshes.values()].flatMap((m) => m.verts);
const ga = bag(all(A)), gb = bag(all(B));
let globalDiff = 0;
for (const [k, c] of ga) globalDiff += Math.abs(c - (gb.get(k) ?? 0));
for (const [k, c] of gb) if (!ga.has(k)) globalDiff += c;
const sum = (G) => ({ meshes: G.meshes.size, tris: [...G.meshes.values()].reduce((s, m) => s + m.tris, 0), verts: [...G.meshes.values()].reduce((s, m) => s + m.verts.length, 0), generator: G.generator });
const out = { a: sum(A), b: sum(B), excludeRadius: EXCL, identicalOutsideExclusion: diffTotal === 0 && globalDiff === 0,
  diffVerts: diffTotal, globalDiffVerts: globalDiff, meshesWithDiff: perMesh };
console.log(JSON.stringify(out, null, 1));
if (flag("json")) fs.writeFileSync(flag("json"), JSON.stringify(out, null, 2));
process.exit(out.identicalOutsideExclusion ? 0 : 1);
