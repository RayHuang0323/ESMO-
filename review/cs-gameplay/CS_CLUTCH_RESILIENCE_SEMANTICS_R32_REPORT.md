# R32 CS「殘局能力 × 韌性／抗壓」語意邊界審查報告

日期：2026-08-13

## 結論

- focused semantic/read-chain audit：Go / PASS
- production semantic correction：Revise（本輪不實作）
- Resilience pressure / low-HP extension：應另開 Sprint
- balance calibration：No-Go

## 1. 兩項現在實際控制什麼

### Clutch（目前以 `stats.str` 實作）

- raw：`stats.str`。
- effective：`persStat(p,"str")`，接受 personality adjustment 並 clamp 到 1–99。
- role-fit：`posSkill()` 的 entry / rifler / awp / lurker profile 都有 `str`；IGL profile 沒有。
- combatSkill：`str` 在 mechanics；lastAlive 另外加 `(effective str - 76) * 0.22`；low HP 另有 `str` modifier。
- aggr / fire / retreat：`aggr()` 使用 effective `str * 0.22`，影響 fire chance 與 `aggr < 0.82` retreat gate。
- defuse / utility / target / tactic / buy：沒有直接 Clutch read。aggr 只影響交火意願與撤退路徑，不是 target-choice AI。

### Resilience（目前以 `stats.res` 實作）

- raw：`stats.res`。
- effective：`persStat(p,"res")`；目前只有 lastAlive `combatSkill` 分支讀取。
- role-fit：五個目標 role 的 Resilience 權重都是 0。
- combatSkill：只在 lastAlive 加 `(effective res - 76) * 0.12`。
- low HP：沒有 Resilience read；目前 low-HP modifier 只使用 Clutch 的 `str`。
- aggr / fire / retreat：沒有 Resilience read。
- defuse / utility / target / tactic / buy：都沒有 Resilience read。

## 2. 重疊在哪裡

真正的重疊不是資料或 RNG 重複，而是兩個相似語意的 bonus 同時寫入同一個 lastAlive combat formula：

```text
lastAlive bonus = (effective Clutch - 76) × 0.22
                 + (effective Resilience - 76) × 0.12
```

Clutch 的責任面其實更廣：一般 mechanics、role-fit、low HP 與 aggr 都讀它；Resilience 目前只在 lastAlive 出現。因此目前比較像「Clutch 主責殘局主動表現，Resilience 以第二個殘局 cofactor 重複加成」，而不是兩個完整獨立系統。

`formMul()` 會受 morale / condition 影響最終輸出，但不改兩項 effective stat；這是共同 state multiplier，不應誤稱為 Resilience pressure consumer。

## 3. 最推薦的產品語意邊界

推薦 **Model A**：

- **Clutch**：保留 1vN / lastAlive 情境的主要主動勝負與局部轉換 ownership。它可以涵蓋「敢不敢打、能不能把殘局打贏」的現有 combat / aggr 路徑。
- **Resilience**：定義為壓力、低血量、逆風狀態下「維持穩定執行」的能力，而不是第二個 Clutch 勝負 bonus。它應在產品上負責穩定性／抗崩，但目前 production 尚未有對應 pressure / low-HP consumer。
- **共同原則**：避免把兩個高度相似的 bonus 直接疊在同一個 lastAlive 公式；若要保留同一情境共存，必須先明確說明一個是主動轉換、一個是穩定性，並有不同 observable consumer。

Model B（兩者都在 lastAlive）只有在能把 Resilience 改成可觀察且不同的穩定執行 consumer 時才成立；就現有 read-chain，證據不足以支持 Model B。

## 4. 是否需要 production semantic correction

需要提出，但本輪不直接改。最小方向不是調係數，而是先停止把兩個相似 bonus 當成無條件同一層疊加：下一個 semantic correction Sprint 應在不新增 RNG、不改 role mapping 的前提下，定義 lastAlive active conversion 與 stability consumer 的 ownership，再由 verifier 驗證。

這不是「把 Resilience 改名」即可解決；若沒有正式 pressure / low-HP consumer，直接把現有 `res` 從公式刪掉或搬家也會改變 live combat 語意，不能在本輪猜測。

## 5. 是否另開 pressure / low-HP gameplay Sprint

是。讓 Resilience 真正影響 low HP、pressure、逆風或 sustained execution，會新增 production gameplay branch／consumer，可能改變 combatSkill、damage、kill、survival、round path 與 historical digest。即使不新增 RNG，也屬新的 gameplay semantic，應另開 verifier-first Sprint，明確定義：pressure state、觸發條件、consumer、是否與 `formMul` 疊加，以及舊 digest／contract 的 migration policy。

本輪不實作、不補假 consumer、不用 balance 調參替代語意設計。

## 驗證 / provenance

- verifier：`tools/check_cs_clutch_resilience_semantics_r32.mjs`
- audit schema：`CsClutchResilienceSemanticAudit.v1`
- audit digest：`5d0bca552118364c96e893ea184eb77ad6230cad1ae59d501bdc44c2f6f50c45`
- R30 suite digest：`56dea7e81163275ab7d6ca43a287d804dfeccb37d0eea10fb855a93c40e33a3c`
- R31 suite digest：`fd43e879354d70de15d208d04e6f0b7d6a2f78c6204adfb197cc71caa882fd9a`
- production source SHA-256：`f0e5dd4bddc82d06ae715784201877821de0db4fc785d226ab403132bb984e87`
- RNG call sites：21；production source changed：no

## Review

- Blocking findings：無。source SHA、consumer presence/absence、role-fit scope、RNG count、R30/R31 provenance 與 audit digest 均鎖定。
- Non-blocking finding：目前 lastAlive 仍同時疊加兩個相似語意 bonus；這是產品責任邊界風險，不是本輪可安全自行猜測的修正。
- 已執行 focused R32 verifier、R30/R31 measurement、R4、R17/R22、R24/R26/R28、Q4/Q5/Q6、Q7a、progress25 與 production build；本次 aggregate 15/15 PASS。
- `/review` 結論：文件與 verifier 變更可接受；沒有 production diff，未開始 pressure/low-HP gameplay。

## 最終判定

**Go（audit evidence）／Revise（semantic boundary）／No-Go（balance calibration）**。pressure / low-HP extension 不屬本輪小修，應另開 Sprint。
