// ============================================================================
//  battle/moba/render/MobaRenderPrewarm.jsx — 對戰渲染的兩個「不改畫面」的效能修正（2026-11-11，Lag P0）
//
//  量測依據：review/tactic-book-3a/v22_渲染效能改善.md（tools/owner_preview/perf_draw_sources.mjs、perf_cpu_profile.mjs）。
//
//  【1】平面的半透明雙面材質改成單次繪製（forceSinglePass）
//   three 對「transparent ＋ DoubleSide ＋ forceSinglePass=false」的材質，每個物件畫**兩次**（先背面再正面），
//   而且每次都 `material.needsUpdate = true` ⇒ 每次都重算一遍著色器參數（getParameters／getProgram）。
//   量到的結果：每幀約 250 次參數重算（佔主執行緒約 14%）與約 125 個多出來的 draw call，
//   全部來自血條、地面環、接地陰影這類**平面**幾何。
//   平面只有一層，任何一個像素只會看到其中一面 ⇒ 分兩次畫與一次畫（不剔除）的結果逐像素相同。
//   ⇒ 只對「這一輪掃描中**只**用在平面幾何（Plane／Ring／Circle）上」的材質開 forceSinglePass；
//     同一個材質之後若被用到非平面幾何（那種情況兩次繪製的前後順序有意義），就還原。
//   ⚠ 不碰非平面的雙面半透明（護盾殼、光柱…）：那些的兩次繪製是正確的排序手段。
//
//  【2】著色器預熱
//   對戰中途才第一次出現的物件（開局隱藏的野怪、受擊晶片、戰鬥環、升級光環…）會在**第一次被畫的那一幀**
//   同步連結著色器 ⇒ 長幀。這裡在物件掛進場景後（即使還是隱藏的）就先請 three 建好 program
//   （renderer.compile 會走訪隱藏物件）；支援 KHR_parallel_shader_compile 的驅動會在背景連結。
//   ⚠ program 的參數與 render target 有關（色彩空間、tone mapping）。場景實際是被 EffectComposer 畫進離屏緩衝，
//     所以預熱時也暫時綁一個離屏 target，否則會編出一批用不到的變體。compile 不會畫任何東西。
//   ⚠ 涵蓋不到：執行期才換上去、當下不掛在任何物件上的材質（例如陣亡時換的半透明材質）。
//
//  ⚠ 本檔不 import LogicEngine、不讀 snapshot、不寫 store；不新增／移除任何場景物件。
// ============================================================================
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const SCAN_EVERY = 20;                       // 每 20 幀掃一次場景（約 1,900 個物件，遠小於 1 ms）
const PLANAR = new Set(["PlaneGeometry", "RingGeometry", "CircleGeometry"]);
const WHOLE_SCENE_THRESHOLD = 40;            // 新物件多於這個數就整個場景一起預熱（開場）

/** 測試與診斷用：這個材質目前是否可以單次繪製（純函式）。 */
export function isSinglePassCandidate(material, geometry) {
  return !!material && material.transparent === true && material.side === THREE.DoubleSide && !!geometry && PLANAR.has(geometry.type);
}

export default function MobaRenderPrewarm() {
  const { gl, scene, camera } = useThree();
  const st = useRef(null);
  if (!st.current) st.current = { frame: 0, warmed: new WeakSet(), marked: new WeakSet(), target: null, stats: { scans: 0, compiles: 0, compiledObjects: 0, singlePassMaterials: 0, reverted: 0 } };

  useEffect(() => {
    const s = st.current;
    s.target = new THREE.WebGLRenderTarget(1, 1);
    if (typeof window !== "undefined") window.__ESMO_RENDER_PREWARM = () => ({ ...s.stats });
    return () => {
      s.target?.dispose(); s.target = null;
      if (typeof window !== "undefined") delete window.__ESMO_RENDER_PREWARM;
    };
  }, []);

  useFrame(() => {
    const s = st.current;
    if ((s.frame++ % SCAN_EVERY) !== 2 || !s.target) return;
    s.stats.scans++;
    const fresh = [];
    const planarOnly = new Set(), nonPlanar = new Set();
    scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      if (!s.warmed.has(o)) { s.warmed.add(o); fresh.push(o); }
      const planar = !!o.geometry && PLANAR.has(o.geometry.type);
      const note = (mat) => {
        if (!mat || mat.transparent !== true) return;
        if (mat.side !== THREE.DoubleSide) return;
        (planar ? planarOnly : nonPlanar).add(mat);
      };
      if (Array.isArray(m)) m.forEach(note); else note(m);
    });
    //  【1】只用在平面上的 ⇒ 單次繪製；被用到非平面上的 ⇒ 還原我們自己開過的。
    for (const mat of planarOnly) {
      if (nonPlanar.has(mat)) continue;
      if (mat.forceSinglePass !== true) { mat.forceSinglePass = true; s.marked.add(mat); s.stats.singlePassMaterials++; }
    }
    for (const mat of nonPlanar) {
      if (s.marked.has(mat) && mat.forceSinglePass === true) { mat.forceSinglePass = false; s.marked.delete(mat); s.stats.reverted++; }
    }
    //  【2】新掛進來的物件 ⇒ 先建 program。
    if (!fresh.length) return;
    const prevTarget = gl.getRenderTarget();
    try {
      gl.setRenderTarget(s.target);
      if (fresh.length > WHOLE_SCENE_THRESHOLD) gl.compile(scene, camera);
      else for (const o of fresh) gl.compile(o, camera, scene);
      s.stats.compiles++; s.stats.compiledObjects += fresh.length;
    } catch (err) {
      //  預熱失敗不影響畫面（物件第一次被畫時仍會照常編譯）；留下紀錄供診斷。
      s.stats.lastError = String(err?.message ?? err);
    } finally {
      gl.setRenderTarget(prevTarget);
    }
  });
  return null;
}
