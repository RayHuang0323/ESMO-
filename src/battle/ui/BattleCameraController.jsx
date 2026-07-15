// ============================================================================
//  battle/ui/BattleCameraController.jsx — 戰鬥鏡頭（R3F，放進 <Canvas>）
//  - 不改 Three.js 架構：只在 useFrame 平滑插值 OrbitControls.target 與 zoom
//  - 焦點來自 battleFocus.computeSpectatorFocus(snapshot)（純呈現層推導，不動引擎）
//
//  S29B2：視窗感知取景 fitZoomFor（真 ortho zoom，非 CSS scale）+ 焦點死區防抖。
//  S29B3：相機模式（battle/cameraStore）——
//    director（預設）/ objectiveFocus（焦點鎖坑的自動子模式）/
//    heroFocus（點英雄 4s 聚焦後自動回導播）/ free（本控制器完全不介入）。
//    任何模式都不讀寫引擎 ⇒ 不可能改變模擬結果。
// ============================================================================

import { useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useGameStore } from "../../useGameStore.js";
import { computeSpectatorFocus } from "../battleFocus.js";
import { useBattleStore } from "../battleStore.js";
import { useCameraStore } from "../cameraStore.js";
import { PITS } from "../../gameData.js";

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
    const cam = useCameraStore.getState();
    if (cam.mode === "free") return;        // 自由鏡頭：完全交給 OrbitControls
    const snap = useGameStore.getState().snapshot;
    if (!snap?.players?.length) return;

    const base = fitZoomFor(size.width, size.height, mobile);
    const glide = (tx, tz, wantZoom, pl = posLerp) => {
      controls.target.x = lerp(controls.target.x, tx, pl);
      controls.target.z = lerp(controls.target.z, tz, pl);
      controls.target.y = lerp(controls.target.y, 0, pl);
      if (camera.isOrthographicCamera) {
        camera.zoom = lerp(camera.zoom, wantZoom, zoomLerp);
        camera.updateProjectionMatrix();
      }
      controls.update();
    };

    // ── heroFocus：點擊英雄 ⇒ 拉近聚焦；到期自動回導播 ─────────────────────
    if (cam.mode === "heroFocus") {
      if (performance.now() > cam.focusUntil) { cam.backToDirector(); return; }
      const hero = snap.players.find((p) => p.id === cam.heroId);
      if (!hero) { cam.backToDirector(); return; }
      glide(wx(hero.pos.x), wz(hero.pos.y), base * (mobile ? 2.1 : 1.85), 0.09);
      return;
    }

    // ── director / objectiveFocus ──────────────────────────────────────────
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
    // objectiveFocus = 導播的自動子模式：焦點鎖在坑上（龍/巴龍爭奪）
    const onPit = ["dragon", "baron"].some((k) => Math.hypot(L.x - PITS[k].x, L.y - PITS[k].y) < 1);
    const want = onPit ? "objectiveFocus" : "director";
    if (cam.mode !== want) cam.setMode(want);   // setMode 內建同值免重繪

    const fight = base * (mobile ? 1.8 : 1.5);
    glide(wx(L.x), wz(L.y), lerp(base, fight, L.intensity));
  });

  return null;
}