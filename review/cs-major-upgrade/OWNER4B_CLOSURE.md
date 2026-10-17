# Owner4B：浮空／看牆／Mirage閃爍／HE修正

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



### Owner4B接地與HE呈現架構（2026-10-14）

新增 src/battle/fps/presentation/fpsVisibleGrounding.js：nondeath pelvis保留經parent matrix投回local的世界UP位移，鎖住水平root motion；支撐點只取可見鞋底80候選/屍體1597候選，不拿cached Box3/hidden mesh當接地證據。fpsBoundsSampler.js繼續用於既有framing/診斷，沒有被改成另一份真地面。FpsCharacterRenderer順序是restore→mixer/pose→衣物sync→可見support取樣/apply單一modelY→衣物再次sync。停止的屍體使用姿態/root/visibility signature快取；權威parent X/Z與frame不變。Death contactY另記真取樣surfaceY，不能以rootY+offset代替。

新增 fpsFloorSampler.js：初始化讀同一份場景ground/roads/paving/room floor/paint triangles並以2m空間格索引；真callback傳入renderer，包含ramp tessellation與各種lift，不把.045寫死全圖。它只服務呈現，沒有第二份導航/collider/Store。真CPU15定姿+99動態與Browser三圖已保存完整可見vertex oracle；5mm候選不是全部通過（3個5.213mm），原8cm門檻不放寬。

新增 fpsHeVfx.js：4事件、每事件2暖色contact/6 sparks/3 brown-grey dust，最多44葉物件；contact .18s、sparks .32s、dust1.10s，依保存detonatedAtRoundSec與subframe，不讀wall time。Reduced motion移除動態火花仍保留暖色/塵煙；不新增PointLight/後處理/傷害或地圈。時間是本案設計值，非Valve公布參數；[Valve CS2視覺](https://www.counter-strike.net/cs2)僅作風格參考。

fpsAwarenessLook增加同源walls/lineBlocked，僅公共node/local clear-ray與TTL情報；保留合法corner/trueintel預瞄與封閉空間明示理由，沒讀hidden enemy/沒改duty或route。Mirage closedFacade只省內部outer endcaps（window jamb保留），belt兩端退30mm；crate steel最多20mm呈現外突、正規collider不變。Geometry candidate不是flicker outcome KPI；所有角度、專業CS體感与手機真機仍Owner驗收。
