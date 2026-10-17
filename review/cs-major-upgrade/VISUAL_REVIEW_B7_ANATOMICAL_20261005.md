# B7 解剖手型完整截圖獨立審核（2026-10-05）

來源 fingerprint `6e17e6c9cac611869fb8cb6ea747853fb3085e23d03c809e820de09afec19787`，**不含其後織物法線／掌背墊片／握持追修**。依 visual-scorecard Fresh-Eyes 規則，唯讀代理只收到完整 PNG、scorecard／三張校準圖與 inspector metrics，不讀原始碼、git、handoff 或舊評分；實看 87/87 PNG，未寫檔或跑測試。

## 完整證據

全部位於 `review/cs-major-upgrade/evidence/`，沒有挑最佳鏡位。完整索引及每張像素值為 `b7-current-complete-review-inputs-20261005.json`。

| 集合 | 寬度 | PNG／MEASURED |
|---|---:|---:|
| phase-b7-anatomical-grip-desktop-20261005 | 1366 | 20／20 |
| phase-b7-anatomical-grip-desktop-gl-20261005 | 1366 | 29／29 |
| phase-b7-anatomical-grip-mobile-mirage-20261005 | 390 | 11／11 |
| phase-b7-anatomical-grip-mobile-dust2-20261005 | 390 | 9／9 |
| phase-b7-anatomical-grip-mobile-inferno-resume-20261005 | 390 | 9／9 |
| phase-b7-anatomical-grip-desktop-inferno-resume-20261005 | 1366 | 9／9 |

各像素工具 exit0；87 MEASURED、0 NOT_MEASURED／ERROR。第一集合最後 Inferno GPU 崩潰，原 gate HARNESS_FAIL／exit2 不因前兩圖有效截圖而改為PASS；其餘GPU結果及後端分開記錄。

## 獨立 scorecard

Owner 只看部分重點圖，不冒稱已逐張完整自評；採完整獨立評分，不以實作量或 assertion 數推翻。

| 類別 | 獨立／採用 | 可見證據 |
|---|---:|---|
| Art direction | 2 | 三圖貨港／水務／鑄造設施有形式及材質差異，未形成全表面一致身份 |
| Hero/player | 1 | mirage-detail 與窄版 POV：角色裝備大塊、袖及握拳簡化；槍械單項2不代表全人物2 |
| Obstacles/enemies | 1 | 同隊體態／背部裝備重複，主要以藍／綠及頭部裝備分隊 |
| Rewards/interactables | 1 | A／B場地標記與C4可讀，但捕獲未呈現兩種完整互動狀態 |
| World/environment | 2 | 貨港吊架、工業高低量體及管線已高於scene-1；空院／近牆／外圍仍稀疏 |
| Materials/textures | 2 | 石材／金屬／木箱及槍械材質可分，人物袖仍大片平色 |
| Lighting/render | 2 | 投影與接觸可讀，槍及手套暗部有時黏合 |
| VFX/motion | 2 | 射擊曳光、煙霧、受擊環／換彈姿態有真狀態提示；靜態圖不能證明時序或流暢度 |
| UI/HUD | 1 | 通訊五行遮走道／人物附近，部分窄版血條缺完整姓名；POV底部人物卡已移出戰場 |
| Performance evidence | 2 | 完整renderer與分位數，但超advisory、缺可比前後與真機證據，不表示效能放行 |
| 平均 | **1.6/3** | **未達Premium／AAA／Showcase** |

第一人稱子項：槍械本體2/3、握持1/3、手套1/3、袖1/3。五族輪廓可分；手槍雙手接觸容易讀成兩塊黑袖口／拳頭，閉合姿態難讀虎口、拇指與扳機指。狙擊換彈圖已看見分開指頭，不能宣稱完全無手指或一定穿模。長而平滑深青前臂缺明顯折線、縫線、袖口厚度與腕部壓縮。最小下一步先修共用手／袖及接觸姿態，用 pistol／rifle／sniper reload 複核，不重做已達2的五族槍械主體。

## 量測與限制

- 像素fallback非官方inspector：entropy3.148–4.366、dominant share.141–.418、contrast61–167；87張中65張edgeDensity<.04。沒有entropy<3／dominant>.6／contrast<60極端訊號，但低edge及近牆／大片平面仍支持稀疏疑慮；貼圖與HUD也會提高複雜度。
- D3D11桌機三圖FPS59.67／60.07／60.08、p95均16.8ms，calls444／460／481對advisory300；triangles211450／211706／216350。第一集合是部分有效圖，不能稱該三圖gate全PASS。
- OpenGL桌機18.48／19.04／19.63FPS，p95 83.3／66.7／50.1ms，calls444／460／483；與D3D11不可直接合併。不能斷言calls是OpenGL慢的唯一根因。
- D3D11窄版58.75／59.77／60.07FPS，p95均16.8ms，calls450／458／476對advisory150；triangles207018／208156／209562。桌機AMD GPU，不是真手機。
- geometries348–364、textures35–36、materials985–1000、meshes1253–1269、instanced2；texture estimate桌機約63.7MB／窄版59.7MB，非VRAM。超預算與長幀仍需E處理，不能靠降低DPR／shadow假裝優化。
- 可確認的automatic failures：通訊UI遮視野／不完整標記、人物輪廓高度重複。世界有拱頂／窗框／管線，不能僅因建築矩形就判primitive-dominant。
- 未證明動畫連續性、動態穿模、真實觸控、safe area與真手機音訊／FPS。完整換彈影片及320／360／430仍待。B7未結案，C→D→E仍屬原長任務，不push／deploy，最後Owner Review。
