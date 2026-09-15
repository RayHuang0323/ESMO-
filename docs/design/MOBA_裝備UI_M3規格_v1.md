# MOBA 裝備 UI／UX 規格 v1（M3）

> 狀態：Owner 已核准 M3 規劃與 D1–D5（2026-09-15）。本檔是 M3 全部分段的規格；M3a 為本輪實作範圍，
> **M3a 完成後停止，Owner Review 視覺樣張通過才進 M3b**。
> 相關：`docs/architecture/MOBA_裝備UI資料契約_v1.md`（資料唯一來源）、`docs/design/ESMO_UIUX設計原則.md`（主幹 docs，全域通則）、
> `docs/design/MOBA對戰HUD與手機版.md`（對戰 HUD 版面權威）、`docs/design/MOBA_裝備系統_v1.md`（規則）。
> 實作計畫：`docs/design/MOBA_裝備UI_M3a實作計畫_v1.md`。

## 0. Owner 決策（照錄）

| # | 決策 |
|---|---|
| D1 | 新增 `itemsV1` 功能開關，預設 OFF；`useLocalServer` 依開關決定是否 `configureItems`。M2 驗證器 G8 隨之放寬為「只允許受開關保護的呼叫」。 |
| D2 | Replay 照 M0 §8：`MobaReplay.v1` 附加 optional `purchases`／`itemMeta`，版本號不變（M3e）。 |
| D3 | 裝備圖示先用程式產生的 SVG（外框＝階級、圖紋＝流派／主屬性），之後有美術再替換。 |
| D4 | 出裝策略先做全隊一種；個別英雄覆寫延後。對手固定「標準」。 |
| D5 | UI 需要的新純函式放 items 模組，共用 buildPolicy／屬性計算同一來源。 |
| 補 1 | **production 維持預設 OFF**；只在 DEV／test 明確開啟；正式站不能因一般 query 或 UI 操作啟用。正式啟用等 Balance Closure。 |
| 補 2 | **M3a 完成後先停**：交 desktop＋mobile 視覺樣張與截圖，Owner Review 外觀後才進 M3b。 |

## 1. 目標與非目標

**目標**：現代電競 MOBA HUD／Shop／Build UI，mobile-first；玩家（教練視角）一眼看懂「誰有錢、誰成型、下一件是什麼、為什麼這樣買」。

**非目標（整個 M3）**：玩家手動購買／出售；平衡、`dmgK`、收入；改 LogicEngine；正式站啟用；推送或部署。

## 2. 硬規則

1. UI 只讀 `snapshot.items` → `itemsViewModel`／`itemsUiSelectors`。UI 元件**不得** import `itemEconomy`、`combatStatsV1`、`buildPolicy`、`itemRecipes`、`itemsEngineRuntime`，也不得讀 `ledger`、`MILLI` 或自己算金錢／屬性／決策（M3 驗證器掃描）。
2. `snapshot.items` 不存在 ⇒ 裝備 UI 整塊不顯示，不造假（不顯示 0 金、空格）。
3. 色票：共用色一律 `GC`（`src/ui/theme.js`）；裝備專用色（階級外框、流派底色）只放 `src/battle/ui/items/itemsTheme.js`，檔頭說明理由。元件檔不寫十六進位色碼。
4. 響應式判斷只用 `useIsMobile()`（`MOBILE_MAX = 700`）。
5. 動效：只做「回應事件」的遊戲回饋；全部走 `useReducedMotion`，reduced 時直接呈現最終狀態；只動 transform／opacity；單次 ≤ 600ms；不常駐粒子。
6. 手機：可點元素 ≥ 44×44px、不靠 hover、無水平溢出（320／360／390／430／768）、不做多層 nested scroll。
7. 玩家端文字不出現工程術語（ledger、schema、seq…）。

## 3. `itemsV1` 開關（D1＋補 1）

| 層 | 設計 |
|---|---|
| 正式開關 | `FEATURE_FLAGS.itemsV1 = false`（`src/featureFlags.js`）。Balance Closure 才改。 |
| DEV 開啟 | `?itemsDev=1`，由 `src/ui/itemsDevFlag.js` 的 `itemsDevRequested()` 讀取。 |
| 呼叫點 | `useLocalServer.start`：`featureEnabled("itemsV1") \|\| (import.meta.env.DEV && itemsDevRequested())`。 |
| 為何正式站開不了 | 正式 build 的 `import.meta.env.DEV` 被代換成常數 `false` ⇒ `false && …` 被折疊，`itemsDevRequested` 與 `itemsDev` 字串整段不進 bundle；`FEATURE_FLAGS.itemsV1` 是凍結常數 `false`。沒有任何 query、localStorage 或 UI 操作能改它。 |
| 驗證 | M3 驗證器實際跑一次 `vite build` 到暫存目錄，掃描產物：不得出現 `itemsDev`、`ItemsUiGallery`、`ItemInspector`。 |
| test | Node 驗證器直接呼叫 `engine.configureItems`（不經開關）；瀏覽器驗收走 vite dev ＋ `?itemsDev=1`。 |
| 出裝策略 | `useLocalServer` 讀 `opts.buildStrategy ?? "standard"`（M3d 由 Prep 傳入；M3a 先接好欄位）。 |

⚠ `useLocalServer` 不在模擬語意清單；Challenge 未呼叫 `configureItems` ⇒ 仍是 `moba-sim.v4`。

## 4. 資料層增補：`src/battle/moba/items/itemsUiSelectors.js`（D5）

純函式、不改輸入、不讀時間／亂數。

| 出口 | 形狀 | 用途 |
|---|---|---|
| `SLOT_STATES` | `["empty","starter","component","boots","completed"]` | 格子狀態語彙 |
| `GLYPH_KEYS` | 流派 `family:A`…`family:H`、`boots`、`starter`、主屬性 `stat:ad／ap／attackSpeed／critChance／armor／mr／hp／abilityHaste／lifesteal／healShieldPower／regenPctPerSec／moveSpeed` | 圖紋語彙 |
| `itemVisual(itemId)` | `{ itemId, name, tier, family, price, state, glyph }` 或 null | 圖示／格子唯一輸入 |
| `selectHudItems(snapshot)` | `{ [seat]: { side, unspent, completedCount, slots[6]:{ index, itemId, state }, nextItemId, nextRemainingCost, nextProgress } }` 或 null | HUD 與十人列 |
| `coachNotes(view, max=2)` | `[{ code, text }]` | AI 教練筆記（略過定位／策略／物理占比等背景句） |
| `BUILD_STRATEGY_META` | 五種策略 `{ id, label, pitch, traits:{ early, late, survive, counter }(0–5), emblem }` | 戰術卡靜態描述（與 buildPolicy 行為逐條對應，見 §6.9） |
| `previewStrategy({ arch, seatRole, strategy, enemies })` | `{ strategy, arch, early, boots, core[≤3] }` | 戰術卡「這套會怎麼出」預覽，直接呼叫 `buildTargets` |

`nextProgress = remainingCost > 0 ? min(1, unspent / remainingCost) : 1`（取兩位小數；沒有下一件 ⇒ null）。

## 5. 視覺系統：「鍛爐插槽」（Forge Socket）

### 5.1 設計方案與自我修正

- **主題**：裝備是「鑲進英雄身上的插槽」。每一格是切角的金屬插槽，階級由外框金屬質感表達，流派由插槽內底色表達。記得住的東西只有一個：**T3 完成裝的金框與一道掃光**，其餘保持安靜。
- **修正 1**：ui-ux-pro-max 的 design-system 推薦「霓虹紫＋玫紅＋Russo One／Chakra Petch」。拒絕：紫色電競皮是最常見的樣板；兩款字體沒有 CJK 字形（本遊戲介面 95% 是中文）；戰鬥中額外載入 webfont 對 4G 首開不利。改用系統 CJK 字體，個性交給插槽形狀與數字排版。
- **修正 2**：拒絕「同一圓角卡片堆疊」（SaaS 卡片套件）。層級用形狀區分：插槽＝切角八邊形、戰術卡＝單角斜切的長卡、面板＝直角加側色條，圓角只留給膠囊籌碼。
- **修正 3**：拒絕全大寫英文眉標、`A · B · C` 中間點字串、等寬小標籤。數字用系統字體 `tabular-nums` 粗體。

### 5.2 Token（`itemsTheme.js`）

| 名稱 | 值 | 用途 |
|---|---|---|
| 背景 | `GC.bg` `#0a0b0f`／`GC.card` `#13151c`／`GC.card2` `#1a1d26` | 沿用主幹 |
| 金 | `GC.gold` `#fbbf24` | 金錢、T3 外框 |
| 階級外框 | T1 鐵 `#7d8794`、T2 鋼 `#a9c4e4`、T3 金 `#fbbf24`、鞋 青 `#5eead4`、起始裝 銅 `#c98a5a` | 插槽外框與漸層 |
| 流派底色（18% 透明） | A 暴擊 `#f43f5e`、B 攻速 `#f59e0b`、C 刺客 `#a78bfa`、D 戰士 `#f97316`、E 法爆 `#60a5fa`、F 法續 `#22d3ee`、G 坦克 `#34d399`、H 輔助 `#f0abfc` | 插槽內底 |
| 文字 | 主 `#f4f4f5`、次 `rgba(255,255,255,0.62)`、弱 `rgba(255,255,255,0.4)` | 深底對比 ≥ 4.5:1（次級文字只用於 ≥ 11px） |
| 插槽尺寸 | xs 20、sm 30、md 40、lg 48 | xs 給 HUD 十人列、lg 給手機詳情（≥ 44 觸控） |
| 切角 | 插槽 22%；戰術卡右上 14px | clip-path polygon |

字體：`FONT`（系統 CJK）；數字 `fontVariantNumeric: "tabular-nums"`、weight 800。

## 6. 元件規格（`src/battle/ui/items/`）

所有元件只收 view-model／selector 的輸出；沒有資料 ⇒ 回 null 或明確空狀態。

1. **ItemIcon** `{ visual, size }`：SVG 24 viewBox 圖紋（依 `glyph`），`aria-hidden`（旁邊有名稱時）。
2. **ItemSlot** `{ visual|null, size, highlight: "next"|null, selected, onSelect? }`：
   - empty：虛線切角＋淡色「空」。
   - component：鐵／鋼外框。
   - boots／starter：青／銅外框。
   - completed：金色雙外框＋內側微光。
   - next：外圈脈動邊（靜態時為金色虛框）。
   - 有 `onSelect` ⇒ `<button>`，含 `aria-label` 物品名；手機最小 44px 點擊區。
3. **InventoryBar** `{ slots, size, onSelect? }`：6 格一排；xs／sm 時格距 3px，lg 時 8px；手機 320px 寬用 lg 仍不溢出（6×48＋5×6＝318 → 320 時自動降 md）。
4. **GoldChip** `{ amount, size: "sm"|"lg", label? }`：硬幣 SVG＋數字；lg 用於詳情頂部。
5. **PurchaseToast** `{ event, heroName }`：
   - 左插槽圖示＋「合成 破曉長弓」＋英雄名。
   - completed 事件：金色左緣＋一次掃光；其餘：一般外框。
   - `pointer-events: none`，`role="status"`。
6. **NextItemCard** `{ nextItem, unspent }`：
   - 目標插槽＋名稱。
   - 差價進度條（`unspent / remainingCost`，由 selector 給）；可以直接買 ⇒「可合成」金色狀態。
   - 下方一排合成組件小插槽（已持有打勾）。
7. **BuildPathTrack** `{ buildPath }`：
   - 路徑是真的序列 ⇒ 用連線插槽鏈呈現。
   - 狀態：已持有（實心＋勾）、下一件（金框＋「下一件」標籤）、之後（半透明）。
   - 超過一行自動換行，不做橫向捲動。
8. **CoachNote** `{ notes }`：
   - 左側耳機圖示＋側色條，最多 2 句（`coachNotes`）。
   - 語氣是教練耳機通訊；沒有理由 ⇒ 不顯示。
9. **BuildStrategyCards** `{ selected, onSelect, previews }`：
   - 五張戰術卡：徽章 SVG、名稱、一句 pitch、四項特性 5 段刻度（前期／後期／保命／反制）、三件核心裝預覽插槽。
   - 選中：金框＋勾徽章＋「已選擇」文字（不只靠顏色）。
   - 手機：一欄直列（每張 ≥ 44px 高、整張可點）；≥ 768px：自動填滿 2–5 欄。
   - 特性刻度與 pitch 對應 buildPolicy：
     - early：先買定位前期組件。
     - scaling：射手／法師奢侈核心提前，鞋子延到第二件核心後。
     - counter：情境裝門檻降為 1，並提前到第 2 件。
     - survival：保命裝提前到第 2 件。
     - standard：定位核心順序。
10. **HeroItemDetail** `{ view, heroId, heroName, side, expanded, onToggle }`：
    - 第一層：英雄頭像＋名稱、GoldChip lg、InventoryBar、NextItemCard、CoachNote。
    - 第二層（「看完整出裝」按鈕 ≥ 44px）：BuildPathTrack、屬性格（只列非 0：生命／攻擊／法強／護甲／魔抗／攻速／暴擊／穿透／吸血／全能吸血／技能急速）、狀態籤（重傷／緩速／法傷護盾）。
    - 桌機：360px 面板；手機：全寬 bottom sheet 樣式。

## 7. 動效（沿用專案 GSAP，只做三個回饋時刻）

| 時刻 | 動作 | 時長 | reduced |
|---|---|---|---|
| 完成 T3 通知 | toast 由左滑入 12px＋淡入，金色掃光由左至右一次 | 0.36s＋0.5s | 直接顯示，無掃光 |
| 插槽獲得新裝 | 插槽外框亮一次（opacity 脈衝）＋scale 0.92→1 | 0.32s | 無 |
| 選擇戰術卡 | 卡片 scale 0.98→1＋金框亮起 | 0.22s | 無 |

`src/ui/useReducedMotion.js`（UIUX 原則 §12 指定建立）；GSAP 只出現在 `src/battle/ui/items/useItemFeedbackMotion.js`，以 `gsap.matchMedia()` 的 reduce／no-preference 兩支實作。

## 8. M3a 視覺樣張頁（DEV only）

- 路由：`?debug=items-ui`，`main.jsx` 以 `import.meta.env.DEV` 把關（同 Item Inspector）。
- 資料：頁面內跑一顆 headless 引擎（seed 7，照正式配置加 `configureItems`，推進 12 模擬分鐘），全部樣張讀這份**真實 snapshot**；元件狀態目錄另外列出（標明「狀態樣張」），價格、名稱仍來自目錄。
- 必備區塊（`data-gallery-section`）：`icons`、`slots`、`gold`、`toast`、`next-item`、`build-path`、`coach-note`、`strategy-cards`、`hero-detail`。
- 版面：桌機兩欄、手機單欄；Hero Item Detail 同時展示收合／展開兩態，桌機並排「桌機面板」與「手機 sheet」兩個外框。
- 完成標記：`data-gallery-ready="1"`（截圖工具等它）。

## 9. 後續分段摘要（Owner Review 後再細化計畫）

- **M3b Battle HUD**：
  - 桌機十人列加完成裝點點與可用金；展開列加 xs 6 格。
  - 手機底部焦點英雄列（金＋sm 6 格，≤ 56px）。
  - T3／鞋升級時 PurchaseToast 出現在戰報區。
- **M3c Hero Item Detail**：接進 `BattleHeroSheet` 的「裝備」區塊。
- **M3d Prep／Tactic**：`TacticScreen` 加 BuildStrategyCards，`buildStrategy` 經 matchSession opts 傳到 `useLocalServer`。
- **M3e Replay**：
  - `replayBuffer` 依 `seq` 擷取購買事件（偵測跳號標記截斷）。
  - `MobaReplay.v1` 附加 optional `purchases`／`itemMeta`。
  - 新增純函式 `foldPurchasesAt(purchases, t)`。
  - `MobaReplayScreen` 出裝軌；驗證：摺疊結果 = 當時 snapshot 背包。

## 10. M3a 驗收

- `npm run build`；`check_moba_items_m1`、`check_moba_items_m2`（G8 放寬後）；新 `check_moba_items_m3`；regress 類不必重跑（未碰模擬），但 M2 G1 legacy 指紋仍需綠。
- `tools/browser_review_moba_items_m3a.mjs`：
  - 截圖寬度 320／390／768／1366。
  - 每個寬度都要：九區塊存在、無水平溢出、console／page 錯誤 0。
  - ≤ 700px 時，標記 `data-touch` 的元素 ≥ 44×44。
  - reduced-motion 下 toast 為最終狀態。
  - 截圖存 `review/moba-items-m3a/`。
- 未經真機實測清單照列。
- local commit，不 push、不 deploy，停止等 Owner Review。

## 11. UIUX 九問（M3a）

1. **看到**：誰有錢、誰成型、下一件差多少。
2. **做**：M3a 只需看；Prep 時選一張策略卡。
3. **第二層**：合成樹、完整路徑、屬性、理由原文。
4. **術語**：無；理由碼一律中文。
5. **文字**：每區 ≤ 2 句，其餘用插槽、進度條、刻度。
6. **視覺替代**：階級＝外框、流派＝底色、進度＝條、特性＝刻度。
7. **雙端**：手機單欄、bottom sheet、44px；桌機並排。
8. **回饋**：三個時刻，reduced 可關。
9. **像遊戲**：切角插槽、金框掃光、戰術卡，不是表格與圓角卡。
