# CS Beta R4：正式站Replay阻擋關閉

2026-11-08。**TD-GATE-CS-02 CLOSED；CONDITIONAL GO，限桌機快速練習opt-in公開測試版。** 根因是補充Smoke未等場景就緒，不需要修改產品或回退。正式站仍為7cf1cebc，本輪沒有Push／重新部署。Android、低RAM、熱降頻未認證；CPU4×FAIL與2118MiB峰值保持，不宣稱全面Release Gate PASS。

## 版本與證據

| 項目 | 實際值 |
|---|---|
| 起點Checkpoint | 1deb49cb299bbad027f426ecc3248426a23b489f |
| 受測／已部署／origin/main | **7cf1cebc10915f096a256885388ecd8a7052e5f3** |
| 正式站 | https://rayhuang0323.github.io/ESMO-/ |
| 既有CI | [42413502348 SUCCESS](https://github.com/RayHuang0323/ESMO-/actions/runs/42413502348)，本輪回讀SHA一致，沒有觸發新run |
| Build | 全11JS指紋b27a69e972c487422268aab421ad6d82194959999828732126c7cc87b815e370；首頁與11JS再次逐byte相符 |
| 環境 | 同Windows電腦／Chrome156／Node24守門／AMD Radeon D3D11、1366×900、1×播放；未降畫質、未節流造結果 |
| 工作區 | C:\Users\ifikn\.codex\worktrees\ESMO\cs-map-v2-beta-release-20261108，沿用既有工作區 |
| 原始收據 | C:\Users\ifikn\esmo-measure\cs-beta-release-20261108\release-r4\ |

先保存1deb49cb本機tag及分支，確認乾淨後，於已部署來源7cf1cebc本身執行重現、preflight、run與最後assert；驗完才切回既有發布分支補文件。後續文件SHA不是另一個產品PASS。原34份WIP與原始備份逐檔雜湊／status一致，RC67f46145與Claude9afe58b2工作區乾淨，三個Claude文件提交a0ec13a1／6fa61083／3cae571f仍為main祖先。

## 原失敗資料與缺件

完整讀取R3報告、Checkpoint、Smoke與FAIL輸出／收據、result、harness、provenance及黑畫面截圖。**R3沒有保存Smoke影片、獨立Console或Network明細**，不能宣稱已看過不存在的原影片或以新資料冒充舊資料。原FAIL收據20261107T211200Z__7cf1cebc1091__prod-cs-native-replay__FAIL.json與R3副本SHA一致；原5/6 PRODUCT_FAIL不修改、不刪除。

本輪另開release-r4證據目錄，補錄原生Chrome Page.screencastFrame、每格時間戳、Console、Network、Worker target與WebGL狀態。影片runtime-5fps.avi由原生JPEG依時間戳封裝成5fps MJPEG，未改畫面；原影格與時間戳另外保留。四個測試Profile均保留，沒有清玩家localStorage或改日常Chrome。

錄影採樣Before每8個RAF、After每12個RAF，僅供操作與畫面證據，不作載入效能改善A/B或FPS數據；本輪沒有產品效能修正。根因判定亦有同一正式站分頁、同一匯入資料在就緒後直接恢復播放的證據。

## Before／After與根因

固定Confluence3497幀Replay（gzip SHA-256：5dc3c2e1fce287fffa83868bba41429d42b20ea671d8522abeeb54e84dace5fa），本機供應同一dist，正式站11JS逐byte相同；Chrome／GPU旗標、原生操作與播放間隔一致。

| 情境 | 真實Runtime | 結果 |
|---|---|---|
| 原腳本條件，正式站冷載入 | play按鈕已轉暫停；UI仍顯示「正在準備地圖材質與畫面…」、Canvas hidden、WebGL未lost；1.2秒後仍12 | 重現PRODUCT_FAIL 3/4；獨立最小重現計數，非改寫R3的5/6 |
| 同一正式站分頁，未重匯／未改產品 | 之後取樣Canvas visible、準備訊息消失；再次原生播放1.2秒 | 12→14，證明非永久卡死 |
| 同Build／Replay，本機原條件 | 場景在seek期間已就緒，Canvas visible | 原生播放12→15，4/4 PASS |
| 修正前置，本機三圖 | 真UI就緒後才開始原播放驗證 | 38/38 PASS，exit0 |
| 修正前置，正式站三圖 | 同樣原生操作與1.2秒要求，先確認場景就緒 | 38/38 PASS，exit0 |

真正差異是場景準備完成的時機。原重現的正式站battle:map-presented為頁面時間約22.914秒，當原Smoke做判斷時尚無該mark；約8.97秒後的取樣才已顯示就緒。原生play確實切換播放狀態，所以不是沒點到按鈕。WebGL一直未lost；素材HTTP沒有4xx／5xx，Console沒有error或頁面例外。最小重現有一次導頁時取消的Document net::ERR_ABORTED，Network開始捕捉前未取得其request URL，不冒稱素材失敗；正式修正回歸沒有非取消載入失敗。

程式只讀定位：EsportsFPS3D.jsx在非legacy場景等待presentationReady才推進播放；presentationAssetsReady未就緒前不渲染，素材／shader完成、真首幀畫出後才讓Canvas visible並移除準備訊息。原Smoke僅驗Canvas DOM／尺寸與十張HUD卡，不驗Canvas可見或準備訊息消失，故把載入期間合法暫停判成播放失敗。本機素材較早就緒而通過，正式站冷載入則在前置尚未成立時失敗。

判定：**驗證工具前置缺漏／HARNESS問題，未確認產品BUG**。原收據仍保留其當時PRODUCT_FAIL分類；不是直接換標籤洗綠，而是補齊同版本、同Replay的就緒／播放因果證據與完整後續回歸。之後若前置成立但播放仍不推進，新工具仍會保留PRODUCT_FAIL。

## 工具修正與回歸

只修改Git外production-replay-smoke.mjs：原場、匯入後及播放前，明確等fps-map-preparing消失、Canvas visibility=visible、WebGL context未lost；仍用原生滑鼠／鍵盤／file input。未改input.value、未派假change、未注入Store或scene probe，沒有新引擎結果或勝負替換。就緒等待上限60秒，獨立於原1.2秒播放推進斷言，不延長或放寬後者。

保留原details展開、匯入保存幀數、三次精確seek、自然推進、返回與卸載要求，另補原生play狀態、pause穩定、模擬不重啟及真WebGL釋放證據。外部harness只調整來源路徑與Profile保留策略，未改PASS／PRODUCT_FAIL／HARNESS_FAIL規則；關閉本輪Chrome但不刪Profile。Repo工具／src／public／Vite／套件／workflow皆未改。

計數為每圖12項，加整體Console／Network各1項；本機三圖合計38/38、正式站三圖合計38/38，不是每張地圖各38項。

| Replay | 保存幀 | 本機播放 | 正式站播放 | 原場max→返回max | Rigged | 模擬啟動前→後 |
|---|---:|---|---|---|---:|---|
| confluence | 3497 | 12→14 | 12→14 | 2901→2901 | 10 | 1→1 |
| dune | 3256 | 12→15 | 12→14 | 4240→4240 | 10 | 1→1 |
| foundry | 3865 | 12→15 | 12→14 | 3054→3054 | 10 | 1→1 |

三圖返回後皆恢復原場index0、同十名ID、同原場時間軸；模擬啟動次數均1→1。離場皆為Dashboard、無Canvas／Replay輸入、WebGL context lost且canvas detached、sceneChildren=0。teardown中geometries／textures／programs是renderer.dispose之前的純量快照，沒有據此宣稱Heap或GPU占用歸零。Console只有既有Three.js編碼API棄用warning，沒有error／頁面例外；三圖保存Replay成功解碼、模擬worker完成，未見影響這些流程的Worker錯誤，HTTP錯誤與非取消載入失敗皆0。未聲稱能補回R3當時未捕捉的Worker Console。

## SHA Gate與發布決定

重新resolve-main、preflight、驗證正式首頁及11JS，再以原29項要求跑最後assert：**PASS／exit0，target=actual=origin/main=7cf1cebc**。完整29個名稱與命令見final-assert.json／stdout／stderr；新的cs-production-replay-local與prod-cs-native-replay各38/38。舊R3 FAIL與本輪Before FAIL留在Git common receipts與獨立副本；assert依法採同SHA同gate的最新PASS，沒有刪除失敗或移除原要求。

其餘有效收據仍為相同7cf1cebc、相同環境、24小時內，由守門重新確認；包括三圖正式快速練習各48/48、MOBA90/90、B1B43/43、B1C38/38、B1D27/27、BP-9／Progress／Shader／RAF／TD-FDR-01及Replay無損等。沒有將別的SHA PASS算進來，也沒有重跑已有效的大型矩陣。診斷Replay與正式無probe證據仍分開。

**不需Hotfix，也不需回退。** 本輪解決的是Git外Smoke前置，既有公開Build已通過正確前置下的正式站驗收；不為測試／文件差異另造部署或空commit觸發CI。正式版仍7cf1cebc，既有Actions42413502348 SUCCESS回讀一致。這不代表Android、低RAM或CPU4×全面通過。

若未來需停用Beta，舊main3e615157備份仍在backup/main-before-cs-map-v2-beta-20261108；應以新提交關閉新增opt-in入口並保留Replay讀取、BP-9／SaveSlim／Progress／MOBA契約，經正確SHA回歸後正常非force發布，不盲目整包還原。已摘要歷史仍需玩家整理前備份還原。本輪沒有做回退。

## 證據入口與交接

- 完整Runtime：release-r4/fixed-public/result.json、console.json、network.json、workers.json、provenance.json、三圖original／Replay／played／returned／unloaded截圖。
- 錄影：baseline-public/runtime-5fps.avi與fixed-public/runtime-5fps.avi；原始filmstrip目錄與filmstrip.json／video-provenance.json全部保留。本機亦有對應影片。
- 可直接開啟：[Before正式站錄影](C:/Users/ifikn/esmo-measure/cs-beta-release-20261108/release-r4/baseline-public/runtime-5fps.avi)、[After正式站錄影](C:/Users/ifikn/esmo-measure/cs-beta-release-20261108/release-r4/fixed-public/runtime-5fps.avi)、[修正後Smoke](C:/Users/ifikn/esmo-measure/cs-beta-release-20261108/release-r4/production-replay-smoke.mjs)。
- 原失敗：R3原件不變；本輪baseline-public結果與Gate FAIL另存，不冒充正式PASS。
- 守門：preflight-r4、final-assert、兩份38/38 Gate的完整stdout／stderr／exit；candidate-receipts包含舊FAIL與新PASS。
- 保護：preservation-final.json證明34WIP與備份一致、四Profile保留、CS／RC／Claude工作區與備份refs不變。
- [驗收清單](BETA_RELEASE_R4_ACCEPTANCE.md)、[Checkpoint](BETA_RELEASE_R4_CHECKPOINT.md)、[磁碟只讀清理方案](CS_DISK_CLEANUP_REVIEW_R4_20261108.md)。

TD-GATE-CS-02 CLOSED、TD-GATE-CS-01維持CLOSED；桌機Beta新阻擋已解除。Android／低RAM／熱降頻NOT_RUN，CPU4×FAIL、2118MiB歷史峰值、自然容量3/4 NOT_TRIGGERED、既有cloth18/19／utility6/9與TD-DEPLOY-1～4仍保留。正式聯賽／BO1／BO3池未擴大。文件Checkpoint只本機保存，不Push；完成後停Owner Review，不自動開始新功能或刪除資料。
