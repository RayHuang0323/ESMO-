# CS-C4B｜兩張地圖環境完成 handoff

> 狀態：`C4B_TWO_MAPS_READY_FOR_OWNER_ACCEPTANCE`
>
> 基線：`origin/main 695fa0f8d4b6d46e274cc56b123b67252cc242ce`
>
> 分支：`feature/cs-c4b-two-map-environment`（尚未 merge、push、deploy）

## 交付摘要

C4B 將 C3/C4A Mirage 已驗證的 environment production framework 套用到 Dust II 與 Inferno。三張地圖共用 environment presentation、PBR-style material、geometry cache、zone summary、三種 tactical camera、smart façade occlusion 與驗證流程；沒有複製 Mirage 的建築造型、路線 placement、配色或 landmark。C2C 角色、武器、animation、MatchSession、碰撞與玩法 authority 均未改動。

## 地圖 identity 與完成範圍

### Dust II（第二張地圖）

- Identity：日照沙岩戰術據點；沙岩／塵土／藍綠導視。
- 區域：A Site、B Site、T Spawn、CT Spawn、Mid、Long、Catwalk/Short、B Tunnel、Mid Doors/Lower。
- Presentation：沙岩與石材 façade、長道 route mark、Mid Doors/Xbox、B Tunnel arch、Catwalk stairs/railing、A/B site boundary、crate、barrel、utility tank、awning、lamp。
- Runtime：235 environment mesh、3,134 estimated triangles、28 material families。

### Inferno（第三張地圖）

- Identity：地中海磚瓦街巷；陶土／紅瓦／橄欖綠。
- 區域：A Site、B Site、T Spawn、CT Spawn、Banana、Mid/Second Mid、A Connector、Apartments、B Top、Pit/Cemetery、Connectors。
- Presentation：陶土 façade、紅瓦 roof、石材 arch、B fountain/garden、Banana car/barrels、boiler/pipes、Apartments balcony/awning、B Top stairs、cemetery stones、olive route marks。
- Runtime：288 environment mesh、3,998 estimated triangles、28 material families。

### Mirage（既有 C4A 基線）

- Full-map C4A 保留：333 environment mesh、4,736 estimated triangles、28 material families。
- Owner Review 同頁包含 Mirage、Dust II、Inferno 的四種畫面：Battle runtime、高位上帝、中高位總覽、側上方戰術總覽。

## Camera / occlusion

- 三張地圖共用同一套 Auto Director、Character close follow、高位上帝、中高位總覽、側上方戰術總覽能力；沒有新增第二套 camera authority。
- Mirage、Dust II、Inferno 各自的 3/3 preset 都在 Battle runtime 實際切換成功。
- 每張圖 10/10 rigged player、Blue 5 / Red 5、visible 10/10；高位視角沿用既有 `c3Occluder === "structure"` façade fade/hide policy。
- `wallRects` / `mapWalls` 仍是 legacy collision source；environment summary 明確標示 `noCollisionMutation` 與 `noGameplayMutation`。
- Camera recovery、StableCanvasRegion geometry、RAF_FIDX coherence、Player identity 與 C2C animation contract 均保留。

## 驗證結果

- Static：Renderer 24/24、CS-A2 10/10、C2A 13/13、C2B 14/14、CS23 28/28、Camera 8/8、RAF 7/7、StableCanvas 5/5、C2C 9/9、C3 18/18、C4A 13/13、C4B 20/20 PASS。
- Browser map coverage：3/3 PASS；三張地圖 map selection、Battle runtime、三種 tactical camera、10/10 player visibility、browser errors=0。
- C3 browser slice：PASS。
- Production build：PASS（2,742 modules transformed）。
- Production desktop smoke：PASS；canvas valid、235 geometry samples、StableCanvas shifts=0、browser errors=0。
- Production 390×844 mobile smoke：PASS；canvas valid 370×437、234 geometry samples、StableCanvas shifts=0、browser errors=0。
- 180 秒 P0 long-run：PASS；1,733 samples、StableCanvas shifts=0、fIdx transitions=347、stale mismatch=0、duplicate RAF=0、duplicate render=0、rapid camera recovery=0、browser errors=0。

## 證據與 Owner Review

- Runtime evidence：`artifacts/cs-c4b/two-maps/runtime-evidence.json`
- Desktop captures：`artifacts/cs-c4b/two-maps/`
- Mobile captures：`artifacts/cs-c4b/mobile/`
- 單一中文 Owner Review：`http://127.0.0.1:5412/ESMO-/artifacts/cs-c4b/two-maps/owner-review.html`

## 已知風險

- Node/headless browser 與 390px emulation 已驗證；尚未做真機 Android GPU/FPS/觸控實測，這仍需 Owner 最後驗收。
- Vite 仍有既有 large chunk warning；本輪沒有為此做 renderer 大重構。
- 本輪停止於 C4B，沒有開始 C5，也沒有 merge、push 或 deploy。

## C4B/C4 正式收尾

- 狀態：`OWNER_ACCEPTED / CLOSED`
- Owner 已接受 Mirage、Dust II、Inferno 三張地圖的 C4B environment 內容；本次只做整合、驗證、部署與文件收尾。
- 不開始 C5；不修改 gameplay、weapon stats、Competition、Training 或 Season。
