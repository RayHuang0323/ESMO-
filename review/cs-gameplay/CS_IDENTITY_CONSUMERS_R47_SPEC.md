# R47 CS Gameplay Identity Gap Sprint 規格

## Scope

只處理三項 Gameplay Gap：

- `mapAware`／視野意識
- `adaptability`／應變力
- `tacticalIQ`／戰術理解

每項只接一個既有 simulator hook；不改九項 R46 calibration、不新增 RNG、不改 fixed seeds／scenario、不建立 tactical AI、pathfinding、communication 或賽事系統。

## Minimal consumers

| stat | existing hook | minimal live consumer | Level 2 opportunity | Level 3 immediate action |
|---|---|---|---|---|
| `mapAware` | LOS／smoke／visible candidate／pair admission | 既有可見候選 pair 先經 actor `vis` read window；只有 aware attacker 可完成該 pair 的 immediate engage | visible candidate + actor read | aware attacker 進入既有 fire path |
| `adaptability` | low-HP + nearby enemy retreat branch | high effective `adp` 將既有 retreat 改為既有 waypoint route adjustment | low HP、近敵、既有 retreat eligibility | `ROTATE` route adjustment；low band 保留原 `撤退` |
| `tacticalIQ` | tactic/site/route assignment | IGL 的 effective `tac` 達 threshold 才使用 tactic 直接 route；否則走既有 role fallback route | IGL route assignment | 直接執行 tactic route |

## Frozen verification boundary

- scenario：`inferno / t_aexec / c_std`
- seeds：沿用 R18／R34／R35 的 16 fixed seeds
- treatment：`vis`／`adp` 使用 low/base/high ±10；`tac` 使用 82/90/98，避開 99 clamp
- verifier：`tools/check_cs_identity_consumers_r47.mjs`
- instrumentation：memory-only；off/on/repeated-on simulation 必須 byte-equivalent
- RNG：production `rand()` call sites 維持 21
- historical R18／R34／R35／R38 evidence 保留為 provenance；R47 只新增 live consumer evidence

## Readiness boundary

R47 只證明最小 consumer 的 stat → opportunity → immediate action chain。三項可進下一階段 focused measurement，但尚不足以宣稱完整 identity 或直接進 balance calibration：MapAware 只覆蓋 visible pair，Adaptability 只覆蓋 low-HP retreat route，TacticalIQ 只覆蓋 IGL direct route。
