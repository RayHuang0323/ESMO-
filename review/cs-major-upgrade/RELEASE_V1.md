# CS Major Upgrade v1.0 正式發布紀錄

## 2026-10-18 授權與保存

狀態：PREPARING_RELEASE。Owner 已完成人工驗收，授權通過 Release Gate 後正常 push main、GitHub Pages 部署與正式站 Smoke Test。其他 worktree 與未提交修改完整保留，不強刪鎖或 force push。

Owner 核准產品 source：`e8d9b1ebf3bd1244372647a44ea6ce616ec257f0d4c1b1de76a3de8ffdaa5af4`，144 檔。工程結論與歷史紅燈見 `OWNER4H_CLOSURE.md`、`OWNER4G_CLOSURE.md`。原始研究音效及暫存不入庫，正式所需轉製音效與來源說明隨產品保存。

初始狀態／tracked patch／未追蹤檔案清冊：本機 `evidence/release-v1-20261018/initial-*`。未追蹤共 3020 檔，包含研究錄音及暫存；不得全部提交。

## Release Gate

依序：安全保存 → fetch／隔離整合最新 main → CS Simulation／三圖完整對局／Replay／Result／Competition → production build → 桌機與 390px 正式流程 → MOBA 基本回歸 → remote head 再確認 → 正常 fast-forward push → GitHub Pages 精確 SHA 部署 → 正式站 Smoke Test。

所有新 gate 必須保留完整 stdout／stderr、native exit 與前提，尚未執行不得標 PASS。環境問題先分辨 HARNESS_FAIL；不修改產品救環境、不降低門檻。

## 保留風險

- 真手機 FPS、觸控與實機音效未實測；390px Chrome 不代表手機。
- 長時／多次導覽或匯入尾端卡頓：八煙同程序歷史紅燈保留；三組每階段新 Chrome 的原門檻重驗通過，未證明長時風險消失。
- 長 OT Replay 仍受既有容量上限；未調高 gate。
- 三處室內未自然觸發，不宣稱全部視角已通過。
- 舊 MOBA 與 CS 工具債務需與最新 main 分別核對，不以歷史紅燈冒充新版 PASS。

## 發布結果

尚未發布。最終 main SHA、Actions／Pages 與正式站驗證將於實際完成後更新。
