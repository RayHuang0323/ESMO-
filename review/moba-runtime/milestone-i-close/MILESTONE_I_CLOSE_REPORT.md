# Milestone I-close Report — 收尾目標 4／5／6 與全流程驗收

日期：2026-07-31
狀態：**五項全部完成並驗證**（含桌機與 390×844 瀏覽器實測）。未 push、未部署。

rollback tag：`milestone-i-close-baseline` → `bfd4557`（＝ Milestone I 第一輪結束的狀態）

## 0. 這一輪要收的東西

Milestone I 第一輪留下三件事，這輪全部做完：

| 交辦 | 結果 |
|---|---|
| 1 loadout 貫穿 Loading／GameView／Replay／Result | ✅ |
| 2 LineupScreen 顯示英雄來源，不讓玩家誤認固定綁定 | ✅ |
| 3 桌機與 390×844 正式流程驗收 | ✅ 兩個尺寸各 22 項全綠 |
| 4 五路／選手／英雄／召喚師技能全流程一致 | ✅ 逐席比對，非目視 |
| 5 verifier、證據、Sprint 紀錄、風險文件 | ✅ |

## 1. loadout 貫穿全流程（目標 4／6）

### 做法：不是「傳到四個地方」，是「只有一份」

第一輪的 loadout 只活在 Ban/Pick 面板裡。若照字面把它「傳給」Loading、GameView、
Replay、Result，就會有**四個消費點各自解讀**的風險——只要有一處拿錯席位，
畫面就分岔，而且分岔了沒人會發現。

所以改成把技能**長在對戰名單上**：`buildBattleRoster` 決定席位英雄的那一行，
下一行就決定該席位的召喚師技能（`mobaRosterAdapter.js`）。四個畫面本來就讀
同一份 roster ⇒ **結構上不可能不一致**，不是靠約定。`draftRoster` 走同一個
`spellsFor`，所以「單獨掛載 GameView」那條舊路徑也一致。

### 順手修掉兩個真的會出錯的對位

兩處還在用**選取順序**對位，而 Milestone I 起 Ban/Pick 會另算席位分配
—— 兩者不同序時（例如選到兩隻中路，分配把其中一隻擺去上路）畫面就會顯示錯的人：

| 位置 | 舊行為 | 現在 |
|---|---|---|
| `LoadingScreen` | `draft.picks[side][idx]` 順序對位 | 走 `draftRoster`，與 GameView 同一個 adapter |
| `BattleHeroStrip` | 先看 `picks[side][i]`，再退回名單 | **名單優先**，無名單才退回 picks |

### 各站顯示

| 畫面 | 顯示 | 錨點 |
|---|---|---|
| Ban/Pick | 五路 · 選手 · 英雄 · 適性% · 技能圖示 | `draft-plan-row` |
| Loading | 十人卡片各帶兩個技能 | `loading-spells` |
| 對戰中面板 | 兩格技能（引擎技能顯示即時 CD） | `sheet-spells` |
| 記分板（TAB＋賽後 Result 共用） | 英雄名後接技能圖示 | `board-spells` |
| Replay | 出戰配置面板 ＋ 3D 名牌 | `replay-lineup-row` |

### 引擎只實作兩個技能，面板不假裝

`LogicEngine` 只模擬閃現與懲戒，非打野的第二格是 `reserved`。這一輪**沒有動引擎**
（verifier §41/§42 直接跑引擎驗證這件事），而是讓面板分辨兩種技能：
引擎技能顯示即時冷卻，配置技能顯示「配置」並淡化。給假 CD 比不給更糟。
副作用是非打野的第二格不再是刺眼的「未配置」。

因為第二格現在可能不是冷卻，`BattleHeroSheet` 的區塊標題從
「召喚師技能（即時冷卻）」改為「召喚師技能 · <位置>」——原標題已經不實。

### Replay 帶得走這份配置

舊 replay 的 `playersMeta` 只有 `{id, side, role}`：重播完全不知道誰用哪隻英雄。
現在擷取時把當場名單寫進 `playersMeta` 的 **optional 欄**
（`playerName` / `heroId` / `heroName` / `lane` / `spells`）。

- **版本仍是 `MobaReplay.v1`**，沒有升版（verifier §16）。
- 舊 replay 沒有這些欄 ⇒ `replayRosterOf` 回 null ⇒ 照舊播放，不白畫面（§21/§22）。
- 順帶把名單接給 `MobaRuntimeView3D`，重播的 3D 名牌終於和現場顯示同一批人。
- 容量：名單十筆，`check_moba_experience26 §17` 的數字**一位數都沒變**
  （改動前後同為 836 frames ≈ 2492KB，見 §5）。

## 2. 賽前配置的英雄來源（目標 5）

Ray 的原話是「不可讓玩家誤認為固定綁定」。根因是 LineupScreen 直接印一隻英雄、
沒有任何說明，而那隻英雄其實只是**席位預設值**。

新增 `src/battle/moba/mobaHeroSource.js`，五種來源全部對應到真的存在的資料：

| 徽章 | 判定依據 |
|---|---|
| 尚未選角 | 該席位沒有任何英雄可顯示 |
| 已鎖定 | 選手檔案綁定英雄，且**與席位預設不同** |
| 熟練最高 | 熟練等級（並列時比場次）為全部有紀錄英雄之最 |
| 最近使用 | 出現在最後一場出賽（`lastMatchSeq` 最大） |
| 系統推薦 | 以上皆非 ⇒ 就是席位預設，明說它只是預設 |

**「已鎖定」的判定刻意加了「與席位預設不同」這個條件**：初始名單五個人的
`player.heroId` 就等於席位預設，若照字面判成「已鎖定」，等於用一個徽章去
坐實玩家原本的誤解。verifier §26 就是釘住這件事。

畫面下方另加一段說明，明講「這裡的英雄是賽前參考，不是固定綁定」，
逐一解釋五個徽章，並指出正式出戰的英雄與五路分配在 Ban/Pick 才定案。

### 為了「最近使用」動到的唯一資料模型

`heroProgress` 追加 `lastMatchSeq`。用**單調遞增序號**而不是 `Date.now()`：
`applyMatchResult` 是純函數，塞時鐘進去會讓它不再可重現（verifier §31 兩次同輸入
逐鍵比對、§32 驗遞增）。舊存檔沒這個欄位 ⇒ 視為尚無紀錄，不是錯誤（§33）。

## 3. 驗證

| 驗證 | 結果 |
|---|---|
| `check_moba_milestone_i_close`（新增） | **44/44 PASS** |
| `shot_milestone_i` 桌機 1600×1000（新增） | **22/22 PASS** |
| `shot_milestone_i` 手機 390×844（新增） | **22/22 PASS** |
| `check_moba_milestone_i` / `h` / `g` / `f` / `e` | 全部 PASS（G 見下方說明） |
| `regress` | 15/15、平均 23.5 分、擊殺 29.8（**與 H／I 逐值相同**） |
| `regress2` | 節奏門檻 8/8 |
| `check_progress25` | 34/34（修好一條假紅燈後，見 §4） |
| `check_moba_tactic24` | 29/29（同上） |
| `check_talent27` | 43/44（唯一紅＝既有 replay >2MB 連鎖，見 §4-3） |
| `check_moba_experience26` | 34/35（同上，就是那條 §17） |
| `check_moba_stats28` | 見下方「巢狀套件」 |
| production build | 2601 modules、exit 0 |

### 巢狀套件（`check_moba_stats28` / `check_moba_runtime29`）

這兩支會在內部再開子行程跑前面所有 verifier，單跑 10–15 分鐘以上。本輪共嘗試四次
（runtime29 背景 1 次、stats28 前景 1 次＋背景 1 次、等待器 1 次），**全部在完成前
被工作階段的時間上限中止**，與 `moba-verifier-suite-is-slow` 記錄的現象一致。

不是失敗，是被砍：最後一次 `stats28` 留下的部分輸出停在第 13b 條，且該條是綠的——

```
[13b] 藍隊終局 mlv（無/操作/戰術/團隊天賦）：5/8/7/6/7 | 7/6/9/8/5 | 7/12/11/8/6 | 7/6/9/8/5
[13b] ⇒ 終局 power 因等級不同而不同 = 合法；同等級下 power 相同 = 已逐點驗證
```

也就是說它正常跑到一半，沒有任何斷言紅燈，只是沒跑完。證據：`evidence/stats28_partial.txt`。

它們涵蓋的每一支**都已個別實跑並列在上表**：`talent27`／`experience26`／
`progress25`／`tactic24`／`regress`／`regress2`／`build` 全部有結果。
唯一沒有獨立結果的是 `stats28`／`runtime29` 自身的斷言集
（stats28 29 條、runtime29 44 條）——**這一項列為未完成的驗證**，
建議下次在不與 build／瀏覽器驗收搶資源時單獨補跑一次。

引擎逐值未變是「本輪沒碰公平性」的證明：`regress` 的 15 個 seed 平均時長與擊殺數
與 Milestone H 完全相同。verifier §40–§42 另外直接跑引擎，確認決定性與召喚師技能
的引擎行為都沒動。

### 瀏覽器驗收驗的是「同一份資料」，不是「畫面沒炸」

`tools/shot_milestone_i.mjs` 走完整條
Dashboard → Lineup → Ban/Pick → Loading → GameView → Result → Replay，
每一站用 `data-*` 屬性把配置抓下來，最後**逐席比對**：

- Ban/Pick ↔ Replay 的英雄與技能逐席相同
- Loading ↔ Ban/Pick 的技能逐席相同
- 戰鬥中面板 ↔ Ban/Pick 該席位的技能相同
- 五路唯一、五隻英雄不重複、打野帶懲戒且只有打野

證據：`evidence/{desktop,mobile}-0{1..6}-*.png` 十二張截圖 ＋
`evidence/milestone_i_close_browser.json`（每一站抓到的原始資料）。

## 4. 過程中發現的三件事（誠實記錄）

### (1) 手機首跑紅燈，是**腳本**錯不是產品錯

首次執行時 `mobile 20)` 紅燈：面板顯示 `flash,ignite`，但腳本拿 `b1` 的
`flash,teleport` 去比。查證後是手機版十人面板**預設收合、只渲染目前那一路**，
索引 0 根本不是 b1。證據 JSON 顯示 `clickedSeat=b3`，而 b3 的配置正是
`flash,ignite`——**產品是對的**。修法是給 `hero-cell` 加 `data-seat`，
比對「實際點到的席位」，而不是把斷言放寬。

### (2) 兩支既有 verifier 的假紅燈（不是本輪造成）

開工前先在 `bfd4557` 的 worktree 跑過，確認是既有狀態：

| verifier | 狀況 | 處置 |
|---|---|---|
| `check_moba_tactic24` §B | 掃字面 `start({ tactic })`，但 **Milestone H** 起是 `start({ tactic, roster })` ⇒ 從 H 就一直假紅 | 改成 `/start\(\{\s*tactic\b/`，驗「有帶 tactic」不綁參數列其餘內容 ⇒ 29/29 |
| `check_progress25` §16 | 上一條的連鎖（它斷言 tactic24 exit 0） | 隨上一條轉綠 ⇒ 34/34 |
| `check_moba_milestone_g` §7 | 掃完整標題「召喚師技能（即時冷卻）」；本輪標題正當改動 | 改成驗四個區塊都在；即時冷卻由 §8 獨立把關 ⇒ 30/30 |

這是本專案**第五次**踩關鍵字掃描。三處都改成驗行為／驗結構，沒有降低斷言強度。

### (3) 沒有修的既有紅燈

| verifier | 狀況 |
|---|---|
| `check_dash10` | `snapshotToBattleResult: snapshot 尚未終局` 直接拋錯。已在 `bfd4557` worktree 重現 ⇒ **既有紅燈，非本輪造成**。診斷屬另一件事，沒有順手重構 |
| `check_moba_experience26 §17` | replay 單場 ≈2492KB > 2MB。Ray 已裁決列為既有已知問題。改動前後**同為 836 frames ≈ 2492KB**，本輪沒有讓它變差 |

## 5. 人工待驗項目

Node 與 CDP 驗得到的都驗了，剩下這些只有真人／真機才算數：

1. **Android 實機**：CDP 的觸控模擬不等於真手指。Milestone G 的手勢修正至今仍未在
   Ray 的實機上驗過，本輪新增的 Loading 技能標籤在小螢幕的實際可讀性同理。
2. **視覺品味**：Loading 卡片多了一行技能標籤、記分板英雄名後多了圖示、
   Lineup 每列多了一個徽章 —— 密度是否過高要 Ray 看過才知道。
   截圖在 `evidence/`，桌機與手機都有。
3. **文案**：五個徽章的用詞（熟練最高／最近使用／系統推薦／尚未選角／已鎖定）
   照 Ray 原話直接用，是否要換說法由 Ray 決定。

## 6. 回退

- 只退瀏覽器驗收與文件：revert 最後一個 commit
- 連同英雄來源徽章：再 revert 前一個
- 連同 loadout 貫穿：再 revert 前一個
- 比對基準：`git show milestone-i-close-baseline`（＝`bfd4557`）
