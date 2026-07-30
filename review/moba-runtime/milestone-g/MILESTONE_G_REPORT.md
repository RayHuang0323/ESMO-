# Milestone G Report — 戰鬥隊伍面板與手機地圖操作

日期：2026-07-31

狀態：**本機實作與驗證完成；未 push、未部署，等待 Ray 驗收。**

rollback tag：`milestone-g-baseline` → `e6325f0`（＝ Milestone F 完成並已部署的狀態）

性質：**純呈現層**。引擎、公平性、地圖幾何、碰撞、Replay contract 一行都沒動
（verifier §4 有靜態斷言；`regress`／`regress2` 與 Milestone F 逐值相同）。

## 1. 戰鬥隊伍面板

### 1.1 「沒有血條」的真相

面板其實**有**血條 —— 是 Legacy `StatBars` 的 **3px 寬垂直細條**。資料是對的，
但在 390px 手機上根本看不出那是血條，等同沒有。

修法：換成有寬度、有顏色分級、有數字的**水平血條**：

- 綠（>55%）／琥珀（25–55%）／紅（<25%）三段
- 右側百分比數字；陣亡時整條轉暗並直接顯示**復活倒數秒數**
- 仍只讀 `snapshot.players[].hp`（0–1），沒有新增任何統計

### 1.2 戰鬥狀態與重要秒數

新增狀態晶片，全部取自 snapshot 既有欄位，沒有就不顯示：

| 來源欄位 | 顯示 |
|---|---|
| `dead` / `respawn` | `☠ 12s`（復活倒數） |
| `rc`（回城引導剩餘） | `回城 6s` |
| `state`（引擎行為狀態） | 團戰／撤退／追擊／推塔／回防／打野／抓人… |
| `statusEffects`（紅 Buff 減速） | `緩 3s` |
| `buffs` | 紅／藍／龍×N／巴 Ns（既有，保留） |

### 1.3 點英雄 → 以戰鬥資訊為主

原本點英雄開的是 `HeroDetailPanel`（生涯／熟練／Mastery）——戰鬥中資訊太少、
個人資訊太多。新增 `BattleHeroSheet`，把優先序倒過來：

1. **血量與狀態**（最上面：血條、狀態、Buff、減速、復活倒數）
2. **召喚師技能**：閃現／懲戒的**即時冷卻**（讀 `snapshot.players[].sp`，不是靜態圖示）
3. **英雄技能**：P/Q/W/E/R（CHAMPIONS_100 靜態資料；**明示引擎不模擬個別技能冷卻，
   所以不顯示假 CD**）
4. **本場數據**：KDA、金錢、英雄傷害、治療、推塔傷害、本場經驗、目前意圖（D-fix2 decision）
5. 底部一顆按鈕「英雄生涯 · 熟練與完整能力 →」才進原本的生涯面板

### 1.4 順手修掉的疊層問題

`BLUE BUFF · 藍`、`首次刷新 23s` 這類 3D 世界標籤會**壓在英雄面板文字上**
（Milestone E 驗收時就記錄過的既有問題）。根因是 drei `<Html>` 的預設
`zIndexRange` 上限是 16，與面板同層、又比面板晚繪。
新增 `Z.sheet = 18`（低於終局 20、重播 60），兩個面板一起收斂到 `battleLayout` 的 Z 表。

## 2. 手機地圖操作

### 2.1 ⚠ 往上滑弄丟整場比賽（最嚴重）

根因：canvas **沒有宣告 `touch-action`**。瀏覽器會先「觀望」這一次觸控要給頁面
還是給元件，於是 (a) 拖曳有延遲、跟手差，(b) 往上滑被判定成頁面過捲 ⇒
**觸發下拉重新整理，整場比賽消失、退回主選單**。

修法：
- canvas 宣告 `touch-action: none` + `overscroll-behavior: none`
- **戰鬥畫面掛載期間**把 `html`／`body` 的 `overscroll-behavior-y` 設為 `none`，
  卸載時原樣還原（手指落在 HUD／面板等 DOM 上時，過捲會沿捲動鏈冒泡到 document）
- 長按不再跳出系統選單

### 2.2 拖曳不靈敏、視角移動慢

兩個原因，都修了：

1. 上面的 `touch-action` 一宣告，瀏覽器不再介入手勢仲裁 ⇒ 延遲消失（最大的一項）。
2. **兩軸共用同一個位移係數**：地面被 52° 俯角壓縮，同樣的螢幕垂直位移對應到的
   世界距離比水平方向大 ⇒ 直向拖曳明顯比橫向「鈍」。現在垂直分量除以 `sin(pitch)`。

### 2.3 操作容易中斷

- 進入雙指捏合時舊碼把單指拖曳狀態清成 `null` **且不重建** ⇒ 放開一指之後手勢就斷了，
  必須整個放開重來。現在放開一指會由**剩下那根手指接續拖曳**。
  （續拖的 pointer 由第一個進來的事件認領——`touch.identifier` 與 `pointerId`
  不是同一組編號，不能直接沿用。）
- 雙指現在**同時可縮放與平移**（以兩指中心帶動視角），不必「縮放→放開→再拖一次」。
  合併成 `cameraStore.userViewTo` 一次 set()，捏合時不會每幀觸發兩輪訂閱通知。

### 2.4 縮放範圍

`zoom` 與相機距離的關係是 `distance = 175 × 3.4 / zoom`：

| | 舊 | 新 |
|---|---|---|
| `ZOOM_MIN` | 1.6 | **1.06** |
| 最遠距離 | 372 | **561** |
| `ZOOM_MAX` / 最近距離 | 9 / 66 | 不變 |

1.06 = 595 / 560，**剛好對到相機本來就設計好的 `CAM.distMax = 560`**
（`far: 1000` 也是照這個值算的）⇒ 放寬的是 zoom 下限，不是相機的設計包絡，
`pitch` / `fov` / `near` / `far` 全部沒動。

### ⚠ 誠實揭露：「完整地圖」在 390px 直式只做到一半

390×844 直式視窗要把整張地圖**橫向**收滿需要距離 **977**，而相機設計上限是 560。
現在的狀態是：

- **縱向**：整張地圖已可完整看到（需要 356 ≤ 561）
- **橫向**：最遠仍只涵蓋約 57%（561 / 977）

要真的橫向也全覽，必須把 `CAM.distMax` 拉到約 1040 並同步放大 `far`。
**我沒有這樣做**：實算 16-bit 深度量化會從 `Δz 0.132` 惡化到 **0.460（約 3.5 倍）**，
而那正是 H.2-flicker 花一整個 milestone 修的「Android 單位整批閃爍消失」的成因。
用「可能弄壞真機顯示」換「橫向再多看一點」不划算。

若 Ray 認為橫向全覽是必要的，可選：(a) 直接看小地圖（本來就是全圖總覽）；
(b) 另開一輪處理相機遠平面與深度精度（需在 Android 真機重驗 H.2-flicker）。

## 3. 修改檔案

新增：
- `src/battle/ui/BattleHeroSheet.jsx`（戰鬥資訊面板）
- `tools/check_moba_milestone_g.mjs`（30 條安全網）
- `tools/shot_milestone_g.mjs`（真瀏覽器驗收，含 CDP 觸控事件）

修改：
- `src/battle/ui/BattleHeroStrip.jsx`（水平血條、狀態晶片、改開戰鬥資訊面板、測試錨點）
- `src/battle/ui/HeroDetailPanel.jsx`（改用 `Z.sheet`）
- `src/battle/ui/battleLayout.js`（新增 `Z.sheet = 18`）
- `src/battle/moba/render/MobaRuntimeView3D.jsx`（手勢：touch-action／俯角補償／雙指平移／續拖）
- `src/battle/cameraStore.js`（`ZOOM_MIN`、新增 `userViewTo`）
- `src/GameView.jsx`（戰鬥期間關閉頁面下拉重新整理）

## 4. 驗證

| 驗證 | 結果 |
|---|---|
| `check_moba_milestone_g`（新增） | **30/30 PASS** |
| `tools/shot_milestone_g`（真瀏覽器，桌機＋390×844） | **20/20 斷言、5 張截圖** |
| `check_moba_camera_replay29b6` | 16/16 PASS（zoom clamp 仍以 ZOOM_MIN/MAX 為界） |
| `check_moba_controls29b3` | 18/18 PASS |
| `check_moba_milestone_f` | 30/30 PASS |
| `check_moba_milestone_e` | 49/49 PASS |
| `regress` | 15/15、平均 23.5 分、擊殺 29.8（**與 Milestone F 逐值相同**） |
| `regress2` | 節奏門檻 8/8 |
| production build | 2597 modules、exit 0 |

`regress`／`regress2` 逐值不變是「這一輪確實只動呈現層」的硬證據。

### 瀏覽器實測到的關鍵斷言

- canvas `touch-action: none` ✅、`html`/`body` `overscroll-behavior-y: none` ✅
- 以 CDP 送**真的觸控事件**單指下拖：地圖 pan 由 `z 60.3 → −65.6`，
  且 `window.scrollY` 完全沒變 ⇒ **不會再觸發下拉重新整理** ✅
- 縮放可達 `dist 561`（舊上限 372）✅、近距離仍可到 `dist 66` ✅
- 桌機與手機的隊伍面板都顯示血條百分比 ✅、無水平溢出 ✅
- 點英雄開的是「戰鬥資訊」且含「本場數據」與生涯入口；生涯入口開得到 MASTERY ✅

## 5. 未驗證（不宣稱通過）

1. **Android 真機的手感**：`touch-action` 與係數修正在桌面 Chrome 的觸控模擬下
   量得到「有沒有平移、會不會捲動」，但**跟手的細緻手感、慣性、低 FPS 下的表現
   只有真機能判斷**。這正是 Ray 最初回報的來源，建議部署後在真機確認。
2. 下拉重新整理是在桌面 Chrome 的觸控模擬下驗證「頁面不捲動」；
   **真實 Android Chrome 的 pull-to-refresh 行為仍需真機確認**。
3. 長時間人眼觀感（面板資訊是否過密、戰鬥中是否好讀）。

## 6. 回退

- 只退面板：revert 面板那一個 commit
- 連同手勢與縮放：再 revert 手勢 commit
- 比對基準：`git show milestone-g-baseline`（＝`e6325f0`）
- 禁止 `git reset --hard`
