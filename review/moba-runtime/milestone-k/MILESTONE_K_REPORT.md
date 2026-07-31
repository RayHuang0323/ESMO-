# Milestone K — Hero Codex 對位頁籤與 Matchup Data Contract v1

日期：2026-07-31　起點 commit：`9b51a85`（J-close Hotfix 2）
rollback tag：`milestone-k-baseline` → `9b51a85`

---

## 一句話

J-close Hotfix 2 把「誰克制誰」從 Ban/Pick 拿掉之後，本輪替它蓋了一個**有資料契約、
有來源標籤、有信心程度、而且明確承認自己沒有真實勝率**的家：Hero Codex 第五頁「對位」。

---

## 1. 修改與新增的檔案（六個）

| 檔案 | 動作 | 內容 |
|---|---|---|
| `src/data/heroMatchups.js` | **新增** | Matchup Contract v1、10 隻英雄的展示資料、7 支純函式、驗證函式 |
| `src/screens/moba/HeroCodexDetail.jsx` | 修改 | 第五頁「對位」、三個區塊、對位卡、警語、空狀態、safe-area、頁籤橫向捲 |
| `src/screens/moba/CodexScreen.jsx` | 修改 | 詳情狀態改為 `{英雄, 頁籤}` ＋ 瀏覽堆疊 ＋ 關閉後記憶 |
| `src/screens/moba/BanPickScreen.jsx` | 修改 | **只有一行**：ⓘ 開的詳情傳入 `showMatchups`（Ray 收尾裁決，見 §4） |
| `tools/check_hero_matchups_k.mjs` | **新增** | 資料層安全網，47 條 |
| `tools/shot_hero_matchups_k.mjs` | **新增** | 六尺寸瀏覽器驗收，348 條 |

`BanPickScreen.jsx` 的改動是 `<HeroCodexDetail heroId={detailId} onClose={…} />`
多一個 `showMatchups`，其餘**一行未動**——選角流程、AI 邏輯、版面、捲動結構都沒碰。

**LogicEngine／戰鬥數值／RNG／BattleResult／Replay／Reward／assignment／laneByHero／
configureMatch／configurePlayers／configureHeroes／configureSpells／
Ban/Pick 的選角流程與 Hotfix 2 捲動結構／其他經營畫面：一行未動。**

---

## 2. 資料 Contract（v1）

```
HERO_MATCHUPS[heroId] = {
  strongAgainst: Entry[],   // 較有優勢
  weakAgainst:   Entry[],   // 較難應付
  synergies:     Entry[],   // 適合搭配
}
Entry = { heroId, reason, source, confidence }
```

* `source` ∈ `design` | `inferred` | `verified`
* `confidence` ∈ `low` | `medium` | `high`

對外只有純函式，**原始表沒有 export**：

| 函式 | 行為 |
|---|---|
| `getHeroMatchups(id)` | 完整三區；查無資料回**穩定空結構**（`{heroId, [], [], []}`），不 throw、不回 null |
| `getStrongAgainst(id)` / `getWeakAgainst(id)` / `getSynergies(id)` | 同上的單區捷徑 |
| `hasMatchupData(id)` | 這隻英雄有沒有任何一筆 |
| `listMatchupHeroIds()` | 有資料的英雄 id（驗證／文件用） |
| `validateHeroMatchups()` | 完整性驗證，回 `{ok, errors[]}` |

資料**深凍結**：UI 拿到手也改不動（測試實際去 `push` 與改 `reason`，資料原封不動）。
`getHeroMatchups("__proto__" / "constructor" / null / 42 / {})` 全部回空結構，不漏原型鏈。

### source 的定義（三個字的意思是固定的）

| 值 | 意思 | 顯示文案 | 本輪筆數 |
|---|---|---|---|
| `design` | 理由可直接對回**雙方技能組寫明的互動**（設計意圖，不是統計） | 設計資料 | **36** |
| `inferred` | 沒有明確技能互動，只依**定位／技能特性**推論 | 系統推測 | **6** |
| `verified` | 實戰驗證 | 實戰驗證 | **0** |

**`verified` 本輪一筆都沒有**，因為專案目前沒有任何真實對局樣本。enum 先留著，
等有可回溯的資料來源才可以用（規劃見 §7）。

### 展示資料範圍

10 隻英雄、42 筆關係：
`ironclad` `ravager` `stoneguard` `voidrift` `bingshuang`
`maestro` `luminary` `duskblade` `sting` `leiting`

其餘 **90 隻英雄一律走空狀態**——這是刻意的。沒整理的就顯示沒整理，不補假資料。
`luminary`（星輝）的「較有優勢」**刻意留空**，用來確保區塊層級的空狀態真的會出現。

### 誠實邊界

檔案裡不含、往後也不得加入：勝率百分比、對局場次、版本號、玩家統計、段位分佈、
Pick/Ban 率。驗證器用禁用詞正則掃過全部 42 筆 `reason`（§3 第 24 條）。
對位頁底部主動寫著：**「本作沒有真實對局樣本，因此不顯示勝率、場次或版本統計。」**

---

## 3. archCounterScore 的研究結論（Milestone K 要求評估）

**結論：不拿它當 `inferred` 的產生器，只拿它當審稿用的方向性複核。**

實測 20 隻英雄的 380 組配對之後：

* `analyzeChamp` 的標籤判定太粗——抽樣中幾乎每隻英雄都被標成「爆發」與「肉盾」，
  **幾乎每一對**都拿得到 ≥2 分；
* 方向常常同時成立（鋼鐵衛士→荊棘壁壘 2 分，反向 4 分），
  無法單靠分數判斷「誰克制誰」。

把它包裝成對位事實，就是把粗規則講成已驗證的東西——正是本輪明令禁止的事。

改成這樣用：**每一筆 `inferred` 的克制條目，必須滿足
`archCounterScore(強方, 弱方) − archCounterScore(弱方, 強方) ≥ 3` 才寫得下去。**
`tools/check_hero_matchups_k.mjs` §4 直接從 `BanPickScreen.jsx` 原始碼抽出現行的
`analyzeChamp` / `archCounterScore` 重算（兩支都是純 JS，抽出來 `new Function` 執行）
⇒ 規則哪天被改動，這一節會立刻紅燈，而不是對著一份複製品自我感覺良好。

`archCounterScore` **一行未改**，仍是 export 的純函式，AI 選角 ban 60%／pick 50%
照常使用；**沒有**被接回 Ban/Pick 的任何玩家呈現。

---

## 4. UI

### 頁籤

`概覽｜數據｜技能｜戰術｜對位`（五頁，順序固定）。

**兩條路徑都有五頁——但那是呼叫端各自決定的，不是元件預設。**

`HeroCodexDetail` 的 `showMatchups` **預設仍是 `false`**；`CodexScreen` 與
`BanPickScreen` 兩個呼叫端**各自明確傳入**。這個區分是刻意保留的：
將來任何新的呼叫端不會莫名其妙多出一頁，而且「Ban/Pick 要不要有對位」
永遠是一行就能改的決定，不必動元件。驗證器把這兩件事分開驗
（第 35 條驗呼叫端有傳、第 36 條驗元件預設仍是 false）。

> 初版我把 Ban/Pick 這條路徑關起來（保守解讀「不得把對位資訊重新放回 Ban/Pick」），
> Ray 裁決：ⓘ 開的就是 Hero Codex 本身，五頁都要有。已照辦。
> **「不得放回 Ban/Pick」的界線因此明確化為：Ban/Pick 的主畫面**
> （分路摘要、選角動態、英雄卡）**不得出現任何克制呈現**——
> J-close Hotfix 2 移除的 `draft-plan-counter`／`data-counter`／「（克制你的 XXX）」
> 一個都沒有回來，六個尺寸每一輪都重驗（第 10b、11n 條）。

### 三個區塊

`較有優勢`（綠）／`較難應付`（紅）／`適合搭配`（藍）——沿用本頁「概覽」既有的
優勢／劣勢配色，不另造一套色票。

每張對位卡：頭像 ＋ 中文名 ＋（英文名·）定位·分路 ＋ 原因摘要 ＋ 來源標籤 ＋ 信心程度。

### 警語與空狀態

* 只要該英雄有任何 `inferred` 條目，面板頂端出現琥珀警語：
  **「此內容依英雄定位與技能特性推測，不代表真實玩家勝率。」**
* 整隻沒資料 → **「目前尚無已整理的對位資料。」**
* 單一區塊沒資料 → 該區塊顯示同一句。
* 兩句文案的**唯一來源是資料層常數**，UI 沒有自己另寫一份（驗證器第 38 條）。

### 導覽（規格第六節第 6、7 條）

`CodexScreen` 是「看哪一隻、停在哪一頁」的**單一狀態持有者**：

| 動作 | 行為 |
|---|---|
| 從圖鑑格開英雄 | 停在「概覽」（除非是剛才關掉的那一隻，見下） |
| 點對位卡 | push 目前的 `{英雄, 頁籤}`，開新英雄並**停在「對位」**（維持瀏覽脈絡） |
| 「← 上一隻」 | pop，回到原英雄**且回到原頁籤**（＝對位） |
| ✕ 關閉 | 記住最後的 `{英雄, 頁籤}`；再開同一隻時**原頁籤還在** |

### 手機／桌機

* 手機（≤700px）單欄、桌機兩欄。分歧唯一來源是 `ui/useViewport.js` 的 `useIsMobile()`，
  不是自己再猜一次斷點。
* 頁籤列 `overflow-x:auto` ＋ `overflow-y:hidden`（五頁在 360px 仍排得下，
  排不下時橫向捲，**不會變成第二條縱向捲動軸**）。
* 面板 `overflow-y:auto` ＋ `overscroll-behavior:contain` ＋
  `padding-bottom: calc(26px + env(safe-area-inset-bottom))`。
* **面板內部沒有第二個縱向捲動容器**（六尺寸實測皆為 0），
  也沒有「裁掉內容又捲不動」的祖先。

---

## 5. 測試結果

### 新增

| 腳本 | 結果 |
|---|---|
| `node tools/check_hero_matchups_k.mjs` | **✅ PASS 47/47** |
| `node tools/shot_hero_matchups_k.mjs` | **✅ PASS 348/348**（六尺寸 × 58 條） |

`shot` 腳本的判準一律是**行為**，不是 grep 字串：

* 頁籤用 `data-tab` 指名，對位卡用 `data-hero` 指名——**不用 DOM 索引猜英雄**。
* 點擊派**真的滑鼠／觸控事件**到卡片中心；點之前先用 `elementFromPoint` 反查那個點
  打到的就是這張卡（＝沒被蓋住），點之後看詳情的 `data-hero` 有沒有真的換人。
* 捲動派**真手勢**（手機單指拖曳／桌機滾輪）看 `scrollTop` 有沒有動。
  **不用 `scrollHeight > clientHeight` 推論「捲得動」**——那是 J-close Hotfix 2 的教訓。
* 空狀態挑一隻**確定沒有資料**的英雄（`linghun` 靈魂共鳴），不是靠取樣運氣。

六尺寸逐項通過：

| 尺寸 | 欄數 | 面板可捲 | 最後一張卡 | 巢狀捲動 | Ban/Pick ⓘ 頁數 |
|---|---|---|---|---|---|
| 1920×1080 | 2 | 0→62／上限 62 | 完整可見、未被遮住 | 0 | **5（含對位）** |
| 1366×768 | 2 | 0→136／上限 136 | 完整可見、未被遮住 | 0 | **5（含對位）** |
| 430×932 | 1 | 0→329／上限 329 | 完整可見、未被遮住 | 0 | **5（含對位）** |
| 412×915 | 1 | 0→346／上限 346 | 完整可見、未被遮住 | 0 | **5（含對位）** |
| 390×844 | 1 | 0→361／上限 361 | 完整可見、未被遮住 | 0 | **5（含對位）** |
| 360×800 | 1 | 0→413／上限 413 | 完整可見、未被遮住 | 0 | **5（含對位）** |

每一列的「面板可捲」都是**派真手勢之後量到的 `scrollTop`**，而且都推到了上限
⇒ 最後一張卡（`luminary`）真的碰得到，`elementFromPoint` 反查也確認它沒被蓋住。

### Ban/Pick 路徑（§11，Ray 收尾要求的五件事）

| 驗什麼 | 怎麼驗 | 六尺寸結果 |
|---|---|---|
| ⓘ 開出五頁 | `data-tab` 逐一比對順序與文字 | `overview/stats/skills/tactics/matchups`，第五個是「對位」 |
| 對位頁真的畫得出來 | 指名一隻**有資料**的英雄（`stoneguard`），數區塊與卡片 | 三區塊、4 張卡，卡片都有來源與信心標籤 |
| 主畫面無克制動態 | `[data-counter]` 節點數 ＋ 全頁「克制」字樣 | 節點 0、字樣 0 |
| 篩選不遺失 | 切到非預設「戰士」→ 開關 ⓘ → 比對 | 篩選與英雄池數量皆不變 |
| 搜尋／捲動／已選英雄不遺失 | 搜尋「之」＋捲到 120 → 開關 ⓘ → 比對 | 全部**逐值相同**（見下表） |

```
                    開啟前                                       關閉後
1920×1080  篩選=全部 搜尋=之 捲動=120 池=30 我方=[ravager]     ← 完全相同
1366×768   篩選=全部 搜尋=之 捲動=120 池=30 我方=[cinderfist]  ← 完全相同
430×932    篩選=全部 搜尋=之 捲動=120 池=30 我方=[ravager]     ← 完全相同
412×915    篩選=全部 搜尋=之 捲動=120 池=29 我方=[ravager]     ← 完全相同
390×844    篩選=全部 搜尋=之 捲動=120 池=29 我方=[ravager]     ← 完全相同
360×800    篩選=全部 搜尋=之 捲動=120 池=30 我方=[ravager]     ← 完全相同
```

⚠ 這一段刻意安排在**輪到玩家**的時候量。`BanPickScreen` 只在 `!isMyTurn` 掛 AI 的
`setTimeout`，而 `[pickFilter, pickQuery, step, showPicker]` 一變就會把英雄格
`scrollTop` 歸零（Hotfix 2 刻意的行為）。若在 AI 回合量，`step` 會在彈窗開著時前進
⇒ 量到的紅燈不是本輪造成的。

### 回歸（全綠）

| 腳本 | 結果 |
|---|---|
| `check_moba_milestone_j_close` | ✅ **35/35** |
| `shot_banpick_hotfix2` | ✅ **251/251**（六尺寸完整流程） |
| `regress` | ✅ **15/15**，平均 **23.5 分** ／ **29.8 擊殺** ——**與 J-close 逐值相同** |
| `regress2` | ✅ **20/20**，節奏門檻 **8/8** |
| `npm run build` | ✅ exit 0，`built in 8.71s`，2603 modules |

`regress` 的 15 個 seed 逐場時長、勝方、擊殺、破塔全部與 J-close 相同 ⇒
**本輪對戰結果逐值不變**。

### 證據

* `review/moba-runtime/milestone-k/evidence/` — **10 張截圖** ＋ 完整 JSON：
  1920（頂部／空狀態／Ban-Pick 對位）、1366（Ban-Pick 對位）、
  390（頂部／捲到底／空狀態／Ban-Pick 對位）、360（頂部／Ban-Pick 對位）。
  430／412 也跑完整斷言，只是不另存重複版型的圖片。
* `review/moba-runtime/milestone-k/regression-hotfix2/banpick_hotfix2_browser.json`
  — Hotfix 2 回歸的完整 log（該腳本自己的 36 張截圖已刪除，避免重複證據）。

---

## 6. 未驗項目（照實說）

1. **Android／iOS 真機未測。** 六個尺寸都是桌面 Chrome 的 device metrics 模擬。
   `env(safe-area-inset-bottom)` 在模擬器裡恆為 0，**真機瀏海／手勢列的實際留白沒驗過**。
2. **未做長時間手指連續滑動的手感測試**（腳本是分段派事件，不是連續慣性捲動）。
3. **對位資料的「內容正確性」是設計判斷，不是測試結果。** 測試能保證格式、來源標籤、
   方向性複核與不含假統計；「毀滅者是不是真的克制鋼鐵衛士」只能由 Ray 以設計者身分裁決。
4. **既有紅燈未處理，也未受影響**：TD-21（`runtime29 §29` 陣列順序影響勝負分佈 20pp）、
   TD-19（`experience26 §17` Replay 2492KB）。本輪沒有動引擎，兩者與 J-close 相同。
5. **`check_moba_runtime29` 全套未跑**（單跑 10–15 分鐘且巢狀 fan-out 很深）。
   本輪跑的是與改動直接相關的 j_close ＋ hotfix2 ＋ regress ＋ regress2 ＋ build。

---

## 7. 未來 verified 的資料來源規劃

現在沒有真實玩家勝率資料，將來要用 `verified` 必須先有**可回溯的樣本**。可行順序：

1. **模擬樣本（最近可得）**：用 `LogicEngine` 固定規則集 v3 跑大量 seed 的對局，
   統計特定英雄對位的勝負分佈。
   ⚠ **前提是先修 TD-21**——目前陣列順序就能讓勝率位移 20pp，
   在那之前任何模擬統計都不可信，寫進 `verified` 等於把 bug 當事實。
   而且它是**模擬**不是**玩家**，欄位名稱屆時要能分辨（例如 `source: "simulated"`）。
2. **本機對局紀錄**：`seasonStore` 已收 `BattleResult.v2`。等累積足夠場次，
   可以由玩家自己的戰績推導對位傾向——樣本小、只代表這一位玩家，
   顯示時必須寫明場次來源與樣本數（那時候「場次」才不是虛構的）。
3. **設計端人工覆核**：Ray 逐對確認並簽字的條目，可從 `design` 升到 `verified`，
   但要在檔案裡留下覆核日期。

三條路都必須遵守同一條規則：**沒有可指出來源的數字，就不准顯示數字。**

---

## 8. 教訓

### 一、「誠實聲明」也會被自己的禁用詞掃到

第一次跑 shot 腳本，六個尺寸同時紅在同一條——「對位面板不得出現勝率」。
兇手是我自己寫在頁尾的那句「本作沒有真實對局樣本，因此不顯示勝率、場次或版本統計」。

斷言問錯了對象：要問的是**宣稱資料的區域**有沒有假數字，不是整頁掃關鍵字。
修法是把免責聲明節點掛上 `data-testid`，比對前先從複本移除，
另外加一條「免責聲明必須存在且一字不差」。

一句話：**掃禁用詞的時候，要先想清楚「哪一塊在宣稱事實」。**

### 二、量測前後之間，測試自己不可以動到受測的狀態

驗「關閉詳情不會弄丟捲動位置」時六尺寸全紅（120 → 0），看起來像真 bug。
其實是腳本自己幹的：量完「開啟前」快照之後，我為了點到 ⓘ 呼叫了
`info.scrollIntoView({ block: "center" })` ——那一行把英雄格捲回了頂端。

改成「挑一張**當下已經看得到**的卡」，並且把「找卡的過程沒有動到 scrollTop」
也寫成斷言的一部分（第 11e 條）。**測試的觀測動作必須是無副作用的，
否則測到的是自己。**

### 三、「三區塊**或**空狀態」這種 or 斷言，可能一次都沒驗到你要的那半邊

Ban/Pick 路徑的第一版寫成「三區塊或空狀態皆可」。六尺寸全綠——
但截圖一看，抽到的英雄全都沒有對位資料，**走的永遠是空狀態那半邊**，
「三區塊能不能在這條路徑畫出來」其實一次都沒被證明過。

補了第 11o／11p 條指名一隻有資料的英雄。指名時又踩第二個坑：
寫死 `ironclad` 六尺寸全紅，因為他早就被選角流程禁掉／選走了 ⇒
改成「有資料清單裡第一個還在池子裡的」。

一句話：**or 斷言要回頭確認兩半邊都真的被走過，否則它只是看起來綠。**
