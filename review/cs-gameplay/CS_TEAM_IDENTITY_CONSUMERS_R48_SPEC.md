# R48 CS Team Gameplay Identity Sprint：Comms × Leadership × Synergy

## 目標與邊界

R48 只處理三項 team gameplay identity：溝通（`com`）、領導力（`led`）、配合度（`coo`）。每項只接一個最小 production consumer，沿用既有 FPS simulator 的 contact、tactic route、visible trade、teammate 與 support context。

本輪不做 calibration、不新增 RNG、不改 fixed seeds 或 scenario、不改九項正式 calibration、不碰 MapAware / Adaptability / TacticalIQ balance、不碰賽季／賽事，也不建立 command AI、callout system 或 coordination engine。Learning 維持 lifecycle-only。

## Consumer 定義

### 溝通（Comms）

- gate：`COMMS_HANDOFF_THRESHOLD = 88`。
- opportunity：既有 visible enemy contact / teammate contact hook。
- action：高 `com` 的 spotter 將資訊交給附近同隊玩家，優先 support；receiver 立即取得既有 enemy route 與 aim direction。
- 可觀測鏈：`com` → visible contact + receiver context → shared-awareness route/aim handoff。

### 領導力（Leadership）

- gate：`LEADERSHIP_EXECUTION_THRESHOLD = 90`。
- opportunity：既有 IGL、tactic、site/route assignment。
- action：高 `led` 的存活 IGL，使同隊非 IGL 成員沿用該 tactic 的既有 IGL route，形成 route execution consistency；不新增 command decision 或 route engine。
- 可觀測鏈：`led` → IGL tactic route → teammate route consistency。

### 配合度（Synergy）

- gate：`SYNERGY_TRADE_THRESHOLD = 90`。
- opportunity：既有 visible enemy trade opportunity、近距 teammate pair、support context 與 LOS。
- action：攻擊者與 partner 的 effective `coo` 達標時，partner 立即對同一 enemy aim、進入既有 `ENGAGE`、啟用既有 shooting path；不重複造成傷害、不新增 RNG。
- 可觀測鏈：`coo` → visible trade partner → immediate aim/engage response。

## 驗證矩陣

- scenario：`inferno / t_aexec / c_std`。
- seeds：沿用既有 16 fixed seeds。
- treatment：每項 target 只改該正式 key 的 `90 ± 8`，即 `82 / 90 / 98`；其他 roster 欄位保持 byte-equivalent。
- levels：驗證 low / baseline / high、Level 2 opportunity、Level 3 immediate action、16 seeds、repeated deterministic digest、input immutability、21 個既有 `rand()` call sites。
- roles：Comms 覆蓋 support receiver；Leadership 覆蓋 IGL 以外的同隊角色；Synergy 覆蓋實際 partner role。
- verifier：`tools/check_cs_team_identity_consumers_r48.mjs`，只做 memory-only Vite instrumentation，不改寫 production。

## 歷史 evidence 邊界

R16-A、R36、R38、R47 的原始 verdict、fixed seeds、digest 與 semantic boundary 均保留；R48 以新的 focused verifier 證明三項現行 team consumer，不對舊報告 rebaseline。舊 R36 的 byte-exact historical view 透過 `tools/cs_r15_legacy_source.mjs` adapter 提供。
