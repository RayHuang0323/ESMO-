// ============================================================================
//  battle/ui/BattleCameraController.jsx — 戰鬥鏡頭跟隨（R3F，放進 <Canvas>）
//  - 不改 Three.js 架構：只在 useFrame 平滑插值 OrbitControls.target 與 zoom
//  - 焦點來自 battleFocus.computeFocus(snapshot)（純呈現層推導，不動引擎）
//  - follow=false 時完全不介入（維持原本 autoRotate/自由檢視行為）
//  掛法：在 MobaView3D 的 <OrbitControls makeDefault .../> 之後加 <BattleCameraController follow/>
//        跟隨啟用時建議把 OrbitControls 的 autoRotate 關掉。
// ============================================================================

import { useThree, useFrame } from "@react-three/fiber";
import { useGameStore } from "../../useGameStore.js";
import { computeSpectatorFocus } from "../battleFocus.js";
import { useBattleStore } from "../battleStore.js";

const S = 1.7;                              // 與 MobaView3D 世界尺度一致
const wx = (x) => (x - 50) * S, wz = (y) => (y - 50) * S;
const lerp = (a, b, t) => a + (b - a) * t;

export default function BattleCameraController({
  follow = true,
  posLerp = 0.05,      // target 跟隨柔順度（越小越穩）
  baseZoom = 3.4,      // 未交戰基準 zoom（對齊 MobaView3D 預設）
  fightZoom = 4.6,     // 高強度交戰時拉近
  zoomLerp = 0.04,
}) {
  const controls = useThree((s) => s.controls);
  const camera = useThree((s) => s.camera);

  useFrame(() => {
    if (!follow || !controls) return;
    const snap = useGameStore.getState().snapshot;
    if (!snap?.players?.length) return;
    // Sprint07 導播：VICTORY鎖主堡 > ACE/連殺 > 推塔/龍/巴龍事件 > 交戰聚類 > 重心
    const f = computeSpectatorFocus(snap, useBattleStore.getState().events);
    const tx = wx(f.x), tz = wz(f.y);

    controls.target.x = lerp(controls.target.x, tx, posLerp);
    controls.target.z = lerp(controls.target.z, tz, posLerp);
    controls.target.y = lerp(controls.target.y, 0, posLerp);

    // 正交相機用 zoom（非位移）拉近；強度越高越近
    if (camera.isOrthographicCamera) {
      const wantZoom = lerp(baseZoom, fightZoom, f.intensity);
      camera.zoom = lerp(camera.zoom, wantZoom, zoomLerp);
      camera.updateProjectionMatrix();
    }
    controls.update();
  });

  return null;
}
