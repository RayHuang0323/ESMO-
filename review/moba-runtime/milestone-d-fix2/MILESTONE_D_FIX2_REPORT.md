# Milestone D-fix2 Report

日期：2026-07-30
狀態：**兩階段本機實作與驗證完成；未 push、未部署、未開始下一 Milestone。**

## 1. 版本與範圍

- rollback tag：`milestone-d-fix2-baseline`
- rollback commit：`f688776b4a3b92246a5167afef5a4218a0432e4b`
- 階段 1 commit：`3beb2c0`（Combat FX／Buff／頭頂 UI）
- 階段 2：本報告所在 commit（v3 戰鬥決策、最終驗證與文件）
- 回退方式：依需要 `git revert <phase-2-commit>`、再
  `git revert 3beb2c0`；不可用 `git reset --hard`。

本輪未修改地圖幾何、H.2 碰撞真實來源、傷害係數、塔血、勝負公式、
`BattleResult.v2`、progress／reward、profile persistence 或 Replay contract。
`LogicEngine` 的改動限於 FX 呈現事件壽命與 v3 移動決策；v1／v2 歷史規則不啟用
D-fix2 決策層。

## 2. 階段 1：正式 GameView 視覺根因與修正

### 2.1 真正根因

正式 GameView 的事件鏈實際為：

`LogicEngine.pushFx` → `snapshot.fx` → `mobaRuntimeMapAdapter.adaptEffects` →
`MobaRuntimeEffects` → live／Replay 共用 runtime-v2。

追查證明 source／target、ability 與 cast／travel／impact 沒有在 adapter 或 Replay
遺失。真正問題是：

1. Milestone D 把 Replay 取樣保留時間 `exp` 與畫面播放時間 `life` 綁成同一個
   3.4／4.2 秒；英雄每 0.5 秒攻擊時，固定 instance pool 會同時堆 6–8 組舊事件。
2. instance pool 依舊事件優先填入，新發生的 tower／skill travel 在高負載時反而可能
   被容量截掉。
3. additive 白色 ring 的 opacity／scale／render order 高於彈體；畫面只剩大片白圈，
   不是資料鏈沒有 projectile。
4. 紅藍 Buff 模型共用白色 emissive，vertex color 被洗淡；缺少正式名稱與地面符號。

### 2.2 修正結果

- `exp` 保留 Replay 2 秒取樣安全窗；實際 `life` 改為 tower 1.45s、skill 1.6s、
  attack／line 1.1s，不改攻速、CD 或傷害。
- effect pool 改為 tower > skill > attack、travel > impact > cast、較新事件優先。
- 塔彈改為可辨識的亮色核心＋外層色球＋短尾跡；白圈降為短暫低權重提示。
- 技能 travel／impact 提高核心與尾跡可讀性，但縮小持續遮場的 ring。
- 名稱縮為 7px 並移到血條上方；Buff 圖示在血條下方，紅／藍環繞效果低 opacity。
- 紅藍 Buff 野怪改用不受白 emissive 洗色的 vertex-color material，加入
  `BLUE BUFF · 藍` 菱形符號與 `RED BUFF · 紅` 三角符號。

## 3. 階段 2：可解釋戰鬥決策

### 3.1 資料與公平性原則

- 決策只在 v3 啟用；每 tick 先用全員**凍結位置**建立 `decisionPlan`，再開始任何英雄
  移動，避免藍方先移／紅方後看的陣列順序偏差。
- 決策不呼叫 `rng`／`rng2`，不改傷害；結果附加到 v3
  `snapshot.players[].decision` 供觀察，v2 snapshot 形狀不變。
- 同 seed／同席位的鏡像僵局使用等幅反號的固定 commitment 作平手裁決；
  它由 seed＋席位 hash 產生，不依陣營或迭代順序。幅度 0.15–0.19，只平移撤退／
  接戰意願，不成為傷害或勝率係數。
- 一般決策每 2.5 秒重評。接戰可維持職業距離；拉扯／支援只給短促微調，
  隨即交還既有兵線、Gank、objective 與 FSM，避免另建第二套導航。

### 3.2 評估輸入

每次評估使用：

- 自身與目標 HP；
- 14 單位內敵我人數、9 單位實際接觸；
- 敵塔距離、塔區守軍、己方兵線是否到塔；
- role（top／jungle／mid／adc／sup）與職業理想距離；
- `atkCd` 技能循環是否 ready；
- 目標低血量價值、早期對線期、隊伍擊殺／塔數劣勢；
- 低血量隊友是否正在受威脅；
- 固定 commitment 平手裁決。

`decision.reasons` 會輸出例如 `hp:70`、`numbers:1:2`、`role:adc`、
`skill:cooling`、`tower:no-wave`、`target:low`、`ally:low:b4`。

### 3.3 行為

- `ENGAGE`：血量／人數／角色／CD／風險分數足夠時，以 melee 2.2–2.6、
  caster／marksman／support 5.0–5.8 的職業距離接戰。
- `KITE`：分數不足但未達撤退時，依職業射程繞行；不固定逃跑，也不離開 8 單位
  戰鬥圈造成假拉扯。
- `PURSUE`：低血量高價值目標在 9 單位風險圈內才追；離開接觸圈即停止，既有
  `chaseMaxT`／leash／Flash chase 仍保留。
- `RETREAT`：低血量或人數劣勢才升級撤退，之後沿用既有 recall channel、
  受擊中斷、回血遲滯與復活返場。
- `SUPPORT`：輔助靠向正在被威脅的低血量隊友。
- `FALLBACK`：無兵線單人闖有人守的塔、守軍明顯較多或塔區低血量時，停在敵塔
  射程外安全邊界；不再一路退回自家塔，也不破壞正常 2v2。
- 無局部事件時維持既有 `LANE`／`ROAM`／`FARM`／`OBJECTIVE`／`RETURN`。

## 4. 修改檔案

### 階段 1

- `src/LogicEngine.js`
- `src/battle/moba/render/MobaRuntimeEffects.jsx`
- `src/battle/moba/render/MobaRuntimeHeroes.jsx`
- `src/battle/moba/render/MobaRuntimeNeutrals.jsx`
- `tools/check_moba_milestone_c_fix.mjs`
- `tools/check_moba_milestone_d.mjs`
- `tools/check_moba_milestone_d_fix2.mjs`
- `review/moba-runtime/milestone-d-fix2/evidence/README.md`
- `review/moba-runtime/milestone-d-fix2/evidence/01-stage1-fx-dataflow.png`
- `review/moba-runtime/milestone-d-fix2/evidence/02-stage1-buff-nameplate.png`

### 階段 2

- `src/LogicEngine.js`
- `src/battle/moba/matchProgression.js`
- `tools/check_moba_milestone_d_fix2.mjs`
- `docs/handoff/05_Sprint紀錄.md`
- `review/moba-runtime/milestone-d-fix2/MILESTONE_D_FIX2_REPORT.md`
- `review/moba-runtime/milestone-d-fix2/evidence/README.md`
- `review/moba-runtime/milestone-d-fix2/evidence/03-stage2-formal-gameview.png`
- `review/moba-runtime/milestone-d-fix2/evidence/04-stage2-complete-match.png`

## 5. 驗證結果

| 驗證 | 結果 |
|---|---|
| `check_moba_milestone_d_fix2` | PASS；六決策微場景、順序無關、鏡像 commitment、完整場皆通過 |
| `check_moba_milestone_c_fix` | PASS |
| `check_moba_milestone_d` | PASS |
| `check_moba_nav_h2` | 14 PASS / 0 FAIL |
| `check_moba_minions_h3` | 22/22 |
| `check_moba_presentation29b2` 直接本體 | 12/12 |
| `check_moba_camera_replay29b6` 直接本體 | 16/16 |
| `check_moba_pacing29b1` 直接本體 | 25/25；40 seeds 正／反序皆藍 22/40，位移 0pp |
| `regress` | 15/15；平均 24.5 分、34.9 kills、撤退鎖死 0 |
| `regress2` | 20/20、8/8；藍 9／紅 11、平均 24.3 分 |
| 60-seed fairness bench | 60/60；藍 51.7%／紅 48.3%；反序藍 53.3%，順序差 1.7pp |
| production build | PASS；2595 modules，僅既有 >500k chunk warning |
| `git diff --check` | PASS；僅 Windows LF→CRLF 提示 |

`presentation29b2` 與 `camera_replay29b6` 以 `SKIP_NESTED=1` 跑直接本體；
它們的巢狀 pacing、regress、regress2 與 build 已在同一輪各自直接執行並核對
exit code，避免重複跑相同長鏈。

專屬完整戰鬥（seed 6310）在 20:53.5 結束，紅方 18:7；實際出現
`LANE`、`ENGAGE`、`KITE`、`PURSUE`、`FALLBACK`、`RETREAT`、`SUPPORT`、
`RESPAWN`、`RETURN`，不是只用微場景讓 verifier 通過。

## 6. 正式 GameView 證據與人工驗收

證據索引：`review/moba-runtime/milestone-d-fix2/evidence/README.md`

- 正式桌面流程已走 Dashboard → MOBA → lineup → matchmaking → Ban/Pick →
  Tactic → GameView；不是 verifier 或 debug harness。
- 正式 GameView 觀察並快速收尾的一場為 29:11、29:26，進入正式 Result。
- 建議人工入口：
  `http://127.0.0.1:5187/ESMO-/`
- 需要事件文字時可用：
  `http://127.0.0.1:5187/ESMO-/?diag=1&debug=1`

仍需人工驗收：

1. 正常 1× 長時間觀看塔彈與六職業 cast／travel／impact 是否足夠明顯且不遮場。
2. 多人團戰中名稱／等級、血條與 Buff 圖示是否仍保持可讀。
3. 觀察接戰、拉扯、追擊、支援、避塔、打野、回城切換的體感是否自然。
4. Replay 動態播放的 FX／Buff／等級一致性。
5. Android 真機 FPS、熱降頻、觸控、safe area、WebGL driver 與 H.2 閃爍。

本輪未納入既有 terrain、bug 影片、backup、logs、舊截圖、blend／glb 或 map review
等工作區產物。
