# Milestone M 基礎層 — Hero Combat Archetypes（opt-in，未接線）

日期：2026-08-01　起點 commit：`a70cf7c`（L Hotfix 2）

**本輪是 Milestone M 的安全切片**：只交付資料契約與第五個 opt-in 行為層，
**不接入正式對戰流程、不改變任何現行戰鬥結果**。

---

## §1 Audit 結論

| 項目 | 實測 |
|---|---|
| 交戰距離 | `LogicEngine.js` `let bd = 8`，**所有英雄一視同仁**（近戰、遠程完全相同） |
| 傷害模型 | **連續 DPS**：`p.power * dt * R.dmgK * lateFactor`，每 tick 施加。`atkCd`（0.5s）與 `pushFx` **只是呈現**，不是一次真正的攻擊 |
| `heroDatabase.stats.range` | 存在且乾淨分群：坦克 150 / 刺客 150 / 戰士 175 ｜ 輔助 500 / 法師 525 / 射手 550。**引擎一次都沒讀** |
| 追擊 | `chaseGiveUpDist: 9`、`contactKeep`，不分職業 |
| 移動 | 單一決策點 → `_navMove(p, tgt, spd)`（碰撞、A*、決定性都已具備） |
| basic / power | `const power = this.rng() < 0.2` ⇒ 是**引擎事件分類**，不是 Q/W/E/R |
| 距離函式 | 小兵／英雄／塔／野怪共用 `dist()`，但各有自己的距離常數 |
| 可重用資料 | `stats.range` 可直接推導 melee/ranged；`heroCombatPresentation.combatClassOf` 可直接重用，不必再建一份 |

**關鍵結論**：真正缺的不是「演出差異」（Milestone L 已做），而是**引擎層根本沒有距離概念的差異**。

---

## §2 交付內容

### 2.1 `src/data/heroCombatArchetypes.js` — Contract v1

100 位英雄全部解析得出：`heroId / combatClass / attackType / baseAttackRange /
preferredDistance / chaseDistance / retreatDistance / basicAttackStyle /
projectileProfile / movementProfile / targetingProfile / formationLine / formationSpread`。

**推導規則（全部可回溯）**

- `attackType` ← `stats.range >= 300` ⇒ ranged。**不是看定位**——輔助路的坦克（range 150）就該是近戰。
- `combatClass` ← 重用 `heroCombatPresentation.combatClassOf`（**沒有第二套映射**）。
- `baseAttackRange` ← 顯示 range 的唯一換算式：

  ```
  engineRange = 4.0 + (displayRange − 150) × 0.011      夾在 [4.0, 8.6]
  ```

  ⇒ 坦克/刺客 **4.00**、戰士 **4.28**、輔助 **7.85**、法師 **8.13**、射手 **8.40**。

**為什麼是這條線**

- 遠程 ≈ 8，貼近引擎原本對所有人硬編碼的 8 ⇒ 接線後遠程的平衡幾乎不動
- 近戰 ≈ 4.0–4.3 ⇒ **必須真的走進去才打得到**，這才是行為改變的來源
- 近戰最小 4.00 > 野怪攻擊距離 3.2 ⇒ 近戰打得到野怪
- 兩群不重疊（近戰最大 4.28 < 遠程最小 7.85）

其餘欄位是 `baseAttackRange` × 職業倍率 ⇒ **射程一改，站位自動跟著走**，不會有兩份數字要同步。

### 2.2 LogicEngine 第五個 opt-in 行為層

沿用 `configureMatch` / `configurePlayers` / `configureHeroes` / `configureSpells`
建立的慣例：

- `configureArchetypes({ blue, red, meta })`
- `_engageRange(p)` — 取代硬編碼的 `8`；**未啟用時回傳 8**
- `_archPosition(p, tgt, alive)` — front / back / flank / support 四種線位 ＋
  決定性 slot 側向偏移；**未啟用時原樣回傳 `tgt`**

**沒有新的尋路、沒有群體 AI**：只是把既有的 `tgt` 沿「我 → 敵人」推到
`preferredDistance`，真正的走路仍由 `_navMove` 處理。
引擎**不 import** 任何英雄資料（形狀由 `toEngineArchetypes(roster)` 準備）。

---

## §3 逐位元對照（本輪最重要的保證）

方法：把 `src/LogicEngine.js` 用 `git stash` 還原成 `a70cf7c`，跑同一份摘要腳本再裝回來。
摘要涵蓋 **15 seeds × 2400 ticks**：時間、勝負、每位英雄 k/d/a/hp/gold/座標（1e-6）、
全部塔 HP、fx 數。

```
含本輪 LogicEngine 改動 : 04154004839bcc33964d3e733ff42abc2d7a41eef7624508b39d6772d1065d7a
main 基準（a70cf7c）    : 04154004839bcc33964d3e733ff42abc2d7a41eef7624508b39d6772d1065d7a
```

**SHA-256 完全相同 ⇒ 未呼叫 `configureArchetypes` 時逐位元一致。**

---

## §4 回歸結果（＝ `a70cf7c` 的真實基準）

| 腳本 | 結果 |
|---|---|
| `check_combat_archetypes_m`（新增） | ✅ **28/28** |
| `check_combat_threat_l2` | ✅ 19/19 |
| `check_hero_presentation_l` | ✅ 80/80 |
| `check_hero_matchups_k` | ✅ 47/47 |
| `check_moba_milestone_j_close` | ✅ 35/35 |
| `regress` | **14/15**、平均 24.2 分、**平均擊殺 32.3**、撤退鎖死 1 |
| `regress2` | **7/8** — ❌「無極端過長」最長 **33.3 分** > 門檻 32 |
| `npm run build` | ✅ exit 0 |

---

## §5 ⚠ Hotfix 2 報告數字的更正（附實測證據）

Hotfix 2 的報告與文件記載 `regress` **15/15 / 31.9**、`regress2` **8/8**。
**那不是該 commit 的實際結果。**

根因：我在套用 v5 數值後跑了 regress / regress2，**之後**才加上
「Boss 只挑還打得動的目標」那項修正，而**沒有重跑**這兩支，
就把中途狀態的數字寫進報告。**不是轉錄錯誤，是用過期的量測結果回報。**

實測對照（本輪把該修正暫時還原再裝回去）：

| 狀態 | regress | regress2 |
|---|---|---|
| 還原 Boss 目標修正（＝我當時量到的狀態） | 15/15、31.9 擊殺 | 8/8 |
| **`a70cf7c` 實際 commit 的狀態** | **14/15、32.3 擊殺** | **7/8（最長 33.3 分）** |

⇒ **main 目前 `regress2` 有一條紅燈**，是 Hotfix 2 引入、當時沒被發現的回歸。
那個 Boss 修正**本身是對的**（原本 Boss 會整段站著不動，521/761 tick），
但它讓少數場次拖長。建議**併進 M1 一起校正**，不要為了讓 regress2 變綠而撤銷它。

更正已補在：
- `review/moba-runtime/milestone-l-hotfix2/MILESTONE_L_HOTFIX2_REPORT.md`（檔頭）
- `docs/handoff/05_Sprint紀錄.md`（Hotfix 2 的「驗證」段之後）
- `docs/04_更新日誌.md`（Hotfix 2 的「驗證」段之後）
- `docs/handoff/08_目前待辦與風險.md`（列為待辦 ＋ 流程教訓）

**原文一律保留不改，只補更正說明。**

---

## §6 未做（刻意）與後續切分

本輪**沒有**：接 Adapter 進 `useLocalServer`、Presentation 的 melee/ranged 接線、
projectile lifecycle、塔/Boss 相容校正、多 seed 平衡校正、瀏覽器驗收、部署。

| | 內容 | 為什麼分開 |
|---|---|---|
| **M1** | 契約 → Adapter → 交戰距離上線 → 站位上線 → 多 seed 校正（含修 §5 的 regress2 紅燈） | 會改變所有 seed，必須獨立量前後 |
| **M2** | projectile lifecycle（命中才結算） | 引擎是**連續 DPS**，改成命中結算＝改寫傷害施加模型，會動每個 seed 的時序並與 `Σk == Σd` 交互作用 |
| **M3** | assassin flank 尋路與完整隊形 | 需要真正的路徑規劃 |

## §7 未驗

- 本輪**沒有**瀏覽器驗收（沒有 UI 改動，行為逐位元不變）。
- 契約的**遊戲性合理性**（4.0 / 8.4 這組距離打起來對不對）要等 M1 接線後多 seed 實測才知道。
- 真機未測。
