# ESMO 英雄／戰鬥數值資料盤點

> 本文件僅為分析，未修改任何程式。掃描對象為 Phase 4 抽離後的 `src/EsportsGame.jsx`、`src/App.jsx`、`src/LogicEngine.js` 與 `src/battle/fps/EsportsFPS3D.jsx`。

---

## 1. 所有 Hero / 戰鬥相關資料清單

| # | 名稱 | 位置 | 結構 | 綁定對象 | 含戰鬥數值？ |
|---|------|------|------|----------|--------------|
| 1 | `CHAMPIONS_100` | EsportsGame.jsx L17 | `{id, en, zh, title, arch, lane(中文), color, diff(1–3), P/Q/W/E/R}` ×100 | 英雄（靜態） | ❌ 只有定位標籤 |
| 2 | `HERO_IMG` | EsportsGame.jsx L18 | `{英雄id: base64 jpeg}` | 英雄（外觀） | ❌ 純圖片 |
| 3 | `INITIAL_ROSTER` | EsportsGame.jsx L404 | 選手物件，含 `champId`(→CHAMPIONS)、`personality`、`stats{16維}` | **選手**（非英雄） | ✅ 16 維能力值 |
| 4 | `STAT_DEF` / `STAT_L2S` | EsportsGame.jsx L119/144 | 16 維能力定義與長短鍵映射 | 選手能力 schema | — |
| 5 | `MOBA_WEIGHTS` / `FPS_WEIGHTS` | EsportsGame.jsx L140/141 | 16 維權重（兩套） | 戰力公式權重 | ✅ 權重 |
| 6 | `PERSONALITY` | EsportsGame.jsx | 性格 `boost`/`nerf` 修正 | 選手個性 | ✅ 修正值 |
| 7 | `calcPower(p,mode)` / `myTeamPower` | EsportsGame.jsx L360/580 | 16維 × 權重 × 性格 × 士氣狀態 → 綜合戰力數字 | **選手**（平台配對用） | ✅ 聚合戰力 |
| 8 | `POSITION_PROFILE` | EsportsGame.jsx L370 | 各位置能力側重 | 位置定位 | ✅ |
| 9 | LogicEngine 寫死 `power`/`tough` | App.jsx 內聯 / LogicEngine.js | `tough=[1.6,1.15,0.9,0.8,1.25]`、`power=[30,34,36,42,18]`（依 role index） | **角色定位**（非英雄、非選手） | ✅ MOBA 實際生效 |
| 10 | FPS 戰鬥模型 `POS_PROFILE`/`posSkill`/`combatSkill`/`simulateFps` | **EsportsFPS3D.jsx**（Phase 4 已搬離平台） | 消費選手 stats → FPS 實戰輸出 | FPS 引擎專用 | ✅ 完整戰鬥公式 |

**關鍵觀察：** 「戰鬥數值」確實已存在，但分散在三個層次，且**沒有一處直接綁在英雄身上**——
- 英雄（CHAMPIONS_100）只有 `arch`/`lane`/`diff` 定位標籤，無數值；
- 選手（roster）有 16 維 stats，屬「人」不屬「英雄」；
- LogicEngine 有 role-based `power`/`tough`，屬「角色定位」寫死值，也不綁英雄。

---

## 2. 已接入 LogicEngine（MOBA 戰鬥引擎）

- **英雄身份**：Phase 9/10 已建 `buildEngineSlots → applyRoster` 注入口。Draft picks 的英雄身份（`id/zh/arch/lane/diff/color`）＋選手 `playerName` 已流入我方 blue player 的 `.champion` / `.playerName`。
- **角色戰鬥數值**：LogicEngine 建構子寫死的 role-based `power`/`tough`，MOBA 對戰實際使用中。
- 資料流 `BattleConfig → App.jsx → LogicEngine` 已全線貫通（`applyRosterToEngine` 現回報 `applied:true`）。

## 3. 尚未接入 LogicEngine

- **CHAMPIONS_100 的戰鬥數值** — 因為根本不存在（只有 arch/lane/diff）。
- **選手 16 維 stats → MOBA 戰力** — 未映射進 LogicEngine。目前 stats 只被「平台配對」（`calcPower`）與「FPS 引擎」（`combatSkill`）消費，MOBA LogicEngine 完全沒讀。
- 因此 `slot.power` / `slot.tough` 目前皆填 `null`，MOBA 打誰結果都一樣。

## 4. 是否已存在戰鬥數值

**是，但需釐清歸屬：**

| 來源 | 數值 | 綁定 | 現況用途 |
|------|------|------|----------|
| CHAMPIONS_100 | ❌ 無 | 英雄 | 只提供 arch/lane/diff |
| LogicEngine | `power`/`tough`（寫死） | 角色定位 | MOBA 對戰生效 |
| 選手 roster | 16 維 stats | 選手 | 配對(`calcPower`)＋FPS 實戰 |
| FPS 引擎 | `combatSkill`/`POS_PROFILE` 公式 | FPS 引擎 | CS 逐格模擬 |

---

## 5. 接軌規劃（不重建 Hero Stats Schema）

**核心結論：介面已備妥（`applyRoster` 一旦 `slot.power`/`slot.tough` 非 null 即生效），唯一缺口是「值的來源」。可完全用既有資料組合，不新增任何 Schema。**

### 缺口只有一個
`buildEngineSlots` 目前把 `power`/`tough` 填 `null`。只要在**此一函式內**把 null 換成「查表＋既有戰力管線」計算即可，其餘皆不動。

### 零新 Schema 的兩條現成管線

**(A) 英雄定位 → tough / power 基準**
CHAMPIONS_100 已有 `arch`（坦克/戰士/刺客/法師/射手/輔助）與 `lane`。兩種取法：
- 直接沿用 LogicEngine 既有 role-based 基準（slot 已帶 `role`，等同「不改變現況」的安全起點）；或
- 建一張 `arch → {powerBase, toughBase}` 對照（坦克 tough 高、刺客/射手 power 高），用 `diff` 做 ±微調。此表是**常數對照，非新資料欄位**。

**(B) 選手強度 → 個人縮放**
`calcPower(player,"moba")` 已產出「選手綜合戰力數字」（16維×MOBA_WEIGHTS×性格×士氣）。直接拿它當縮放因子，例如 `scale = calcPower(p,"moba")/70`。

### 建議合成式（僅示意，實作待核准）
```
slot.tough = archToughBase(champion.arch) 或 沿用 role 預設
slot.power = archPowerBase(champion.arch) × ( calcPower(playerObj,"moba") / 70 )
```
- CHAMPIONS_100：**不加欄位**
- 選手 stats：**不改**
- LogicEngine class：**不改**（applyRoster 已就緒）
- 唯一改動點：`buildEngineSlots` 內把 null 換成計算（單一函式、可 Node 驗證）

### 待決策（供後續 /plan 或 /balance）
1. tough 取「沿用 role 預設」還是「arch 對照表」？前者對戰行為零變化最安全，後者才讓英雄選擇產生差異。
2. power 縮放基準 70 與縮放上下限，屬平衡數值——適合進 `/balance` 用表格定曲線。
3. 選手 stats 是否也要「直接」影響 MOBA（而非只透過 calcPower 聚合）？若要，需另議映射，超出「不重建 Schema」範圍，建議延後。

---

*本 Phase 僅分析，未動任何程式。接軌實作為獨立後續任務，待指示。*
