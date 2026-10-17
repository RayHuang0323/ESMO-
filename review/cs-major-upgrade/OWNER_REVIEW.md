# CS Major Upgrade — Owner Review 收件報告

## 2026-10-18 最新狀態：Owner 人工驗收完成，授權 v1.0 正式發布

本節取代下方歷史停點的「未完成／不得發布」狀態。Owner 已明確授權：先保存正式成果、整合最新 origin/main、完成 Release Gate，再正常 push main、GitHub Pages 部署及正式站 Smoke Test。其他 MOBA／SeasonState worktree、分支與未提交修改必須保留；不得強刪 Git lock 或 force push。

已驗收產品 source：e8d9b1ebf3bd1244372647a44ea6ce616ec257f0d4c1b1de76a3de8ffdaa5af4（144 檔）；工程證據與限制見 OWNER4H_CLOSURE.md。新版整合後須重新驗證，不能以 Owner Preview 舊截圖代替 Release Gate。發布目前 PREPARING，尚未 push／deploy。

已知風險保留：真手機 FPS／觸控未測、長時或多次導覽尾端卡頓、長 OT Replay 原容量上限、三處室內未自然觸發；八煙歷史效能紅燈及後續公平資源重驗均完整保留。詳細 Release 流程見 RELEASE_V1.md。

## Owner4C最新實際停點：2026-10-14，每週usage剩5%停工（本節最高優先）

使用者確認 http://localhost:5183/ESMO-/，且無痕亦見牆閃/HE白閃；不是開錯網址，不能怪cache。上一輪只修Building6，不涵蓋Room/window其他共面，沒有做到視覺完成。本輪Owner4C未完成，停止新工作只安全保存；官方account/rateLimits/read於2026-10-13T19:22:19.607Z：used95、remaining5、pauseRequired=true。沿用使用者5%（含以下）門檻；目前goal=null，不創建/假稱paused goal。兩worker已完成並interrupt，沒有本任務背景測試在跑。

已套入src但尚未交新版Preview：HE同真正st.sampleGroundHeight，修Inferno to(80,74)平台2.2m但old contact=.58m埋地；原創64²火/煙alpha紋理(32KiB)替代雙Octahedron，暖Sprite/6 sparks/3 dust，有限資源/幀事件時鐘。Major移除blind角色4.2m白halo、worldflash縮.12s，保留真blindSec/POV白屏/傷害。Legacy的halo與worldflash舊顯示保留。12項Room/window局部實體分層修正，真窗門厚度/jamb保留，mesh58/instances32/14948垂直tri保持，canonical map/obstacles/fade footprint未變。

有效本輪資料：HE/flash/floor Before2/8 PRODUCT_FAIL→Applied8/8/native0；舊HE邊界7/7/native0。房間virtual guard8/8/native0、ported full geometry短audit/native0，Mirage候選2483→1709，pump-gallery/central-pump-hall/pressure-gallery目標eye-band歸0；仍不是全圖RGB驗收。所有原stdout/stderr/native保留。第一次patch Python syntax error未寫產品，誤名After2/8仍是Before/NOT_APPLIED；不要當已port regression。第一次真HE RGB 5/5是無效color oracle：brown背景也可warm、Inferno截到埋地位置，native0保留但不算色彩PASS；新observer已加入真surface高度及opaque ray，尚未新版跑。

唯一目前可用的新診断artifact：diagnostic-owner4c-20261014-1366、source 8692541d4cad0bd2117ad31c946a40d3bda806be973de1c9c7f6282ccaac522d（109份）、bundle ee42c524cc897d55e4ee8e38ed5b57627973bf9d5e0de2067ee9818315121579，buildOnly/native0，未GPU測。可直接續用，不需重build。5183仍owner4b-pristine-20261014/source087a4da…、session11892/PID134264，不能稱Owner4C READY。沒有新pristine、沒有更新服務、無commit/push/deploy。

續跑：先官方quota >5才新工作；用新diagnostic跑 tools/browser_check_cs_owner4c_he_pixels.mjs（supervisor -- 分隔args，maps=dust2,inferno；真surface/ray/暖contact onset+.03/.10/.25/.6實畫面）→真near-room移動POV牆面RGB→新pristine/正式flow/HTTP bytes→已核對own5183替換→文件。Mirage現有完整保存3854frames isolated HE NOT_TRIGGERED，不造場景/視線救測試。舊utility31/31的長flash2pair假設不再適用新.12s，需要更嚴格onset/expiry/無halo與真POVblind守門；不放鬆洗綠。原有效27/34/22ground、12contact、34tactical等無邏輯改動不重跑；B7/30/55/Legacy有效證據保留。

完整停點/限制/streams索引：evidence/owner4c-review-20261014/quota-paused-checkpoint.json；新source snapshots與before reports不覆寫。其餘1709候選、全角度/全時間/專業CS體感/手機真機尚待驗。■ 根因與產品patch｜■ CPU/建置｜□ 新GPU/視覺｜□ 新Preview；剩約10–20分鐘（估算，額度恢復後，不含休眠/中斷）。尚未完成，不得宣稱已修好。

## 以下為保留歷史收件


最新實際停點：Owner4B已完成，Preview session11892／PID134264；每週usage最新剩12%，5%（含以下）停工。最終收件 evidence/owner4b-review-20261014/owner4b-engineering-final.json。工程剩餘0，Owner／手機真機驗收待Owner安排。

## Owner4B最新收件：2026-10-14（工程完成，Owner Review）

桌機 Preview：http://localhost:5183/ESMO-/ 。owner4b-pristine-20261014、session11892；已核對舊PID147032/5183為本任務Preview才替換，其他服務/foreign/MOBA不動。正式build無probe、完整public，HTTP200且HTML與全部10個JS逐byte同archive。source 087a4da2c843a6cffe779435c2275397bff6dbf53621d3f90b55e3a9eeb17984（108份）、bundle e672dfb6f3e84555ec3090d8e8d6170d20fa0c746c109a196eaf6d80bd4d195f。

四項產品修正：保留pelvis經父座標轉換後的真世界UP位移；可見鞋底/屍體支撐點對同一份渲染floor triangles接地，死亡服裝先sync→sample/apply→sync，settled corpse快取。公共fallback使用正式LOS/局部clear-ray，保留TTL情報與合法corner預瞄。Mirage外牆內部端蓋/頂部腰線及箱體鋼條有真間距。HE改短暖色接觸/火花、棕灰塵煙，與閃光白屏區分，全部依保存detonation time，無新增scene light或傷害邏輯。

有效守門：真GLB接地27/27、99動態樣本34/34、HE7/7、front-wall5/5與awareness15/15；三圖contact12/12、tactical34/34與同seed JSON SHA一致、utility rules37/37。真Browser settled corpse/crouch22/22、smoke/HE/flash原生1x31/31、正式Dashboard→CS→Battle→Result26/26，皆native0。Mirage temporal140樣本/4 movies；固定POV40樣本像素一致、移動sample10/11人工看牆面紋理，出現的血條另為UI；本輪ROI .35與舊.65不同，不作RGB改善比值。CPU Building6 eye-band16→0、crate100競爭對消除；不是全圖視覺PASS，尚有2483幾何候選（不少內部/遮蔽），Owner仍須驗收全角度/時間。

初次ground整合22/27的SkinnedMesh bindMatrixInverse問題與settled corpse19/22的服裝穿地問題已修，原紅燈/native保留；runner缺唯一路徑的兩項拒跑屬HARNESS_SETUP_FAIL，設定後才真執行。不覆寫/洗綠舊證據。34/34的5mm診斷仍3個5.213mm超值，原8cm守門全過，最大動態可見接地誤差約2.5cm，不宣稱全5mm。死亡contactY現在記真取樣surfaceY，不再以rootY+offset誤報；最後只有診斷欄位差異，22/22與31/31的anchor來源可精確反推一致。

證據與限制總收件：review/cs-major-upgrade/evidence/owner4b-review-20261014/owner4b-engineering-complete.json；完整native/streams與child logs保留。舊B7/30/55/legacy等無關有效證據不重跑；legacy原安包NOT_TRIGGERED維持。手機真機FPS/觸控/視覺未實測，cloudflared未安裝，不給無效區網網址。專業CS體感及所有角度仍由Owner驗收。

每週剩5%（含以下）停工門檻已保存AGENTS.md與官方quota guard，取代3%。■ 修正｜■ 必要驗證｜■ Preview/文件｜□ Owner/真機驗收；工程剩餘0分鐘。無commit/push/deploy，不開始下一Sprint；完成後僅保留Review Preview服務，沒有宣稱未存在的背景工作。

## 以下為已保留歷史停點


## 2026-10-14 最終四項收件：工程完成，Owner Review（本節優先）

最新桌機 [Owner Preview](http://localhost:5183/ESMO-/)。正式獨立 owner4-pristine-final-20261014，session39140／PID147032；source 15ae830c7923ee71ad67a294500c2366a707cd5c8d8780e055e2eb32b2075d8d，bundle 4ae13686774921db249405c3cfa694645c287899d2f9ee466e27b13cf2bec834。HTTP200、HTML與全部JS逐byte同archive。
最後地面記號包含道具圈／球尾與A/B固定圓環／圓形填色均移除，保留A/B字母。實Browser31/31＋新pristine正式Dashboard→CS→Battle→Result26/26，native0與自有Chrome cleanup confirmed/profileRemoved；root人工看B點新PNG無圈。
最後兩個Major-only visible旗標精確反轉後，全部105份source/asset的SHA回到已驗LOD版本：ground-only-source-delta.json。所有simulation、pose、utility、shader、素材與controls不變，原contact12/12、tactical34/34、POV41/41（最壞5096<5200）、utility27/27與動作Browser29/29證據繼續有效，沒有重跑舊對局／30／55／B7。
最後工具首輪30/31把objective-site共用tag六個物件誤算為字母；保留原失敗與native1，再以實PlaneGeometry+CanvasTexture精確挑兩個字母，兩字母及visibility門檻未放寬。後續未改產品或scene/frame救測試。
主閱：review/cs-major-upgrade/OWNER4_CLOSURE.md；完整收件與所有native/streams證據索引：evidence/owner4-review-20261013/owner4-engineering-complete.json（SHA c5431308fc792196b2c3ab9b8eb0980cdc05c4a7cd60e840c9d9fee032fa2322）。前版所有source/hash/Preview收件只作歷史對照，本節為最新After。
Legacy完整JSON同c9，但原安包0仍2/3/native1 NOT_TRIGGERED；未改seed洗綠。Owner專業CS體感、所有位置／全時間視覺與手機真機FPS/觸控仍待驗收。進度條與剩餘時間偏好已保存在AGENTS.md。
■ 修正｜■ 必要驗證｜■ Preview/文件｜□ Owner／真機驗收。工程剩餘0；Owner驗收時間由Owner安排。沒有CS背景測試仍跑，僅保留Review Preview服務。僅停止核對過的自有舊5183／PID175048再替換，其他舊Preview與foreign/MOBA／未知程序保留。未commit/push/deploy，不開始下一Sprint。

## 以下為歷史收件；狀態以最上方最新四項收件為準


## 最新狀態：2026-10-13T14:21:47.631Z（本節優先）

READY_TO_OWNER_REVIEW：本輪五項與道具用途技術驗證已收件，桌機使用 http://localhost:5182/ESMO-/。完整來源／結果／限制見OWNER5_CLOSURE.md文末及evidence/owner5-review-20261013/gameplay-owner-review-final.json；舊停止／OPEN_REVIEW段落屬歷史Before。本root get_goal=null，沒有假造goal完成。未commit/push/deploy，手機真機與Owner體感待驗；沒有CS測試仍在跑，僅保留Review Preview。最後實際Git／程序／RAM／Commit見final-resume-state.json。


## Root停止註記：2026-10-13 UTC10:28

**尚未 READY_TO_OWNER_REVIEW；goal依User資源条件paused。** UTC10:21:30實測RAM2092MiB／Virtual Commit47.158of48.151GB，不足時安全保存停止、不再大型重跑、不降低標準。55對局／三圖動態／本檔新增pristine與UI8已收件，Root僅讀退出碼和來源，不重做。Utility45列仍OPEN_REVIEW、purchase purpose仍未補；下方「停Owner Review」不是本goal已達成。Root沒有新增Utility runtime修正，下一步沿具名實際context修購買／使用錯配，資源充足且User恢復時才接續。

本root get_goal實際存在且已paused；下方其他流程的get_goal=null不可替代。新preview5180與舊5179、未知Chrome metrics均保留，不終止未知session、其他worktree或MOBA／Claude程序。不push／deploy／Release。最新停點完整指向 `RESUME_CHECKPOINT.md`。

## 2026-10-13 v11 最新收件：Owner Review 有未結項

**OWNER_REVIEW_WITH_OPEN_ITEMS；Gameplay Closure 尚未全數關閉。** 本次產品沒有新增修改；完成既有證據判讀、pristine build、正式選圖補驗及逐列 Utility 審核。不 commit／push／deploy，不動 MOBA，不重跑成功對局或 B7。

### 七項結果與實際邊界

| 項目 | 根因與既有修正 | 最新證據／判定 |
|---|---|---|
| 英文地圖名 | 呈現別名覆蓋 canonical name；保留 mirage/dust2/inferno id，以 canonical display name 顯示 | 新 pristine 正式 Dashboard→CS準備→選圖，8/8 RESULT=PASS、native0、20.719秒。三卡與確認文字真 UI 可見。舊 config/result 中文優先情境只限 source proof；Battle／Result UI NOT_OBSERVED |
| 移動動畫 | stale metadata velocity 與真位移不一致、GLB步幅未對齊 | current→next 真位移、GLB stride；既有 v6 Browser 16/16 native0包含 idle／1×與2.4×，v9 consumer來源逐byte證明保留。未重跑；真手機步態未驗 |
| 第一人稱 | Orbit heading 可蓋過權威 aim | Major POV 使用權威 aim，原生拖曳驗證在同一16/16；v11三圖真POV near .18、固定與播放採樣。overview／tactical／spectator near1；Legacy .1，不把source proof當Browser |
| 回合／腳步音效 | 同frame同步腳步與stale velocity、遠距音量底限 | 真位移步距、獨立相位／距離衰減；既有16/16真開聲跨回合420/620双音一次，pause/resume不重播。Before未證round-start本身重複，不捏造根因；音色與真機聽感留Owner |
| Tactical AI／Bomb | lane混合、entry持包、遠距接觸鎖死execute、Inferno支援lane偏離site、Mirage出生長視線 | 55/55真完整對局，current52＋v9 renderer-equivalent3；九類真物理戰術、不同導航、Fake48抵達／後續40 execute、preplant rotate137。因果錯誤0、十人20m集中0；不以安包率當必勝門檻 |
| Utility | 隨機買／丟、缺保存庫存與CT用途；T lurker購入無計畫HE | v9角色kit與真敵情／進點用途，全部三圖四類均有投擲。**45列反覆購入零投擲OPEN_REVIEW**；逐列核對真T/CT、抵點／死亡／live reasons。17列lurker HE/molly未用紀錄全為換邊CT，不是T錯買。purchase purpose缺保存，不能證每次購買合理；不隨機丟洗率、不刪道具、不將death當豁免 |
| 光影閃爍 | 不同paint薄面共面、Major包點透明depthWrite與大near/far比例 | 共面170/236/228→0；標記分層／DWfalse與Major near1。Dust II、Mirage已有樣本判讀沿用；新增Inferno四模式24原RGB樣本未見同型放射跳閃，140樣本SHA全核。僅96×64 ROI與代表影格，不等於全圖／所有事件／真手機完全無閃爍 |

### 真完整對局統計（非預設結果）

| 地圖 | 對局／回合 | Plant A/B | Carrier到點回合 | 未plant且T全滅：未抵點／曾抵點 |
|---|---:|---:|---:|---:|
| Dust II | 23/435 | 28/186 | 245 | 125/13 |
| Mirage | 16/354 | 195/44 | 258 | 18/17 |
| Inferno | 16/310 | 51/43 | 129 | 73/20 |

九類Default／Rush／Split／Fake／Execute／Lurk／Rotate／Retake／Save全OBSERVED，三圖不同真導航集合18／10／12。每回合carrier死亡鏈、T死亡、首接觸座標／LOS、CTrotate、route/phase/role與道具ledger由既有58MB摘要索引，不複製raw、不重sim。最近node Voronoi不是canonical區域polygon；未安包終局事实不等於完整策略動機。

新購入使用歸因（flash/smoke/HE/molly）：Dust II54.3/71.0/64.2/56.7%、Mirage55.6/74.4/55.6/49.3%、Inferno58.6/82.5/39.6/48.7%。這是保存購入物件與carry ledger的EXACT歸因，不拿Before初始庫存比例混比，也不設100%使用率目標。45列審核表在 `evidence/authenticity-closure-20261012/final-v11-utility-review-20261013.md`；計數是chooseContextUtility呼叫觀測數，非秒／獨立道具數。

### 失敗與來源保留

原55摘要PRODUCT_FAIL的20個Fake抵達錯誤是工具誤拿同tick轉真攻後frame位置；既有修正檢查事件當下event.pos、原<6門檻不变，48事件0錯誤、3個反例guard，後續execute非空。修正工具native0；原報表／完整stdout/stderr/native保留，**原reduced.md仍是歷史失敗，不可當最新結論**。最新判定只讀 `tools/.cs-major-verifier-recovery/authenticity-final55-v11-acceptance-corrected-review-20261013.json`。

本次labels-only首次0/0 native2 HARNESS_FAIL：工具substring把teardown `===`當成探針assignment。只改 `tools/browser_check_cs_canonical_map_labels.mjs` 為assignment識別 `(?![=])`，3/3合成guard證明保留拒絕真注入；不改產品或build，不放寬八項UI斷言。原失敗與必要fixed輪各自保存。原Inferno timeout、Mirage清理HARNESS_FAIL、原native0xC0000409 UNKNOWN及摘要OOM均保留；不混稱產品迴歸或全PASS。

最新pristine Vite build native0／47.925秒，完整stdout/stderr/exit保留；沒有探針assignment／callback，bundle SHA256 `dc88c07031b001ab652f8af54e947eea8faa1990c7ddeece7219630057cd1616`。產品main SHA仍 `d435c4bdeb422c8f1eb36f5ac22970b6181eb70900c034a0c379ae50b023c2fe`；simulation domain `67d916a1e909ef1d83b58e2975c35fd264d97b29c60ff9c58a93ef767793d19c`。build既有大chunk警告保存，不夾帶重構。

### Preview與未結項

新桌機 `http://localhost:5180/ESMO-/`，正式dist，preview session42902。舊5179與未知Chrome ProcessorMetrics186296保留；沒有停止任何其他worktree／MOBA／未知程序。labels gate owned Chrome/profile清理確認；完整程序快照由final-v11-resume-state保留。

`cloudflared`不在PATH，本次未安裝／未建立手機HTTPS tunnel。手機4G不能用localhost／區網IP；真機FPS、觸控、safe-area、聲音與光影仍未實測。

下一步停在Owner Review並保留Utility未結風險；**不宣稱七項完全Closure或Release ready**。若要關閉45列purchase-purpose風險，需先補可靠購入目的／每道具用途窗口證據並針對具名案例驗證；既有55有效結果不重跑，source若改才按精確domain重驗受影響案例。此為明確未結項，未擅自開新Sprint。

本次使用gameplay-systems（gameplay-workflows、game-design-level-design與checklist）及debugging-and-error-recovery；沿用原玩家契約：賽前部署→觀察控制／進點／安包或回防→戰果與經濟，不新增手動FPS。真輸入／壓力／回合結果已有限定證據，Utility購買品質與真機感受仍有未結風險；不宣稱premium完成。帳戶quota最新remaining69%／pauseRequired=false，工具get_goal=null，不造goal進度。

完整最新收件JSON：`evidence/authenticity-closure-20261012/final-v11-owner-review-20261013.json`；Inferno判讀JSON：`final-v11-inferno-visual-review-20261013.json`。本次工具／文件修改未commit。



## 2026-10-12 UTC18:10 額度3%停止／Goal暫停

User要求剩3%停止；root官方 account/rateLimits/read 在2026-10-11T18:10:20.544Z實測 used97%／remaining3%／pauseRequired=true。停止所有新工作，通知C／D／E收尾，保存結果後將本輪active goal設paused。這不是完成，也不是READY_TO_OWNER_REVIEW。

C無在跑simulation／runner，v8三圖已3/3 execution/native0，完整logs／segment／runnerstate／checkpoint、唯一Miragegzip與source domain、真heatmaps／shot／plant／carrier／CTrotate／Utility ledger已保存。最新詳表：tools/.cs-major-verifier-recovery/authenticity-v8-three-diagnostic-review-20261012.{json,md}；來源domain ccaaf20ca7fcc6cc774d0779580674eed28c672e7c26064905b4ab976913fb1e。不得重跑v8已有PASS；55矩陣尚未啟動，UI各tactic選擇未觸發標NOT_RUN，不能當完成。

E v8 After在停止檢查時已自行結束，沒有執行taskkill，不能記成TIMEOUT／人工中止：可靠Node wrapper trueclose native0／signal=null／191084ms、38/38 RESULT=PASS，12series420samples已保存；CIM before/after taskBrowserRoots0、ownedChrome已收尾。完整stdout/stderr/exit/isolation及movie：evidence/authenticity-closure-20261012/owner7-temporal-v8-after*。原通知時的『partial立即停止』是收尾前狀態，後續以實際已落檔結果更正；未在額度門檻後做v8影片判讀。collection38PASS只證前提／markers材料層序／camera movement／console／shader等assert，**v8可見閃爍After判讀未完成**，不得升格視覺Closure。

剩餘：① Inferno t4 Craby/lurker HE購入9／整場投0，按真側翼目的檢查kit與投擲窗口（不能隨機丟、不能把death518次當豁免）；目前尚未修改成v9。② v8動態12movie必要視覺判讀與Before包點共面VISUAL_PRODUCT_FAIL比較。③ source固定後55情境完整對局（同source／全input一致的v8三場可復用；若修AI source則必要新三場、再合法52新場，不借舊PASS）。④ 最新pristine build／Owner Preview及7項最後RootCause／BeforeAfter／完整統計收件。真機FPS／觸控／實際視覺仍未實測。

目前產品維持v8，無新source修改。B7 390GPU45/45/95720ms與不相关藝術不重做，MOBA不動，無commit／push／deploy／Release；舊localhost5179仍是舊dist，不得作新After驗收。恢復需先官方quota，再讀本節／git status／最新evidence；只接未完成項，不重做已PASS。



## 2026-10-12 UTC18:08 v8實際結果／3%守門收尾

尚未 READY_TO_OWNER_REVIEW。User再次要求剩3%停止；官方18:07:54實測仍4%/pauseRequired=false，不假造3%。C已停新工作且無在跑simulation；55矩陣未啟。E只收尾既有v8 After session37971，root守門達3%即安全停止／保存並pause，不再展開新對局。

v8 production prepare native0/21654ms：evidence/authenticity-closure-20261012/after-v8-build.*，archive diagnostic-authenticity-v8-20261012-1366。三圖完整真对局native0/3 COMPLETE：Mirage20回合plant12(A12/B0)、carrier13/20；Dust II18回合plant3(A0/B3)、carrier4/18；Inferno14回合plant4(A0/B4)、carrier4/14。source domain ccaaf20ca7fcc6cc774d0779580674eed28c672e7c26064905b4ab976913fb1e；各圖庫存／移動因果0、十人同node／20m聚集0。完整round heatmap、A/B/Mid/Spawn、first contact坐標/LOS、plant/carrier、no-plant事實、17個preplant rotate與道具用途位置在 tools/.cs-major-verifier-recovery/authenticity-v8-three-diagnostic-review-20261012.{json,md}，索引所有原stdout/stderr/native/checkpoint。UI f1/f2/f3/f4/f5/f6/f8尚未按55固定plan跑，NOT_TRIGGERED／NOT_RUN不當PASS。

新購入使用率（flash/smoke/HE/molly）：Mirage57.6/72.9/54.4/66.7%，Dust II60.9/78.2/35.6/76.9%，Inferno60.0/81.3/36.8/68.2%；投擲53/51/36/8、45/45/21/12、38/40/19/18。Before缺購買ledger，不能拿初始庫存使用率當purchase-to-use。

剩餘實質問題：Inferno t4 Craby/lurker HE新買9次整場投0，live no-use counters買216／无intel窗口332／out-of-site26／dead518／blind12（呼叫次數非秒），不能以死亡多直接豁免。續跑先按lurker真側翼／情報任務audit其HE購買目的与用途，不能隨機丟、不能刪assert洗綠。修source後再必要三圖，只有同source／input才能復用進55。

D人物／POV／開聲真跨回合Browser已16/16/RESULT=PASS/native0完整保存，僅適用真v6資料與精確未改consumer；E v6 collection35/35/420sample有真Dust II包點共面視覺PRODUCT_FAIL、Node nativeUNKNOWN，不能當全PASS。v8 Major marker DWfalse／.12/.115/.14與RO11/10/12已修，Legacy原狀；E v8 After當前RUNNING，結果依其可靠Node wrapper.exit.json取實，不能預寫PASS。browser/console0與shader无unrunnable只指已完成v6，存在Three.Encoding deprecation warnings。

不動MOBA、不重無關B7、不commit/push/deploy/Release；舊localhost5179仍非新After；最新pristine build／Owner Preview尚待，手機FPS/觸控/實際視覺未實測。


> 2026-10-12 Owner 七項桌機問題已重開 **Gameplay Authenticity Closure**，目前尚未 READY_TO_OWNER_REVIEW。下面是較早收件基線，不能當新增七項已解。最新進度與真對局證據見 [AUTHENTICITY_CLOSURE.md](AUTHENTICITY_CLOSURE.md)／[RESUME_CHECKPOINT.md](RESUME_CHECKPOINT.md)。Release／Performance Closure 停止，禁止 push／deploy。

2026-10-12 本地。■ A｜■ B｜■ C｜■ D｜■ E，已停在 Owner Review，等待人工驗收。沒有 push／deploy／commit，沒有修改 MOBA。

## 可驗收成果

- 三座原創競技場域、真 rig 人物與五族武器、權威射擊／換彈／受擊／死亡呈現、聲音生命週期。人物完成度依 Owner 接受目前美術的指示收尾，原獨立審查 1／U 與遮擋限制保留；沒有新藝術 PASS 或90分量測。
- Major-only 戰術：真 flash／煙霧／燃燒因果、單一拆彈者、視線情報記憶、peek／hold／retreat、真 entry／lurk 路線、多人交叉火力、到達假攻點後轉進、trade／clutch／save。C 模擬域逐 byte 保存，沒有重写 Legacy 模擬或 MOBA。
- 觀戰 HUD 移出戰場；隊伍五人身份固定，攻守另外標示；金額、KDA／ADR／KAST／utility damage 與逐回合十人結果來自真資料。320／360／390／430px 分段檢查、44px 控制、safe area 與 reduced-motion 已接。
- CsReplay.v1 保存完整權威幀；原生 gzip／JSON 匯入匯出、倒帶／暫停／seek、可見回合 prefix。重播隔離 simulation／Worker／Progress／completion／QuickFinish，退出返回正常比賽原游標。新增壞資料防護與合法 Legacy 保存重播退出流程補驗通過。
- CsMatchResult.v1 僅 Major 新增可選 `sceneVersion`／`roundDetails`／`utilityDamage`；Legacy 舊契約、Reward／Store 原交易路径保持。正式 UI 已驗一次入史／入帳，返回無重複發獎。

## 驗證收件與證據

| 項目 | 真正結果 | 完整證據 |
|---|---|---|
| B7 指定390 GPU | 45/45 PASS、native0、95720ms；本次不重跑 | diagnostic-b7-owner-technical-retry-20261011 |
| C utility／coordinator／runtime | 37/37、42/42、34/34，native0 | retention-policy-20261011：c1-zone-causal-scoped、c-tactical-phase-route-fixed、c-tactical-phase-route-runtime-scoped |
| Legacy／完成流程 | 24/24、36/36，native0；必要契約補驗28/28 | c-legacy-completion、d-contract-completion-scoped |
| D 保存幀 Node | 51/51，native0；真 fixture1111幀／21局 | d-node-scoped；d-canonical-replay.json.gz |
| D 新輸入防護 | 15/15，native0；原P1／P2反例拒收，真Replay仍接受 | d-input-guards；d-replay-input-defects-confirmed.json |
| D 原生瀏覽器 | 原48行為PASS；版面修後430沿用，320/360/390補驗12/12/native0 | diagnostic-d-final-replay-20261011／diagnostic-d-touch44-layout-20261011／diagnostic-d-controls-final-20261011；d-three-width-browser；d-css-only-provenance.json |
| D 新Legacy／壞檔情境 | 15/15 RESULT=PASS、native0／wrapper0、27612ms、0PNG | d-input-legacy-browser.*；diagnostic-d-input-legacy-20261012/gate.json |
| 正式Dashboard→Battle→Result | 原25項真流程PASS；唯一CTA高度紅燈修後8/8/native0 | e-formal-click-guard、e-terminal44-browser、e-terminal-only-provenance.json |
| Worker | 12/12、native0、102738ms；三Major圖＋Mirage Legacy完整canonical SHA同Browser等價 | worker-production/gate-1791734479252.json；e-worker.* |
| 最新正式build | runner1/1、native0、30154ms | e-input-final-pristine-build.*與manifest |
| E桌機三圖60s | 18/18 RESULT=PASS、native0、277150ms、0PNG | diagnostic-e-final-combat-20261011/1366/metrics.json；e-desktop60.* |
| E390三圖60s | 18/18 RESULT=PASS、native0／wrapper0、258116ms、0PNG | diagnostic-e-final-combat-20261012/390；e-mobile60-final.*；完整prepare/browser與isolation |

完整報告、stdout／stderr、exit／runner state 在 `evidence/retention-policy-20261011/`。原 PRODUCT_FAIL／HARNESS_FAIL 原樣保存；D與正式flow依受影響範圍分段補驗，**不宣稱曾有單次53/53或26/26的全綠gate**。

新 Legacy 情境用真API單次模擬保存913幀／15局（6/6封装native0），沒有把Major改標。暫停4.5秒訊息窗口保持、原生退出恢復正常比賽且無重模擬／發獎；本次原游標為0，沒有冒稱已實測Legacy非零游標退出。原D已驗的Major非零游標、共用正常cursor cache及退出邏輯保留。

## 最終效能（AMD Radeon／ANGLE D3D11，seed505001，1×，每圖60秒）

| viewport | 圖 | FPS | p95／p99／max ms | calls p95 | triangles p95 | heap MB | 首次就緒 ms |
|---|---|---:|---:|---:|---:|---:|---:|
| 1366 | Mirage | 57.72 | 16.9／33.4／216.6 | 443 | 235502 | 114.02 | 17805 |
| 1366 | Dust2 | 54.00 | 33.4／33.5／366.7 | 461 | 236531 | 295.05 | 23587 |
| 1366 | Inferno | 52.67 | 33.4／33.5／83.4 | 477 | 231572 | 428.05 | 31187 |
| 390 | Mirage | 59.75 | 16.8／16.9／199.9 | 441 | 230268 | 116.12 | 20007 |
| 390 | Dust2 | 59.47 | 16.8／16.9／466.7 | 452 | 233011 | 314.38 | 19800 |
| 390 | Inferno | 59.69 | 16.8／16.9／50.1 | 467 | 226738 | 351.64 | 16421 |

390px是桌機GPU窄視窗，不是 Android真機。正式flow／Worker屬headless功能驗證，不冒充GPU效能樣本。貼圖估計約74.39MB；桌機／窄版calls超過起始300／150預算，依設計規則記錄實測與待優化，沒有隱藏角色／掩體降低成本。heap為當下頁面快照，未藉此宣稱無長時間記憶體成長；max尖峰與首載等待如實保留。早期DEV、不同canvas與不同樣本長度不可冒稱嚴格A/B。

## 來源與恢復

- 最後產品source：`c9b686f5e61bad3ca56625d778444cd95bb307fe3d910dd9c765648dca6175fc`，97檔。
- 最後隔離archive：`diagnostic-e-replay-input-final-20261012-1366`，bundle `4d61897ba35f8244bf96e4f875eebed72c75022729e58a067bcb6a6829830442`；CS public40硬連結、0新cache。
- 正式dist bundle：`1f9a1f76bef7cc761af4e88dcb6f17dcd3f2266c7623250648f722e63f8f3c33`，不含scene／callback probe。
- `e-input-only-provenance.json` 精確逆修新輸入／Legacy重播guard，完整97檔指紋等於先前69016eb3…；C純模擬191011bytes與rules完整domain `89c34e189e07a9e47852037538ca0e62c36bad1e59d536e3ed4d3c2985f9baa5` 不變。已PASS的桌機／Worker／正式25項與D48行為以各自真來源保存並有沿用依據，不借換來源假裝重新跑過。
- B唯一恢復archive、C唯一simulation gzip、D唯一compact replay、最新archive／dist、素材來源／授權、完整失敗與log均保留。
- 新來源恢復檔 `e-final-source-recovery.json.gz` 653711bytes：57份source精確bytes保存，40資產指向保留archive逐SHA核對，不複製58.7MB資產；manifest保留gzip SHA與明確恢復路徑。

已依既有Owner授權與 root 明確清單清理10份舊 CS archive，native0、10 DELETED_CONFIRMED／0不完整，逐份重查source/bundle/evidence SHA、resolved path、全檔handles與cwd。`phase-b7-elbow-rows-desktop-20261008-1366` 因先前cwd UNKNOWN保留，不重試洗綠；其他不確定候選及所有PNG／evidence／logs保留。沒有處理任何使用者程序。完整review／manifest／INTENT journal／result／stdout／stderr／native在 `e-root-cleanup-final-*`；歷史來源、127 reference與保留證據由 `e-approved-root-review-history-v2.md` 接續。Logical／file identity數字不當作實際磁碟或OneDrive回收量。

最後來源／恢復97份、13份native收件證據、保留路徑與正式dist bundle核對結果在 `FINAL_ACCEPTANCE.json`。最後helper寫完報告後列印變數及Windows文字編碼曾失敗，只修工具與新增文書格式，修復native0、產品0修改；原錯誤與 `FINAL_ACCEPTANCE_TOOL_RECOVERY.json` 保存，沒有重跑已PASS gate。Git差異檢查最終native0。

## Owner 驗收方式

桌機正式localhost preview：`http://localhost:5179/ESMO-/`；從Dashboard一般CS配對開始，觀察三圖戰術、stable名單、回合歷史、結果資料與重播匯入／退出。所有一般自動檢查完成後才交付Owner Review，沒有背景假執行。

手機使用4G，電腦連熱點；localhost或區網IP不能作手機驗收網址。本機 `cloudflared` 不在PATH，未自行安裝。真手機FPS／觸控手感／safe area／音效／熱節流與人物／場景視覺仍未實測，需Owner驗收；桌機窄viewport不能替代。

## 2026-10-13 Owner五項新source收件（原Closure仍有未結項）

Major-only修正：購買期安全固定出生、tactical duty／control-pick-regroup-utility-entry stage事實latch、接敵停移／共享intel仍可前進、CT不偷秘密target、t0投擲與煙/爆炸sub連續、垂直共面分層、真visible報點／補位reply、POV同隊通訊與可選本機中文朗讀。未改MOBA／Store／Reward／Router，未push／deploy。專業人聲素材未生成，TTS不當真人。

pure15/15、utility transforms9/9；core-v3 utility37/37／coordinator42/42／tactical runtime34/34（含三圖與同seed相同SHA）。六場新fresh5v5每場6/6且actual preMatchLayout selection==requested：Dust f1/f2/f4/f5，Mirage f5，Inferno f5；default/pick/execute有真control／pick／regroup／utility／entry不同階段，rush保留直入。單seed不當勝率／專業水準KPI。全部buy位移與walk0、throw onset t0。原錯selection工具退default的場次不當戰術比較證據。

新source近牆/radio Browser三圖41/41 native0/93597ms，12PNG＋180telemetry、真1×POV、同隊文字、OS中文真onstart/speaking、pause/seek不重播、390px不溢出。root人工看12PNG未見同型跳色，僅代表樣本，不是全程/全圖保證。Utility Dust真1×三型23/23 native0/36158ms，smoke/HE/flash真t0→flight→detonation→snapshot內實FX連續；未加速飛行。獨立pristine build native0/43669ms，bundle71a3c23200b6432410be1b4998f95968bbefc4ed81f66a1c4ab0e3458beadb7a，source dfb164781051c7a530e90e96808a72ebc30a056ef03ae7bf3f54d8dc9c235a7b。正式Dashboard→CS→Battle16/16 native0/34938ms；新Preview localhost5181 session86164 HTTP200，5180保留舊v11。Chrome自有profile cleanup confirmed，未動foreign/MOBA/未知程序。

必要scene最終120/120；Legacy完整JSON與c9一致SHA b90b4296…，913frames/15rounds，但雙方plant0故原安包情境NOT_TRIGGERED、gate保留2/3/native1，不洗綠。新品出生實際mixer Browser待補。工具失敗完整保留：SSR PostCSS模組讀取TIMEOUT後tools-only空plugin修復、錯5人與錯selection無效前提、core-v2舊purpose/hold斷言修成明列真八purpose與stopMovement/pace0強約束（沒刪安全斷言）、fixture重名防覆寫換唯一檔。詳細原native/streams見owner5-collection.json與OWNER5_CLOSURE.md。

原55場／v11只作Before；45列反覆購入零投擲與purchase purpose UNKNOWN尚未閉合，不能宣稱Gameplay全部Closure／READY。接著唯讀audit duty與purchase／投擲窗口錯配；每次購入需可靠purpose與真上下文，不靠死亡豁免或亂投。手機真機FPS／觸控／safe-area／音效未測。週quota最近52%/pausefalse，本root get_goal=null，沒有假造完成goal。

## 最新技術收件：2026-10-13T14:19:48.032Z — READY_TO_OWNER_REVIEW（待Owner體感／真機驗收）

五項修正與原Utility購入用途缺口已完成本輪技術驗證。最新桌機Preview http://localhost:5182/ESMO-/，session56480；正式獨立pristine source 6f73780fe3ceb1054d29d7a05c23a99dd19c52f00ed92d75a4bd1a76cc1b4275、bundle 530527c0fa7ea80f013d915e6be2852ef6d633858c8c140b9d5d3cd9296d7360。HTTP200、HTML與全部JS逐byte同archive。5180舊v11／5181前一版保留作對照，不能當最新After。詳細收件 gameplay-owner-review-final.json SHA b7d688e28493a836aef34c82db98095201bd30e3059573b75a302282dd831d0e。

最後同source Browser：正式Dashboard→CS→Battle16/16、三圖近牆真1×POV／radio41/41、Dust煙/HE/flash真飛行展開23/23、兩個不同回合十人出生真mixer14/14，全部RESULT=PASS/native0，自有Chrome cleanup confirmed/profileRemoved。新12PNG root人工看全數未見同型跳色；僅代表影格，180telemetry不冒充180張RGB；390px是emulation不是真機。語音真OS中文onstart/speaking已觀測、pause/seek不播舊窗口；不是真人聲優。原完整7項／B7視覺音效相關有效證據保留，不重無關美術或舊55。

用途：prebuy duty與同來源plan決定kit／費用／carry；每type窗口（低優先合法明示eligible-deferred-priority）、planId連投擲。真nested tacticalDuty、CTstack own deployment／information null不假A、HE observed或clear-calledsite、真flash牆盾、遍歷安全其他teamintel已修。四個独立反例0/4→4/4；pure13/13；合法無優先角色carrier反例1/2→2/2，專用完整fresh5v5 6/6。CT anchor手槍局不買道具，rotator flash／information smoke；不是每role必須買的契約，不以使用率強迫投擲。

原45列涉及30個配置全部保持原canonical seed／layout／actual UI choice驗證，segment30/30：31列有真使用、5無新購入、9有明確條件性備用且無被選中的eligible窗口。不能把carry重指派purpose當原購入purpose；no-safe-*仍未細分所有子原因。30場原source之最後carrier fallback只有at(-1)→[0]；main與其他authority檔byte相同、helper精確反轉SHA相同、原ROSTER雙方均有優先職位及全持包情形duty相同，source equivalence3/3限定這30配置，非所有陣容，不重30場。原combined runner native1是後接core existing-fixture guard，不升整個runner綠。新版core utility37/37、最後三圖tactical34/34包含退/保/交易/假攻與同seed全JSON SHA相同，native0/96913ms。

完整失敗不覆寫：runtime v1工具沒傳source；named30 v1前12有效後JSON.stringify全sim超V8字串限、不是simulation regression；明確Product反例已修；core env舊fixture防覆寫與完整fixture stringify上限。tools-only串流writer保持原JSON順序與所有資料，不改產品frames／roundHist契約，582959474 logical bytes／42427494 gzip bytes、解壓全SHA與重跑hash相同；共享roundHist JSON序列化重複，不以字串上限推定Chrome壞。完整stdout/stderr/native/child logs與checkpoint保留。Legacy本輪完整c9對照SHA同b90b4296…、913frames/15rounds/plant0，安包前提NOT_TRIGGERED，gate仍2/3/native1，沒有洗綠或改seed。

■ 修正｜■ 必要驗證｜■ 文件／Preview｜□ Owner體感與真機驗收。工程工作完成，Owner驗收時間由Owner安排；不宣稱全位置閃爍/專業水準或真機已完成。未commit/push/deploy，不開始下一Sprint；MOBA/Store/Reward/Router未改，foreign／未知程序未動。本root get_goal=null，未假造goal complete；最後週quota45%未觸3%。沒有CS背景測試仍在跑（保留三個Review preview服務）；程序核對以最後resume-state為準。

2026-10-13新記憶已寫AGENTS.md§5：每個任務適時回報進度條與剩餘時間，估算不含中斷。
