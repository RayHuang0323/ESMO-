# Owner4F：安包後、拆彈、逐槍音效與五職／16能力

本輪基線是 2026-10-16 開始時的實際 Owner4E 工作區，不是 HEAD 的舊產品。原始 FPS 檔案保存於 evidence/owner4f-review-20261016/before-fps；三圖種子 505001、505002，皆同陣容、crossfire 布局、完整 Major 對局，逐場序列執行並保存完整 stdout/stderr/native exit。

## 修正範圍與相容邊界

- T 安包後：以角色距離、真地形遮蔽、對包 LOS、隊友預約位置選擇持續的守包角度；僅 TTL 敵情證實新側線才重選，停止無目的掃視與追殺。CT 仍須以真導航回防。
- CT 拆彈：同一角色持有進度，真 C4 LOS、未致盲、可完成的剩餘時間；持續拆彈時停止移動與開槍，死亡／壓制／離位／時間不足中斷。不得強制指定成功或勝方。
- 槍聲：22 把正式武器均有個別音色參數，仍使用既有 CC0 實錄，單發一個聲源／原音訊 pool。換彈與空彈讀保存幀的實際彈藥及換彈時鐘。
- 五職：Entry／Lurker／Support／AWPer／IGL。舊 rifler 在新 Major 對局邊界轉為 Support，原值留 specialtyRole；不轉成 Lurker、不回寫選手／舊 Replay。Rifler 適性保留作武器專長；另以既有16能力建立獨立 Lurker 適性。
- 必須調整共用 playerModel 中的 CS 適性與 CS 席位描述，原因是現有 UI 正式分類仍欠 Support／Lurker；MOBA profiles、MOBA 引擎與資料寫入不變。Result、Replay schema 與 Competition 結算不變，仍跑相容 gate。

## 取證標準

同種子前後是實際比賽差異，不能將拆彈率上升自動當公平改善。需列完整比分、回合結果、守包站位／掃視與移動、拆彈中斷；新安全／威脅／隔牆／不足時間測例，舊公平 gate 與相容 gate；新 source 的硬體 GPU、正式流程與相對 FPS。未跑、逾時、環境失敗均不得 PASS。大型測試一次一支。

參考：Valve 官方 Sound Spatialization（https://blog.counter-strike.net/2012/08/3805/）用於位置辨識原則；現有音源授權見 public/audio/cs/c5a2/SOURCES.md。沒有複製官方素材。threejs-gameplay-systems／debug-profiler 沿用前輪已讀工作流程；其推薦的 threejs-audio-generator 不在已安裝技能中，使用既有 CC0 錄音與 Web Audio 接線完成，不需新增工具。
