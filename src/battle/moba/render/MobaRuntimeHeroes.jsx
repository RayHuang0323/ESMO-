// ============================================================================
//  battle/moba/render/MobaRuntimeHeroes.jsx — 正式 Runtime 的英雄呈現（H.1）
//
//  【職責】把 Runtime Adapter 輸出的 10 名英雄畫成 3D。**只畫**，不模擬：
//   位置、血量、存活、等級全部來自 LogicEngine snapshot（經 mobaRuntimeMapAdapter）。
//   本檔不 import LogicEngine、不寫任何 store、不決定英雄要往哪走。
//
//  【H.1 的 Prototype Hero】刻意做「看得懂、跑得動」的低成本角色，不是最終模型：
//    · 膠囊本體 + 肩部方塊（低面數，遠看仍讀得出是角色而不是圓點）
//    · 陣營色（藍 / 紅）＋ 腳底選取環
//    · 頭頂血條（依 hpRatio 縮放）＋ 等級數字 ＋ 簡短名稱
//    · 死亡：本體降下、變半透明、血條隱藏
//    · 朝向：由 Adapter 依上一幀位移推出（snapshot 沒有 facing 欄位）
//  正式角色模型留給後續 Hero Asset Pipeline（H.3+）替換本檔的 body geometry。
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
  }), []);

  const mats = useMemo(() => {
    const mk = (color, opts = {}) => new THREE.MeshStandardMaterial({
      color, roughness: 0.55, metalness: 0.05, flatShading: true, ...opts,
    });
    return {
      blue: mk(TEAM_COLOR.blue), red: mk(TEAM_COLOR.red),
      blueDark: mk(TEAM_DARK.blue), redDark: mk(TEAM_DARK.red),
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
    };
  }, []);

  useLayoutEffect(() => () => {
    Object.values(geo).forEach((g) => g.dispose());
    Object.values(mats).forEach((m) => m.dispose());
  }, [geo, mats]);

  //  H.2-flicker：掛載計數（純觀測；見 MobaRuntimeStructures 內同樣的註解）
  useLayoutEffect(() => {
    countMount("heroes");
    return () => countUnmount("heroes");
  }, []);

  //  每幀把 Adapter 的最新位置寫進 ref（不經過 React state ⇒ 不重繪）
  useFrame(() => {
    //  ⚠ 每幀讀 frameRef（最新位置），props.heroes 只負責決定「掛了哪些英雄」
    const live = frameRef?.current?.heroes ?? heroes;
    for (const h of live) {
      const node = groupRefs.current.get(h.id);
      if (!node) continue;
      const { root, body, shoulder, bar, ring, deathMark, label } = node;
      //  ⚠ 地面不在 y = 0（見檔頭 GROUND_Y 註解）⇒ 英雄整體抬到走道表面。
      root.position.set(h.world.x, GROUND_Y, h.world.z);
      if (h.facing !== null && h.facing !== undefined) root.rotation.y = h.facing;
      //  ── 陣亡呈現（見檔頭 TEAM_DEAD / DEAD 註解）──────────────────────────
      //  倒地：本體由站姿轉成橫躺，高度降到「躺在地上」而不是「陷進地裡」
      //  ⇒ 剪影與站立的英雄完全不同，遠看也分得出來。
      body.rotation.x = h.alive ? 0 : -Math.PI / 2;
      body.position.y = h.alive ? HERO.height / 2 + HERO.radius : HERO.radius * 0.95;
      body.material = h.alive
        ? (h.team === "blue" ? mats.blue : mats.red)
        : (h.team === "blue" ? mats.blueDead : mats.redDead);
      //  肩塊只在活著時出現：屍體是一具橫躺的膠囊，多一塊方塊只會變回「色塊」
      if (shoulder) shoulder.visible = h.alive;
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
  const labelRef = useRef();

  useLayoutEffect(() => {
    register(hero.id, {
      root: rootRef.current, body: bodyRef.current, shoulder: shoulderRef.current,
      bar: barRef.current, ring: ringRef.current, deathMark: deathMarkRef.current,
      label: labelRef.current,
    });
    return () => register(hero.id, null);
  }, [hero.id, register]);

  const team = hero.team === "blue" ? "blue" : "red";
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
      <mesh ref={bodyRef} geometry={geo.body} material={team === "blue" ? mats.blue : mats.red}
        position={[0, HERO.height / 2 + HERO.radius, 0]} castShadow={false}
        frustumCulled={false} userData={{ part: "hero-body" }} />
      {/* 肩塊：讓剪影不只是膠囊，遠看能分辨正面 */}
      <mesh ref={shoulderRef} geometry={geo.shoulder}
        material={team === "blue" ? mats.blueDark : mats.redDark}
        position={[0, HERO.height * 0.86, HERO.radius * 0.45]}
        frustumCulled={false} userData={{ part: "hero-shoulder" }} />
      {/* 頭頂血條（背板 + 前景） */}
      <group position={[0, HERO.barY, 0]}>
        <mesh geometry={geo.bar} material={mats.barBg}
          scale={[HERO.barW * 1.08, HERO.barH * 1.5, 1]} renderOrder={20} frustumCulled={false} />
        <mesh ref={barRef} geometry={geo.bar}
          material={team === "blue" ? mats.barBlue : mats.barRed}
          scale={[HERO.barW, HERO.barH, 1]} position={[0, 0, 0.01]} renderOrder={21}
          frustumCulled={false} userData={{ part: "hero-hpbar" }} />
      </group>
      {showLabel && (
        <Html position={[0, HERO.barY + 1.5 * S, 0]} center distanceFactor={190}
          style={{ pointerEvents: "none" }}>
          <div ref={labelRef} style={{
            font: "700 12px ui-monospace,monospace", whiteSpace: "nowrap",
            color: team === "blue" ? "#bcdcff" : "#ffc9c2",
            textShadow: "0 1px 3px rgba(0,0,0,.9)",
          }}>
            <span style={{ opacity: 0.75 }}>Lv{hero.level}</span> {hero.displayName}
          </div>
        </Html>
      )}
    </group>
  );
}
