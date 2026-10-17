# B7 靜態矩陣候選排除與陰影成本診斷

本輪沿 c2a744dcf506122591e67ce4070e528c2bf093f291516ea28d3cc49b183e8f4a／59 檔與 bundle91a6 封存 production build 診斷，未修改產品 source。所有 run 使用新 phase，不覆寫舊結果。不是 B7 放行或正式 gameplay FPS 證據。

## 已完成與限制

- `phase-b7-matrix-integrity-20261008`：1/1、HARNESS_FAIL、native2。probe 暫停按鈕誤找 `⏸`，實際為 `❚❚`，未執行 A/B/A。
- `phase-b7-matrix-precondition-20261008`：1/1、HARNESS_FAIL、native2。新增完整前提輸出確認唯一失敗為 playing=true；Major／mapReady／atlas／roof warmup／10 rigged 均成立。
- `phase-b7-matrix-native-pause-20261008`：6/6、PASS、native0。static 73 個 updateMatrix 呼叫 73→0；pixel、local/world matrix、權威狀態與 flags 一致。A/B/A median26.60／24.50／24.10ms，恢復組也更快，不能由此判因果。
- `phase-b7-matrix-final-back-angle-20261008`：完整六身份四角度 gallery 前提通過、28 PNG 已保存；最後 matrix 完整還原檢查 HARNESS_FAIL、native2。r160 Euler.set 不支援第五個 update=false 參數，回調重算 quaternion；不是產品回歸。保留原 JSON 與完整 log，該 phase 不標 PASS；metrics.json 未落盤，不借其他 phase 的 metadata 充數。
- `phase-b7-matrix-exact-restore-20261008`：6/6、PASS、native0。退出時 finalMatrixDiff=[]、finalShadowRestored=true；73→0 updateMatrix、pixel A/B/A 與 stateEqual=true。median20.50／20.45／20.55ms。在此 paused scene 樣本，清除 static 更新未帶來可辨識的 submission 時間改善。

完整 stdout＋stderr 合併 log、原生 exit 檔與 GPU 前後隔離快照均在 evidence 的 `b7-matrix-*.log`／`.exit` 與各 phase isolation JSON；A/B/A 原始樣本保存在 phase 下 `mirage-static-matrix-diagnostic.json`。工具 PASS 只代表技術守門，不代表視覺或正式 FPS 通過。

## 方法

只走原生暫停 UI，等待 UI 播放鈕與 liveRef.playing=false 一致。單一同步 evaluate 內執行 A/B/A，RAF／simulation／camera 更新不能插入。前提含 actual major.v1、10 rigged、atlas、roof shader ready、default render target、live WebGL context 與有限 transform。

warmup 後保存全 scene local/world matrix、position／quaternion／Euler／scale 與 auto／dirty flags，另含 scene 外的 sun.shadow.camera、其 inverse 與 shadow matrix。比較使用 Float64 bytes；實驗清除 scene root dirty 及 worldGroup 全子樹 flags，保留 scene.matrixWorldAutoUpdate，避免排除 player／fx／light 成本。finally 精確還原，再檢查退出完整性。

每 sample 開始前 gl.finish 清空上一筆 GPU 工作，計時只包 renderer.render；因此為 **paused CPU render submission**，不是 GPU timer 或 active gameplay FPS。20 個樣本 median取中間兩值平均。A/B/A 順序仍可能受 driver／系統漂移影響；隔離只查前後是否存在其他 esmo-cdp gate，不能保證整機無其他負載。

唯讀獨立 review 已確認 Three REVISION=160 的 dirty／force 邏輯，指出 shadow camera／Euler／finally 缺項，已補齊。沒有依 profile 熱點直接改產品 static flags。下一步沿 B7 可見袖構造與效能問題繼續，C／D／E 未提前實作；不動 MOBA、不 commit／push／deploy。

## 暫停場景的陰影提交成本

`phase-b7-shadow-submission-20261008` native2／HARNESS_FAIL：pixel、狀態與完整還原一致，但成本形狀斷言失敗。Three r160 的 renderer.info 在 shadow pass 後 reset，不能用其 calls 值推論陰影 draw 已省掉。未改產品、未放寬像素或完整性斷言。

`phase-b7-shadow-draw-count-20261008` 6/6／PASS／native0：另用不計時的 sample 包裝四個 GL draw 方法，finally 還原原 descriptor；正式計時樣本沒有此 instrumentation。A/B/A median19.90／16.50／18.45ms，raw draw763→454；pixel、權威狀態、全scene與shadow matrix一致，finalMatrixDiff=[]，所有flags精確還原。完整log／exit／isolation與 `mirage-shadow-matrix-diagnostic.json` 保存。

B只在原生暫停時重用已完成的shadow map。這提供該樣本約2–3ms陰影提交成本線索，不能證明活動角色／槍／道具移動時可停用陰影更新，也不是正式 gameplay FPS。沒有把 shadowMap.autoUpdate／needsUpdate 候選寫入產品。
