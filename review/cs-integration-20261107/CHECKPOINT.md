# CS Map v2 隔離整合續作停點

最新續作完成：REMAINING_GAPS_REVIEW.md為本輪報告。只有兩支tools與文件修改，無產品改動。progress25修正v2舊假設為正式v3 runtime＋v2相容／非法版本拒絕，gaps-progress-r2 33/33；首次錯沿用v2之r1失敗保留。gaps-cs-runtime-r1仍3/4，確認第244天日曆先滿；新增calendar-cs-diagnostic 32/32證明備份／同意／整理／冷啟動後CS續玩入帳102→103，不代替指定CS結算超限／原場返回。Replay2118MiB風險仍開，沒有推測性產品修正。fetch main=3e615157，僅四份docs差異，未再次整合。

本輪安全保存見evidence/gaps-checkpoint-r1/manifest.json（最終SHA與收據索引），Git本機提交；原34份WIP SHA相符。原預覽5207／controller61048保持，HTTPS仍只存對話與記憶體。Owner Review／HOLD；不merge、push、deploy。下方為前輪完整停點歷史，最新結果優先。

第二階段工程候選與第三階段限定桌機驗收已完成；第四階段僅準備計畫。**Release Gate HOLD，停止於Owner Review，等Owner隔日確認。** 無merge至main／push／deploy；不得自動開始下一階段。

原CS a7398436及34份WIP保持，原r50核對後另存r51。必要Shader／RAF三檔在獨立checkpoint工作樹提交5fc2463b，沒有大型證據。整合worktree：C:/Users/ifikn/.codex/worktrees/ESMO/cs-map-v2-integration-20261107，分支rehearsal/cs-map-v2-main-20261107，基線7d59dab5；沒有git merge或cherry-pick。

第二階段收據：三圖正式UI快速練習各48/48；TD-FDR-01 49/49；Shader14/14、RAF7/7；三圖逐幀Replay無損往返；BP-9 Node1464/1464與112/112；browser normal11/11、slim-30044/44；runner runtime2935/35。progress2532/33與slim-cs3/4紅燈保留，完整根因見INTEGRATION_REVIEW.md。這些紅燈不洗綠，也不阻止Owner已授權的隔離桌機品質驗收。

122份FPS來源內容與5fc2463b相同；577份其餘main來源逐blob相同。整合產品Checkpoint b22b7a61，行尾整理8cd2584d；第三階段僅工具／文件，沒有產品修正。最終完整preview-r2的700來源／CS素材與vite指紋feeed6c82edbf1e41e7fc5549d8c6576e9c5ab513a6989497a032c066af83ab7，與第三階段diagnostic-r1相同；第二階段35b6來源至此只差EOF整理。pristine／完整預覽JS bundle仍皆b27a69e972c487422268aab421ad6d82194959999828732126c7cc87b815e370。證據在本目錄evidence與本工作樹review/cs-major-upgrade/evidence，禁止清理或提交原始輸出。

第三階段：phase3-long-r1完整Foundry原生1× 0→3864，6/6 PASS／native0，65次取樣約32.5分鐘；phase3-reset-r1三圖各三次匯入／reset／seek／返回／卸載49/49 PASS／native0。完整stdout／stderr／exit／audit／截圖保留。RAF平均59.53 FPS，最後窗口p95／p99 18.1／18.2ms，不是全局perf gate。Foundry重匯入返回取樣2118MiB，卸載10秒291.9MiB；Dune卸載10秒888.7MiB。無新Snapshot，不宣稱低RAM、零洩漏或全部Heap恢復通過。

獨立預覽localhost:5207/ESMO-/、控制61048，提供完整preview-r2及owner-review/報告入口；實際PID見evidence最終manifest，避免沿用已重啟PID。controller23764、cloudflared34716；原CS三組預覽全保留。HTTPS URL僅對話與controller記憶體。預覽包含完整main素材，三個雲端公開設定在建置時留空，不代替正式CI環境。

第三階段工具／文件的最終本機提交SHA以git log -1及evidence/final-checkpoint-r1/manifest.json為準；不將Git SHA寫死成自我參照提交。最終manifest另列原34份WIP SHA比對、收據／log SHA及預覽PID；原始大檔不入Git。文件入口：INTEGRATION_REVIEW.md、PHASE3_QUALITY_REVIEW.md、RELEASE_GATE_ACCEPTANCE.md、RELEASE_INTEGRATION_PLAN.md。

下一步只能由Owner決定：補TD-INT-01指定CS結算滿檔路徑、處置progress25文字斷言紅燈、真機／低RAM／CPU4×及其他長局矩陣，或審核具名接受範圍。Android、低RAM裝置、OS回收及實際熱降頻均NOT_RUN；CPU4×舊FAIL仍保持。再次正式整合前須重新fetch／pin main並比對六共享檔。不得自行重跑全部長測試、merge、push、deploy或影響其他worktree。
