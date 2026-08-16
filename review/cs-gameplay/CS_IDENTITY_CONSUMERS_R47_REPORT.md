# R47 CS Gameplay Identity Gap Sprint 報告

## 結論

R47 為三項 Gameplay Gap 各加入一個最小、可觀測、可驗證的 live consumer。三項均通過 low／baseline／high 的方向性 focused verifier，可進下一階段 measurement；仍不等同完整 tactical AI 或 balance calibration ready。

## 三項 production 行為

### 視野意識 `mapAware`

在既有 LOS、smoke、visible candidate 與 pair admission 上加入 actor-specific read window。可見候選只有在至少一方能讀到該空間資訊時進入 pair；實際開火 attacker 還必須是 aware actor。沒有新增 visibility scalar、LOS 系統或 RNG。

R47 focused totals（16 seeds × 3 levels）：

- low：visible opportunities `15130`、read `550`、immediate actions `109`、action rate `19.82%`、read limit max `48.16`
- baseline：visible opportunities `15422`、read `551`、immediate actions `107`、action rate `19.42%`、read limit max `50.96`
- high：visible opportunities `15427`、read `533`、immediate actions `107`、action rate `20.08%`、read limit max `53.76`

read limit 為 low < baseline < high；高值 immediate-action rate 高於 baseline。總 read/action volume 會受 target 存活 ticks 影響，因此 verifier 不把下游總量誤當成線性 calibration；Level 2／3 chain 成立。

### 應變力 `adaptability`

沿用既有 low-HP、近敵、`aggr < 0.82` retreat opportunity。effective `adp >= 80` 時不新增 pathfinding，而是把既有後撤改為現有 map waypoint 的 `ROTATE` route adjustment；低值保留原本 `撤退` 行為。

R47 focused totals：

- low：opportunities `134`、route adjustments `0`
- baseline：opportunities `373`、route adjustments `372`
- high：opportunities `373`、route adjustments `372`

Level 2／3 chain 成立；baseline 已接近 threshold 上方，因此 high 與 baseline 飽和，不把它誤報成線性 calibration evidence。

### 戰術理解 `tacticalIQ`

沿用既有 tactic/site/route assignment，只在 IGL route hook 讀 effective `tac`：`tac >= 90` 使用 tactic 直接 route，否則使用既有 role fallback route。沒有新增 tactic selection、AI 或 pathfinding。

R47 focused totals：

- low：IGL route assignments `165`、direct tactic actions `0`
- baseline：route assignments `166`、direct tactic actions `166`
- high：route assignments `166`、direct tactic actions `166`

Level 2／3 chain 成立；目前只覆蓋 IGL direct route，需後續 measurement 才能評估更廣泛 CT/T execution。

## Determinism / safety

- R47 verifier：PASS；suite digest `e3a90541390b52b254bd684496450909358218f630222efa1b3ba3ca56e636c1`
- MapAware evidence digest：`4fcfa0d52896c3b84b716eb5e87ef4422ba14093b20278ec829c2ec7beb26794`
- Adaptability evidence digest：`a493602a69475900841013f0b7c1af2600d95c9ae13c84b7ec667742ee968335`
- TacticalIQ evidence digest：`c3d38713cb85bf1b3d9591dd8ca3372dfbb61d9ed5e49b5f40e11666787088f8`
- production RNG call sites：`21`；新增 RNG：`0`
- 九項 R46 calibration：未修改；combat coefficients、fixed seeds、scenario、contracts、Store、賽事系統未修改
- off/on/repeated-on output、input digest、event digest 均 deterministic

## Existing evidence boundary

- R18-B spatial read-point：PASS，digest `8d3c5bcff1da3fe5fb5795be60d59626054170ff6e57787739d4ba629eacd377`；R47 在其之上補 actor read → engage。
- R38 identity classification：PASS，digest `ff5eb36206399eedbcfa124f6c5ac0f12cf9033e36d56d488436cbb4ca163508`；R47 將三項從 design-only candidate 推進為最小 consumer。
- R34／R35 historical verifier：各 512 simulations PASS；R34 digest `0d58819fb3cd79f0518c8e7925ae12758913a58c82707ffb1227f34c15b0ffdb`，R35 digest `9a8669ae4b23af24ebe4c7c3bfaeee883b28fcb343719ec5b15e03b6a3950215`。R47 historical adapter 只把 current source 回看 byte-exact R43／R32 evidence，未 rebaseline 歷史 calibration。

## Verdict

**R47：Go。** 三項都有 production consumer，可進下一階段 focused measurement；三項完整 balance calibration 仍 Deferred，須等待更廣 coverage、role interaction 與 threshold／path amplification evidence。
