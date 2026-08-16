# R37 CS Learning Measurement / Calibration Readiness

## Scope

本輪只量測 Learning 的跨場生命週期，不把它接進 CS 單局戰鬥。沿用 R16-B 的 canonical `playerModel.STAT_DEF.learning`、`getPlayerDerivedStats`、`fpsRoster.STAT_L2S.learning -> lrn` 與 `profileStore.players[].stats / training / growthLog`。

## Measurement

`check_cs_learning_measurement_r37.mjs` 以 5 個 CS role、low/baseline/high 三檔 Learning、16 個固定 seed 做 240 個純函式 training probes，並重複驗證 save/load shape、輸入不突變與 digest。Learning 可作為既有 `meta` 課程的成長目標；課程增益由既有 course/potential 公式決定，沒有 match-result 或 post-match Learning update。

## Boundary

Learning 不讀取 `simulateFps`、`combatSkill`、tactic、utility，也不出現在 `CsMatchResult.v1`。本輪不修改 production、不新增 RNG、不建立 progression engine。跨場經驗吸收／熟練度 owner 尚未封版，因此 calibration Deferred / No-Go。
