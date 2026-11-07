# ESMO CS Map v2 本機Release Candidate

**工程RC已收斂，正式發布判定HOLD，交Owner Review。** 三圖固定完整長局各6/6；本輪只補原本未驗的Confluence／Dune，沒有擴做大型矩陣。最終封存SHA／本機tag與證據SHA由rc-manifest.json記錄。

## 版本、範圍與保存

- 工作樹：`C:/Users/ifikn/.codex/worktrees/ESMO/cs-map-v2-integration-20261107`。
- 本機RC分支：`rc/cs-map-v2-20261108`；起點3b8f75ff。最終封存SHA／本機tag由rc-manifest.json記錄，避免提交自我參照。
- 整合保護基線7d59dab5；fetch最新origin/main為3e615157。兩者產品／依賴／部署設定無差異，只有部署事件等文件變更；本輪沒有需要同步的產品修改，未再次整合。
- 原CS HEAD a7398436及34份WIP不改。recovery-r50／r51保留；本輪另存`evidence/rc-recovery-r1/original-wip/`，34檔共4851554 bytes逐檔SHA一致，未在原工作樹commit。
- Shader／RAF必要產品Checkpoint 5fc2463b、選擇性整合b22b7a61、行尾整理8cd2584d與後續本機Checkpoint全保留；原rehearsal分支仍停3b8f75ff，不改寫歷史。
- 產品src／public／Vite保持，700來源指紋feeed6c82edbf1e41e7fc5549d8c6576e9c5ab513a6989497a032c066af83ab7。受測pristine與完整預覽JS bundle為b27a69e972c487422268aab421ad6d82194959999828732126c7cc87b815e370。本輪preview-r3 production native0，與受測preview-r2的JS／CSS／來源逐項相同；故不重跑有效BP-9／MOBA等大型回歸。
- 大型Replay、Heap Snapshot、Allocation profiles、trace、完整log及Build留在本機，不入Git、不清理。原始失敗收據不覆寫。RC證據索引會核對native exit／log形狀／SHA，該索引不是重跑遊戲矩陣。

## 三張地圖的真實範圍

| 地圖 | 場景 | 現況 | 正式UI收據 |
|---|---|---|---|
| Confluence Station | major.v3／mirage相容鍵 | 地圖／地形／美術／導航／雷達／十人Rigged／Replay已整合 | 48/48 |
| Dune Terminal | major.v4／dust2相容鍵 | 地圖／美術／地形／煙霧／導航／雷達／十人Rigged／Replay已整合 | 48/48 |
| Foundry Circuit | major.v5／inferno相容鍵 | 工業場景／地形／A/B導航與防拆責任／十人Rigged／Replay已整合 | 48/48 |

正式UI收據走首頁→CS賽前→快速練習勾選原創地圖→選圖→四階段戰術→Loading→十人戰鬥→QuickFinish→戰報／返回，無c5c或fixture注入。**三張原創圖維持快速練習opt-in及Owner場景，未自動成為正式聯賽／BO1／BO3預設地圖。** 現有正式競賽原預設、賽程、結果與存檔契約保持；若要擴大正式競賽接入，是另一個明確產品範圍決策。

## 已完成與可信回歸

| 範圍 | 有效結果 | 邊界 |
|---|---|---|
| 三圖正式UI／戰報／練習零獎勵 | 各48/48 | 限指定正式快速練習流程，非全seed矩陣 |
| TD-FDR-01 | 49/49 | 五個原事故、合法情報／LOS／路徑、死亡交接與第二seed牆邊接線；不保證勝負 |
| Shader／RAF | 14/14、7/7 | 既有優化保留，未以畫質／角色數／煙霧降級換數字 |
| Replay保存／往返 | 三圖完整frames／metadata／rawResult無損 | 不重跑引擎，不改保存幀 |
| 原生reset／seek／匯入返回／卸載 | 49/49 | 每圖三次；跨圖自然Heap不等於全部回到低值 |
| 完整原生1×長局 | 三圖各6/6，native0 | 固定保存fixture，從0自然到末幀；不加速／seek末段 |
| BP-9 Node P0-A／P0-B | 1464/1464、112/112 | 原子提交、故障回滾、配額、重送、備份同意、恢復與20季壓力 |
| BP-9 browser normal／slim-300 | 11/11、44/44 | 真CS／MOBA結算、重新整理冪等、滿檔備份／整理／冷啟動及續賽 |
| Progress25 | 33/33 | 正式v3輸出、v2相容與非法版本拒絕；舊文字32/33失敗保留 |
| MOBA runtime29 | 35/35，另9委派SKIP | runner flat；不冒稱全部159段或手機通過 |
| 日曆先滿後整理／CS續玩 | 32/32 | 與CS結算超限分開 |
| TD-INT-01受控CS結算容量／原場恢復 | 38/38 | 非產品storage fixture，實際Chrome quota、真結算、整理後同場只入帳一次 |

577份其餘main來源受保護，122份FPS來源與保存候選等價；六共享檔逐段保留main的BP-9原子結算、SaveSlim／Progress、未入帳提示、恢復及MOBA規則／旗標。沒有整檔ours/theirs。詳見INTEGRATION_REVIEW.md與source protection收據。

16能力接線沿用fpsRoster的STAT_L2S及既有consumer：反應、精準、操作、走位、地圖意識、戰術智商、決策、適應、勇氣、關鍵抗壓、專注、韌性、溝通、領導、協同、學習。能力與AI來源未改；完整靜態表在原CS的FOUNDRY_INTEGRATION_ROOT_CAUSE.md。這不是本輪16項高低能力因果實驗；learning經OVR可能間接影響既有premiumAwp購槍，未夾帶改權重或購槍。

動畫保留Rigged側移／轉身／上身瞄準及Replay一致性；未宣稱所有clip零滑步、全急轉自然或Owner已接受。Owner需看實際三圖與角色動作。

## 完整長局與卸載收尾

Foundry沿用完整收據；Confluence／Dune本輪新增。兩場並行只作功能／生命週期檢查，未固定外部主機負載，FPS／Heap只作診斷，不是效能、低RAM或熱驗收。

| 地圖 | 保存幀 | 原生1×自然播放觀測 | 結果 | Heap取樣最大／離場10秒（MiB） |
|---|---:|---|---|---|
| Confluence | 3497 | 約29.5分鐘 | 6/6、native0 | 739.7／379.7 |
| Dune | 3256 | 約27.5分鐘 | 6/6、native0 | 762.9／391.3 |
| Foundry（沿用） | 3865 | 約32.5分鐘 | 6/6、native0 | 600.9／297.1 |

觀測每30秒一次，末幀後可能等到下一次取樣，非精確遊戲時長或連續峰值。離場後仍有非零Heap，不能宣稱全部資源已回收；三圖不同窗口亦不是效能Before／After。

每場核對時間軸單調、十名Rigged、保存位置偏差、渲染持續、無contextLost、沒有新增模擬啟動、自然末幀及原生離場Canvas／環境group／probe移除；自然等待10秒後記Heap。這只補每圖一個固定完整保存案例，非所有seed／所有長局／GPU bytes精確回收證明。

## 未關風險與可延期項

| 分類 | 項目 | 處置 |
|---|---|---|
| 發布阻擋／NOT_RUN | 真Android FPS、觸控、安全區、背景恢復、發熱／實際熱降頻 | 必須實機，不以390px或CPU降速冒充 |
| 發布阻擋 | RG-CS-02：重匯入2118MiB、低RAM／OS回收未驗收 | 原Allocation／live heap／trace全保留；小實驗收益未足證明正式峰值改善，不採入、不擴修 |
| 既有FAIL／範圍待Owner決定 | RG-CS-03 CPU4×未達門檻 | 保留原三圖重複量測；不再全面優化、不自行放寬或豁免 |
| Owner驗收 | 三圖美術／動畫／TD-FDR-01戰術與正式競賽接入範圍 | 工程PASS不能代替Owner接受 |
| 可提議延期、尚未核准 | TD-FDR-04 cloth18/19；DUNE-F06／TD-FDR-08 utility6/9 | 原同項基線失敗保留，不刪斷言；需Owner具名接受，未自行延期結案 |
| 覆蓋技術債 | 自然累積CS容量3/4 NOT_TRIGGERED | 日曆先滿；受控38/38已補功能路徑，原自然收據不洗綠 |
| 尚未執行 | 正式merge／push／CI部署／正式站smoke | 本輪未授權，部署時須另驗環境與畫面scenario前提 |

不認證最低手機RAM；大型Replay暫不承諾2～4GB低RAM裝置。8GB以上只作下一輪實機驗收候選，不是已支援下限或購機建議。科學上的全部原生配置拆帳不是無限研究目標；最小下一步是選定實際支援裝置，驗大型Replay匯入／返回／背景回收能否可靠完成。

## Owner最小剩餘待辦與發布判定

1. 在目標真Android補三圖FPS／觸控／安全區、長時熱狀態、最大Replay匯入返回與低RAM／OS回收；記型號／RAM／Android／Chrome與同一RC／Fixture。
2. 明確接受或要求處置支援範圍與CPU4×／2118MiB風險，不能由agent自行豁免；Owner看三圖美術／動畫／戰術，決定cloth／utility具名延期與本RC僅practice opt-in範圍是否可接受。
3. 上述完成後才另行核准正式整合／發布；當時再fetch main比對，執行部署環境與正式站smoke。現成正式整合／回退計畫見RELEASE_INTEGRATION_PLAN.md，本輪不執行。

**目前HOLD，不建議正式發布。** 工程RC收斂不表示發布Gate通過；不因收尾而繼續無限制開發。完成可安全處理的驗證／保存後停Owner Review。

## 預覽與恢復

桌機`http://localhost:5207/ESMO-/`；手機使用臨時HTTPS，host只在對話與controller記憶體，不進Git。`/ESMO-/owner-review/`提供三圖直達、正式流程入口、驗收清單／報告與版本SHA。直達場景屬Owner診斷入口，不代替正式UI收據或真機驗收。

服務依賴本機持續開機與網路，Quick Tunnel不保證跨重啟持續。恢復：在此工作樹執行`node tools/start_cs_rc_preview.mjs`；它會校驗封存包，核對PID後只重用／重啟本RC服務，輸出當次HTTPS。已實測啟動／停止／重啟及5207／61048釋放，原CS5187／5188／5197的服務PID不變。詳見RC_RECOVERY.md。Owner驗收結束可用同工具`--stop`關閉本RC服務。
