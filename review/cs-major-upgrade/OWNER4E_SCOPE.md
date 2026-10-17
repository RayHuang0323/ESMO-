# Owner4E：攜包／狙擊鏡／職業／音效／煙閃／專業賽後戰報

2026-10-15 使用者六項與追加驗收原則：五職與煙閃必須實際影響正式 Simulation；數據只用真來源；狙擊鏡、攜包與原創聲音依真狀態；不犧牲 FPS、不破壞 Replay／Result、不重做已過美術；階段驗證後交新版5183。未commit／push／deploy，不動MOBA。

## 實作

- 攜包：`!dead && hasBomb` 直接控制下方十人列金框、金色獨立 C4 標籤，不再藏在姓名截斷欄內。職業顯示實際指派 role 與 tacticalDuty／目標任務，專長留 tooltip。
- 狙擊：實際 POV 相機18°，圓形鏡窗／細準線，真槍口事件時間控制射擊回饋、退鏡拉栓與復鏡；移動／裝填／死亡／切視角不保留不適當開鏡。無新角色或武器美術。
- 職業：以正式CS_SEAT_ROLE五主職為準；entry首波、lurker側線、rifler補槍、awp長線與購槍、igl協調／目標。support為既有額外道具／目標職務，保留而不硬換主職；不更改名單／能力。CPU已驗每職正式路線／真存活任務樣本，底層已有真分工，並非本輪才用UI假造。
- 聲音：三份原創PCM與數學生成器，A／B不同音高，依真40秒剩餘時間逐漸加快，最後10秒切警示波形；event ID、暫停／seek與聲音池保留。不是官方原音。
- 煙閃：保留真正smokeBlocks、FOV／LOS、blindSec抑制情報／射擊的正式邏輯，新增唯讀flash-effect增量與smokeDeniedPairs。煙霧指標是敵對交戰線×秒，不是阻擋擊殺；致盲只計真新增時間，隊友另記。
- 分析：一個賽後聚合器讀roundStats／shotCadence／真事件與存活任務，生成十人、逐局傷害／經濟／比分、首殺／首死、trade／clutch、多殺、道具／目標／擊殺座標。Major Result只加可選analytics，深拷貝；舊Result形狀、發獎／入史不改。四分頁＋細節收合，GC token與SVG，不加圖表依賴，不在RAF算數據。非官方評級，未知顯示「—」。

## 已有真結果

- Owner4E36/36：三圖正式完整5v5；十人逐項對帳、五職真任務、煙閃非空因果、契約深拷貝、原創PCM、狙擊時鐘、加速音效排程。
- Mirage完整sim移除本輪唯讀utilityImpact與flash-effect後，與Owner4D tactical-exact-memo完整JSON SHA相等，不改位置／比分／回合／戰果／武器／導航等。
- audio26/26、pool22/22、weapon handling21/21；最新呈現純規則20/20；Replay UI51/51、Replay input15/15，native均0。原完整stdout/stderr已另存*-child-logs。
- 新GPU首輪因找5–6秒窄片段缺失，原0/1 PRODUCT_FAIL分類屬工具前提設計錯誤，原紀錄保留。改取真正「最後10秒」情境，門檻仍要求真來源與至少6次聲音；不改seed／場景。
- 第二輪標記／真FOV18／射擊退鏡等13項均通過，但音訊readiness最終HARNESS_FAIL。已獨立HTTP檢查確認產品路徑錯誤：WAV原在audio/cs/，載入器在audio/cs/c5a2/；HTTP回SPA HTML而非RIFF。已移到真正loader目錄（PCM bytes不變）並重建。不得把該輪稱完整PASS。

## 已完成前的停點（保留歷史）

新版diagnostic-owner4e-audio-20261015-1366建置中。接著HTTP真RIFF→新GPU播放→正式專業戰報四分頁／對帳／320/360/390/430排版→必要效能／相容→pristine→更新5183→Owner Review。5183仍Owner4D PID68400，不能當Owner4E驗收。最新官方週額度剩82%，5%（含以下）停工。

技能：沿用threejs-gameplay-systems、threejs-debug-profiler、debugging-and-error-recovery；本輪新增frontend-design，已讀全域ESMO_UIUX原則。設計採電競比分條／逐回合ribbon為識別，GC.gold我方／GC.blueL對手，FONT標題／MONO數據；一頁一分頁，數據細節按需展開。

## 最終收件

已交Owner Review，5183為owner4e-pristine-20261015／PID84740。新GPU播放19/19、effects25/25、同GPU效能19/19、pristine桌機與390px各49/49，完整HTML／JS／CSS／三份音效byte proof通過。最新資訊見OWNER4E_CLOSURE.md、RESUME_CHECKPOINT.md最上節與engineering-complete.json。官方週額度2026-10-15T13:39:02Z剩77%；未commit／push／deploy，不啟動下一階段。
