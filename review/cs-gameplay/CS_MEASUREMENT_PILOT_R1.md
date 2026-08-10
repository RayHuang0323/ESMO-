# CS Measurement Pilot R1

日期：2026-08-10
狀態：**PASS／基準已鎖定**
階段判定：**Measurement 可繼續；Calibration 仍為 No-Go**

## 目的

本輪只回答四件事：

1. 真實 `simulateFps` 能否在 Node 中以固定輸入、固定 seed 穩定重現。
2. 是否能建立不依賴 summary counter 的 gameplay outcome regression gate。
3. `accuracy × T rifler × Inferno` 的 paired pilot 是否可重現。
4. measurement collector 是否不改變 gameplay 結果。

本輪不做統計顯著性判定、不調權重、不改 gameplay、也不因結果好壞更換 seed。

## 封版範圍

程式變更只有：

- 新增 `tools/check_cs_measurement_r1.mjs`。
- `tools/verify.mjs` 新增 `cs_measure_r1` segment。

刻意未修改：

- `src/battle/fps/EsportsFPS3D.jsx`
- `tools/check_cs23.mjs`
- gameplay／contract／Store／UI
- dependency 與正式 export

`EsportsFPS3D.jsx` 封版 SHA-256：
`5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d`。

## 最低侵入量測入口

Verifier 以既有 Vite programmatic middleware 對
`EsportsFPS3D.jsx` 做 **test-only memory transform**：只在記憶體注入
`simulateFps`／`ROSTER`／`TACTICS_DB` 的測試 export。它具備下列 fail-closed 條件：

- 只允許兩個精確字串替換，而且每個替換必須恰好命中一次。
- transform 後會逆轉替換並逐字比對原始碼。
- 來源 SHA 不符、替換失敗或輸出形狀不符時立即 FAIL。
- 不寫回正式程式、不複製第二套 `simulateFps`、不安裝額外套件。
- 臨時 Vite cache 只放 OS temp，`finally` 清除。

## 固定情境與 treatment integrity

| 項目 | 固定值 |
|---|---|
| 地圖 | `inferno` |
| T tactic | `t_aexec` |
| CT tactic | `c_std` |
| 名單 | 引擎內既有 `ROSTER` |
| 目標 | `t2`（T rifler） |
| baseline | `roster.t2.stats.acc = 88` |
| treatment | `roster.t2.stats.acc = 68` |
| paired seeds | 16 |
| simulations | A-B-A-B × 16 = 64 |

深層 diff 的 hard gate 要求 treatment 只有
`roster.t2.stats.acc: 88 → 68` 一條差異；輸入在模擬前後也必須保持相同 hash。
HUD 用的 `fps` 顯示 OVR 刻意不重算，因為它不是 gameplay 輸入。

## Seed 封版

- seed generation version：`CsMeasurementSeedSet.v1`
- namespace：`ESMO:CsMeasurementPilot.v1:<index>`
- 生成法：namespace 字串的 SHA-256 前 32 bits（unsigned）
- seedSetSha256：
  `52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`

固定集合：

```text
3978742910, 4200255727, 541349949, 1011896540,
44863398, 1878380147, 638784133, 2852978760,
1789562418, 3820910912, 3991584863, 2186970694,
951543597, 2082574495, 474649321, 3950420867
```

Verifier stdout 必須印出 generation version、完整 16 seeds 與 seedSetSha256；
不得依 pilot 結果替換或追加 seed。

## `CsGameplayDigest.v1`

正式 regression gate 使用版本化 schema：`CsGameplayDigest.v1`。Canonical JSON
會排序 object key、穩定排序選手、拒絕 gameplay 必要欄位中的 `undefined`／非有限數，
並只對位置／路線浮點做固定六位小數正規化。

最小正式內容：

- scenario：seed、map、T／CT tactic id、完整輸入 SHA-256。
- result：比分、回合數，以及每位選手的 side／role／KDA／ADR／HS／HS%／KAST／
  MVP rounds／clutches／entry kills／rating。
- rounds：逐回合 winner／how／累積比分。
- frames：frame／round／roundSec、buy phase、target、plant／C4、eco 狀態、
  玩家 gameplay state、events、smokes、mollys、throwables、掉槍／掉包、door states。

`strictSimDigest` 對完整回傳物件做 hash，只作診斷，不是正式 baseline schema。
casts、comms、highlights、tracers、muzzles 與 build id 不納入正式 digest，避免純呈現資料
誤報成 gameplay regression。

鎖定的 baseline suite digest：
`546a3e5753ceadfa28c64e7f322556ebbff32f0848eebe2c9b477a29f1a195c2`。

## PASS／FAIL hard gates

必須全部成立：

1. 來源 provenance、memory transform、測試 API 與 sim output shape 正確。
2. 固定 seed 可由 generation version 重建，且集合 hash 完全相符。
3. 固定地圖／戰術／ROSTER／目標角色與 baseline 值相符。
4. treatment 深層差異只有 `t2.stats.acc 88 → 68`。
5. baseline 與 treatment 各自逐 seed deterministic。
6. collector 前後 `gameplayDigest` 相同；sentinel 的 strict digest 也相同。
7. 模擬不改輸入，且 formal baseline suite digest 完全命中 expected。
8. Vite server、temp cache 與子行程正常關閉；任何例外皆非 PASS。

A 與 B 的 gameplay digest 可以相同，不因此失敗；結果不顯著也不得換 seed。

## 實跑結果

執行：

```text
node tools/verify.mjs --only=cs23,cs_measure_r1,build --timeout=600000
```

結果：

- `cs23`：28/28 PASS。
- `cs_measure_r1`：PASS。
- `build`：PASS。
- 本次 runner：3/3，exit 0；未宣稱其餘未跑 segment 通過。
- `git diff --check`：PASS。
- baseline／treatment 各 16 場，A/B 相同 digest 0/16（只作診斷）。

Pilot 摘要：baseline 的目標選手平均 K 10.813、D 8.813、ADR 150.188、
HS% 84.5、KAST 65.875、rating 1.554；treatment 分別為 5.625、9.25、90.625、
69.813、50.563、0.888。兩組 T wins 都是 0/16。

這些是 paired measurement 是否可重現的證據，**不是 calibration 結論**；
本輪不算 p-value，也不以勝率方向作 PASS 條件。

## 已知限制與下一階段門檻

R1 目前只能可靠保護最終 gameplay trajectory／outcome，尚未直接量到
「作用機會 → 是否觸發 → 是否轉換」。已知待 Audit：ADR overkill、clutch 定義、
`utilDmg = 0`、learning 未接 gameplay、player-side synergy 可能未通電，以及 16 項素質
文件宣稱與實作不一致。

下一階段只能先做最小 instrumentation；必須證明：

- 不新增 RNG call、不改 RNG 消耗順序、不改 gameplay branch／公式／數值。
- 無 instrumentation 與有 instrumentation 的 `CsGameplayDigest.v1` 逐 seed 相同。
- expected baseline 不更新、不 rebaseline。
- 每個 KPI 明確記錄作用層級、遞增條件、情境門檻、節流與上限。

在 16 項素質的作用點與 KPI 缺口完成盤點前，**Calibration 維持 No-Go**。

## 版本管理

既有未追蹤檔 `review/moba-combat/cs23-baseline-20260810.log` 是先前 probe output，
不屬於本 Sprint，必須保持未納管。無 commit 會包含它；本輪不 push。
