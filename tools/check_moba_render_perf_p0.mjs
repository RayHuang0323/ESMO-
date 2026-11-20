#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_render_perf_p0.mjs — MOBA 對戰渲染效能修正的長期回歸（Lag P0，2026-11-11）
//
//  守三件事（秒級；不開瀏覽器）：
//   A. 單次繪製的判定規則：只有「半透明＋雙面＋平面幾何」才算；非平面、不透明、單面一律不算（用真的 three 物件驗）。
//   B. MobaRenderPrewarm 有掛進正式 Runtime 畫面，而且預熱時有綁離屏 target（否則會編出用不到的變體）。
//   C. 結構（塔／主堡）：塔身／塔冠／血條是 InstancedMesh；地環沒有合批（半透明排序）；
//      每座結構的 <group userData.structureId> 與受擊／拆塔的 part 名稱都還在（診斷工具與其他 gate 靠它們）。
//  量測數字（draw call／幀）不在這裡斷言：那需要真 GPU，用 tools/owner_preview/perf_gl_frames_v21.mjs 量。
//  執行：node tools/check_moba_render_perf_p0.mjs
// ============================================================================
import { readFileSync } from "node:fs";
import * as THREE from "three";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
//  剝掉註解再比對（「不得出現 X」的斷言不能被說明文字誤觸）。
const code = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${detail ? `　${detail}` : ""}`); };

// ── A. 判定規則（與元件同一份常數／函式：從原始碼取出純函式來跑，避免在 Node 裡載入 R3F） ──
const prewarmSrc = read("src/battle/moba/render/MobaRenderPrewarm.jsx");
const planarDecl = prewarmSrc.match(/const PLANAR = new Set\(\[([^\]]+)\]\);/);
ck("A1 平面幾何清單只有 Plane／Ring／Circle", !!planarDecl && planarDecl[1].replace(/\s/g, "") === '"PlaneGeometry","RingGeometry","CircleGeometry"', planarDecl?.[1] ?? "找不到");
const fnSrc = prewarmSrc.match(/export function isSinglePassCandidate\(material, geometry\) \{\n([\s\S]*?)\n\}/);
ck("A2 找得到 isSinglePassCandidate", !!fnSrc);
if (planarDecl && fnSrc) {
  const PLANAR = new Set(JSON.parse(`[${planarDecl[1]}]`));
  const isCand = new Function("THREE", "PLANAR", "material", "geometry", fnSrc[1]).bind(null, THREE, PLANAR);
  const T = (o) => new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, ...o });
  ck("A3 半透明雙面＋Plane ⇒ 可單次繪製", isCand(T(), new THREE.PlaneGeometry(1, 1)) === true);
  ck("A4 半透明雙面＋Ring／Circle ⇒ 可單次繪製", isCand(T(), new THREE.RingGeometry(1, 2, 8)) === true && isCand(T(), new THREE.CircleGeometry(1, 8)) === true);
  ck("A5 非平面（圓柱／球／八面體）⇒ 不可", ![new THREE.CylinderGeometry(1, 1, 2, 8, 1, true), new THREE.SphereGeometry(1, 8, 8), new THREE.OctahedronGeometry(1, 0)].some((g) => isCand(T(), g)));
  ck("A6 不透明或單面 ⇒ 不可", isCand(T({ transparent: false }), new THREE.PlaneGeometry(1, 1)) === false && isCand(T({ side: THREE.FrontSide }), new THREE.PlaneGeometry(1, 1)) === false);
  ck("A7 沒有材質或幾何 ⇒ 不可（不丟例外）", isCand(null, new THREE.PlaneGeometry(1, 1)) === false && isCand(T(), null) === false);
}
const pc = code(prewarmSrc);
ck("A8 被用到非平面幾何的材質會還原（只還原自己開過的）", /s\.marked\.has\(mat\)[\s\S]{0,120}forceSinglePass = false/.test(pc));
ck("A9 同一輪同時用在平面與非平面的材質不會被開", /if \(nonPlanar\.has\(mat\)\) continue;/.test(pc));

// ── B. 掛載與預熱方式 ──
const view = code(read("src/battle/moba/render/MobaRuntimeView3D.jsx"));
ck("B1 MobaRuntimeView3D 掛了 <MobaRenderPrewarm />", /import MobaRenderPrewarm from "\.\/MobaRenderPrewarm\.jsx";/.test(view) && /<MobaRenderPrewarm \/>/.test(view));
ck("B2 預熱時綁離屏 target，結束後還原", /gl\.setRenderTarget\(s\.target\)/.test(pc) && /finally \{\s*gl\.setRenderTarget\(prevTarget\);/.test(pc));
ck("B3 預熱失敗不影響畫面（有 catch，且把錯誤記下來）", /catch \(err\) \{[\s\S]{0,200}lastError/.test(pc));
ck("B4 不 import LogicEngine／store（純呈現層）", !/LogicEngine|useGameStore|profileStore/.test(pc));
ck("B5 不新增場景物件（元件 return null）", /return null;\s*\}\s*$/.test(pc.trim()));

// ── C. 結構合批 ──
const st = code(read("src/battle/moba/render/MobaRuntimeStructures.jsx"));
const groups = st.match(/const INSTANCED = Object\.freeze\(\[([^\]]+)\]\);/);
const keys = groups ? JSON.parse(`[${groups[1]}]`) : [];
ck("C1 合批組別＝塔身×3、塔冠×4、血條×3", keys.join(",") === "shaftBlue,shaftRed,shaftDead,crownBlue,crownRed,nexusCrownBlue,nexusCrownRed,barBg,barBlue,barRed", keys.join(","));
ck("C2 每一組都有對應的 <instancedMesh>", keys.every((k) => new RegExp(`<instancedMesh key=\\{\`${k}-\\$\\{cap\\}\`\\} ref=\\{instRefs\\.${k}\\}`).test(st)));
ck("C3 地環沒有合批（仍是逐結構的 mesh，材質每幀依存活切換）", !/instancedMesh[^>]*geo\.ring/.test(st) && /geometry=\{geo\.ring\}/.test(st) && /n\.ring\.material = s\.alive/.test(st));
ck("C4 每座結構的 <group userData.structureId> 仍在", /userData=\{\{ structureId: s\.id, type: s\.type \}\}/.test(st));
ck("C5 part 名稱都還在", ["tower-shaft", "structure-hp-bg", "structure-hp-fill", "structure-damage-pulse", "structure-destroy-burst"].every((t) => st.includes(t)));
ck("C6 血條的 renderOrder 沒變（底 48、填色 49）", /instRefs\.barBg\}[^>]*renderOrder=\{48\}/.test(st) && /instRefs\.barBlue\}[^>]*renderOrder=\{49\}/.test(st) && /instRefs\.barRed\}[^>]*renderOrder=\{49\}/.test(st));
ck("C7 每幀結尾把實例數與矩陣送出", /im\.count = used\[k\];\s*im\.instanceMatrix\.needsUpdate = true;/.test(st));
ck("C8 被摧毀的塔：塔身縮成 0.3 並換殘骸組；塔冠與血條只畫存活的", /const k = dead \? 0\.3 : 1;/.test(st) && /put\(dead \? "shaftDead"/.test(st) && /if \(s\.alive\) \{[\s\S]*put\("barBg"\)/.test(st));

// ── 行為：實例矩陣與原本逐物件的 transform 是同一個結果（用 three 重算一次血條填色） ──
{
  const S = 1.7, BARW = 6.4 * S, BARH = 0.5 * S, hp = 0.37, by = 20, ax = 12, az = -7;
  const camQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, 0.2, 0));
  //  原本：group(位置 by、朝向相機) ＞ mesh(局部位移＋縮放)
  const g = new THREE.Group(); g.position.set(ax, by, az); g.quaternion.copy(camQ);
  const mesh = new THREE.Mesh(); mesh.position.set(-(BARW / 2) * (1 - hp), 0, 0.06 * S); mesh.scale.set(BARW * hp, BARH, 1); g.add(mesh); g.updateMatrixWorld(true);
  //  現在：直接組世界矩陣
  const off = new THREE.Vector3(-(BARW / 2) * (1 - hp), 0, 0.06 * S).applyQuaternion(camQ);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(ax + off.x, by + off.y, az + off.z), camQ, new THREE.Vector3(BARW * hp, BARH, 1));
  const maxDiff = Math.max(...m.elements.map((v, i) => Math.abs(v - mesh.matrixWorld.elements[i])));
  ck("C9 血條填色的實例矩陣＝原本 group＞mesh 的世界矩陣", maxDiff < 1e-9, `最大差 ${maxDiff.toExponential(2)}`);
}

console.log(`\ncheck_moba_render_perf_p0：${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
