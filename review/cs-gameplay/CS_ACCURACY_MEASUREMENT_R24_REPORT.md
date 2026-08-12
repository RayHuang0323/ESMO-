# R24 CS Accuracy Measurement / Calibration Readiness 報告

日期：2026-08-12
Verifier：`tools/check_cs_accuracy_measurement_r24.mjs`
結論：**Accuracy measurement = Go；Accuracy calibration = Revise / Deferred**

## 1. 白話結論

這次確認了 Accuracy 確實會影響遊戲中的對槍強度：它會改變 live combat 的戰鬥評分，也會影響爆頭機率與每發子彈造成的有效傷害。不同角色受到的影響不同：rifler、entry、awp 的 role-fit 計算會直接讀 raw Accuracy；lurker、igl 不會在 `posSkill()` 讀 Accuracy，但五種角色仍會在 live `combatSkill()` 讀 personality 修正後的 effective Accuracy。

不過目前還不能安全開始 Accuracy calibration。原因不是「Accuracy 完全沒作用」，而是 production 同時存在兩個語意：combatSkill 使用 effective Accuracy，headshot 公式仍使用 raw Accuracy。這個邊界尚未決定前，任何 balance 調整都可能把兩條不同意思的數值一起改變。

另外，現行系統沒有獨立的 firearm miss 分支：只要 pair 被接納，就會套用 firearm damage。因此本輪的 hit rate 是結構性的 100%，不是 Accuracy 已經完成命中率控制的證據。

## 2. 實際 read-chain

| 位置 | 實際行為 | 產品意義 |
|---|---|---|
| `stats.acc` | 原始 Accuracy | 選手能力輸入 |
| `persStat(acc)` | personality 修正後 clamp 到 1～99 | live combat 的 effective Accuracy |
| `posSkill()` | 使用 raw stats 的 role-fit 計算 | 只有 rifler / entry / awp 有 Accuracy 權重 |
| `combatSkill()` | mechanics / weapon fit 使用 effective Accuracy | 五種角色都可能影響 live 對槍表現 |
| headshot roll | 使用 raw `at.stats.acc` | 與 combatSkill 的 effective 語意不一致 |
| `aggr()`、fireChance、retreat | 沒有直接讀 Accuracy | Accuracy 不直接觸發 `aggr < 0.82` threshold |

## 3. 5 角色 low / baseline / high 結果

以下格式均為 low / baseline / high；數值是目標選手作為 attacker 的觀測，與 defender-side 數值分開。

| 角色（personality） | raw Accuracy | effective Accuracy | fire opportunity | pair admitted | attacker shots | hit rate | headshot rate | effective damage / shot |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| entry（aggressive） | 62 / 72 / 82 | 62 / 72 / 82 | 701 / 773 / 784 | 327 / 359 / 372 | 130 / 168 / 178 | 1 / 1 / 1 | 0.4769 / 0.4524 / 0.4607 | 57.4077 / 54.1071 / 55.6910 |
| rifler（genius） | 78 / 88 / 98 | 78 / 88 / 98 | 1001 / 1224 / 1250 | 467 / 584 / 581 | 214 / 306 / 314 | 1 / 1 / 1 | 0.4533 / 0.5065 / 0.5637 | 57.4252 / 58.5098 / 59.0096 |
| awp（calm） | 76 / 86 / 96 | 76 / 86 / 96 | 489 / 502 / 488 | 249 / 253 / 253 | 99 / 113 / 123 | 1 / 1 / 1 | 0.3636 / 0.3894 / 0.4309 | 71.5051 / 69.9469 / 73.4309 |
| lurker（lonewolf） | 68 / 78 / 88 | 68 / 78 / 88 | 803 / 818 / 791 | 405 / 404 / 386 | 231 / 225 / 231 | 1 / 1 / 1 | 0.4416 / 0.4222 / 0.5368 | 57.6190 / 56.1200 / 58.0346 |
| igl（shotcaller） | 63 / 73 / 83 | 59 / 69 / 79 | 1000 / 978 / 1093 | 429 / 419 / 489 | 153 / 152 / 214 | 1 / 1 / 1 | 0.4510 / 0.4276 / 0.5421 | 54.1765 / 54.8684 / 56.2430 |

IGL 的 effective Accuracy 比 raw 少 4，因為 `shotcaller` personality 對 Accuracy 有 -4 修正；這是目前語意的一部分，不是 verifier 重新計算的替代值。

### 直接 consumer 的 strict-majority

16 seeds 中必須超過 8 才算通過：

| 角色 | combatSkill mean | headshot chance mean | raw role-fit Accuracy |
|---|---:|---:|---:|
| entry | 16/16 | 15/16 | 16/16 |
| rifler | 16/16 | 12/16 | 16/16 |
| awp | 15/16 | 13/16 | 16/16 |
| lurker | 16/16 | 14/16 | 不適用 |
| igl | 16/16 | 15/16 | 不適用 |

這表示 direct consumer 的公式方向大致正確，但實際 headshot chance 的跨 seed 平均仍會受當回合拿到的武器與對槍機會影響，不能直接當作最終 balance signal。

## 4. Target-only KPI 與 effect size

### Target attacker-side KPI

| 角色 | firearm kills | firearm effective damage |
|---|---:|---:|
| entry | 61 / 92 / 95 | 7463 / 9090 / 9913 |
| rifler | 95 / 149 / 168 | 12289 / 17904 / 18529 |
| awp | 57 / 67 / 76 | 7079 / 7904 / 9032 |
| lurker | 111 / 109 / 122 | 13310 / 12627 / 13406 |
| igl | 73 / 74 / 112 | 8289 / 8340 / 12036 |

這些擊殺與傷害只計目標玩家作為 firearm attacker 的事件；defender-side damage/deaths/survival 另行記錄，對手全隊數值只作 spillover observation。

### Paired effect size

effect size 是同一 seed 的 low / baseline 或 high / baseline 差異，再除以差異的樣本波動；它用來表示訊號相對穩定程度，不是 balance 倍率。

| 角色 | effective damage / shot：low→base；base→high | headshot rate：low→base；base→high |
|---|---:|---:|
| entry | +2.6411（0.3144）；+1.6748（0.3123） | +0.0169（0.0999）；+0.0179（0.1457） |
| rifler | -0.9022（-0.1075）；+0.9628（0.1266） | -0.0650（-0.3836）；+0.0606（0.5042） |
| awp | +0.8228（0.0439）；+2.9469（0.3148） | +0.0004（0.0023）；+0.0517（0.3865） |
| lurker | +1.3526（0.3699）；+1.6988（0.3763） | +0.0175（0.1488）；+0.1116（0.8254） |
| igl | -0.8426（-0.1595）；+0.1759（0.0264） | +0.0101（0.1337）；+0.0872（0.5145） |

Rifler、lurker、igl 的部分 low→baseline 結果並不穩定；這支持「先完成 semantic correction，再談 calibration」的結論。

## 5. Clamp、threshold 與 deterministic path amplification

- treatment 的 raw 範圍都在 clamp 外，五角色 low / baseline / high 的 runtime clamp reads 均為 `0 / 0 / 0`，沒有觀察到 saturation plateau。
- `aggr()` 沒有 Accuracy read；五角色的 Accuracy treatment 都沒有直接穿越 `aggr < 0.82` threshold，threshold crossing 為 `0/16`。
- low/high 相對 baseline 的完整 simulator digest 在五個角色均為 `16/16` changed，代表 deterministic gameplay path 會改變。
- target-only KPI digest 的 changed seeds：entry `11/16、8/16`，rifler `15/16、12/16`，awp `7/16、5/16`，lurker `9/16、11/16`，igl `8/16、11/16`（依序為 low/high）。
- 這些 path 變化來自對槍結果、存活與後續事件的連鎖，不代表 Accuracy 直接控制 pair admission 或 retreat threshold。

## 6. Findings

### Blocking（阻擋 calibration，不阻擋 measurement）

1. raw/effective semantic boundary 尚未一致：`combatSkill()` 使用 effective Accuracy，但 headshot formula 使用 raw Accuracy。若直接調 balance，無法清楚說明調整的是哪一種產品語意。
2. 現行 firearm 沒有獨立 miss 分支，因此 hit rate 不是可用的 Accuracy primary KPI；未來若要把 Accuracy 定義成命中率，需另開產品語意與 gameplay scope，本輪不處理。

### Non-blocking

1. Accuracy 對 combatSkill、headshot chance 與 firearm effective damage 有真實 local effect。
2. role-fit 只對 rifler / entry / awp 讀 raw Accuracy；lurker / igl 的 Accuracy 作用主要來自 live combat consumer。
3. downstream path amplification 仍存在，因此 kills、總 damage、survival 只能保留為 secondary observation。
4. 本輪 verifier、文件、aggregate gate 與 historical gate 沒有發現 production diff、RNG 變更、scenario 變更或 historical rebaseline。

## 7. 最終判定

- Accuracy measurement：**Go**。
- Accuracy semantic：**Revise**；需先決定 raw headshot 與 effective combat 的產品邊界。
- Accuracy calibration readiness：**No-Go / Deferred**。
- 本輪不提出 production balance patch。

## 8. 驗證結果

- focused deterministic sweep：PASS，528 次 simulator execution。
- repeated run：PASS，兩次 suite digest 均為 `3c6d1625a06684b91b3b99424cdfb4c79c963f17da82411b825264d0f77eaf05`。
- source SHA：`57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29`。
- RNG call sites：21，未增加。
- aggregate gate：PASS（R24 focused segment）。
- historical checkpoint gate：PASS，R17、R20、R21、R22、R23 與 R24 共 6/6 通過；未 rebaseline historical evidence。
- production build：PASS。
- `/review`：無 blocking verifier / production diff 問題；修正了 R24 verifier 的 event-level effective damage attribution 與 aggregated aggr probe 內容後重跑通過。剩餘為 calibration semantic boundary 與 downstream path amplification 的 non-blocking readiness risk。
