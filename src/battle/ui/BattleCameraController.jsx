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
function applyCamera(camera, panX, panY, zoom, perspective = null, pitchOffset = 0) {
  const fx = wx(panX), fz = wz(panY);
  if (perspective) {
    const pitch = ((perspective.pitchDeg + pitchOffset) * Math.PI) / 180;
    const yaw = (perspective.yawDeg * Math.PI) / 180;
    const distance = camera.isOrthographicCamera ? 700 : clamp(perspective.distDefault * (perspective.zoomDefault / zoom),
      perspective.distMin, perspective.distMax);
    const h = Math.sin(pitch) * distance;
    const back = Math.cos(pitch) * distance;
    camera.position.set(fx - Math.sin(yaw) * back, h, fz + Math.cos(yaw) * back);
  } else {
    camera.position.set(fx + CAM_OFFSET.x, CAM_OFFSET.y, fz + CAM_OFFSET.z);
  }
  camera.lookAt(fx, 0, fz);
  if (camera.isOrthographicCamera) {
    camera.zoom = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
    camera.updateProjectionMatrix();
  }
}

const FOCUS_DEADBAND = WORLD_BOUNDS.width * 0.027; // 約 6 邏輯單位，由 world metadata 派生

// ── feature/moba-spectacle-vision：導播節拍（auto shot）──────────────────────
//  zoom 倍率是相對「視窗取景 base」；pitch 是相對既有俯角的偏移（度，負值＝壓低、更有臨場感）。
//  ⚠ 防暈眩：節拍至少停留 BEAT_DWELL **真實**秒才可以換（擊殺特寫 PUNCH_DWELL）——用真實時間而不是模擬時間，
//    否則 4× 播放時 3.2 模擬秒只剩 0.8 真實秒；zoom／pitch 都慢速插值；
//    yaw 永遠不動（2.5D 戰術視角不旋轉）。
export const BEAT_SHOT = Object.freeze({
  punch: { zoom: 1.85, pitch: -9 }, fight: { zoom: 1.45, pitch: -5 }, skirmish: { zoom: 1.22, pitch: -2 },
  objective: { zoom: 1.12, pitch: -3 }, roam: { zoom: 0.92, pitch: 0 },
});
const STATIC_SHOT = Object.freeze({ close: { zoom: 1.8, pitch: -9 }, wide: { zoom: 0.68, pitch: 3 } });
const BEAT_DWELL = 3.2, PUNCH_DWELL = 1.5, PUNCH_WINDOW = 2.5;
const KILL_EVENTS = new Set(["KILL", "FIRST_BLOOD", "MULTI_KILL", "ACE"]);

/** 依目前資料決定節拍（純函式；events 依時間排序）。 */
export function beatFor(snapTs, focus, events, onPit) {
  for (let i = (events?.length ?? 0) - 1; i >= 0; i--) {
    const ev = events[i];
    if (snapTs - ev.t > PUNCH_WINDOW) break;
    if (KILL_EVENTS.has(ev.type)) return "punch";
  }
  if (onPit && focus.intensity > 0.25) return "objective";
  if (focus.intensity >= 0.55) return "fight";
  if (focus.intensity >= 0.2) return "skirmish";
  return "roam";
}

export default function BattleCameraController({
  follow = true,
  mobile = false,
  posLerp = 0.05,      // target 跟隨柔順度（越小越穩）
  zoomLerp = 0.04,
  source = null,       // S29B6：呈現資料源（預設 live useGameStore；Replay 傳唯讀 adapter）
  perspective = null,  // Milestone D：runtime-v2 保留既有 perspective 構圖，由同一控制器驅動
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const lockRef = useRef(null);             // 目前鎖定的焦點（deadband 用）
  const beatRef = useRef({ beat: "roam", since: -Infinity, pitch: 0 });   // auto 節拍＋目前俯角偏移
  const viewRef = useRef(null);             // 相機當下實際看到的位置（平滑用）

  useFrame(() => {
    const cam = useCameraStore.getState();
    const isMobile = mobile || size.width <= 640;
    const base = perspective ? (isMobile ? perspective.zoomMobile : perspective.zoomDefault)
      : fitZoomFor(size.width, size.height, isMobile);
    if (!viewRef.current) viewRef.current = { x: cam.pan.x, y: cam.pan.y, zoom: base };
    const V = viewRef.current;

    // ── free：玩家手動 pan/zoom ⇒ 1:1 直接套用（不平滑，避免與手勢互相追尾）──
    if (cam.mode === "free") {
      V.x = cam.pan.x; V.y = cam.pan.y; V.zoom = cam.zoom;
      applyCamera(camera, V.x, V.y, V.zoom, perspective, beatRef.current.pitch);
      return;
    }

    // 自動模式：先平滑，再把**螢幕上實際看到的**視野寫回 store。
    //   store.pan/zoom 因此永遠等於當下畫面 ⇒ 玩家一伸手指切進 free 時，
    //   free 直接接續同一個視野（不會跳回導播的目標點），且 free/自動共用同一份狀態。
    const B = beatRef.current;
    const glide = (tx, tz, wantZoom, pl = posLerp, wantPitch = 0) => {
      V.x = lerp(V.x, tx, pl);
      V.y = lerp(V.y, tz, pl);
      V.zoom = lerp(V.zoom, wantZoom, zoomLerp);
      B.pitch = lerp(B.pitch, wantPitch, 0.03);
      cam.setAutoTarget({ x: V.x, y: V.y, zoom: V.zoom });
      applyCamera(camera, V.x, V.y, V.zoom, perspective, B.pitch);
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
      glide(hero.pos.x, hero.pos.y, base * (isMobile ? 1.45 : 1.32), 0.09);
      return;
    }

    // ── director / objectiveFocus ──────────────────────────────────────────
    // Sprint07 導播：VICTORY鎖主堡 > ACE/連殺 > 推塔/龍/巴龍事件 > 交戰聚類 > 重心
    // S29B6：注入 source（Replay）時**不讀 live battleStore**——重播的焦點必須完全由
    //   replay frame 推導（`computeFocus(snap)` 的交戰聚類/重心），否則會被上一場現場
    //   對戰殘留的 events 影響。replay.events 也沒有 `pos` 欄位，餵進去等於沒有作用。
    const cameraEvents = source
      ? (source.getCameraEvents?.() ?? snap.cameraEvents ?? [])
      : useBattleStore.getState().events;
    const f = computeSpectatorFocus(snap, cameraEvents);
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

    const shot = cam.shot ?? "auto";
    if (shot === "tactical") {
      const fight = base * (isMobile ? 1.34 : 1.24);
      glide(L.x, L.y, lerp(base, fight, L.intensity));
      return;
    }
    if (shot === "close" || shot === "wide") {
      const s = STATIC_SHOT[shot];
      glide(L.x, L.y, base * s.zoom, posLerp, s.pitch);
      return;
    }
    //  auto：節拍＋停留時間（hysteresis）。擊殺特寫可以較快插入，其餘至少停 BEAT_DWELL 秒。
    const want2 = beatFor(snap.ts ?? 0, L, cameraEvents, onPit);
    const nowSec = performance.now() / 1000;
    const held = nowSec - B.since;
    if (want2 !== B.beat && (held >= BEAT_DWELL || (want2 === "punch" && held >= PUNCH_DWELL) || !Number.isFinite(B.since))) {
      B.beat = want2; B.since = nowSec;
      cam.setBeat(want2);
    }
    const s = BEAT_SHOT[B.beat] ?? BEAT_SHOT.roam;
    glide(L.x, L.y, base * s.zoom, posLerp, s.pitch);
  });

  return null;
}
