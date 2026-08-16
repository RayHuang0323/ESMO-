# CS Roster v1 R56 Spec

日期：2026-08-16

## 目標

建立第一版正式 CS AI team content，直接使用既有 16 項 `STAT_DEF`、R46 role distribution 語意、player identity 與 `toFpsRoster()` adapter。

本輪新增的是集中式 `src/data/csAiTeams.js`；既有 `src/platform/competition/aiTeams.js` 保持 MOBA／聯賽用途，不改賽季／賽事系統。

## Role 規則

Role 是選手的 gameplay identity / tactical usage，不是固定 roster slot constraint。

- 每隊只需要五名實際選手映射到既有 `f1–f5` battle seats。
- role 可以重複，也可以缺少某個 role。
- `1 IGL + 4 Entry` 等自由組合合法；AI team 同樣適用。
- battle adapter 讀取 player 的 `csRole` / direct CS role，沒有新增第二套 role system。

R56 內容組合示例：

| Team | Style | Role composition |
| --- | --- | --- |
| Shadow Wolves | 高進攻 | Entry / Entry / Rifler / Lurker / IGL |
| Emerald Dragons | 戰術型 | Entry / Rifler / AWP / Lurker / IGL |
| Flame Phoenix | AWP 核心 | Entry / Rifler / AWP / AWP / IGL |
| Thunder Bears | 高協同 | Entry / Rifler / Rifler / Lurker / IGL |
| Silver Eagles | 高穩定 | Entry / Rifler / Rifler / AWP / IGL |
| Neon Comets | 高潛力新秀 | Entry / Entry / Rifler / AWP / IGL |
| Ice Guard | 防守／韌性型 | Rifler / AWP / Lurker / Lurker / IGL |
| Iron Vanguard | 頂級強隊 | Entry / Rifler / Rifler / AWP / IGL |

## Data boundary

- 8 支 AI teams、40 名正式選手，所有 team/player id deterministic 且 unique。
- 每名選手完整 16 項 stat、potential、personality、Learning、`rosterTier: active` 與 read-only 標記。
- 主要能力落在 60–90；90+ 稀有；不產生 99 clamp；不加入 runtime RNG。
- style 透過 role composition、team bias 與既有 stat identity 形成，不另造 balance coefficient 或 progression engine。
