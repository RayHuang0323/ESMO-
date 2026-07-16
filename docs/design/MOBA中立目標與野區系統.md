# MOBA 中立目標與野區系統（Sprint 29B1）

> 引擎：`src/LogicEngine.js` `_updateNeutralsV3`（v3 才啟用）。
> 座標唯一來源：`src/gameData.js`（`PITS` + 新增 `CAMPS`）。
> 呈現：MobaView3D（低模 + HP 條）/ GameView Minimap / MobaReplayScreen 皆讀
> `snapshot.objectives`（或 replay 的 `objectivesMeta` + `frame.ob`）⇒ 三處座標必然一致。

## 1. 目標資料形狀（引擎 `this.neutrals.list[]`）

```js
{ id, type: "dragon"|"baron"|"buff"|"camp", side,   // side: 營地屬於哪一方野區；龍/巴龍 null
  pos: {x,y}, alive, hp, maxHp,
  spawnAt, respawnAt,                                // 出生時刻 / 下次重生時刻
  killerTeam,                                        // 擊殺歸屬（傷害較多的一方）
  participants: Set,                                 // 本次存活期內傷害過它的英雄
  dmgBy: { blue, red } }                             // 兩隊累計傷害（歸屬依據）
```

snapshot 對外形狀（v3 才出現，舊快照形狀不變）：
`objectives: [{ id, type, side, pos, alive, hp(0–1), maxHp, respawn, killerTeam, participants[] }]`。

## 2. 生命週期（全部真實接線）

出生（`t ≥ respawnAt` ⇒ 滿血）→ 場景出現（3D 模型 visible）→ 集結（團隊目標窗）→
被攻擊（坑內**人數優勢方**每人 `power×0.5×dt`，participants/dmgBy 記錄；HP 條真實下降）→
Smite（見召喚師技能文件）→ 被擊殺（`killerTeam` = 傷害較多的一方 ⇒ **不保證搶到**）→
金幣/XP（沿用 S29A 數值：龍 200/巴龍 400 金、XP.DRAGON/BARON 全隊存活者）→
Timeline `DRAGON_SLAIN`/`BARON_SLAIN`（歸屬 = 引擎 killerTeam，不再用坑邊人數重演）＋
`OBJECTIVE_SPAWN` 事件 → 模型消失 → 重生倒數（HUD 倒數沿用）→ 再出生。

數值（`SIM_RULES.v3`）：

| 目標 | maxHp | 出生 | 重生 | 附帶 |
|---|---|---|---|---|
| Dragon | 1400 | 240s | 150s | 金 200 + XP 286（全隊） |
| Baron | 3000 | 480s | 150s | 金 400 + XP 484 + **兵線 buff 70s**（拆塔 ×2.2、兵對兵 ×1.7） |
| Buff camp ×2 | 420 | 30s | 90s | 金 90 + XP 195（10 單位內） |
| 一般 camp ×4 | 280 | 30s | 90s | 金 60 + XP 130 |

v2 的龍 90s／巴龍 300s 出生太早，是「坑=永久熱點」根因之一 ⇒ v3 延後。

### 團隊目標窗（取代「坑 = 永久熱點」）

每隊每 12 秒擲一次「要不要打當前目標」（機率 = `dragonJoin`/`baronJoin` knob，無戰術 0.6；
S24/S28 作用點保留）。**窗長與承諾上限都由 knob 決定**：開窗 `8 + 14×knob` 秒；
已開打（HP 有下降）可延長，但上限 `windowStart + 10 + 32×knob`——
高目標投入的戰術蹲得久、低投入淺嘗即走 ⇒ knob→行為的單調性放在機制本身
（tactic24 C4c Spearman ρ=0.84 實測；初版「開打就無條件打完」會把差異抹平到 ρ=0.28）。
窗內：打野/輔助必去、其他人吃 `_joinChance`（objAdj 生效）。

## 3. 野區與營地

`gameData.CAMPS`（選點以腳本掃格驗證：藍紅 180° 鏡像、距障礙 ≥r+1.8、距路線 ≥5.5、
距坑 ≥8、距草叢 ≥r+1.5）：

| id | side | type | 座標 |
|---|---|---|---|
| camp_blue_buff | blue | buff | {47,63} |
| camp_blue_a | blue | camp | {41,78} |
| camp_blue_b | blue | camp | {52,74} |
| camp_red_buff / red_a / red_b | red | — | 上列鏡像 {53,37} {59,22} {48,26} |

打野（v3 預設行為）：無 Gank 窗/目標窗/團戰時，走向自家最近存活營地、
以 `power×0.6×dt` 清怪（**不再吃中路兵線**——S29A 已知技術債在此解決）。
地圖空間辨識：三路（LANES）＋河道（WATER 對角）＋雙方野區（CAMPS 所在象限）＋
Dragon/Baron pit（PITS）——主畫面、Minimap、Replay 用同一組常數。

## 4. 呈現接線（本 Sprint 為可辨識低模，正式美術留 29B2）

- **MobaView3D**：龍/巴龍沿用 Icosahedron 發光體 + 新增 HP 條；營地 = Dodecahedron
  低模（buff 粉紅 / 一般萊姆綠）+ HP 條；alive=false ⇒ 模型消失。資料源 `snapshot.objectives`。
- **Minimap**（GameView）：龍/巴龍沿用；營地畫小點（同色系）。
- **Replay**：`objectivesMeta`（位置存一次）+ `frame.ob`（逐幀 alive 位元）；
  舊 replay 無此欄 ⇒ 不渲染、不炸畫面。

## 5. 誠實揭露

- 營地不反擊、無仇恨；敵方打野入侵搶怪未實作（Smite 搶龍/巴龍**有**實作）。
- 龍只有一種（無屬性龍魂）；巴龍 buff 只作用於兵線（不加英雄屬性）。
- 3D 低模外觀未經瀏覽器實測（無瀏覽器環境）；位置/HP/事件接線由
  `check_moba_pacing29b1` §11–16 以引擎+原始碼驗證。

---

## S29B2 增補：可視化資料流

- `snapshot.lanes[].bm/rm[]` 新增 `hp`（0–1；引擎原生 `m.hp/130`）——小兵受擊/瀕死
  可視化的真實來源；**小兵死亡 = id 從陣列消失**（只會因 hp≤0 離場，語意可靠）。
- `frame.ob`（Replay）由存活位元升級為 **hp 值**（0–1，0=死亡）；Replay 播放端
  以 a→b frame 插值重現逐步掉血，不重新模擬。
- 引擎在 `_updateNeutralsV3` 對「打龍/巴龍」「打野清怪」推送**每秒節流**的彈道 fx
  （零 rng ⇒ 不影響決定性與 29B1 節奏；`check_moba_pacing29b1` 引擎層全綠佐證）。
- 3D 場景（MobaView3D）：HP 條插值、受擊 emissive 脈衝、死亡縮小下沉 + viewFx
  擴散圈（固定 14 格池）。詳見 `MOBA場景視覺規範.md` §S29B2。

---

## S29B3 增補：回城 channel（真實機制）

`SIM_RULES.v3` 新增 `recallChannel`：撤退中、**安全**（recallSafeDist=12 內無敵人；
啟動需 1.4× 淨空遲滯）且**離泉水遠**（>recallMinDist=35）⇒ 原地引導 6 秒 → 傳送回泉水。
引導中受擊或敵人接近 ⇒ 中斷（4 秒內不重試）；死亡/復活清空。
事件：`engine.recallLog`（start/done/cancel，done 帶傳送起點）→ `snapshot.recallEvents`
（最近 8 筆）＋ `players[].rc`（引導剩餘秒數）。
「走到泉水回血」與「回城傳送回血」從此可分辨（視覺見 MOBA場景視覺規範.md §S29B3）。
節奏不破壞：`check_moba_pacing29b1` 引擎層 25/25 全綠（含 40-seed 正反序 0pp）。

---

## S29B5 增補：位置、命名與 presentation metadata

- `PITS`：Dragon `(160,157.83)`、Baron `(60,62.17)`；每個 pit 對雙方泉水距離差 <0.5。
- `CAMPS`：雙方各一座 Buff＋兩座 Jungle Camp，180° 鏡像；營地 snapshot / Replay
  `objectivesMeta` 帶 `presentationKey`。
- `OBJECTIVE_PRESENTATION` 是 Dragon / Baron / Blue Buff / Red Buff / Jungle Camp 的
  單一呈現資料源，包含 label、displayName、color、accent、icon、silhouette；主場景、
  Minimap、Replay 共用，不改內部 dragon/baron id。
- 正式主名稱不再使用「魔龍／凱撒」；繁中輔助顯示可用 Dragon（巨龍）、Baron（巴龍）。
- Dragon/Baron 不共用單一 Icosahedron；Buff/camp 不共用光圈或單一 Dodecahedron。
  程序化造型只使用專案自建幾何，不含第三方官方素材。
- 真實 HP、Smite、killerTeam、death/respawn、participants 與事件型別完全沿用 29B1，
  Replay 仍播放已存 frame，不重跑引擎。
