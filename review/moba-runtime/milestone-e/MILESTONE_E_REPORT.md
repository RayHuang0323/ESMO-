# Milestone E Report — 對戰身分連動與資料一致性

日期：2026-07-30

範圍：E1 共用對戰名單／E1b 先發指派／E2 天賦與戰術可見化／E3 Replay 一致性／E4 安全網

狀態：本機實作與 Node 驗證完成；**未 push、未部署**，等待 Ray 確認。

## 1. 版本與禁改邊界

- 開工 HEAD／rollback tag：`91904c3`／`milestone-e-baseline`
- 本階段**不碰**：`LogicEngine`、公平性基準、`SIM_RULES`、地圖幾何、碰撞、導航。
- `MobaReplay.v1` **只附加 optional 欄位**（`ps`／`tb`），版本字串未升版，
  舊 Replay 缺欄仍可完整播放（verifier §5 有專門的舊檔測試）。
- `BattleResult.v2`、`CsMatchResult.v1`、`matchProgressTransaction` 契約未改。

**模擬未被改動的硬證據**：`regress` 與 `regress2` 的分布與 D-fix3 逐值相同
（15/15、平均 24.5 分、平均擊殺 31.9；20/20、節奏 8/8、平均 24.8 分、5 分均 Lv3.45）。
若這兩支數字有位移，就代表引擎被動到了——這是本階段最重要的回歸訊號。

## 2. 真正根因與修正

### E1：「上場的人」與「畫面上的人」不是同一批

`AppShell.jsx` 從來沒有把 `roster` 傳給 `GameView`，所以 `GameView` 一路吃預設值
`data/roster.js` 的靜態名單；同一時間 `useLocalServer` 注入引擎的卻是
`profileStore` 的真選手能力與天賦。結果是：選手改名、升級、換人，全部到不了
3D 名牌／隊伍面板／記分板／賽後戰報。

修正：新增純函式 `buildBattleRoster()`（`mobaRosterAdapter.js`），在 `AppShell`
組裝**唯一一份**對戰名單，`LoadingScreen` 與 `GameView` 共用。輸出形狀與既有
`draftRoster()` 完全相同，所以 HUD／HeroStrip／Scoreboard／EndScreen／
`MobaRuntimeView3D` 一行都不用改就吃得到。紅方無 profileStore 選手 ⇒ 仍走靜態
名單（AI 對手，不虛構）。

英雄身分優先序（Lineup 與戰場一致）：本場 Ban/Pick → 該選手綁定英雄 → 席位預設。

### E1b：招募的新秀永遠不可能上場

引擎席位寫死 b1–b5，而招募新秀的 id 是 `"r" + timestamp` ⇒ 對不上任何席位
（Sprint28 技術債 4）。

修正：新增契約 `platform/contracts/matchLineup.js`（`MatchLineup.v1`），把
「引擎席位」與「選手身分」正式分離：

```
seat（b1–b5，引擎位置） ←── lineup ──→ playerId（profileStore 的人）
```

- 持久化在 `profileStore.lineup`（schema v4；舊存檔缺欄 ⇒ `normalizeLineup`
  回退 identity ⇒ 行為與 Milestone E 之前逐鍵相同）。
- 一名選手不可能同時佔兩席（去重）；指派已在別席的人 ⇒ **兩席互換**。
- `buildPlayerStatSlots` 改吃 lineup：新秀坐 b3 時，注入引擎的 key 仍是 `b3`
  （**引擎零改動**），但 stats 來自那名新秀。
- 入口在 `LineupScreen` 的 🔁 換人面板，唯一寫入點是 `profileStore.setLineupSeat`。

**連帶修掉一個會發錯獎的缺陷**：`BattleResult.players[].id` 是席位不是選手 id，
先發指派上線後若不解析 lineup，XP 會發給板凳上的原 b3。`mobaResultToTransaction`
現在以 lineup 把席位換回真正上場的人（BattleResult 契約沒有改）。

### E2：天賦有效果，玩家看不見

`snapshot.playerStatsExec`（S28 起就有的逐選手行為統計）從來沒有任何 UI 顯示過。

- 戰中：`HeroDetailPanel` 新增「本場行為（天賦生效證據）」——撤退次數／參與團戰／
  目標周邊駐留，並標明是否注入能力。
- 賽後：`BattleEndScreen` 新增「能力／天賦執行」面板（逐人＋全隊合計）。
- 兩處都**只讀既有欄位**，不重新統計、不呼叫引擎、不寫 Store；未注入能力時整段不顯示，
  不編造 0。戰術執行仍讀 `BattleResult.tacticExecution`（原本就有，不另算一份）。

### E3：同一場比賽，Live 有、Replay 沒有

`state`（撤退/回城/團戰）、`respawn` 倒數、D-fix2 的 `decision`、以及團隊層
`teamBuffs`（HUD 的 `龍×N`／`巴 Ns`）**完全沒有被擷取**，`replayPresentationSource`
只能一律填 null ⇒ 重播的狀態徽章與 Boss 增益永遠空白。另外 `replay.comms`
（本場播報）早就完整保存，但重播畫面從來沒有顯示過它。

修正（全部 optional、向後相容）：

- frame 新增 `ps`＝`[stateCode, respawn?, actionCode?]`（變長列、字典索引壓縮，
  未知字串原樣保存 ⇒ 引擎日後新增狀態不會壞）。
- frame 新增 `tb`＝團隊 Dragon 層數／Baron 剩餘秒，**只在真的有增益時才寫入**。
- `MobaReplayScreen` 顯示團隊 Buff 與已保存的播報（不重新生成對話）。
- 順手修掉一句誤述：重播畫面原本寫死「未擷取小兵」，但 H.3 起 frame 已保存 `mn`
  ⇒ 改為只在舊 Replay 時顯示。

## 3. 修改檔案

新增：

- `src/platform/contracts/matchLineup.js`
- `tools/check_moba_milestone_e.mjs`

修改：

- `src/AppShell.jsx`、`src/GameView.jsx`、`src/useLocalServer.js`
- `src/platform/profileStore.js`、`src/platform/contracts/mobaReplay.js`
- `src/platform/progress/adapters/mobaProgressAdapter.js`
- `src/battle/moba/mobaRosterAdapter.js`、`src/battle/useBattleFeed.js`
- `src/battle/moba/replay/replayPresentationSource.js`
- `src/battle/ui/BattleEndScreen.jsx`、`BattleHeroStrip.jsx`、`HeroDetailPanel.jsx`
- `src/screens/moba/LineupScreen.jsx`、`LoadingScreen.jsx`、`MobaReplayScreen.jsx`

## 4. 驗證結果

| 驗證 | 結果 |
|---|---|
| `check_moba_milestone_e`（新增） | **49/49 PASS** |
| `check_moba_milestone_d_fix3` | PASS（塔彈 0.156→0.500→0.844、clearance 1.049） |
| `check_moba_milestone_d_fix2` | PASS（六種決策微場景、鏡像 commitment） |
| `check_moba_milestone_d` | PASS |
| `check_moba_milestone_c_fix` | PASS |
| `check_progress25` | 34/34 |
| `regress` | 15/15；平均 24.5 分、31.9 kills（**與 D-fix3 逐值相同**） |
| `regress2` | 20/20；節奏 8/8；平均 24.8 分、5 分均 Lv3.45（**與 D-fix3 逐值相同**） |
| production build | 2596 modules，exit 0；只有既有 >500 kB chunk warning |
| `check_moba_stats28` | 27/29（自身 27 條全過，含 §27 build；兩條紅燈都是巢狀子驗證器，見 §5） |
| `check_talent27` | 43/44（自身 43 條全過；唯一紅燈是巢狀 `experience26`，見 §5） |
| `check_moba_experience26` | 34/35（唯一紅燈＝ §17 replay 容量，**baseline 就是紅的**） |
| `check_moba_runtime29` | **未跑完**（見 §5 末尾說明，不宣稱通過） |

## 5. ⚠ 既有紅燈：Replay 單場容量已超過 2MB（非本階段造成）

`check_moba_experience26` §17「replay size 有上限」**在 `91904c3` 就已經是紅的**。
以 `git worktree` 在**未改動的 baseline** 上實跑同一支 verifier：

| 版本 | verifier §17 實測（同一組 728 frames） | 門檻 |
|---|---|---|
| `milestone-e-baseline`（91904c3） | **2063 KB → 紅** | 1953 KB（2,000,000 bytes）|
| Milestone E | 2162 KB → 紅 | 同上 |

- 主因是 **H.3 的小兵欄位 `mn`，單場佔 844 KB**（另以 seed 42／667 frames 的
  獨立量測交叉確認），不是 Milestone E。
- Milestone E 的 `ps`＋`tb` 原本要花 163 KB，已用字典索引＋變長列＋條件寫入
  壓到 85 KB（在 verifier 的 fixture 上是 +99 KB／+4.8%）。
- **我沒有把 verifier 門檻調鬆**——那等於為了綠燈拆掉警報。

**這條紅燈會往上串**（都是同一個根因，不是四個獨立問題）：

```
experience26 §17 replay 容量  ── 紅（baseline 就紅）
   └→ talent27 §31「Replay 播放不受影響（experience26 全綠）」  ── 紅
        └→ stats28 §20/§21（要求 talent27 44/44、experience26 35/35）── 紅
             └→ runtime29 §30（要求 stats28 全綠）── 必然紅
```

因此 **`check_moba_runtime29` 本輪沒有跑完**：它會巢狀 `stats28`（該檔自己的註解
寫明單跑約 87 分鐘），而鏈上這條紅燈在 baseline 就存在，跑完也不可能是 44/44。
它所巢狀的每一支（`talent27`／`experience26`／`progress25`／`regress`／`regress2`／
`build`）本輪都已**直接單跑**並記錄在上表。這是誠實揭露，不是宣稱通過。

可能的處置（請 Ray 選）：(a) 維持現狀並把它列為已知紅燈；(b) 對 `mn` 做 delta
壓縮或降精度（會動到 D-fix3 剛驗收過的小兵繞塔精度，需重驗）；(c) 改用
IndexedDB 並重新設定容量門檻。

## 6. 未驗證項目（不宣稱通過）

Node 證不了下列任何一項，需要 Ray 以瀏覽器／真機確認：

1. 🔁 換人面板在 320/360/390/430px 的實際觸控與版面；換人後 Loading／3D 名牌／
   隊伍面板／賽後戰報是否四處同時變成新選手。
2. 新秀（未綁定英雄）上場後的英雄顯示與賽後 XP 是否落在新秀身上。
3. 戰中 HeroDetailPanel 與賽後「能力／天賦執行」面板的實際版面與可讀性。
4. Replay 的狀態徽章、復活倒數、`龍×N`／`巴 Ns`、播報列是否與現場一致。
5. Android 真機 FPS、熱降頻、safe area、WebGL driver（D-fix3 的清單仍全部有效）。

## 7. 回退

- 只退 Replay 一致性：`git revert <E3/E4 commit>`
- 連同先發指派與對戰名單一起退：再 `git revert <E1 commit>`
- 比對基準：`git show milestone-e-baseline`（＝`91904c3`）
- 禁止 `git reset --hard`。
