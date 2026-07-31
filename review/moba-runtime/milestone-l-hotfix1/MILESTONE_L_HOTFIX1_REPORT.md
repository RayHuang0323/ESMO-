# Milestone L Hotfix 1 — 塔攻擊 Audit ／ 演出降噪 ／ 三段式戰報 ／ 職業語彙

日期：2026-08-01　起點 commit：`a834851`（Milestone L）
rollback tag：`milestone-l-hotfix1-baseline` → `a834851`

**結論先講：本輪一行引擎、一個平衡常數都沒改，`regress` 15/15 逐值與 L／K／J-close 相同。**

---

## §1 防禦塔攻擊 Audit

工具：`tools/audit_tower_attack_l1.mjs`（唯讀診斷，不改任何狀態）。
樣本：seed 42 與 7，各 1800 tick ⇒ **81,214 個「塔 × tick」**。

### 先講一個測量陷阱（差點得出假結論）

第一版拿 `snapshot.towers` 量，得到「**100% 有 FX 但 0% 有傷害**」——看起來像重大 bug。
實際原因是 **`snapshot.towers` 只序列化 `side / lane / tier / pos / hp`**，
沒有 `targetId` / `targetKind` / `atkCd` / `t`（lane progress）。
`tw.targetId` 恆為 `undefined` ⇒ 傷害偵測整段沒有執行。
改讀**引擎內部狀態**（`e.towers` / `e.lanes` / `e.players`）之後數字才是真的。

> ⚠ 這件事本身也值得記下來：**`snapshot` 不是引擎狀態的全集**。
> 任何要診斷引擎行為的工具都該直接看引擎，不要拿呈現用的快照當證據。

### 三種狀態的實測分佈

| 狀態 | 次數 | 佔比 |
|---|---|---|
| A 射程內沒有敵人（正常，不該打） | 80,550 | 99.2% |
| 射程內有英雄 | 664 | 0.8% |
| 塔位有敵方小兵（引擎的 lane-progress 判準） | 32 | 0.04% |
| **射程內有敵方小兵（世界距離判準）** | **0** | **0.0%** |
| 有推 `tower:basic` FX | 700 | 0.9% |
| 有實際扣血 | 677 | 0.8% |
| **B 有敵人卻既不扣血也不放 FX** | 231 | **0.3%** |
| **C 有傷害但沒有 FX** | **0** | **0.0%** |
| 有 FX 但沒扣血 | 23 | 0.03% |

依塔種類：

| lane | ticks | 英雄在射程 | 兵在射程 | 有目標 | 有 FX | 有傷害 | 有敵人沒動作 |
|---|---|---|---|---|---|---|---|
| top | 20,788 | 0.4% | 0.0% | 0.5% | 0.5% | 0.5% | 0.2% |
| mid | 19,153 | 1.8% | 0.0% | 1.9% | 1.9% | 1.9% | 0.8% |
| bot | 19,673 | 1.1% | 0.0% | 1.1% | 1.1% | 1.1% | 0.3% |
| nexus | 7,200 | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| nexus_guard | 14,400 | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |

### 結論（三點）

1. **沒有「有傷害但沒有 FX」——一次都沒有。** 呈現層是乾淨的：
   每一發塔攻擊都有對應的 `tower:basic` fx。**這不是特效漏畫的問題。**
2. **沒有明顯的「有敵人卻完全不動作」**（0.3%）。逐筆看是
   `atkCd` 尚未歸零、或目標剛切換的那一 tick，屬於正常冷卻行為。
   「有 FX 沒扣血」的 23 次同理（塔傷不執行擊殺，目標已在 1 HP 下限）。
3. **真正的發現：`lanes` 塔從來不打小兵。**
   - `LogicEngine.js:2095-2098` 的分支是：塔位有敵方小兵 ⇒ **`continue`**（整個跳過）。
     一般車道塔**沒有任何攻擊小兵的程式碼路徑**——只有 `nexus_guard` 有
     （`LogicEngine.js:2062-2093`，用 `towerMinionDamage`）。
   - 而且小兵在 81,214 個塔-tick 中**一次都沒有**進入 `towerAggroRange`（5.5）的
     世界距離內。lane-progress 判準說「塔位有兵」32 次，世界距離卻是 0——
     因為 Δt 0.05 在這條線上約等於 12.5 世界單位，遠大於射程 5.5。
   - **程式碼與它自己的註解不符**：`LogicEngine.js:2050` 寫著
     「射程內有敵方小兵 ⇒ 塔打兵」，但實作只對 `nexus_guard` 成立。

### 為什麼本輪**不**改它

任務允許「若確認是 bug，做最小修正；若會改戰鬥結果，必須提供修正前後 seed 回歸與理由」。
我的判斷是**不在 Hotfix 裡改**，理由是：

- 讓車道塔開始清兵**不是最小修正，是平衡改動**。兵線會在塔前融化 ⇒
  推線節奏、金錢與經驗分配、塔的存活時間、比賽長度全部改變 ⇒
  `regress2` 的節奏門檻（5 分塔數、5 分等級）幾乎確定要重新校準。
- 那樣的改動必須**獨立一輪**做，並附完整的修正前後多 seed 對照；
  和「演出降噪／戰報版型」混在同一個 Hotfix 裡，出問題就分不清是誰造成的
  （這正是 K0 那一輪學到的教訓）。
- **而且絕不是「放大射程」**——任務明令禁止，我也同意：射程 5.5 對英雄是有效的
  （0.8% 的 tick 打得到），問題不在射程數字，在缺少清兵分支。

⇒ 已登記為下一輪候選（見 §5 與待辦文件）。**本輪 `matchProgression.js` 的
`towerAggroRange / towerAggroDmg / towerAttackInterval / towerMinionDamage`
四個常數逐字未動**（verifier 第 72 條檢查）。

### 可視化（只在 debug 模式）

新增 `src/battle/moba/presentation/TowerRangeDebug.jsx`，
**只在 `?diag=1` / `?shot=` 掛載**，正式對戰玩家看不到：

- **射程圈**：每座存活建築一個細環，半徑 = `towerAggroRange × WORLD_SCALE`
  = 5.5 × 1.7 = **9.35 世界單位**（verifier 第 71 條盯著這個換算，防止偷偷放大）。
- **鎖定線**：來源是引擎真實的 `tower:basic` fx（`sourceId`→`targetId`），
  **不是自己重算誰該被打** ⇒ 看到線就代表引擎真的射了那一發。

實測（三個尺寸）：`__TOWER_DEBUG_STATS.rings > 0`、`rangeWorld = 9.35`。

---

## §2 Callout 降低干擾

三道閘門（全部在 `pickCallouts`，純函式、決定性）：

| 閘門 | 規則 |
|---|---|
| ① 普攻不跳 | `emphasis` 是 normal/passive（＝ `basic` 推導出來的）一律擋掉 |
| ② 分類白名單 | 只留 `control / shield / heal / area / ultimate / dash`；`projectile` 與 `line`（多半是普攻）不跳 |
| ③ 同英雄同分類去重 | **4 秒**窗內只留最新一筆（規格要求 3～5 秒） |

上限從桌機 3／手機 2 收到 **桌機 2／手機 1**。
版位也收窄：手機 `128px / max 40vw`、桌機 `176px / max 26vw`，
固定在右上（`SAFE_TOP` 之下）⇒ 不壓戰場中央、不蓋 HUD。

驗證：資料層第 38／38a／38b／38c 條（含「連發四次只留一筆、隔窗後恢復兩筆」），
瀏覽器六尺寸實測顯示數量 = 2（桌機）／1（手機）。

---

## §3 Timeline 三段式

`hidden / compact / expanded`，點標題列循環切換，**沒有自由拖拉 resize**
（固定檔位 ⇒ live 與 Replay 永遠同一組版面規則）。

| | compact | expanded |
|---|---|---|
| 桌機 | **84px**（規格 72–96） | ≤ 40vh |
| 手機 | **50px**（規格 44–56） | ≤ **30vh** |

- **桌機與手機都預設 compact**。
- 使用者選擇存 `localStorage["esmo.timeline.mode.v1"]`，下一場沿用。
- hidden 時只留一顆「⚡ 戰報」小標籤，叫得回來。

驗證：瀏覽器三個尺寸實測「預設 compact → 點一下 expanded → 再點 hidden →
再點回 compact」，每一步都量高度與 `localStorage`（B7–B13）。

---

## §4 六職業 shape language

**不是只換顏色。** `CLASS_STYLE` 決定的是動態：

| 職業 | speed | width | height | hug（貼地） | 節奏 | spin |
|---|---|---|---|---|---|---|
| 坦克 tank | 0.72 | 1.42 | 0.50 | 1.00 | slow（慢起慢收、尾巴長） | 0.35 |
| 戰士 fighter | 1.00 | 1.14 | 0.85 | 0.72 | snap（瞬間到位、乾脆收） | 1.00 |
| 刺客 assassin | 1.60 | 0.74 | 1.00 | 0.45 | flash（極快閃現、幾無尾巴） | 1.90 |
| 法師 mage | 0.86 | 1.22 | 1.50 | 0.30 | swell（慢漲、停留、緩退） | 0.65 |
| 射手 marksman | 1.38 | 0.70 | 0.92 | 0.55 | snap | 1.15 |
| 輔助 support | 0.80 | 1.18 | 1.12 | 0.85 | swell | 0.50 |

實際效果：同一個引擎事件，刺客的東西**早到、細、高對比、幾乎沒有尾巴、軌跡是折線**；
坦克的**晚到、寬厚、完全貼地、拖很久**；法師的**浮在半空、慢慢漲大**；
射手的**又快又細、貼近地面**。

- 八個模板與 fallback **仍然共用**，沒有替任何一位英雄複製 JSX。
- `combatClass` 的唯一來源是 `heroDatabase` 的 `arch`（`combatClassOf`），
  **沒有新增第二套英雄資料**。
- **沒有任何平衡數值**：verifier 第 65 條檢查 `HeroSkillEffects` 全檔不含
  damage/dmg 字樣；shape language 參數不進入任何傷害或命中計算。
- **沒有宣稱是真實 Q/W/E/R**：`isActualSkillCast: false` 與「演出分類」文案不變。

驗證：資料層第 58–64 條（抽出 `CLASS_STYLE` / `ENVELOPE` 實際執行，比對
speed/width/height/hug 四個維度**六職業互不相同**、四種節奏在同一個 t 給出不同值、
未知職業回 fallback 不 throw）；瀏覽器 A18–A21 條。

---

## §5 melee / ranged 現況 Audit（只做報告，本輪未改）

### 現況：引擎**完全沒有** melee / ranged 區分

| 項目 | 實測 |
|---|---|
| 英雄交戰距離 | **硬編碼 `8`**（`LogicEngine.js:1476` `let bd = 8;` / `:1491` `dist(...) < 8`）。**所有英雄一視同仁。** |
| `heroDatabase.stats.range` | **存在**（鋼鐵衛士 150、雷霆神射 550），但**引擎一次都沒有讀它** |
| 追擊 | `chaseGiveUpDist: 9`、`contactKeep`——同樣不分職業 |
| 彈道 | 引擎沒有彈道概念；`fx` 的 travel 是**呈現層內插**，所有英雄同一條 |
| 站位 | 以 lane progress 推進（`laneAdvanceWorldSpeed`），沒有「遠程站後面」的規則 |
| 小兵 | **有** `kind: "melee" \| "caster"`（`LogicEngine.js:1857`），但英雄沒有 |

⇒ 目前「射手」與「坦克」在引擎眼中的交戰距離**完全一樣**。
Hero Database 已經有射程資料，只是沒接上。

### 給 Milestone M 的最小資料 Contract

```
// src/data/heroCombatRange.js（建議；不新增英雄資料，只從既有欄位推導）
heroCombatRange[heroId] = {
  kind: "melee" | "ranged",     // 由 heroDatabase.stats.range 分界推導
  attackRange: number,           // 模擬單位；由 stats.range 線性換算
  chaseGiveUp: number,           // 追擊放棄距離；ranged 應略小於 melee
}
```

注入方式沿用既有慣例：**第五個 opt-in 行為層**
（`configureRanges({ blue, red, meta })`），**不呼叫 = 逐位元回到現在的行為**。

### 風險（必須先講清楚才動）

1. **改交戰距離 = 改所有數值。** `bd = 8` 是每一次選敵的門檻，
   一動就改變誰先打到誰 ⇒ rng 消耗序列不變但戰鬥結果全變 ⇒
   `regress`（15 seed 的時長／擊殺）與 `regress2`（節奏門檻 8 條）**必然要重新校準**。
2. **遠程優勢會放大。** 射手若能在 550 換算距離外輸出而坦克要貼到 150，
   目前的傷害常數是在「大家都是 8」的前提下校出來的，直接接上去很可能讓射手過強。
   建議先跑**只改距離、不改傷害**的多 seed 對照，量勝率位移再決定要不要補償。
3. **與 TD-21 交互作用。** 陣列順序公平性目前就有 20pp 位移（既有紅燈）；
   在那之上再加一個會改變選敵順序的維度，會更難歸因。**建議先修 TD-21。**
4. **呈現層已經準備好了**：`projectile` / `line` 模板與 `CLASS_STYLE` 的
   speed/width 已經在區分遠近程的視覺；引擎接上之後**呈現層不需要再改**。

---

## §6 修改檔案

| 檔案 | 動作 |
|---|---|
| `tools/audit_tower_attack_l1.mjs` | **新增** — 塔攻擊唯讀診斷 |
| `src/battle/moba/presentation/TowerRangeDebug.jsx` | **新增** — debug 射程圈／鎖定線 |
| `src/battle/moba/heroPresentationAdapter.js` | callout 三道閘門 ＋ `combatClass` |
| `src/data/heroCombatPresentation.js` | `combatClassOf` ＋ 契約加 `combatClass` |
| `src/battle/moba/presentation/HeroSkillEffects.jsx` | 六職業 shape language ＋ 節奏包絡 |
| `src/battle/moba/presentation/HeroSkillCallout.jsx` | 版位收窄 ＋ 名稱錨點 |
| `src/battle/ui/BattleTimeline.jsx` | 三段式 ＋ localStorage 持久化 |
| `src/battle/moba/render/MobaRuntimeView3D.jsx` | 掛 debug 層（2 行） |
| `src/debug/HeroPresentation/HeroPresentationGallery.jsx` | 職業語彙對照區 |
| `tools/check_hero_presentation_l.mjs` | §7 新增 22 條 |
| `tools/shot_hero_presentation_l.mjs` | 職業卡／三段式戰報／塔 debug 驗證 |

**禁改清單全部未動**：Hero matchup、Ban/Pick、Reward、BattleResult Contract、
Replay Contract、assignment、其他經營頁、terrain/review/blend/backup。
**LogicEngine 與所有平衡常數也未動。**

---

## §7 測試結果

| 腳本 | 結果 |
|---|---|
| `check_hero_presentation_l` | ✅ **80/80**（原 59 ＋ Hotfix 21 條） |
| `shot_hero_presentation_l --stage=gallery` | ✅ **140/140**（六尺寸） |
| `shot_hero_presentation_l --stage=battle` | ✅ **45/45**（三尺寸，含三段式戰報與塔 debug） |
| `shot_hero_presentation_l --stage=replay` | ✅ **16/16** |
| `check_hero_matchups_k` | ✅ 47/47 |
| `shot_hero_matchups_k` | ✅ 348/348 |
| `check_moba_milestone_j_close` | ✅ 35/35 |
| `shot_banpick_hotfix2` | ✅ 251/251 |
| `regress` | ✅ **15/15**，平均 **23.5 分** ／ **29.8 擊殺** —— **與 L／K／J-close 逐值相同** |
| `regress2` | ✅ **20/20**，節奏門檻 **8/8** |
| `npm run build` | ✅ exit 0 |

`regress` 逐值相同 ⇒ **本輪對戰結果一個位元都沒變**（因為引擎一行未改）。

---

## §8 未驗項目

1. **live 對戰的肉眼觀察仍未驗**（與 Milestone L 相同的環境限制）：
   headless 軟體渲染推進 0.14 模擬秒／真實秒，英雄互毆要 ts≈60+ 才出現。
   callout 降噪與職業語彙的**實際觀感**需要 Ray 在真實瀏覽器打一場確認。
2. **真機未測**（Android / iOS）；FPS 在 headless 軟體渲染下沒有參考價值。
3. **塔清兵的修正未做**（見 §1「為什麼本輪不改它」），已列為下一輪候選。
4. **melee / ranged 未改**（本輪只做 Audit，依任務要求）。
