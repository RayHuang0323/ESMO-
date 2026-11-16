# CS 戰報診斷 → 訓練 → 實戰追蹤 v1（介面提案）

2026-11-16；Owner Review。此方案沒有新增 Store／Progress schema、永久能力寫入或玩家端教練畫面。

## 單一資料源與最小接線

1. 讀既有 `CsMatchResult.analytics.version===1`，來源仍為 `fpsMatchAnalytics` 的真實 shots／roundStats／事件；不在報告重算另一套 rating、XP、首殺或勝率。
2. 用既有 `result.players[].playerId` 對回選手。舊 analytics 只有本場 actor id／姓名，先驗證己方姓名唯一才橋接；同名或缺 ID 標「無法確認」，不能拿 t1／ct1 當跨場選手身分。
3. 產生唯讀、可解釋的建議 view model：playerId、courseId、引用 matchId／competitionMapId／layoutId／role、樣本分母、理由、資料不足標記。這是呈現層推導，不寫回存檔。
4. 課程預估直接呼叫既有 `calculateCourse(player, courseId)`，不複製 Training 公式。實際排課仍由 Owner 操作現有 Training action，經世界日曆、既有 `applyCourse`／`growthLog` 結算；建議本身沒有發獎權限。
5. 後續三場再讀同一 analytics，以原創地圖身分、layout、角色與體能分組對照。對手強度若沒有凍結快照，只標未知，不拿當前年份 AI roster 回填舊場次。沒有匹配樣本就不宣稱改善。

## 首版可實作的三種線索

| 線索 | 候選課程 | 必須揭露的限制 |
|---|---|---|
| 至少3場、合計100發，命中比低於55% | `aim` | 門檻只是待審查的覆核規則；武器、距離與角色會影響命中，不能直接診斷槍法是唯一原因 |
| 首死比首殺多至少3次 | `positioning` | 先看突破／狙擊／支援的任務與位置；不能把勇於進點的角色一律判差 |
| 當前體能低於60 | `rest` | 優先排除狀態問題，不把疲勞當永久能力缺陷 |

`tools/propose_cs_training_followup.mjs` 是可執行的設計原型：用本輪自然封季存檔產生兩份建議，所有預估取既有 calculator，輸入逐值不變。尚未接玩家 UI，建議閾值不是已發布的平衡規則。

## 權威與成長界線

- Career 的合法成長仍由既有訓練／賽後結算、年齡、潛力空間、Learning、體能共同決定。Learning 的 XP multiplier 與 Training efficiency 是兩個現有消費端；不能把報告的「表現好」直接轉成無上限永久加點。
- XP／等級／天賦點由現有 Progress 接線；課程基礎能力成長由 calculator／applyCourse 決定，不能另寫「每升級加全部能力」。既有 growthLog 是成長證據來源。
- Online Competitive 只讀自己的權威快照；Career 建議與訓練不得跨進 Online／MOBA 權威。
- 暫不持久化 follow-up 任務。日後若需要跨重整的追蹤卡或訓練收據關聯，先提出向下相容介面，檢查 Claude 現役檔案後再交共享 Store／Progress owner。

## 下一次實作順序與驗收

先把唯讀 view model 接到既有 `CsProfessionalReport` 的個人表現分頁，以三場、十場趨勢與證據展開呈現；按鈕只開啟既有 TrainingScreen 並預選選手／課程，不直接排課。沿用 `useViewport`、GC、現有 report CSS；320／360／390／430px 與真機另驗。

驗收必須涵蓋：同名選手拒絕錯配、舊摘要戰報沒有 analytics 時顯示資料不足、場景版本不混樣本、潛力封頂／低體能／已有課程的真實預估、合法課程完成後 growthLog 與 statChanges 一致、重載不重發獎，以及後續同條件實戰差異。結果改善只能列關聯；需要因果結論時，另跑固定 seed／同敵方／同條件的合法成長配對模擬。

## 2026-11-16 v1已實作範圍（取代上方未接UI的現況敘述）

新增獨立「培養建議」頁保留原四頁，以同一csCoachingAdvice供UI及工具，收斂同layout／版本／角色樣本、同名拒絕；原真fixture的2項建議收斂為1項。僅預選Training，由玩家確認安排；calculator／成長／存檔均沿既有權威。UI位置用URL提示，不新增持久化追蹤schema；進行中session阻擋新入口。已驗真成長→刷新→下一場Worker消費、四種手機寬度與reduced-motion，未經真機實測。

同seed合法成長前後實戰已有可重現差異，但兩場都落敗，不以此宣稱課程保證勝率；三場自動追蹤與對手／武器條件完整分組仍未實作。詳review/cs-tactical-coaching-20261116/RESUME_CHECKPOINT.md與本輪新SHA收據。