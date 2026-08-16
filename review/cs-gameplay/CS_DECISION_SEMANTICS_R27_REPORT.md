# R27 CS Decision Semantic Audit / Minimal Correction 完成報告

日期：2026-08-13

Focused verifier：PASS

R27 semantic correction：Go

Decision semantic completeness：Revise

Decision calibration：No-Go / Deferred

## 1. 白話結論

ESMO CS 裡的 Decision 是「拿到資訊後，能不能在壓力下做出並執行當下判斷」的能力。現在真正
接上的內容仍然很窄：所有角色的對槍分數、IGL / lurker 的角色適性，以及 CT 已經站到包旁且無人
壓制後的拆彈進度。它沒有控制選目標、撤退、丟道具、買槍或選戰術。

Defuse 可以保留 Decision 當小幅共同因子，但只能解讀成抽象化的「在壓力下承諾並完成拆彈」，
不能宣稱已有 start / stick / abandon 決策 AI。既然這是 live execution，aggressive / calm personality
就應生效；原本直接讀 raw Decision 是 semantic inconsistency。

## 2. Stat ownership

| Stat | 本輪定義 | 現有 defuse read |
|---|---|---|
| Decision | 取得資訊後的判斷與行動承諾 | progress cofactor；不控制選人、開始或中止 |
| TacticalIQ | 理解戰術、bomb timer與局勢 | 無 |
| Focus | 持續專注與執行穩定 | raw Focus progress cofactor；R27不修改 |
| Comms | 分享資訊、協調掩護 | 無；固定台詞不是 stat consumer |

這四項有相鄰語意，但不是同一項能力。現有 model 把 Focus與 Decision壓縮在同一線性 progress
公式，屬 coarse overlap；若未來要拆成真正 decision-action chain，必須另開 gameplay design Sprint。

## 3. Minimal production patch

`src/battle/fps/EsportsFPS3D.jsx` 第 592 行只做一個 read-chain替換：

- R26：`defuser.stats.dec / 300`。
- R27：`persStat(defuser,"dec") / 300`。

Base `0.45`、raw Focus `/250`、Decision `/300`、門檻 `3.5`、fallback `0.7`全部不變；沒有改
balance constant、role mapping、defuser selection、contested、scenario或其他 stat，也沒有新增 RNG。

## 4. Deterministic semantic evidence

- Schema：`CsDecisionSemanticAuditSuite.v1`。
- Scenario：`inferno / t_aexec / c_std`；16 fixed seeds。
- R26 historical / R27 live各跑 off / instrumented / repeated-instrumented，共 96 executions。
- Live source SHA：`f0e5dd4bddc82d06ae715784201877821de0db4fc785d226ab403132bb984e87`。
- R26 historical source SHA：`68d75bb357a504cee8529c4d8cce023c92c364e72cde88e507a8af0df811780e`。
- Static `rand()` call sites：21；token順序不變。
- Suite digest：`fd93059811d17401bc66b7a5421e18bcc15aec564a6b28068dd45536a8fcd324`。

Direct formula probes：

| 玩家 | Personality | raw → effective Decision | raw → effective defuse delta |
|---|---|---:|---:|
| ct4 entry | aggressive | 76 → 72 | 1.0153 → 1.0020 |
| ct5 support | calm | 82 → 88 | 1.0513 → 1.0713 |
| ct2 AWP | grinder / neutral Decision | 80 → 80 | 1.0687 → 1.0687 |

Fixed runtime共有 134 bomb ticks、17 progress ticks、4 completes。16 ticks由 neutral ct2完成，
1 tick由 calm ct5完成；ct5 的單 tick progress如預期增加 0.02。沒有 aggressive defuser progress
opportunity，不能把 direct penalty probe冒充 runtime coverage。

這個小幅 progress差異沒有跨過完成門檻：R26 / R27 的 16 個完整 simulation JSON全部相同，比分、
round result與 RNG trajectory均未改變。這是 fixed suite的實測結果，不保證所有 roster / seed都
zero-diff；historical evidence仍透過 byte-exact adapter保護。

## 5. Semantic / calibration verdict

- raw Decision：保留作穩定基礎值與 IGL / lurker role-fit。
- effective Decision：用於 live `combatSkill`與 defuse execution。
- Defuse ownership：可保留 bounded cofactor，但不是完整 bomb-state decision。
- Decision semantic completeness：**Revise**；現況仍以 generic duel aptitude與 coarse defuse proxy為主。
- Decision calibration：**No-Go / Deferred**；R27只修語意，不重跑或核准 balance calibration。

## 6. `/review`

1. **Blocking issues**：目前沒有 build、contract、RNG determinism或 adapter blocker。
2. **Non-blocking risks**：fixed runtime未涵蓋 aggressive defuser；Focus仍讀 raw；Decision與
   TacticalIQ / Focus / Comms尚未有分離的 decision-action state machine。
3. **Missing verifier**：若未來做真正 bomb decision AI，需另驗 start / stick / abort opportunity、
   actor attribution、RNG migration與 round outcome；不屬 R27。
4. **Minimal fixes**：只做 defuse Decision raw→effective單行 correction與歷史 source adapter；
   不移轉 stat ownership、不新增 feature。
5. **Files inspected**：`src/battle/fps/EsportsFPS3D.jsx` 的 stat/personality/role/combat/plant/defuse
   區段、`src/data/playerModel.js`、`src/battle/fps/csPrepData.js`、R6/R17/R22/R25/R26 verifier與文件、
   historical adapter及四份 handoff。

## 7. Verification close

- Focused R27 verifier重跑 PASS；96 executions、suite digest固定且一致。
- Central CS aggregate：23/23 PASS。第一次在另一個高 CPU量測行程同時運行時，R10 / R13～R15
  超過 600 秒 runner timeout；該行程結束後以 60 分／segment原斷言重跑，4/4皆 exit 0 / shape PASS，
  再以 `--resume`確認 23個指定 segments全數已有 PASS；沒有放寬 verifier或修改 digest。
- 額外 historical checkpoint：R18-A、R18-B、R19皆 exit 0 / PASS，既有 suite digest不變。
- Production build：PASS（Vite 2643 modules）；large-chunk warning為既有警告。
- `git diff --check`：PASS。
- Local commit SHA於 commit後以最終回報提供；R27不 push。
