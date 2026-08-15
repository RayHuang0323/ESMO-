# R46 CS 已成熟素質整合＋第一版能力分布基準報告

## 結論

R46 將九項已成熟 CS 素質接入既有 `genProspects()` producer，建立第一版五 role distribution baseline。只改新秀生成的 stat profile 與共用 MOBA→FPS role map；沒有重寫 player generation、沒有改初始既有選手、沒有改 battle balance。

## 九項正式 calibration 基準

| 正式 key | source 中文名 | stable range | pilot range | clamp / threshold | role / identity 限制 | 狀態 |
|---|---|---|---|---|---|---|
| `reflex` | 反應速度 | 60–90 | 60–90 | 90–100 effective clamp | AWP direct scaling 較低；主要是 combat/mechanics，不是完整命中反應模型 | Ready |
| `accuracy` | 精準度 | 60–90 | 60–90 | 90–100 high-end clamp | Entry/Rifler/AWP 有 raw role-fit；無 miss/recoil/spread | Ready |
| `apm` | 操作速度 | 70–90 | 60–90 | Lurker/IGL 90–100 可能跨 `aggr < 0.82` | Entry 有既有雙 exposure；AWP combat scaling 較低 | Ready |
| `positioning` | 走位 | 60–90 | 60–90 | Lurker 90–100 threshold；高端 clamp | Rifler/AWP/Lurker 有 role-fit；尚非 cover/LOS/reposition identity | Ready-Limited |
| `decision` | 決策力 | 60–90 | 60–90 | high-end clamp；CT defuse opportunity sparse | Lurker/IGL 有 raw role-fit；無 target/route/utility/tactic consumer | Ready-Limited |
| `courage` | 勇氣 | 60–80 | 60–80；80–90 threshold-aware | Lurker/IGL 80–90 crossing；Entry 高端 clamp | 主要是 aggr；AWP 非直接 sniper combat bonus | Ready |
| `clutch` | 抗壓（CS legacy `str`） | 60–80 | 60–80；80–90 threshold-aware | 80–90 shared retreat threshold；90–100 clamp | lastAlive ownership 保留；不可與 Resilience 合併 | Ready-Limited |
| `focus` | 專注力 | 60–90 | 60–90 | 90–100 effective clamp | Rifler/AWP raw role-fit，AWP holding 高；CT defuse sparse | Ready-Limited |
| `resilience` | 韌性 | 60–90 | 60–90 low-HP local pilot | high-end clamp；無 stat-specific aggr crossing | 只保留 low-HP stability，沒有廣義 pressure state | Ready-Limited |

上述名稱直接取自 `STAT_DEF`；`clutch` → engine `str` 只是 adapter mapping。

## 第一版五 role profile

R46 profile 以 existing `potential/current` 作總體基線，role bias 作差異，profile cap 控制高端。Verifier 使用 6 seeds、240 名新秀計算 local means：

| CS role | 主要強項 | 刻意弱項 / 限制 | 九項平均觀測範圍 |
|---|---|---|---:|
| Entry／突破手 | Courage、Reflex、APM | Focus、Decision、Resilience；Clutch 不做高端疊加 | 53.02–61.45 |
| Rifler／步槍手 | Accuracy、Reflex、Positioning、Focus | 保持均衡，不讓單一 stat 過度拉開 | 55.89–59.49 |
| AWP／狙擊手 | Accuracy、Focus、Positioning | APM、Courage 壓低；保留 sniper weapon 差異 | 55.45–65.63 |
| Lurker／游走手 | Decision、Positioning、Clutch | Courage 壓低；避免大量跨 retreat threshold | 51.98–58.08 |
| IGL／指揮 | Decision、Resilience、Focus | Accuracy、APM、Courage 壓低，不生成純槍男 | 55.26–64.70 |

這是新秀初始能力分布，不是成熟明星 roster 的最終值；低於 60 的值仍可自然存在，成長受既有 potential/training 規則限制。

## Distribution safety

- 90+：`11/2160 = 0.51%`，不是常態。
- 99 clamp：`0/2160`；profile cap 先阻止新秀普遍落入 clamp，明星仍可透過 potential/training 進入高端但不大量生成。
- `aggr` threshold band `[0.80, 0.84]`：`8/240 = 3.33%`；沿用 production `ROLE_AGGR` 與 `aggr` 公式計算，沒有另造 battle rule。
- 所有成熟 stat 為 deterministic integer、`1..99`，並受 prospect `potential` 上限保護。

## Verification / review

- R46 focused distribution verifier：PASS；digest `a78dc5879b929fbff62d18fb215780d8f67ed81dda20dd752de8b022626aa82f`。
- Existing recruitment gate：`check_recruit_o.mjs` 40/40 PASS；既有 progress/reward flat gate 33/33 PASS。
- Historical/safety gates：Q4 68/68、Q5 66/66、Q6 57/57、Q7a 18/18、CS adapter 28/28 PASS；production build PASS。
- Aggregate `verify.mjs --only=cs_distribution_baseline_r46` 曾在 child 啟動前因既有 `tools/.verify-state.json` 寫入 EPERM 中止，未視為通過；已用同一 focused child 直接執行及既有分段 gates 完整驗證，沒有降低 assertion 或跳過失敗項。
- R39–R45 大型 sweep 不重跑；既有 evidence 僅作 baseline source。
- production source change：`playerModel.js` profile/mapping、`recruitPool.js` mature stat producer、`fpsRoster.js` 使用同一 role map；battle formula/RNG/scenario 不變。
- Gameplay-gap 素質不納入新 profile balance；若要補完整 identity，另開 Gameplay Gap Sprint。

**R46 verdict：Go（第一版 distribution baseline 可進 production 新秀生成）；Ready 項目仍受各自 clamp/threshold/identity caveat 限制，不等同最終 balance Done。**
