# CS 第一版 Roster / Gameplay Balance Acceptance R54 Report

日期：2026-08-16

## 結論

**R54 Go。第一版 15 項 CS 能力系統通過 acceptance；本輪不需要 production balance patch。**

這是 fixed-scenario、代表性 roster acceptance，不是所有地圖、side、戰術組合的最終 competitive balance sign-off。可以開始正式 roster / AI 隊伍製作，並在後續完整 roster acceptance 再做跨場景 balance sweep。

## 實際 evidence

Verifier 使用 `inferno / t_aexec / c_std`、6 個固定 seeds，並驗證 6 次 baseline repeat deterministic digest、input immutability、8 個 memory-only roster variants。source digest：`3f52938d91de5a3cf4030452f6c90f9d689717e696e1be9509b7a90059d4405b`；既有 RNG call sites：21；production consumer / balance change：0。

### Baseline profile

| 指標 | 結果 | 判讀 |
|---|---:|---|
| active stat cells | 150 | 10 人 × 15 項 |
| effective 90+ | 16 / 150 = 10.67% | 沒有高端 mass saturation |
| effective 99 clamp | 0 / 150 = 0% | 無 baseline clamp risk |
| `adp >= 80` | 8 / 10 = 80% | eligibility 較寬，但不是每局 opportunity 都觸發 |
| `tac >= 90` | 1 / 10 = 10% | IGL threshold 稀疏 |
| `com >= 88` | 3 / 10 = 30% | role-limited |
| `led >= 90` | 2 / 10 = 20% | IGL-limited |
| `coo >= 90` | 1 / 10 = 10% | support / team threshold 稀疏 |
| `aggr` | 0.66–1.13，mean 0.84 | clamp 範圍有效；`<0.82` retreat eligibility 為 7/10 |

`adp` 的 8/10 只代表能進入既有 eligibility check；fixed scenario 的實際 route / post-plant observability 仍由 path、HP、bomb 與 timing 決定，因此沒有把 eligibility count 誤當 conversion。

### Team ordering

| variant | T 平均分 | CT 平均分 | T round diff | T kills / CT kills | max player kill share |
|---|---:|---:|---:|---:|---:|
| baseline | 2.00 | 7.83 | -5.83 | 22.50 / 39.50 | 0.51 |
| stronger | 4.33 | 7.50 | -3.17 | 37.50 / 41.00 | 0.49 |
| weaker | 0.33 | 8.00 | -7.67 | 11.83 / 35.17 | 0.56 |

固定 `T execute` 對 `CT standard` 明顯偏 CT，因此這裡把 score 只作 strength ordering，不把單一 fixed scenario 的 T win rate 當唯一 balance gate；stronger > baseline > weaker 的方向一致。

### Role identity / focused comparison

| role | effective signature mean / roster comparison | focused target mean rating delta | mean ADR delta | mean kills delta | 判讀 |
|---|---:|---:|---:|---:|---|
| Entry | 88.33 / +7.57 | +0.17 | +6.33 | +1.83 | Reflex / APM / Courage 有入口差異，未形成 team frag collapse |
| Rifler | 85.50 / +3.85 | +0.04 | +4.83 | +0.50 | 綜合槍法型，變化較平滑 |
| AWP | 86.50 / +5.13 | +0.50 | +34.67 | +4.67 | 對 Accuracy / Focus / Positioning 最敏感；6 seeds aggregate 未超過 0.72 kill share gate，但需列為後續觀察項 |
| Lurker | 81.25 / -0.35 | +0.08 | -4.00 | +0.50 | 主要靠 positioning / route / hold path，不是高總和 stat；沒有 Decision / Clutch threshold amplification |
| IGL | 91.63 / +11.45 | +0.03 | 0.00 | +0.83 | strategy composite 91.63、combat composite 71.33，差 +20.29；仍像指揮而非純槍男 |

AWP role-focused 的單 seed 曾出現較高的 ADR / kill delta，但跨 6 seeds 的 max player kill share 為 0.72，低於 verifier 的 collapse guard 0.80，baseline max share 只有 0.51；目前屬 sensitivity risk，不是足以支持立即調係數的 systemic regression。Entry focused max share 0.51、Lurker 0.55、IGL 0.50，沒有多重 exposure 或 threshold 放大的群體失控。

## 16 項整合狀態

R54 不改 R53 readiness；目前狀態為：

| # | 正式中文名稱 | canonical key | gameplay identity | production consumer | calibration 狀態 | stable / pilot range | clamp / threshold | role-specific limitation | 後續 gameplay Sprint |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | 反應力 | `reflex` | 反應 / duel timing | combatSkill / hit timing | Calibration Ready | 60–90 pilot | effective clamp 99 | Entry / Rifler exposure 較高 | 否 |
| 2 | 準確度 | `accuracy` | weapon accuracy / headshot | combatSkill / headshot | Calibration Ready | 60–90 pilot | high-end diminishing return | AWP / Rifler / Entry | 否 |
| 3 | 操作頻率 | `apm` | fire / action tempo | combatSkill / role-fit | Calibration Ready | 60–90 pilot | high-end saturation | Entry / Rifler | 否 |
| 4 | 站位 | `positioning` | role-fit / holding / route | posSkill / combatSkill | Calibration Ready | 60–90 pilot | effective clamp 99 | AWP / Lurker / Rifler | 否 |
| 5 | 視野意識 | `mapAwareness` | visible candidate / LOS admission | map-aware engagement | Calibration Ready - Limited | R49 pilot | path / LOS limited | role exposure varies | 不需立即新增 consumer |
| 6 | 戰術理解 | `tacticalIQ` | tactic route / retake | tactical route consumer | Calibration Ready - Limited | R47–R52 | `tac >= 90` | IGL / CT retake path | 不需立即新增 consumer |
| 7 | 判斷力 | `decision` | clutch / defuse / retreat | combat / defuse / clutch | Calibration Ready - Limited | R45 pilot | low-HP / last-alive | Lurker / IGL context | 不需立即新增 consumer |
| 8 | 應變力 | `adaptability` | reposition / post-plant adjustment | adaptive route | Calibration Ready - Limited | R34/R47/R52 | `adp >= 80`, path-gated | Lurker / low-HP / plant | 不需立即新增 consumer |
| 9 | 勇氣 | `courage` | aggression / entry exposure | `aggr` / entry combat | Calibration Ready | 60–90 pilot | shared `aggr < 0.82` | Entry strongest | 否 |
| 10 | 強度 | `strength` | low-HP / clutch resilience | combat / clutch adapter | Calibration Ready - Limited | R45 pilot | last-alive / low-HP | Lurker / clutch | 不需立即新增 consumer |
| 11 | 專注力 | `focus` | holding / AWP / defuse | combat / hold / defuse | Calibration Ready - Limited | R44/R45 | effective read / high-end | AWP / CT defuse | 不需立即新增 consumer |
| 12 | 韌性 | `resilience` | low-HP persistence | low-HP modifier | Calibration Ready - Limited | R45 pilot | low-HP opportunity | clutch context | 不需立即新增 consumer |
| 13 | 溝通 | `communication` | handoff / bomb awareness | visible contact / teammate handoff | Calibration Ready - Limited | R48/R52 | `com >= 88` | IGL / Support / receiver role | 不需立即新增 consumer |
| 14 | 領導力 | `leadership` | route direction / follow-up | IGL route reassignment | Calibration Ready - Limited | R49/R51/R52 | `led >= 90` | IGL-only | 不需立即新增 consumer |
| 15 | 配合度 | `coordination` | trade / cover follow-up | visible trade partner | Calibration Ready - Limited | R48/R51/R52 | `coo >= 90` | Support / trade partner | 不需立即新增 consumer |
| 16 | 學習力 | `learning` | cross-match training / meta / talent / growthLog | lifecycle only | Lifecycle | 不進單場 calibration | 無 match-result consumer | 只做獨立 Learning Sprint |

### Final status count

- `Calibration Ready`：4
- `Calibration Ready - Limited`：11
- `Measurement Ready - Coverage Limited`：0
- `Deferred`：0
- `Lifecycle`：1（唯一為 Learning）
- 目前可用 active stats：15 / 15；16 項整體完成度估計：**93.75%（15/16 core gameplay-usable；Learning 為明確 lifecycle 邊界）**

## Gate disposition

- R54 focused roster acceptance：PASS
- R46 distribution：PASS；R46 baseline 的 90+ `11/2160 = 0.51%`、99 clamp `0/2160`、aggr threshold band `8/240 = 3.33%` 未被 production 改動影響
- R53 integration：PASS；16 項 closure 狀態未回退
- R39–R45：沿用既有可靠 evidence；本輪無 production source / coefficient diff，不重做昂貴 calibration sweep；R43 historical OOM / provenance warning 不當作新 regression
- CS historical：`cs23 28/28 PASS`
- progress / reward：`33/33 PASS`
- Q7a：`18/18 PASS`
- production build、syntax、`git diff --check`、`/review`：於 R54 收尾階段執行並記錄於 Sprint handoff

## 後續

Learning 不在 R54 處理，仍是唯一未完成核心項目。下一步可選：先開獨立 Learning lifecycle，或直接開始正式 CS roster / AI 隊伍；以本輪結果，建議先開始正式 roster / AI 隊伍，並把 AWP single-seed sensitivity 與 fixed-scenario CT side bias 留在後續完整 balance acceptance 觀察清單。
