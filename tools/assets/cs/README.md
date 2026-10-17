# CS 視覺作者管線

這些腳本保留 Blender MCP 的可重現作者工序；不在 Vite build 時重新生成或覆寫資產。

1. `node tools/assets/cs/export_runtime_authoring.mjs review/cs-major-upgrade/evidence/b7-blender-<唯一名稱>`：從合法GLB與當前真runtime建立支撐狙擊手hold作者packet，保留source SHA、原頂點順序、bind位置／矩陣、skin weights／indices、骨位置、材料分區、UV。不得覆寫輸出。
2. Blender MCP讀取並執行 `import_runtime_authoring.py`，呼叫 `import_runtime_authoring(<packet_path>)`；只建立私有collection，保留既有場景。Blender axes為 `(x,-z,y)`，使用公尺。
3. 作者packet是fixture、不是browser frame94，材質未攜帶runtime shader／貼圖。參考骨架只供檢查；修改必須回傳相同vertex ID／來源hash並驗證bind與skin，不能直接把inspection GLB當成產品替換。
4. 有證據的局部修改才建立正式作者script／參數與新候選，不手工改.blend後丟失來源；source asset／授權與candidate SHA都記錄。既有袖口input→candidate→bind bake→AO及武器GLB已完成，不因搬工具重跑。需要修改時再將對應舊tmp腳本整理成正式作者工具。
5. 回整合後，必要CPU及真遊戲GPU／Browser圖片驗證；作者viewport／GLB成功不代表B7通過。沿用同source archive與少量必要證據，不產重複完整圖庫。

## 已落地的檢查與回傳

- `inspect_runtime_visibility.py`：對真手皮做120方向BVH遮擋診斷；左右手正控制，不能據此評藝術或冒充Browser幀。
- `export_runtime_inspection.py`：明確限制active scene與collection，成品核對31mesh／1scene、不含rig／動畫／貼圖；無改動頂點誤差≤1e-6。`audit_runtime_inspection.mjs <packet> <glb>`再用Three回讀核對真來源ID、SHA、三角形與各mesh bounds，不只看匯出成功。
- `collect_runtime_edits.py`：相同source vertex ID、三角形、object transform及來源SHA才回傳稀疏修改；目前只支援服裝，不猜rig／武器映射。
- `convert_runtime_edits.mjs <packet> <edits> <evidence-output>`：用真bone world／inverse bind／skin weights反算bind。先以未修改點重現原runtime位置，誤差≤1e-6且單次位移≤40mm；只輸出ignored候選，不寫產品。實驗骨姿packet拒絕直接當runtime編輯來源。

2026-10-09已實測：靜態GLB31mesh／21890tri，Three回讀bounds最大誤差5.826e-8m／native0；兩個1mm作者修改反算誤差5.029e-15m／native0，測試頂點立即還原，不當藝術候選。`merge_posed_sleeve_candidate.mjs <packet> <bind-edits> <evidence-output>` 已能保留原423筆reference／蒙皮／index fingerprint，累加作者稀疏位移，累計上限40mm；只輸出候選，不寫產品。產品整合仍須法線／UV／AO及必要CPU／GPU驗證。

- `inspect_hand_occlusion.py`：作者手皮首個遮擋三角形分列mesh／骨／material；胸部、袖子、裝備與手指自身分開，不用射線點判掌面接觸或穿模。
- `sculpt_cuff_rim.py`：6mm既有袖口局部周向平順候選，上限2mm；保留縫根、通風裁口、重複接縫與fold內外層向量，不重做整件上衣。相同packet加稀疏edits即可重建，不再複製完整packet或GLB。
- `preflight_cuff_candidate.mjs <packet> <candidate-module> <evidence-report>`：真bind形狀、來源、蒙皮、6mm厚度、接縫／根／vent、退化面與翻面，以及共用runtime展UV的有限值檢查。通過只代表作者結構可進下一步，沒有法線／AO／動作或藝術放行。

最新袖口候選81頂點／89受影響三角、423→486稀疏筆；原形回算誤差7.957e-15m、單次bind最大3.540mm、修改筆累計最大3.966mm。真6mm厚度誤差1.103e-7m、接縫／根／vent位移0、翻面與新增退化面0、native0。作者回算使用Three真Vector3蒙皮语義，保留float32原權重，避免加權Matrix4的w誤差造成齊次除法；未改產品蒙皮。

- `audit_cuff_pose_candidate.mjs <packet> <candidate-module> <evidence-report>`：私有候選幾何，兩隊五族150次真骨姿蒙皮取樣，保存實際動畫／pose layers／grip diagnostics，避免用輸入state假稱情境成立。最新接縫最大0、原素材不變／native0；不代完整動畫gate。
- `prepare_candidate_geometry.mjs`：私有幾何保留來源、skin與index守門；共用runtime展UV與當前產品有界法線工序（保存source／stage SHA），不改產品。法線接縫0、fold端面最小正向0.9725。
- `bake_candidate_cloth_ao.mjs <packet> <candidate-module> <evidence-report>`：只保存候選AO資料，970頂點／48射線／45mm半徑、原素材unchanged／native0。不覆寫產品AO，不建立build或Browser。作者法線／AO已準備，產品整合與真GPU藝術仍未通過。

作者pose參數可用 `--sniperRetraction=0.49`；選擇新真護木表面時另加 `--sniperSupportX=1.10`，所有值及source script SHA保存於trial metadata。此工序只在私有fixture，原骨長／GLB不變，不能冒充正式socket不變或產品驗證；不可達會明確拒絕，不把回退原姿當新候選。43cm先前候選已拒絕；49cm與44cm／新護木點候選仍大部分遮住扳機掌，未整合。

完整分工見 `review/cs-major-upgrade/WORKFLOW_CLASSIFICATION_20261009.md`。產品驗收仍以真遊戲GPU／Browser為準，不用靜態GLB替換現有rig。

## 2026-10-11 真保存幀與握姿候選

真Browser作者packet由fpsRuntimeAuthoringProbe匯出，先驗畫面選手卡／保存幀／暫停／存活／槍族，再核對逐檔SHA與archive；不能把fixture當此來源。measure_hand_exposure與audit_browser_hand_clearance只驗整手最低幾何外露，左手正控制失敗則工具拒絕，120方向也不等同像素／藝術。

author_grip_pose_candidates批次保存小型metrics／骨四元數，使用--supportSurface=wood-underface或wood-underface-balanced時只取真木護面向下交點，不用灰色receiver補握點。prepare_grip_pose_candidate、fit_grip_candidate_fingers、merge_grip_finger_candidate只写ignored候選；audit_grip_candidate_states驗六種真clip／骨長／可達，audit_grip_candidate_skin共用現役工具原門檻。來源socket／合法GLB保持，產品整合仍須CPU／真GPU。

audit_cuff_pose_candidate最新為兩隊五槍×六種真動畫×三次，共180取樣；修正來源manifest Sprint_Loop及真移動／換彈事件前提。原150次不能代表移動／完整換彈；原Run_Loop工具失敗log保留。

## 2026-10-11 柔軟回折／肘部與真可見手皮

sculpt_soft_cuff_elbow是新有界作者工序，不放大原2mm平順工具限制；需真Browser保存幀與prepare_sleeve_author_pins的共用裁片固定點。源拓撲／6mm厚度／縫根／開衩保持、沿真肘骨方向做局部壓褶；收回稀疏delta後仍需inverse skin、累計40mm、preflight、共用UV／法線／AO及真動作。audit_cuff_pose_candidate現核對全部有改動肘／袖頂點與527受影響三角，180真state不能只靠原280袖口樣本。

現役support skin guard已改測實際可見tailored.mesh；原SuperHero_Male是隱藏參照，其21/21不足作可見手部證據。audit_grip_candidate_skin的可選第三geometryModule只在私有clone套作者候選、收尾還原geometry並dispose；不改源GLB／共享幾何／產品。author_glove_surface_candidate仍未整合、零新增tri／draw，不能當藝術完成。


## 產出規則與目前版本（2026-10-11）

完整目前狀態與來源只看review/cs-major-upgrade/RESUME_CHECKPOINT.md。產品已有621筆薄袖／肘、2mm實際截面與30mm真回折、v19 fragment車縫path，以及v1共享手皮工序；上方未整合／6mm等敘述屬歷史。新private v2手皮尚有scout動作翻面，不能整合或借舊圖放行。

authorReport.mjs完整診斷只保存一份，stdout為摘要及完整檔SHA；native與失败資料不改。audit_glove_surface_candidate的第三參數是指定候選geometry module，必驗實際SHA；在已v1基線不得再無條件套舊v1。新小工序共用單一run目錄，先離線與作者检查形成具體改善，才依run_isolated_gpu_gate v4必要局部四圖；完整驗收须明確Acceptance目的／原因，禁止每數值試探重拍整套。詳EVIDENCE_RETENTION.md。

新比例／自然骨姿作者工具：author_glove_proportion_candidate、prepare_glove_surface_patch、prepare_grip_pose_patch以已整合ledger逐SHA驗舊真幀基線，再只存稀疏patch；不是新Browser幀。refresh_glove_surface_inspection重用本任務31mesh，0新scene／packet／GLB／blend。原候選已整合後不得再次套同一縮薄工序。當前藝術未過，資料產出及同內容收斂工具／結果統一見EVIDENCE_RETENTION.md。
