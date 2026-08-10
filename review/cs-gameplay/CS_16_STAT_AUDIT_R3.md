# CS 16 項玩家素質 Audit + Wiring Measurement R3

日期：2026-08-10
狀態：**PASS／16 項完成逐項證據**
Calibration：**No-Go**

## 1. 結論先行

- `tools/check_cs_stat_wiring_r3.mjs` 以真實 `simulateFps`、固定 Inferno、固定戰術、
  固定 `CsMeasurementSeedSet.v1` 16 seeds，完成 16 項單一 treatment 的 paired probe。
- baseline 與每個 treatment 都逐 seed 跑兩次，共 **544 simulations**；所有 arm 決定性一致。
- `CsStatWiringDigest.v1` suite：
  `fe6b16dc81c356828e45181b186356b222e7b8de2311c8cadb689fdef3f1343e`。
- 13 項在固定情境至少 2/16 seeds 改變 output-only gameplay behavior；
  `resilience`、player-side `synergy`、`learning` 為 0/16。
- 0/16 的三項病因不同：`resilience` 是 lastAlive 情境未觀察到且缺 opportunity KPI；
  `synergy` 是 player-side role chain 不通；`learning` 是 simulator 完全無 gameplay read。
- R3 未修改正式 `EsportsFPS3D.jsx`、R1/R2、CS23、gameplay、contract、Store、UI、
  RNG、平衡值或 dependency，也沒有 rebaseline `CsGameplayDigest.v1`。

## 2. 方法限制

本報告遵守 `METHOD_CAVEAT.md`：action counter 只作 action-point 診斷，不等於最終
gameplay outcome。R3 同時分開記錄 behavior、final result、round outcome 與 target result。

完整 sim JSON 會把 roster `stats` 展開進 frame，R1 正式 digest 也含 `inputSha256`；
兩者跨 treatment 必然不同，不能當 effect 指標。R3 的 `CsStatWiringDigest.v1` 明確排除
輸入 stats / OVR / input hash，只比較真實輸出行為。它是 wiring probe，不取代正式
`CsGameplayDigest.v1` regression gate。

所有 treatment 固定降低一個短鍵 20 點；`accuracy` 沿用 R1 的 88→68。沒有因結果
換 seed、追加 seed、換角色或擴地圖，也不做方向、幅度或顯著性結論。

## 3. 真實資料流與作用點

1. `fpsRoster.js:21-22` 把 16 個 long keys 全部轉成引擎 short keys；這只證明資料進 roster，
   **不證明 simulator 使用**。
2. `fpsRoster.js:28-30` 的 `fpsOvr` 明確是 HUD display-only；引擎內 `ovr()` 也只在
   `EsportsFPS3D.jsx:1637` 顯示。
3. `EsportsFPS3D.jsx:218` 的 `persStat` 套 personality 後供明確的 `S(key)` 與 `aggr` 使用。
4. `EsportsFPS3D.jsx:243-254` 的 `POS_PROFILE` / `posSkill` 直接讀 raw stats，
   不走 `persStat`；只有目前角色 profile 內的五項生效。
5. `EsportsFPS3D.jsx:256-269` 的 `combatSkill` 包含六項 mechanics、武器契合、
   role profile、`vis/dec` 及 holding/entry/lastAlive/lurk/lowHP 情境。
6. `EsportsFPS3D.jsx:275` 的 `aggr` 讀 `cou/str/apm/pos`，影響撤退 gate 與 fire chance。
7. `EsportsFPS3D.jsx:523` 的 headshot chance 直接讀 raw `stats.acc`；
   `EsportsFPS3D.jsx:568` 的 defuse progress 直接讀 CT 方 raw `stats.foc/dec`。
8. `fpsRoster.js:25` 把玩家五定位映成 entry/lurker/rifler/awp/igl，沒有 support；
   因此 support profile 的 `coo` 對 player-side 不可達。

## 4. 16 項矩陣

R3 數字格式為 `behavior / final result / round outcome` changed seeds，分母皆 16。

| 素質 | 真實讀取與 gameplay 作用點 | 作用層級 | R3 固定 probe | opportunity / conversion KPI | 問題分類與病因 | Calibration readiness |
|---|---|---|---:|---|---|---|
| reflex `rxn` | mechanics、手槍/步槍 weapon、entry bonus、entry/rifler/awp profile | 廣泛；entry 加強 | **13/13/13** | R2 combat O→fire→conversion 完整 | 無獨立缺口 | 候選；仍須多角色/情境與避開 ADR 污染 |
| accuracy `acc` | mechanics、所有 weapon、entry/rifler/awp profile；raw headshot chance | 廣泛 | **15/15/15** | R2 combat + headshot chance/result 已有 | **A** ADR overkill 污染 outcome；**C** headshot raw vs `persStat` 不一致 | 暫緩；先決定 raw/effective 語意並隔離 ADR |
| apm `apm` | mechanics、步槍 weapon、entry profile、`aggr` | 廣泛；同時影響 fire/retreat | **11/11/11** | R2 可量 fireChance/combat；retreat 缺 | **B** retreat KPI 缺口 | Instrumentation first |
| positioning `pos` | mechanics、role profiles、holding/lurk、`aggr` | 廣泛＋多情境 | **12/12/11** | R2 combat 已有；retreat 缺 | **B** retreat KPI 缺口 | Instrumentation first |
| mapAware `vis` | combatSkill 4%、lurker/support profile、lurk bonus | 廣泛弱作用＋角色加成 | **6/6/5** | R2 combat O→conversion 可量 | 無獨立缺口 | 候選；需跨角色確認全域與 lurk 成分 |
| tacticalIQ `tac` | igl/support role profile | 角色限定 | **4/4/2** | R2 combat 可量，無戰術決策 KPI | **E** 正常但窄；作用是個人 duel role-fit | 候選前需確認設計語意 |
| decision `dec` | combatSkill 4%、igl/lurker profile；CT raw defuse progress | 廣泛弱作用＋角色/CT 情境 | **3/3/2** | R2 combat 已有；defuse opportunity/progress 缺 | **B** defuse KPI 缺口 | Instrumentation first |
| adaptability `adp` | igl/lurker role profile | 角色限定 | **2/2/2** | R2 combat O→conversion 可量 | **E** 正常但窄 | 候選前需更多角色/seed coverage |
| courage `cou` | entry profile/bonus、`aggr`，進而影響 fire/retreat | 廣泛＋entry | **10/10/10** | R2 fireChance/combat 已有；retreat 缺 | **B** retreat KPI 缺口 | Instrumentation first |
| clutch `str` | mechanics、role profiles、`aggr`、lastAlive、lowHP | 廣泛，名稱不等於只在殘局 | **13/13/11** | R2 combat 已有；真 1vN opportunity 缺 | **A** 現有 `clutches` 不是 1vN KPI；**B** clutch/retreat 缺口 | Instrumentation first |
| focus `foc` | mechanics、狙擊 weapon、rifler/awp profile、holding；CT raw defuse | 廣泛＋CT 情境 | **7/7/7** | R2 combat 已有；defuse progress 缺 | **B** defuse KPI 缺口 | Instrumentation first |
| resilience `res` | 只在 `lastAlive` combatSkill bonus | 極窄情境 | **0/0/0** | R2 未暴露 lastAlive/1vN opportunity | **B + E** 情境限定且量測缺口；不可判定未生效 | Instrumentation first；No-Go |
| comms `com` | igl/support role profile | 角色限定 | **6/6/5** | R2 combat 可量；沒有 team comms outcome | **E** 窄；**C** 若設計期待團隊溝通則作用點不符語意 | 先確認設計語意 |
| leadership `led` | 只在 igl role profile | 角色限定 | **7/7/6** | R2 combat 可量；沒有 team leadership/tactic KPI | **E** 窄；**C** 若期待隊伍效果則需新作用點 | 先確認設計語意 |
| synergy `coo` | 只在 support role profile；player adapter 不產生 support | player-side 未生效 | **0/0/0** | player-side 無可達 opportunity | **C** gameplay/design 接線不通電；**D** 文件宣稱過度 | Design decision first；No-Go |
| learning `lrn` | `FPS_W/fpsOvr` 與 personality 名單；simulator 無 gameplay read | 未生效 | **0/0/0** | 無 action point，無 KPI | **C** gameplay/design 缺口；**D** 文件錯誤；病因是未接線 | Design decision first；No-Go |

### Probe 詳細 changed-seed counts

| 素質 | behavior | final result | round outcome | target result |
|---|---:|---:|---:|---:|
| reflex | 13 | 13 | 13 | 13 |
| accuracy | 15 | 15 | 15 | 15 |
| apm | 11 | 11 | 11 | 11 |
| positioning | 12 | 12 | 11 | 12 |
| mapAware | 6 | 6 | 5 | 6 |
| tacticalIQ | 4 | 4 | 2 | 4 |
| decision | 3 | 3 | 2 | 3 |
| adaptability | 2 | 2 | 2 | 2 |
| courage | 10 | 10 | 10 | 10 |
| clutch | 13 | 13 | 11 | 13 |
| focus | 7 | 7 | 7 | 7 |
| resilience | 0 | 0 | 0 | 0 |
| comms | 6 | 6 | 5 | 6 |
| leadership | 7 | 7 | 6 | 7 |
| synergy | 0 | 0 | 0 | 0 |
| learning | 0 | 0 | 0 | 0 |

這些數字只證明固定 treatment 是否穿透到輸出，不代表效果大小、方向或合理性。

## 5. A–E 問題清單

### A. Measurement bug

1. **ADR overkill**：R2 已量到固定 baseline 1,069 events／53,309 damage；現行 ADR/rating
   記入超過剩餘 HP 的 rolled damage。任何拿 ADR/rating 作 calibration outcome 的結果都受污染。
2. **`clutches` 定義不是 1vN**：目前只判斷勝方最後一名 survivor 且本回合至少一 kill，
   沒記錄何時形成 1vN、N 值、是否成功轉換。欄位可維持 legacy 契約，但不得當真 clutch KPI。

### B. Instrumentation 缺口

- retreat opportunity → gate result → actual displacement / re-engage；影響 `apm/pos/cou/str`。
- true clutch opportunity（lastAlive 時敵方人數 N）→ duel trigger → round conversion；
  影響 `str/res`。
- defuse opportunity → uncontested trigger → progress ticks → success；影響 CT `foc/dec`。
- utility damage 若未來存在 gameplay branch，必須量真實 damage；目前不能用固定 0 或 UI 假值補。

### C. Gameplay / design 缺口

- `learning` 沒有任何 `simulateFps` 作用點；接線需要跨場學習或新 gameplay design，禁止本輪代填。
- player-side `synergy` 唯一 role profile 是 support，但 adapter 將玩家五位置映成
  entry/lurker/rifler/awp/igl，沒有 support。
- `comms/leadership/tacticalIQ` 目前主要把 IGL 個人 duel skill 拉高，沒有隊伍溝通、
  call quality 或 tactic execution 作用點；是否符合產品語意需要設計決策。
- personality 的「有效素質」並非全路徑一致：`combatSkill` 顯式 `S(key)` 走 `persStat`，
  `posSkill`、headshot、defuse 則讀 raw stats。若要統一會改公式與 digest，本輪不修。

### D. 文件錯誤

- `docs/design/選手天賦與能力成長系統.md` 原稱 sim 的 `persStat` 直讀所有 stats，
  並稱 learning 在 CS 完整生效；實作不支持。
- 原以「16 項全 +6 → fpsOvr +6」推論 rating 明顯有感；`fpsOvr` 是 display-only，
  不能推出 gameplay 或 rating。

### E. 正常但作用範圍窄

- `tacticalIQ/adaptability/comms/leadership` 依角色 profile 生效；固定 probe 已觀察到輸出差異，
  但不可外推到非 IGL/lurker/support。
- `resilience` 靜態上只在 lastAlive 生效；0/16 不足以否定接線，應先補 opportunity KPI。

## 6. 進入 calibration 判定

**全域仍為 No-Go。** R3 只證明 wiring，不足以做權重校正，原因：

1. 只有一張圖、一組戰術與每項一名代表角色；
2. 沒有估計方向、幅度、分布飽和或 clamp 下的 effect；
3. ADR/rating 受已證實的 overkill measurement bug 污染；
4. retreat、true clutch、defuse 尚缺完整 opportunity→conversion；
5. `learning/synergy` 需要 design decision，不是調權重能解決。

若未來獲准做第一個 calibration pilot，`reflex × combat` 是相對乾淨的候選：read-chain
明確、R2 combat KPI 完整、沒有 retreat/defuse/clutch 第二作用點；但仍須先封版跨角色／情境
sample plan，且不得沿用 ADR/rating 作唯一 outcome。

## 7. 建議下一個最小 Sprint

先做 **CS True Clutch Instrumentation R4**，只旁路量測：

- lastAlive opportunity 的玩家、side、敵方存活數 N、HP/weapon；
- 該 opportunity 後既有 combat trigger/conversion；
- round win/lose conversion；
- 現有 legacy `clutches` 是否與真 1vN opportunity 對得上。

理由：它能直接解除 `resilience` 0/16 的最大不確定性，也能驗證 `clutch/str` 的命名與
legacy result measurement；範圍比同時碰 retreat/defuse 小。仍只允許 test-only memory
hooks，不改正式 gameplay、RNG、result contract 或 `CsGameplayDigest.v1`。

## 8. 驗證證據

```text
node tools/verify.mjs --only=cs_stat_wiring_r3 --timeout=600000
```

- `cs_stat_wiring_r3`：PASS，111 秒，exit 0。
- simulations：544。
- fixed seed set SHA-256：
  `52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`。
- wiring suite digest：
  `fe6b16dc81c356828e45181b186356b222e7b8de2311c8cadb689fdef3f1343e`。
- 統計顯著性：未計算。
- `CsGameplayDigest.v1` 正式保護由聯合 gate 的 `cs_measure_r1` 負責；本節不先行宣稱
  尚未執行的聯合 gate 結果。

---

## 9. R4–R6 Measurement Coverage Addendum（2026-08-10）

本文件第 4–7 節保留 R3 當時的 audit snapshot；後續 test-only instrumentation 已補：

| 素質 | 後續 coverage | 現況修正 | Calibration |
|---|---|---|---|
| `clutch/str`、`resilience/res` | R4 true lastAlive→combat→round conversion | 158 opportunities；t2 只有 1 state/2 combat，情境仍極窄 | No-Go |
| `apm/positioning/courage/clutch` | R5 retreat opportunity→gate→displacement→re-engage/result | 1,492 opportunities；固定 roster 無 0.82–0.87 近門檻 exposure | No-Go |
| `focus/foc`、`decision/dec` | R6 bomb tick→proximity→contest→progress→complete/result | 20 planted rounds、16 progress ticks、4 completes，只涵蓋 ct2/ct3 | No-Go |

因此第 4 節 matrix 中這三組「Instrumentation first」的 baseline KPI 缺口已關閉，但不代表
sample、treatment 或 outcome 已足夠 calibration。R6 另發現 stale alive-array gate bug 與
`how:"bomb"` result semantic overload；兩者都會污染 defuse outcome 解讀，修正又會改 gameplay／
contract，必須另開 Sprint。完整報告：

- `review/cs-gameplay/CS_TRUE_CLUTCH_R4_REPORT.md`
- `review/cs-gameplay/CS_RETREAT_R5_REPORT.md`
- `review/cs-gameplay/CS_DEFUSE_R6_REPORT.md`

16 項最終 readiness 仍是：`learning`／player-side `synergy` 為 design No-Go；`resilience`、
defuse 與 retreat 相關素質因機會分布狹窄而 No-Go；其餘 11 項只能視為未來 paired calibration
候選，不能由 R3 changed-seed counts 排名強弱。全域 Calibration 仍為 **No-Go**。

### 16 項最終風險／優先級

優先級語意：P0＝先做 design/contract 決策，不代表直接實作；P1＝解除全域 blocker 後的首批
paired pilot 候選；P2＝需先補 sample/作用點分離；P3＝情境過窄或產品語意未定，延後。

| 素質 | 真實生效狀態 | 主要剩餘問題 | 風險 | 優先級 | Calibration readiness |
|---|---|---|---|---|---|
| reflex | 廣泛生效；R2 combat KPI 可量 | outcome 仍受 ADR 污染 | 中 | **P1** | 最乾淨候選；全域 gate 解除後才可 pilot |
| accuracy | 廣泛生效；headshot 直讀 raw | ADR overkill、raw/persStat 語意分裂 | 高 | P2 | No-Go |
| apm | combat＋retreat 生效 | retreat threshold 分布離散、作用點混合 | 中高 | P2 | No-Go |
| positioning | combat＋retreat／role 情境生效 | retreat 近門檻 sample=0、作用點多 | 中高 | P2 | No-Go |
| mapAware | 廣泛弱作用＋lurker | 全域與 role 成分未分離 | 中 | P2 | 條件式候選 |
| tacticalIQ | IGL/support role profile | 名稱像戰術，實作是個人 duel role-fit | 高 | P3 | Design semantics first |
| decision | combat＋IGL/lurker＋CT defuse | defuse sample 稀疏、stale gate bug | 高 | P3 | No-Go |
| adaptability | IGL/lurker role profile | 作用極窄、sample 少 | 中 | P3 | 更多角色/seed plan 後候選 |
| courage | entry＋combat/retreat `aggr` | threshold 分布離散、作用點混合 | 中高 | P2 | No-Go |
| clutch | combat/role/lowHP/lastAlive/retreat | 多作用點、legacy KPI 語意錯 | 高 | P3 | No-Go |
| focus | combat/awp/rifler/holding＋CT defuse | defuse 只覆蓋 ct2/ct3、stale bug | 高 | P3 | No-Go |
| resilience | 只在 lastAlive | t2 僅 1 state/2 combat opportunities | 高 | P3 | No-Go |
| comms | IGL/support 個人 duel profile | 無 team comms/call quality 作用點 | 高 | P3 | Design semantics first |
| leadership | 只在 IGL 個人 duel profile | 無 team leadership/tactic 作用點 | 高 | P3 | Design semantics first |
| synergy | player-side support path 不可達 | 角色接線/產品定位未決 | 極高 | **P0** | Design No-Go |
| learning | `simulateFps` 無 gameplay read | 需要跨場或新 gameplay design | 極高 | **P0** | Design No-Go |

R7 再確認：utility 購買/投擲沒有讀任何 16 項素質，`utilDmg:0` 也不是可校正作用點。
詳見 `review/cs-gameplay/CS_UTILITY_DAMAGE_R7_AUDIT.md`。
