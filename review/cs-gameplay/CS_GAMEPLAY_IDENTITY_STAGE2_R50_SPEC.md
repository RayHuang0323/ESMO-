# R50 CS Gameplay Identity 第二階段規格

## 範圍

本輪只處理既有 R47–R49 consumer 的第二層延伸：應變力、戰術理解、溝通。每項最多一個 consumer，沿用既有 simulator route、site、bomb、teammate context；不新增 RNG、scenario、tactical AI、pathfinding、team engine、賽季／賽事系統，也不改九項成熟 calibration 或 Learning lifecycle。

## Production consumer

- 應變力：炸彈安裝後，存活 T 方非 carrier 在既有壓力狀態下，若有效 `adp` 通過既有 `ADAPT_ROUTE_THRESHOLD`，以既有 `c4pos` route 重新調整到包點；不新增 waypoint 系統。
- 戰術理解：炸彈安裝後，CT 以既有 `tacticCT.routes` 的 staging waypoint 加上 `c4pos` 建立回防 route；沿用既有 `TACTICAL_EXECUTION_THRESHOLD`，不只依賴 IGL direct route。
- 溝通：炸彈安裝後，既有 T team context 中的高 `com` teammate 接收包點資訊，立即寫入既有 route、aim、`ROTATE` state；不建立 callout system。

## Measurement

Verifier：`tools/check_cs_gameplay_identity_r50.mjs --item=adaptability|tactical|comms`，每次只執行一項。

- 固定 `inferno / t_aexec / c_std`、16 fixed seeds、low / baseline / high。
- Level 2 記錄 bomb/pressure opportunity；Level 3 記錄 route / immediate handoff action；Level 4 match result 僅 secondary。
- 檢查 direct/effective monotonicity、effect size、threshold/clamp、role attribution、input immutability、off/on/repeated-on deterministic digest、RNG token count。
- coverage 不足時 verifier 保留明確 coverage marker，結論為 `Measurement Ready / Deferred`，不以零 evidence 宣告 calibration ready。

## Historical boundary

`tools/cs_r15_legacy_source.mjs` 的 R50 adapter 會在 R34/R35/R36/R47/R49 historical chain 中移除本輪三個 consumer，保留既有 byte-exact evidence，不 rebaseline 舊 Sprint。
