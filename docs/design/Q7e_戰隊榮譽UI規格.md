# Q7e：戰隊榮譽 TEAM HONORS — 產品／資料規格

> 狀態：**規格，尚未實作**。之後交給 Codex。
> 前置：Q7d 已部署（main `8cc44e7`）。`honors: Honor.v1[]` 是唯一榮耀真相，
> `competitionView().honorsView` 已提供唯讀資料。本輪**只做呈現**。

---

## 0. Audit 結論（先讀，這三點會決定實作）

### 0.1 `honorsView` 現在給什麼

實測（`s7d_two_seasons.json`，兩季都有冠軍）：

```js
honorsView = {
  all: Honor[],                    // 全部榮耀，新的在前
  annualChampions: Honor[],        // 歷屆亞洲年度冠軍，新的在前
  latestAnnualChampion: Honor|null,
  myAnnualChampionCount: number,
}
```

每一筆 `Honor.v1`：

```
schema, id, honorType, label, season, gameMode,
eventId, eventName, championTeamId, championTeamName,
finalRank, earnedAtDay, sourceFinalId
```

### 0.2 ⚠ 缺一個純顯示欄位：`myTeamId`

`Honor` 記的是**世界歷史**，所以每一筆只有 `championTeamId`，
**沒有任何欄位說「這一筆是不是玩家自己」**。而規格要求「玩家奪冠的 Season 明顯高亮」。

⇒ **允許的最小唯讀投影**：在 `honorsView` 加一個欄位

```js
myTeamId: get().team?.id ?? null,
```

理由：
- 比在每一列加 `isMine` 更小，也不會在每筆榮耀上複製一份衍生狀態
- 與既有做法一致——`competitionView().asiaFinals` 就是這樣給 `playerTeamId` 的
- 畫面只做 `honor.championTeamId === honorsView.myTeamId` 的**相等比較**，
  那是顯示判斷，不是統計

⚠ **不得**改成在 UI 裡 `useProfileStore(s => s.team.id)` 另外取——
那會讓「榮譽資料只有一個入口」這件事破功。

### 0.3 ⚠ `earnedAtDay` 不要當「日期」顯示

`earnedAtDay` 是**封存當下的絕對遊戲日**（`meta.days`），會跨賽季一直累加：
實測第 2 季那一筆是 `98`。它**不是**賽季相對日，也不是年份。

⇒ **榮譽櫃一律以「賽季」為時間軸**（`S1` / `S2` / `第 N 賽季`）。
`earnedAtDay` 本輪**不顯示**。真要顯示得先換算，而榮耀本身不帶賽季相對日。

---

## B. 放置位置決策

### 結論：放進 **`TeamScreen`（戰隊詳情）**，不新增 Router / page

| 候選 | 評估 |
|---|---|
| **`TeamScreen`** ✅ | 標題就叫「戰隊詳情」，榮譽正是戰隊的長期紀錄。**已經在儀表板「更多功能」有入口**（`🛡 戰隊詳情`），**零新增導航**。目前 114 行、內容單薄，有空間 |
| `CompetitionScreen` ✘ | 已經 654 行、10 個 Panel。而且它是**本賽季**的頁面，榮譽是跨賽季生涯尺度，混在一起會讓「這一季」與「歷年」難以分辨 |
| 新的 Router / page ✘ | 要新增 screen id ＋ 新導航項。audit 沒有證明必要 |

**插入位置**：`TeamScreen` 內，放在「戰隊識別」區塊**之後**、「分部切換」之前。
理由：榮譽屬於整個戰隊，不屬於 MOBA／CS 任一分部；放在分部切換之下會讓人
誤以為榮譽是分部的。

---

## A. 資訊架構

```
戰隊詳情 TeamScreen
├─ 戰隊識別（既有：隊徽／隊名／等級／戰績／粉絲）
├─ ①【新】戰隊榮譽 TEAM HONORS
│    ├─ 我的榮譽摘要      ← 最高層級
│    ├─ 最近一屆年度冠軍   ← 次高
│    └─ 歷屆亞洲年度冠軍   ← 掃讀用
├─ 分部切換（既有）
└─ 名單／替補席（既有）
```

**資訊優先序（規格第 4 點）**：我的冠軍次數 → 最近一屆冠軍 → 歷屆冠軍。
三段之外**不加任何東西**——不做 Achievement wall、不做徽章牆。

---

## C. Desktop layout（≥ 768px）

```
┌─────────────────────────────────────────────────────────────┐
│ 戰隊榮譽 TEAM HONORS                                         │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────┐  ┌────────────────────────────────┐  │
│  │   亞洲年度冠軍     │  │ 最近一屆  S2                    │  │
│  │        2          │  │ 烈焰鳳凰                        │  │
│  │       次          │  │ 亞洲年度冠軍                    │  │
│  │  最近一次 S2       │  │                                │  │
│  └───────────────────┘  └────────────────────────────────┘  │
│   ↑ 我的摘要（金色）      ↑ 最近冠軍（是我 → 金；AI → 中性）  │
│                                                             │
│  歷屆亞洲年度冠軍                                            │
│  S2   烈焰鳳凰                                    亞洲年度冠軍 │
│  S1   德國海豹  我方                              亞洲年度冠軍 │← 高亮整列
│  ...                                                        │
└─────────────────────────────────────────────────────────────┘
```

- 摘要與最近冠軍**並排兩欄**；歷屆冠軍在下方，一季一列
- 「我的冠軍次數」是整個面板最大的字
- 玩家奪冠的那一列：左側金色細軸 ＋ 淡金底 ＋「我方」標記

## D. Mobile layout（390px）

```
┌─────────────────────────┐  ← 390px
│ 戰隊榮譽 TEAM HONORS     │
├─────────────────────────┤
│  亞洲年度冠軍            │
│        2 次              │  ← 摘要優先，整寬
│  最近一次 S2             │
│ ┌─────────────────────┐ │
│ │ 最近一屆 S2          │ │  ← 最近冠軍，整寬
│ │ 烈焰鳳凰             │ │
│ └─────────────────────┘ │
│                         │
│ 歷屆亞洲年度冠軍          │
│ S2  烈焰鳳凰             │  ← 直向列表
│ S1  德國海豹    我方      │
└─────────────────────────┘
```

- 摘要與最近冠軍**改為上下堆疊、各自整寬**
- 歷屆冠軍是**直向列表**，一列一季
- **不得做需要左右拖動才看得懂的表格**
- **整頁不得水平溢出**

⚠ 量溢出要量**app 的滾動容器**（`scrollWidth` vs `clientWidth`），
**不是 `document.body`**——這個 app 的內容被祖先 `overflow:hidden` 裁掉，
body 永遠回報等於視窗寬。這個坑在 Q7a-3e／3f.1 連續踩過兩次。

---

## E. Component 拆分

放在 `src/screens/manage/honors/`，由 `TeamScreen` 匯入一個 `<TeamHonorsPanel />`。

| Component | 職責 | 預估 |
|---|---|---|
| `TeamHonorsPanel` | 容器：標題、決定三段出不出現、空狀態 | 小 |
| `HonorSummary` | 我的冠軍次數 ＋ 最近一次奪冠賽季（**0 次也要顯示**） | 小 |
| `LatestChampionCard` | 最近一屆冠軍：賽季／隊名／是否我方／榮耀類型 | 小 |
| `ChampionHistoryList` | 歷屆清單容器 | 小 |
| `ChampionHistoryItem` | 單列：賽季、隊名、我方標記、榮耀標籤 | 小 |

⚠ **不要把這些塞進 `TeamScreen` 本體**——它現在乾淨（114 行），
把 100 多行榮譽 UI 直接寫進去會重演 `CompetitionScreen` 的下場。

---

## F. 每個 Component 的資料來源

**唯一入口：`competitionView().honorsView`。**

| Component | 讀 | **不得做** |
|---|---|---|
| `TeamHonorsPanel` | `honorsView.annualChampions.length`（決定空狀態） | 不得讀 `honors` 原始切片；不得讀 `competition` |
| `HonorSummary` | `myAnnualChampionCount`、`annualChampions` 裡我方最近一季 | **不得自己數** `filter(...).length` |
| `LatestChampionCard` | `latestAnnualChampion`、`myTeamId` | **不得自己排序找最新** |
| `ChampionHistoryList` | `annualChampions`（已由資料層排好，新的在前） | **不得重排** |
| `ChampionHistoryItem` | 單筆的 `season` / `championTeamName` / `label`、`myTeamId` 比較 | 不得重建 id、不得從 `Event.final` 補歷史 |

### 三條紅線

1. **不得自行算 `teamHonorCount`**——用 `myAnnualChampionCount`。
2. **不得自行找 latest**——用 `latestAnnualChampion`。清單雖然「新的在前」，
   但那是資料層的保證，畫面不該再假設一次。
3. **不得從 `Event.final`／`SeasonSeal`／`careerFinal`／Circuit Points 補歷史**。
   `honors` 是唯一真相；它是空的就是**真的沒有**。

⚠ 「我最近一次奪冠是第幾季」目前 `honorsView` **沒有直接給**。
用 `annualChampions.find(h => h.championTeamId === myTeamId)?.season` 取得——
清單已排序，`find` 取到的就是最近一次。這是**在已排序清單上取第一個符合的**，
不是重新排序或統計。若覺得這仍算推導，可請資料層加
`myLatestChampionSeason`（**先回報再加**，不要自己擴投影）。

---

## G. 狀態 / 空狀態

| 狀態 | 判定 | 呈現 |
|---|---|---|
| **完全沒有榮耀** | `annualChampions.length === 0` | 面板**仍然出現**，顯示「**尚未產生亞洲年度冠軍紀錄**」＋ 一句說明（年度總決賽結束後才會有紀錄）。**不顯示假 Season、不顯示假冠軍** |
| **玩家 0 冠** | `myAnnualChampionCount === 0` | 摘要**明確顯示 0 次**，不隱藏、不改寫成「即將達成」之類的假成就 |
| **玩家 1 冠 / 多冠** | `> 0` | 次數大字 ＋「最近一次 S{n}」 |
| **最近冠軍是我方** | `latest.championTeamId === myTeamId` | 卡片金色強調 ＋「我方」 |
| **最近冠軍是 AI** | 否 | 卡片**中性但完整可讀**——隊名、賽季、榮耀類型一個都不少 |
| **歷屆中我方的那幾季** | 逐列比較 | 整列高亮 ＋「我方」標記 |

⚠ **未完成的年度總決賽不算進來**——`honors` 裡根本不會有它
（Q7d 的 fail-closed 已保證）。畫面**不需要也不得**自己判斷「有沒有打完」。

⚠ 空狀態與「玩家 0 冠」是**兩件不同的事**：
世界上有冠軍但不是我 ⇒ 歷屆清單有內容、我的次數是 0。兩者要分別呈現。

---

## H. 視覺原則

- **沿用既有 `GC` token**，不新增色票、不引入新的視覺系統
- **金色代表正式冠軍榮耀**，但只用在三處：我的冠軍次數、我方奪冠的那幾列／卡片、
  「亞洲年度冠軍」標籤。**面板外框、標題、AI 冠軍列一律中性**
- **AI 冠軍中性但完整**——這是世界歷史，不是只記玩家的獎盃櫃
- **不堆疊獎盃 emoji**。整個面板最多一個 🏆（建議放在「我的冠軍次數」旁），
  歷屆清單**不要每列都放**
- 玩家自己的紀錄可以有更明顯的 emphasis，但**不是靠更多裝飾**，
  而是靠對比（底色、左軸、字重）

---

## I. Browser gate 驗收清單

新增 `tools/browser_check_team_honors_ui.mjs`。用既有 harness
（`startDevServer` ＋ `launchChrome` ＋ `RESOLVE_APP_MODULES`），
網址**明確帶 `?asiaCircuit=1`**，不吃預設值。

需要三份存檔（可由 `make_save7d.mjs` 那套手法產生）：
**A 無榮耀** / **B 一季冠軍（AI）** / **C 兩季累積**，
另需一份**玩家奪冠**的存檔（讓決賽由玩家戰隊獲勝）。

| # | 檢查 |
|---|---|
| 1 | `honors` 為空 ⇒ 面板出現，顯示「尚未產生亞洲年度冠軍紀錄」，**沒有任何假 Season／假隊名** |
| 2 | 一季冠軍 ⇒ 歷屆清單恰好 1 列，賽季與隊名逐值等於 `honorsView.annualChampions[0]` |
| 3 | 兩季累積 ⇒ 恰好 2 列，**新的在前**（S2 → S1） |
| 4 | **AI 冠軍完整顯示**（隊名、賽季、榮耀標籤都在），且**未被標成我方** |
| 5 | 玩家 0 冠 ⇒ 摘要**顯示 0**（結構化讀那個數字，不是全頁搜尋） |
| 6 | 玩家 1 冠 ⇒ 摘要顯示 1，且**那一季整列被高亮**（讀 class 或 `data-mine`） |
| 7 | 玩家多冠 ⇒ 次數與 `honorsView.myAnnualChampionCount` **逐值相同** |
| 8 | 最近冠軍卡的賽季與隊名 **逐值等於 `latestAnnualChampion`** |
| 9 | 歷屆每一列的 `data-season` / `data-team-id` **逐筆等於** `annualChampions` |
| 10 | **reload 後 UI 不漂移**（同一份存檔重載，三段內容逐值相同） |
| 11 | **Mobile 390px 無水平溢出**（量 app 滾動容器，不是 `document.body`） |
| 12 | Mobile 下摘要、最近冠軍、歷屆清單都仍看得到 |
| 13 | 全程**無 uncaught exception**，畫面無 `undefined` / `NaN` |
| 14 | **入口可達**：從儀表板「更多功能 → 戰隊詳情」點得到，且面板在該頁 |

### 測試紀律（延續 Q7c，這是硬性要求）

**每一條新斷言寫完後必須做 mutation test**：故意把對應程式改壞，
確認斷言會紅，再相信它。至少涵蓋：

1. 把 `myAnnualChampionCount` 改成 `+1` ⇒ **#5／#7 必須紅**
2. 把歷屆清單反向排序 ⇒ **#3／#9 必須紅**
3. 把「我方」判斷改成永遠 true ⇒ **#4 必須紅**
4. 塞一個 900px 固定寬元素 ⇒ **#11 必須紅**

⚠ **欄位斷言一律結構化讀取**（`data-*` 或指定節點的文字），
**不要用整頁字串搜尋** ——
React 把 `undefined` 渲染成**空白**而不是字串，全頁搜尋 `undefined`
永遠不會失敗。這個坑在本 milestone 已經出現三次。

⚠ **DOM 裡可能同時存在桌機與手機兩套佈局**（一套用 CSS 隱藏）。
若採用那種做法，任何「數量等於 N」的斷言都要**先去重或過濾可見性**——
Q7c 的正式站 smoke 就是在這裡讀到 8 張卡片而不是 4 張。

---

## J. 給 Codex 的實作提示詞

```
實作 Q7e：戰隊榮譽 TEAM HONORS UI。
規格見 docs/design/Q7e_戰隊榮譽UI規格.md，逐節照做。

# STEP 0 — 工作樹護欄（先做，其他都不要動）
cd 到 Q7e 指定的 worktree，然後執行並確認：
  git rev-parse HEAD            # 必須等於交付時指定的 SHA
  git rev-parse --abbrev-ref HEAD
  git status --short            # 必須是空
任一不符：立即停止、不得修改任何檔案、回報所見。
**禁止在主 repo D:/OneDrive/文件/GitHub/ESMO 做任何編輯。**

可改的檔案：
- src/platform/profileStore.js（只加 honorsView.myTeamId 一個欄位，見規格 §0.2）
- src/screens/manage/honors/*.jsx（新增）
- src/screens/manage/TeamScreen.jsx（只加一行 <TeamHonorsPanel />，位置見 §B）
- tools/browser_check_team_honors_ui.mjs（新增）
其他檔案：停下回報，不要編輯。

紅線（違反就停下回報，不要自己想替代方案）：
1. UI 只讀 competitionView().honorsView。不得讀 honors 原始切片、
   不得讀 competition、不得用 useProfileStore 另外取 team.id。
2. 不得自行算 teamHonorCount、不得自行找 latest champion、不得重排歷屆清單、
   不得重建 honor identity、不得從 Event.final／SeasonSeal／careerFinal／
   Circuit Points 補歷史。
3. honors 為空就是真的沒有——顯示明確空狀態，不得造假 Season 或假冠軍。
4. 玩家 0 冠要**明確顯示 0**，不得改寫成假成就。
5. AI 冠軍必須完整顯示且保持中性，不得只呈現玩家歷史。
6. earnedAtDay 不要當日期顯示（見 §0.3）；時間軸一律用賽季。
7. 沿用既有 GC token，不新增色票；金色只用在規格 §H 列的三處。
8. 不做獎金、不做 Achievement 系統、不做稱號、不做 Season Award、
   不新增 Honor 類型、不碰 Battle Engine／Shop／MMR。
9. 不新增 Router / page。

驗證（宣稱完成前必跑，輸出貼回報）：
- node tools/browser_check_team_honors_ui.mjs（新增，見 §I 的 14 條）
- node tools/check_q7d_honors.mjs        （必須維持 59/59）
- node tools/check_q7b_asia_finals.mjs   （72/72）
- node tools/browser_check_asia_finals_ui.mjs（15/15）
- node tools/browser_check_career_final_ui.mjs（12/12）
- node tools/check_competition_q4.mjs / q5 / q6（68 / 69 / 57，不得下降）
- node tools/regress.mjs / regress2.mjs / npm run build

⚠ 每一條新斷言都要先做 mutation test，至少做規格 §I 列的四個，逐一貼證據並還原。
⚠ 欄位斷言結構化讀取，不要全頁搜尋 undefined。
⚠ 手機溢出量 app 滾動容器，不是 document.body。

完成後 commit，不 push、不 deploy。回報：
① 護欄檢查輸出
② 改了哪些檔案（git diff --stat）
③ honorsView 增加的欄位與理由
④ 14 條瀏覽器驗收逐條結果
⑤ mutation test 證據（改壞什麼、是否變紅、是否還原）
⑥ 既有驗證器前後數字
⑦ 規格中做不到的部分與原因
```

---
---

# 視覺 Polish 附錄（第二輪）

> 第一輪（`a339bd8`）已通過全套驗證與四項 mutation test，**結構與資料層定案**。
> 本附錄只談**視覺**與**一個 UI 韌性小修**。
> ⚠ 附錄不覆寫正文任何一條紅線；正文 §F 三條紅線、§I 的 14 條 gate **全部繼續有效**。

## K. 這一輪能動什麼

| 可以動 | 不能動 |
|---|---|
| `honors/*.jsx` 的 CSS 與 DOM 結構 | `honorsView` 的資料語意（欄位、型別、順序） |
| class 名稱、新增 `data-*` 顯示鉤子 | 新增任何 selector 計算 |
| `TeamHonorsPanel` 的訂閱方式（見 §O） | Q7d `honors.js` 的真相層 |
| — | `TeamScreen` 重構、新頁面／Router |

**第一輪已經做對、不得回退的三件事**：
① 面板只讀 `competitionView().honorsView`，不碰 `s.team.id`；
② 不排序、不算次數；③ `earnedAtDay` 不顯示。

---

## L. Signature：**獎盃銘板牆**

歷屆冠軍**不要是一般 card list**。每一季是一塊**刻在獎盃底座上的金屬銘板**——
橫向、扁、彼此以刻線相接，像同一座獎盃上依年份排下來的一整排銘板。

### L.1 造型規則

| 項目 | 規則 |
|---|---|
| 排列 | 銘板**直接相鄰**，用 `1px` `GC.line` 當**刻線**分隔；不要每列獨立圓角卡片、不要列間 gap |
| 圓角 | 只有整面牆的**最外框**有圓角，內部銘板**不要各自圓角** |
| Season 編號 | 使用既有 `MONO`（`src/ui/theme.js`），定寬、字距略開，像壓印的年份 |
| 冠軍隊名 | **主要視覺**——本列字級最大、字重最高，其他元素都讓位給它 |
| 榮耀標籤 | 降為次要：小字、`GC.gray`、不搶隊名 |
| 刻痕感 | 靠 `inset` 髮絲線（亮下沿／暗上沿）做**壓印**，不是靠 `box-shadow` 外擴 |
| 禁止 | 大量 shadow 堆疊、emoji、卡片層層堆疊、新色票、動畫進場 |

⚠ `MONO` 目前在 `honors/` **完全沒被使用**——這是本輪要引入的既有 token，
不是新字體。

### L.2 兩種銘板

| | AI 冠軍 | 玩家自己的冠軍 |
|---|---|---|
| 材質語意 | **鋼灰／中性** | **金色刻痕** |
| 底色 | 與牆面同階，不加色 | `GC.gold` 極低透明度，仍要壓得住不刺眼 |
| 隊名色 | 中性亮色（沿用 `GC.blueL` 或中性白） | `GC.gold` |
| Season | `GC.gray` | `GC.gold` |
| 層級 | 平貼 | **略高一階**（更亮的刻線／左側金色軸），但**不得靠放大字級或位移破壞對齊** |

⚠ AI 冠軍**必須完整可讀**（隊名、賽季、標籤都在）——這是世界歷史，
不是把 AI 做成灰掉的背景板。正文 gate #4 守這件事。

---

## M. 視覺克制

- **大膽只花在銘板牆**。`HonorSummary` 與 `LatestChampionCard` **保持安靜**：
  維持既有結構與密度，不要跟著做金屬質感，不要與銘板牆爭主視覺。
- **金色只代表真正屬於玩家的冠軍榮耀。**
  「世界已有冠軍」≠「玩家有冠軍」，兩者視覺上必須分得開。
- ⚠ **第一輪這件事已經做對了，不要改壞**：`HonorSummary` 的
  `data-has-honors` 是由 **`hasMine`**（玩家自己）驅動，
  **不是** `annualChampions.length > 0`。
  現有 21 處 `GC.gold` 全部掛在 `-mine` 或 `data-has-honors="true"` 之下。
  **維持這條線**：任何金色都必須能追溯到「這是玩家的」。
- **玩家 0 冠仍要明確顯示 0**（正文 gate #5），不得因為視覺安靜而藏掉、
  換成「—」或整塊不渲染。

---

## N. 明確不做

- ❌ **不做完整賽季時間軸**。那需要 `currentSeason` 之類的額外資料，
  **本輪不為了視覺增加資料層需求**。銘板牆只呈現 `annualChampions` 已有的季次，
  缺季不補空位、不畫連續軸線。
- ❌ 不新增色票、不引入新視覺系統（正文 §H 已定）。

---

## N.1 Mobile 390px

- 銘板改**垂直堆疊**（既有 `@media (max-width: 767px)` 內處理，不新增斷點）
- **隊名與 Season 必須仍可快速掃讀**：Season 不得縮到難辨，隊名不得被截斷成
  無法辨識；長隊名沿用既有 `overflow-wrap: anywhere` 換行，不用 ellipsis 吃掉
- **不得水平溢出**（正文 gate #11，量 app 滾動容器）

---

## O. UI 韌性小修（唯一允許的非視覺改動）

`TeamHonorsPanel` 目前是：

```js
const honorsView = useProfileStore.getState().competitionView().honorsView ?? {};
```

`getState()` **沒有建立訂閱**，`honorsView` 更新時元件不會重新 render。
目前沒有實際 bug（榮耀只在別的畫面產生、進頁面才讀），但很脆。

**改成正式 Zustand 訂閱**，比照同專案既有寫法
（`AsiaFinalsPanel` 用 `useProfileStore((s) => s.competition)`）。

限制：
- **不改 `honorsView` 資料語意**
- **不新增 selector 計算**——訂閱既有 slice 後仍呼叫 `competitionView()`，
  不要在 selector 裡做 `filter` / `sort` / `map` / 物件字面量
  （會產生新參考，每次都重繪）
- 不因此改動 `profileStore.js`

---

## P. 第二輪 gate 與 mutation test

`tools/browser_check_team_honors_ui.mjs` 既有 14 條**全部必須續綠**。
視覺改動若讓任何一條變紅，是改壞了，不是斷言過時。

### P.1 本輪必做的 mutation test

延續正文 §I「測試紀律」——**每條斷言先確認改壞會紅，再相信它**：

1. **把「玩家自己的銘板」判斷改成永遠 `true`** ⇒ **gate #4 必須紅**（本輪硬性要求）
2. 把 `myAnnualChampionCount` 改成 `+1` ⇒ #5／#6／#7 必須紅
3. 把歷屆清單反向排序 ⇒ #3／#9 必須紅
4. 塞一個 900px 固定寬元素 ⇒ #11 必須紅

⚠ **變異必須先確認真的生效**。第一輪做 #4 時，用了不存在的錨點字串
（`<div className="th-overview` 實際是 template literal），
`String.replace` **靜默 no-op**，gate 照樣全綠 ——
差點被誤判成「gate 漏檢」。
**每次變異後先驗證檔案真的被改了**（grep 改動後的特徵字串），再跑 gate。
變異全部還原後，`git status` 必須乾淨。

### P.2 完整驗證（宣稱完成前必跑）

- 五支 browser gate：`circuit_points` 21、`career_final` 12、`default_scheme` 15、
  `asia_finals` 15、`team_honors` 14
- Node：Q1 93／Q2a 112／Q2b 92／Q3 91／Q3.5 65／Q4 68／Q5 69／Q6 57／
  3a 29／3b 51／3c 69／3d 67／3f 43／3f.1 42／Q7b 72／**Q7d 59**
- `regress` 15/15、`regress2` 8/8、`npm run build` 看到 `built in`

⚠ **既有紅燈、非回歸訊號**：`check_moba_milestone_b2`（斷言 `1.1` vs `2.2`）
在沒有本 milestone 的主幹上就是紅的，與 Q7e 無關，不要試圖修它。
