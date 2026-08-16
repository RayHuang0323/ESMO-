# R32 CS「殘局能力 × 韌性／抗壓」語意邊界審查規格

日期：2026-08-13

## 範圍

本 Sprint 只審查 CS `Clutch` 與 `Resilience` 的 production read-chain 與產品責任，不做 balance calibration，不修改其他 14 項素質，不新增 RNG、不改 scenario、不 rebaseline historical evidence，也不碰 SeasonState、Circuit、Event 或 competition 系統。

production source 必須維持 R31 SHA-256 `f0e5dd4bddc82d06ae715784201877821de0db4fc785d226ab403132bb984e87`，`rand()` call sites 必須維持 21。

## 審查問題

1. 對照兩項的 raw stat、effective stat、role-fit、combatSkill、lastAlive、low HP、aggr/fire/retreat、defuse/utility/target/tactic/buy consumers。
2. 確認兩者是否只是同一個公式的兩個名字，或存在可分辨的責任。
3. 分辨「現有 consumer 的證據」與「未來 pressure / low-HP gameplay 的產品提案」。
4. 比較產品模型：
   - Model A：Clutch = 1vN / lastAlive 的主動勝負能力；Resilience = 壓力、低血量、逆風下的穩定執行能力。
   - Model B：兩者都保留 lastAlive，但必須有不同且可驗證的 consumer。

## 現況 boundary（待 verifier 鎖定）

- Clutch 對應 legacy `stats.str`：raw role-fit（entry/rifler/awp/lurker profile）、effective mechanics、lastAlive `(str - 76) * 0.22`、low-HP modifier、`aggr`，進而影響 fire chance 與 retreat gate。
- Resilience 對應 `stats.res`：raw/effective 只在 lastAlive `combatSkill` 讀取 `(res - 76) * 0.12`；沒有 role-fit、low HP、aggr/retreat、defuse、utility、target/tactic/buy consumer。
- 兩者在同一 lastAlive 公式相加，存在「同一殘局表現被兩個相似 bonus 同時獎勵」的 semantic overlap；不是 duplicate raw field，也不是 duplicate RNG。
- `formMul` 的 morale / condition 是共同的 final-output state multiplier，不等於任何一項的 state-adjusted read。

## 驗證邊界

R32 verifier 應為 read-only static source audit，鎖定 source SHA、RNG count、consumer presence/absence、role-fit weights、R30/R31 suite provenance 與 deterministic audit digest。任何 pressure / low-HP extension 都只可列為另案 gameplay Sprint，不得在本 Sprint 偷渡 production patch。
