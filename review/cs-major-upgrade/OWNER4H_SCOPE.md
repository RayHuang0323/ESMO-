## 2026-10-18 Owner4H 工程完成，停 Owner Review

桌機驗收：http://localhost:5183/ESMO-/ 。正式無probe owner4h-pristine-review-20261018，source e8d9b1ebf3bd1244372647a44ea6ce616ec257f0d4c1b1de76a3de8ffdaa5af4（144檔）、bundle 1e3fa1b8391fbf610d3a30d34f9d37570a81f18f15b479a9161373ecde22f57c，PID 134304；HTTP逐byte吻合。HEAD仍4f168947；未commit／push／deploy，不改MOBA，既有D／E／F／G成果保留。

五項：真命中血花／環境血跡、室內路線利用、觀戰平移／旋轉／縮放／聚焦與POV鎖定、正常隱藏死亡X及可選分析、正式AI因果感知／方向掩體／近距補槍／守包回防／拆彈。另修POV透牆名牌／血條；音效／五職16能力／已通過美術保留。

固定三圖前後各六場：124→116回合，安包34→45，拆彈10→15，房間去重到訪70→158；不是勝率或戰術品質保證。公平性36次、9/9決定性；獨立350回合T51.43%／CT48.57%，原門檻通過、有限樣本不代表全域公平保證。

最新版GPU／FPS／正式流程與完整log見 OWNER4H_CLOSURE.md、evidence/owner4h-review-20261018/engineering-complete.json。4229幀／20回合保存Replay逐欄與Result相同、原容量不提高。手機真機FPS／觸控與長時間壓力未測；部分房間或安靜狙擊守包若未自然觸發，具名保留NOT_TRIGGERED。

■ 實作｜■ CPU／對局／公平性｜■ GPU／FPS｜■ 正式流程／5183／文件｜▣ Owner Review。工程剩餘0分鐘，Owner驗收由Owner安排。

# Owner4H：戰鬥真實性與地圖互動

2026-10-18 接續 Owner4G，最高優先為正式 AI 感知、掩體與團隊配合。

## 範圍

1. 真命中血花、環境血跡與克制回饋。
2. Mirage／Dust2／Inferno 室內、出入口、高低差、碰撞、導航與路線利用。
3. 桌機左拖平移、右拖旋轉、滾輪縮放、雙擊聚焦、重置；手機觸控與 POV 鎖定。
4. 正常戰場不顯示大型死亡 X；戰術用途放可選分析圖層。
5. 正式 AI：目視／最後位置／槍聲／陣亡情報、掩體與暴露、蹲守架槍、補槍換位、守包回防與交叉火力。

原敘述稱六項，目前收到五項；已詢問，Owner 回覆「ok」，沒有具體第六項，不自行補造。

## 起點與安全邊界

- HEAD `4f168947`，既有 D／E／F／G 未提交成果保留，不 commit／push／正式 deploy，不改 MOBA。
- 起點 source `cf3d243e7f0f386fcd4bc79e44f3810b70aeea61e673d8db8754dca7021559d0`，141 檔，完整獨立副本 `evidence/owner4h-review-20261018/before-source/`。
- 起點 tracked patch、status、2984 個未追蹤檔案的大小／SHA 清冊已保存於同 evidence；原始包與 log 不加入 commit。
- 5183 目前仍為 Owner4G；Owner4H 尚未驗證，不可宣稱新版交付。
- 大型測試依序；每次保存 stdout／stderr／native exit。手機真機未測。

## 已定位根因（持續更新）

- 死亡 X 是 `EsportsFPS3D.jsx` 的兩片交叉 Plane，遠景依 radius 放大至 2 倍。
- Team intel 以 side＋target 儲存，最後觀察者覆蓋前者，導致其他直接目視者被標為 team-intel；影響實際停步交戰。
- 原 trade 只要兇手有情報便直追，不限距離，也未讓當前可視交戰優先。
- 原正式 AI 沒有聲音來源接線；新增只能基於實際發射事件與己方陣亡位置，不能用隱藏敵方即時座標。

## 目前證據

- 定向 perception 原版 2/6 → 修正 6/6；追加聲音因果後 10/10。不等同完整對局或 GPU 通過。
- Coordinator 初次 41/42：唯一差異是新 `visibleTo` 欄位；保留原 42 項並明確斷言該欄位後 42/42。
- 九間 authored room 實際 R=1.35 路徑均可通過，9/9。初次外探點碰相鄰建築造成前提錯誤，保留 r1／r2；r3 驗證合法出入口、實際每 0.2m 碰撞與完整穿越，不改產品或放寬穿牆標準。
- 最初 Mirage 505001 before 完整 24 回合；crouch counter 誤寫為 crouch（實際 crouched），該欄位無效，後續 v2 正確名稱重測；不把 0 當結論。

## 驗收計畫

- 固定三圖 × 505001／505002，前後各六場完整對局；保留原公平性 gate 與決定性。
- 計數是角色 × 0.5 秒取樣，非真人戰術品質或勝率保證；真 shot／plant／defuse 另計事件。
- 血花／標記／鏡頭／室內取新版 GPU 證據，含暫停、seek、reduced motion、窄螢幕；FPS 相對原 G 同設備同窗口。
- Simulation／Replay／Result／Competition 必要回歸，實際新版 pristine 5183 與 HTTP byte proof。

狀態：進行中，尚未 Owner Review。
