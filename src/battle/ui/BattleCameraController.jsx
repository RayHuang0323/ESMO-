// ============================================================================
//  battle/ui/BattleCameraController.jsx — 戰鬥鏡頭（R3F，放進 <Canvas>）
//
//  S29B2：視窗感知取景 fitZoomFor（真 ortho zoom，非 CSS scale）+ 焦點死區防抖。
//  S29B3：相機模式（battle/cameraStore）——
//    director（預設）/ objectiveFocus（焦點鎖坑的自動子模式）/
//    heroFocus（點英雄 4s 聚焦後自動回導播）/ free（玩家手動 pan/zoom）。
//
//  ── S29B6：本檔是相機的**唯一控制來源** ─────────────────────────────────
//  舊架構是「drei OrbitControls 持有 pan/zoom + 本控制器每幀覆寫 controls.target」
//  的雙頭馬車，且 OrbitControls 的 `enablePan` 被寫死成 debug（預設 false）
//  ⇒ 地圖不能平移、只能旋轉。29B6 移除 OrbitControls 與 CameraRig：
//    · pan/zoom 的**狀態**在 `battle/cameraStore`（clamp 於 WORLD_BOUNDS）。
//    · 手勢在 `MobaView3D`（單指拖曳 / 雙指捏合 / 滾輪）→ 寫回 cameraStore。
//    · **只有本檔**把 cameraStore 的 pan/zoom 套用到 three 相機。
//  相機為固定俯角的 2.5D 正交戰術視角：可 pan / zoom，**不旋轉**
//  （見 docs/design/MOBA_2.5D視角與資產策略.md）。
//
//  焦點來自 battleFocus.computeSpectatorFocus(snapshot)（純呈現層推導，不動引擎）。
//  任何模式、任何 pan/zoom 都不讀寫引擎 ⇒ **不可能改變模擬結果**。
// ============================================================================

import { useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useGameStore } from "../../useGameStore.js";
import { computeSpectatorFocus } from "../battleFocus.js";
import { useBattleStore } from "../battleStore.js";
import { useCameraStore, ZOOM_MIN, ZOOM_MAX } from "../cameraStore.js";
import { PITS, WORLD_BOUNDS, WORLD_SCALE, worldX, worldZ } from "../../gameData.js";

const wx = worldX, wz = worldZ;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * 2.5D 正交戰術視角的**固定**俯角方向（相機相對焦點的位移）。
 * 數值 = 29B5 之前 `<OrthographicCamera position={[55*S,78*S,78*S]}>` 對 target [0,0,0]
 * 的位移 ⇒ 移除 OrbitControls 後畫面角度**逐值不變**，只是改由本檔驅動。
 */
export const CAM_OFFSET = Object.freeze({ x: 55 * WORLD_SCALE, y: 78 * WORLD_SCALE, z: 78 * WORLD_SCALE });

/** 依視窗尺寸推導「看到 span 個世界單位寬」所需的正交 zoom（0.62 = 俯角投影係數）。 */
export function fitZoomFor(width, height, mobile) {
  const renderedSpan = Math.max(WORLD_BOUNDS.width, WORLD_BOUNDS.height) * WORLD_SCALE;
  const span = renderedSpan * (mobile ? 0.78 : 1.38); // 手機聚焦有效戰場、桌機容納全圖
  return clamp(Math.min(width / span, height / (span * 0.62)), 2.0, 9);
}

/** 把 cameraStore 的邏輯 pan + zoom 套到 three 正交相機（固定俯角、零旋轉）。 */
function applyCamera(camera, panX, panY, zoom) {
  const fx = wx(panX), fz = wz(panY);
  camera.position.set(fx + CAM_OFFSET.x, CAM_OFFSET.y, fz + CAM_OFFSET.z);
  camera.lookAt(fx, 0, fz);
  if (camera.isOrthographicCamera) {
    camera.zoom = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
    camera.updateProjectionMatrix();
  }
}

const FOCUS_DEADBAND = WORLD_BOUNDS.width * 0.027; // 約 6 邏輯單位，由 world metadata 派生

export default function BattleCameraController({
  follow = true,
  mobile = false,
  posLerp = 0.05,      // target 跟隨柔順度（越小越穩）
  zoomLerp = 0.04,
  source = null,       // S29B6：呈現資料源（預設 live useGameStore；Replay 傳唯讀 adapter）
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const lockRef = useRef(null);             // 目前鎖定的焦點（deadband 用）
  const viewRef = useRef(null);             // 相機當下實際看到的位置（平滑用）

  useFrame(() => {
    const cam = useCameraStore.getState();
    const base = fitZoomFor(size.width, size.height, mobile);
    if (!viewRef.current) viewRef.current = { x: cam.pan.x, y: cam.pan.y, zoom: base };
    const V = viewRef.current;

    // ── free：玩家手動 pan/zoom ⇒ 1:1 直接套用（不平滑，避免與手勢互相追尾）──
    if (cam.mode === "free") {
      V.x = cam.pan.x; V.y = cam.pan.y; V.zoom = cam.zoom;
      applyCamera(camera, V.x, V.y, V.zoom);
      return;
    }

    // 自動模式：先平滑，再把**螢幕上實際看到的**視野寫回 store。
    //   store.pan/zoom 因此永遠等於當下畫面 ⇒ 玩家一伸手指切進 free 時，
    //   free 直接接續同一個視野（不會跳回導播的目標點），且 free/自動共用同一份狀態。
    const glide = (tx, tz, wantZoom, pl = posLerp) => {
      V.x = lerp(V.x, tx, pl);
      V.y = lerp(V.y, tz, pl);
      V.zoom = lerp(V.zoom, wantZoom, zoomLerp);
      cam.setAutoTarget({ x: V.x, y: V.y, zoom: V.zoom });
      applyCamera(camera, V.x, V.y, V.zoom);
    };

    // ── 非跟隨（賽前待機）：世界中心 + 視窗取景（原 CameraRig 的職責）───────
    const src = source ?? useGameStore;
    const snap = src.getState().snapshot;
    if (!follow || !snap?.players?.length) {
      glide(WORLD_BOUNDS.centerX, WORLD_BOUNDS.centerY, base);
      return;
    }

    // ── heroFocus：點擊英雄 ⇒ 拉近聚焦；到期自動回導播 ─────────────────────
    if (cam.mode === "heroFocus") {
      if (performance.now() > cam.focusUntil) { cam.backToDirector(); return; }
      const hero = snap.players.find((p) => p.id === cam.heroId);
      if (!hero) { cam.backToDirector(); return; }
      glide(hero.pos.x, hero.pos.y, base * (mobile ? 2.1 : 1.85), 0.09);
      return;
    }

    // ── director / objectiveFocus ──────────────────────────────────────────
    // Sprint07 導播：VICTORY鎖主堡 > ACE/連殺 > 推塔/龍/巴龍事件 > 交戰聚類 > 重心
    // S29B6：注入 source（Replay）時**不讀 live battleStore**——重播的焦點必須完全由
    //   replay frame 推導（`computeFocus(snap)` 的交戰聚類/重心），否則會被上一場現場
    //   對戰殘留的 events 影響。replay.events 也沒有 `pos` 欄位，餵進去等於沒有作用。
    const f = computeSpectatorFocus(snap, source ? [] : useBattleStore.getState().events);
    // S29B2 防抖：焦點只在「真的移動了」才更新鎖定點
    const lock = lockRef.current;
    if (!lock || Math.hypot(f.x - lock.x, f.y - lock.y) > FOCUS_DEADBAND) {
      lockRef.current = { x: f.x, y: f.y, intensity: f.intensity };
    } else {
      lockRef.current.intensity = f.intensity;   // 強度仍即時反映（zoom 用）
    }
    const L = lockRef.current;
    // objectiveFocus = 導播的自動子模式：焦點鎖在坑上（龍/巴龍爭奪）
    const onPit = ["dragon", "baron"].some((k) => Math.hypot(L.x - PITS[k].x, L.y - PITS[k].y) < 1);
    const want = onPit ? "objectiveFocus" : "director";
    if (cam.mode !== want) cam.setMode(want);   // setMode 內建同值免重繪

    const fight = base * (mobile ? 1.8 : 1.5);
    glide(L.x, L.y, lerp(base, fight, L.intensity));
  });

  return null;
}
