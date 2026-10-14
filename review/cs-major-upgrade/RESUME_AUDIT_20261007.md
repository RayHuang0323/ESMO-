# 2026-10-07 續跑核對與未完成路線

此檔為停點核對／唯讀審查紀錄，不能當成階段放行。HEAD `0be09c2`，不動 MOBA、不 commit／push／deploy。

## 已接收，勿重做

- e7f57af9… 同源 CPU 剩餘 runner 10/10、native0，含 simulation24。
- e7f57af9… 正式 build native0、21.97秒。
- 78/78 PNG＋3/3 anchors 獨立複審已寫 `VISUAL_REVIEW_B7_FITTED_HUD_20261007.md`。17/30，不是 Premium；第三人稱袖1仍為 B 阻擋，不能用整體角色2挪到 E。
- 桌機60秒9/9、native0：59.412 FPS、p95 16.8／p99 16.9／max183.3ms、calls455、tri237870。
- 舊窄版perf60僅NOT_RUN隔離快照，無metrics／exit，接手無存活程序。已只補此未完成項：`phase-b7-fitted-hud-perf60-mobile-resume-20261007/390` 7/7、native0；56.427 FPS、p95 16.8／p99 33.4／max250.1ms、calls453／tri232624。無details所以不冒充桌機9項。
- e7桌機三圖 audio／ambient／animation／socket／pose／POV／衣料：`phase-b7-fitted-hud-lifecycle-desktop-resume-20261007` 111/111、native0。上述成果屬e7，之後袖修版不能借用為同版PASS。

## 本次第三人稱袖修正

- 原因：共用cloth shader的 `p.x≈0` 車縫落在身體中央，不在兩袖；全身y細摺未表達局部裁片。
- 僅第三人稱服裝派生geometry加入真 upperarm／lowerarm／hand 的袖座標，共享attribute 118,912 bytes；原骨架／權重／index／triangles／glove顏色不變。焊接頂點共同作≤7.5mm局部肘腕形變，重算法線與bounds。
- 只上衣私有material啟用獨立shader key與裁片線，POV／剛性裝備／褲子原模式保留。零新增draw／tri，不等於零成本：另有vec4 varying、shader variant及上衣fragment運算，須GPU量測。
- Node定向4/4 PASS、native0：角色87、socket63、POV37、服裝24。服裝原22項保留，新增雙袖mask位置／隔離2項；runner形狀同步24，未放寬預算或舊斷言。`b7-arm-pattern-scoped-20261007.*`保存完整log／exit。
- 唯讀增量審查沒有阻擋GPU的程式錯誤；肘軸約3.52°折角的圖面連續性、肩腕mask及實際袖質感仍未驗證。
- 新production取證第一次在Vite transform因 `heap out of memory` 結束，native134；第二次只減少工具heap至768MiB／semi8MiB，出現 `6298260 bytes failed`，native−1073740791。兩次均尚未進入browser產品斷言，列 **HARNESS_FAIL／BUILD_RESOURCE_FAILURE**，不是產品迴歸。完整log／native exit／isolation保留在 `b7-arm-pattern-desktop[-lowheap]-20261007.*`，不得覆寫。
- 當時系統可用實體約1.8–1.9GB、虛擬約1.2–1.6GB；未操作其他工作區或使用者程序。已請使用者釋放記憶體，先做文件與唯讀核對。待資源恢復後使用新phase重試正式建置與真圖，不改產品去掩蓋工具失敗。

## C 唯讀 audit（未實作、未放行）

沿 `EsportsFPS3D.jsx` 原canonical／route／safeMove／cadence做Major限定分支；legacy RNG呼叫順序與完整輸出hash不變。

1. C1：1587投出即blind、1765槍戰雙方flash=3與1672致盲懲罰混用；獨立blind與muzzle，blind只在1795真detonation。1621免費tactic smoke改真庫存投擲。1803–1812 defuser身份與中斷重置。
2. C2：純決策coordinator輸出route／anchor／aim／pace／utility intent。可見資訊＋TTL intel；1470低血撤退目前全知最近敵人。peek／hold／trade需決策→路線→位置→事件證據。
3. C3：entry／lurk／rotate／fake／execute擴充既有1440–1466 phase transition與1778–1783 postplant接點。fake需真到假攻點再轉場，lurk不能全知。
4. C4：crossfire不同合法anchor、retake真到點、save真撤離存槍、clutch真1vN時序、eco／force按stable team自己分差（1357–1360目前CT也收攻方分差）。

每段必要反例／決定性／三圖雙方檢查；用scoped runner並留完整log／exit。最終canonical／Worker完整輸出一致；`cs_major_simulation_v1`、`cs_match_completion`不可省略。source-extraction test loader需同步新helper import。

## D 唯讀 audit（未實作、未放行）

- `EsportsFPS3D.jsx:3922–3934` 名單與金額按side分固定隊名，1286換邊後錯置；Major改stable teamId，同份frame計錢／buyType，攻守獨立顯示。
- `:3630–3637` seek未清通訊、`:3675–3676`追加timeout可殘留未來資訊；倒帶即清／作廢舊timeout，以當前frame重建。ScoreBar3344已有roundHistCount，不重做。
- `:1855` ADR錯用當局dmgDealt除累計回合數；應由canonical agg+roundDmg計累計。KAST缺trade、clutch只判勝方末一人；C真事件到位後才可用完整語意名稱。
- `CsMatchResult.js` 未帶既有utilDmg，可必要optional向後相容擴充；UI缺資料顯示未知，勿偽造。
- 同次掛載的重播已seek(0)，不重算；跨掛載歷史還沒有保存frame通路。CS獨立frame匯入／匯出／同頁播放可維持Router／Store禁區，播放時不得呼叫simulator，不宣稱已有永久歷史replay。
- 最後才320／360／390／430正式狀態與舊結果相容。真手機FPS／觸控／safe area／音訊仍未測。

## 技能與邊界

已載入 Director、Gameplay Systems、AAA Graphics、Debug Profiler 與相關階段reference；UI／QA技能主檔缺失沿既有Director phase-playbook fallback，不冒稱已執行缺失技能。資產沿用既有授權／生成來源，本輪未新增外部資產。獨立C／D／B audit皆唯讀；owner統一修改。

最新實際工作狀態與下一步仍以 `RESUME_CHECKPOINT.md` 最上節為準。B未通過前不實作C；E十類皆≥2、平均≥2.3門檻不變。
