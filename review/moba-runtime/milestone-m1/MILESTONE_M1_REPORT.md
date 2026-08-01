# Milestone M1 — 戰鬥契約接線、交戰距離、職業站位、長局校正

日期：2026-08-01　起點 commit：`147139f`（M 基礎層）
rollback tag：`milestone-m1-baseline` → `147139f`

**M2（projectile lifecycle）尚未開始**，本輪完全沒有碰它。

---

## §1 長局紅燈的根因

### 重現

`regress2` 的 20 個 seed 中，最長的是 **seed 777 = 33.3 分**（門檻 32）。
逐 2 分鐘取樣它的推進：

```
12分 車道塔存活 16/18   門牙 4/4   擊殺  8
18分 車道塔存活 10/18   門牙 4/4   擊殺 18
22分 車道塔存活  5/18   門牙 4/4   擊殺 29
26分 車道塔存活  4/18   門牙 3/4   擊殺 36
32分 車道塔存活  3/18   門牙 3/4   擊殺 62
```

### 根因：不是塔、不是 Boss，是**推進閘門**

`frontStructure()` 規定：必須 `laneCleared(side)`（**某一路三座塔全倒**）
才輪得到門牙塔。seed 777 兩隊對稱互拆，傷害平均散在三路 ⇒
到 22 分還有 5 座散在各路、**沒有任何一路被清空** ⇒ 沒人打得到門牙 ⇒ 高原期。

這是**既有的結構性質**，Hotfix 2 的 Boss 修正（英雄在坑內被打，交戰更久）
把這個 seed 推過了 32 分線。

### 修法：用既有的收斂槓桿，不動塔、不動 Boss、不動門檻

`structureAccelT / structureAccelDiv`：**960 / 130 → 900 / 115**
（15 分後開始加速拆建築，曲線略陡）。它**只加速拆建築**，
不改擊殺、不改移速、不改任何傷害公式。

**沒有做的事**：沒有提高 32 分門檻、沒有刪 seed、沒有削弱塔或 Boss 的威脅。

### 前後對照

| | 修正前 | 修正後 |
|---|---|---|
| seed 777 | **33.3 分** | **23.4 分** |
| `regress2` | **7/8**（最長 33.3） | **8/8**（最長 27.4） |
| `regress` | 14/15、24.2 分、32.3 擊殺 | **15/15、23.1 分、30.9 擊殺** |
| `check_combat_threat_l2` | 19/19 | **19/19（不變）** |

塔與 Boss 的威脅感驗證完全不變 ⇒ 收斂是靠建築加速拿回來的，不是靠削弱威脅。

---

## §2 Adapter 接線

唯一計算點在 `useLocalServer.start()`，緊接在 `configureHeroes` 之後、
`configureSpells` 之前，沿用既有四個 opt-in 層的位置與慣例：

```
opts.roster（draft × 先發指派 × profileStore）
  → toEngineArchetypes(roster)        ← 唯一形狀轉換點
  → 依席位首字母拆成 blue / red
  → eng.configureArchetypes({ blue, red, meta })
```

- **UI 不拼資料**：verifier 第 30 條掃描所有 `.jsx`，確認沒有任何元件 import `toEngineArchetypes`。
- **缺資料 ⇒ 決定性 fallback**（契約層的 `cachedFallback`，**不使用亂數**）。
- **無 roster ⇒ 完全不呼叫** ⇒ 交戰距離逐位元回到硬編碼 8。

---

## §3 交戰距離與站位的實測差異

樣本：5 seeds × 4200 ticks，**只採計最近敵人 < 15 的交戰窗**
（整場平均會被對線地理主導——上路／打野天生離敵人遠——量出來的是地圖形狀不是站位）。

| 席位 | 英雄 | 線位 | 類型 | 契約射程 | 平均最近敵距 | 有效交戰距離 | 在射程內% |
|---|---|---|---|---|---|---|---|
| b1 | 鋼鐵衛士 | front | melee | 4.00 | 4.53 | 3.89 | 45–56% |
| b2 | 暮刃 | flank | melee | 4.00 | 4.76 | 3.90 | — |
| b3 | 冰霜術士 | back | ranged | 8.13 | 7.08 | 7.42 | 77% |
| b4 | 雷霆神射 | back | ranged | 8.40 | 7.25 | 7.15 | 65–73% |
| b5 | 聖光祭司 | support | ranged | 7.85 | 6.98 | — | — |

**近戰 / 遠程**

- 近戰有效交戰距離 **3.89**，遠程 **6.53** ⇒ 差距 2.6 個世界單位
- 每位近戰的實際交戰距離都在自己的契約射程內
- 遠程平均交戰距離 > 近戰契約射程上限（4.28）⇒ 不必貼身
- 近戰仍打得到人（在射程內的 tick 佔比 44–58%）

**四種站位（平均最近敵距）**

```
front 4.53   flank 4.76   back 7.08   support 6.98
```

- front 明顯比 back 靠前
- back **不會**貼進近戰核心（7.08 > 4.28）
- flank 與 front / back 都有可量測差距
- support 保持在 front 後方

**沒有病態行為**：任一席位的重疊（隊友距離 < 1.0）佔比 < 25%；
沒有「全隊長時間打不到任何人」的卡死；同 seed 兩次觀測**逐值相同**（無新增 RNG）。

---

## §4 多 seed 統計

| 指標 | 未接線（bare，24 seeds） | 接線後（arch，20 seeds） |
|---|---|---|
| 完成率 | 100.0% | **100.0%** |
| 未結束 | 0 | **0** |
| 勝率 藍/紅 | 58.3 / 41.7 | 60.0 / 40.0 |
| 平均時長 | 23.2 分 | 25.7 分 |
| 中位 | 22.2 分 | 26.0 分 |
| p95 | 27.1 分 | 31.8 分 |
| 擊殺 | 31.4 | **65.5** |
| 破塔 | 17.3 | 16.0 |
| 龍 / 巴龍 | 5.7 / 3.9 | 4.7 / 3.5 |

**哪些是預期、哪些是副作用**

- **預期**：擊殺上升。近戰現在必須真的貼到 3.9 才打得到人，團戰因此變成
  近距離互毆而不是遠距離互相消耗 ⇒ 交易更密集。
- **預期**：時長略增。近戰要花時間接近。
- **副作用（已校正）**：第一版把近戰的 `preferredDistance` 設在射程邊緣
  （坦克 0.92 × 4.0 = 3.68），實測會在邊界擺盪、遲遲進不了攻擊距離
  ⇒ 20 seeds 有 1 場收不掉。收到 **0.78 / 0.70** 後回到 100% 完成率。
- **仍是技術債**：接線後 p95 31.8 偏高、擊殺 65.5 偏多。
  真正的解法是 **M2 的 projectile lifecycle**——遠程改成命中才結算之後，
  遠程的持續輸出會下降，近距離互毆的交易密度會自然回落。
  本輪不動傷害公式，所以不在這裡硬壓。

⚠ `regress` / `regress2` **測的是未接線的裸引擎**（它們直接 `new LogicEngine(seed)`，
不呼叫 `configureArchetypes`），所以那兩支的數字反映的是 §1 的長局修正，
不是接線後的平衡。接線後的平衡以本節的 arch 欄為準。

---

## §5 驗證結果

| 腳本 | 結果 |
|---|---|
| `check_combat_positioning_m1`（新增） | ✅ **17/17** |
| `check_combat_archetypes_m`（擴充至 30 條） | ✅ **30/30** |
| `check_combat_threat_l2` | ✅ 19/19 |
| `check_hero_presentation_l` | ✅ 80/80 |
| `check_hero_matchups_k` | ✅ 47/47 |
| `check_moba_milestone_j_close` | ✅ 35/35 |
| `regress` | ✅ **15/15**、23.1 分、30.9 擊殺 |
| `regress2` | ✅ **8/8**（最長 27.4 分 ≤ 32） |
| `npm run build` | ✅ exit 0 |

---

## §6 修改範圍

**修改**：`src/data/heroCombatArchetypes.js`（近戰 preferK 校正）、
`src/useLocalServer.js`（接線）、`src/battle/moba/heroPresentationAdapter.js`
（補 `attackType` / `positionRole` 兩個欄位）、
`src/battle/moba/matchProgression.js`（`structureAccel` 900/115）、
`tools/check_combat_archetypes_m.mjs`（接線後反轉第 28 條）、
`tools/bench_combat_l2.mjs`（`--arch` 旗標）。
**新增**：`tools/check_combat_positioning_m1.mjs`。

**未修改**：`LogicEngine.js`（M 基礎層已放好 opt-in 層，本輪一行未動）、
HUD／Timeline／Replay／技能演出分類、Ban/Pick、Matchup、Reward／BattleResult／
Replay Contract、assignment、laneByHero、英雄數值與傷害公式、
Codex worktree `ESMO-hero-models`。

---

## §7 未驗與已知限制

1. **沒有瀏覽器驗收**：本輪沒有 UI 版面改動（Presentation 只多兩個資料欄位，
   沒有新元件、沒有版型變化）。
2. **接線後的體感未驗**：近戰貼身、遠程拉距打起來對不對，需要真人實際打一場。
3. **真機未測**（Android / iOS）。
4. **接線後 p95 31.8、擊殺 65.5 偏高** —— 已列為技術債，正解是 M2。
5. **M2（projectile lifecycle）尚未開始**：引擎目前仍是連續 DPS
   （`p.power * dt * dmgK` 每 tick 施加），遠程沒有真正的飛行時間與命中結算。
6. `flank` 目前是「側向偏移接近」，**不是真正的繞後尋路**（那是 M3）。
