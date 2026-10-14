# B7 長窗效能診斷（未放行）

## 2026-10-08 重開前最新實測與診斷停點

- c2a同精確build新短窗D37.617FPS／p9533.7ms，M59.743／16.8；D60秒33.892／p9549.9／p9950.2／max350ms，7/7 native0。緊接同參數舊fdaa60秒40.445／p9533.6／p9938.5／max266.7ms，7/7 native0；兩版都有下降，未定位根因。calls同455／tri237860與237862、十actor／桌機DPR1／shadow2048保留。所有原始phase／log／exit存evidence，數據彙總 `b7-resume-reopen-state-20261008.json`。
- 唯讀worker按2236有效CPU profile sample祖先重分（30.744秒窗）：matrix family self2473.39ms屬renderer.render鏈、1726.62ms屬syncAnchors鏈；主pass renderBufferDirect1099.24ms、shadow約450ms。這是profile成本，不能換算正式FPS／GPU成本或宣稱shadow單因足夠解釋下降。
- 候選是scene matrixAutoUpdate每幀讓root dirty強制整樹、syncAnchors重走角色／weapon子樹；Three r160 force=true會越過子物件matrixWorldAutoUpdate=false，只關子旗標不足。worldGroup查無runtime transform寫入，fade僅材質／visible；仍須定向反例。
- 新增tool-only `fpsStaticMatrixProbe.mjs`及matrixDiagnostic flag草案，語法exit0，**runtime NOT RUN**。重開前Owner要求保存；新session先依checkpoint所列補齊完整性／還原／byte matrix／權威快照守門，才跑paused同步render對比。實驗數據不得當作active FPS、zero leak或性能已修復。
- 最新背景查詢另見外部MOBA工作區Vite build，未操作；前後GPU隔離快照只排除其他esmo-cdp gate，不代表CPU／GPU整機完全無負載。沒有把這項限制直接當成已證明根因。

- 同條件60秒：新2236桌機31.889 FPS／p95 49.9ms；前版e7桌機38.031／33.6ms。兩者都低於較早同版59.4樣本，不把全部下降歸因於新袖shader，也不宣稱新版無回退。
- 系統讀取：6核12執行緒，CPU負載83%，其他工作區有MOBA balance 3個worker及品質verifier；未操作那些程序。這是限制，不是已證明的單一根因。
- 兩份30秒CPU profile主要self samples均在updateMatrixWorld／updateWorldMatrix／renderBufferDirect。沒有僅由CPUprofile推定GPU成本。
- production trace build source2236、bundlefa4e9dca…；30秒排程trace資料遺失，10秒完整排程trace超64MB，均HARNESS_FAIL，完整logs及native exit2保留。未放寬trace資料完整性／64MB門檻。
- 唯讀probe工具允許trace重用目前source及public逐byte相同、manifest.trace相同的既有build；普通測量不得借trace build，舊版reference仍禁止trace。此工具改動避免重建相同內容，沒有修改產品斷言。
- 10秒stage trace `phase-b7-arm-trace-stages-desktop-20261007/1366` 7/7 PASS、native0、46092ms，trace約3.9MB完整保存。按同thread start/end pair收樣：render321次平均wall23.0ms／thread21.9ms、p95 28.4／25.6；dynamic321次4.59／4.48ms、p95 7.12／6.93；camera0.35ms、labels0.40ms、POV0.09ms。trace有額外標記／取證成本，31.91FPS不作正式效能成績。
- 已定位主要階段是render，但尚未分清draw submission、GPU等待及CPU負載差異。下一步在相同正式production來源復測，並以定向渲染診斷驗證，不降低DPR／陰影、不隱藏十名actor、不把工具PASS當效能PASS。
- B袖方向性裁片候選正在驗證：原頂點／索引／骨權重保留，一次性shared bind geometry造型，額外逐像素袖皺計算移除。這是視覺缺口修正，不宣稱已解決效能。

## 最新順序對照

c708候選60秒56.735FPS／p9533.2／p9933.5／max249.8ms，緊接e7同參數58.009／p9516.9／p9933.4／max199.9ms，各7/7 native0。差異較前輪縮小但p95仍有回退，且非同步A/B、系統負載不同，不宣稱已證明無回退。兩組callsP95455，畫質與十角色保留。trace階段內沒有持續compileShader或linkProgram；不能把瓶頸指為每幀shader重編譯。
