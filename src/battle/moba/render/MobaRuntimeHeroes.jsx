// ============================================================================
//  battle/moba/render/MobaRuntimeHeroes.jsx — 正式 Runtime 的英雄呈現（H.1）
//
//  【職責】把 Runtime Adapter 輸出的 10 名英雄畫成 3D。**只畫**，不模擬：
//   位置、血量、存活、等級全部來自 LogicEngine snapshot（經 mobaRuntimeMapAdapter）。
//   本檔不 import LogicEngine、不寫任何 store、不決定英雄要往哪走。
//
//  【H.3 Prototype Hero】刻意做「看得懂、跑得動」的低成本角色，不是最終模型：
//    · 共用膠囊本體 + 四種 role 原型配件（守衛/游擊/術士/射手）
//    · 陣營色（藍 / 紅）＋ 腳底選取環
//    · 頭頂血條（依 hpRatio 縮放）＋ 等級數字 ＋ 簡短名稱
//    · 死亡：本體降下、變半透明、血條隱藏
//    · 朝向：由 Adapter 依上一幀位移推出（snapshot 沒有 facing 欄位）
//  正式角色模型留給後續 Hero Asset Pipeline 逐步替換 body geometry。
//
//  【效能】
//    · geometry / material 只建立一次（useMemo），10 名英雄共用
//    · 每幀更新走 ref.position / ref.scale，不觸發 React re-render
//    · 名稱與等級用 drei <Html>，只在英雄數量變動時重掛
// ============================================================================
import React, { useMemo, useRef, useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { WORLD_SCALE } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { countMount, countUnmount } from "./runtimeDiagnostics.js";
import { archetypeData, HERO_VISUALS } from "../presentation/heroArchetypes.js";

const S = WORLD_SCALE;
const TEAM_COLOR = { blue: 0x4d95f0, red: 0xf0574d };
const TEAM_DARK = { blue: 0x1d3f6b, red: 0x6b2420 };

/**
 * 【H.1-close 修正 ⑦】陣亡英雄的呈現。
 *
 * 前一版的死亡狀態是「本體沉下去 + 28% 透明 + 藏血條藏環 + 藏名牌」。
 * 資料上是對的（`deadHeroCount` 有值），但**畫面上等於看不見**：在全場視角
 * 屍體只是一團幾乎透明的殘影，和地形混在一起，Codex 視覺驗收因此把
 * 「03 中期截圖看不出陣亡英雄」列為 blocking。
 *
 * 這一版改成「看得出來是屍體，但明顯不是活人」：
 *   · **倒地**：本體從站姿旋轉成橫躺（剪影和站著的英雄一眼就分得開）
 *   · **降飽和**：隊色往灰色拉 60%，仍看得出藍／紅，但明顯褪色
 *   · **適度透明**：0.55（不是 0.28）——夠淡但不會消失
 *   · 血條、選取環、肩塊照樣隱藏
 *   · **地面陣亡標記**：一圈**四邊形**外框（選取環是 20 邊的圓，兩者剪影不同），
 *     比選取環大一圈 ⇒ 遠看仍讀得出「這裡有人陣亡」
 *   · 名牌不再全隱藏，改為半透明＋去飽和 ⇒ 全圖視角仍認得出是誰陣亡
 */
const TEAM_DEAD = { blue: 0x718fb3, red: 0xaf726e };   // 隊色混 60% 灰
const DEAD = Object.freeze({
  bodyOpacity: 0.55,
  markOpacity: 0.8,
  labelOpacity: 0.5,
});

/**
 * 【H.1-close】英雄原本站在 world y = 0，但**地面不在 y = 0**：
 * 路面在 HEIGHT.lane_surface（0.64）、路心亮帶 0.70、塔基 0.94。
 * 結果是每個英雄的腳都陷進路面裡，腳底選取環（原本只抬 0.12×1.7 = 0.20）
 * 更是整圈埋在地形底下、完全看不到。
 *
 * 這裡把英雄整體抬到走道表面，選取環再往上一點點壓過塔基
 * ⇒ 純 transform 修正，不動地形資料、不動任何模擬數值。
 *
 * ⚠ 地面層高度在 **LAYER_Y**（0..1 的地面鋪層排序），不是 HEIGHT（量體厚度）。
 *   兩個表都有 lane_surface 這個 key，取錯會拿到 undefined ⇒ position.y = NaN
 *   ⇒ 整個 matrixWorld 變 NaN ⇒ **10 名英雄全部從畫面上消失**（H.1-close 實測踩過）。
 *   下面的 GROUND_Y 之所以有 Number.isFinite 保險，就是為了讓這種取值錯誤
 *   退化成「英雄站在 y=0」而不是「英雄全部不見」。
 *
 * ⚠ 已知限制（列入 H.1 收尾報告，不在本輪修）：高地平台厚度是
 *   HEIGHT.base_platform = 3.6，站在自家基地平台上的英雄仍會陷入約 3 個世界單位。
 *   要正確處理需要「地形高度查詢」，那會動到地圖資料層 ⇒ 留給 H.2。
 */
const GROUND_Y = Number.isFinite(LAYER_Y.lane_surface) ? LAYER_Y.lane_surface : 0;
const RING_LIFT = 0.35;        // 選取環相對英雄根節點的高度（壓過 tower_pad 0.94）

/** 英雄本體尺寸（模擬單位 × WORLD_SCALE）。 */
const HERO = {
  radius: 1.15 * S,
  height: 2.6 * S,
  ringR: 1.9 * S,
  barW: 3.4 * S,
  barH: 0.42 * S,
  barY: 5.0 * S,
};

/**
 * @param heroes  mobaRuntimeMapAdapter.adaptHeroes() 的輸出（長度應為 10）
 * @param showLabels 是否顯示名稱／等級（手機低階可關）
 */
export default function MobaRuntimeHeroes({ heroes = [], frameRef = null, showLabels = true }) {
  const groupRefs = useRef(new Map());

  //  共用資源：本體 / 肩塊 / 選取環 / 血條（10 名英雄共用同一組 geometry）
  const geo = useMemo(() => ({
    body: new THREE.CapsuleGeometry(HERO.radius, HERO.height, 4, 10),
    shoulder: new THREE.BoxGeometry(HERO.radius * 2.1, HERO.radius * 0.7, HERO.radius * 1.1),
    ring: new THREE.RingGeometry(HERO.ringR * 0.82, HERO.ringR, 20),
    //  陣亡標記：**四邊形**外框（選取環是 20 邊形＝圓）⇒ 兩者剪影一眼分得開，
    //  半徑也比選取環大一圈，全場視角才讀得到。
    deathMark: new THREE.RingGeometry(HERO.ringR * 1.12, HERO.ringR * 1.5, 4),
    bar: new THREE.PlaneGeometry(1, 1),
    shield: new THREE.CylinderGeometry(HERO.radius * 0.78, HERO.radius * 0.78, HERO.radius * 0.3, 8),
    blade: new THREE.BoxGeometry(HERO.radius * 0.22, HERO.height * 0.92, HERO.radius * 0.18),
    staff: new THREE.CylinderGeometry(HERO.radius * 0.12, HERO.radius * 0.12, HERO.height * 1.25, 6),
    focus: new THREE.OctahedronGeometry(HERO.radius * 0.48, 0),
    launcher: new THREE.BoxGeometry(HERO.radius * 0.42, HERO.radius * 0.42, HERO.height * 0.95),
    crest: new THREE.ConeGeometry(HERO.radius * 0.42, HERO.radius * 0.72, 5),
    badge: new THREE.OctahedronGeometry(HERO.radius * 0.34, 0),
    helmBox: new THREE.BoxGeometry(HERO.radius * 1.05, HERO.radius * 0.88, HERO.radius * 1.0),
    helmRound: new THREE.DodecahedronGeometry(HERO.radius * 0.58, 0),
    gauntlet: new THREE.DodecahedronGeometry(HERO.radius * 0.6, 0),
    chest: new THREE.BoxGeometry(HERO.radius * 1.75, HERO.radius * 0.82, HERO.radius * 1.2),
    wing: new THREE.ConeGeometry(HERO.radius * 0.62, HERO.height * 1.1, 3),
    hammer: new THREE.BoxGeometry(HERO.radius * 1.3, HERO.radius * 0.72, HERO.radius * 0.72),
    teamBand: new THREE.TorusGeometry(HERO.radius * 0.92, HERO.radius * 0.16, 5, 14),
    teamMarker: new THREE.RingGeometry(HERO.radius * 0.34, HERO.radius * 0.62, 4),
    horn: new THREE.ConeGeometry(HERO.radius * 0.25, HERO.radius * 0.82, 5),
    hood: new THREE.ConeGeometry(HERO.radius * 0.78, HERO.radius * 1.08, 7, 1, true),
    halo: new THREE.TorusGeometry(HERO.radius * 0.72, HERO.radius * 0.1, 5, 16),
  }), []);

  const mats = useMemo(() => {
    const mk = (color, opts = {}) => new THREE.MeshStandardMaterial({
      color, roughness: 0.55, metalness: 0.05, flatShading: true, ...opts,
    });
    const accentByHero = Object.fromEntries(Object.entries(HERO_VISUALS).map(([id, spec]) => [
      id, mk(spec.accent, { emissive: spec.accent, emissiveIntensity: 0.36, metalness: 0.2 }),
    ]));
    const bodyByHero = Object.fromEntries(Object.entries(HERO_VISUALS).map(([id, spec]) => [
      id, mk(spec.primary ?? spec.accent, {
        emissive: spec.primary ?? spec.accent, emissiveIntensity: 0.14, metalness: 0.12,
      }),
    ]));
    const secondaryByHero = Object.fromEntries(Object.entries(HERO_VISUALS).map(([id, spec]) => [
      id, mk(spec.secondary ?? spec.trim, {
        emissive: spec.secondary ?? spec.trim, emissiveIntensity: 0.08, metalness: 0.16,
      }),
    ]));
    return {
      blue: mk(TEAM_COLOR.blue), red: mk(TEAM_COLOR.red),
      blueDark: mk(TEAM_DARK.blue), redDark: mk(TEAM_DARK.red),
      accent: mk(0xe8d7a4, { emissive: 0x5b4b25, emissiveIntensity: 0.35, metalness: 0.18 }),
      accentByHero, bodyByHero, secondaryByHero,
      //  陣亡本體：**去飽和的隊色** + 0.55 透明（0.28 太淡，全場視角等於消失）
      blueDead: mk(TEAM_DEAD.blue, { transparent: true, opacity: DEAD.bodyOpacity }),
      redDead: mk(TEAM_DEAD.red, { transparent: true, opacity: DEAD.bodyOpacity }),
      //  陣亡地面標記（四邊形外框，不受光，遠近都讀得到）
      //  ── H.2-flicker：貼在地面上的環與標記一律加 polygonOffset ────────────────
      //  這些東西和地形**幾乎共面**（選取環只抬 0.35 世界單位、塔環 0.11、目標環 0.09）。
      //  只靠這點高度差要在深度緩衝裡分開，在 16-bit 的手機 context 上是不可能的
      //  （Δz 比高度差還大 ⇒ 逐幀在地形與環之間跳 ⇒ 肉眼看到閃爍）。
      //  polygonOffset 的單位是**深度緩衝的最小可解析差**，不是世界單位
      //  ⇒ 不管 16-bit 還是 24-bit 都會被推到地形前面，這是貼花的標準解法。
      //  ⚠ 刻意**不**關 depthTest：關掉的話環會穿透牆與塔畫在最上層，那是遮蔽錯誤。
      markBlue: new THREE.MeshBasicMaterial({ color: TEAM_DEAD.blue, transparent: true, opacity: DEAD.markOpacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
      markRed: new THREE.MeshBasicMaterial({ color: TEAM_DEAD.red, transparent: true, opacity: DEAD.markOpacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
      ringBlue: new THREE.MeshBasicMaterial({ color: TEAM_COLOR.blue, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
      ringRed: new THREE.MeshBasicMaterial({ color: TEAM_COLOR.red, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
      //  ⚠ side: DoubleSide 是保險——血條群組已經每幀反轉回世界朝向（見 useFrame），
      //    但只要有人日後改動 facing 的套用方式，單面材質會讓血條**整條消失**而不是畫錯。
      //
      //  ⚠⚠ 【H.1-close 修正 ③】三個血條材質**必須全部 transparent**。
      //  three.js 的繪製順序是「先畫完所有不透明物件，再畫透明物件」，renderOrder
      //  只在**同一個佇列內**有效。原本背板 transparent、填色不透明
      //  ⇒ 填色先畫、深色背板後畫**蓋在上面** ⇒ 滿血血條看起來是一條全黑的空槽
      //  （H.1-close 在 05 近景截圖實測到）。全部放進透明佇列，renderOrder 20/21 才生效。
      barBg: new THREE.MeshBasicMaterial({ color: 0x0b1118, transparent: true, opacity: 0.82, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      barBlue: new THREE.MeshBasicMaterial({ color: 0x59d97a, transparent: true, opacity: 1, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      barRed: new THREE.MeshBasicMaterial({ color: 0xe2604f, transparent: true, opacity: 1, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      markerBlue: new THREE.MeshBasicMaterial({ color: TEAM_COLOR.blue, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      markerRed: new THREE.MeshBasicMaterial({ color: TEAM_COLOR.red, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    };
  }, []);

  useLayoutEffect(() => () => {
    Object.values(geo).forEach((g) => g.dispose());
    Object.values(mats).forEach((m) => (m && typeof m.dispose === "function" ? m.dispose() : Object.values(m ?? {}).forEach((child) => child?.dispose?.())));
  }, [geo, mats]);

  //  H.2-flicker：掛載計數（純觀測；見 MobaRuntimeStructures 內同樣的註解）
  useLayoutEffect(() => {
    countMount("heroes");
    return () => countUnmount("heroes");
  }, []);

  //  每幀把 Adapter 的最新位置寫進 ref（不經過 React state ⇒ 不重繪）
  useFrame(({ clock }) => {
    //  ⚠ 每幀讀 frameRef（最新位置），props.heroes 只負責決定「掛了哪些英雄」
    const live = frameRef?.current?.heroes ?? heroes;
    const effects = frameRef?.current?.effects ?? [];
    const now = clock.getElapsedTime();
    for (const h of live) {
      const node = groupRefs.current.get(h.id);
      if (!node) continue;
      const {
        root, body, shoulder, accessory, signature, headFeature, classLanguage,
        badge, crest, teamBand,
        bar, ring, deathMark, label, bodyAliveMaterial, secondaryAliveMaterial,
      } = node;
      const hitFx = effects.find((fx) => String(fx.targetId ?? "") === h.id && fx.phase === "impact");
      const actionFx = effects.find((fx) => String(fx.sourceId ?? "") === h.id);
      const hit = hitFx ? Math.max(0, 1 - (hitFx.phaseProgress ?? 0)) : 0;
      const action = actionFx ? Math.sin(Math.PI * Math.max(0, Math.min(1, actionFx.phaseProgress ?? 0))) : 0;
      const cast = actionFx?.phase === "cast" ? action : 0;
      const release = actionFx?.phase === "travel" ? action : 0;
      const shake = hit > 0 ? Math.sin(now * 58 + h.id.length) * 0.24 * S * hit : 0;
      //  ⚠ 地面不在 y = 0（見檔頭 GROUND_Y 註解）⇒ 英雄整體抬到走道表面。
      root.position.set(h.world.x + shake, GROUND_Y + hit * 0.08 * S + cast * 0.14 * S, h.world.z - shake * 0.35);
      if (h.facing !== null && h.facing !== undefined) root.rotation.y = h.facing;
      // Milestone C：事件驅動的簡單前搖 / 揮擊 / 後座。只動既有低模零件，
      // 不新增動畫狀態機，Live 與 Replay 都直接讀同一份 effects。
      if (signature) {
        signature.rotation.x = -release * 0.42;
        signature.rotation.z = cast * 0.16;
      }
      if (accessory) {
        accessory.rotation.x = -release * 0.55;
        accessory.rotation.z = cast * 0.2;
      }
      if (shoulder) shoulder.rotation.z = release * 0.12 - hit * 0.08;
      if (crest) crest.rotation.y = now * 0.35 + cast * 0.9;
      if (classLanguage) {
        // 六職業的武器／施法群組保留不同動作語彙：法師／輔助環繞施法，
        // 刺客／戰士大幅前揮，射手有後座，坦克則以盾面前頂。
        const cls = h.combatClass ?? "fighter";
        classLanguage.rotation.y = (cls === "mage" || cls === "support")
          ? now * (cls === "support" ? 0.8 : 1.25) : release * 0.22;
        classLanguage.rotation.x = cls === "marksman" ? release * 0.28
          : (cls === "assassin" || cls === "fighter") ? -release * 0.48
            : cls === "tank" ? cast * 0.22 : cast * 0.12;
        classLanguage.position.z = cls === "marksman" ? -release * 0.42 * S
          : cls === "tank" ? cast * 0.28 * S : 0;
        classLanguage.scale.setScalar(1 + cast * 0.12 + release * 0.08);
        classLanguage.visible = h.alive;
      }
      //  ── 陣亡呈現（見檔頭 TEAM_DEAD / DEAD 註解）──────────────────────────
      //  倒地：本體由站姿轉成橫躺，高度降到「躺在地上」而不是「陷進地裡」
      //  ⇒ 剪影與站立的英雄完全不同，遠看也分得出來。
      body.rotation.x = h.alive ? 0 : -Math.PI / 2;
      body.position.y = h.alive ? HERO.height / 2 + HERO.radius : HERO.radius * 0.95;
      body.material = h.alive
        ? bodyAliveMaterial
        : (h.team === "blue" ? mats.blueDead : mats.redDead);
      if (bodyAliveMaterial) bodyAliveMaterial.emissiveIntensity = 0.14 + hit * 1.65;
      //  肩塊只在活著時出現：屍體是一具橫躺的膠囊，多一塊方塊只會變回「色塊」
      if (shoulder) {
        shoulder.visible = h.alive;
        shoulder.material = secondaryAliveMaterial;
      }
      if (accessory) accessory.visible = h.alive;
      if (signature) signature.visible = h.alive;
      if (headFeature) headFeature.visible = h.alive;
      if (badge) badge.visible = h.alive;
      if (crest) crest.visible = h.alive;
      if (teamBand) teamBand.visible = h.alive;
      ring.visible = h.alive;
      //  地面陣亡標記：只有死亡時出現，是「還認得出這裡有人陣亡」的主要線索
      if (deathMark) {
        deathMark.visible = !h.alive;
        deathMark.material = h.team === "blue" ? mats.markBlue : mats.markRed;
      }
      bar.parent.visible = h.alive;
      //  【H.1-close 修正 ①】原本寫 `bar.scale.x = hpRatio`，把 JSX 裡設好的
      //  **世界寬度 HERO.barW 整個蓋掉** ⇒ 滿血血條只有 1 個世界單位寬（背板是 5.8），
      //  畫面上看起來就是「一條全黑的空血條」。寬度必須是 barW × hpRatio。
      bar.scale.x = HERO.barW * Math.max(0.001, h.hpRatio);
      //  血條以左緣為錨點縮放（scale 從中心縮 ⇒ 要補回一半位移）
      bar.position.x = -(HERO.barW / 2) * (1 - h.hpRatio);
      //  【H.1-close 修正 ②】血條是固定朝 +Z 的平面，卻掛在會隨 facing 轉動的 root 底下
      //  ⇒ 英雄背對鏡頭時血條轉成背面，MeshBasicMaterial 預設只畫正面 ⇒ **整條消失**。
      //  相機 yaw 固定為 0，所以把血條群組反轉回世界朝向就等於永遠面對鏡頭。
      bar.parent.rotation.y = -root.rotation.y;
      //  label 是 <Html> 的 DOM 節點，用 style 控制顯示（不是 three 的 visible）。
      //  ⚠ 陣亡時**不再整個隱藏**：全場視角下名牌是「認得出誰倒在這裡」的關鍵，
      //    全隱藏會讓屍體徹底消失在地形裡。改為半透明 + 去飽和。
      if (label) {
        label.style.opacity = h.alive ? "1" : String(DEAD.labelOpacity);
        label.style.filter = h.alive ? "none" : "grayscale(0.65)";
      }
    }
  });

  return (
    <group name="moba-runtime-heroes">
      {heroes.map((h) => (
        <HeroUnit
          key={h.id}
          hero={h}
          geo={geo}
          mats={mats}
          showLabel={showLabels}
          register={(id, node) => {
            if (node) groupRefs.current.set(id, node);
            else groupRefs.current.delete(id);
          }}
        />
      ))}
    </group>
  );
}

function HeroUnit({ hero, geo, mats, showLabel, register }) {
  const rootRef = useRef();
  const bodyRef = useRef();
  const shoulderRef = useRef();
  const barRef = useRef();
  const ringRef = useRef();
  const deathMarkRef = useRef();
  const accessoryRef = useRef();
  const signatureRef = useRef();
  const headFeatureRef = useRef();
  const classLanguageRef = useRef();
  const badgeRef = useRef();
  const crestRef = useRef();
  const teamBandRef = useRef();
  const labelRef = useRef();
  const visual = hero.visual ?? HERO_VISUALS[hero.heroId] ?? null;
  const archetype = archetypeData(hero.archetype);
  const bodyMaterial = mats.bodyByHero?.[visual?.id] ?? mats.accent;
  const secondaryMaterial = mats.secondaryByHero?.[visual?.id]
    ?? (hero.team === "blue" ? mats.blueDark : mats.redDark);
  const timedStates = [...(hero.buffs ?? []), ...(hero.statusEffects ?? [])];
  const stateMeta = {
    red: { icon: "R", color: "#ff6b55", title: "紅 Buff" },
    blue: { icon: "B", color: "#55aaff", title: "藍 Buff" },
    baron: { icon: "V", color: "#d8a8ff", title: "Baron Buff" },
    slow: { icon: "↓", color: "#a5b4c8", title: "減速" },
  };

  useLayoutEffect(() => {
    register(hero.id, {
      root: rootRef.current, body: bodyRef.current, shoulder: shoulderRef.current,
      accessory: accessoryRef.current,
      signature: signatureRef.current,
      headFeature: headFeatureRef.current,
      classLanguage: classLanguageRef.current,
      badge: badgeRef.current, crest: crestRef.current,
      teamBand: teamBandRef.current,
      bar: barRef.current, ring: ringRef.current, deathMark: deathMarkRef.current,
      label: labelRef.current,
      bodyAliveMaterial: bodyMaterial,
      secondaryAliveMaterial: secondaryMaterial,
    });
    return () => register(hero.id, null);
  }, [hero.id, register, bodyMaterial, secondaryMaterial]);

  const team = hero.team === "blue" ? "blue" : "red";
  const resolvedVisual = visual ?? { badge: archetype.accessory, scale: archetype.bodyScale };
  const accentMaterial = mats.accentByHero?.[resolvedVisual.id] ?? mats.accent;
  //  ⚠ 手機版問題標記 #3「畫面偶發閃爍/破圖感」：本檔所有 mesh 每幀都用 ref 直接改
  //  position/scale/visible（見下面 useFrame），但 geometry 的 boundingSphere 是照
  //  「建立當下」的局部座標算的、不會跟著位置更新重算。加上運鏡（RTS 大範圍平移/縮放）
  //  常讓角色貼近畫面邊緣，Three 預設的 frustum culling 在這種「物件常在視錐邊界」的
  //  情境下很容易誤判剔除，一幀不畫就是閃爍。這正是 `docs/09_技術債務清單.md` §附錄
  //  記載過的既有教訓（「玩家 mesh 一律 frustumCulled=false，否則會閃爍/消失」）——
  //  地圖的靜態量體（MobaMapBlockout.jsx）已經照做，H.1 新增的 Runtime 英雄卻漏了。
  //  英雄只有 10 個、幾何很小，全部關掉 culling 的效能代價可忽略。
  return (
    <group ref={rootRef} position={[hero.world.x, GROUND_Y, hero.world.z]}
      userData={{ heroId: hero.id, team }}>
      {/* 腳底選取環（抬到地形表面之上，否則整圈埋在路面／塔基底下看不見）*/}
      <mesh ref={ringRef} geometry={geo.ring} material={team === "blue" ? mats.ringBlue : mats.ringRed}
        position={[0, RING_LIFT, 0]} rotation={[-Math.PI / 2, 0, 0]}
        frustumCulled={false} userData={{ part: "hero-ring" }} />
      {/* 陣亡地面標記（四邊形外框；只有死亡時 visible，見 useFrame）*/}
      <mesh ref={deathMarkRef} geometry={geo.deathMark}
        material={team === "blue" ? mats.markBlue : mats.markRed}
        position={[0, RING_LIFT, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}
        visible={false} frustumCulled={false} userData={{ part: "hero-death-mark" }} />
      {/* 本體（膠囊） */}
      <mesh ref={bodyRef} geometry={geo.body} material={bodyMaterial}
        scale={resolvedVisual.scale ?? archetype.bodyScale}
        position={[0, HERO.height / 2 + HERO.radius, 0]} castShadow={false}
        frustumCulled={false} userData={{ part: "hero-body" }} />
      {/* 肩塊：讓剪影不只是膠囊，遠看能分辨正面 */}
      <mesh ref={shoulderRef} geometry={geo.shoulder}
        material={secondaryMaterial}
        scale={archetype.shoulderScale}
        position={[0, HERO.height * 0.86, HERO.radius * 0.45]}
        frustumCulled={false} userData={{ part: "hero-shoulder" }} />
      <HeroAccessory ref={accessoryRef} type={resolvedVisual.badge ?? archetype.accessory} geo={geo}
        material={accentMaterial} teamMaterial={secondaryMaterial} />
      <HeroSignature ref={signatureRef} silhouette={resolvedVisual.silhouette} geo={geo}
        accent={accentMaterial} teamMaterial={secondaryMaterial} />
      <HeroHeadFeature ref={headFeatureRef} type={resolvedVisual.headFeature} geo={geo}
        accent={accentMaterial} secondary={secondaryMaterial} />
      <HeroClassLanguage ref={classLanguageRef} combatClass={hero.combatClass}
        geo={geo} accent={accentMaterial} secondary={secondaryMaterial} />
      <mesh ref={crestRef} geometry={geo.crest} material={accentMaterial}
        position={[0, HERO.height * 1.42, 0]} rotation={[0, 0, Math.PI]}
        scale={[resolvedVisual.silhouette === "obelisk" ? 1.25 : 0.82, 1, 0.82]}
        frustumCulled={false} userData={{ part: "hero-crest", visual: resolvedVisual.silhouette }} />
      <mesh ref={badgeRef} geometry={geo.badge} material={accentMaterial}
        position={[0, HERO.height * 0.72, HERO.radius * 0.96]} scale={0.72}
        frustumCulled={false} userData={{ part: "hero-badge", visual: resolvedVisual.badge }} />
      {/* 英雄本體保留個人主色；腰間粗環、腳底環與血條側標專責藍／紅陣營辨識。 */}
      <mesh ref={teamBandRef} geometry={geo.teamBand}
        material={team === "blue" ? mats.blue : mats.red}
        position={[0, HERO.height * 0.66, 0]} rotation={[Math.PI / 2, 0, 0]}
        scale={[1.12, 1.12, 1.12]} frustumCulled={false}
        userData={{ part: "hero-team-band", team }} />
      {/* 頭頂血條（背板 + 前景） */}
      <group position={[0, HERO.barY, 0]}>
        <mesh geometry={geo.bar} material={mats.barBg}
          scale={[HERO.barW * 1.08, HERO.barH * 1.5, 1]} renderOrder={20} frustumCulled={false} />
        <mesh ref={barRef} geometry={geo.bar}
          material={team === "blue" ? mats.barBlue : mats.barRed}
          scale={[HERO.barW, HERO.barH, 1]} position={[0, 0, 0.01]} renderOrder={21}
          frustumCulled={false} userData={{ part: "hero-hpbar" }} />
        <mesh geometry={geo.teamMarker} material={team === "blue" ? mats.markerBlue : mats.markerRed}
          position={[-HERO.barW * 0.66, 0, 0.03]} rotation={[0, 0, Math.PI / 4]}
          renderOrder={22} frustumCulled={false}
          userData={{ part: "hero-team-side-marker", team }} />
      </group>
      {showLabel && (
        <Html position={[0, HERO.barY + 0.72 * S, 0]} center distanceFactor={148}
          style={{ pointerEvents: "none" }}>
          <div ref={labelRef} style={{
            display: "flex", alignItems: "center", gap: 2.5,
            font: "700 8px ui-monospace,monospace", lineHeight: 1.25, whiteSpace: "nowrap",
            color: "#f8fafc", padding: "1px 3px 1px 2px", borderRadius: 3,
            borderLeft: `2px solid ${team === "blue" ? "#4d95f0" : "#f0574d"}`,
            background: "rgba(5,10,18,.42)", textShadow: "0 1px 2px rgba(0,0,0,.9)",
          }}>
            <span style={{
              width: 4, height: 4, borderRadius: 1,
              background: team === "blue" ? "#4d95f0" : "#f0574d",
              transform: "rotate(45deg)", boxShadow: "0 0 3px currentColor",
            }} aria-hidden="true" />
            <span>{hero.displayName}</span>
            <span style={{ opacity: 0.72 }}>Lv{hero.level}</span>
          </div>
        </Html>
      )}
      {/* Milestone D：層級固定為 名稱/等級 → 血條 → Buff/狀態。低畫質可隱藏
          次要名稱，但限時狀態仍保留小圖示與秒數。 */}
      {!!timedStates.length && (
        <Html position={[0, HERO.barY - 0.72 * S, 0]} center distanceFactor={152}
          style={{ pointerEvents: "none" }}>
          <div style={{ display: "flex", gap: 2, whiteSpace: "nowrap" }}>
            {timedStates.map((state) => {
              const meta = stateMeta[state.id] ?? { icon: "•", color: "#e5e7eb", title: state.id };
              return (
                <span key={state.id} title={meta.title} style={{
                  minWidth: 15, height: 12, padding: "0 2px", borderRadius: 3,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 1,
                  font: "800 7px ui-monospace,monospace", color: meta.color,
                  border: `1px solid ${meta.color}99`, background: "rgba(4,8,14,.72)",
                  boxShadow: `0 0 4px ${meta.color}44`,
                }}>
                  {meta.icon}<small style={{ fontSize: 6, opacity: 0.82 }}>{Math.ceil(state.remaining ?? 0)}</small>
                </span>
              );
            })}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * 六職業固定輪廓／武器語彙。這是 presentation-only 低模配件，不改英雄數值；
 * 所有動作仍由同一份 cast / travel / impact event 驅動。
 */
const HeroClassLanguage = React.forwardRef(function HeroClassLanguage(
  { combatClass = "fighter", geo, accent, secondary }, ref,
) {
  const mesh = (geometry, material, position, scale, rotation = [0, 0, 0], part) => (
    <mesh geometry={geometry} material={material} position={position} scale={scale}
      rotation={rotation} frustumCulled={false}
      userData={{ part: `hero-class-${part}`, combatClass }} />
  );
  return (
    <group ref={ref} userData={{ part: "hero-class-language", combatClass }}>
      {combatClass === "tank" && (
        <>
          {mesh(geo.shield, secondary, [-1.25 * HERO.radius, HERO.height * 0.75, 0.25 * HERO.radius],
            [1.45, 1.25, 1.45], [0, 0, Math.PI / 2], "tank-shield")}
          {mesh(geo.chest, accent, [0, HERO.height * 0.88, 0], [1.06, 0.72, 1.08], [0, 0, 0], "tank-plate")}
        </>
      )}
      {combatClass === "fighter" && (
        <>
          {mesh(geo.gauntlet, accent, [-1.1 * HERO.radius, HERO.height * 0.72, 0.75 * HERO.radius],
            [0.9, 0.9, 1.25], [0, 0, 0], "fighter-left")}
          {mesh(geo.gauntlet, accent, [1.1 * HERO.radius, HERO.height * 0.72, 0.75 * HERO.radius],
            [0.9, 0.9, 1.25], [0, 0, 0], "fighter-right")}
        </>
      )}
      {combatClass === "assassin" && (
        <>
          {mesh(geo.blade, accent, [-0.8 * HERO.radius, HERO.height * 0.72, 0.55 * HERO.radius],
            [0.82, 0.85, 0.82], [0.35, 0, -0.48], "assassin-left")}
          {mesh(geo.blade, accent, [0.8 * HERO.radius, HERO.height * 0.72, 0.55 * HERO.radius],
            [0.82, 0.85, 0.82], [-0.35, 0, 0.48], "assassin-right")}
        </>
      )}
      {combatClass === "mage" && (
        <>
          {mesh(geo.staff, secondary, [-1.15 * HERO.radius, HERO.height * 0.75, 0],
            [1, 1.15, 1], [0, 0, 0.18], "mage-staff")}
          {mesh(geo.focus, accent, [0, HERO.height * 1.55, 0.35 * HERO.radius],
            [1.05, 1.25, 1.05], [0, 0, 0], "mage-focus")}
        </>
      )}
      {combatClass === "marksman" && (
        <>
          {mesh(geo.launcher, secondary, [0.9 * HERO.radius, HERO.height * 0.78, 0.92 * HERO.radius],
            [0.72, 0.72, 1.28], [Math.PI / 2, 0, 0], "marksman-launcher")}
          {mesh(geo.focus, accent, [0.9 * HERO.radius, HERO.height * 0.78, 1.75 * HERO.radius],
            [0.55, 0.55, 0.85], [0, 0, 0], "marksman-muzzle")}
        </>
      )}
      {combatClass === "support" && (
        <>
          {mesh(geo.halo, accent, [0, HERO.height * 1.12, -0.72 * HERO.radius],
            [1.28, 1.28, 1.28], [Math.PI / 2, 0, 0], "support-halo")}
          {mesh(geo.focus, accent, [-1.15 * HERO.radius, HERO.height * 1.02, 0.25 * HERO.radius],
            [0.62, 0.62, 0.62], [0, 0, 0], "support-focus-left")}
          {mesh(geo.focus, accent, [1.15 * HERO.radius, HERO.height * 1.02, 0.25 * HERO.radius],
            [0.62, 0.62, 0.62], [0, 0, 0], "support-focus-right")}
        </>
      )}
    </group>
  );
});

/**
 * 把選角頭像最醒目的頭部語彙轉成 ESMO 自有低模零件。
 * 這不是把 2D 圖貼到角色上；visual schema 只保存 recipe，之後可由正式 GLB
 * 使用同一個 stable hero id 逐隻替換，不會碰 snapshot / Replay。
 */
const HeroHeadFeature = React.forwardRef(function HeroHeadFeature(
  { type, geo, accent, secondary }, ref,
) {
  const mesh = (geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0], part = type) => (
    <mesh geometry={geometry} material={material} position={position} scale={scale}
      rotation={rotation} frustumCulled={false}
      userData={{ part: "hero-portrait-head-feature", motif: part }} />
  );
  const hornPair = (material, scale = [1, 1, 1], spread = 0.58, lean = 0.38) => (
    <>
      {mesh(geo.horn, material, [-HERO.radius * spread, HERO.height * 1.57, 0],
        scale, [0, 0, lean], `${type}-left`)}
      {mesh(geo.horn, material, [HERO.radius * spread, HERO.height * 1.57, 0],
        scale, [0, 0, -lean], `${type}-right`)}
    </>
  );

  if (type === "hornedHelm") return (
    <group ref={ref} name="hero-head-horned-helm">
      {hornPair(accent, [0.72, 1.08, 0.72], 0.62, 0.52)}
      {mesh(geo.badge, accent, [0, HERO.height * 1.42, HERO.radius * 0.58], [0.36, 0.2, 0.22],
        [0, 0, Math.PI / 4], "amber-visor")}
    </group>
  );
  if (type === "flameHair") return (
    <group ref={ref} name="hero-head-flame-hair">
      {mesh(geo.crest, accent, [0, HERO.height * 1.62, -HERO.radius * 0.05], [0.82, 1.5, 0.82],
        [0, 0, Math.PI], "flame-center")}
      {mesh(geo.crest, accent, [-HERO.radius * 0.48, HERO.height * 1.52, 0], [0.5, 1.05, 0.5],
        [0, 0, Math.PI + 0.35], "flame-left")}
      {mesh(geo.crest, accent, [HERO.radius * 0.48, HERO.height * 1.52, 0], [0.5, 1.05, 0.5],
        [0, 0, Math.PI - 0.35], "flame-right")}
    </group>
  );
  if (type === "hood") return (
    <group ref={ref} name="hero-head-hood">
      {mesh(geo.hood, secondary, [0, HERO.height * 1.4, -HERO.radius * 0.12], [1.08, 1.18, 1.02],
        [0, 0, Math.PI], "hood")}
      {mesh(geo.badge, accent, [0, HERO.height * 1.34, HERO.radius * 0.64], [0.26, 0.16, 0.18],
        [0, 0, Math.PI / 4], "hood-visor")}
    </group>
  );
  if (type === "infernoHorns") return (
    <group ref={ref} name="hero-head-inferno-horns">
      {hornPair(accent, [0.88, 1.28, 0.88], 0.64, 0.64)}
      {mesh(geo.crest, accent, [0, HERO.height * 1.61, 0], [0.66, 1.15, 0.66],
        [0, 0, Math.PI], "inferno-core")}
    </group>
  );
  if (type === "iceCrown") return (
    <group ref={ref} name="hero-head-ice-crown">
      {mesh(geo.focus, accent, [0, HERO.height * 1.6, 0], [0.52, 1.2, 0.52], [0, 0, 0], "ice-center")}
      {mesh(geo.focus, accent, [-HERO.radius * 0.48, HERO.height * 1.5, 0], [0.38, 0.82, 0.38],
        [0, 0, 0.42], "ice-left")}
      {mesh(geo.focus, accent, [HERO.radius * 0.48, HERO.height * 1.5, 0], [0.38, 0.82, 0.38],
        [0, 0, -0.42], "ice-right")}
    </group>
  );
  if (type === "emberCrown") return (
    <group ref={ref} name="hero-head-ember-crown">
      {hornPair(secondary, [0.7, 1.18, 0.7], 0.58, 0.46)}
      {mesh(geo.crest, accent, [0, HERO.height * 1.63, 0], [0.72, 1.35, 0.72],
        [0, 0, Math.PI], "ember-plume")}
    </group>
  );
  if (type === "lightningHalo") return (
    <group ref={ref} name="hero-head-lightning-halo">
      {mesh(geo.halo, accent, [0, HERO.height * 1.43, -HERO.radius * 0.52], [1, 1.18, 1],
        [Math.PI / 2, 0, 0], "lightning-halo")}
      {hornPair(accent, [0.38, 0.88, 0.38], 0.5, 0.72)}
    </group>
  );
  if (type === "phoenixCrown") return (
    <group ref={ref} name="hero-head-phoenix-crown">
      {mesh(geo.crest, accent, [0, HERO.height * 1.65, 0], [0.74, 1.5, 0.74],
        [0, 0, Math.PI], "phoenix-center")}
      {mesh(geo.wing, accent, [-HERO.radius * 0.58, HERO.height * 1.48, 0], [0.38, 0.62, 0.24],
        [0, 0, 0.75], "phoenix-left")}
      {mesh(geo.wing, accent, [HERO.radius * 0.58, HERO.height * 1.48, 0], [0.38, 0.62, 0.24],
        [0, 0, -0.75], "phoenix-right")}
    </group>
  );
  if (type === "barkAntlers") return (
    <group ref={ref} name="hero-head-bark-antlers">
      {hornPair(secondary, [0.58, 1.3, 0.58], 0.72, 0.72)}
      {mesh(geo.crest, accent, [0, HERO.height * 1.6, 0], [0.72, 1.05, 0.72],
        [0, 0, Math.PI], "leaf-crown")}
    </group>
  );
  if (type === "stoneHorns") return (
    <group ref={ref} name="hero-head-stone-horns">
      {hornPair(accent, [1.02, 1.14, 1.02], 0.72, 0.72)}
      {mesh(geo.helmBox, secondary, [0, HERO.height * 1.38, 0], [0.84, 0.78, 0.86],
        [0, 0, 0], "stone-brow")}
    </group>
  );
  return <group ref={ref} name="hero-head-generated">
    {mesh(geo.badge, accent, [0, HERO.height * 1.56, 0], [0.62, 0.9, 0.62], [0, 0, 0], "generated")}
  </group>;
});

const HeroSignature = React.forwardRef(function HeroSignature(
  { silhouette, geo, accent, teamMaterial }, ref,
) {
  const mesh = (geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0], part = "signature") => (
    <mesh geometry={geometry} material={material} position={position} scale={scale}
      rotation={rotation} frustumCulled={false} userData={{ part, silhouette }} />
  );
  if (silhouette === "bulwark") return (
    <group ref={ref} name="hero-signature-bulwark">
      {mesh(geo.helmBox, teamMaterial, [0, HERO.height * 1.28, 0], [1.12, 0.92, 1])}
      {mesh(geo.shield, accent, [-HERO.radius * 1.28, HERO.height * 0.72, HERO.radius * 0.38], [1.28, 1.28, 1.1], [Math.PI / 2, 0, 0])}
    </group>
  );
  if (silhouette === "bruiser" || silhouette === "striker") return (
    <group ref={ref} name={`hero-signature-${silhouette}`}>
      {mesh(geo.helmRound, teamMaterial, [0, HERO.height * 1.3, 0], silhouette === "striker" ? [0.78, 1.15, 0.78] : [1, 0.86, 1])}
      {mesh(geo.gauntlet, accent, [-HERO.radius * 1.15, HERO.height * 0.63, HERO.radius * 0.55], silhouette === "striker" ? [0.72, 1.25, 0.72] : [1.25, 1, 1])}
      {mesh(geo.gauntlet, accent, [HERO.radius * 1.15, HERO.height * 0.63, HERO.radius * 0.55], silhouette === "striker" ? [0.72, 1.25, 0.72] : [1.25, 1, 1])}
    </group>
  );
  if (silhouette === "rogue") return (
    <group ref={ref} name="hero-signature-rogue">
      {mesh(geo.helmRound, teamMaterial, [0, HERO.height * 1.28, 0], [0.7, 1.1, 0.7])}
      {mesh(geo.blade, accent, [-HERO.radius * 0.72, HERO.height * 0.95, -HERO.radius * 0.46], [1.35, 1.28, 1.2], [0.1, 0, -0.72])}
      {mesh(geo.blade, accent, [HERO.radius * 0.72, HERO.height * 0.95, -HERO.radius * 0.46], [1.35, 1.28, 1.2], [-0.1, 0, 0.72])}
    </group>
  );
  if (silhouette === "crystal" || silhouette === "flame") return (
    <group ref={ref} name={`hero-signature-${silhouette}`}>
      {mesh(silhouette === "crystal" ? geo.focus : geo.crest, accent, [0, HERO.height * 1.42, 0],
        silhouette === "crystal" ? [1.15, 1.35, 1.15] : [1.05, 1.55, 1.05], silhouette === "flame" ? [0, 0, Math.PI] : [0, 0, 0])}
      {mesh(geo.staff, teamMaterial, [HERO.radius * 1.25, HERO.height * 0.73, 0], [1.2, 1.18, 1.2], [0, 0, silhouette === "flame" ? -0.18 : 0.12])}
    </group>
  );
  if (silhouette === "ranger") return (
    <group ref={ref} name="hero-signature-ranger">
      {mesh(geo.helmBox, teamMaterial, [0, HERO.height * 1.28, 0], [0.92, 0.62, 1.2])}
      {mesh(geo.launcher, accent, [HERO.radius * 1.15, HERO.height * 0.72, HERO.radius * 0.72], [0.82, 0.82, 1.42], [Math.PI / 2, 0, -0.18])}
    </group>
  );
  if (silhouette === "wing") return (
    <group ref={ref} name="hero-signature-wing">
      {mesh(geo.helmRound, teamMaterial, [0, HERO.height * 1.28, 0], [0.76, 1, 0.76])}
      {mesh(geo.wing, accent, [-HERO.radius * 0.92, HERO.height * 0.92, -HERO.radius * 0.55], [0.72, 1.25, 0.42], [0.18, 0, 0.58])}
      {mesh(geo.wing, accent, [HERO.radius * 0.92, HERO.height * 0.92, -HERO.radius * 0.55], [0.72, 1.25, 0.42], [-0.18, 0, -0.58])}
    </group>
  );
  if (silhouette === "sentinel") return (
    <group ref={ref} name="hero-signature-sentinel">
      {mesh(geo.helmRound, teamMaterial, [0, HERO.height * 1.28, 0], [1.08, 0.82, 1.08])}
      {mesh(geo.shield, accent, [HERO.radius * 1.18, HERO.height * 0.72, HERO.radius * 0.5], [1.05, 1.3, 1], [Math.PI / 2, 0, 0])}
      {mesh(geo.crest, accent, [0, HERO.height * 1.57, 0], [0.62, 0.9, 0.62], [0, 0, Math.PI])}
    </group>
  );
  if (silhouette === "obelisk") return (
    <group ref={ref} name="hero-signature-obelisk">
      {mesh(geo.chest, teamMaterial, [0, HERO.height * 0.92, 0], [1.18, 1.22, 1.05])}
      {mesh(geo.helmBox, accent, [0, HERO.height * 1.38, 0], [0.92, 1.22, 0.92])}
      {mesh(geo.hammer, accent, [HERO.radius * 1.22, HERO.height * 0.9, HERO.radius * 0.45], [1.05, 1.05, 1.05], [0, 0, 0.18])}
    </group>
  );
  return <group ref={ref} name="hero-signature-generated">
    {mesh(geo.helmRound, accent, [0, HERO.height * 1.3, 0], [0.85, 1.05, 0.85])}
  </group>;
});

const HeroAccessory = React.forwardRef(function HeroAccessory(
  { type, geo, material, teamMaterial }, ref,
) {
  if (type === "shield") {
    return (
      <group ref={ref} name="hero-archetype-guardian">
        <mesh geometry={geo.shield} material={teamMaterial}
          position={[HERO.radius * 1.05, HERO.height * 0.68, HERO.radius * 0.64]}
          rotation={[Math.PI / 2, 0, 0]} frustumCulled={false} />
      </group>
    );
  }
  if (type === "focus") {
    return (
      <group ref={ref} name="hero-archetype-arcanist">
        <mesh geometry={geo.staff} material={material}
          position={[HERO.radius * 1.12, HERO.height * 0.64, 0]}
          rotation={[0, 0, -0.08]} frustumCulled={false} />
        <mesh geometry={geo.focus} material={teamMaterial}
          position={[HERO.radius * 1.2, HERO.height * 1.32, 0]}
          frustumCulled={false} />
      </group>
    );
  }
  if (type === "fist") {
    return (
      <group ref={ref} name="hero-archetype-fist">
        <mesh geometry={geo.gauntlet} material={material}
          position={[-HERO.radius * 1.1, HERO.height * 0.58, HERO.radius * 0.5]}
          scale={0.82} frustumCulled={false} />
        <mesh geometry={geo.gauntlet} material={material}
          position={[HERO.radius * 1.1, HERO.height * 0.58, HERO.radius * 0.5]}
          scale={0.82} frustumCulled={false} />
      </group>
    );
  }
  if (type === "flame") {
    return (
      <group ref={ref} name="hero-archetype-flame">
        <mesh geometry={geo.staff} material={teamMaterial}
          position={[HERO.radius * 1.12, HERO.height * 0.68, 0]}
          rotation={[0, 0, -0.12]} frustumCulled={false} />
        <mesh geometry={geo.crest} material={material}
          position={[HERO.radius * 1.15, HERO.height * 1.42, 0]}
          rotation={[0, 0, Math.PI]} frustumCulled={false} />
      </group>
    );
  }
  if (type === "launcher") {
    return (
      <group ref={ref} name="hero-archetype-marksman">
        <mesh geometry={geo.launcher} material={material}
          position={[0, HERO.height * 0.72, HERO.radius * 1.05]}
          rotation={[Math.PI / 2, 0, 0]} frustumCulled={false} />
      </group>
    );
  }
  return (
    <group ref={ref} name="hero-archetype-skirmisher">
      <mesh geometry={geo.blade} material={material}
        position={[-HERO.radius * 0.9, HERO.height * 0.58, HERO.radius * 0.36]}
        rotation={[0.28, 0, -0.38]} frustumCulled={false} />
      <mesh geometry={geo.blade} material={material}
        position={[HERO.radius * 0.9, HERO.height * 0.58, HERO.radius * 0.36]}
        rotation={[-0.28, 0, 0.38]} frustumCulled={false} />
    </group>
  );
});
