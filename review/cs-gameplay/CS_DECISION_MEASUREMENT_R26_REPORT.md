# R26 CS Decision Measurement / Calibration Readiness 完成報告

日期：2026-08-13
Focused verifier：PASS
Decision measurement：Go
Decision semantics：Revise
Decision calibration：No-Go / Deferred

## 1. 白話結論

目前遊戲裡的 Decision 並不是「球員會不會選對目標、該不該撤退、何時丟道具或選哪套戰術」。
它主要是一個泛用交火分數：五個角色都把 personality-adjusted Decision 的 4% 加進
`combatSkill`，再由 `combatSkill` 影響既有交火裡 T / CT 誰先造成傷害。IGL 與 lurker 額外把
raw Decision 當成角色適性；CT 拆彈速度也另外讀 raw Decision。

所以 Decision **確實有作用**，但產品名稱與真實控制面不一致，而且 combat 用 effective、defuse
用 raw。這不是調高或調低 4% 可以解決的問題，R26 不提出 balance patch，也不新增 gameplay。

## 2. Production read-chain audit

| 檢查項目 | 結果 |
|---|---|
| raw Decision | IGL / lurker `posSkill`；CT defuse delta |
| effective Decision | 全角色 `combatSkill` 的 `S("dec") * 0.04` |
| morale / condition | 不改 Decision；只乘 final `combatSkill` output |
| target / engagement choice | 無 Decision read；pairs 由距離、LOS、smoke、sniper priority、used-player 排序決定 |
| retreat / re-engage | 無 Decision read；由 HP、距離、mates 與 `aggr < 0.82` 決定 |
| utility timing | 無 Decision read；固定 `rand() < 0.06` |
| bomb-state choice | plant / retake 路線與 defuser selection 無 Decision read；只有 progress speed 有 raw Decision |
| role / tactic / buy choice | 無 Decision read；由既定 role、route、使用者 tactic 與經濟決定 |
| `aggr()` | 無 Decision read |

## 3. 五角色 deterministic measurement

每格為 low / baseline / high；所有數字來自同一 production 公式的 memory-only observer。

| Role（personality） | raw Decision | effective Decision | raw role-fit weight | isolated combatSkill | isolated local `Pt` |
|---|---:|---:|---:|---:|---:|
| entry（aggressive） | 58 / 68 / 78 | 54 / 64 / 74 | 0 | 84.0919 / 84.4919 / 84.8919 | 0.5264 / 0.5316 / 0.5368 |
| rifler（genius） | 70 / 80 / 90 | 70 / 80 / 90 | 0 | 86.1970 / 86.5970 / 86.9970 | 0.5537 / 0.5589 / 0.5641 |
| awp（calm） | 68 / 78 / 88 | 74 / 84 / 94 | 0 | 92.1456 / 92.5456 / 92.9456 | 0.6311 / 0.6363 / 0.6415 |
| lurker（lonewolf） | 68 / 78 / 88 | 68 / 78 / 88 | 4 | 91.2305 / 92.0039 / 92.7772 | 0.6192 / 0.6292 / 0.6393 |
| IGL（shotcaller） | 75 / 85 / 95 | 75 / 85 / 95 | 3 | 76.1299 / 76.8099 / 77.4899 | 0.4229 / 0.4317 / 0.4406 |

五個 role 的 effective Decision、isolated combatSkill 與 isolated `Pt` 都是 16/16 strict-majority
單調。IGL / lurker 因多一條 raw role-fit，low→high 的 `Pt` 增幅約 0.0177 / 0.0201；其他三角
約 0.0104。這證明 Decision 有真實 direct/local effect，也顯示同一素質在角色間不是同強度。

Morale=40 control 對五角皆保持 effective Decision 不變，final combat output 才乘 0.83；因此沒有
「state-adjusted Decision」這一層，只有 state-adjusted combat output。

## 4. R22 四層判讀

### Level 1：direct consumer — PASS

- effective Decision、combatSkill、isolated `Pt`：5/5 roles、各 16/16 單調。
- raw role-fit：lurker / IGL 各 16/16；entry / rifler / awp 不適用。
- low / baseline / high 沒有 raw 或 effective clamp，Decision-specific threshold 不存在。
- `aggr()` 在三層完全不變，證實 retreat / fire admission 不是 Decision direct consumer。

### Level 2：local opportunity — combat 足夠；全產品語意不足

16-seed runtime admitted duel counts（low / baseline / high）：entry 342 / 341 / 341；rifler
543 / 565 / 609；awp 240 / 246 / 246；lurker 406 / 401 / 388；IGL 447 / 418 / 440。

Combat opportunity 很多，但 treatment 是既有五個 T-side roles，不能直接 treatment CT-only raw
defuse consumer。Baseline 有 134 bomb ticks、17 progress ticks、4 completes，只有 ct5 support
1 tick與 ct2 awp 16 ticks，owner coverage 只有 2 人。這足以證明 branch 存在，不足以核准完整
Decision calibration。

### Level 3：immediate action — formula 單調；realized action 不穩定

Isolated `Pt` 5/5 roles 通過 strict-majority；runtime `actualTargetWinChanceMean` 也分別為
16/16、16/16、16/16、14/16、13/16。但 realized attacker rate 只有 1/16、4/16、1/16、2/16、
4/16，沒有任何角色過 strict-majority。local probability方向正確，但離散 roll、死亡、round長度
與後續路徑會放大或淹沒 action count。

Utility throw rate、engagement admission rate、defuse progress tick count均不應拿來證明 Decision
效果；它們沒有直接 read，出現差異只是前序 combat path 改變後的 spillover。

### Level 4：secondary only

Kills / damage / survival 沒有任何角色通過 strict-majority。target KPI digest 對 low / high 的
changed seeds為：entry 1/0、rifler 2/5、awp 1/0、lurker 2/4、IGL 4/6。這些是 deterministic path
amplification，不是 balance 方向訊號。

## 5. raw / effective defuse inconsistency

Defuse progress 是 `0.45 + raw Focus / 250 + raw Decision / 300`。Fixed roster 中 ct4 aggressive
Decision 76→effective 72，ct5 calm 82→effective 88；但 defuse仍讀 raw。Fixed baseline又實際量到
ct5 進度 1 tick，因此不是純靜態死碼。

R26 不直接修它：修 raw/effective defuse會改 gameplay trajectory，應另開最小 semantic Sprint，
獨立做 same-boundary causality與 historical adapter；不能夾在 Decision balance calibration 裡。

## 6. 與其他 stat 的語意重疊

- TacticalIQ：IGL role-fit 同時讀 `dec` 與 `tac`，但兩者都只變成個人 duel aptitude，沒有
  tactic choice / execution consumer。
- MapAware：`vis` 也有 generic combat 4%，lurker profile又同時放 `vis` 與 `dec`；兩者在
  combat / role-fit上難以對應「看見資訊」與「做出決定」。
- Focus：raw `foc` 與 raw `dec` 同時線性加進 defuse delta；現有事件沒有把專注維持與拆彈決策
  分成兩個 action。

## 7. Gate

- R26 focused measurement：**Go / PASS**。
- Decision 真正有作用：**是**，主要是 generic duel probability，IGL / lurker有額外 role-fit，
  CT有 raw defuse speed。
- Decision semantic correctness：**Revise**。
- Decision balance calibration：**No-Go / Deferred**。
- Production patch：**無**。下一個合理工作是獨立的 Decision raw/effective defuse semantic Sprint，
  或先完成產品對「Decision 應控制什麼」的設計決定；不能直接調 4%。

## 8. `/review`

1. **Blocking issues**：沒有 build、contract、RNG determinism或 historical gate blocker；但
   raw-defuse / effective-combat semantic inconsistency 阻擋 calibration。
2. **Non-blocking risks**：realized action與 Level 4有 deterministic path amplification；Decision與
   TacticalIQ / MapAware / Focus重疊；defuse owner coverage只有 2 人。
3. **Missing verifier**：若未來批准修 defuse semantic，仍缺 CT 五角色 low/base/high treatment與
   first-boundary gameplay migration verifier；本輪 scope不應補新 gameplay verifier。
4. **Minimal fixes**：R26只新增 memory-only verifier、aggregate segment與文件，不改 production。
5. **Files inspected**：`src/battle/fps/EsportsFPS3D.jsx` 的 stat/personality/role/combat/movement/
   utility/pair/plant/defuse/round-result區段、R6/R17/R22～R25 verifier與文件、四份 handoff。

## 9. Determinism / provenance

- 528 simulations；off / on / repeated-on 完整 sim 相同。
- Repeated suite digest：`f8f3db1e6568f5d7fd4171f4d2b82bdf441e09bb9e45cd57924ce9307d68ccb4`。
- Live source SHA-256：`68d75bb357a504cee8529c4d8cce023c92c364e72cde88e507a8af0df811780e`。
- RNG call sites：21；production、scenario、historical baselines 均未修改。
- Central CS aggregate：22/22 PASS（R1～R26 現役 segments，含 historical checkpoint gates）。
- Production build：PASS（Vite 2643 modules；既有 large-chunk warning，非 R26 regression）。
