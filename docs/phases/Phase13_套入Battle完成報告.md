# Phase 13 — 戰力公式正式套入 Battle 完成報告

> 只修改 `src/battle/moba/mobaRosterAdapter.js`（buildEngineSlots ＋同檔新增公式模組）。
> **未修改**：Battle 演算法、tick、AI、BattleResult、Router、App.jsx、LogicEngine、platformToMobaConfig。
> **FPS 完全不受影響**（走 EsportsFPS3D.jsx，與本檔零接觸）。未新增任何 Hero Schema。

---

## 改動內容（單一檔案）

`mobaRosterAdapter.js` 內：
1. **新增公式模組**（模組級，battle 層自足，不 import 平台 UI 檔以避免循環相依）：
   - `calcPlayerMobaPower(player)` — 鏡像平台 `calcPower(p,"moba")`，測試已錨定輸出完全一致（85/79/91/81/83）。
   - `calcMobaPower(role, arch, diff, player)` / `calcMobaTough(role, arch, player)` — Phase 11 公式，Phase 12 驗證。
2. **buildEngineSlots 兩處改動**：
   - 選手改「中文 role → LogicEngine role」對位（原為陣列索引），確保「該路選手 × 該路英雄」正確配對；對不上者順延（相容舊索引行為）。
   - `power/tough` 由固定 `null` 改為：**有英雄 → 公式；無英雄 → null（沿用引擎預設）**。

資料流真正貫通：`CHAMPIONS_100(arch/diff) ＋ Player(16維stats) → 公式 → BattleConfig slots → applyRoster → LogicEngine.players → Battle`。

---

## 驗證結果

### 1. Battle 行為是否正常 → ✅ 正常（但揭露既有技術債，非本 Phase 造成）

- 注入真實數值後 tick 正常推進、不崩潰；我方數值正確覆蓋（中路 gambler：power 36→45.53、maxHp 540→551）。
- ⚠ **既有技術債浮現**：跑滿 6000 ticks（600 秒）winner=null。經對照，**未注入的 Phase 10 也是 over=0/5、5 場總擊殺僅 4**——這是 LogicEngine 本身「近零擊殺、難分勝負」的既有問題（技術債清單已記載），套入公式**未改善也未惡化**它。接線正確，是引擎戰鬥密度本身待調。

### 2. 是否仍向下相容 → ✅ 是

無 draft（picks 空）→ 5 slot 的 power/tough 全 `null` → applyRoster 不覆蓋 → 完全沿用 LogicEngine 預設。

### 3. 全錨值時是否＝ Phase 10 → ✅ 兩路徑皆證實

| 錨定路徑 | 方法 | 結果 |
|----------|------|------|
| **無英雄** | 4 seeds 逐幀 snapshot 深比對 | 與未注入**完全相同**（＝Phase 10） |
| **純公式錨點** | 中性英雄(ARCH=1)＋cp70選手＋diff2 | power 數學收斂到 `ROLE_POWER`（mid=36） |

> 註：tough 側因 Phase 11 的 `ARCH_T[戰士]=1.06`，沒有任一真實 arch 讓 tough 恰＝預設；tough 的偏移**純來自 arch 定位係數（設計預期），非接線誤差**。嚴格「錨值＝Phase 10」由「無英雄→null→不覆蓋」保證。

### 注入後實際數值（seed 42）

| 路 | 英雄 | power（預設→注入） | maxHp（預設→注入） |
|----|------|--------------------|--------------------|
| top | 鋼鐵衛士(坦克d1) | 30 → 29.09 | 960 → **1133** |
| jungle | 毒刺(刺客d3) | 34 → 40.44 | 690 → 655 |
| mid | 賭徒(法師d3) | 36 → 45.53 | 540 → 551 |
| adc | 大師(射手d2) | 42 → 48.92 | 480 → 464 |
| sup | 真言(輔助d2) | 18 → 18.10 | 750 → 824 |

坦克把實力轉進血量（+18% HP、power 微降），射手/法師偏攻——arch 定位如設計生效。

---

## 4. 哪些地方需要下一步再平衡

| 優先 | 項目 | 現況 | 建議 |
|------|------|------|------|
| **P0** | **紅方對稱注入** | 只有 blue 走公式，red 仍引擎預設；我方有效戰力 **+14.3%**（190.1 vs 166.3） | AI 對手也走同公式（用 AI_TEAMS 的 power 反推等效選手/英雄），消除「憑空優勢」。Phase 12 已預告此為套入後首務 |
| **P0** | **LogicEngine 近零擊殺**（既有技術債） | 6000 ticks winner=null，5 場僅 4 擊殺 | 屬 Battle 層平衡（傷害/atkCd/交戰邏輯），需 `/balance` 專項；**不在本公式範圍**，公式已可正確供數值 |
| P2 | tough 錨定 | `ARCH_T[戰士]=1.06`，無 arch 使 tough＝預設 | 若要「戰士＝tough 中性錨」，可把 ARCH_T 整體除以 1.06 正規化（純顯示偏好，不影響相對平衡）；非必要 |
| P3 | 紅方英雄身份 | red picks 目前多為 fallback | 待 DraftModule 產出紅方 pick 後，紅方注入自然完整 |

**關鍵判斷**：本 Phase 的接線與公式已完全正確且可回歸（錨值＝Phase 10 逐幀一致）。真正阻擋「看到有意義勝負」的是 **LogicEngine 既有的低擊殺密度**與**紅方未對稱**——兩者都是獨立的後續任務，與本公式無關。

---

**CHAMPIONS_100 → Player → BattleConfig → applyRoster → LogicEngine → Battle 已真正生效。完成即停。**
