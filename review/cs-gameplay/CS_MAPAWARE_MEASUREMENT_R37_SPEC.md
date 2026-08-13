# R37 CS Map Awareness Measurement / Calibration Readiness

## Scope

沿用 R18-B 選定的最小 read point：既有 pair admission 的 enemy distance、wall LOS、smoke LOS 與 visible candidate。這是 spatial context evidence，不宣稱完整 actor awareness。

## Measurement

`check_cs_mapaware_measurement_r37.mjs` 以 5 個 role、low/baseline/high `vis`、16 個固定 seed 做 240 個 memory-only arms，每 arm 重複一次（480 次），記錄 deterministic spatial read events。pair admission 只讀 distance/wall/smoke；目前 `vis` 的 live consumer 仍是 generic `combatSkill` 權重與既有 lurker role modifier，沒有 MapAware-specific observation-to-decision edge。

## Boundary

不新增 vision engine、rotation/utility AI、RNG 或 scenario。production source 只作 reversible Vite memory transform；MapAware calibration Deferred / No-Go，需另開 verifier-first gameplay Sprint 建立 actor-specific awareness action。
