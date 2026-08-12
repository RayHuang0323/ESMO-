# R27 CS Decision Semantic Audit / Minimal Correction 規格

日期：2026-08-13

範圍：只定義 Decision 產品語意、審核 defuse consumer，並做最小 raw / effective correction。

Calibration：本輪不執行

## 1. 產品語意

Decision（決策力）代表選手在已取得資訊與既定戰術下，判斷並承諾當下行動的品質。它不是
TacticalIQ、Focus 或 Comms 的別名，也不能因名稱而宣稱目前 simulator 已實作 target selection、
utility timing、retreat、purchase 或完整 bomb-state AI。

Production 邊界如下：

| 邊界 | 正式語意 |
|---|---|
| raw Decision | `player.stats.dec`；穩定的球員基礎值，供 IGL / lurker `posSkill()` role-fit aptitude |
| effective Decision | `persStat(player,"dec")`；aggressive -4、calm +6，再 clamp 1～99 |
| state-adjusted Decision | 不存在；morale / condition 只經 `formMul()` 乘 final `combatSkill`，不改 Decision 本身 |
| live combat consumer | effective Decision 的 4% 進 `combatSkill()`，再影響既有 duel `Pt` |
| defuse consumer | 通過距離與 uncontested gate 後，Decision 作為抽象化拆彈執行／承諾品質的共同因子 |

## 2. Defuse ownership 判定

現有 defuse state machine 先依距離選出 CT、再以活著的 T 與 LOS 判斷 contested；這些選擇與 gate
都不讀 Decision。Decision 只在已開始拆彈後的 progress delta 出現，因此不能宣稱它控制「要不要
拆、何時開始、stick 或 abandon」。

R27 保留 Decision 對既有抽象 defuse execution 的小幅貢獻，理由是：

- 產品資料把 aggressive 的 Decision / Focus 一起下修，描述為「容易衝動」；calm 提升 Decision，
  描述為「關鍵時刻穩定」。這是 live、受壓行動的有效值語意。
- 既有公式與 R6～R26 evidence 已明確把 Focus / Decision 定義成 defuse progress 的共同因子；
  本輪沒有證據足以把 consumer 移除或轉交另一項 stat。
- 但這只是 coarse abstraction，不代表完整 Decision gameplay 已完成。

相鄰 stat 的責任邊界：

- TacticalIQ：理解戰術、時間與局勢；若未來要決定可否拆、何時轉點，較接近 planning input。
- Decision：在上述資訊下選擇並承諾行動；目前只由 progress 粗略代理。
- Focus：持續執行、不分心；仍是既有 defuse cofactor。它目前讀 raw Focus，R27 不跨 stat 修正。
- Comms：共享資訊與要求隊友掩護；固定「我拆，掩護我」訊息不代表 Comms 已有 gameplay read。

因此 raw Decision 用於 live defuse 會略過已宣告的 personality effect，與同場 combat 的 effective
Decision 不一致；修正應使用 effective Decision。

## 3. 最小 production patch

只改 `src/battle/fps/EsportsFPS3D.jsx` 的 defuse progress 一行：

- `defuser.stats.dec / 300` 改為 `persStat(defuser,"dec") / 300`。
- 保留 base `0.45`、raw Focus `/250`、Decision `/300`、完成門檻 `3.5` 與無 stats fallback `0.7`。
- 不改 balance constant、role mapping、defuser selection、contested gate、scenario 或其他 15 項 stat。
- 不增加、刪除或搬動 `rand()`；static RNG call sites 維持 21。
- 不新增 Decision gameplay feature、runtime event、contract、Store、Progress、Replay 或 UI 欄位。

## 4. Focused evidence contract

`tools/check_cs_decision_semantics_r27.mjs` 必須驗證：

1. live R27 與 byte-exact R26 historical source SHA；R27→R26 adapter 只還原 defuse Decision read。
2. production diff 只有第 592 行，且 raw / effective marker、常數、fallback 與 RNG token sequence閉合。
3. raw role-fit、effective combat、defuser selection non-consumer 與 personality product semantics。
4. direct probes涵蓋 aggressive penalty、calm gain與 neutral control；morale不得改 effective Decision。
5. 固定 `inferno / t_aexec / c_std`、16 seeds；R26 / R27各跑 off / instrumented /
   repeated-instrumented，共 96 executions。
6. 每筆 progress必須對回 proximity / uncontested gate與同一 production formula。
7. 第一個 raw/effective boundary前的 actor、tick、Focus、Decision與 progress必須相同；方向必須符合
   personality adjustment。未遇到 boundary 的 seed必須完整 simulation zero-diff。
8. suite digest固定為
   `fd93059811d17401bc66b7a5421e18bcc15aec564a6b28068dd45536a8fcd324`。

Fixed suite 不得為了取得 aggressive defuser coverage而換 seed或改 scenario；缺少該 runtime
opportunity 必須誠實列為 risk，direct probe不能冒充完整 trajectory coverage。

## 5. Historical gate

- `csR27R26Source()` 還原 byte-exact R26 source；R26 verifier不得改 expected digest。
- 既有 `csR25R24Source()` 與 R19 / R15 / R14 adapter chain在 R27 correction前先降回正確歷史 view。
- 不更新 R1～R26任何 expected gameplay、event或measurement digest；這是 source adapter，不是
  rebaseline。

## 6. Out of scope / Gate

- 不做 Decision balance calibration。
- 不新增 target、retreat、utility、bomb choice、purchase或 tactic AI。
- 不把 raw Focus順手改成 effective Focus；Focus 必須獨立 audit。
- 不改 TacticalIQ、Comms、MapAware、Synergy、Learning或其他 stat。

判定：R27 semantic audit與最小 raw/effective correction為 **Go**；Decision 產品映射完整度仍是
**Revise**；Decision calibration為 **No-Go / Deferred**。
