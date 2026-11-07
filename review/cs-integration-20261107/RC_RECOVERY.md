# 本機RC恢復與服務操作

此RC僅本機Owner Review，Gate HOLD，不授權merge／push／deploy。不要reset、clean或刪除ignored evidence，原CS34份WIP不在此分支提交內。

## 日常恢復預覽

工作目錄：`C:/Users/ifikn/.codex/worktrees/ESMO/cs-map-v2-integration-20261107`。

```
node tools/start_cs_rc_preview.mjs
```

會核對preview-r3的JS SHA與受測bundle，重用或僅重啟本RC5207 preview／61048 controller。遇不明占用、PID身分或SHA不符即停止，不接管其他服務。既有portable cloudflared只讀使用，不安裝或更新全域工具。輸出當次HTTPS只留對話，Quick Tunnel重建網址可能不同。

桌機開`http://localhost:5207/ESMO-/`；手機須用輸出的HTTPS（4G／熱點環境不給區網IP）。本機需開機、有網路，背景程序不保證重開機後自動復原。

驗收結束：

```
node tools/start_cs_rc_preview.mjs --stop
```

只停止經身分核對的本RC preview與controller，不處理原CS5187／5188／5197或其他worktree。

## Git與證據恢復

本機RC分支`rc/cs-map-v2-20261108`；最終tag／SHA由rc-manifest.json及`git log -1`確認。rehearsal分支起點3b8f75ff保留，原產品Checkpoint a7398436／5fc2463b／b22b7a61／8cd2584d不改寫。

若另建恢復工作樹，先檢查目標路徑不存在，再用`git worktree add --detach <新的絕對路徑> <已核對的RC-tag>`。不要覆蓋現有CS／main／Claude工作區；依同lockfile提供依賴，這份指令不自行安裝全域工具或移動原工作區。

preview-r3、raw logs、Replay／Snapshot／Allocation／trace及recovery是本機ignored檔，**只恢復Git不會帶回證據或預覽包**。需要搬機時另保留manifest列出的檔案，核對SHA；本輪沒有對外備份／上傳。

原34份WIP另存`review/cs-integration-20261107/evidence/rc-recovery-r1/original-wip/`及其manifest，原recovery-r50／r51仍在cs-foundry-circuit。這是復原副本，不可整批覆蓋原工作樹；若原檔已變更，逐檔比對後另存，不自動還原。

若preview-r3遺失，先確認RC tag與產品來源指紋一致。目錄完全不存在時可用原r3；若有部分檔案，不清理或覆寫，改用尚不存在的版本，例如：

```
node tools/build_cs_integration_preview.mjs r4
node tools/build_cs_rc_owner_page.mjs preview-r4
node tools/start_cs_rc_preview.mjs --artifact=preview-r4
```

必須從已核對RC tag及相同產品來源重建，恢復工具仍會要求同一受測bundle SHA；不得將未知WIP建成同名包。預覽包刻意留空三個雲端公開設定，不等於正式CI環境驗收。
