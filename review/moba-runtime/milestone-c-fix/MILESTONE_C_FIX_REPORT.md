# Milestone C-fix — MOBA Runtime 人工驗收修正報告

日期：2026-07-29
狀態：本機實作、直接 verifier、回歸、production build 與桌機／手機 viewport 檢查完成；待人工動態與 Android 真機驗收。
限制：未 push、未部署、未開始下一個 Milestone。

## 1. 版本與範圍

- 接手基準／rollback baseline：
  `073b42c10a6aa81ae27fbb72b094db4383f29978`
  (`Milestone C: finalize runtime presentation and handoff`)。
- 本報告與實作使用同一個本機 commit；commit hash 由完成後的 `git log -1` 與最終回報記錄。
- 只處理人工驗收列出的塔、野怪、英雄戰鬥可讀性、名牌、XP／單位戰鬥與塔前站位。
- 未改 `BattleResult.v2`、`CsMatchResult.v1`、progress/reward、profile persistence、
  地圖碰撞真實來源、Replay contract、H.2 導航架構或 v1／v2 歷史規則。
- 工作區原有 bug 影片、terrain／map preview、backup、blend／glb、logs 等舊產物均不納入。

## 2. 根因與修正

### 2.1 塔攻擊

- 根因：塔 FX 雖已有彈體形狀，但 travel 使用事件建立時的靜態 `targetWorld`；
  目標移動後不會追蹤，視覺仍容易像從塔擴散的線／圈。
- renderer 現在每幀以 `sourceId`／`targetId` 從英雄、小兵、建築及營地成員解析目前位置。
- 塔呈現固定為「塔冠蓄能 → 單一追蹤球形彈體＋短尾跡 → 緊湊命中爆點」；
  不產生全長音波光束或大面積同心圓。
- 延長至可讀的 cast/travel/impact 生命期；命中與 HP 下降沿用同一個權威攻擊事件。
- Milestone C 的小兵優先、英雄塔下反打 threat、固定鎖定與離散射擊節奏保留。

### 2.2 野怪正式模型與個體化戰鬥

- 根因：Milestone C 動態野怪 renderer 以過度簡化幾何取代 G.3 正式
  `mapMonsterShapes` recipe；而 camp 只有群體 HP，導致整群同步扣血／死亡。
- runtime renderer 直接重用正式 crystal sentinel、brambleback、wolves、krug recipe，
  不另做陽春替代資產；保留小幅巡遊、索敵、攻擊、受擊與回營動作。
- 六個正式 camp 各建立三名成員；每名成員有獨立 id、HP/maxHP、alive、targetId、
  attack cooldown、hit/attack timestamp 與 home offset。
- 英雄攻擊、Smite、野怪仇恨、受擊、死亡與回營都逐成員結算；只有全體成員死亡時
  才視為營地清除並發放營地收益。
- snapshot／adapter 新增成員資料供 live runtime 呈現；既有 Replay contract 不擴版，
  舊 Replay 仍使用原本 aggregate objective fallback，且不重跑引擎。

### 2.3 英雄普攻／技能與職業辨識

- 十名現役英雄明確對應 tank、fighter、assassin、mage、marksman、support；
  未知 stable hero id 仍由既有資料 deterministic 推導。
- 六職業加入不同武器與施法輪廓：盾甲、拳套、雙刃、法杖／法球、發射器、
  光環／輔助焦點；cast 與 release 會驅動對應動作。
- cast、travel、impact、hit reaction 尺寸與亮度加強；近戰 slash、遠程短尾彈、
  rail 射線、法術核心／擴散與輔助光環可直接區分。
- 所有傷害與命中仍由 live／Replay 共用 FX event 驅動，renderer 不產生假傷害。

### 2.4 英雄名牌

- 名牌縮為 9px、`L{level}`、較小 padding／gap／隊標與 `distanceFactor=132`。
- 保留藍／紅隊伍色邊、腳下環、腰帶與血條旁隊標；不再以大面積文字遮住交戰。

### 2.5 XP 與逐單位戰鬥

- 原 v3 單吃首波為 `4 × 128 = 512 XP`，但 Lv1→Lv3 只需 450 XP，因此一波可連升兩級。
- v3 改為小兵 96、普通 camp 96、buff camp 144 XP；單吃首波 384 XP，只到 Lv2。
- 同一 engine tick 最多升一級，超額 XP 留在 `mxpBank`，後續仍會誠實兌現，不吞收益。
- 6-seed C-fix 取樣：5 分鐘均等級 3.20、10 分鐘 5.63；最大單 tick 升級為 1。
- 小兵對小兵、英雄對英雄與英雄對野怪均補 verifier 微場景，確認 HP／死亡逐單位運作。
- `regress2` 的舊門檻以較快的 v2 曲線為基準，會把本輪已確認過快的 XP 當成成功；
  因規格確實改變，調為 5 分鐘逐場平均等級 ≥2.5、20-seed 平均 `[3,7]`。
  新門檻仍會攔下 v1 的全場 Lv1 與異常快速封頂，沒有刪除檢查。

### 2.6 小兵塔前站位

- 根因：舊 stop band 以不同 lane 曲線上的固定 progress 差判斷，實際世界距離不一致；
  小兵會過度靠塔後被碰撞／投影反覆修正。
- v3 以實際 tower／nexus 世界距離二分搜尋停位，`minionTowerStopRange=4.6`；
  保留原可走區投影與攻塔距離，不改 H.2 navigation/collision 真實來源。
- 微場景連續五次取樣穩定，實測停位 4.719 模擬單位，沒有穿塔或來回跳動。

## 3. Verifier 調整理由

- `check_moba_milestone_c.mjs`：營地 setup 改為初始化個體成員，攻擊來源改驗證
  `camp:member`；原本的 idle→aggro→attack→leash 安全網保留。
- `check_moba_milestone_b2.mjs`：舊斷言硬編碼
  `addLine(fx.world, fx.targetWorld)`，與合法的每幀 `trackedTarget` 追蹤不相容；
  改驗 `currentWorld`、`trackedTarget` 與新短尾軌跡來源，沒有放寬成只看印字。
- `regress2.mjs`：依 §2.5 更新確實過時的 XP 成功區間；結束率、時長、塔數等其餘門檻不變。
- 新增 `check_moba_milestone_c_fix.mjs`，直接驗證 XP、個體 camp、逐單位戰鬥、
  塔前停位、正式野怪 recipe、六職業語彙、名牌與追蹤塔彈。

## 4. 驗證結果

所有列出的指令均檢查實際 exit code 與輸出形狀：

- `node tools/check_moba_milestone_c_fix.mjs`：PASS；首波 Lv2、最大單 tick 升級 1、
  camp 三成員個體 HP／仇恨／死亡、塔前 4.719、六職業、9px 名牌、追蹤塔彈。
- `node tools/check_moba_milestone_c.mjs`：PASS；塔 `180→120→60→0` 四段、
  四發同源彈體、塔下 threat、camp 狀態機與塔前站位。
- B-fix、B.1、B.2、B.3、B.4、H.4：全部 exit 0。
- H.3 minion／Replay：22/22；H.2 navigation/collision：14/0。
- pacing：25/25；presentation：12/12；controls：18/18；camera/replay：16/16。
  這四支以 `SKIP_NESTED=1` 執行本體，避免重複啟動其巢狀長鏈；本體均檢查 exit 與形狀。
- `node tools/regress.mjs`：exit 0，15/15 結束，平均 24.2 分。
- `node tools/regress2.mjs`：exit 0，20/20 結束、節奏門檻 8/8；
  5 分鐘等級平均 3.18、最低 2.6。
- `npm run check:mobamap`：3553 通過、0 失敗。
- `npm run build`：exit 0，2595 modules，production build 完成；
  僅既有單 chunk >500k 警告。
- `git diff --check`：通過；只有既有 LF→CRLF 工作樹提示。

未重跑完整 `runtime29` 長鏈：本輪依需求只跑直接相關 verifier、H.2/H.3、
四個現役 runtime 安全網本體、兩支 regress、mobamap 與 build；Milestone C 已記錄
完整 runtime29 唯一既有紅燈為未碰觸的 v2 正／反序抽樣。

## 5. Viewport 與人工驗收

本機正式 `GameView → runtime-v2`：

- 桌機 1440×900：canvas 1440×900、無水平溢出。
- 手機 320／360／390／430×844：canvas 寬度逐一等於 viewport，
  `scrollWidth == clientWidth`，無水平溢出。
- 瀏覽器 console error：0。

上述是桌面 Chrome 的 viewport 模擬，不是 Android 真機。仍需人工：

1. 1× 動態觀看塔的發射、追蹤飛行、命中與連續鎖定節奏。
2. 六營地近景確認正式模型、逐隻受擊／死亡／仇恨／回營及 Smite 單體性。
3. 十名英雄在混戰中逐一確認六職業 cast/travel/impact/hit reaction 與 9px 名牌可讀性。
4. 長局確認 5／10 分鐘等級體感、血量下降、死亡時序與 camp／小兵／英雄收益。
5. 三路塔前觀察小兵停位、攻塔距離、無穿塔／抖動／卡位。
6. live 與既有 Replay 的動態一致性。
7. Android 真機 320–430px 的 FPS、熱降頻、觸控、safe area、WebGL driver 與 H.2 閃爍。

## 6. 回退方式

- 基準：`073b42c10a6aa81ae27fbb72b094db4383f29978`。
- 若需回退本輪，使用 `git revert <Milestone C-fix commit>`；不可使用
  `git reset --hard`、`git clean -f` 或 force push。
- 本輪沒有 push／deploy，因此遠端與 GitHub Pages 不受影響。
