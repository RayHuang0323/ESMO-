# J-close Hotfix 2 — Ban/Pick 手機捲動與資訊整理（2026-07-31）

rollback tag：`j-close-hotfix2-baseline` → `bcd9b3f`
證據：`review/moba-runtime/j-close-hotfix2/evidence/`
驗收腳本：`tools/shot_banpick_hotfix2.mjs`（新增）

---

## 1. 根因：不是「捲不順」，是**整頁沒有任何捲動軸**

Ray 回報「手機英雄格最多看到約五列，第六、七列滑不下去」。實測（390×844）：

| 量測 | 值 |
|---|---|
| AppShell 外框 | `height: 742.719px`、`overflow: hidden` |
| BanPick 根元素 | `minHeight: 100%`、`overflow: auto` → 實際高度長成 **2015px** |
| 英雄格 | top 314、bottom 1928（100 隻 ＝ 20 列） |
| 最後一張卡 | top **1853**（viewport 只有 844） |
| `document.scrollingElement` | scrollHeight 844 ＝ clientHeight 844（頁面不可捲） |

**關鍵是那個少寫的 `height: 100%`。** `minHeight: 100%` 只保證「至少和外框一樣高」，
沒有把元素**框住**；區塊子元素不受父層高度限制，所以它長成內容那麼高（2015px），
自己的 `overflow: auto` 因此永遠不會觸發（`clientHeight === scrollHeight`）。
外框 `overflow: hidden` 就把 743px 以下整塊裁掉，而且**沒有任何祖先能捲**。

可見高度 743 − 英雄格 top 314 ＝ **429px ≈ 5.3 列** —— 和 Ray 說的「約五列」一致。

行為佐證（修改前，三種方式都試過）：

```
after window.scrollBy(0,800):        lastCard.top = 1853（沒動）
after scrollingElement.scrollTop=800: lastCard.top = 1853（沒動）
after 單指觸控拖曳 400px:              lastCard.top = 1853（沒動）
```

### 這是 Hotfix 1 的回歸，先講責任

Hotfix 1 拿掉英雄格的 `maxHeight: 260` 巢狀捲動，理由寫的是「整頁單一捲動軸」。
**但這一頁當時根本沒有捲動軸。** 那個巢狀捲動雖然難用，至少讓英雄「碰得到」；
拿掉之後就從「難捲」變成「不能捲」——阻斷等級。

### 為什麼 Hotfix 1 的版面檢查是綠的

`shot_banpick_hotfix1.mjs` §5k：

```js
pageScrollable: (root.scrollHeight-root.clientHeight)>0
             || all.some(e => e.scrollHeight > e.clientHeight+8)
```

它問的是「有沒有元素的內容超出自己」，不是「使用者捲得動嗎」。
AppShell 外框 `scrollHeight 2057 > clientHeight 743` 且 `overflow:hidden`
⇒ 第二個條件成立 ⇒ **在英雄完全捲不到的情況下這條斷言照樣是綠的**。
§5j「巢狀捲動 ≤1」也是綠的——因為當時是 **0** 個捲動軸，而 0 也 ≤ 1。

**教訓：「有沒有溢出」和「捲不捲得動」是兩件事。斷言要問後者。**

---

## 2. 目標 1 的修法：固定框 ＋ 一個明確的捲動區

沒有加高整頁、沒有移除上方配置面板、沒有恢復 Hotfix 1 拿掉的巢狀捲動。

```
根元素  height:100% / flex column / overflow:hidden   ← 真的被框住了
 ├ 標題列                       flexShrink:0
 ├ 目前行動條                   flexShrink:0
 ├ 已選英雄 ＋ 禁用（一列）      flexShrink:0
 ├ 出戰配置摘要（收合 33px）     flexShrink:0
 ├ 選角卡  flex:1 / minHeight:0 / flex column
 │   ├ 「選擇你的英雄」          flexShrink:0
 │   ├ 位置篩選頁籤              flexShrink:0
 │   ├ 搜尋框（新增）            flexShrink:0
 │   └ ★ 英雄格 flex:1 / minHeight:0 / overflow-y:auto   ← 全頁唯一捲動區
 └ 選角動態（選人當下壓成一行）   flexShrink:0
```

`minHeight: 0` 是關鍵：flex 子元素的預設最小高度是內容高度，少了它英雄格會再次
長回去把父框撐破——那就回到原本的處境。

其餘屬性**按實際需要**加，不是全部灑一遍：

| 屬性 | 為什麼加 |
|---|---|
| `overflow-y: auto` | 英雄格是捲動區本體 |
| `min-height: 0` | 否則 flex 子元素撐破父框（根因的一部分） |
| `overscroll-behavior: contain` | 捲到底不要把外層一起帶走 |
| `-webkit-overflow-scrolling: touch` | iOS 慣性捲動 |
| `touch-action: pan-y` | 明確只吃垂直手勢 |
| `padding-bottom: env(safe-area-inset-bottom)` | 最後一列不被 home indicator 蓋住（加在根框） |

### 一起處理的三件小事

1. **搜尋框（新增）**：定位頁籤最多只有 20 隻（4 列），要拿特定一隻仍得滑。
   比對中文名／英文名／id／稱號／預設路線。原本這一頁**沒有**搜尋。
2. **回到頂部**：換篩選、換關鍵字、輪到下一次選人 ⇒ `scrollTop = 0`。
3. **可捲動提示**（低干擾）：4px 細捲軸 ＋ 只在「下面還有東西」時出現的
   18px 底部漸層（`pointer-events:none`，不擋卡片）。沒有浮動大提示。

### 滑動不誤選

英雄卡上起手往下滑時，記錄這次手勢有沒有位移（pointer 位移 > 8px 或期間發生過
`scroll`）；有位移就吃掉這一次 `click`。瀏覽器本來就會抑制捲動後的 click，但那是
各家實作；自己記一份，行為才可被驗收腳本重現。

### 選角動態的取捨（唯一一處呈現量的改變）

輪到你選人時，「選角動態」壓成**最新一行**（約 26px，原本 8 則約 200px）；
對手選擇中與選角完成時**完整攤開**。理由：選人當下需要的是「對面剛做了什麼」，
整份紀錄在你不選人的時候一直都在。這 170px 直接還給英雄格。
**沒有刪任何一則紀錄**（仍是 `log.slice(0,8)`）。

---

## 3. 目標 2：移除「誰克制誰」

移除了 Ban/Pick 裡**兩處**克制關係呈現：

1. 出戰配置摘要每一列的「⚠被 XXX」欄（`draft-plan-counter` 節點與
   `data-counter` 屬性）。
2. 選角動態裡對手選角的附註「（克制你的 XXX）」——同樣是克制關係的動態顯示。

**沒有動的**：

- `archCounterScore()` 仍是本檔 export 的純函式，AI 選角（`aiPick` 的 ban 60%
  ／pick 50% 針對性）**一行未改**，仍在用它。
- 移除的只是「算完之後講給玩家聽」的那段文字。第 2 點的計算不含任何隨機抽樣，
  拿掉不改 RNG 流 ⇒ 同一顆 seed 的 AI 選角結果不變。
- 沒有把克制資料塞到其他 Ban/Pick 面板。
- assignment、`laneByHero`、選取順序、適性、衝突、陣容需求**全部保留**
  （驗收 §8 逐項確認）。

### 未來建議（本輪**不**實作）

- Hero Codex 新增「對位」頁籤，把克制資訊放在會主動去查的地方，而不是選角當下。
- 資料來源考慮 `src/data/heroMatchups.js`（**目前不存在，本輪未建立**）。
- ⚠ 不得虛構未定義的英雄克制資料。現行 `archCounterScore` 是**定位相性的 7 條
  規則**，不是逐對英雄的對位表；要做真正的對位頁籤需要補資料，不是換個地方顯示。

---

## 4. 驗收結果

### 新增 `tools/shot_banpick_hotfix2.mjs`：**252/252 PASS，exit 0**

六個尺寸 × 版面／捲動／手勢／克制移除，再加六個尺寸的完整流程
（Lineup → Ban/Pick → Loading → GameView → Result → Replay）。

判準一律是行為，不是關鍵字：

- 捲動 = 派**真的單指觸控拖曳**（桌機派滾輪），看 `scrollTop` 有沒有動、
  最後一位英雄是否完整落在捲動框與 viewport 內、
  `document.elementFromPoint` 打到的是不是那張卡本身（＝沒被遮住）。
- 選取 = 點下去之後那隻英雄有沒有真的離開英雄池（比對 `data-hero`）。
- 誤選 = 從英雄卡上起手拖曳之後，已選數量有沒有變。
- 英雄一律用 `data-hero` 指名，**不用 DOM 索引猜**。

### 六個尺寸實測

| 尺寸 | 捲動框高／內容高 | 6 列情境捲動 | 100 隻捲到底 | 最後一隻可見未遮 | 換篩選/搜尋歸零 |
|---|---|---|---|---|---|
| 1920×1080 | 351／1620 | 0 → 135（滿） | ✅ | ✅ `linghun` | 1269 → 0 |
| 1366×768 | 267／1620 | 0 → 219（滿） | ✅ | ✅ `linghun` | 1353 → 0 |
| 430×932 | 351／1620 | 0 → 135（滿） | ✅ | ✅ `linghun` | 1269 → 0 |
| 412×915 | 351／1620 | 0 → 135（滿） | ✅ | ✅ `linghun` | 1269 → 0 |
| 390×844 | 334／1620 | 0 → 152（滿） | ✅ | ✅ `linghun` | 1286 → 0 |
| 360×800 | 295／1620 | 0 → 191（滿） | ✅ | ✅ `linghun` | 1325 → 0 |

六個尺寸都是：**唯一一個真捲動軸且就是英雄格**、**沒有「裁掉內容又不能捲」的祖先**、
搜尋「之」產生 6 列（30 隻）、拖曳不誤選、短點擊選得到指名的那一隻、
`draft-plan-counter` = 0 且整頁不出現「克制／被壓制」、適性與陣容需求仍在。
六個尺寸都走完 Lineup → Ban/Pick → Loading → GameView → Result → Replay。

### 既有安全網

| 項目 | 結果 |
|---|---|
| `check_moba_milestone_j_close` | **35/35 PASS** |
| `shot_banpick_hotfix1`（四尺寸完整流程） | **190/190 PASS**，與 Hotfix 1 當時逐項相同（`evidence/hotfix1_rerun.log`） |
| `regress` | **15/15**，平均 23.5 分／29.8 擊殺（**與 J-close 逐值相同**） |
| `regress2` | **20/20，節奏門檻 8/8** |
| `npm run build` | exit 0，2603 modules，只有既有 chunk size warning |

---

## 5. 未驗項目（誠實揭露）

- **Android 真機仍未驗**（G → I-close → J → J-close → Hotfix1 → 本輪，連續第六輪）。
  本輪所有手機尺寸都是桌面瀏覽器的 device emulation ＋ CDP 合成觸控事件，
  **不是真機**。真機的慣性捲動手感、`-webkit-overflow-scrolling` 實際效果、
  真實 safe-area 數值、瀏覽器工具列收合時的可視高度變化，只有真機能判斷。
- **未跑完整 `runtime29` 長鏈與 `tools/verify.mjs` 全套**。本輪只跑直接相關的
  j_close、hotfix1、regress、regress2 與 build。K0 已記錄全套為 16/18，
  兩個既有紅燈（TD-19 Replay 2492KB、TD-21 順序公平性 20pp）與本輪無關，
  本輪 `git diff` 未觸及 `LogicEngine`／引擎／地圖／公平性門檻。
- **出戰配置展開時英雄格會變矮**：展開約多佔 130–160px，在 1366×768 這種矮視窗
  會把英雄格壓到 1–2 列（仍可捲、仍可選）。預設是收合，屬使用者主動打開的暫態，
  本輪未另做處理。
- **搜尋只比對字串**，沒有注音／拼音／模糊比對。

## 6. 操作提醒

`shot_banpick_hotfix1.mjs` 的預設輸出目錄是 **Hotfix 1 自己的證據夾**，
直接重跑會覆寫掉已 commit 的 Hotfix 1 截圖與 JSON。本輪重跑後已用
`git checkout -- review/moba-runtime/j-close-hotfix1/evidence` 還原，
只留 stdout 於本輪的 `evidence/hotfix1_rerun.log`。
往後重跑舊驗收腳本請加 `--out <本輪目錄>`。
