// ============================================================================
//  battle/moba/render/MobaRuntimeView3D.jsx — 正式戰鬥的新地圖畫面（Milestone H.1）
//
//  【資料流】只有一個方向，而且只有一個引擎：
//     useLocalServer → LogicEngine.tick() → useGameStore(prev, snapshot, subTRef)
//        → adaptRuntimeMapFrame()（Runtime Adapter）
//           → MobaRuntimeMap（地形）/ MobaRuntimeHeroes（英雄）/ MobaRuntimeStructures（塔）
//   本檔**不** import LogicEngine、不 tick、不寫回 store。
//   legacy 的 MobaView3D 一行未改，兩個 presentation mode 讀的是**同一份** store。
//
//  【與 Debug 頁的差異】本檔不含任何 debug UI（圖層鈕 / 可走性線 / 座標標記 /
//   鏡射檢查面板 / 測試圓圈）。Debug 頁仍在 ?debug=moba-map-blockout。
//
//  【內插】snapshot 每秒只推 2–8 幀，直接跳位會頓。與 legacy 同樣的作法：
//   在 prev → snapshot 之間用 subTRef 做子幀內插，內插只影響**畫面**，
//   不會回寫任何模擬狀態。
// ============================================================================
import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import MobaRuntimeMap, { useRuntimeMapData } from "../map/MobaRuntimeMap.jsx";
import MobaRuntimeHeroes from "./MobaRuntimeHeroes.jsx";
import MobaRuntimeStructures from "./MobaRuntimeStructures.jsx";
import { adaptRuntimeMapFrame } from "../map/mobaRuntimeMapAdapter.js";
import {
  MAP_HALF_WORLD, MAP_CENTER_WORLD, WORLD_SCALE,
} from "../map/coordinateMapping.js";
import { useGameStore } from "../../../useGameStore.js";
import { ease } from "../../../gameData.js";
import { diagnosticsEnabled, installRuntimeDiagnostics, removeRuntimeDiagnostics } from "./runtimeDiagnostics.js";

const S = WORLD_SCALE;

//  MOBA 標準斜俯視：相機在目標的後上方，俯角固定，縮放改變距離。
const CAM = Object.freeze({
  pitchDeg: 52,        // 俯角（0 = 平視、90 = 正俯視）
  yawDeg: 0,           // 朝向（0 = 從 +Z 看向 −Z，與地圖上下一致）
  distMin: 90,
  //  H.1-close：舊上限 420 在 16:10 視窗剛好**看不完整張地圖**（實測全圖需 ~390，
  //  但 pitch 壓縮與 HUD 邊界一吃就爆）⇒ 放寬到 560，讓「拉遠看全場」真的做得到。
  //  只是把可縮放範圍變大，不改預設值 ⇒ 一般對戰手感不變。
  distMax: 560,
  distDefault: 175,
  fov: 45,
});

/**
 * 要把整張地圖收進畫面所需的相機距離。
 * 地面在視線方向被 pitch 壓縮（垂直方向乘 sin(pitch)），所以垂直與水平要分開算，取大的。
 * @param aspect 視窗寬高比
 */
function fitDistance(aspect) {
  const halfTan = Math.tan((CAM.fov * Math.PI) / 180 / 2);
  const pitch = (CAM.pitchDeg * Math.PI) / 180;
  const needV = (MAP_HALF_WORLD.z * Math.sin(pitch)) / halfTan;
  const needH = MAP_HALF_WORLD.x / (halfTan * Math.max(0.2, aspect));
  return Math.min(CAM.distMax, Math.max(CAM.distMin, Math.max(needV, needH) * 1.06));
}

/** 相機距離 → 平移邊界（拉遠時可平移的範圍小一些，避免看到地圖外）。 */
const panLimit = (dist) => ({
  x: Math.max(0, MAP_HALF_WORLD.x - dist * 0.28),
  z: Math.max(0, MAP_HALF_WORLD.z - dist * 0.28),
});

/**
 * 相機控制：拖曳平移、滾輪縮放、手機單指拖曳 / 雙指縮放、邊界限制、
 * 回到中心、鎖定英雄。**不寫回 snapshot**，相機狀態只活在本元件。
 */
function RuntimeCamera({ ctrl, lockTarget }) {
  const { camera, gl } = useThree();
  const state = useRef({
    pan: { x: MAP_CENTER_WORLD.x, z: MAP_CENTER_WORLD.z },
    dist: CAM.distDefault,
    drag: null,
    pinch: null,
  });

  //  對外的指令介面（回到中心 / 設定縮放 / 收全場），由父層的按鈕呼叫
  useEffect(() => {
    ctrl.current = {
      recenter() {
        state.current.pan.x = MAP_CENTER_WORLD.x;
        state.current.pan.z = MAP_CENTER_WORLD.z;
        state.current.dist = CAM.distDefault;
      },
      zoomBy(k) {
        state.current.dist = Math.min(CAM.distMax, Math.max(CAM.distMin, state.current.dist * k));
      },
      /** 拉到剛好看得見整張地圖（驗收全場截圖用；玩家的「回到中心」不走這條）。 */
      fitAll() {
        state.current.pan.x = MAP_CENTER_WORLD.x;
        state.current.pan.z = MAP_CENTER_WORLD.z;
        state.current.dist = fitDistance(gl.domElement.clientWidth / Math.max(1, gl.domElement.clientHeight));
      },
    };
  }, [ctrl, gl]);

  //  驗收探針：讓截圖工具讀得到真實相機距離、也能指定視角（只在 ?diag=1 / ?shot= 時掛）。
  useEffect(() => {
    if (!diagnosticsEnabled()) return undefined;
    window.__ESMO_RUNTIME_CAM = () => ({ dist: state.current.dist, pan: { ...state.current.pan } });
    window.__ESMO_RUNTIME_SETCAM = (o = {}) => {
      const st = state.current;
      if (Number.isFinite(o.dist)) st.dist = Math.min(CAM.distMax, Math.max(CAM.distMin, o.dist));
      if (o.fitAll) ctrl.current?.fitAll();
      //  ⚠ 平移一律套用**和玩家拖曳完全相同**的邊界（panLimit）。
      //  不套的話截圖工具可以把鏡頭推到地圖外，拍出「畫面一半是空的」而且
      //  玩家自己根本到不了的構圖 ⇒ 那種截圖不能當驗收證據。
      const lim = panLimit(st.dist);
      if (Number.isFinite(o.panX)) st.pan.x = Math.min(lim.x, Math.max(-lim.x, o.panX));
      if (Number.isFinite(o.panZ)) st.pan.z = Math.min(lim.z, Math.max(-lim.z, o.panZ));
      return { dist: st.dist, pan: { ...st.pan }, panLimit: lim };
    };
    return () => { delete window.__ESMO_RUNTIME_CAM; delete window.__ESMO_RUNTIME_SETCAM; };
  }, [ctrl]);

  useEffect(() => {
    const el = gl.domElement;
    const st = state.current;
    const pos = (e) => ({ x: e.clientX, y: e.clientY });
    const onDown = (e) => {
      if (e.pointerType === "touch" && e.isPrimary === false) return;
      st.drag = { ...pos(e), panX: st.pan.x, panZ: st.pan.z, id: e.pointerId };
      el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!st.drag || e.pointerId !== st.drag.id) return;
      //  螢幕像素 → 世界位移：距離愈遠，同樣的拖曳距離要移動愈多世界單位
      const k = (st.dist / el.clientHeight) * 1.6;
      const nx = st.drag.panX - (e.clientX - st.drag.x) * k;
      const nz = st.drag.panZ - (e.clientY - st.drag.y) * k;
      const lim = panLimit(st.dist);
      st.pan.x = Math.min(lim.x, Math.max(-lim.x, nx));
      st.pan.z = Math.min(lim.z, Math.max(-lim.z, nz));
    };
    const onUp = (e) => {
      if (st.drag && e.pointerId === st.drag.id) st.drag = null;
      el.releasePointerCapture?.(e.pointerId);
    };
    const onWheel = (e) => {
      e.preventDefault();
      st.dist = Math.min(CAM.distMax, Math.max(CAM.distMin, st.dist * (1 + Math.sign(e.deltaY) * 0.12)));
    };
    //  手機雙指縮放
    const touches = new Map();
    const onTouchStart = (e) => {
      for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        st.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: st.dist };
        st.drag = null;
      }
    };
    const onTouchMove = (e) => {
      for (const t of e.changedTouches) if (touches.has(t.identifier)) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (st.pinch && touches.size === 2) {
        e.preventDefault();
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        st.dist = Math.min(CAM.distMax, Math.max(CAM.distMin, st.pinch.dist * (st.pinch.d / Math.max(1, d))));
      }
    };
    const onTouchEnd = (e) => {
      for (const t of e.changedTouches) touches.delete(t.identifier);
      if (touches.size < 2) st.pinch = null;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [gl]);

  useFrame(() => {
    const st = state.current;
    //  鎖定英雄：把 pan 平滑拉到該英雄身上（使用者一拖曳就會被 onMove 覆蓋）
    if (lockTarget && lockTarget.current) {
      const t = lockTarget.current;
      st.pan.x += (t.x - st.pan.x) * 0.12;
      st.pan.z += (t.z - st.pan.z) * 0.12;
    }
    const pitch = (CAM.pitchDeg * Math.PI) / 180;
    const yaw = (CAM.yawDeg * Math.PI) / 180;
    const h = Math.sin(pitch) * st.dist;
    const back = Math.cos(pitch) * st.dist;
    camera.position.set(st.pan.x - Math.sin(yaw) * back, h, st.pan.z + Math.cos(yaw) * back);
    camera.lookAt(st.pan.x, 0, st.pan.z);
    camera.fov = CAM.fov;
    camera.near = 1; camera.far = 4000;
    camera.updateProjectionMatrix();
  });
  return null;
}

/**
 * 每幀把 store 的 prev→snapshot 內插結果餵給 Adapter。
 * ⚠ 內插只做位置；hp / alive / 等級一律用最新 snapshot 的值（不內插狀態）。
 */
function RuntimeFrameFeeder({ frameRef, onShapeChange, lockHeroId, lockTarget, source }) {
  //  source 缺省 = 現場對戰的 useGameStore；Replay 傳入 replayPresentationSource，
  //  兩者都只需要 getState() → { prev, snapshot, subTRef } ⇒ **同一條 Adapter 路徑**，
  //  不會出現第二套座標轉換。
  const store = source ?? useGameStore;
  const sigRef = useRef("");
  useFrame(() => {
    window.__ESMO_RUNTIME_TICK?.();
    const s = store.getState();
    const a = ease(Math.min(1, Math.max(0, s.subTRef.current ?? 0)));
    const prev = s.prev, snap = s.snapshot;
    if (!snap) return;
    //  以最新 snapshot 為主體，位置用 prev→snap 內插
    const prevById = new Map((prev?.players ?? []).map((p) => [p.id, p]));
    const blended = {
      ...snap,
      players: (snap.players ?? []).map((p) => {
        const q = prevById.get(p.id);
        if (!q) return p;
        return { ...p, pos: { x: q.pos.x + (p.pos.x - q.pos.x) * a, y: q.pos.y + (p.pos.y - q.pos.y) * a } };
      }),
    };
    const frame = adaptRuntimeMapFrame(blended, { prev, roster: s.roster });
    //  ⚠ 位置每幀都會變，但**掛載結構**（有哪些英雄／塔、誰死了、幾級）很少變。
    //    位置走 frameRef（不觸發 React），只有結構變了才 setState 重掛
    //    ⇒ 10 名英雄移動不會每幀重建整張地圖。
    frameRef.current = frame;
    const sig = `${frame.heroes.map((h) => `${h.id}${h.alive ? 1 : 0}${h.level}`).join("|")}#`
      + `${frame.structures.map((t) => `${t.id}${t.alive ? 1 : 0}`).join("|")}#`
      + `${frame.objectives.map((o) => `${o.id}${o.alive ? 1 : 0}`).join("|")}`;
    if (sig !== sigRef.current) { sigRef.current = sig; onShapeChange(frame); }
    if (lockHeroId && lockTarget) {
      const h = frame.heroes.find((x) => x.id === lockHeroId);
      lockTarget.current = h ? { x: h.world.x, z: h.world.z } : null;
    } else if (lockTarget) lockTarget.current = null;
  });
  return null;
}

/**
 * 正式 Runtime 3D 畫面。
 * @param quality "high" | "mid" | "low"
 * @param lockHeroId 鎖定的英雄 id（null = 自由相機）
 */
export default function MobaRuntimeView3D({ quality = "high", lockHeroId = null, onRecenterRef, source = null }) {
  const { towerAnchors } = useRuntimeMapData();
  //  frameRef = 每幀更新的最新資料（不觸發 React）；frame = 掛載用的結構快照
  const frameRef = useRef({ heroes: [], structures: [], objectives: [], warnings: [] });
  const [frame, setFrame] = useState(() => frameRef.current);
  const ctrl = useRef(null);
  const lockTarget = useRef(null);
  const onShapeChange = useCallback((f) => setFrame({ ...f }), []);

  useEffect(() => { if (onRecenterRef) onRecenterRef.current = () => ctrl.current?.recenter(); }, [onRecenterRef]);
  //  驗收探針只在截圖 / 除錯網址掛載；卸載時一併清乾淨（HMR 不留失效閉包）。
  useEffect(() => () => { if (diagnosticsEnabled()) removeRuntimeDiagnostics(); }, []);

  //  ⚠ battle/quality.js 的等級 id 是 low | medium | high（不是 "mid"）。
  //    原本只比對 "mid" ⇒ medium 會掉進 high 分支，手機中階畫質等於沒生效。
  const dpr = quality === "low" ? [1, 1] : (quality === "mid" || quality === "medium") ? [1, 1.5] : [1, 2];
  return (
    <Canvas
      dpr={dpr}
      gl={{ antialias: quality !== "low", powerPreference: "high-performance" }}
      camera={{ position: [0, 260, 200], fov: CAM.fov, near: 1, far: 4000 }}
      onCreated={({ gl, scene, camera }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.1;
        if (diagnosticsEnabled()) installRuntimeDiagnostics({ gl, scene, camera, frameRef });
      }}
    >
      <color attach="background" args={[0x0e141c]} />
      <hemisphereLight args={[0xb6cbe2, 0x33391f, 0.85]} />
      <ambientLight intensity={0.22} color={0xfff1dd} />
      <directionalLight position={[-180, 330, 220]} intensity={2.2} color={0xfff0cc} />
      <directionalLight position={[210, 180, -160]} intensity={0.5} color={0x9fc4e8} />

      <MobaRuntimeMap quality={quality} />
      <MobaRuntimeStructures
        structures={frame.structures}
        objectives={frame.objectives}
        towerAnchors={towerAnchors}
        frameRef={frameRef}
      />
      <MobaRuntimeHeroes heroes={frame.heroes} frameRef={frameRef} showLabels={quality !== "low"} />

      <RuntimeFrameFeeder frameRef={frameRef} onShapeChange={onShapeChange} lockHeroId={lockHeroId} lockTarget={lockTarget} source={source} />
      <RuntimeCamera ctrl={ctrl} lockTarget={lockHeroId ? lockTarget : null} />
    </Canvas>
  );
}
