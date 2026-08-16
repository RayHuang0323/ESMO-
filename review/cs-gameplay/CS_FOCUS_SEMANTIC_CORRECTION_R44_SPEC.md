# R44 CS 專注力（Focus）Raw／Effective Semantic Correction Readiness 規格

## 範圍

本 Sprint 只處理 Focus 的 raw／effective read-chain。不做完整 60／70／80／90／100 balance calibration，不新增 RNG，不改 weapon、role mapping、defuse coefficient 或其他素質。

## 已封版語意

- raw Focus：角色的靜態能力與 role-fit 基礎值。
- effective Focus：經 personality 修正與 clamp 後的當下穩定執行能力。
- combat／holding：屬 live execution，使用 effective Focus。
- defuse：通過 proximity、alive 與 uncontested gate 後的持續執行，使用 effective Focus。
- Decision：拆彈進度的另一個 effective cofactor，代表選擇／承諾品質，不由 Focus 取代。

## 最小修正

將 CT defuse progress 的 `defuser.stats.foc/250` 改為 `persStat(defuser,"foc")/250`。保留 `0.45`、`/250`、effective Decision `/300`、threshold、fallback、RNG 與所有 caller。

## 驗證邊界

R44 verifier 比較 current 與 R43 historical source，確認只有一行 production 差異；並以五個 CT role、16 fixed seeds 的 current／historical paired runs 驗證 progress formula、personality direction、holding／combat exposure、輸入不變與 repeated digest。R43／R28 historical view 由 adapter 還原，不 rebaseline 舊 evidence。
本規格結論：Focus 的 live execution consumer 統一使用 effective 值，完整 calibration 留待 R45。
