
## 2026-11-07 CS Map v2 獨立工程整合演練候選

本節僅描述隔離分支候選，不是main／正式發布狀態。最新報告`review/cs-integration-20261107/INTEGRATION_REVIEW.md`、停點`CHECKPOINT.md`。基線origin/main 7d59dab5，本機必要產品Checkpoint 5fc2463b；原CS recovery-r50之34份WIP相符，先另存r51，原工作區未commit或改寫。

新worktree cs-map-v2-integration-20261107，選擇性移植三圖／Shader／RAF／TD-FDR-01／動畫／Replay；排除MOBA Lineup及非必要詳情UI。577份其餘main來源逐blob相同，122份FPS來源內容與候選相同；六共享檔逐段保留BP-9原子結算、SaveSlim、未入帳提示、恢復與MOBA規則／旗標，不做整檔ours/theirs。

實測：三圖正式UI快速練習各48/48；TD-FDR-01 49/49、Shader14/14、RAF7/7、三圖完整Replay無損往返；BP-9 Node P0-A1464/1464、P0-B112/112；browser normal11/11、slim-300 44/44；runtime29 runner35/35。完整production build通過，受測與最終／完整預覽bundle同b27a69e9…e370。

紅燈保留：progress25 32/33（main的BattleResult文字斷言）；browser slim-cs3/4（第244天日曆存檔先滿，未觸發指定CS結算超限）。新增**TD-INT-01：補該相同條件的CS滿檔／整理後返回驗證**；不是重開已結案TD-BP9-23，也未證明產品新故障。工具缺依賴、Foundry radar把安包區rect算入牆體的首次失敗收據全保留，只修工具／依賴。

**Release Gate仍HOLD**：Android、低RAM峰值、CPU4×、完整長局、Owner接受均未通過／未驗收；功能gate的FPS不是隔離效能基準。獨立預覽5207／控制61048，原CS三組預覽保留；HTTPS只留對話及controller記憶體。沒有正式merge、push、deploy，完成後停Owner Review。
