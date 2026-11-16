最新續跑：請先讀 POOL_CLOSURE.md；以下保留4577c858時的原始停點，不以舊BLOCKED覆蓋新收據。

# CS Professional Expansion — 本機候選交接

2026-11-16；Owner Review。計畫尚未全部完成，不可整合／發布原創正式池。

## 分支與保護

- 分支 feature/cs-professional-expansion-20261116，沿用原工作區；起點 132bff5abd140df266f980d27d4d75ebfb2c12a8。
- main 回讀 7cf1cebc10915f096a256885388ecd8a7052e5f3；沒有 push／deploy／新增 worktree。
- Claude MOBA HEAD 77780df3、分支 feature/moba-tower-edge-v23；6 修改／2 未追蹤檔及未推送提交保留。CS 本輪修改的 Store／結果／選圖檔在該分支未推送差異與當前修改中沒有重疊。
- 34 WIP／歷史證據未修改或清理。既有依賴 Junction 沿用；只保存摘要與有限 PNG，沒有保存本輪完整模擬 Replay／Heap。

## 五階段狀態

| Phase | 狀態 | 真正完成／缺口 |
|---|---|---|
| 1 戰鬥可信度 | 部分完成 | 武器消耗端補任務鎖；三圖單 seed 反應敏感度；尚非16能力完整因果矩陣，沒有足夠證據硬湊第二、第三個產品修正 |
| 2 戰報 v2 | 部分完成 | 既有 analytics 增首殺轉換事件列，團隊頁顯示取得首殺後勝局；沿用唯一資料源。多場趨勢、經濟轉折解釋與完整手機實測未完成 |
| 3 成長閉環 | 部分完成 | 既有 Learning 結算／冪等／存讀通過，合法課程與真模擬輸入差異有證據；未跑完整 Career UI 訓練→正式賽閉環 |
| 4 正式池 | 候選／BLOCKED | original-v1 明確 opt-in、身分／layout快照、版本不符拒絕、結果真layout保留；新池 Browser 未完整通過，評分模型仍需原創身分分群，禁止宣布可安全接入 |
| 5 整合驗收 | 部分完成／BLOCKED | build、Progress／MOBA 回歸、存檔bundle及鏡頭恢復規則通過；新池視覺、BO3全系列、Replay與重整中戰鬥未完成；BP-9壓力段中止 |

## Checkpoint

- 4b04b1a5：Phase 1 任務鎖與敏感度工具。
- 63834f1a：Phase 2 首殺轉換分析。
- e3f83c4a：Phase 3 合法訓練／戰鬥輸入驗證。
- 110ee3a5c9ac7575f5cc8e57a5abd2c0a90e9c53：Phase 4 候選；確切 SHA 的 cs-professional-boundaries Gate PASS，cs-original-pool-browser Gate BLOCKED。
- 最後文件 checkpoint 由 git log 讀取；文件提交不取代前述受測 SHA 或擴張 PASS 範圍。

## 戰鬥 Before／After

consumeFpsWeaponShot 原本只拒絕死亡、換彈與空彈，未拒絕 _objectiveLocked；fpsWeaponReadyAtMs 卻已禁止相同狀態。反例在修正前實際 FAIL（fired=true），修正後4/4 PASS。這補齊權威消耗邊界；不宣稱既有正常 caller 每場都曾觸發此漏洞，也沒有調整命中率／勝負／RNG。

固定三圖、seed61001、同一名 t1，只改 reflex 30→90：

| 場景 | 平均反應延遲 ms（低→高） | 樣本數（低→高） |
|---|---:|---:|
| Confluence | 408.60 → 240.09 | 47 → 47 |
| Dune | 428.77 → 261.91 | 26 → 35 |
| Foundry | 405.53 → 235.32 | 34 → 28 |

不同能力會改變遭遇與比賽長度；此表是描述性敏感度，不是跨相同遭遇的因果均值，也不是勝率保證。未保存大型 frames。

合法 aim 課程案例：accuracy/reflex 50→52.2、energy100→85。另一真模擬案例 reflex78→79.5、accuracy72→73.8，同 Confluence／seed61001 的 roundDigest 改變。平均延遲265.32→265.43ms，遭遇數31→28，不能宣稱整場均值單調改善。該比較固定疲勞輸入以隔離基礎能力，並非整場 Career 結算或多次無成本訓練。

## 16能力與成長消費端

詳細既有接線說明見 review/cs-major-upgrade/OWNER4F_16_STATS.md；本輪未改能力公式。

| 能力 | 實際消費端／類別 |
|---|---|
| reflex | persStat(rxn)／反應就緒與機械交戰，直接 |
| accuracy | persStat(acc)／命中、爆頭、武器契合，直接 |
| apm | 機械交戰、視線轉向與行動，直接；不繞射速 |
| positioning | 架槍、掩體與交戰修正，直接 |
| mapAware | 視距、目標取得，直接；仍受牆／煙／FOV限制 |
| tacticalIQ | 戰術路線、回防與道具適性，直接／間接 |
| decision | 交戰判斷、拆彈執行，直接 |
| adaptability | 有門檻的替代路線與重定位，間接 |
| courage | 進退風險與交戰修正，直接／間接 |
| clutch | lastAlive 與低血交戰修正，直接 |
| focus | 反應、命中、架槍、拆彈，直接 |
| resilience | 低血執行衰退修正，直接 |
| comms | 有效隊伍情報傳遞，間接；不提供透視 |
| leadership | IGL 路線協調與隊友執行，間接 |
| synergy | 補槍候選與跟進掩護，間接 |
| learning | learningGrowth→csProgressAdapter 的 XP 吸收、Training效率，只影響成長；無局內槍法加成 |

這是消費端盤點，不是每項都完成新能力敏感度實測。局內輸入沿用 derived stats→fatigue→STAT_L2S→persStat。正式結果→csProgressAdapter→交易冪等→applyMatchProgress→XP／等級／levelGrowth（潛力上限）→players.stats；Training 走 calculateTrainingResult／applyCourse，同一資料再進下一場。Career 與 Online 權威沒有改動。

## 實際驗證

- 武器新反例4/4、Owner4F17/17、Owner4H11/11、首殺轉換5/5、Training8/8、池邊界12/12、既有Veto35/35、可玩BO3契約99/99、series46/46、鏡頭恢復21/21：PASS（各自 log 與 Gate scope 為準）。
- Learning R55 PASS；verify runner 的 progress25／regress／regress2 3/3 PASS；save bundle B1B PASS；Vite build PASS，保留既有大bundle warning。
- 舊池 Browser 24/24 PASS：只有原腳本涵蓋的選圖／交接／重整，不是新池全流程。
- 新池有選圖與快照恢復、實際原創 sceneVersion 傳入證據；完整戰報未取得。綁110ee3a5的 Release Gate：RESULT=BLOCKED exit=2，獨立 supervisor 300秒收尾，不修改門檻、不換seed、不改原失敗。
- 最初 Owner4F 工具缺 unique report 參數：工具錯誤，後續用新輸出檔通過。舊Owner4H工具抽函式缺mapKey／sceneVersion、來源呼叫數2已變3；只修工具上下文／來源斷言，原9/11 log保留，行為要求未刪。
- BP-9 slim 在20季容量壓力段中止：INTERRUPTED／exit -1，不算PASS。先前同跑CPU工作導致 Browser 準備逾時，初輪與重跑輸出全部保留。沒有因HARNESS錯誤調整產品。
- 完整新池BO1／BO3、Major自然晉級、真實逐圖／整系列獎勵、Replay往返、戰鬥中重新整理與新舊檔遷移矩陣：NOT_RUN／未完成，不能由契約fixture測試冒充。新池公平性矩陣 NOT_RUN。

本機證據根 C:\Users\ifikn\esmo-measure\cs-professional-expansion-20261116。包含逐次 stdout／stderr、敏感度摘要JSON、BP9中止記錄與有限PNG。SHA Gate收據在共用.git/esmo-release-gate/receipts；raw FAIL與BLOCKED不改寫。沒有把摘要另算成第二套產品統計。

## Owner預覽與下一步

本機 http://127.0.0.1:5189/ESMO-/ 。正式CS賽程進選圖後可見「啟用本系列原創三圖測試池」，僅供本機候選測試；預設池不變。新完成的比賽→專業戰報→團隊分析可見首殺轉換。Computer Use browser host不可用；已取得的是測試Chrome選圖截圖，不能宣稱全畫面驗收。cloudflared不在PATH，沒有安裝或啟動公開tunnel。

三項優先工作：

1. 先定位原創正式BO1（Foundry、seed64640情境）的場景準備／完成阻擋；用同seed／同roster、獨立資源與有限診斷，不能換seed洗綠。之後再補BO3全系列及真結算／Replay／恢復。
2. TD-CS-PRO-01：原創pool評分目前仍沿用legacy key的mapFit／style／history模型；需以competitionMapId與layout身分隔離歷史並校準，不得把測試選項當正式可用池。TD-CS-PRO-02：新池真實全流程與公平性未認證，維持release HOLD。
3. 補16能力／戰術成對敏感度與Career UI閉環，再擴充真事件支持的戰報解釋；保留既有CPU4×FAIL、Replay2118MiB、Android／低RAM／熱降頻NOT_RUN。
