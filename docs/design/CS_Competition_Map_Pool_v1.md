# CS Competition Map Pool v1 — Audit 與介面提案

2026-11-16；狀態：DESIGN_ONLY／Owner Review。沒有產品候選，沒有啟用正式賽地圖池。

## 實際基線與隔離

原工作區 release/cs-map-v2-beta-20261108，起點 d2540e56e169d69f63e27573332e839e9dec4e6f，工作目錄乾淨。遠端 main 即時回讀為 7cf1cebc10915f096a256885388ecd8a7052e5f3。沒有 fetch、push 或部署。

MOBA 現役工作區 D:\OneDrive\文件\GitHub\ESMO\.sprints\moba-v21-sprint0，分支 feature/moba-tower-edge-v23，HEAD 77780df3e4fe5dded402459d8455c20dec43bc88。相對 origin/main 有未推送提交（含 v23 freeze／v24 候選），另有 6 個追蹤修改、2 個未追蹤檔，包含 LogicEngine、matchRuleset、MOBA arbitration。全部保護，本輪不修改、不整合。node_modules 沿用現有 Junction；不新增 worktree。

## 已實作與文件落差

CS_賽事系統架構規格.md 開頭仍寫尚未實作，但實際已有 csMajor.js、matchSeries.js、csMapVeto.js、profileStore.js 與 MatchSession 接線。本輪回報此文件落差，不依舊標頭重做賽事系統。需由架構 owner 更新規格狀態。

| 系統 | 真實實作／應沿用 | 本輪判定 |
|---|---|---|
| Major | csMajor.js 使用 CS_BO3_MATCH_FORMAT，沿用 Competition fixture | 已有，不重建 |
| BO1／BO3 | csMapVeto.js 定義格式及決定性 AI veto；matchSeries.js 管理逐圖與系列結果 | 已有，不重建 |
| BO3 去重 | createMatchSeries 過濾 mapOrder 的重複項與非法 key；不足三張會回落 declaredPool | 新圖需重新驗證 fallback 與三張唯一身分 |
| MatchSession／恢復 | profileStore._withCsMapSelectionForSession 從 Fixture.matchFormat 建立 veto，優先恢復 mapSelectionByFixture；seriesByFixture 保存系列 | 權威接線位於共用 Store，不可只改 UI |
| 啟動 | launchMatchSession 從選圖生成 activeMatch.config.csConfig 的 mapKey／mapName／mapSelectionId | 必須凍結原創場景身分，不能由 UI 暫態重選 |
| 戰鬥 | CsMatchScreen 使用 config.sceneVersion，否則新場預設 major.v1；保存 csConfig 至 activeMatch | 單純解除練習限制無法證明重整／逐圖一致 |
| 戰報／Replay | CsResultScreen 支援 major.v3/v4/v5；fpsReplay.js 嚴格驗 metadata、mapKey、sceneVersion、layoutId | 已有保存幀播放，不重跑引擎；不可改 key 後破壞舊 Replay |
| 入史／獎勵 | 沿用既有 fixtureResultBridge、settleMatchBoundary、matchCommit 與 MatchSession 完成路徑 | 未變更；新圖全流程 NOT_RUN |

## 核心缺口：正式地圖身分尚未獨立

CsMapSelectScreen.jsx:67–69 明確限制 prototype 只能在 practice。Confluence Station／Dune Terminal／Foundry Circuit 分別沿用 mirage／dust2／inferno key，搭配 major.v3／major.v4／major.v5。csMapVeto.js 的 CS_MAP_KEYS 來自 csPrepData 的現役 key，normalizeCsMapPool 只接受該集合。歷史評分 historyScore 只以 row.mapId 分群；直接復用舊 key 會混合兩種地圖的歷史。Replay decoder 也明確要求 sceneVersion 對應舊 engine key。

因此本輪不直接解除 practice guard，不透過 URL 或 UI 暫態覆寫正式 fixture，也不使用另一份假 session／假結果展示通過。主要缺口涉及共用 profileStore、正式選圖／series 身分、結果歷史與持久化邊界，依 Owner 本輪第 5 點停在介面提案。

## 提議介面（未實作，需架構 owner 協作）

1. CS 專屬 catalog 定義 competitionMapId：confluence-station、dune-terminal、foundry-circuit；映射既有 engineMapKey、sceneVersion 與精確 layoutId。所有 UI label、戰術、啟動參數由同一筆定義派生。
2. 明確 opt-in 的測試池 original-v1；預設 legacy 池不變。套用範圍只限新建且尚未選圖的 CS fixture/session。已有 session、mapSelectionByFixture、seriesByFixture 與存檔不自動轉換。
3. Fixture.matchFormat 宣告 poolId/version；CS map selection 凍結可序列化 catalog snapshot／mapOrder。恢復優先使用已凍結身分，不讀當前 UI toggle。未知 pool/version 必須可讀地拒絕，不能靜默回退到 legacy。
4. profileStore 的 CS 分支消費 resolver 輸出，將 competitionMapId、engineMapKey、sceneVersion、layoutId 與 mapSelectionId 寫入既有 activeMatch.config.csConfig；不得修改 MOBA 分支或另建 Store。此接線需獨立協調與審查。
5. BO3 依 competitionMapId 去重，同系列不可混用 pool snapshot；完成兩勝提早結束，未打第三圖不發獎、不新增比賽。
6. 結果與歷史須能識別 competitionMapId／layout 版本；維持舊 engine key 的相容映射。歷史評分只比較相同真實地圖身分，舊資料保留 legacy 語意。
7. Replay 沿用現有保存幀格式與 decoder key 配對；新增識別資料只能在評估向後相容後接入。禁止在匯入時把舊 mirage Replay 改稱 Confluence。
8. Fixture AI 模擬投影 simulateFixture.js 與玩家路徑須消費同一凍結池／身分映射；僅改玩家 UI 會導致非玩家賽事與玩家對局採不同地圖政策。

尚待協調：上述欄位應掛在既有 matchFormat／CS config 的哪一層、SaveSlim allowlist 是否保留、history schema 相容策略。未完成資料流與 migration Audit 前不得寫入共用權威契約。

## 必要驗收矩陣（全部新候選 NOT_RUN）

- BO1：三圖各一次真實 fixture 對手→選圖→戰術→戰鬥→戰報→結果入史→獎勵→Replay→返回。
- BO3：三圖唯一順序、2–0／2–1 真實結局、逐圖戰術、對手 roster／seed、單圖與整系列獎勵帳本對帳；不可強制 winner 造案例。
- 重整：veto 中、已選未啟動、首圖中、首圖結果後、第二圖準備、結算後，各自恢復同一 fixture/session/scene，launch token／結算冪等。
- 相容：預設 legacy 池、舊存檔、舊三圖 Replay 匯入、原創保存幀 Replay、未知 pool/version 拒絕；BP-9／SaveSlim 不遺失必要識別。
- 公平性：固定版本／換邊／成對 seed，三圖每隊起始方比較；勝率樣本與已知 CPU4×FAIL、Replay 2118 MiB、Android／低 RAM／熱降頻未測分開記錄。不用診斷計數器代替真實比賽結果。
- 工具：受影響 C5V、series、competition、progress 冪等與 browser flow；長 gate 走 verify runner／browser supervisor，保留 stdout、stderr、exit、RESULT 與 SHA 收據。

## 本輪驗證與交付邊界

起點 d2540e56 的 Release Gate preflight 本機實際 PASS；這只證明 SHA／依賴／環境，完全不代表新地圖正式賽功能通過。本輪僅文件，沒有產品變更，不重跑 CS、MOBA 或大型 Replay／Heap 測試。文件 checkpoint 提交後再以精確新 SHA 執行 preflight；工具輸出以本輪回報為準。

沒有可驗收的 Competition Map Pool 畫面，因此不啟動會展示舊流程的預覽服務。cloudflared 不在 PATH，本輪不安裝。正式 BO1／BO3 新圖畫面、獎勵、Replay 與重整恢復均 NOT_RUN；不提供假入口或沿用 R4 PASS。

下一步：架構 owner 核定 map identity／session snapshot／history 相容介面後，CS owner 才實作 catalog、明確測試選項與必要接線，保持預設池不變。D 槽歷史資料與 34 WIP／證據不動；D 容量差尚未完整歸因。停 Owner Review。

## 2026-11-16 Phase 4：原創池最小候選（尚未整合放行）
新增 csMapIdentity 純解析邊界與 original-v1 三圖layout快照；profileStore只新增CS opt-in動作，首圖部署前可選，已有戰鬥／完成地圖不能切換。選圖與fixture帳本保存同一快照，版本不同拒絕繼續；原預設池不變。新增原創結果mapIdentity僅取真sceneVersion及raw mapLayoutId，舊資料不回填假layout，不做migration。純邊界12/12、原Veto35/35／series99/99與build PASS；原創池全Browser尚在驗證，不宣稱正式賽全流程或公平性通過。
