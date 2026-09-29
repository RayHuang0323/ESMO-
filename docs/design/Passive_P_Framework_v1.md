# Passive P Framework v1（2026-09-29）

> 狀態：**framework + 4 名 pilot 已實作，規則旗標 `heroPassivesV1` 預設關閉**。
> 開啟＝模擬語意變更 ⇒ 必須開 `moba-sim.v16` 並重新登記語意指紋（Owner 決定）。

## 1. 為什麼 100 個 P 以前只有資料與圖示（真正原因）

| 層 | 現況（v15） | 缺口 |
|---|---|---|
| 資料 | `heroDatabase.js` 的 `skills.P` 只有 `{ name, desc, tier }`，desc 是**截斷的散文**（27–38 字） | 沒有任何機器可讀欄位（觸發、數值、冷卻） |
| 編譯 | `heroSkillGameplay.js` `toEngineHeroSkills` 只編譯 `['Q','W','E','R']`；規則白名單只有主動技 mechanic | 沒有 trigger／condition／stack 的語彙 |
| 引擎 | `_heroSkillStep` 只做「冷卻好了就施放」；普攻是連續 DPS，不是離散命中事件 | 沒有「受傷／命中／擊殺／脫戰」可訂閱的觸發點 |
| Snapshot／Replay | `heroSkills` 只有 QWER；Replay `playersMeta` 只存 QWER 規則 | 被動狀態沒有輸出位置 |
| 版本 | `heroDatabase.js` **不在**語意指紋清單 | 若把 P 規則直接寫進 heroDatabase，會「靜默改變結果卻不升版號」 |

所以這不是「少填資料」，是**架構缺口**：P 從來沒有機器契約，引擎也沒有觸發點。

## 2. v1 接法（已實作）

- **規則**：`src/battle/moba/skills/heroPassiveGameplay.js`（已加入語意指紋清單）。
  `{ version, heroId, trigger:{kind,…}, icd, effects:[…], levelScale }`
- **觸發**（不在引擎各處埋 hook，而是 `_heroPassiveStep` 每 tick 輪詢既有狀態）：
  `burst-damage`（本 tick 淨掉血 ≥ 比例）、`low-hp`、`periodic`、`out-of-combat`、`takedown`（K+A 增加）。
- **效果**：只走既有路徑——`shield`／`team-shield`（`p.shield`/`shieldUntil`）、
  `guard`（`_applyHeroSkillGuard`）＋可選回血、`haste`（`heroSkillHaste*`）。
  不新增傷害公式、不消耗 rng、固定玩家順序 ⇒ 決定性、Replay 可由同 seed 重現。
- **呼叫點**：`tick()` 裡緊接在 `_heroSkillStep()` 之後。
- **Snapshot**：開啟時該英雄多一個 `heroPassive:{ trigger, icd, ready, cd, procs, lastProcAt }`；
  護盾／減傷／加速本來就在 `statusEffects`，HUD 與 3D 直接顯示（同一正式事件，不做假效果）。
- **UI**：沒有 `heroPassive` 的英雄仍顯示 `PASSIVE_STATUS`「未實裝 · 本場不生效」；有的才顯示「已實裝（試行）· 觸發 N 次」。
- **AI**：v1 的 pilot 全是反應式被動，不需要施放決策。

### Pilot（散文能乾淨對到既有效果）

| 英雄 | P 原文（截斷） | 對應 |
|---|---|---|
| tiemu 鐵幕鎮守 | 受到超過最大血量 8% 的單次傷害，立刻生成小型護盾（8 秒 CD） | burst-damage 0.08 → shield 10%／3s，icd 8 |
| tixue 鐵血騎士 | 血量低於 30% 時雙抗 +40%，每 2 秒回復 2% | low-hp 0.3 → guard 0.22／2.2s ＋ 回 2%，icd 2（雙抗以減傷近似） |
| luminary 星輝 | 周圍友方每 8 秒獲得小型護盾（依等級增強） | periodic 8s → team-shield 5%／3s／半徑 10，levelScale 0.04 |
| sting 毒刺 | 脫戰 4 秒後移速 +25%，下次受擊前自動生成護盾 | out-of-combat 4s（每次脫戰一次）→ haste 1.25／6s ＋ shield 6%／6s |

## 3. 擴到 100/100 的方式

關鍵字分類（100 個 P 原文）：

| 需要的能力 | 約略數量 | 做法 |
|---|---|---|
| v1 語彙即可（輪詢觸發 × 護盾／減傷／回血／加速） | ~23 | 直接在規則表新增條目，一名英雄一行 |
| 普攻命中（onHit / 第 N 次攻擊） | ~13 | 引擎普攻是連續 DPS ⇒ 需要在 `_combatStep` 加「攻擊節拍」計數器（每 atkCd 一拍），才有離散命中 |
| 技能命中（onSkillHit） | ~16 | 在 `_heroSkillStep` 的 hits 迴圈（LE ~1499）推事件到 `this._passiveEvents`，tick 內依序消化 |
| 永久疊層（stack） | ~28 | 需要一個**不計時**的戰力倍率欄位（現有 `heroSkillPowerFactor` 是限時、上限 1.6），並定上限避免雪球 |
| 增傷（dmgUp／標記） | ~14 | 多數可映射到既有 `mark` 路徑（`heroSkillMarkAmp`） |
| 視野／草叢／地形 | ~9 | 引擎沒有視野系統 ⇒ **暫不做**，UI 維持「未實裝」 |

建議順序：v1 語彙批次（+19）→ onSkillHit 事件（+16）→ mark 增傷（+14）→ 攻擊節拍 onHit（+13）→ 永久疊層（+28，需平衡）→ 視野（等視野系統）。
每一批都要：規則進指紋檔、`heroPassivesV1` 保持關閉跑 A/B（`tools` 下的正式設定 harness）、確認 pacing，再由 Owner 決定開版號。

## 4. 開啟前的必要步驟

1. `heroPassivesV1: true`（v3 規則集）＋ `moba-sim.v16`（`KNOWN_SIMULATION_VERSIONS`、語意指紋）。
2. `useLocalServer.js` 已在 hero skills 開啟時呼叫 `configureHeroPassives`（旗標關閉時引擎直接拒絕，零影響）。
3. Replay：`playersMeta` 補存 passive 規則版本（目前以 heroId ＋ `HERO_PASSIVE_CONTRACT` 可重建）。
4. Challenge runner 目前不呼叫 `configureHeroSkills`，被動也不會進 Challenge（與 QWER 一致）。
