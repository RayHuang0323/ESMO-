# TD-56 UI/UX Owner Review

> 日期：2026-09-04　基線：`feature/team-development-progression-v1` @ `7b44769`
> 判準：`docs/design/ESMO_UIUX設計原則.md`
> 量測器：`tools/browser_review_team_development_uiux.mjs`
> 入口探測：`tools/browser_probe_td56_entry.mjs`
> 截圖：本目錄 `desktop-*/mobile-*.png`　原始數據：`measurements.txt`
>
> **§一～四是 Review 當下的量測（審查時 UI 一行未改，計數 28/42 與 1/4）。**
> **§五是 Owner 裁示後的修正結果（① ② ⑤ 已修，③ ④ 依裁示不動）——**
> **修正後計數：量測器 55/55、入口探測 3/3。截圖與 `measurements.txt` 是修正後的版本。**

量測了三個情境 ×兩種裝置：
`fresh`（新存檔 1 點）、`broke`（**0 點**，前置已完成）、`mid`（7 點、已投入 4 點）。

---

## 一、結論

| 檢查項 | 結果 |
|---|---|
| 主畫面文字密度 | ⚠️ 節點卡 **11–13 行 / 57–98 字**，超過原則的 2–3 行門檻 |
| Available Points 是否最突出 | ❌ **不是**。20px 的「通用／尚未選定」壓過 18px 的可用發展點 |
| Next Development Point 是否清楚 | ✅ **清楚**。兩張卡各自說明條件、距離與獎勵 |
| node prerequisite / locked reason | ❌ **不是 progressive disclosure，而且會自相矛盾** |
| 工程文字是否外洩 | ✅ **無**。16 個詞掃描全部乾淨 |
| Desktop / 390px 排版 | ⚠️ 無溢出，但**桌機 0 點時進不去**、390px 有過小觸控目標 |
| 像遊戲還是 SaaS 後台 | ⚠️ **中間偏後台**。有遊戲感的元素，但被密集的標籤欄位稀釋 |

**建議：先修 ① 與 ②（功能性缺陷），③–⑤ 交由 Owner 判斷是否本輪處理。**

---

## 二、發現（依嚴重度）

### ① 🔴 桌機在 0 點時完全進不去戰隊發展

實測（`browser_probe_td56_entry.mjs`，可用發展點 = 0）：

```
桌機 1366px
   首頁上提到「戰隊發展」的可點元素：0 個  []
   桌機管理工具磚：戰隊詳情 / 訓練中心 / 招募 / 俱樂部目標 /
                   俱樂部專精 / 開新局 / 俱樂部資產
   ❌ 0 點時首頁仍找得到戰隊發展入口 —— 首頁完全沒有這個入口
   ❌ 管理工具區有常駐的戰隊發展磚

手機 390px
   ✅ 0 點時可經「戰隊」分頁抵達 —— reached
```

**根因**：`DashboardScreen.jsx` 只在 `todos` 放戰隊發展，而那一條是
`if (developmentPoints > 0)`；`utilityItems`（桌機管理工具，7 個磚）**沒有**它。
手機的「戰隊」分頁 group 有常駐入口，所以只有桌機受影響。

**為什麼現在才要緊**：TD-56 之前玩家一輩子 1 點，投入後就再也不會回來這頁。
現在玩家會**反覆**把點數花到 0 —— 花完的那一刻，桌機上這個頁面就消失了，
直到下一次升級才回來。這正是 `DashboardScreen.jsx` 自己的註解警告過的事：

> ⚠ 桌機 Utility 與手機「更多」**兩處都要加**：只加一邊，另一種裝置的玩家
> 等於沒有這個功能（V7B 與 V7-2.5 各踩過一次相反方向）。

**建議修法**（一行）：`utilityItems` 加 `{ id: "development", label: "戰隊發展", icon: "award" }`。
todos 那條有訊號才出現的卡片保持不變 —— 兩者責任不同（一個是提醒，一個是常駐入口）。

---

### ② 🟠 「待解鎖」同時代表兩件事，而且會自相矛盾

實測 `broke` 情境（0 點）的節點卡逐字：

```
恢復中心 / 基礎 / 讓閒置與訓練中的選手更快恢復體力。
待解鎖                     ← 狀態徽章
Lv.0 / 3
下一級效果 / 每日恢復 +4
目前可生效                 ← 同一張卡，直接打架
影響：恢復
每級 1 點
```

`恢復中心` **沒有前置條件**，玩家該做的只是「再賺 1 點」。但畫面說「待解鎖」，
而且同一張卡下面寫「目前可生效」，等於同時告訴玩家「鎖住」和「可用」。

**根因**：`TeamDevelopmentScreen.jsx` 的 `nodeStatus()` 對兩種完全不同的原因
回傳同一個 `locked`：

```js
if (node.prerequisites.some(...)) return "locked";        // 前置未完成
if (state.availablePoints >= node.costPerRank) return ...;
return rank > 0 ? "active" : "locked";                    // ← 點數不足也是 locked
```

對照設計原則 §6：「**locked**：要說明『為什麼鎖住』與『怎麼解鎖』（一句話）」。

domain 層其實**已經算得出**正確的玩家用語 —— `teamDevelopment.js` 的
`blockedReason()` 會回「需要先完成「訓練流程優化」」或「需要 1 點發展點」，
但那句話目前只在**投入失敗後**的收據裡出現，卡片上看不到。

**建議修法**：把 `blockedReason()` 的結果掛到卡片上，狀態拆成
`locked`（前置未完成）／`needsPoints`（點數不足），徽章文字分別是
「待解鎖」／「點數不足」。**不需要新規則，只是把既有的那句話搬到看得見的地方。**

---

### ③ 🟡 Available Points 不是畫面上最突出的數字

實測（六個情境全部一致）：

| | 字級 | 內容 |
|---|---|---|
| 最大 | **20px / w950** | 「通用」「尚未選定」← `primaryDirection()`，資訊量最低的那個標籤 |
| 次大 | 18px / w900 | **可用發展點** |
| 並列 | 18px / w900 | 已投入點數（與可用同級） |
| 標題列 | 11px | 右上角「N 發展點」膠囊 |

設計原則 §2：第一層 =「核心數字 ／ 核心狀態 ／ 核心 CTA ／玩家現在要做什麼」。
目前版面把「你目前偏向哪條路線」（回顧性、非行動性）放在視覺第一位，
把「你現在有幾點可以花」（行動性）降到第二位，且與「已投入」同級 —— 後者是歷史，
不是行動。

**建議修法**：可用發展點升到 24–28px、`primaryDirection` 降到 12–14px 當副標，
已投入點數降一級。**版面結構不用動，只調字級權重。**

---

### ④ 🟡 節點卡文字密度超標

| 情境 | 每張卡字數 | 最長 | 整頁 |
|---|---|---|---|
| fresh | 68/62/78/77/77 | **11 行** | 703 字 / 114 行 |
| broke | 77/57/78/77/77 | **12 行** | 706 字 / 116 行 |
| mid | 82/62/98/77/77 | **13 行** | 831 字 / 134 行 |

一張卡固定堆疊 7–9 個標籤欄位：
`名稱＋階級徽章＋狀態徽章 / 敘述 / Lv.x/3＋進度格 / 已解鎖效果 / 下一級效果 /
目前可生效 / 影響：xx / 前置：xx / 每級 N 點 / 按鈕`。

設計原則 §3：「一張卡若需要超過 2～3 行說明，先評估是否應把說明拆到 detail layer」。

**建議修法**（不減資訊，只改分層）：卡片預設只留
`名稱 ＋ 狀態 ＋ Lv 進度 ＋ 下一級效果一行 ＋ 主要行動`；
把「已解鎖效果／影響／前置／每級點數」收進點擊展開的細節層。

---

### ⑤ 🟡 390px 的主要行動按鈕過小

```
❌ 手機 390px/fresh｜觸控目標都 ≥32px　投入發展點(61×23) 投入發展點(61×23)
❌ 手機 390px/mid  ｜觸控目標都 ≥32px　投入發展點(61×23) 投入發展點(61×23)
```

「投入發展點」= **61×23px**。設計原則 §7 要求主要 CTA 觸控目標 ≥44×44px，
實測連 32px 都不到。這是這一頁**唯一的主要行動**。

（`broke` 情境 6 個按鈕全部合格 —— 因為 0 點時投入按鈕根本不渲染。）

**建議修法**：`padding: "5px 9px"` → 垂直 padding 提高到讓高度 ≥44px。

---

### ⑥ 🟢 桌機只是把手機版拉寬

節點卡 grid 是 `repeat(auto-fit, minmax(min(260px,100%), 1fr))`，但容器寬度
讓它在 1366px 下仍然是**單欄**（見 `desktop-mid.png`）：每張卡右側大片留白，
內容擠在左邊一條。設計原則 §7 講的是「手機不能只是把 Desktop 壓窄」，
這裡是反過來 —— 桌機沒有用到自己的寬度。

**建議修法**：桌機讓節點卡走 2 欄。優先度最低，純視覺。

---

## 三、通過的項目（不需要改）

| 項目 | 證據 |
|---|---|
| 下一個發展點清楚 | `"▲ 俱樂部升到 Lv.4 / 還差 3 級 · 打正式賽最快 / +1 點"`、`"◷ 打完第 1 賽季 / 還有 84 天 / +2 點"` |
| 完整規則預設收合 | 六個情境全部 `detailOpen === false`，點擊可展開 |
| 玩家端無工程術語 | 掃描 ledger / reconcile / canonical / authority / derived / writer / settlement / persistence / schema / consumer / reducer / grant / CBR / migration / idempotent / contract —— **0 命中** |
| 無水平溢出 | 桌機 1366/1366、手機 390/390 |
| 顏色語意配文字 | 狀態同時有顏色與中文標籤，不單靠顏色 |
| 有遊戲感的元素 | 路線 stepper（①→②→③→④ 帶完成勾）、分類進度條、投入時的 GSAP 高亮、reduced-motion 分支 |

---

## 四、建議的處理順序

| # | 項目 | 性質 | 建議 |
|---|---|---|---|
| ① | 桌機 0 點無入口 | **功能缺陷** | 本輪修（1 行） |
| ② | locked 語意撞號、自相矛盾 | **功能缺陷** | 本輪修（搬既有字串） |
| ③ | Available Points 不夠突出 | 資訊層級 | Owner 決定 |
| ④ | 節點卡密度 | 資訊層級 | Owner 決定（改動較大） |
| ⑤ | 390px 按鈕過小 | 可用性 | 建議一起修（改 padding） |
| ⑥ | 桌機單欄 | 純視覺 | 可延後 |

① ② ⑤ 都是**小且低風險**的修改，不碰 progression 演算法、不碰 Store、不碰契約。
③ ④ 會改變版面觀感，屬於「要不要重新設計這一頁」的決策，適合 Owner 看過實機再定。

---

## 五、Follow-up：本輪修正結果（2026-09-04）

Owner 裁示：**修 ① ② ⑤，③ ④ 不動。**

### ① 桌機常駐入口 —— 已修

`DashboardScreen.jsx` 的 `utilityItems` 加入常駐磚。實測（`browser_probe_td56_entry.mjs`，
可用發展點 = 0）：

```
桌機管理工具磚：戰隊詳情 / 戰隊發展 / 訓練中心 / 招募 /
                俱樂部目標 / 俱樂部專精 / 開新局 / 俱樂部資產
✅ 0 點時首頁仍找得到戰隊發展入口
✅ 管理工具區有常駐的戰隊發展磚
手機 390px  ✅ 0 點時可經「戰隊」分頁抵達 —— reached
```

- **沒有新增路由**：沿用既有的 `NAV.development = "teamDevelopment"`
  （驗證器斷言 `development: "teamDevelopment"` 全庫只有一處）。
- **手機入口未動**：手機是分頁式 IA，常駐入口本來就在「戰隊」分頁，首頁沒有磚。
  探測腳本原本用同一條斷言要求「首頁一定要有磚」，對手機是錯的判準，已分開。
- todos 那張「有點數待分配」的提醒卡保持不變 —— 提醒與入口是兩件事。

### ② locked reason 語意 —— 已修

把資格判定收斂成 **domain 的單一來源**：`teamDevelopment.js` 的
`nodeEligibility()`（原 `blockedReason`），並匯出 `teamDevelopmentEligibility()`。
**投入 reducer 與畫面現在讀同一份**，畫面不再自己推條件。

| kind | 徽章 | 卡片上的原因 |
|---|---|---|
| `prerequisite` | 待解鎖 | 需先完成「訓練流程優化」 |
| `points` | **點數不足**（新） | 需要 1 點發展點 |
| `planned` | 規劃中 | 這項發展仍在規劃中 |
| `nextPlanned` | 已生效・後續規劃 | 下一階段尚在規劃中 |
| `maxed` | 已完成 | — |

另外把「目前可生效」改成「**投入後生效**」：那個旗標講的是「這一級的效果已經做出來了」，
不是「你現在買得起」，原本的措辭正是與「待解鎖」打架的來源。

實測（六個情境全數）：

```
✅ 沒有自相矛盾的狀態文字　無
✅ 每張不能投入的卡都說得出原因
✅ 原因與徽章一致（前置 vs 點數不足）
   general_data_analysis[待解鎖]   → "需先完成「訓練流程優化」"
   general_recovery[點數不足]     → "需要 1 點發展點"
```

### ⑤ 手機 CTA 觸控目標 —— 已修

只加觸控高度，不改版面結構（`min-height:44px` ＋ 垂直 padding 歸零，
並用同一段規則把該列的 margin 收回去）。桌機用滑鼠，不套這條。

隔離量測（同一頁，開關本輪那條 CSS 前後對比）：

```
修正前 CTA 61×23　卡片 165/165/172/172/172px　總高 848px
修正後 CTA 61×44　卡片 172/172/158/158/158px　總高 820px
✅ CTA 觸控高度達 44px　23 → 44
✅ 卡片沒有明顯變高（總高增幅 < 5%）　-28px（-3.3%）
✅ 文字沒有重排（第一張卡逐字不變）
```

有 CTA 的卡 +7px，沒有 CTA 的卡 −14px，**整頁反而短了 28px**，文字零重排。

### ③ ④ —— 依裁示不動，但保留量測

量測器把這兩項改成 `⏸ DEFERRED` 註記（保留數字、移出 pass/fail），
所以 gate 反映「本輪該做的事」，而落差不會從報告裡消失：

```
⏸ DEFERRED ③ 可用發展點不是最大的數字：通用=20px
⏸ DEFERRED ④ 節點卡最長 13 行（設計原則門檻 2–3 行）
```

要做的時候把 `note` 換回 `ck` 即可。

### 驗證總表

| 驗證 | 結果 |
|---|---|
| `check_team_development_progression_v1` | **87/87 PASS**（新增 §13 資格判定 13 條） |
| `browser_check_team_development_progression` | **51/51 PASS** |
| `browser_review_team_development_uiux` | **55/55 PASS**（桌機 1366px ＋ 手機 390px × 3 情境） |
| `browser_probe_td56_entry` | **3/3 PASS** |
| `npm run build` | ✅ built in 12.35s |
| `check_team_development_v1` | ✅ PASS |
| `check_progress25` / `check_capability_authority` / `check_club_assets_v1` | ✅ PASS |
| `check_r61_ui_fixture` / `regress` / `regress2` / `check_flow09` / `check_dash10` | ✅ PASS |

額外證明（六個情境全數通過）：

- ✅ `availablePoints = 0` 時 Desktop 仍可進 Team Development
- ✅ 0 點 node 不再出現互相矛盾的狀態文字
- ✅ prerequisite locked reason 正確
- ✅ insufficient-points reason 正確
- ✅ Mobile CTA touch target ≥ 44px（61×44）
- ✅ 無 horizontal overflow（桌機 1366/1366、手機 390/390）
- ✅ console / page errors = 0

**未動**：progression 曲線、Development Point source、Club XP / Club Points、
Team Development capability contract、CBR / Rating / Online、CS runtime、
Codex branch / worktree。
