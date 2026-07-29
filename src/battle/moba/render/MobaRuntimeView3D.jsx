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
import MobaRuntimeMinions from "./MobaRuntimeMinions.jsx";
import MobaRuntimeEffects from "./MobaRuntimeEffects.jsx";
import MobaRuntimeNeutrals from "./MobaRuntimeNeutrals.jsx";
import BattleCameraController from "../../ui/BattleCameraController.jsx";
import { useCameraStore } from "../../cameraStore.js";
import { blendRuntimePosition } from "./runtimeMovementPolicy.js";
import RuntimeDeviceDiagnosticsPanel from "./RuntimeDeviceDiagnosticsPanel.jsx";
import { adaptRuntimeMapFrame } from "../map/mobaRuntimeMapAdapter.js";
//  H.2-close：內插點的可走性檢查（純資料查表，不改模擬；見 RuntimeFrameFeeder 內註解）
import { isWalkable, HERO_RADIUS } from "../nav/mobaNavigation.js";
import {
  MAP_HALF_WORLD, MAP_CENTER_WORLD, WORLD_SCALE,
} from "../map/coordinateMapping.js";
import { useGameStore } from "../../../useGameStore.js";
import { ease, worldX, worldZ, WORLD_BOUNDS } from "../../../gameData.js";
import { diagnosticsEnabled, installRuntimeDiagnostics, removeRuntimeDiagnostics, countMount, countUnmount } from "./runtimeDiagnostics.js";

const S = WORLD_SCALE;
const numLerp = (a, b, t) => {
  const av = Number.isFinite(a) ? a : (Number.isFinite(b) ? b : 0);
  const bv = Number.isFinite(b) ? b : av;
  return av + (bv - av) * t;
};

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
  // ── H.2-flicker：深度緩衝精度 ─────────────────────────────────────────────
  //
  //  【為什麼要改】透視深度的解析度是 Δz ≈ z²(far−near) / (far·near·2^bits)。
  //  舊值 near=1 / far=4000 在**桌機的 24-bit 深度**下 Δz≈0.0018 世界單位，
  //  分得開地面鋪層（層距 0.02–0.04）；但 Android 的 WebGL context 很常只給
  //  **16-bit 深度**，同樣設定下 Δz≈0.467 —— 比場景裡**所有**圖層間距都大
  //  ⇒ 地面鋪層、岩塊投影、選取環全部塌進同一個深度桶，逐幀在彼此之間跳
  //  ⇒ 畫面上就是「一閃一閃、瞬間消失再出現」。
  //  這也解釋了為什麼桌機怎麼看都正常、真機卻在閃：**它是精度問題，不是邏輯問題**，
  //  scene graph 的 visible / key / mount 全部正常也照樣會閃。
  //
  //  【新值怎麼來】
  //   near：最近可見幾何的距離。最小縮放 distMin=90、俯角 52°、fov 45°
  //     ⇒ 視錐下緣與地面的交點距離 ≈ 90·sin52° / sin(52°+22.5°) ≈ 73；
  //       再扣掉塔冠那類高物件（世界高度約 20）仍有 ≈55 ⇒ 取 35 留 1.5× 餘裕。
  //   far：最大縮放 distMax=560 + 地圖半對角 ≈264 ⇒ ≈824 ⇒ 取 1000 留餘裕。
  //   ⇒ far/near 從 4000 降到 28.6，**16-bit 下的 Δz 從 0.467 降到 0.013**
  //     （比最小層距 0.02 小 1.5 倍以上），24-bit 下更是 5e-5。
  //
  //  ⚠ 改 distMin / distMax / pitch / fov 時要一起重算這兩個值，
  //    並用 tools/check_moba_runtime_flicker_h2.mjs 複驗（它會檢查像素振盪）。
  near: 35,
  far: 1000,
});
const RUNTIME_CAMERA = Object.freeze({
  pitchDeg: CAM.pitchDeg, yawDeg: CAM.yawDeg,
  distMin: CAM.distMin, distMax: CAM.distMax, distDefault: CAM.distDefault,
  zoomDefault: 3.4, zoomMobile: 3.05,
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
function RuntimeCameraInput({ ctrl }) {
  const { gl } = useThree();
  const state = useRef({
    drag: null,
    pinch: null,
  });

  //  對外的指令介面（回到中心 / 設定縮放 / 收全場），由父層的按鈕呼叫
  useEffect(() => {
    ctrl.current = {
      recenter() {
        useCameraStore.getState().resetView();
      },
      zoomBy(k) {
        const cam = useCameraStore.getState();
        cam.userZoomTo(cam.zoom / k);
      },
      /** 拉到剛好看得見整張地圖（驗收全場截圖用；玩家的「回到中心」不走這條）。 */
      fitAll() {
        const distance = fitDistance(gl.domElement.clientWidth / Math.max(1, gl.domElement.clientHeight));
        useCameraStore.getState().userZoomTo(
          RUNTIME_CAMERA.zoomDefault * RUNTIME_CAMERA.distDefault / distance);
      },
    };
  }, [ctrl, gl]);

  //  驗收探針：讓截圖工具讀得到真實相機距離、也能指定視角（只在 ?diag=1 / ?shot= 時掛）。
  useEffect(() => {
    if (!diagnosticsEnabled()) return undefined;
    window.__ESMO_RUNTIME_CAM = () => {
      const cam = useCameraStore.getState();
      return {
        dist: RUNTIME_CAMERA.distDefault * RUNTIME_CAMERA.zoomDefault / cam.zoom,
        pan: { x: worldX(cam.pan.x), z: worldZ(cam.pan.y) }, mode: cam.mode,
      };
    };
    window.__ESMO_RUNTIME_SETCAM = (o = {}) => {
      if (o.fitAll) ctrl.current?.fitAll();
      const cam = useCameraStore.getState();
      if (Number.isFinite(o.dist)) cam.userZoomTo(
        RUNTIME_CAMERA.zoomDefault * RUNTIME_CAMERA.distDefault / o.dist);
      if (Number.isFinite(o.panX) || Number.isFinite(o.panZ)) {
        cam.userPanTo(
          Number.isFinite(o.panX) ? o.panX / S + WORLD_BOUNDS.centerX : cam.pan.x,
          Number.isFinite(o.panZ) ? o.panZ / S + WORLD_BOUNDS.centerY : cam.pan.y);
      }
      return window.__ESMO_RUNTIME_CAM();
    };
    return () => { delete window.__ESMO_RUNTIME_CAM; delete window.__ESMO_RUNTIME_SETCAM; };
  }, [ctrl]);

  useEffect(() => {
    const el = gl.domElement;
    const st = state.current;
    const pos = (e) => ({ x: e.clientX, y: e.clientY });
      const onDown = (e) => {
      if (e.pointerType === "touch" && e.isPrimary === false) return;
      const cam = useCameraStore.getState();
      st.drag = { ...pos(e), panX: cam.pan.x, panY: cam.pan.y, id: e.pointerId };
      el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!st.drag || e.pointerId !== st.drag.id) return;
      //  螢幕像素 → 世界位移：距離愈遠，同樣的拖曳距離要移動愈多世界單位
      const cam = useCameraStore.getState();
      const distance = RUNTIME_CAMERA.distDefault * RUNTIME_CAMERA.zoomDefault / cam.zoom;
      const k = (distance / el.clientHeight) * 1.6 / S;
      cam.userPanTo(st.drag.panX - (e.clientX - st.drag.x) * k,
        st.drag.panY - (e.clientY - st.drag.y) * k);
    };
    const onUp = (e) => {
      if (st.drag && e.pointerId === st.drag.id) st.drag = null;
      el.releasePointerCapture?.(e.pointerId);
    };
    const onWheel = (e) => {
      e.preventDefault();
      const cam = useCameraStore.getState();
      cam.userZoomTo(cam.zoom / (1 + Math.sign(e.deltaY) * 0.12));
    };
    //  手機雙指縮放
    const touches = new Map();
    const onTouchStart = (e) => {
      for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        st.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: useCameraStore.getState().zoom };
        st.drag = null;
      }
    };
    const onTouchMove = (e) => {
      for (const t of e.changedTouches) if (touches.has(t.identifier)) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (st.pinch && touches.size === 2) {
        e.preventDefault();
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        useCameraStore.getState().userZoomTo(st.pinch.zoom * d / Math.max(1, st.pinch.d));
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

  return null;
}

/**
 * 每幀把 store 的 prev→snapshot 內插結果餵給 Adapter。
 * ⚠ 內插只做位置；hp / alive / 等級一律用最新 snapshot 的值（不內插狀態）。
 */
function RuntimeFrameFeeder({ frameRef, onShapeChange, lockHeroId, lockTarget, source, roster }) {
  //  source 缺省 = 現場對戰的 useGameStore；Replay 傳入 replayPresentationSource，
  //  兩者都只需要 getState() → { prev, snapshot, subTRef } ⇒ **同一條 Adapter 路徑**，
  //  不會出現第二套座標轉換。
  const store = source ?? useGameStore;
  const sigRef = useRef("");
  //  H.2-flicker：每名英雄「上一幀實際畫出來的位置」。內插點落在不可走區時退回它，
  //  才不會在畫面上前後跳（見下方 lerpAt 的說明）。
  const lastRendered = useRef(new Map());
  useFrame(() => {
    window.__ESMO_RUNTIME_TICK?.();
    const s = store.getState();
    const a = ease(Math.min(1, Math.max(0, s.subTRef.current ?? 0)));
    const prev = s.prev, snap = s.snapshot;
    if (!snap) return;
    //  以最新 snapshot 為主體，位置用 prev→snap 內插
    //
    //  ⚠ H.2-close：內插點必須落在**可走區**。引擎的每一個 tick 位置都是合法的
    //  （H.2 的碰撞保證），但 prev→snap 之間拉直線會**切過牆角**——實測真實 Chrome
    //  抓到 20 次內插點的淨距 < 英雄半徑（最壞 0，也就是整個人在牆體裡），
    //  畫面上就是英雄轉彎時身體啃進岩壁。這是**呈現層**的缺陷，不是碰撞算錯：
    //  同一場在 Node 端逐 tick 掃描引擎座標是 0 違規。
    //  修法：內插點不可走時，沿 prev→snap 往回退（0.75/0.5/0.25/0），取第一個可走的。
    //  a=0 就是 prev，本身一定合法 ⇒ 一定收斂，且永遠不會退到 prev 之前（不倒退走）。
    const prevById = new Map((prev?.players ?? []).map((p) => [p.id, p]));
    const blended = {
      ...snap,
      ts: numLerp(prev?.ts, snap.ts, a),
      players: (snap.players ?? []).map((p) => {
        const q = prevById.get(p.id);
        if (!q) return p;
        const lerpAt = (t) => ({ x: q.pos.x + (p.pos.x - q.pos.x) * t, y: q.pos.y + (p.pos.y - q.pos.y) * t });
        // Milestone B.3：復活／回城／Flash 是離散轉場，不能被 renderer 當作一般步行
        // 線性掃過整段距離，否則視覺上會出現「某位英雄突然暴衝」的假性移速差。
        const movement = blendRuntimePosition(q, p, a, prev?.ts, snap.ts);
        let pos = movement.pos;
        if (!isWalkable(pos.x, pos.y, HERO_RADIUS, null)) {
          let okPos = null;
          //  往回退找一個仍在可走區、且**不超過**目前進度的點。
          if (!movement.transition.snap) {
            for (const k of [0.75, 0.5, 0.25]) {
              const c = lerpAt(a * k);
              if (isWalkable(c.x, c.y, HERO_RADIUS, null)) { okPos = c; break; }
            }
          }
          //  ── H.2-flicker：退路是「**維持上一幀畫過的位置**」，不是跳到 snap ──
          //  ⚠ 這裡原本退到最新 snapshot 的位置，也就是這段內插的**終點**。
          //  a 逐幀由 0 增到 1，只要中段有一小截落在不可走區，那幾幀就會被丟到終點、
          //  下一幀又回到中途 ⇒ 位置序列變成「前進 → 跳到終點 → 退回」的來回跳，
          //  肉眼看起來就是英雄在抖／閃。實測（靜止相機逐幀像素比對）殘留的振盪像素
          //  幾乎全部集中在移動中的英雄身上，正是這個。
          //  改成維持上一幀之後位置保持單調；而且上一幀本來就通過過可走判定
          //  ⇒ 仍然不會穿牆。
          const held = lastRendered.current.get(p.id);
          pos = okPos ?? held ?? { x: p.pos.x, y: p.pos.y };
        }
        lastRendered.current.set(p.id, { x: pos.x, y: pos.y });
        //  ⚠ 驗收用：把**未內插的引擎座標**一併帶著（只有開診斷時才會被讀）。
        //  H.2-close 需要分辨「碰撞算錯」與「內插切到牆角」——兩者在畫面上長得一樣，
        //  但修的地方完全不同。沒有這個欄位就只能猜。
        return { ...p, pos, rawPos: { x: p.pos.x, y: p.pos.y } };
      }),
    };
    const frame = adaptRuntimeMapFrame(blended, {
      prev, roster: roster ?? s.roster, interpolation: a,
      // live 的 fx 已在最新 snapshot 發生，立即顯示；Replay 的下一 frame 包含
      // 整個 2s 取樣窗事件，必須跟插值時間走，不能提早洩漏。
      effectTime: source ? blended.ts : snap.ts,
    });
    //  ⚠ 位置每幀都會變，但**掛載結構**（有哪些英雄／塔、誰死了、幾級）很少變。
    //    位置走 frameRef（不觸發 React），只有結構變了才 setState 重掛
    //    ⇒ 10 名英雄移動不會每幀重建整張地圖。
    frameRef.current = frame;
    const sig = `${frame.heroes.map((h) => {
      const timed = [...(h.buffs ?? []), ...(h.statusEffects ?? [])]
        .map((b) => `${b.id}:${Math.ceil(b.remaining ?? 0)}`).join(",");
      return `${h.id}${h.alive ? 1 : 0}${h.level}[${timed}]`;
    }).join("|")}#`
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

function RuntimeDiagnosticsBridge({ frameRef }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    if (!diagnosticsEnabled()) return undefined;
    // Canvas.onCreated 只保證建立時呼叫一次；React StrictMode 會額外跑一次
    // effect cleanup。把 install/remove 放在同一個 effect，第二次掛載才會重裝，
    // 避免面板還在但 __ESMO_RUNTIME_DIAG 已被第一次 cleanup 刪除。
    installRuntimeDiagnostics({ gl, scene, camera, frameRef });
    return () => removeRuntimeDiagnostics();
  }, [gl, scene, camera, frameRef]);
  return null;
}

/**
 * 正式 Runtime 3D 畫面。
 * @param quality "high" | "mid" | "low"
 * @param lockHeroId 鎖定的英雄 id（null = 自由相機）
 */
export default function MobaRuntimeView3D({ quality = "high", lockHeroId = null, onRecenterRef, source = null, roster = null }) {
  const { towerAnchors } = useRuntimeMapData();
  //  frameRef = 每幀更新的最新資料（不觸發 React）；frame = 掛載用的結構快照
  const frameRef = useRef({ heroes: [], structures: [], objectives: [], warnings: [] });
  const [frame, setFrame] = useState(() => frameRef.current);
  const ctrl = useRef(null);
  const lockTarget = useRef(null);
  const onShapeChange = useCallback((f) => setFrame({ ...f }), []);

  useEffect(() => { if (onRecenterRef) onRecenterRef.current = () => ctrl.current?.recenter(); }, [onRecenterRef]);
  //  H.2-flicker：整個 Runtime 畫面的掛載計數（純觀測）
  useEffect(() => { countMount("view3d"); return () => countUnmount("view3d"); }, []);
  //  ⚠ battle/quality.js 的等級 id 是 low | medium | high（不是 "mid"）。
  //    原本只比對 "mid" ⇒ medium 會掉進 high 分支，手機中階畫質等於沒生效。
  const dpr = quality === "low" ? [1, 1] : (quality === "mid" || quality === "medium") ? [1, 1.5] : [1, 2];
  return (
    <>
    <Canvas
      dpr={dpr}
      gl={{ antialias: quality !== "low", powerPreference: "high-performance" }}
      camera={{ position: [0, 260, 200], fov: CAM.fov, near: CAM.near, far: CAM.far }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.1;
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
      <MobaRuntimeMinions frameRef={frameRef} />
      <MobaRuntimeNeutrals objectives={frame.objectives} frameRef={frameRef} />
      <MobaRuntimeEffects frameRef={frameRef} />
      <MobaRuntimeHeroes heroes={frame.heroes} frameRef={frameRef} showLabels={quality !== "low"} />

      <RuntimeFrameFeeder frameRef={frameRef} onShapeChange={onShapeChange} lockHeroId={lockHeroId} lockTarget={lockTarget} source={source} roster={roster} />
      <BattleCameraController source={source} perspective={RUNTIME_CAMERA} />
      <RuntimeCameraInput ctrl={ctrl} />
      <RuntimeDiagnosticsBridge frameRef={frameRef} />
    </Canvas>
    <RuntimeDeviceDiagnosticsPanel />
    </>
  );
}
