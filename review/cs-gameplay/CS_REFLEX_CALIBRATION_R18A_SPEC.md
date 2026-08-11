# CS Reflex Calibration Pilot — R18-A

## 狀態

R18-A 只做 `reflex` / `rxn` 的 deterministic combat calibration pilot。這不是完整 16-stat calibration，也不是最終 balance approval；R18-B 尚未開始。

固定基線：

- release checkpoint：`4458543a1668473e74193fe4cf09ffa2a56152fc`
- CS simulator source SHA-256：`7622f87b8b389a504c19b887b860de791dbf8ea240e6ba57c424e159cb655c89`
- 固定 seed set：`CsMeasurementSeedSet.v1`，16 seeds，SHA-256 `52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d`
- simulation RNG call sites：21；R18-A 不新增 RNG、不中和既有 RNG 順序
- scenario：`inferno / t_aexec / c_std`

## Read-chain 邊界

本 pilot 只驗證既有 `reflex → rxn` 在真實 simulator 內的 combat chain：

`toFpsRoster → short stats.rxn → persStat(rxn) → combatSkill(mechanics/weapon/profile) → Pt → fire/conversion → result KPI`

`accuracy`、`apm`、`positioning`、`courage` 等既有共同輸入仍然存在，但本輪不修改、不宣稱已完成它們的 calibration。由於 personality-adjusted 與 raw stats 混用，結論限定為「Reflex combat calibration pilot」。

## 驗證分層（R18 preflight）

| 層級 | 用途 | 執行內容 | Correctness gate |
|---|---|---|---|
| candidate sweep | 每個 low/baseline/high paired candidate | focused R18-A verifier；固定 source、seed、scenario、輸入單欄變更、同 seed 重跑 determinism、event chain 完整性 | 不降低：source/RNG/shape/input immutability、paired determinism、opportunity→fire→conversion 完整鏈均必須 PASS |
| accepted candidate | pilot 選出的合理範圍候選 | focused regression；固定候選與同一 paired seed set 重跑，核對 suite digest、KPI digest、monotonicity/saturation 判定 | 不降低：仍保留所有 focused gate，且不得以統計效果取代 correctness |
| checkpoint | R18-A tooling/spec 或候選被接受後的歷史安全網 | `tools/verify.mjs` 的歷史 CS gate（包含正式註冊的 R17 readiness gate；必要時依 scope 執行完整 aggregate） | 不降低：aggregate 仍檢查 child exit code 與 output shape；不得用 focused 結果代替 historical gate |

因此 sweep 不會每次重跑 R1–R17，但 accepted candidate / checkpoint 仍會回到既有 correctness gate；這是成本分層，不是放寬 gate。

## Paired sweep 設計

- 僅改一個欄位：目標 T-side player 的 `stats.rxn`；`fps` / `moba` HUD 值不重算。
- 每個 T-side role 各做 low / baseline / high；每個 level 使用同一組 16 seeds 與同一 scenario，按 seed 配對。
- levels 使用 target baseline 周圍的 deterministic bounded band（`baseline ± 12`，clamp 至 `1..99`）；這是 pilot range，不是 production patch。
- 每次 treatment 與 baseline 的輸入 diff 必須恰好只有 `roster.<target>.stats.rxn`。
- simulator output 與 collector events 必須在同 seed 重跑完全一致；instrumentation 只能在記憶體 transform 注入，production source 不改。

## KPI

主要 KPI：

- combat opportunity count
- fire trigger count / opportunity
- combat conversion count
- kill conversion / conversion
- target player 的 opportunity、fire、conversion、kill

secondary KPI：

- round win rate / round count
- total kills、effective damage（以 simulator result 的既有欄位為準）
- headshot conversion rate、clamp rate
- changed-seed ratio 與 target result changed-seed ratio

每個 KPI 同時輸出 low→baseline、baseline→high、low→high 的 paired mean difference、paired standard deviation、標準化 effect size（paired difference / paired SD；SD=0 時明確標記 `0` 或 `undefined`），以及 seed-level distribution。

## 判讀規則

- `monotonicity`：high 的方向性 paired effect 必須與 baseline→low 相反，並以 seed-level signed majority 與 aggregate direction 同時檢查；不是只看平均值。
- `saturation`：檢查 high/low 端的 clamp、trigger probability 是否落在既有 bounded range，以及 marginal response 是否接近零；三點 pilot 只能標記 `signal` / `not-observed` / `inconclusive`，不得宣稱已找到最終 plateau。
- `reasonable calibration range`：只在 read-chain 完整、deterministic、主要 KPI 方向一致，且沒有大比例 clamp 或明顯 role-specific inversion 時提出；範圍仍是後續 production review 的候選，不自動寫回 production。
- 若主要 KPI 方向不一致、effect size 只出現在 secondary/result、或 raw/personality-adjusted 混用遮蔽因果，R18-A 只交付 measurement evidence，不提出 production patch。

## 非目標

- 不 rebaseline R1–R17。
- 不調整任何其他 15 項 stat、權重、weapon、tactic、utility、movement、damage、LOS 或 result contract。
- 不處理 synergy / learning。
- 不建立新的 AI 或 MapAware feature。
- 不因 aggregate runner 成本而刪除、弱化或改寫 correctness gate。

