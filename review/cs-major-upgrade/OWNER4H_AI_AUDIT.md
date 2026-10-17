## 2026-10-18 Owner4H 工程完成，停 Owner Review

桌機驗收：http://localhost:5183/ESMO-/ 。正式無probe owner4h-pristine-review-20261018，source e8d9b1ebf3bd1244372647a44ea6ce616ec257f0d4c1b1de76a3de8ffdaa5af4（144檔）、bundle 1e3fa1b8391fbf610d3a30d34f9d37570a81f18f15b479a9161373ecde22f57c，PID 134304；HTTP逐byte吻合。HEAD仍4f168947；未commit／push／deploy，不改MOBA，既有D／E／F／G成果保留。

五項：真命中血花／環境血跡、室內路線利用、觀戰平移／旋轉／縮放／聚焦與POV鎖定、正常隱藏死亡X及可選分析、正式AI因果感知／方向掩體／近距補槍／守包回防／拆彈。另修POV透牆名牌／血條；音效／五職16能力／已通過美術保留。

固定三圖前後各六場：124→116回合，安包34→45，拆彈10→15，房間去重到訪70→158；不是勝率或戰術品質保證。公平性36次、9/9決定性；獨立350回合T51.43%／CT48.57%，原門檻通過、有限樣本不代表全域公平保證。

最新版GPU／FPS／正式流程與完整log見 OWNER4H_CLOSURE.md、evidence/owner4h-review-20261018/engineering-complete.json。4229幀／20回合保存Replay逐欄與Result相同、原容量不提高。手機真機FPS／觸控與長時間壓力未測；部分房間或安靜狙擊守包若未自然觸發，具名保留NOT_TRIGGERED。

■ 實作｜■ CPU／對局／公平性｜■ GPU／FPS｜■ 正式流程／5183／文件｜▣ Owner Review。工程剩餘0分鐘，Owner驗收由Owner安排。

# Owner4H 正式 AI Audit

## H4補充：狹窄架點與隊友通行

新版真保存對局驗到H3守包離位紅燈後，另Audit同隊路徑與站位預留：先前只驗終點不重疊，後續隊友仍會走過架槍者；碰撞將已完成route的角色推離後，主迴圈不復位。H4正式planFpsPostPlant增加同隊預留身體範圍的路徑檢查；fpsNeedsObjectiveRouteRecovery恢復已完成守包／拆彈掩護的合法路徑。只用隊友共享架點，敵方隱藏位置不參與。9/9定向與CPU10/10段已通過；公平性／新版GPU仍重驗中。詳OWNER4H_DESIGN.md及hold-failure-trace.json，原H3 9/10 PRODUCT_FAIL保留。

狀態：實作／驗證中；此文件不是完成宣告。

## 情報與決策鏈

| 項目 | 正式來源／消費端 | 本輪處理／判準 |
|---|---|---|
| 目視 | collectFpsTeamIntel → tacticalIntent → awareness → canEngage／reaction | 保留每個當下實際觀察者 visibleTo；本人可見威脅優先，不再被最後隊友覆蓋 |
| 最後位置 | 觀測當時 pos、observedAtSec，3 秒 TTL | 沒有視線不更新；記憶不追蹤敵人新位置；保留既有因果驗證 |
| 槍聲 | 真 muzzle／shotAtMs／發射位置 | 兩秒有效、4m／8m 近似區域、44m 一般／16m 消音手槍聽距、隔牆 ×.58；不授予 targetId 或射擊資格 |
| 隊友死亡 | 真 kill 事件的 victimSide／pos／roundSec | 只提供附近32m內己方死亡位置，3秒；不提供兇手隱藏座標 |
| 射擊 | canonical LOS／FOV／smoke／reaction／ammo／cadence | 沿用真排程，不用聲音直接開火，不指定傷害或勝負 |
| 視力與武器 | canObserveFps 與 canEngage 分離 | 不能把霰彈槍25m／手槍38m射程當視力；目視仍受vis感知距離、FOV、煙、實牆與致盲約束，拾槍／換彈／撤退不失明 |
| 掩體品質 | 同源牆體、身體碰撞半徑、方向射線 | 中心及至少一側肩線受近牆保護才算掩體；禁止只因靠牆便蹲下 |
| 暴露風險 | tacticalIntent 已知 threat → findFpsThreatCover | 選擇可達、實體不阻擋且有方向保護的位置；規劃避位只讀己方，不讀隱藏敵方佔位 |
| 蹲守／架槍 | resolveFpsWeaponStance、coverAssessment、移動量 | 只有實際靜止、方向掩體及適當戰鬥狀態才 crouched；不是 UI 狀態補丁 |
| 補槍 | 真己方死亡、已知兇手情報、距離 | 26m內的有限補槍機會；本人已見近敵則先穩定交戰，避免衝過對手／跨圖追擊 |
| 換位 | 既有 retreat／take-cover／peek；postplant 新報側翼 | 沿真導航；死亡、致盲、血量、炸彈責任仍有優先順序，不改 RNG／射擊結果 |
| 守包 | planFpsPostPlant 的職業距離、地形、真情報、預留點 | 保留已選位置，不每 tick 重選；新增房間中心作可評估的公開戰術位置，沒有強制進所有房間 |
| CT 回防 | 公開安包位置、實際 travel route、個人拆彈時間 | 保留 save／defuse-cover／責任鎖，不強制安全／失敗結果 |
| 拆彈威脅 | 有TTL同隊目視／槍聲區域、真牆／煙 | 正式開始／持續／完成均接isThreatened；未知近敵不能讓CT透視中斷；已知威脅仍中斷，時間／接觸／樓層／致盲資格不放寬。開始tick已中斷的人不得射擊後繼承原進度 |
| POV 敵方資訊 | 同正式保存幀位置、實體牆與煙 | H1真GPU抓到Mirage牆後名牌；H2單幀cache修正，室內19/19重驗。這是呈現修正，不用它改AI開火 |
| 交叉火力 | 同隊預留架點、不同角色距離、既有 crossfire route | 正式對局驗到點與分散站位；不能把不同 anchor 計數直接稱真人交叉火力品質 |
| 五職／16能力 | Owner4F 的 role-duty、posSkill、tactical capability 接線 | 保留已通過接線，不重做選手資料、成長、Result；本輪以正式對局檢查職業實際走位 |

## 公平性邊界

聲音可以透過牆傳遞有限區域情報；它仍不是視線。聲音不提供精準敵人位置、即時追蹤、目標鎖定或開槍許可。聲音圖層不依畫面音效是否開啟改變 Simulation，因為玩家音量不是角色聽力。

掩體佔位原本讀所有存活角色，會讓規劃受到未觀測敵人的位置影響。本輪改為只避開已知己方佔位；實際移動碰撞與角色分離仍遵循原引擎。

新增地圖中心僅來自原本 authored playable room。碰撞牆、裝飾建築、角色半徑、平台高度與已通過美術皆保留。九間房間局部穿越及兩出生點對兩出入口的連通已驗；GPU／正式路線利用另驗，不把 CPU 連通當作視覺通過。

## 指標與限制

- actor sample：存活角色 × 每0.5秒正式快照，非交戰／擊殺次數。不同對局回合數不同，不能只比較總量便宣稱改善。
- room visit：同一回合的同一角色進入房間內部算一次，去重；不是專業戰術成功率。
- tradeOver26Samples：快照結束時角色到意圖aim距離；決策後仍可能移動／分離，因此有少量超26不能反推決策取樣違規。規則反例驗決策時距離。
- postPlantMovingSamples 包含前往新架槍點，不能等同原地左右搖晃。仍須分離抵達前移動與抵達後穩定性／改位原因。
- 原版六場與新版六場固定三圖、505001／505002；不能代表全部戰術與 seed。
- 須保留原36次側偏／決定性及 FPS gate；未通過前不交付新版5183。
