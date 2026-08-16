# R25 CS Accuracy Semantic Audit / Minimal Correction 報告

日期：2026-08-13
結論：**R25 semantic correction = Go；Accuracy calibration = Deferred / Revise；miss branch = separate Sprint。**

## 1. 白話結論

Accuracy 現在代表「選手能不能把已經發生的對槍打得更準、打到更好的部位」，不是「會不會扣
板機」，也還不是獨立的「子彈有沒有命中」。raw 值描述球員的基礎射擊天分與職位契合；
effective 值是套用個性後在這場對戰真正發揮出的準度。

R24 查到 headshot 還在讀 raw Accuracy，等於 grinder 的苦練加成與 shotcaller 的精準度扣分
會影響 `combatSkill()`，卻不影響爆頭。這是同一個 live firearm event 裡的語意不一致，證據足以修正。

## 2. Production patch

只修改 `src/battle/fps/EsportsFPS3D.jsx` 第 550 行的 Accuracy read：

- R24：headshot 讀 raw `at.stats.acc`。
- R25：保留原 fallback；有 stat 時改讀 `persStat(at,"acc")` 的 effective Accuracy。

未改 headshot coefficient、damage、armor、role mapping、balance、scenario 或其他 15 項素質；
未新增 RNG，`rand()` call sites 維持 21；未新增 miss system。

## 3. Deterministic semantic evidence

- focused verifier：`tools/check_cs_accuracy_semantics_r25.mjs`
- schema：`CsAccuracySemanticAuditSuite.v1`
- fixed scenario：`inferno / t_aexec / c_std`
- fixed seeds：16
- simulation executions：96
- live source SHA：`68d75bb357a504cee8529c4d8cce023c92c364e72cde88e507a8af0df811780e`
- R24 historical view SHA：`57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29`
- suite digest：`26ef0739e8ec2c110aeba4ad063727770dad4886d45df70a041e21dcf17892c8`
- observed headshot events：grinder 137、shotcaller 368、neutral 1466
- first semantic decision boundaries：effective gain 1 seed、effective penalty 3 seeds

每個 admitted firearm exchange 都仍是 exchange → headshot roll → firearm damage，沒有 miss branch。
第一個 decision flip 前，兩個 source view 的參與者、weapon、raw/effective Accuracy 與 RNG roll 相同；
flip 方向皆符合 `grinder +6` 或 `shotcaller -4`。未遇到 flip 的 seed 維持完整 zero-diff。

## 4. Historical gate

R25 使用 exact R25→R24 source adapter；舊 verifier 執行的是 byte-exact historical view，沒有重算
或更新任何既有 expected digest。

- central CS aggregate：20/20 PASS（R1～R15、R17、R20～R25）。
- 額外 historical：R18-A、R18-B、R19 全部 PASS，既有 suite digest 不變。
- R24 suite digest 仍為
  `3c6d1625a06684b91b3b99424cdfb4c79c963f17da82411b825264d0f77eaf05`。

## 5. Miss branch 評估

值得做，但前提是產品真的要把 Accuracy 擴充為「命中機率」。它不是本次 bug fix：新增 miss 會改
firearm pipeline、tracer、damage/kill/economy/round result，且獨立 roll 會改 RNG consumption 和後續
trajectory。R2/R24 instrumentation、gameplay digest 與 historical causal gate 都要版本化；若 UI 要顯示
shots/hits，還會碰 `CsMatchResult.v1`、adapter、persistence 與結果畫面。

建議另開 verifier-first Sprint，先定義 hit probability curve、武器/距離/姿態關係、RNG migration 與
contract scope，再決定是否實作；不要把它跟 headshot raw/effective 修正綁在一起。

## 6. Review verdict

- Blocking findings：0。
- Non-blocking：Accuracy calibration 仍缺新的 R25 effective-headshot measurement 與可靠 local KPI；
  R24 的 calibration Deferred 結論不因這次 semantic patch自動翻轉。
- Go：R25 semantic audit 與單行 headshot correction。
- Revise：Accuracy calibration proposal。
- No-Go：在 R25 內新增 miss branch、增加 RNG 或 rebaseline historical evidence。

production build、final diff review 與 local commit SHA 於 commit 後記錄在 handoff / 最終回報；本 Sprint 不 push。
