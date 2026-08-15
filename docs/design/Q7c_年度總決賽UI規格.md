# Q7c：亞洲年度總決賽 UI ＋ 年度榮耀呈現 — 產品／資料規格

> 狀態：**規格，尚未實作**。本文交給 Codex 實作。
> 前置：Q7b 已部署（main `03f9575`）。資料層完整，本輪**只做呈現**。

---

## 0. 開工前必讀：一個資料層的既有事實

`competitionView().playoff` **是官方聯賽專屬的**——它內部讀 `activePlayoffOf(state)`，
而那是 `competitions{}` 的第一筆（官方聯賽）。**年度總決賽拿不到它。**

但底下兩個函式是**完全參數化**的，吃任何 fixtures／outcomes／participants：

- `playoffs.js → playoffBracket({ fixtures, outcomes, participants })`
- `playoffs.js → playoffOrder({ fixtures, outcomes })`

⇒ **本輪唯一允許的資料層改動：在 Store 加一個唯讀傳遞欄位
`competitionView().asiaFinals`**，內容全部用上面這兩支既有函式算出來。
**不得新增任何對戰表／名次／晉級邏輯**，畫面更不得自己算。

---

## A. 畫面資訊架構

年度總決賽**不是**賽事切換列裡的第五張卡片。它是賽季的終點，資訊層級要高一階。

```
賽事頁 CompetitionScreen
├─ ①【新】年度榮耀區塊  ← 只在「資格已核發」之後才出現，置於頁面最上方
│    ├─ 冠軍橫幅（僅在 Event.final 存在時）
│    ├─ 晉級區（Top 4，seed 1–4）
│    └─ 對戰樹（SF1 / SF2 / 季軍戰 / 決賽）
├─ ② 本季賽事 EVENTS 切換列（既有，維持現況）
├─ ③ 巡迴積分 CIRCUIT POINTS（既有，維持現況）
├─ ④ 最終名次 FINAL STANDINGS（既有＝**官方聯賽**生涯成績，維持現況）
├─ ⑤ 歷屆成績 / 歷屆巡迴（既有）
└─ ⑥ 今日賽事 / 下一場（既有）
```

### 為什麼放在最上方而不是最下方

年度總決賽只在賽季末段存在，而它存在的那段時間就是玩家最關心的事。
它出現時把它放在第一屏，比放在第五個面板讓玩家自己捲下去合理。

⚠ **資格未核發時整個區塊不存在**（不是灰掉、不是「敬請期待」）。
理由與 Q7b 資料層一致：資格沒核發，這個賽事在資料上就**不存在**。
畫面畫一個空殼等於在說「有這個東西只是還沒開」，那是假的。

### 與既有區塊的層級差異（不是換顏色）

| 手法 | 年度榮耀區塊 | 一般 Event 卡片 |
|---|---|---|
| 容器 | **整寬面板**，有自己的標題列與外框 | 橫向捲動列裡的小卡 |
| 標題 | `🏆 亞洲年度總決賽 ASIA ANNUAL FINALS` | 只有賽事名稱 |
| 內容 | 冠軍橫幅 ＋ 晉級區 ＋ 對戰樹（三段） | 狀態徽章 ＋ 進度條 ＋ 名次 |
| 出現時機 | 只在賽季末段（資格核發後） | 整季都在 |

⚠ 年度總決賽**仍然**會出現在 ② 的切換列裡（它是一個正常 Event，Q7b 已驗）。
不要為了做這個區塊把它從切換列拿掉——那會讓「切到它看積分榜」壞掉。

---

## B. Desktop layout（≥ 768px）

```
┌───────────────────────────────────────────────────────────────┐
│ 🏆 亞洲年度總決賽 ASIA ANNUAL FINALS          [進行中 / 已結束] │
├───────────────────────────────────────────────────────────────┤
│  ┌─ 冠軍橫幅（Event.final 存在時才出現）──────────────────────┐ │
│  │   🏆  寒冰守衛                          亞洲年度冠軍       │ │
│  │       亞軍 烈焰鳳凰 · 季軍 黑曜劍士 · 殿軍 翡翠龍騎        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                               │
│  晉級隊伍 QUALIFIED                                            │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                  │
│  │ ① 黑曜 │ │ ② 翡翠 │ │ ③ 烈焰 │ │ ④ 寒冰 │   ← 我方那張高亮 │
│  │ 273 分 │ │ 233 分 │ │ 195 分 │ │ 190 分 │                  │
│  └────────┘ └────────┘ └────────┘ └────────┘                  │
│                                                               │
│  對戰樹 BRACKET                                                │
│    準決賽              決賽                                    │
│  ┌──────────┐                                                 │
│  │ ① 黑曜   │──┐                                              │
│  │ ④ 寒冰 ✓ │  │   ┌──────────┐                               │
│  └──────────┘  ├──▶│ ④ 寒冰 ✓ │  🏆                           │
│  ┌──────────┐  │   │ ③ 烈焰   │                               │
│  │ ② 翡翠   │──┘   └──────────┘                               │
│  │ ③ 烈焰 ✓ │                                                 │
│  └──────────┘      ┌──────────┐                               │
│                    │ 季軍戰    │  ① 黑曜 ✓ / ② 翡翠            │
│                    └──────────┘                               │
└───────────────────────────────────────────────────────────────┘
```

- 兩欄式對戰樹：左欄兩場準決賽、右欄決賽；**季軍戰另起一列**（它不在主線上，
  放進樹裡會讓連線變成錯的）
- 勝方以 `✓` ＋ 金色標示；敗方降低不透明度
- 每場顯示比分（有賽果時）與**遊戲日**

## C. Mobile layout（390px 優先）

**對戰樹在手機上不畫樹，改成垂直的四張對戰列。** 理由：
四隊單淘汰的樹在 390px 寬要嘛字小到看不清、要嘛必須橫捲；
而這個樹只有 4 場，垂直列表資訊完全不損失，還能一眼看完。

```
┌─────────────────────────────┐  ← 390px
│ 🏆 亞洲年度總決賽     [進行中] │
├─────────────────────────────┤
│ ┌─ 冠軍橫幅（完成後才有）──┐ │
│ │ 🏆 寒冰守衛              │ │
│ │    亞洲年度冠軍          │ │
│ └─────────────────────────┘ │
│                             │
│ 晉級隊伍                     │
│ ① 黑曜劍士          273 分   │
│ ② 翡翠龍騎          233 分   │
│ ③ 烈焰鳳凰          195 分   │
│ ④ 寒冰守衛          190 分   │  ← 我方那列高亮
│                             │
│ 對戰                         │
│ ┌─────────────────────────┐ │
│ │ 準決賽 ①      第 90 天   │ │
│ │ 黑曜劍士   1              │ │
│ │ 寒冰守衛 ✓ 2   已完成     │ │
│ ├─────────────────────────┤ │
│ │ 準決賽 ②      第 90 天   │ │
│ │ …                        │ │
│ ├─────────────────────────┤ │
│ │ 季軍戰        第 92 天   │ │
│ │ …             未開始     │ │
│ ├─────────────────────────┤ │
│ │ 決賽 🏆       第 92 天   │ │
│ │ …             未開始     │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

**重要資訊優先序**（由上到下）：冠軍 → 晉級名單 → 下一場我方比賽 → 其餘對戰。

⚠ **整頁不得水平溢出**。若最終仍選擇在手機上畫樹，樹**必須**包在
`overflow-x: auto` 的容器內，且該容器不得讓 body 溢出。

⚠ **量寬度要量滾動容器，不是 `document.body`。**
這個 app 的內容被祖先 `overflow:hidden` 裁掉，`body.scrollWidth` 永遠等於視窗寬——
Q7a-3e／3f.1 連續兩次假綠都栽在這裡。正確做法見 §G。

---

## D. Component 拆分建議

| Component | 職責 | 大小 |
|---|---|---|
| `AsiaFinalsPanel` | 容器：標題列、狀態徽章、決定三個子區塊出不出現 | 小 |
| `AnnualChampionBanner` | 冠軍橫幅（**只在 `final` 存在時 render**） | 小 |
| `QualifiedList` | Top 4 卡片／列，seed、隊名、積分、我方高亮 | 小 |
| `FinalsBracket` | 對戰樹（desktop）／對戰列（mobile） | 中 |
| `BracketMatch` | 單場：雙方、比分、勝方標記、狀態、日期 | 小 |

放在 `src/screens/manage/asiaFinals/`，由 `CompetitionScreen` 匯入一個
`<AsiaFinalsPanel />`。**不要把這些塞進 CompetitionScreen 本體**——它已經 600 行。

---

## E. 每個 Component 的資料來源

### E0.【唯一允許的資料層改動】`competitionView().asiaFinals`

在 `profileStore.competitionView()` 加一個唯讀欄位。**全部用既有函式算**：

```js
asiaFinals: (() => {
  const ev = asiaFinalsEventOf(state);            // asiaFinals.js（既有）
  const can = canOpenAsiaFinals(state);           // asiaFinals.js（既有）
  if (!ev) return { exists: false, reason: can.reason };   // 資格未核發 ⇒ 區塊不 render
  const entry = state.competitions[ev.rankingCompetitionId];
  const fixtures = (state.fixtures ?? []).filter((f) => f.stageId === entry.playoff.stage.id);
  const order = playoffOrder({ fixtures, outcomes: state.outcomes ?? [] });   // playoffs.js（既有）
  return {
    exists: true,
    eventId: ev.id,
    name: ev.name,
    //  晉級名單：**已核發的資格本身**，不是重算的
    qualified: entry.playoff.qualification.qualified,
    //  對戰樹：既有的參數化函式，餵年終賽自己的 fixtures 與參賽者
    bracket: playoffBracket({
      fixtures, outcomes: state.outcomes ?? [],
      participants: entry.stage.participants,
    }),
    //  ⚠ 日期換算在這裡做一次。畫面**不得自己加 startDay**（既有紅線）
    days: Object.fromEntries(fixtures.map((f) => [f.playoffKey, absoluteDayOf(state, f)])),
    done: isAsiaFinalsDone(state),                // asiaFinals.js（既有）
    championTeamId: order.championTeamId,         // 四場沒打完 ⇒ null
    //  年度冠軍的唯一真相
    final: eventFinalOf(state, ev.id),            // 四場沒打完 ⇒ null
    playerTeamId: state.playerTeamId,
  };
})(),
```

⚠ **這一段只有 filter 與呼叫既有函式，沒有一行是新的規則。**

### E1. 各 Component 讀什麼

| Component | 讀 | **不得讀／不得算** |
|---|---|---|
| `AsiaFinalsPanel` | `view.asiaFinals.exists` / `.name` / `.done` | 不得用 `eventViews` 判斷要不要出現（那是切換列的摘要） |
| `AnnualChampionBanner` | `view.asiaFinals.final`（`rows` / `championTeamId` / `playerRank`） | **不得用 `bracket` 推冠軍**；不得讀 `view.final`（那是 SeasonSeal） |
| `QualifiedList` | `view.asiaFinals.qualified`（`seed` / `teamId` / `name` / `points`） | **不得從 `circuitPoints.standings` 取前四** |
| `FinalsBracket` | `view.asiaFinals.bracket` ＋ `.days` | **不得自己判勝方**；不得自己排 1v4／2v3 |
| `BracketMatch` | `bracket[i]` 的 `exists` / `done` / `winner` / `score` / `nameA` / `nameB` | 不得自己比分數決定勝方 |

### E2. 三條語意紅線

1. **`Event.final` 是年度冠軍的唯一真相。** `view.asiaFinals.final` 為 `null`
   就是「還沒有冠軍」，畫面**不得**用 bracket 的決賽勝方提前顯示。
2. **`state.final`（`view.final`）是 Season-level 的 `SeasonSeal.v1`**，
   多 Event 時**沒有** `rows`／`playerRank`／`championTeamId`。年度榮耀區塊
   **完全不讀它**。
3. **`careerEventId` 指官方聯賽**，`view.careerFinal` 是**生涯成績**。
   年度冠軍與生涯成績是兩件事，**不得互相取代**，也不得放在同一個面板裡。

---

## F. UI 狀態

| 狀態 | 判定 | 呈現 |
|---|---|---|
| **不存在** | `asiaFinals.exists === false` | **整個區塊不 render**（連標題都沒有） |
| **待開打** | `exists` ＋ `bracket` 只有 sf1／sf2 且都 `done: false` | 晉級區 ＋ 兩場準決賽（狀態：未開始） |
| **進行中** | 有 `done: true` 但 `asiaFinals.done === false` | 已完成的顯示比分與勝方；未排出的季軍戰／決賽顯示「等準決賽結果」 |
| **決賽待打** | sf 都 done、bronze／final `done: false` | 決賽卡片高亮，標「**冠軍戰**」 |
| **已完成** | `asiaFinals.done && final` | 冠軍橫幅出現；對戰樹全部標示勝負 |
| **玩家未晉級** | `qualified` 不含 `playerTeamId` | 正常顯示（觀戰視角）；晉級區不高亮任何一列，**不顯示「你的名次」** |

⚠ **未排出的場次**（`bracket[i].exists === false`）要畫成「待定」，
**不得畫成一場雙方未知的比賽**——那是 Q6 既有的誠實作法，沿用。

⚠ 沒有「locked」狀態。資格未核發時賽事在資料上就不存在，
畫一個上鎖的空殼等於憑空發明一個狀態。

---

## G. Browser 驗收清單

新增 `tools/browser_check_asia_finals_ui.mjs`。用既有 harness
（`startDevServer` ＋ `launchChrome` ＋ `RESOLVE_APP_MODULES`）。

⚠ **網址要明確帶旗標**（`?asiaCircuit=1`），不要吃預設值——Q7a-3f.2 的教訓。

| # | 檢查 | 情境 |
|---|---|---|
| 1 | 資格未核發 ⇒ **頁面完全找不到「亞洲年度總決賽」區塊** | 新局 |
| 2 | 三站封存後 ⇒ 區塊出現，標題與狀態徽章正確 | 注入 ready 存檔 |
| 3 | 晉級區**四隊、seed 1–4、順序與 `qualified` 逐 teamId 相同** | 同上 |
| 4 | **第 5 名的隊名不在區塊裡** | 同上 |
| 5 | sf1 顯示 1 vs 4、sf2 顯示 2 vs 3 | 同上 |
| 6 | 季軍戰／決賽顯示「待定」，**不顯示假的對戰組合** | 同上 |
| 7 | 準決賽打完 ⇒ 勝方有標記、比分顯示、決賽對手＝兩勝方 | 注入 semis 存檔 |
| 8 | **四場沒打完 ⇒ 頁面沒有「亞洲年度冠軍」字樣** | 同上 |
| 9 | 四場打完 ⇒ 冠軍橫幅出現，隊名＝`final.championTeamId` 對應的隊伍 | 注入 sealed 存檔 |
| 10 | 冠軍橫幅顯示的名次來自 `Event.final.rows`，**與資料層逐值相同** | 同上 |
| 11 | 賽季封存後，**「最終名次」面板仍顯示官方聯賽的生涯名次**（不是年度冠軍） | 同上 |
| 12 | 玩家未晉級時不顯示「你的名次」，也不 crash | 同上 |
| 13 | **390px 無水平溢出**——量**滾動容器**（`scrollWidth > clientWidth`），不是 body | 全部情境 |
| 14 | 390px 下晉級名單與冠軍仍看得到 | sealed |
| 15 | 全程無未捕捉例外、無 `undefined` / `NaN` | 全部情境 |

### 每一條斷言都要先做變異測試

**寫完斷言後，先故意把對應的程式改壞，確認它會紅，再相信它。**
這個 milestone 已經出現過**三次同一家族的假綠**：

- `document.body.scrollWidth` 量不到溢出（內容被祖先 `overflow:hidden` 裁掉）
- 「超出視窗且不在可捲動容器裡」也量不到（app 的滾動容器兩軸都是 `auto`）
- 「整頁不含 undefined」量不到欄位消失（**React 把 `undefined` 渲染成空白，不是字串**）

⇒ 檢查「某個欄位有沒有正確顯示」時，**結構化讀出那個欄位所在的那一行文字**
再比對，不要用全頁字串搜尋。

---

## H. 給 Codex 的實作提示詞

```
實作 Q7c：亞洲年度總決賽 UI。規格見 docs/design/Q7c_年度總決賽UI規格.md，逐條照做。

基線：main 03f9575，Q7b 已部署，資料層完整。

允許改的檔案：
- src/platform/profileStore.js（只加 competitionView().asiaFinals 一個唯讀欄位）
- src/screens/manage/asiaFinals/*.jsx（新增）
- src/screens/manage/CompetitionScreen.jsx（只加一行 <AsiaFinalsPanel />）
- tools/browser_check_asia_finals_ui.mjs（新增）

紅線（違反就停下回報，不要自己想替代方案）：
1. UI 不得自己算積分、晉級、bracket 勝方、最終名次。
   全部從 competitionView().asiaFinals 讀。
2. competitionView().asiaFinals 只能用既有函式組出來：
   asiaFinalsEventOf / canOpenAsiaFinals / isAsiaFinalsDone（asiaFinals.js）、
   playoffBracket / playoffOrder（playoffs.js）、eventFinalOf / absoluteDayOf（seasonState.js）。
   **不得新增任何對戰表或名次邏輯。**
3. 年度冠軍的唯一真相是 Event.final。它是 null 就是還沒有冠軍，
   不得用 bracket 的決賽勝方提前顯示。
4. 不得讀 view.final 當作年度冠軍——那是 Season-level 的 SeasonSeal.v1，
   多 Event 時沒有 rows / playerRank / championTeamId。
5. careerEventId / careerFinal 是官方聯賽的生涯成績，與年度冠軍是兩件事，
   不得互相取代，也不得放在同一個面板。
6. 資格未核發時整個區塊不 render（不要做 locked 空殼）。
7. 不做獎金、不做 Circuit Points、不做 Season Award、不碰 Battle Engine、
   不改任何既有賽事規則。

驗證（宣稱完成前必跑，輸出貼回報）：
- node tools/browser_check_asia_finals_ui.mjs（新增，見規格 §G 的 15 條）
- node tools/check_q7b_asia_finals.mjs        （必須維持 72/72）
- node tools/check_q7a_3f1_career_final.mjs   （必須維持 42/42）
- node tools/browser_check_career_final_ui.mjs（必須維持 12/12）
- node tools/browser_check_circuit_points_ui.mjs（必須維持 21/21）
- node tools/check_competition_q4.mjs / q5 / q6（不得下降）
- node tools/regress.mjs / regress2.mjs / npm run build

⚠ 每一條新斷言都要先做變異測試：故意把對應程式改壞，確認斷言會紅，再相信它。
這個 milestone 已經出現三次假綠，原因與正確做法寫在規格 §G。

⚠ 手機寬度要量**滾動容器**的 scrollWidth/clientWidth，不是 document.body。

完成後 commit，不 push、不 deploy。回報：
① competitionView().asiaFinals 的實際內容（貼一份 JSON）
② 15 條瀏覽器驗收的逐條結果
③ 變異測試證據（哪幾條、改壞什麼、是否變紅）
④ 既有驗證器的前後數字
```

---

## 附錄：本規格依據的實測資料

以 `s7b_finals_semis_done.json`（三站打完、準決賽打完）實測：

```
qualified   [{seed:1,黑曜劍士,273},{seed:2,翡翠龍騎,233},
             {seed:3,烈焰鳳凰,195},{seed:4,寒冰守衛,190}]
第 5 名      暗影狼群 153 分（不在名單內）
bracket     sf1 黑曜 vs 寒冰 → 寒冰 ✓ 2:1（第 90 天）
            sf2 翡翠 vs 烈焰 → 烈焰 ✓ 2:1（第 90 天）
            bronze 黑曜 vs 翡翠 未開始（第 92 天）
            final  寒冰 vs 烈焰 未開始（第 92 天）
playoffOrder {ok:false, order:null, championTeamId:null}   ← 四場沒打完就沒有冠軍
Event.final  null                                          ← 同上
```

四場打完後（`s7b_season_sealed.json`）：

```
Event.final  FinalStandings.v1，rankSource: "playoff"，4 列
冠軍         寒冰守衛（＝決賽勝方）
state.final  SeasonSeal.v1        ← Season-level，與年度冠軍無關
careerFinal  comp:moba:s1:official:regular，玩家第 8 名   ← 生涯成績，官方聯賽
```

---

# 視覺 Polish 附錄（Q7c 第二輪）

> 前置：第一輪結構實作已 commit（`8cbf794`），browser gate 15/15。
> 本附錄**只談呈現**。第二輪**不得改 production 規則**。

## 1. 視覺定位

年度總決賽是**整季最高層級的賽事**——它是三站巡迴賽與整套積分制度的收束點，
一季只出現一次，而且只在賽季末段出現。它的視覺重量應該高於同頁任何其他區塊。

玩家掃過這個面板，三件事要**各自在一眼之內**成立：

| 要看懂 | 靠什麼 |
|---|---|
| 誰靠積分晉級 | 晉級區的四張卡：種子 ＋ 隊名 ＋ 巡迴總分 |
| 現在打到哪 | 對戰樹的完成／進行／待定狀態差異 |
| 誰是年度冠軍 | 冠軍橫幅（只在有結果時存在） |

⚠ 三件事**不要互搶**。同一時間只有一件是主角：冠軍未產生時主角是對戰樹，
冠軍產生後主角是橫幅、對戰樹退為佐證。

## 2. 色彩紀律

- **不新增色票。** 一律使用 `src/ui/theme.js` 的既有 `GC` token
  （`gold` `purp` `green` `blue` `red` `gray` `line` `card`）與現有的
  `rgba(...)` 衍生值。不得引入新的色相。
- **金色（`GC.gold` / `#fbbf24`）是稀缺資源**，只保留給三處：
  1. 晉級區（種子圓章、我方卡片邊框）
  2. 冠軍（橫幅、冠軍那一列名次）
  3. **冠軍之路**（見 §3）
- **不得把整塊面板鍍金。** 面板外框、標題、狀態徽章、未完成的比賽一律走
  中性色（`GC.gray` / `line` / 白色低透明度）。
  ⚠ 現況 `.af-panel` 的外框已是 `rgba(251,191,36,0.32)`——那是**整塊鍍金的起點**，
  第二輪應把它降為中性，把金色讓給真正該亮的東西。
- 敗方用**降透明度**表達，不要用紅色。輸掉不是錯誤狀態。

## 3. Signature：冠軍之路

**這是整個面板唯一的「大膽」之處，其他地方保持安靜。**

`Event.final` 出現之後，把**冠軍實際走過的那條路**用金色連起來：
準決賽（他贏的那一場）→ 決賽。其餘對戰（另一場準決賽、季軍戰）降低視覺權重。

實作方式（純顯示，不新增資料）：

```
championId = asiaFinals.final?.championTeamId        // 只有 final 存在時才有
onPath(match) = !!championId && match.winner === championId
```

- `onPath` 的比賽：金色描邊 ＋ 提高對比
- 其餘比賽：降飽和／降透明度
- Desktop 可在準決賽與決賽之間畫一條金色連接線；Mobile 用左側金色細軸即可

⚠ **紅線**：`championId` **只能**來自 `asiaFinals.final.championTeamId`。
`final` 為 `null` 時**整條路徑不存在**——不得用 bracket 的決賽 `winner` 代替。
（第一輪的 gate #8 正是在守這件事，變異測過會紅。）

⚠ 命名衝突提醒：現況 `.af-match-champion` 的語意是「**這是決賽**」
（`championMatch` prop），不是「冠軍走過的路」。第二輪若要用類似命名，
請換一個 class（例如 `.af-match-onpath`），不要覆寫既有語意。

## 4. 種子資訊

種子 ①②③④ **是資訊不是裝飾**——它是三站積分掙來的，順序本身帶訊息：
看到「④ 擊敗 ①」才讀得出爆冷。

**現況缺口**：種子目前**只有晉級名單有**（`QualifiedList` 的 `data-seed`）。
`playoffBracket` 不回傳 seed，所以**對戰卡與冠軍橫幅上沒有種子**。

**第二輪要補**：對戰卡的雙方、冠軍橫幅的每一列，都要帶種子標記。

⚠ **作法：以 `teamId` 對 `asiaFinals.qualified` 做查表**，
不要改 `competitionView().asiaFinals` 的資料形狀。

```
seedOf = (teamId) => qualified.find((q) => q.teamId === teamId)?.seed ?? null
```

這是兩個既有欄位的顯示層 join，不是計算。**不需要動資料層。**

種子的視覺形式在三處要**一致**（同樣的圓章樣式與尺寸階層），
玩家才會把它認成同一個概念。

## 5. 狀態文案

現況的文案偏「氣氛式 TBD」，第二輪要改成**明確告訴玩家發生了什麼、接下來會怎樣**。

| 位置 | 現況 | 應改為（語意，不必逐字） |
|---|---|---|
| 未排出的決賽 | 「待定」＋「等準決賽結果」 | **「決賽對手將在兩場準決賽結束後排定」** |
| 未排出的季軍戰 | 同上 | **「季軍戰對手將在兩場準決賽結束後排定」** |
| 冠軍未產生 | （無） | **「年度冠軍將在決賽完成後產生」** |
| 玩家未晉級 | （無） | **「你這一季沒有取得年度總決賽資格」** |
| 日期未定 | 「日期待定」 | **「賽程將在對戰確定後公布」** |

原則（沿用專案既有的誠實界線）：
- 空狀態是**指路**，不是留白，也不是裝可愛
- 用主動語態、與資料層同一套詞彙（晉級／封存／已結算／核發）
- **不得**用「敬請期待」「即將開始」這種沒有資訊的句子

⚠ 「你這一季沒有取得年度總決賽資格」是**新增**的一句話。
既有 gate #12 斷言面板**不出現「你的名次」**——新句子不含那四個字，
但第二輪加完**必須重跑 gate 確認 #12 仍綠**。

## 6. Desktop

- **資訊架構維持第一輪**：冠軍橫幅 → 晉級區 → 對戰樹。不重排、不新增區塊。
- 強化的是**舞台感與層級**：面板標題與內文的字級差要拉開；
  區塊之間用留白分層，不要再加更多外框線。
- 對戰樹的**可讀性**優先於樹的形狀：準決賽兩場、決賽一場、季軍戰獨立一列
  （第一輪已是這個結構，維持）。連接線是輔助，不是主角。
- **不得為了視覺效果改 bracket 邏輯**——`FinalsBracket` 讀哪一場、
  `BracketMatch` 判勝負的方式一行都不動。

## 7. Mobile 390px

- **維持垂直比賽列表**（第一輪已是 `@media (max-width: 767px)` 切換），
  **不得**把桌機的兩欄樹硬塞進 390px。
- 優先順序（由上到下）：**冠軍 > 晉級名單 > 玩家下一場 > 其他比賽**。
  ⚠ 現況順序是 冠軍 → 晉級 → 對戰（sf1/sf2/季軍/決賽）。
  「玩家下一場」目前**沒有被提前**——第二輪可考慮把玩家有份且未完成的那一場
  在手機上標記出來（例如加一個「你的下一場」徽章），但**不要重排對戰順序**，
  賽程順序本身是資訊。
- **整頁不得水平溢出。** 量法：滾動容器的 `scrollWidth` vs `clientWidth`
  （gate #13 已經是這樣量的，`document.body` 量不到）。

## 8. 禁止事項

- **不改 `competitionView().asiaFinals` 的資料形狀。**
  若真的缺純顯示欄位（目前評估：**不缺**，種子可由 `qualified` 查表取得），
  **先停下回報**，不要自行加欄位。
- 不改 `qualification`、不改 `Event.final`、不改 `SeasonSeal` / `careerFinal` 語意
- 不新增 Circuit Points、獎金、賽制
- **不做動畫大改或重型特效**：允許 hover／狀態轉場等微互動，
  不要做進場動畫序列、粒子、持續動畫。要尊重 `prefers-reduced-motion`。
- 不動 `src/platform/` 底下任何檔案（第一輪的資料投影已足夠）

## 9. 既有 gate 是契約

`tools/browser_check_asia_finals_ui.mjs` 的 15 條**必須維持全綠**。
其中有些斷言鎖在**具體的 DOM 掛鉤與字串**上，polish 時很容易誤傷：

| 掛鉤 | 被哪條用 |
|---|---|
| `data-testid="asia-finals-panel"` / `annual-champion-banner` / `qualified-team` / `bracket-match` | 多條 |
| `data-seed` / `data-team-id` / `data-team-a` / `data-team-b` / `data-rank` | #3 #5 #7 #10 |
| `data-exists="false"`（待定卡） | #6 |
| 標題字串 `ASIA ANNUAL FINALS` | #2 |

⇒ **這些掛鉤與字串視為契約，不要重新命名。**
若 polish 確實需要改動被斷言的字串（例如 §5 的文案），
**必須在同一個 commit 內同步更新 gate，並重跑到 15/15**，
在回報中逐條說明改了哪一條、為什麼、原本守什麼、現在守什麼。

## 10. 第二輪驗收

- `node tools/browser_check_asia_finals_ui.mjs` → **15/15**（若有新增斷言，一併說明）
- `node tools/check_q7b_asia_finals.mjs` → 72/72
- `node tools/check_q7a_3f1_career_final.mjs` → 42/42
- `node tools/browser_check_career_final_ui.mjs` → 12/12
- `node tools/browser_check_circuit_points_ui.mjs` → 21/21
- `node tools/check_competition_q4.mjs` / `q5` / `q6` → 68 / 69 / 57
- `node tools/regress.mjs`、`node tools/regress2.mjs`、`npm run build`
- `git diff --stat` 必須**只有** `src/screens/manage/asiaFinals/*` 與（必要時）
  `tools/browser_check_asia_finals_ui.mjs`

⚠ 新增或修改的斷言一律先做**變異測試**：故意把對應樣式／邏輯改壞，
確認斷言會紅再相信它。理由與三次假綠的紀錄見 §G。
