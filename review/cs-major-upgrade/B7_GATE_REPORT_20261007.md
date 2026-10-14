# B7 同版驗證與階段放行紀錄

> 最新：c2a744dc…分段袖27/27 native0、probe build完成；GPU啟動0/0 HARNESS_FAIL native2，無新圖片／視覺分數。Owner要求重開session，已安全收尾；最新完整停點以RESUME_CHECKPOINT.md最上節為準。

> 最新：平面裁片source `9bfa9085…` 的角色87／socket63／POV37／服裝26定向4/4及真mesh共面整合1/1均native0。正式 `npm run build` 已於 UTC16:24 通過、native0／26.59秒，完整 log／exit／source 關聯已保存；大型 chunk 警告保留。GPU取證被另一工作區正式站smoke隔離守門阻擋，尚未 probe build／browser；不挪用前版。前版fdaa全32圖袖獨立審查仍1，60秒D59.676FPS／p9516.8ms只屬fdaa。B仍未放行，C／D／E未開始。最新完整停點、quota、背景工作以 `RESUME_CHECKPOINT.md` 頂部為準。

> 2026-10-07續跑最新：官方quota已恢復，fd8b70真腕軸候選完整46圖盲審17/30＝1.7，五槍／手套／雙手／衣袖皆2，但UI／互動／VFX仍不足，B未放行。完整結果見VISUAL_REVIEW_B7_WRIST_AXIS_FIXED_20261007.md。後續4b80貼合袖口兩版各57/57及23/23pixels；再修Major通訊、選手資訊與工具移到戰場外，新UI版取證中。以RESUME_CHECKPOINT.md頂部為最新下一步，以下055來源只保留歷史，不套到新source。

101原圖與後續張力袖78原圖的獨立複審均已完成，衣袖仍評1，**B尚未正式放行，C/D/E未開始**。目前另有離線布褶新候選正在GPU驗證，不能挪用以下歷史結果。本文件下列技術結果屬source `055a2302`的歷史同版證據，不套用後續新候選。不是最終Premium／Owner Review報告。原checkpoint HEAD `0be09c29774c81e06113dc9cc649101d74114658`保持，本輪不commit／push／deploy、不動MOBA。

## 來源與證據

- FPS source／assets共57檔，SHA `055a2302ddedd0dbac1755f96b18e37a3948f97440a0c3ff469737b88171fa5e`；archive bundle SHA `55f008d49201b68c4e9c1d2531115175e277cc9ffa705234baeb083ade45daa8`。
- 封存build：`profile-builds/phase-b7-palm-panel-shotgun-desktop-mirage-20261006-1366/build-manifest.json`。後續GPU重用前逐byte核對source及全部public資產；新驗證不覆寫既有verdict。
- 正式build原生exit0／39.48秒；Worker `fpsSim.worker-CDIbjNSY.js`與archive逐byte SHA `405f85ffe5da7807f6d77cd57188a21df5af1249b7bf146c1b9808dec55cab15`。正式Worker12/12／exit0：三圖major＋Mirage legacy，同瀏覽器完整canonical SHA一致，主執行緒持續回應。證據 `evidence/worker-production/gate-1791290201468.json`及`b7-palm-panel-shotgun-worker-production-resume-20261006.*`。
- B指定CPU回歸13項齊：先前同版POV37／衣料22／socket63三段，加剩餘10/10 scoped／exit0、simulation210秒。完整log、native exit、runner state皆保存；累計22/122不是全repo通過。

## Browser gate

全部log／exit／gate／metrics／PNG／isolation位於`evidence/`。PowerShell完整log保留UTF16LE BOM，讀取時應尊重編碼；不從UTF8誤解碼的空正則結果推定未驗證。

| Phase／viewport | 結果 | 覆蓋與限制 |
|---|---|---|
| palm-panel-shotgun D1366／M390 Mirage | 各58/58 PASS／exit0 | 五槍、兩種實際錄得reload、六身份正反、衣料與handling。 |
| perf60 desktop 原樣本 | 6/6技術PASS／exit0 | 29.866FPS；保留明顯低FPS，不當品質PASS。 |
| perf60-clean D1366 | 6/6 PASS／exit0 | 同版60秒combat 59.791FPS；舊下降未重現，尚未證明外部負載根因。 |
| final-lifecycle D1366 三圖原嘗試 | **HARNESS_FAIL／exit2** | Mirage43、Dust2前19項已執行且fail0；Dust2缺合法換彈frame中止，Inferno未開始。不得標62/62整體PASS。 |
| final-lifecycle-di D1366 | 74/74 PASS／exit0 | Dust2／Inferno音訊、ambient、socket、動畫暫停／屍體、上下pose、POV、衣料。未請求handling。 |
| final-lifecycle M390 三圖 | 111/111 PASS／exit0 | 同上三圖；未請求handling。 |
| final-handling-mirage D1366 | 18/18 PASS／exit0 | 真權威換彈／蹲姿、POV進度、pause／seek。 |
| final-handling-mirage M390 | 18/18 PASS／exit0 | 同上；48533ms，非真手機。 |

Dust22073 frames僅一筆reloading標記，frame1443的roundMs54000在實際start54224之前；沒有符合現有「已500ms／尚餘1000ms／hp不變」前提的合法frame。Inferno2185 frames沒有錄得reload。兩圖換彈為 **NOT_MEASURED_NO_ELIGIBLE_RECORDED_FRAME**；不改seed、fixture、產品或原斷言湊情境。Mirage真換彈已分開驗證；這項缺口保留給後續C/D/E與Owner Review，不冒充跨圖換彈覆蓋。

真手勢開啟AudioContext、原生聲音／環境loop PCM、暫停／seek不派送歷史音、有限voice與取消均有Browser證據；不能代替真手機解鎖或主觀音色聆聽驗收。GPU guard只查前後快照，不保證整個取樣期間無其他程序負載；不操作其他工作區行程。

## 實測成本與取捨

| 桌機GPU情境 | FPS | p95 ms | calls p95 | tri p95 |
|---|---:|---:|---:|---:|
| Mirage乾淨60秒D | 59.791 | 16.8 | 455 | 237870 |
| Dust2 lifecycle D | 60.100 | 16.8 | 460 | 214750 |
| Inferno lifecycle D | 59.793 | 16.8 | 483 | 219398 |
| Mirage lifecycle M | 59.759 | 16.8 | 450 | 210156 |
| Dust2 lifecycle M | 60.077 | 16.8 | 458 | 211204 |
| Inferno lifecycle M | 59.968 | 16.8 | 476 | 212622 |

AMD Radeon ANGLE D3D11桌機；D canvas1120×630／DPR約1／shadow2048，M是390 CSS viewport／DPR1.5／shadow1024。M不是手機硬體。十名rigged保留、無新增PointLight／SpotLight、page／console error0。

Mirage乾淨60秒p99=16.8ms、max166.6ms、一筆self longtask180ms；不能宣稱完全無長幀。先前60秒p95=99.9／p99=166.7／max716.6ms、self565ms仍完整保留。新短窗不覆蓋舊長窗；未定位舊根因，不把推論當修復。

**calls仍超起始advisory D300／M150**。此階段取捨是保留全部十名真rig、手骨武器、裝備層次、實體建築與掩體、陰影及原來源幾何；不隱藏人物或碰撞物來達預算。五族來源tri為2243／2708／3772／3047／5388，原對應上限2400／2800／4000／3200／5500；POV私有owned5118≤5200，衣料verifier仍守原全三角面積、服裝本體、50套槍裝及材質數上限。來源借用geometry／有界共享材質lease、鋼木分區不新增mesh／texture／draw、單pass地面陰影及衣料／配件合批皆保留。

實測active tri低於D750k／M300k起始預算；紋理估計D約74.39MB／M約70.39MB低於256／128MB。這只是active測量與尺寸×4×mipmap估計，非全狀態max或實際VRAM。E仍須剖析真draw成本，優先靜態合批／共享資源及有因果效能比較，不能將本輪59.8FPS當calls預算已達。

## 完整截圖與品質

完整集合 `evidence/b7-frozen-full-capture-inventory-20261007.json`：9目錄、101原PNG。97 MEASURED、4 NOT_MEASURED、0error；4張位於中止的D Dust2缺capture metadata，未猜crop或補造JSON。全部逐圖pixel JSON保存。像素工具是自製fallback，不是官方inspector／Premium證明。

前次54圖完整獨立評分及Owner分數都1.8/3。這次101/101全圖、3/3 anchors與18份JSON完整Fresh-Eyes已完成：19/30＝1.9/3，五槍、手、手套皆2；衣袖仍1，前臂偏平、規則線較強，自然褶與張力不足。Owner採較低分，不以舊54圖衣袖2或Node綠燈反駁。詳見 `VISUAL_REVIEW_B7_FROZEN101_20261007.md`。原量表10類分母固定、Premium每類≥2且平均≥2.3；互動仍1、toast與聊天重疊、方盒場景風險及整體polish保留，不能現在宣稱完成。

後續衣袖張力幾何候選source `ba9074e345c70a8557f1f9d07e61a827ed7fd0059e4accf3036993d67f235f67`、bundle `2b0f01fd8b1a2c1b8225d0095cc3917bc596d7dd69c379e43551b60daefc549b`：三段Node PASS，D/M/完整log補測M各58/58 PASS／nativeexit0，78像素全部MEASURED。但78/78原PNG＋3/3 anchors盲審16/30＝1.6，手／手套／袖與六身份正面仍1，详見 `VISUAL_REVIEW_B7_TENSION_DRAPE_20261007.md`；已退回，不追加該候選長窗／Worker冒充完成。首輪M完整stdout未落檔，gate／metrics／PNG／isolation保留，另獨立新phase補測完整log，不偽造缺失。

最新離線布褶候選使用原創Blender60幀布料、每袖779tri靜態資料與BufferGeometry，不加runtime物理，原UV物理尺度、端點與成本斷言保留。POV／衣料／socket三段PASS，袖verifier只改以材質語意選取BufferGeometry，原腕點與roll断言未放寬；D GPU正在收取。其正式長窗／build／Worker與完整盲審仍NOT RUN，不挪用歷史同source成績。最新actual session、source與額度以RESUME_CHECKPOINT頂部為準。下一步處理具名B阻擋與同版證據後才更新放行；C先實作major限定的經濟／flash／單一defuser與不可變frame，再戰術因果證據，保留legacy／Router／Competition／Result／Progress／Reward邊界。最終停Owner Review，真手機FPS／觸控／safe area／音訊未實測。
