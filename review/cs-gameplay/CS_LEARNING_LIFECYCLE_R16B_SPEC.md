# CS Learning Lifecycle / State Design R16-B

日期：2026-08-11
狀態：**Reviewed / PASS**
Production gameplay：**未修改**
Calibration：**No-Go**

## 1. 目的

本 Sprint 只重新確認 `learning` 的資料來源、更新者、持久化位置與 CS runtime read-chain，
把目前的「有 stat、無單局 gameplay consumer」明確分類為 lifecycle / data-model design gap。
本 Sprint 不建立 learning gameplay modifier，也不修改任何 production contract。

## 2. 已確認的資料鏈

```text
playerModel.STAT_DEF.learning
       ├→ TRAINING_COURSES.meta → applyCourse → players[].stats.learning
       ├→ talentDefinitions.team_3 → playerDerivedStats → derived.learning
       └→ fpsRoster.STAT_L2S.learning → CS roster stats.lrn
```

現有長期 state owner 是 `profileStore.players[]`：

- `players[].stats.learning`：訓練後的 base stat。
- `players[].training`：目前課程與剩餘時間。
- `players[].talents`：天賦 ranks；`team_3` 導出 `learning +2/rank`。
- `players[].growthLog[].statsAfter`：訓練完成後的實際成長紀錄。

R16-B pure probe 證明：

- 無天賦時 `derived.learning === base.learning`，adapter 會產生 `lrn`。
- `team_3` rank 3 導出 `learning +6`。
- `meta` 版本研究課程會讓 learning 由 70 增至 71.5；輸入 player 不被 mutate。

## 3. CS runtime read-chain

目前只有 roster/input 與 display 定義：

- `fpsRoster` 將 `learning` 轉成 `lrn`。
- `EsportsFPS3D` 的 `STAT_GROUPS` 顯示學習力，`FPS_W.lrn` 與 personality 也有定義。
- `fpsOvr` / `calcPower` 是 display／經營側 power 計算，不能當作 CS gameplay consumer。

目前沒有：

- `simulateFps` 的 `lrn` action-point read。
- `combatSkill`、tactic、utility 或單局 damage 的 learning read。
- CS match observation / adaptation event。
- 跨場 learning state、更新時機、消費端或 persistence contract。
- `CsMatchResult.v1` 的 learning 欄位；既有 `csHistory` 不回算、不遷移。

## 4. Focused verifier

Verifier：`tools/check_cs_learning_lifecycle_r16b.mjs`

硬 gate：

- 鎖定 7 個現有 source SHA；任何 production source 漂移即 fail-closed。
- static RNG call sites 維持 21。
- 純函式 probe 驗證 training／talent／derived／adapter 資料鏈。
- 不 instantiate `profileStore`、不寫 localStorage、不跑 runtime gameplay、不建立新 RNG。
- 無 `CsGameplayDigest.v7`，不做完整 16-stat calibration。

Evidence：

```text
CsLearningLifecycle.v1: 02561a4e3979a2869435d6e2edb4aac9be4e501fd88020729bc8f199755d979b
```

## 5. 根因分類

這不是 `fpsRoster` 遺漏映射，也不是 `FPS_W` 權重錯誤：

1. learning 已能從 canonical model 進入 CS roster payload。
2. training / talent / derived lifecycle 都能正確更新資料。
3. CS simulator 沒有任何跨場 observation 或 learning consumer。

因此分類為：**跨場 lifecycle / state design gap**。若直接把 `lrn` 塞進
`combatSkill`、tactic、utility 或傷害公式，會同時發明 gameplay 語意並進入 balance，
不屬於最小 wiring repair。

## 6. 封版未來准入規則

未來若要讓 learning 具備 gameplay 意義，必須先另開 state-contract Sprint，明確定義：

- 誰擁有 learning state（player、team 或 match preparation）。
- 何時觀察、何時更新、是否跨 match 持久化。
- 消費端是賽前準備、訓練決策或其他明確系統；不得默認為 duel multiplier。
- migration、`csHistory` 相容性、Store／Progress 邊界與 historical evidence 策略。

在上述決策前：

- 不修改 production gameplay。
- 不新增 RNG、不補 dummy RNG。
- 不修改 `CsMatchResult.v1`、Store、Progress、runtime contract。
- 不 rebaseline R1～R15 constants/digests。

## 7. Gate 結論

- R16-B lifecycle/state audit：**Go / PASS**。
- Learning production wiring：**No-Go**，直到 state owner、lifecycle 與 consumer contract
  完成另一個明確 Sprint。
- R1～R15 historical evidence：保留，不 rebaseline。
