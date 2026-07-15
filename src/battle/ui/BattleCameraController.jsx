// ============================================================================
//  battle/ui/BattleCameraController.jsx — 戰鬥鏡頭跟隨（R3F，放進 <Canvas>）
//  - 不改 Three.js 架構：只在 useFrame 平滑插值 OrbitControls.target 與 zoom
//  - 焦點來自 battleFocus.computeSpectatorFocus(snapshot)（純呈現層推導，不動引擎）
//  - follow=false 時完全不介入（維持原本 autoRotate/自由檢視行為）
//
//  S29B2（Map Scale / 防抖）：
//  - **視窗感知取景**：base/fight zoom 不再寫死 3.4/4.6，改由視窗尺寸推導
//    （fitZoomFor）：桌機讓地圖佔滿主要可視區、手機預設聚焦有效戰場。
//    是真正的相機取景（ortho zoom），不是 CSS scale。
//  - **焦點死區（deadband）**：新焦點與目前鎖定點距離 < FOCUS_DEADBAND 時不移動
//    ⇒ 交戰聚類逐幀微幅漂移不再造成高頻抖動；焦點真的轉移才追過去。
// ============================================================================

import { useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useGameStore } from "../../useGameStore.js";
import { computeSpectatorFocus } from "../battleFocus.js";
import { useBattleStore } from "../battleStore.js";

const S = 1.7;                              // 與 MobaView3D 世界尺度一致
const wx = (x) => (x - 50) * S, wz = (y) => (y - 50) * S;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 依視窗尺寸推導「看到 span 個世界單位寬」所需的正交 zoom（0.62 = 俯角投影係數）。 */
export function fitZoomFor(width, height, mobile) {
  const span = mobile ? 132 : 235;          // 手機聚焦有效戰場、桌機容納全圖
  return clamp(Math.min(width / span, height / (span * 0.62)), 2.0, 9);
}

const FOCUS_DEADBAND = 6;                   // 邏輯座標單位；小於此距離的焦點漂移不追

export default function BattleCameraController({
  follow = true,
  mobile = false,
  posLerp = 0.05,      // target 跟隨柔順度（越小越穩）
  zoomLerp = 0.04,
}) {
  const controls = useThree((s) => s.controls);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const lockRef = useRef(null);             // 目前鎖定的焦點（deadband 用）

  useFrame(() => {
    if (!follow || !controls) return;
    const snap = useGameStore.getState().snapshot;
    if (!snap?.players?.length) return;
    // Sprint07 導播：VICTORY鎖主堡 > ACE/連殺 > 推塔/龍/巴龍事件 > 交戰聚類 > 重心
    const f = computeSpectatorFocus(snap, useBattleStore.getState().events);
    // S29B2 防抖：焦點只在「真的移動了」才更新鎖定點
    const lock = lockRef.current;
    if (!lock || Math.hypot(f.x - lock.x, f.y - lock.y) > FOCUS_DEADBAND) {
      lockRef.current = { x: f.x, y: f.y, intensity: f.intensity };
    } else {
      lockRef.current.intensity = f.intensity;   // 強度仍即時反映（zoom 用）
    }
    const L = lockRef.current;
    const tx = wx(L.x), tz = wz(L.y);

    controls.target.x = lerp(controls.target.x, tx, posLerp);
    controls.target.z = lerp(controls.target.z, tz, posLerp);
    controls.target.y = lerp(controls.target.y, 0, posLerp);

    // 正交相機用 zoom（非位移）拉近；base/fight 由視窗尺寸推導（S29B2）
    if (camera.isOrthographicCamera) {
      const base = fitZoomFor(size.width, size.height, mobile);
      const fight = base * (mobile ? 1.8 : 1.5);
      const wantZoom = lerp(base, fight, L.intensity);
      camera.zoom = lerp(camera.zoom, wantZoom, zoomLerp);
      camera.updateProjectionMatrix();
    }
    controls.update();
  });

  return null;
}