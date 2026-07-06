# Sprint 04 — Battle Presentation Layer 整合指南

把 Sprint03 已完成的 Battle Engine 真正呈現在玩家眼前。**引擎邏輯不重寫、不新增假資料**；所有畫面資料一律來自 `snapshot` / `BattleEventTracker` / MVP。

---

## 1. 檔案與相依

```
gameData.js            共用常數/工具（既有，未改）
LogicEngine.js         ★唯一引擎觸碰：3 處純附加儀器化（k/d/gold），行為零改變
   ↑
useGameStore.js        核心橋（未改一行）
   │  snapshot 流（zustand subscribe）
   ▼
battle/
  battleEvents.js      事件推導：快照差分 → Timeline 事件 + 即時 MVP（純 JS）
  battleReducer.js     ingestReducer 純函數：事件累積 / 浮動佇列 / 龍巴龍計數 / 推塔（可 Node 驗）
  battleStore.js       獨立 zustand store（zustand 包裝 reducer + tracker）
  battleFocus.js       computeFocus：鏡頭焦點推導（純 JS，可 Node 驗）
  useBattleFeed.js     接線：核心 snapshot 流 → battleStore.ingest（呈現層唯一接觸核心處）
  ui/
    BattleHUD.jsx              比分/Timer/推塔/龍/巴龍/Gold/勝率/即時MVP
    BattleTimeline.jsx         側欄即時戰報事件流
    BattleFloatingText.jsx     MOBA 式大字：First Blood/連殺/ACE/塔/龍/巴龍/Victory
    BattleScoreboard.jsx       戰後記分板（真實 KDA/Gold + MVP 標記）
    BattleCameraController.jsx  R3F：OrbitControls target/zoom 跟隨戰鬥焦點
    BattlePresentationLayer.jsx DOM 呈現層總成（單一掛載點）
```

**架構邊界維持**：LogicEngine 不 import React/zustand/DOM；核心 `useGameStore` 一行未改；呈現層只讀快照、不回寫核心（`useBattleFeed` 是唯一接觸點，單向）。

---

## 2. 資料流

```
LogicEngine.tick(dt) ──► snapshot()  ──►  useGameStore.pushFrame  ──►  useGameStore.snapshot
                                                                              │
                          useBattleFeed (subscribe)  ◄───────────────────────┘
                                     │ ingest(snap)
                                     ▼
                          BattleEventTracker.update(snap) ─► 新事件[]
                                     │
                          ingestReducer ─► { events, floating, mvp, derived }
                                     ▼
                          useBattleStore  ──►  BattleHUD / Timeline / Floating / Scoreboard（DOM）
                          computeFocus(snap) ──►  BattleCameraController（R3F, Canvas 內）
```

同一份 `LogicEngine` 可搬 Node 當權威伺服器；多人版把本機 tick 換成 `socket.on("snapshot", …)`，呈現層完全不動（`useBattleFeed` 照收 `useGameStore.snapshot`）。

---

## 3. GameView 整合（DOM 層）

`GameView.jsx` 把原本內聯在殼裡的 HUD/比分/勝率/結算換成單一掛載點：

```jsx
import MobaView3D from "./MobaView3D.jsx";
import BattlePresentationLayer from "./battle/ui/BattlePresentationLayer.jsx";

// roster 可選：{ [playerId]: { player: "選手名", hero: "英雄名" } }；缺省退回 id / 職業名
export default function GameView({ roster = null }) {
  const { playing, start, stop } = useLocalServer();
  return (
    <div style={{ position: "relative", /* …原樣式… */ }}>
      <MobaView3D battleFollow={playing} />       {/* 見 §4 patch */}
      <BattlePresentationLayer roster={roster} />  {/* HUD/Timeline/Floating/戰後記分板 */}
      {/* Start/Stop 控制鈕保留原樣 */}
      <Minimap />
    </div>
  );
}
```

`BattlePresentationLayer` 已內含戰後記分板（`over` 時彈出），原本殼裡的 `hud.over` 結算區塊可移除。

---

## 4. MobaView3D patch —【B】Hero Overlay +【D】Camera

> 這兩項屬 R3F，需在你的 Vite 專案內生效（沙盒無 R3F）。以下為精確插入點。

### 4-1【D】相機跟隨（掛控制器）

`MobaView3D` 的 `<OrbitControls>` 已 `makeDefault`（drei 會註冊 `state.controls`）。在 `<MobaScene/>` 之後、`<Canvas>` 內加一行，並讓跟隨時關掉 autoRotate：

```jsx
import BattleCameraController from "./battle/ui/BattleCameraController.jsx";

export default function MobaView3D({ mapTexture = null, autoRotate = true, battleFollow = false, debug = false }) {
  return (
    <Canvas /* …原樣… */>
      {/* …原樣… */}
      <OrbitControls makeDefault autoRotate={autoRotate && !battleFollow} autoRotateSpeed={0.6}
                     enablePan={debug} minZoom={1.6} maxZoom={9} target={[0,0,0]} />
      <MobaScene mapTexture={mapTexture} />
      <BattleCameraController follow={battleFollow} />   {/* ← 新增 */}
      {/* EffectComposer 原樣 */}
    </Canvas>
  );
}
```

跟隨啟用時，鏡頭會平滑聚焦到「資源坑爭奪 / 最大交戰聚類 / 我方重心」；玩家仍可拖曳（放開後續跟隨）。若不想要跟隨，`battleFollow={false}` 即完全還原原本行為。

### 4-2【B】英雄頭頂 Player 名 + KDA（擴充既有 billboard）

`MobaView3D` 每位英雄已建 HP bar（3D）與職業字標。加一個「Player 名 + KDA」sprite，僅在 k/d 變動時重繪（避免每幀重建 texture）。

**(a) 新增可重繪的文字 sprite helper**（放在 `makeLabelSprite` 附近）：

```js
function drawKdaTexture(text) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  g.font = "bold 30px system-ui,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,0.85)"; g.strokeText(text, 128, 34);
  g.fillStyle = "#fff"; g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function makeKdaSprite() {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: drawKdaTexture(" "), transparent: true, depthTest: false }));
  sp.scale.set(4.2 * S, 1.05 * S, 1); return sp;
}
```

**(b) 英雄建立處**（`heroObjs[p.id] = { … }` 前）新增 sprite 並存 lastKD：

```js
const kda = makeKdaSprite(); kda.position.y = 5.9 * S; root.add(kda);
// …
heroObjs[p.id] = { root, cap, mat, ring, ringMat, hpGrp, fg, fgMat, topper,
                   kda, lastKD: "", seed: Math.random() * 7 };
```

**(c) useFrame 英雄段**（更新 hp 之後）新增：僅在 KDA 字串變化時重繪，並讓 sprite 面向相機、隨戰爭迷霧顯隱：

```js
const label = `${roster?.[p.id]?.player ?? p.id.toUpperCase()}  ${np.k}/${np.d}`;
if (label !== o.lastKD) {
  o.lastKD = label;
  o.kda.material.map.dispose();
  o.kda.material.map = drawKdaTexture(label);
  o.kda.material.needsUpdate = true;
}
o.kda.visible = !dead && o.root.visible;
```

> `roster` 若要進 MobaView3D，透過 prop 傳入即可（缺省退回 `id`）。HP 百分比條已存在（3D billboard），KDA 由此 sprite 補上；**等級目前引擎未輸出 → 留待 Sprint05**（見技術債）。

---

## 5. 驗證邊界（誠實聲明）

- **已 Node 全驗證（真引擎、多 seed、逐幀）**：`LogicEngine` 儀器化等價、`battleEvents`、`battleReducer`、`battleFocus`。
- **未在此環境編譯**：所有 `.jsx`（沙盒無 React/R3F/Vite）。已做結構審查與資料契約對齊，**落地後需在你的 Vite 專案 `npm run dev` 本機驗證**。
