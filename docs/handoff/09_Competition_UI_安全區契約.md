# Competition / Season UI 安全區契約

> 建立：2026-08-23（UI-4A）／更新：UI-4B
> 對象：**所有會 merge 或 commit 到本 repo 的 AI 工作線與人**（Codex、Claude、其他）
> 目的：這一區有一條正在進行的 UI 工作線。**在它併入 `main` 之前，其他人不要改這裡。**

---

## 一、為什麼需要這份契約

Claude Code 這條線從 UI-1 到 UI-4B 做了一件跨多個檔案的事：

> 把「賽事」從一個只有 MOBA 的頁面，改成 **MOBA / CS 共用的 Competition Hub**，
> 並把 CS 賽季的入口從 CS 練習賽頁搬進去。

這件事的特性是**牽一髮動全身**：入口、路由、兩個賽事頁、共用元件、驗證標記
（`data-testid`）彼此互相依賴。任何一個檔案被另一條線平行修改，合併時都不是
「解一下衝突」就好，而是**行為會壞掉但 build 仍然過**——最貴的那種壞法。

Ray 已在 `04_Roadmap.md` 與 `08_目前待辦與風險.md`（commit `e9996a7`）記載：
Codex UI Migration 暫停開新 Sprint，暫停期間不碰 `AppShell` / `GameRouter` /
Store / contracts / CS / Season / Competition。**本檔是那段話的檔案級清單。**

---

## 二、🔴 紅區：請完全不要動（Claude Competition 線持有）

改到這些檔案，幾乎一定會與這條線衝突。

| 檔案 | 這條線在它身上做了什麼 |
|---|---|
| `src/screens/manage/CompetitionScreen.jsx` | UI-1 接受 `mode`／`gameMode`；UI-4A 改用共用元件 |
| `src/screens/fps/CsCompetitionHubScreen.jsx` | UI-3 成為 CS 賽季主入口（開季／出戰／返回）；UI-4A 改用共用元件 |
| `src/screens/manage/CompetitionHubScreen.jsx` | UI-2 新建：賽事中心的殼與 MOBA／CS 分頁 |
| `src/screens/competition/**`（整個目錄） | UI-4A 新建共用元件；UI-4B 再加共用外框與 `competition.css` |
| `src/screens/fps/CsPrepScreen.jsx` | UI-3 移除了 `CsLeagueFixtureEntry`（賽季責任搬走） |

### ⚠ 已知的既存衝突（尚未解決）

本地分支 `milestone-n-finance` 上的 commit `78f7479`
（"Fix CS roster identity and lineup role semantics"，2026-08-23）也改了
`src/screens/fps/CsPrepScreen.jsx`。那個 commit 建立在**落後 `main` 兩百多個
commit 的基底**上，且尚未推送。

> 這兩邊合併時 `CsPrepScreen.jsx` **必定衝突**。
> 合併方向由 Ray 決定，任何一條線都不要自行解。

---

## 三、🟡 黃區：可以改，但必須 additive

這些是多條線共用的熱點。改之前先確認沒有其他線正在寫，且**只新增、不改既有值**。

| 檔案 | 約定 |
|---|---|
| `src/AppShell.jsx` | 路由表。同一時間只有一條線可以新增／刪除 `screen` 分支 |
| `src/ui/designSystem.js` | 只新增 token，不改既有 key 與既有值 |
| `src/ui/theme.js` | 同上；`card()/chip()/btn()` 已凍結，不再新增用法 |
| `src/ui/EsmoIcon.jsx` | 只新增 icon |
| `src/ui/useViewport.js` | 只新增 export |
| `src/platform/profileStore.js` | Competition 線目前**唯讀**；需要新 selector 請先提出，不要順手加 |

---

## 四、🟢 綠區：這條線不碰，請自由使用

Competition 線從 UI-1 到 UI-4B **完全沒有改動**下列範圍，可安心進行：

- `src/screens/DashboardScreen.jsx`、`src/screens/dashboard/**`（Home／Mobile Home）
- `src/screens/manage/RosterScreen.jsx`、`PlayerDetailScreen.jsx`、`src/ui/PlayerUi.*`
- `src/screens/manage/TrainingScreen.jsx`、`TeamDevelopmentScreen.jsx`
- `src/battle/**`（含 CS 對戰、HUD、MR12、`EsportsFPS3D`）
- `src/platform/progress/**`、`src/platform/economy/**`
- `src/LogicEngine.js`、`src/GameView.jsx`、`src/MobaView3D.jsx`

> 這一點是**用 `git diff` 驗證過的**，不是宣稱：
> `git diff fb0c70f..HEAD -- <上列路徑>` 為空。

---

## 五、絕對不要動的驗證標記（`data-testid`）

搬畫面時**標記必須跟著搬**。這些標記被 gate 與 browser smoke 直接讀取，
弄丟不會讓 build 失敗，只會讓驗證假紅或假綠。

| 標記 | 誰在讀 |
|---|---|
| `competition-hub-tabs` / `competition-hub-tab-{moba,cs}` / `competition-hub-panel` | UI-2 殼的 browser gate |
| `cs-hub-day`（賽季副標，UI-4B 起在共用頁首上） | CS 賽事中心 |
| `cs-hub-stage` / `cs-hub-stage-step` | CS 賽事中心 gate、共用元件 gate |
| `cs-hub-standing-row`（含 `data-team-id/rank/me/qualified`） | CS 賽事中心 gate、資料一致性 gate |
| `cs-hub-qualify-line` / `cs-hub-standings` | 資料一致性 gate |
| `cs-hub-today`（含 `data-state`）/ `cs-league-play` / `cs-league-open-season` / `cs-league-resume` | UI-3 的出戰與開季 gate |
| `cs-hub-recap-btn` / `cs-recap-*` | 賽季成績單 gate |
| `moba-competition-standing-row` / `moba-competition-fixture-row` | UI-4A 資料一致性 gate |
| `home-mode-{moba,cs,bracket}` / `home-nav-*` / `home-sheet-*` | Home 的 browser gate（Codex 建立） |

---

## 六、架構紅線（跨線共同遵守）

1. **賽事系統不產生比賽結果**：只產生 Fixture、消費結果。
2. **不得有第二條 MatchSession／Battle pipeline**：正式賽程出賽仍走
   `startFixtureMatch` → 既有 MOBA／CS 賽前流程。
3. **CS 賽季不得自動建立**：`ensureCompetitionSeason("cs")` 只能掛在玩家按的
   按鈕上，不得放進 `useEffect`。（`check_cs_season_contract` 守著）
4. **畫面不算規則**：積分榜、晉級線、Circuit Points、賽季階段一律由
   `competitionView(mode)` 提供；`src/screens/competition/**` 的元件是純呈現層，
   不排序、不累加、不判晉級。（`check_competition_shared_ui` 守著）
5. **不建第二份**：standings、fixture list、season state 各只有一份。
6. **Competition 的樣式收在 `.esmo-comp` 底下**：不動 `:root` / `body` / `*`，
   不改 Home 的 `dashboard.css`，不新增全域 `designSystem` token。
   項目差異只透過 `--comp-accent` 一個變數表達。
   （`check_competition_visual_shell` 守著）

---

## 七、動這一區之前，請先跑這些

```
node tools/check_competition_release_gate.mjs      # 11 項（含 build 與 7 個瀏覽器檢查）
node tools/check_competition_shared_ui.mjs         # 共用元件的純呈現界線
node tools/check_competition_visual_shell.mjs      # 共用視覺外框的結構契約
node tools/browser_check_competition_shared_ui.mjs # 積分榜逐列與 Store 對答案
node tools/browser_check_competition_hub_shell.mjs # 賽事中心殼與 CS 入口
node tools/check_cs_competition_hub.mjs
node tools/check_cs_season_contract.mjs
node tools/check_home_team_contract.mjs
npm run build
```

慢速／手動（約 6–10 分鐘，**不在 default gate 內**）：

```
node tools/browser_check_cs_fixture_natural_finish.mjs --only=bo1
node tools/browser_check_cs_fixture_natural_finish.mjs --only=bo3
```

---

## 八、這份契約什麼時候失效

Competition 線（UI-1 → UI-4B，branch `ui/competition-mode-awareness`）**併入
`main` 之後**，紅區解除。屆時請重新 audit 最新 `main`，再決定下一輪的 UI ownership。

在那之前，如果你的工作**必須**動到紅區，請先停下來告訴 Ray，不要自行解衝突。
