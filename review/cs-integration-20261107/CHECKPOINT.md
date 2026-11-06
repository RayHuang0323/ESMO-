# CS Map v2 隔離整合續作停點

第二階段工程候選已完成；Owner 2026-11-07追加授權後，接續第三階段可在桌機完成的品質驗收。整體Release Gate仍HOLD，尚未停工。第四階段只準備計畫，禁止實際merge至main／push／deploy，最後停Owner Review等Owner隔日確認。

原CS a7398436及34份WIP保持，原r50核對後另存r51。必要Shader／RAF三檔在獨立checkpoint工作樹提交5fc2463b，沒有大型證據。整合worktree：C:/Users/ifikn/.codex/worktrees/ESMO/cs-map-v2-integration-20261107，分支rehearsal/cs-map-v2-main-20261107，基線7d59dab5；沒有git merge或cherry-pick。

第二階段收據：三圖正式UI快速練習各48/48；TD-FDR-01 49/49；Shader14/14、RAF7/7；三圖逐幀Replay無損往返；BP-9 Node1464/1464與112/112；browser normal11/11、slim-30044/44；runner runtime2935/35。progress2532/33與slim-cs3/4紅燈保留，完整根因見INTEGRATION_REVIEW.md。這些紅燈不洗綠，也不阻止Owner已授權的隔離桌機品質驗收。

122份FPS來源內容與5fc2463b相同；577份其餘main來源逐blob相同。最終700來源／CS素材與vite指紋35b6eb1c046c2be602559942471b5dbd737d727de3ee48ca9855d502e848b579；受測／最終／完整預覽bundle皆b27a69e972c487422268aab421ad6d82194959999828732126c7cc87b815e370。證據在本目錄evidence與本工作樹review/cs-major-upgrade/evidence，禁止清理或提交原始輸出。

獨立預覽localhost:5207/ESMO-/、控制61048，preview PID41804、controller23764、cloudflared34716。原CS三組預覽全保留。公開首頁實際啟動2/2、本機／公開5頁內容相符；URL僅對話與controller記憶體。預覽包含完整main素材，三個雲端公開設定在建置時留空。

下一步：先保存第二階段本機Git Checkpoint，再做整合Build的完整長Replay、重匯入、記憶體、卸載恢復與三圖相容性。沿用已有可信UI／Replay逐幀／BP-9收據；只在新改動或新問題需要時重跑。Android、低RAM裝置、實際熱降頻均NOT_RUN，CPU4×與完整長局在實際驗證完成前仍未通過。
