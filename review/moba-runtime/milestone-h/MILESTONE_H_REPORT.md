# Milestone H Report — 英雄選擇進對戰 ＋ 三個呈現修正

日期：2026-07-31

狀態：**本機實作與驗證完成；未 push、未部署。**

rollback tag：`milestone-h-baseline` → `0813594`（＝ Milestone G 完成並已部署的狀態）

## 1. Ban/Pick 第一次真的影響對戰

### 問題

到 Milestone G 為止，選角畫面是**純外觀**。`draftRoster.js` 自己寫著引擎 loadout
走 `HERO_ASSIGN`，選到的英雄只決定 3D 模型、名字與 `BattleResult.heroId`。

### 為什麼一直沒接

`mobaRosterAdapter` 早就算得出英雄側戰力（`calcMobaPower / calcMobaTough`），
但**刻意沒注入**：引擎的 `p.power` 直接乘進 `dmgAmt = p.power * dt * 0.92`
⇒ 注入它等於 damage multiplier，違反 S28 §2 紅線。

### 做法：沿用已驗證的行為層管線

```
S24  戰術     → knobs → engine.configureMatch
S28  選手能力 → mods  → engine.configurePlayers
H    英雄定位 → mods  → engine.configureHeroes     ← 新增，同構
```

新增 `src/battle/moba/mobaHeroProfile.js`（純函式，不 import 引擎、不 import
heroDatabase）。六定位各自有**得也有失**的行為輪廓：

| 維度 | 作用點 | 例 |
|---|---|---|
| `engageDistK` | **站位**：交戰保持距離倍率 | 坦克 0.72（貼前排）／射手 1.20（站後排） |
| `engageAdj` | **進退**：接戰意願（決策分數加項） | 坦克 +0.10／射手 −0.08 |
| `retreatAdj` | **進退**：撤退門檻平移 | 坦克 −0.05（撐久）／射手 +0.06（早退） |
| `focusLowHp` | **目標選擇**：對殘血的偏好權重 | 刺客 +0.22（最高）／坦克 −0.10 |
| `joinAdj` / `objAdj` | **團戰職責**：參團／目標集結傾向 | 輔助 +0.08／刺客 −0.04 |
| `skillWeight` | **技能傾向**：技能就緒對意願的權重 | 法師 1.18／坦克 0.85 |
| `protectAdj` | **團戰職責**：保護低血隊友 | 輔助 +0.20（不管坐哪一路都會護人） |

**紅線遵守**：不輸出 `power`／`tough`，`_heroMod` 不出現在任何傷害／金錢式子
（verifier §4 有專門斷言）。所有維度都有限幅。

### 中性由結構保證，不是碰運氣

未呼叫 `configureHeroes` ⇒ `heroesOn = false` ⇒ 全部相關程式碼短路。

實作過程中我一度在參團機率外面無條件包了一層 `clamp(c + 0, 0.02, 0.98)`——
那在英雄層關閉時**也會**改變邊界值的行為。已改成「有偏移才夾」，
中性變成結構上的保證。並以 `git worktree` 對 `milestone-h-baseline` 實跑
5 顆 seed 完整比對：**逐欄相同 5/5**。

## 2. 三個呈現修正

### 2.1 巴龍坑區一大片淺色平面

根因不是模型：命中閃光把**整個模型**換成 `#fff1b8`（`toneMapped:false`），
小野怪只閃一瞬間沒問題，但打巴龍時多名英雄持續命中 ⇒ `hitAt` 一直被刷新 ⇒
`hit > 0` 幾乎全程成立 ⇒ 直徑約 25 單位的模型整場都是米白、再被 Bloom 吹亮。

修法：巨型目標（`BOSS_TYPES`）**只閃重點色**（眼／胸口核心），本體保留皮膚材質。
受擊回饋仍在（重點色閃爍＋既有的 attack 縮放脈動＋血條）。小野怪維持原本行為。

### 2.2 手機擊殺文字遮住倍率／畫質按鈕

浮動大字原本 `top: 26% / width: 80%`，在 390×844 會壓到右上控制鈕欄
（`SAFE_TOP = 138` 起算的直欄約到 y≈262 ≈ 31%）。手機改為 `top: 38% / width: 70%`，
桌機維持原位不動。瀏覽器實測確認浮動大字起點在控制鈕欄下方。

### 2.3 Replay 固定 runtime-v2

`MobaReplayScreen` 原本跟著 `loadMapPresentation()`（預設 legacy），
而正式 GameView 自 H.1 起固定 runtime-v2 ⇒ 同一場比賽的「現場」與「重播」
是兩套不同外觀的戰場（Milestone E 驗收時就記錄過）。
現在只要該 replay 支援 3D（`canUse3DPresentation`）就一律 runtime-v2；
舊 replay 仍走 legacy 退路，不白畫面。

（過程中一度把 `runtimeMap` 宣告寫在 `use3D` 之前，那是 TDZ、執行時會
ReferenceError 而 build 抓不到；已修正並加了 verifier §25 防止再犯。）

## 3. 驗證

| 驗證 | 結果 |
|---|---|
| `check_moba_milestone_h`（新增） | **31/31 PASS** |
| 真瀏覽器（桌機＋390×844） | **13/13 斷言、5 張截圖** |
| 英雄層關閉 vs `milestone-h-baseline` | **5/5 seed 逐欄相同** |
| `check_moba_milestone_g` | 30/30 PASS |
| `check_moba_milestone_f`／`e` | 30/30／49/49 PASS |
| `check_moba_camera_replay29b6`／`controls29b3` | 16/16／18/18 PASS |
| `check_moba_pacing29b1`（官方公平性） | **25/25 PASS**；位移 10pp ≤ 15 |
| `regress` | 15/15、平均 23.5 分、擊殺 29.8（與 G 逐值相同） |
| `regress2` | 節奏門檻 8/8 |
| production build | 2598 modules、exit 0 |

### 英雄層開啟後的分布（40 seeds，正／反序）

| 指標 | 英雄層關閉 | **英雄層開啟** |
|---|---|---|
| 藍方勝率（正序） | 0.43 | **0.50** |
| 藍方勝率（反序） | — | **0.50** ⇒ 位移 **0pp** |
| 平均時長 | 24.66 分 | 24.61／25.18 分 |
| 平均擊殺 | 34.4 | 33.7／36.5 |
| 團戰中位長度 | 7.13 秒 | 7.25／7.0 秒 |
| 零碎碰撞率 | 0 | 0.01 |
| 無目的遊走率 | 0.20 | 0.20 |

節奏指標全部維持，勝率反而更貼近中線。測試用的定位分布刻意**不對稱**
（藍 坦/刺/法/射/輔，紅 戰/戰/法/射/坦 ＝ 預設名單），仍是 50/50。

## 4. 修改檔案

新增：
- `src/battle/moba/mobaHeroProfile.js`（定位表 → 行為 mods，純函式）
- `tools/check_moba_milestone_h.mjs`（31 條）
- `tools/shot_milestone_h.mjs`（真瀏覽器驗收）

修改：
- `src/LogicEngine.js`（`configureHeroes`／`_heroMod`／決策層五個作用點）
- `src/useLocalServer.js`、`src/GameView.jsx`（把生效名單交給引擎）
- `src/battle/moba/render/MobaRuntimeNeutrals.jsx`（巨型目標命中閃光）
- `src/battle/ui/BattleFloatingText.jsx`（手機浮動大字位置）
- `src/screens/moba/MobaReplayScreen.jsx`（固定 runtime-v2）
- `tools/measure_moba_pacing.mjs`（加 `--heroes`）
- `tools/check_moba_milestone_g.mjs`（§24 改為內容導向，見 §5）

**未改**：公平性／節奏常數表、地圖幾何、碰撞／導航、`MobaReplay.v1`、
`BattleResult.v2`、Milestone E 名單資料流。

## 5. 過程中修掉的兩個「假斷言」

1. **H §19 原本斷言「rng 抽樣次數不變」**——前提是錯的。行為改變會改變
   「哪些分支走到抽樣點」，同 seed 下次數本來就會不同（實測 596 → 657）。
   Milestone F 改移動時也是同樣性質。已改成驗真正的不變量：
   **同 seed + 同定位 ⇒ 完全決定性**，公平性另由正／反序位移獨立驗證。
2. **G §24「未改 LogicEngine」是掃字串「Milestone G」**——H 只要在註解裡提到 G
   就會誤判（我在 `configureHeroes` 寫了「與 Milestone G 逐位元相同」）。
   已改為斷言真正的意思：引擎不該認識任何 G 的呈現概念。
   （H §28 也踩過同一個坑：`mobaNavigation.js` 檔頭寫著舊的「Milestone H.2」。）

## 6. 未驗證（不宣稱通過）

1. **英雄定位的「手感」**：數字證明行為改變了、公平性沒壞，但「選坦克真的感覺
   比較前排嗎」需要人眼長時間觀看。
2. **巴龍修正的實際觀感**：本輪截圖是在開局階段取的，沒有拍到「多人持續攻擊
   巴龍」的那一刻。**建議 Ray 打一場看巴龍團**確認不再是一片米白。
3. Android 真機（沿用 G 的清單）。

## 7. 回退

- 只退呈現三修：revert 呈現那一個 commit
- 連同英雄定位層：再 revert 引擎 commit
- 比對基準：`git show milestone-h-baseline`（＝`0813594`）
