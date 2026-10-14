# Owner四項Gameplay修正：2026-10-14（工程完成，Owner Review）

最新實際停點：Owner4B已完成，Preview session11892／PID134264；每週usage最新剩12%，5%（含以下）停工。最終收件 evidence/owner4b-review-20261014/owner4b-engineering-final.json。工程剩餘0，Owner／手機真機驗收待Owner安排。

## Owner4B最新收件：2026-10-14（工程完成，Owner Review）

桌機 Preview：http://localhost:5183/ESMO-/ 。owner4b-pristine-20261014、session11892；已核對舊PID147032/5183為本任務Preview才替換，其他服務/foreign/MOBA不動。正式build無probe、完整public，HTTP200且HTML與全部10個JS逐byte同archive。source 087a4da2c843a6cffe779435c2275397bff6dbf53621d3f90b55e3a9eeb17984（108份）、bundle e672dfb6f3e84555ec3090d8e8d6170d20fa0c746c109a196eaf6d80bd4d195f。

四項產品修正：保留pelvis經父座標轉換後的真世界UP位移；可見鞋底/屍體支撐點對同一份渲染floor triangles接地，死亡服裝先sync→sample/apply→sync，settled corpse快取。公共fallback使用正式LOS/局部clear-ray，保留TTL情報與合法corner預瞄。Mirage外牆內部端蓋/頂部腰線及箱體鋼條有真間距。HE改短暖色接觸/火花、棕灰塵煙，與閃光白屏區分，全部依保存detonation time，無新增scene light或傷害邏輯。

有效守門：真GLB接地27/27、99動態樣本34/34、HE7/7、front-wall5/5與awareness15/15；三圖contact12/12、tactical34/34與同seed JSON SHA一致、utility rules37/37。真Browser settled corpse/crouch22/22、smoke/HE/flash原生1x31/31、正式Dashboard→CS→Battle→Result26/26，皆native0。Mirage temporal140樣本/4 movies；固定POV40樣本像素一致、移動sample10/11人工看牆面紋理，出現的血條另為UI；本輪ROI .35與舊.65不同，不作RGB改善比值。CPU Building6 eye-band16→0、crate100競爭對消除；不是全圖視覺PASS，尚有2483幾何候選（不少內部/遮蔽），Owner仍須驗收全角度/時間。

初次ground整合22/27的SkinnedMesh bindMatrixInverse問題與settled corpse19/22的服裝穿地問題已修，原紅燈/native保留；runner缺唯一路徑的兩項拒跑屬HARNESS_SETUP_FAIL，設定後才真執行。不覆寫/洗綠舊證據。34/34的5mm診斷仍3個5.213mm超值，原8cm守門全過，最大動態可見接地誤差約2.5cm，不宣稱全5mm。死亡contactY現在記真取樣surfaceY，不再以rootY+offset誤報；最後只有診斷欄位差異，22/22與31/31的anchor來源可精確反推一致。

證據與限制總收件：review/cs-major-upgrade/evidence/owner4b-review-20261014/owner4b-engineering-complete.json；完整native/streams與child logs保留。舊B7/30/55/legacy等無關有效證據不重跑；legacy原安包NOT_TRIGGERED維持。手機真機FPS/觸控/視覺未實測，cloudflared未安裝，不給無效區網網址。專業CS體感及所有角度仍由Owner驗收。

每週剩5%（含以下）停工門檻已保存AGENTS.md與官方quota guard，取代3%。■ 修正｜■ 必要驗證｜■ Preview/文件｜□ Owner/真機驗收；工程剩餘0分鐘。無commit/push/deploy，不開始下一Sprint；完成後僅保留Review Preview服務，沒有宣稱未存在的背景工作。

## 以下為已保留歷史停點


玩家承諾：真射界內持槍者各自取得反應與武器時間，不以對槍勝率抽樣決定誰才准開火；每次射擊、命中、致盲、投擲與安包都有同一份權威事件的可讀呈現。尋敵只用自己的導航段、地圖入口與真TTL情報，沒有讀隱藏敵人位置或假射擊。

核心循環保留賽前戰術→真購買與固定出生→移動/角落預瞄/合法短peek→真接敵與獨立reaction/cadence→道具/炸彈→真戰果。導航與collision仍由既有safeMove與map walls負責，能力仍影響reaction、精度、選擇與協作，Legacy舊排程隔離。C4安包不冒稱丟擲炸彈。

場域：沿用三圖實導航/LOS，視線掃描與peek對準自己的approach/route，不全隊改成衝中路；短peek必須能真導航返回掩體，不能用渲染假位移表演。

根因Before：scheduler 1/3（兩個PRODUCT_FAIL）、POV真consumer clock 5/9；HE armor14/14已有效，單純補說明。真GLB43clips無throw/plant專用clip，將用事件驅動原創有限additive骨骼pose，不冒稱已有真clip。投擲物共用過大球體及球尾、煙7秒grow、無POV blind screen、utility ground rings皆已source核對。

技能/Reference：Director與phase-playbook、gameplay-systems/game-feel、debug-profiler與scene/debug checklists、create-game-vfx已讀；generator sibling四級path fallback缺失須保存，素材不引用Valve未授權檔。現有CC0人物/武器/音效沿用；投擲物原創真比例罐/瓶/HE輪廓，不宣稱Valve資產或AAA分數。Browser/Node界線、真機未測、Owner Review不push/deploy保持。

## 2026-10-14 台北：四項工程收件，Owner Review

最新桌機 Preview：http://localhost:5183/ESMO-/（pristine，session17765／PID182708）；5182是上一版對照。source `dd702338876280093683c67fa8cc72a775197909f32ce1b3d2785bbd4358c111`，bundle `006a5d26ecee755aa3dcec45b8b74ff9d75e3892907e4db9762dfb96b2e06854`。HTTP200、HTML與全部JS逐byte同archive，preview-proof.json保存。未commit/push/deploy。

1. Major每個持槍者各自取得真reaction/ammo/cadence射擊資格，不再以pair勝方或同目標reservation剝奪射擊。same-ms雙向成立；能力保留反應、精度、協作與換彈。三圖fresh 5v5 contact12/12，無無解釋≥1.5秒 loaded-ready-visible不射。這是固定樣本，不能推論所有POV位置永無停頓。
2. 四型原創metre-scale模型、真事件驅動draw/release/recover，C4安裝／拆彈是蹲姿互動；沒有假稱投擲炸彈或已有專用GLB clip。煙約0.9秒grow、增加煙/HE dust、真blindSec→POV白屏文字。球尾與utility地面圈移除；防彈衣HE減伤分支14/14，tooltip補說明。型態不是Valve素材。
3. POV使用roundSec與shotAtMs同時間域，R2+槍火/recoil與正傷害hit指示均在真Browser非空；未選人切視角的null例外已修。手臂交叉與投擲浮動袖口經人工檢圖修正，再取真native畫面，沒有圖像後製。
4. 只用自身route、公用map approach與TTL隊伍情報的有界scan/corner preaim，轉角減速；近掩體且合法時真out/back peek。完整tactical34/34；normal Mirage觀測32次返回、Dust5次，Inferno本seed未觸發peek；另有被交戰／路線切換／死亡打斷及快照未觀測完整返回，沒有把所有啟動當成功。四份觀測issues皆空，wall crossing/teleport為0；不是專業水準評分。

必要驗證：queue9/9、POV clock9/9、awareness15/15、真GLB arm23/23、真renderer13/13、utility26/26與continuity9/9、utility rules37/37、weapon handling21/21、三圖contact12/12、tactical34/34。最新動作/POV Browser29/29（arm-continuity）；utility Browser29/29（posefix archive，只有後續POV上臂追加，utility module/engine未變）；pristine正式Dashboard→CS→Battle→Result26/26。Browser全部native0且自有Chrome cleanup confirmed/profileRemoved。

完整失敗保留：first scheduler fractional cadence反例→ceil修正；角度負%反向scan→wrap修正；action Browser28/29 PRODUCT_FAIL/null.dead→null actor守門；未傳supervisor `--` 的0/0 HARNESS_FAIL只修呼叫。其他fixture校正為真seekNonce／真Sprite共享geometry ownership，沒有調鬆產品斷言。Legacy整場JSON仍精確同c9 SHA b90b4296…（913frames/15rounds），原seed安包0，gate保留2/3/native1 NOT_TRIGGERED，不改seed洗綠。

工具契約校正：C5B.2是named Group與真罐/瓶，不再由球材質或固定204object推定位址。保留x/z/time/landing/phase連續斷言，新增pause旋轉與圈/尾跡0；grow反例改在真成長區間測，不要求已完成煙霧繼續膨脹。HE/MOLLY傷害與smoke LOS未變。影片般全時間視覺、所有位置閃爍、真機FPS/觸控/窄螢幕姿態與Owner體感未實测。

root已人工看最新三張動作PNG及三張道具部署PNG；姿態代表影格可讀，部署PNG不等於爆炸峰值或全時間RGB證據。utility-draw短窗PNG未拍到則保留NOT_TRIGGERED；同段真1×telemetry已觀測draw。舊30/55/B7有效證據未重跑。素材generator skill path ladder全缺，官方credential probe三key皆MISSING；沿用CC0與原創geometry，不調第三方generation／不花額外API額度。

■ 修正｜■ 必要驗證｜■ Preview/文件｜□ Owner體感／真機驗收。工程剩餘0；Owner驗收時間由Owner安排。既有AGENTS.md進度條／時間偏好保留；不開始下一Sprint。


## 最終LOD收件（優先於上方pre-LOD收件）

最新桌機 [Owner Preview](http://localhost:5183/ESMO-/)，pristine `owner4-pristine-lod-20261014`、session51662／PID175048。source `67c03bd87c17e247f03b32e489535a5bf994d7cc53fc7e041973739e34a3af40`；bundle `9d3ecd07e022f1358dec06b110e1f0ecc8b30d58b23d38d63117a0325a8233ab`。HTTP200、HTML與全部JS逐byte同archive；最終動作Browser29/29、utility Browser29/29、pristine正式Dashboard→CS→Battle→Result26/26，全部native0與自有Chrome cleanup confirmed。主閱：`review/cs-major-upgrade/OWNER4_CLOSURE.md`、`evidence/owner4-review-20261013/owner4-engineering-final.json`。

私有tree原6458真紅→離線cloth LOD與四part slot修正後，四型HE4724／flash5096／smoke4448／molly4634，strict5200與全部41條原斷言/新反例通過；utility27條含cache/resource檢查。最終source Browser兩支29/29與pristine26/26。root人工看LOD最終plant/release兩張，R2fire/draw短窗PNG未捕獲則NOT_TRIGGERED，真Browser同情境已觀測。源bake與人物GLB未改；LOD最大表面取樣偏差10.96mm、bounds/UV/normal/color保留；沒有宣稱完全相同皺摺。上方舊pristine/preview/source/hash只作pre-LOD對照，不是最新After。

■ 修正｜■ 必要驗證｜■ Preview/文件｜□ Owner／真機驗收；工程剩餘0。


## 2026-10-14 最終四項收件：工程完成，Owner Review（本節優先）

最新桌機 [Owner Preview](http://localhost:5183/ESMO-/)。正式獨立 owner4-pristine-final-20261014，session39140／PID147032；source 15ae830c7923ee71ad67a294500c2366a707cd5c8d8780e055e2eb32b2075d8d，bundle 4ae13686774921db249405c3cfa694645c287899d2f9ee466e27b13cf2bec834。HTTP200、HTML與全部JS逐byte同archive。
最後地面記號包含道具圈／球尾與A/B固定圓環／圓形填色均移除，保留A/B字母。實Browser31/31＋新pristine正式Dashboard→CS→Battle→Result26/26，native0與自有Chrome cleanup confirmed/profileRemoved；root人工看B點新PNG無圈。
最後兩個Major-only visible旗標精確反轉後，全部105份source/asset的SHA回到已驗LOD版本：ground-only-source-delta.json。所有simulation、pose、utility、shader、素材與controls不變，原contact12/12、tactical34/34、POV41/41（最壞5096<5200）、utility27/27與動作Browser29/29證據繼續有效，沒有重跑舊對局／30／55／B7。
最後工具首輪30/31把objective-site共用tag六個物件誤算為字母；保留原失敗與native1，再以實PlaneGeometry+CanvasTexture精確挑兩個字母，兩字母及visibility門檻未放寬。後續未改產品或scene/frame救測試。
主閱：review/cs-major-upgrade/OWNER4_CLOSURE.md；完整收件與所有native/streams證據索引：evidence/owner4-review-20261013/owner4-engineering-complete.json（SHA c5431308fc792196b2c3ab9b8eb0980cdc05c4a7cd60e840c9d9fee032fa2322）。前版所有source/hash/Preview收件只作歷史對照，本節為最新After。
Legacy完整JSON同c9，但原安包0仍2/3/native1 NOT_TRIGGERED；未改seed洗綠。Owner專業CS體感、所有位置／全時間視覺與手機真機FPS/觸控仍待驗收。進度條與剩餘時間偏好已保存在AGENTS.md。
■ 修正｜■ 必要驗證｜■ Preview/文件｜□ Owner／真機驗收。工程剩餘0；Owner驗收時間由Owner安排。沒有CS背景測試仍跑，僅保留Review Preview服務。僅停止核對過的自有舊5183／PID175048再替換，其他舊Preview與foreign/MOBA／未知程序保留。未commit/push/deploy，不開始下一Sprint。
