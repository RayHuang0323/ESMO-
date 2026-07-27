# MOBA Runtime Map 座標契約與接線架構（Milestone H.1）

本文件說明「正式戰鬥畫面」如何使用 G.15 系列產出的新地圖，以及為了避免四套座標
各自為政而訂立的單一座標契約。

---

## 1. 接線前的四套座標來源

H.1 開始前，專案裡有四個地方各自在做「模擬座標 → 畫面」的換算：

| # | 來源 | 換算內容 | 風險 |
|---|---|---|---|
| ① | `src/gameData.js` | `worldX(x)=(x−110)×1.7`、`worldZ(y)=(y−110)×1.7`、`mapNormX/mapNormY` | 真相來源，本身沒問題 |
| ② | `src/MobaView3D.jsx` | `const wx = worldX, wz = worldZ`（同一份，只是改名） | 換名之後不易看出它與 ① 同源 |
| ③ | `src/battle/moba/map/MobaMapBlockout.jsx` | 走 `coordinateMapping.js` 的 `toWorld()` | 正確，但當時 `coordinateMapping` 只轉發三個符號 |
| ④ | 小地圖 / HUD（`GameView.jsx` 等） | 各自呼叫 `mapNormX` 做 0–1 正規化 | 散落在 JSX 裡 |

**實際上四者的數學是同一套**（全部源自 `gameData`）。真正的風險不是算錯，而是
「換算散落在多個 JSX 內」：只要有人在元件裡手寫一次 `(x−110)*1.7`，兩套畫面就會分岔，
而且不會有任何測試抓到。

---

## 2. 最終採用的統一座標契約

檔案：**`src/battle/moba/map/coordinateMapping.js`**
（依既有架構擴充，未另建 `mobaMapCoordinateContract.js`，避免出現第二份契約。）

### 2.1 座標系定義

- **模擬座標 sim**：`x, y ∈ [0, 220]`，中心 `(110, 110)`，x 向右、y 向下。
  這是 `gameData` / `LogicEngine` / `snapshot` 使用的座標。
- **世界座標 world**：three.js 右手系。`X = worldX(sim.x)`、`Z = worldZ(sim.y)`、
  `Y = 高度`（模擬沒有高度概念，高度一律由呈現層決定）。

### 2.2 Simulation → World 轉換

```
world.x = (sim.x - 110) * 1.7
world.z = (sim.y - 110) * 1.7
WORLD_SCALE = 1.7
```

契約 API：

| 函式 | 用途 |
|---|---|
| `simToWorld(p, h)` | sim `{x,y}` → world `{x,y,z}` |
| `worldToSim(w)` | world `{x,z}` → sim `{x,y}`（相機邊界、點選命中） |
| `scaleLen(u)` / `worldLenToSim(u)` | 長度雙向換算 |
| `inBoundsSim(p)` / `clampSim(p)` | 座標有效性檢查與夾回 |
| `MAP_CENTER_SIM` / `MAP_CENTER_WORLD` / `MAP_HALF_WORLD` | 地圖中心與半幅（相機邊界） |
| `laneSim` / `laneAtSim` / `baseSim` / `fountainSim` / `pitSim` / `campsSim` / `riverSim` | 具名地標存取 |
| `COORDINATE_CONTRACT` | 給文件與 verifier 用的契約摘要 |

### 2.3 藍紅鏡射方式

兩方基地是**繞地圖中心 180° 旋轉**（不是鏡面翻轉）：

```
mirrorSim(p) = { x: 220 - p.x, y: 220 - p.y }
```

地圖的 blueprint（`mapBaseBlueprint` / `mapBaseFrame`）也是用同一條規則：藍方算一次，
紅方一律由 `mirrorBaseItems()` 產生，不跑第二次生成程式。

### 2.4 硬規則

> 元件（JSX）內**不得**再出現任何座標 magic number。
> 新地圖 Runtime、Runtime Adapter、英雄定位一律透過本契約檔取用換算。

`tools/check_moba_runtime_map_h1.mjs` 會檢查 `MobaMapBlockout` 與 `MobaRuntimeView3D`
都有引用 `coordinateMapping.js`。

---

## 3. Runtime Adapter 的責任

檔案：**`src/battle/moba/map/mobaRuntimeMapAdapter.js`**

輸入 `LogicEngine.snapshot()`，輸出 Renderer 可直接使用的資料。

| 責任 | 說明 |
|---|---|
| 攤平 snapshot | `towers` 是物件（主堡混在裡面）、`dragon`/`baron` 是獨立欄位、營地在 `objectives[]`（v3 才有）⇒ 一律轉成三個陣列：`heroes` / `structures` / `objectives` |
| 座標換算 | sim → world 一律走契約檔；輸出同時保留 `position`(sim) 與 `world` |
| 正規化缺失欄位 | `displayName` 缺就退回 role 名；`facing` snapshot 沒有 ⇒ 由前後幀位移推算 |
| 防呆 | 保證沒有 NaN / Infinity / undefined position；壞座標**夾回地圖內並標記 `clamped`**，不默默丟掉物件（丟掉會讓「10 名英雄」變 9 名，比畫錯更難查） |
| 誠實標記補值 | 舊規則沒有 `objectives[]` 時，dragon/baron 位置取自 `gameData.PITS`，標記 `fallbackPosition: true` |
| Replay 相容 | 只讀 snapshot、不 tick、不 import LogicEngine ⇒ 現場對戰與 Replay 走同一支 |

### 輸出欄位

- **hero**：`id / team / role / playerId / championId / displayName / position / world /
  facing / hp / maxHp / hpRatio / alive / level / kills / deaths / assists / targetId /
  actionState / respawnIn / clamped`
  ⚠ snapshot 的 `hp` 本來就是 **0–1 比例**、且不含絕對血量，因此 `maxHp = 1`、`hp = hpRatio`。
  這是刻意的：與其編一個假的絕對值，不如讓消費端只看得到比例。
- **structure**：`id / type("tower"|"nexus") / team / lane / tier / position / world /
  hp / maxHp / hpRatio / alive / clamped`
- **objective**：`id / type / presentationKey / team / position / world / hp / maxHp /
  hpRatio / alive / respawnState / respawnIn / fallbackPosition / clamped`

---

## 4. Renderer 禁止承擔的責任

`MobaRuntimeView3D` / `MobaRuntimeMap` / `MobaRuntimeHeroes` / `MobaRuntimeStructures`：

- ❌ 不得 `import LogicEngine`、不得呼叫 `tick()`
- ❌ 不得自行模擬英雄移動或 AI
- ❌ 不得寫回 store 或 snapshot（相機狀態只活在元件內）
- ❌ 不得深入讀取 snapshot 內部結構（一律經 Adapter）
- ❌ 不得引入任何 Debug UI（可走性疊層、鏡射檢查、座標標記）

以上每一條都有對應的檢查在 `tools/check_moba_runtime_map_h1.mjs`。

---

## 5. Debug 與正式 Runtime 的差異

| | Debug 地圖頁 | 正式 Runtime |
|---|---|---|
| 進入 | `?debug=moba-map-blockout` | `AppShell` 的 battle 畫面（`GameView`）；截圖用 `?debug=moba-runtime-battle` |
| 元件 | `src/debug/MobaMapBlockout/MobaMapPreview.jsx` | `src/battle/moba/render/MobaRuntimeView3D.jsx` |
| 共用 | **底層地圖元件與資料**：`MobaMapBlockout` + `mapTerrainShapes` | 同左 |
| 不共用 | 圖層開關 / 可走性疊層 / 鏡射檢查 / 座標標記 / 效能 HUD / 固定截圖模式 | 一律沒有 |
| 塔 | 由 `MobaMapBlockout` 依 `mapTerrainShapes` 畫（靜態呈現） | `show.towers=false`；改由 `MobaRuntimeStructures` 依 **snapshot** 畫 ⇒ 不會有兩套塔 |

**塔／主堡的位置與狀態如何合併**：
- 狀態（hp / alive）→ snapshot（唯一真相）
- 位置 → 地圖的呈現座標（`mapTerrainShapes` 的 `T.towers`，id 與 snapshot 完全相同：
  `blue_top_0` … `red_bot_2` / `blue_nexus` / `red_nexus`）
- 兩者以 **id** 對應，不靠順序猜。塔因此站在自己的塔基與廣場上，狀態卻是真的。

---

## 6. Replay 接線方式

- Replay 存的是 snapshot frame（`replayBuffer` / `replayPresentationSource`），
  **schema 未改動**。
- Replay 與現場對戰走**同一個 Adapter**、同一套 Runtime Renderer、同一份座標契約。
- `tools/check_moba_runtime_map_h1.mjs` 有一條檢查：同一份 snapshot 經過 JSON 往返
  （模擬 replay 的序列化）後，Adapter 輸出的英雄座標必須逐點相同。
- ✅ **H.1-close 已完成接線**：`MobaReplayScreen` 依 `loadMapPresentation()` 選擇呈現模式。
  `runtime-v2` 時掛 `MobaRuntimeView3D`，並把 `createReplaySource(replay)` 從 `source` prop
  傳進去；`RuntimeFrameFeeder` 的資料源預設是 `useGameStore`，傳入 `source` 時改讀它
  ⇒ **現場對戰與重播是同一個 Renderer、同一支 Adapter、同一份座標契約**，
  沒有第二套座標轉換。`legacy` 模式維持原本的 `MobaView3D`，一行未改。
- Replay frame 攤開後的等級欄位是 `lv`（現場 snapshot 是 `mlv`）⇒ Adapter 兩個都收
  （`num(p.mlv ?? p.lv, 1)`），否則重播時所有英雄都會顯示 Lv1。schema 仍未改動。
- 實測證據：`review/moba-runtime/h1/09_runtime_replay.png`（真實 Chrome），
  以及 `shot_stats.json` 內該張的 `replayPauseStable` / `replaySeekChangedPositions`。
- ⚠ **已知限制**：重播畫面是**疊在**仍然掛載的 `GameView` 之上開啟的
  ⇒ 底下那個 3D Canvas 仍在運作（`shot_stats.json` 的 `canvasCount` 實測為 3）。
  會多耗一份 GPU、且底層戰鬥的英雄名牌可能從邊緣露出來。
  要根治得改 `BattleEndScreen` / `GameView` 的掛載方式，**不在 H.1 範圍**，列入 H.2。

---

## 7. Feature flag 使用方式

檔案：`src/battle/moba/mobaMapPresentation.js`

模式：`legacy`（既有 `MobaView3D`）／`runtime-v2`（新地圖）。

優先序（前者勝出）：

1. URL：`?mapPresentation=runtime-v2` 或 `legacy`
2. `localStorage`：`esmo.mobaMapPresentation`（畫面左上角的「地圖 新版／舊版」鈕會寫入）
3. 建置旗標：`VITE_MOBA_RUNTIME_MAP_V2=true`
4. 預設：`legacy` ⇒ **沒有任何設定時行為完全不變**

兩個模式讀的是 `useGameStore` 的同一份 `prev` / `snapshot`，只有一個 `LogicEngine`。
切換模式不會改變比賽結果，也不會改變 `replayBuffer` 的 schema。

---

## 8. 未來正式 Hero Model 如何替換 Prototype

`MobaRuntimeHeroes.jsx` 目前的英雄是 **Prototype**：膠囊本體 + 肩塊 + 陣營色 +
頭頂血條 + 等級 + 名稱 + 腳底選取環。刻意低成本，不是最終模型。

替換步驟（H.3+ Hero Asset Pipeline）：

1. 保留 `HeroUnit` 的外層 `<group ref={rootRef}>`——位置與朝向由它負責，
   每幀由 `useFrame` 從 `frameRef` 寫入，換模型不需要動這一層。
2. 只把 `geo.body` / `geo.shoulder` 兩個 mesh 換成載入的 GLB 或 InstancedMesh。
3. 血條、選取環、名稱標籤維持不變（它們吃的是 Adapter 的 `hpRatio` / `level` /
   `displayName`，與模型無關）。
4. `championId` 已在 Adapter 輸出，可直接拿來挑對應的角色模型。

---

## 9. 效能設計

- 地圖靜態物件在 `useRuntimeMapData()` 用 `useMemo` 只建一次，React re-render 不重建 geometry。
- 英雄的 geometry / material 只建立一次，10 名英雄共用。
- **每幀位置走 `frameRef`（不觸發 React）**；只有「掛載結構」改變（誰死了、升級、
  塔被推掉）才 `setState` 重掛 ⇒ 10 名英雄移動不會每幀重建整張地圖。
- 手機低階：關閉裝飾岩與草叢、降 dpr、關抗鋸齒與塔陰影；
  **不**移除英雄、塔、主堡或任何關鍵戰鬥資訊。
