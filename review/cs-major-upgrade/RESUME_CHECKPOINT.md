# CS/FPS Major Upgrade 可復原停點

## 最新有效狀態：Owner 要求 checkpoint 後停止（2026-10-05）

**此節優先於下方歷史中的「執行中／不 commit／持續工作」記錄。** 已收到明確停止要求；不要自行續跑，等待新 session 的「繼續」。

- 唯一工作目錄：`D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-fps-major-upgrade`；branch `feature/cs-fps-major-upgrade`，正式 baseline `1cf6472961528eeb3acfeb2558deadb4b425372d`。禁止改父層或其他 worktree，不 push／deploy／force push。
- 本次保存為 checkpoint commit，SHA 以該 branch 的 `git log -1 --oneline` 查詢。這不是 Phase B 完成或 READY_TO_REVIEW。
- 進度：A ▣（最低場景切片已有、最終 premium 品質未完成）｜B ▣（B1–B5 技術切片及 B6 人物改造／效能修正）｜C □｜D □｜E □。B7 武器造型／POV手／權威 ammo-reload-crouch 資料與環境音仍待；C 已有唯讀稽核方案，尚未實作。全案原估2–4工作天，不含休眠，恢復後需更新估計。
- 最新安全檢查：正式 `npm.cmd run build` exit0、19.84秒，Worker `fpsSim.worker-Pff2cLyg.js`；6區段 runner exit0，涵蓋 camera framing／gunplay sockets／animation lifecycle／weapon pose layers／POV／tailored clothing。累計20/120，**不是全套通過**；最新版正式 Worker 瀏覽器 hash 門檻尚未重跑。
- B6 材質隔離保留同樣幾何、色彩、陰影与DPR，避免蒙皮與硬質裝備共用材質狀態。`phase-b6-material-perf-long/1366` 7/7、exit0，60秒FPS59.9246／p95及p99 16.8ms／max33.4ms；source fingerprint `e93fa851bfc7b969dc790dd952c4e86ee337225892219322e656660739597500`（39檔）。之前同品質未隔離版本57.3948FPS／p99 33.3／max183.2ms，失敗證據保留。只有單图桌機長樣本完成，不能宣稱三圖／mobile全過。
- 近拍重測 `phase-b6-material-portraits/1366`：Mirage六視角與真服裝門檻有輸出，進入dust2時依Owner停止要求終止**只屬於本次測試的Chrome**；session46416已exit1、HARNESS_FAIL，cleanup確認profileRemoved=true／Chrome停止，不能把16/16部分斷言當完整三圖成功。此前60秒與近拍同跑也因另一隊已死亡而HARNESS_FAIL；不補造metrics、不覆蓋證據。
- 所有本輪 Node／GPU／build session 已收尾，沒有背景測試或工作中的子代理。證據／截圖／profile-builds 是本機資料，按AGENTS不提交生成物，仍留在同一worktree供下一session查閱；不要清理它們。程式、設計、verifier與本停點納入commit。
- 新瀏覽器gate已明確使用workspaceOnly，Chrome profile建立在本worktree的`review/browser-profiles`，只清理當次私有profile；其他gate預設行為不變。未改MOBA／Router／Competition／Result或Replay契約。
- 續接順序：讀本節→AGENTS與§0／handoff→`git status --short`和branch HEAD→查官方quota（最近88%，以新查詢為準；0%即停）→先重跑B6三圖雙尺寸、短近拍與死亡／正式Worker→確認效能無退步→B7→C→D→E與A最終場景polish。**不要 fetch後重建baseline、不要从頭重做A、不要自動合併main。**
- 真手機FPS／觸控／音效未實測；窄版UI遮戰場、槍械／靴子／材質精修、跨圖效能與A最終品質皆未結案。最終停Owner Review。

更新：2026-10-05（台灣時間）。此檔是當機／中斷後的導航，不是完成證明。

## 範圍與安全界線

- Owner worktree：`worktrees/cs-fps-major-upgrade`；branch：`feature/cs-fps-major-upgrade`。
- 正式 baseline：`1cf6472961528eeb3acfeb2558deadb4b425372d`。不得重新建立 baseline 或覆蓋目前改動。
- 不 commit、不 push、不 deploy；完成後停 Owner Review。
- 不動 MOBA、Router、Competition、Result／Replay 契約；必要 CS 擴充必須向後相容。
- 每小階段回報進度條、剩餘時間並保存證據。電腦休眠／當機會中斷行程；中斷的測試不得視為通過。
- 大工作前執行 `node review/cs-major-upgrade/tools/check_weekly_quota.mjs`；codex 每週剩餘 0% 時停工，不使用積分或其他模型規避。最新已量測剩餘 98%。

## 當前進度

`A ■｜B ▣｜C □｜D □｜E □`。A 已有階段證據，但不是最終頂級畫質宣告。B4 跑射分層動畫已寫入 handoff。B5、B6 尚未完成；C／D／E 尚待實作。全任務不屬於 READY_TO_REVIEW。

### B5 第一人稱槍械：優先修正

- 真五槍模型／socket／事件時鐘已實作，Node 25/25、正式 Worker 12/12 通過。
- 最新來源雜湊：`6e4f815687a337a8b3cfd207a28e2918de836efa63316625b94e72fe0082b941`。
- 初次桌機證據：`evidence/phase-b5-pov-production/1366`，技術 87/87，但 `mirage-pov.png` **沒有可見第一人稱槍或手**。這是實際視覺失敗，不能結案。
- 下一步核對 camera 是否屬於 scene；僅 `camera.add(group)` 不保證 renderer 遍歷 camera 子物件。補強 scene ancestry／投影與實際截圖驗證。
- 修正後另建唯一 evidence phase，重建正式 bundle、Node／Worker、桌機與 390 實測。保留失敗證據，不覆寫它。
- 390 的 B5 尚未量測。390 桌機模擬不等於手機真機。

#### 最新接續（2026-10-05）

- 已確認根因：camera 沒有加入 scene。major-only `scene.add(camera)` 已修正；legacy 不變。
- Node 25/25、正式 build 20.63s、Worker 12/12 通過；Worker 證據 `evidence/worker-production/gate-1791130133015.json`。
- 新 GPU phase：`phase-b5-pov-render-fix`；來源 `401bf403d6a065e2edf7c2d30bc034b9bb3827975aa9c4e9e5e6e643d256a9ad`，37 檔。
- 1366 全三圖 87/87 通過，owner 已看 Mirage POV，槍／手確實可見，但造型仍方塊化，列 B 階段後續美術精修，不能宣稱槍械美術完成。
- 1366 M／D／I FPS 59.091／60.101／60.000；p99 33.3／16.8／16.8ms；max 33.4／17.0／33.4ms；calls 634／650／673；triangles 52750／52974／57660。
- 新增「暫停 POV raster-only」3 秒獨立量測，約 60.2 FPS；不是活躍交戰或手機真機證明。
- 390 測試行程 session 41551 正在執行；Mirage、Dust2 初步 FPS 58.2／57.6，**存在需要追查的效能差異**。不得直接結案或開始增加人物幾何。
- 接著同品質、相同原生播放條件對照 B4 archived build 與 B5 新 build，跑 60 秒 Mirage，確認是否持續 regression。不能用換 DPR／降品質掩蓋差異。
- 390 已完成三圖87/87；Mirage／Dust2短樣本max166.7／150ms，無longtask，仍保留。兩尺寸24PNG已產生；1366像素12張MEASURED／0ERROR（advisory）。
- 60秒390同品質靜音對照已完成，`phase-b5-perf-ab-b4`／`phase-b5-perf-ab-current`各6/6：B4 59.991FPS／p99 16.8／max33.3，B5 60.020FPS／p99 16.8／max17.8ms；calls635／tri49852一致。不是POV模式，不能推論長槍POV成本。
- 接續開聲同品質60秒對照：B4 `phase-b5-perf-ab-b4-audio` 正在session95838；完成後執行B5 `phase-b5-perf-ab-current-audio`（referencePhase=phase-b5-pov-render-fix、390、maps=mirage、durationMs=60000、audioEnabled=true、frameTiming=true、state=combat、production=true）。完成後才能决定B5效能門檻，若仍回退先調查／優化。
- 已追加05 Sprint紀錄與06架構的B5未結案紀錄；00／08／design最終B5狀態仍待同步，不能只讀B4舊額度資訊。

### B6 人物造型

- 使用者明確要求改善粗糙、機器人般的 3D 人物。
- 唯讀 audit 已完成：來源 SkinnedMesh 被隱藏，可見球頭／Cylinder 四肢／RoundedBox 關節造成不連續輪廓。
- 建議 major-only 從來源 skin 衍生連續蒙皮衣服，**替換** proxy 而不是疊加；保留 65 骨、動畫、手骨 socket、legacy。
- 真 body 12,566 triangles／7,281 vertices；不可直接露出 superhero 肌肉或就地修改共用 geometry。必須計可見總成本、明確共享生命週期與 mobile shadow，實際 GPU 比較後才接受。

## 接手方法

### 最新 B5 結果與 B6 實作（2026-10-05）

- B5 60秒390開聲A/B也已完成：`phase-b5-perf-ab-b4-audio`／`phase-b5-perf-ab-current-audio`各7/7、exit0，B4／B5 FPS60.007／60.021、p99均16.8ms、max33.3／17.3ms；pool0drop／0error。未見持續回退，但原短尖峰仍保留，不作永久零卡頓宣告。兩尺寸像素24張MEASURED／0ERROR。
- 新B6模組 `fpsTailoredClothing.js`：從授權真body衍生geometry；12pass bind-space布料區平滑＋有限厚度；移除來源color、不使用superhero貼圖，5區共用kit材質。骨架與joint／weights不改；source geometry不改。refcount末一角色dispose才釋放共用服裝geometry。
- `FpsCharacterRenderer`僅optimized major啟用；舊C2c預設opt-out與legacy保留。kit skip batch將被替換proxy，隱藏26個球頭／袖／褲／關節／靴proxy，不疊加；可見triangle另計，約13726（source12566）。mobile garment不castShadow。
- 新 `check_cs_major_tailored_clothing.mjs` 15/15／exit0；registry已新增exact15，不刪舊斷言。初次getComponent不支援、raw array誤用interleaved導致NaN，已修正為getX/Y/Z/W與position獨立copy；finite／source不變已驗。首輪14/15是pause fixture從frame11回退default10，已改同一frame／同一player驗真正pause，不改產品邏輯。
- **B6未實際看圖／量GPU，不能結案。** 正式build session66383正在執行；接著先跑唯一新phase（建議phase-b6-tailored-first）desktop1366 Mirage details／pose／socket／POV原生量測，看圖後才擴其他地圖／390。不得與build重疊。
- 最新quota97%（UTC2026-10-04 16:25），下個大工作前再guard。B6切片估2–4小時，全任務仍2–4工作天。B5 display／clock切片可報完成但美術仍待，B整體與C–E未完成。

先核對 `git status --short`／`git diff --stat`、本檔與最新 handoff；檢查是否有仍在跑的 browser／verifier，再接續 B5。不要啟動重複 GPU 任務。正式 GPU 量測不可與 build／重型 simulation／來源修改並行。

### B6 第三版最新停點

- **Owner追加（2026-10-05）**：希望CS人物有帥氣服裝、風格與特色，臉部輪廓可辨，裝備及攜帶道具看得清楚。已寫design追加驗收；連續skin只是底層，不可把平滑綠色人體當最終人物美術。

- 初版正式build20.72s已過（BrudeUex Worker），但不是最新第三版build／Worker門檻。
- `phase-b6-tailored-first/1366` Mirage29/29／exit0、owner看detail：連續四肢較完整，但T上衣近膚色、頭戴被埋入；FPS58.529／p99 33.3／max50，calls465（B5 634）、tri167636（B5 52750）、geometry378、textures28（含真skin骨紋理）。不是最終品質／效能結案。
- `phase-b6-tailored-fit/1366`第二版29/29／exit0，olive衣服可辨，但放大頭戴後變蘑菇形。根因舊findBone從spine_03 fallback先匹配，head mount span .254，不是neck–Head .083。保留失敗圖。
- 第三版 major-only torso endpoint明確neck、head start明確neck+fixedScale .15、各頭戴local y+.35；legacy規則不動。B6 Node15/15重新過，尺寸斷言已補入。`phase-b6-tailored-fit2/1366` Mirage正在session48913；先等其結束並看圖，不能改source或跑另一GPU。
- phase_b_audit子代理重新啟動**唯讀**造型／資源review，不執行GPU／build／Node／下載。
- 接續：第三版截圖若可接受先增加原生garment身分／source共用／真正可見tri診斷；再三地圖雙尺寸、正式build／Worker與原verifier。原短樣本尖峰要同來源長樣本比B5追查，仍不得直接宣稱無回退。B尚未完成，C–E未實作。

- 最新補充：vest深度已校正，新原生garment3項gate已加入。`phase-b6-tailored-vest`32/32、`phase-b6-tailored-portraits`33/33；owner已看後者前側背，但wheel一次只縮10%，尚非足夠近的臉部特寫，下一輪要原生多次wheel並拍兩隊。
- 新skin會建立私有boneTexture；已補major renderer cleanup收集SkeletonUtils每actor私有Skeleton並dispose，Node15重新過、跨actor不提前釋放與重複dispose已驗。此改動**尚未跑最新正式build／Worker／GPU**。
- 現在沒有仍在跑的GPU／build／verifier。接續owner服裝／臉部追加設計與近鏡頭native兩隊6視角，再完整兩尺寸門檻。不要誤以旧session48913／15721仍在執行。

整體暫估 2–4 工作天；B5 修正與重測暫估 30–60 分鐘，依實測更新，並非保證時間。

### B6 接縫修正最新停點（2026-10-05，覆蓋上方舊session資訊）

- Owner服裝／臉部／道具追加要求已納入；仍需帥氣原創風格，不接受平滑人體作最終美術。
- `phase-b6-human-native/1366` 33/33技術通過但六視角美術失敗：褲腿裂縫、鋸齒領口。996個來源UV重複頂點獨立平滑後最大分離0.0992m。失敗圖保留。
- 現已改接縫共用變形鄰域／平均膨脹，固定布料與皮膚交界，不改來源geometry／index／UV／weights。Node16/16過、registry同步；05已記錄新增斷言原因。
- 原生遊戲重驗 `phase-b6-seam-safe/1366` 正在session6972（唯一GPU工作）；先等完、查exit code與兩隊六張近拍。**期間不可改render來源或並行build／重型模擬**。正式dist／Worker尚未重驗最新版。
- quota UTC2026-10-04 17:50:44官方codex剩94%，0%停，不消耗其他積分。B6／B／C–E未完成；無commit／push／deploy。

- **最新：session6972已exit0結束，現在無背景GPU／build。** `phase-b6-seam-safe/1366` 20/20（本輪只啟用部分既有gate，不能與上一輪33分母冒比）；source `6d34b4efaabb595430e3ad3846b76d3192adb6cadb8e76fcb6746127ba593033`（38檔），probe build19.66s，非正式dist驗證。FPS59.063／p95 16.8／p99 33.3／max50ms、calls475／tri185072、coldReady9426ms。
- Owner已看selected-front與opponent-rear：褲腿大裂縫消除，但領口材質區界仍鋸齒、頭戴／裝備／臉部造型尚待，近拍取景亦不一致；**美術仍未過**。下一步修服裝領口與頭戴／裝備設計，不能直接跳C。Node16/16已過；05已說明新增斷言、00／06／08已同步最新狀態。最新正式Worker／雙尺寸三圖與手機仍待。

- **60秒desktop開聲A/B均已結束，session83005／48968皆exit0，無背景工作。** B5／B6各7/7、FPS59.755／59.571、p95／p99皆16.8、max150／133.3ms，>25ms幀9／21；calls628→469、tri55088→187428；geometry634→418、textures19→31、material941同，texture估算31.611MB同。證據 `phase-b6-seam-perf-b5`與`phase-b6-seam-perf-current`。平均FPS差約-0.31%，但尖峰與三圖雙尺寸成本仍待；不可把probe技術PASS當美術／手機／整體效能完成。後續先領口／服裝風格修整與390對照，保留原尖峰、禁止並行GPU與重型CPU工作。

### 2026-10-05 持續執行最新停點

- Owner再次要求不因進度或補充需求回報停止；已補AGENTS協作記憶。原goal API仍顯示paused且tool不能resume，但使用者已明確繼續授權；不另建重複goal、不以回報結束任務。額度最新官方93%（UTC18:04:11），0%才依規則停工；仍不commit／push／deploy。
- major Head mount跟隨真Head bind旋轉差值； authored配件以model +Y-up定位，而非已有約17度傾斜的neck→Head軸。真Head y1.577–1.810、眼睛1.684–1.714、pivot1.600；配件位移改+.48 local。`phase-b6-head-bind-fit/1366`20/20、exit0，Owner看CT前背圖，大片頭皮裸露已消除。上一版collar-head仍露頭失敗圖保留。
- 新open Lathe折領合批、Node新真Head旋轉/還原檢查，17/17通過、registry同步。領線改Head bind pivot下3.5cm，不將neck權重延伸到肩膀當膚色；仍保留原65骨與skin weights。背心major-only改切角胸背Extrude板型、腋下缺口與收腰，肩帶向外、背包向後，legacy原cylinder不改。
- **目前唯一GPU：session13704，phase-b6-authored-carrier/1366，尚在跑。** 等完檢查exit與六視角，不能並行build／Node-heavy／source修改。接續390與同品質成本比；人物造型仍未結案，正式dist／Worker待最新版驗證。
- Phase C唯讀audit已完成，未改檔：canonical仍EsportsFPS3D.jsx，不抽取全引擎。C1優先major槍火與flash狀態分離、投閃只detonation生效、移除免費煙火、force買槍stable team換邊分數、連續單一defuser中斷重置。C2純tactical coordinator回傳route/anchor/aim/pace/utility，沿既有safeMove與cadence，真intel TTL、peek/hold/trade；C3 fake/execute/entry/lurk/rotate；C4 crossfire/retake/save/clutch/eco。C仍未開始，保護既有契約與legacy RNG／hash。
- D唯讀agent無法啟動（thread limit）；Owner後續自行按phase-playbook audit，不以此當產品阻礙。

- **最新唯一GPU session68554：phase-b6-clean-seams/1366，尚在跑；13704已exit0。** authored-carrier20/20但領／腰鋸齒美術仍失敗。新 `fpsTailoredSeams.js` 在cache-time衍生geometry局部分割領腰線，151新vertices／296tri、實際12862tri；原頂點／骨權重prefix不改、新點UV／weights插值歸一、逐面積守恆。Node19/19／registry exact19已通過；05記錄舊vertex/index斷言替換理由与14/17初次失敗。nativeprobe記實際12862及原12566+296、zero-crossing／coverage，不混舊參考build。先等68554與看图，然後390對照，正式Worker仍待。

- **最新唯一GPU session14422：phase-b6-close-framing/1366；68554／49138／90438均exit0完成。** clean-seams雙尺寸20/20已看圖領腰線鋸齒消除。major hidden updater 32→11（移除21）已補Node20與registry；5個相關runner全PASS，累計20/120非全案PASS。
- 最新390開聲60秒B6 FPS59.954、p95／p99 16.8、max50.3，>25ms幀3，calls486／tri187392；與B5同品質60.021／16.8／17.3、0尖峰、calls635／tri49852比較，平均差約-0.11%、尖峰風險保留。證據phase-b6-proxy-cpu-long/390、source5d1cd7a...（39檔），冷就緒7819ms包含Worker／asset；texture27.611MB同、boneTexture令count+12。
- source已追加manual chase縮近焦點漸回actor、min radius major2.7／legacy4.5、預設不變；camera helper tests16經runnerPASS。原生近拍改20次真wheel、半徑gate≤3，當前14422完成後看兩隊六圖，查exit；source已不同於上項5d1c，勿冒称同版完整驗收。
- 接續：近拍／死亡與三圖雙尺寸、最新版正式build／Worker門檻，再B7武器五族造型／POV手（非球盒模型）、可靠ammo/reload/crouch資料缺口、環境音；B仍未結案，C預audit完成但未實作，D／E待。不要因階段回報停止原goal。

### 2026-10-05 B6 桌機效能排查與人物截圖交付

- 舊 session14422、20861、31459 均已 exit0，不能再當作執行中。近拍 phase-b6-close-framing/1366 為20/20，已向 Owner 展示 T 正面、CT 正面與背面，位於該 phase 的 character-views；這是遊戲內製作中畫面，不是最終人物品質。
- source300f79a1d8bd861ab3d577dafa51112c82f35cd14ddba5d0183d0522ad2baeae（39檔）短樣本 FPS56.4／p95 33.3ms；phase-b6-close-framing-long/1366 開聲60秒為57.395／p95 16.8／p99 33.3／max183.2ms、>25ms幀65、calls478／tri192628，沒有 browser LongTask。7/7只代表功能門檻，不代表效能已接受。
- 同環境舊 B5 archived build 對照 phase-b6-close-regression-b5/1366 已7/7、exit0，約59.8FPS／p95 16.8ms、calls628／tri55088；新人物桌機退步須先查明、優化再做新美術，不降 DPR 或任意關陰影掩蓋問題。
- 最新唯一 GPU session24187：phase-b6-close-profile/1366，唯讀使用 phase-b6-close-framing build、60秒、profile=true／frameTiming=true／audioEnabled=true，預計輸出 mirage-cpu-profile.json。等待 exit 與形狀，期間不跑 build／heavy verifier 或改 renderer source。可能來源為蒙皮／陰影或 CPU，尚未確診。
- 任務持續，A最終場景品質未完成；B尚未完成、C／D／E未實作，沒有 commit／push／deploy。最近官方 weekly quota 剩93%，大型工作前重查，0%即停。

- 更新：session24187 已7/7、exit0，CPU Profiler 熱點是 WebGLPrograms.getParameters／getProgram 與 Skeleton.update；Profiler 約50.2FPS有量測負擔，不當正式效能值。讀取本地 Three r160 確認 material skinning flag 在 rigid/skinned 用途切換會重新選程式，服裝已隔離四個相同表面的材質实例並自身一次釋放，Node20/20 runner通過；05已記錄測試物件同一性斷言改為表面一致／不同用途实例的理由。
- session99051（phase-b6-skin-material-isolation）建置19.64秒成功，但60秒後近拍找不到另一队存活人物，RESULT=HARNESS_FAIL exit1，未產生 metrics.json；這是長量測與近拍取證時機衝突，不當產品成功。試圖 reference 該 phase 亦因缺 metrics.json 被 ENOENT 拒絕；不補造資料。
- 接續新 phase-b6-material-perf-long 只做60秒功能／GPU量測、重新建置；近拍另用10秒樣本。最新官方 quota 剩88%（UTC2026-10-04 18:54:21），0%停；此段30–90分鐘為排查估計，不是全任務完成時間。

### Owner 預告三分鐘內休眠：安全停點（2026-10-05）

- 已停止啟動新長任務；最新唯一現有測試 session43608＝phase-b6-material-perf-long/1366，production build20.14秒成功，已完成原生交戰seek與真音效手勢，等待60秒樣本收尾。若休眠中斷，這個 session 不算已通過；恢復後先查 exit／metrics.json，再決定是否重跑。
- 原始碼與截圖／證據均保存在隔離 worktree 的磁碟上。branch feature/cs-fps-major-upgrade、baseline1cf6472961528eeb3acfeb2558deadb4b425372d；沒有 commit／push／deploy。git diff --stat 已核對，未改受保護契約或 MOBA；不要 rebaseline 或清理未追蹤檔。
- 下次先讀本檔最新末節，查官方 quota，核對 git status，判斷 phase-b6-material-perf-long 是否有完整 exit0／7項門檻／metrics；如有即比較舊B5與新服裝。四材質隔離只是待驗修正，不宣稱效能恢復。接著另拍短樣本人物、正式 build／Worker、三圖雙尺寸；B7與C／D／E仍待，不從頭重做A。
- A ▣（最低場景切片已有、最終高品質未完成）｜B ▣（人物及效能修正中）｜C □｜D □｜E □；全任務估2–4工作天，不含休眠；恢復後此效能子任務原估30–90分鐘，須依結果更新。休眠不會背景執行；不冒稱持續測試。
