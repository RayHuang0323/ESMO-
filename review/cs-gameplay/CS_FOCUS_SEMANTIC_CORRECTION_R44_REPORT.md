# R44 CS 專注力（Focus）Raw／Effective Semantic Correction Readiness 報告

## 結論

Focus 的 raw／effective 邊界已完成最小修正：role-fit 保留 raw，combat、holding 與 CT defuse 統一使用 effective。這是語意接線修正，不是 balance calibration，也沒有新增 gameplay feature。

## Source 與 deterministic evidence

- focused verifier：`tools/check_cs_focus_semantic_correction_r44.mjs` PASS
- current source SHA：`80a6ef4e776c825f602f5b41a8a7d9e6c97546dd157e87de2e6f4e3e69fced5e`
- R43 historical source SHA：`edf311b13347dc185713d687e8dad22e05087aceede233a47baae62707b2cbf3`
- production changed line：`592`，只有一行
- RNG call sites：21，current／historical token sequence 相同
- baseline defuse progress：current／historical `16／16`
- cross-view：16 個可比 progress event 中 12 個依 personality 方向改變、4 個中性；沒有反向改變
- suite digest：`e82c27c9182879f089e0baf6bf36ee8aad2cbebab494285829f88e145da724b5`

## Read-chain

| 類型 | 實際 consumer |
|---|---|
| raw Focus | `posSkill()` 的 Rifler／AWP role-fit；權重分別為 2、4 |
| effective Focus | `combatSkill()` mechanics／weapon；holding bonus |
| effective Focus | CT defuse progress（proximity／uncontested 後） |
| effective Decision | 同一 defuse progress 的獨立 `/300` cofactor |
| 無 Focus consumer | target selection、retreat／re-engage、utility timing、bomb choice、tactic choice、aggr |

## Role exposure

五個 CT role 都有 effective combat read，也都可在既有模擬路徑進入 holding；只有 AWP／Rifler 有 raw role-fit Focus。R44 沒有新增 AWP、Rifler 或其他 role 的 bonus，也沒有把 holding、combat、defuse 合併成一個新公式。

## Production 與 calibration 判定

- Production patch：有，只有 raw defuse Focus → effective Focus 一行接線。
- RNG／scenario／role mapping：不變。
- Historical evidence：以 R44 adapter 還原 R43／R28 view，未 rebaseline。
- Focus semantic correction：**Go**。
- Focus full balance calibration：仍 **Revise／Deferred**；R45 才做獨立 calibration pilot。
本報告結論：R44 語意修正可封版，但不等同 Focus balance calibration 完成。
