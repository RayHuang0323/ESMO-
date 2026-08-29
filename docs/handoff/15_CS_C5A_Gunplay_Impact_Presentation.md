# CS-C5A Gunfire / Hit / Impact Presentation

狀態：`C5A_GUNPLAY_PRESENTATION_READY_FOR_OWNER_ACCEPTANCE`

日期：2026-08-27

基線：`origin/main @ eeda26883ec90801ccd1baed6563b650e94e66bb`

## 本輪邊界

本輪只增加 CS/FPS 的 presentation-only 槍戰回饋：槍口閃光、短暫武器光、槍口光束、tracer、低成本退殼、角色命中圈與粒子、材質表面樣本、死亡 pulse。沒有修改 weapon stats、damage、fire rate、gameplay recoil、economy、MatchSession、Competition、Training、Season，也沒有開始 C5B 的 grenade、smoke 或 audio。

效果由既有 `frame` snapshot 消費；`player.hp` 與 `player.dead` 仍是命中與死亡的 authoritative input，沒有建立第二套 combat state 或 death authority。

## 武器家族呈現

`src/battle/fps/presentation/fpsGunplayPresentation.js` 定義五個明確 family profile：Pistol、SMG、Rifle、Sniper、Shotgun。差異包含 flash scale、beam reach、tracer 寬度、light 色相、shell 尺寸與退殼規則；開火 metadata 由既有 `player.gun`／attacker snapshot 對應，沒有改變射擊模擬。

所有效果使用 bounded pools：flash 20、tracer 48、shell 24、hit ring 24、hit particle 72、death ring 16；pool、共享 geometry、material 與 map lifecycle dispose 都有明確界線。

## Hit / impact / death

既有角色 hit reaction latch 與 `FpsCharacterRenderer` 沒有改寫。C5A 在 `frame.players` 的 hp edge 上補 presentation hit ring，在 tracer 的 hit event 上依 surface catalogue 呈現不同反應；死亡只使用 authoritative alive → dead edge 產生 death pulse。這避免 hurt pose 被重新 latch，也不會新增死亡來源。

目前實際 Battle runtime 的 authoritative impact event 是角色命中（`surface: player`）。concrete、metal、wood、ground 四種材質已在 Owner Review 的隔離 showcase 驗證各自的顏色、粒子與 ring 語言；現有模擬沒有可消費的環境命中事件，且本輪禁止修改 collision／gameplay authority，因此不虛構牆面命中資料。

## P0 契約

本輪未修改 Player identity、CAMERA_RECOVERY、StableCanvasRegion、RAF_FIDX_COHERENCE、C2C rig／animation、hit reaction latch、focus camera、C3/C4 camera／smart occlusion 或三張地圖 identity。FX 只掛在既有 `fxGroup`，map rebuild 與 unmount 都會 dispose。

## 驗證結果

### 靜態 gates

- Renderer visibility：24/24 PASS
- CS-A2：10/10 PASS
- C2A：13/13 PASS
- C2B：14/14 PASS
- C2C：9/9 PASS
- C3：18/18 PASS
- C4A：13/13 PASS
- C4B：20/20 PASS
- Camera recovery：8/8 PASS
- RAF_FIDX_COHERENCE：7/7 PASS
- STABLE_CANVAS_GEOMETRY：5/5 PASS
- CS23：28/28 PASS
- C5A gunplay presentation：11/11 PASS

### Browser / build

- C4B 三圖 environment、camera、角色可見性：3/3 PASS；Mirage 333 meshes / 4,736 tris、Dust II 235 / 3,134 tris、Inferno 288 / 3,998 tris。
- C5A Battle runtime：Mirage、Dust II、Inferno 3/3 PASS；每圖均捕捉 gunfire、character hit、impact、death evidence。
- 五類武器 showcase：PASS。
- 五種 surface showcase：PASS。
- 390px mobile viewport C5A smoke：3/3 PASS。
- Production `vite build`：2743 modules，PASS。
- `dist` preview production smoke：canvas 430×507、108 geometry samples、stableGeometryShifts 0、browserErrors 0，PASS。

### 180 秒 long-run

- duration：180000ms
- stable canvas geometry samples：1,100
- fIdx transitions：234
- geometry shifts：0
- stale fIdx mismatch：0
- duplicate RAF：0
- duplicate render：0
- rapid camera recovery：0
- browser errors：0

## Owner Review

單一中文 Owner Review：`http://127.0.0.1:5470/ESMO-/artifacts/cs-c5a/gunplay/owner-review.html`

頁面包含五類槍械、四種 surface catalogue、Mirage／Dust II／Inferno Battle runtime、角色命中、死亡 feedback、render metrics 與契約說明。此 preview 由 C5A feature worktree 的 Vite server 提供，沒有 merge、push 或 deploy。

## 未宣稱事項

Node/headless browser 與 390px emulation 不能取代真機 Android GPU/FPS、觸控與長時間熱降頻實測；該項列為 Owner 最後的裝置驗收風險。C5B 尚未開始。
## C5A.1 Gunfeel & Combat Responsiveness（2026-08-27）

- 狀態：`C5A1_GUNFEEL_READY_FOR_OWNER_ACCEPTANCE`。本輪未 merge、未 push、未 deploy，未開始 C5B；此狀態不等同 Owner Acceptance。
- P0-A root cause：原本以 2,000ms simulation decision snapshot 排 pair，再疊一層隨機 fire gate，造成有效可見敵人被 queue / gate 延後 1–2 秒。修法是加上 authoritative reaction telemetry（valid visible → target acquired → fire permission → first authoritative shot），對新鮮且清楚 LoS 的 pair 優先排序，首次反應使用既有 rxn / focus / distance / weapon-family 模型（160–680ms），後續射擊仍保留原 aggression gate，沒有改 damage、fire rate 或 weapon stats。
- P0-B root cause：`Hit_Chest` 等 clip 含 root／hips／pelvis position tracks，AnimationMixer 會把 presentation translation 帶到 rendered model。修法是在 clip clone 階段移除這些 position tracks，只保留 hurt／fire／death rotation；world position 仍由 authoritative frame parent 設定。連續命中不會累積退後。
- P1-A/B/C：確認 combat 是 hitscan；tracer 改為完整射線的 95ms 短提示，muzzle 是 110ms impulse，加入 deterministic family recoil（pistol／smg／rifle／sniper／shotgun），hit latch 仍為每個 hp edge 一次，hurt 0.22s、fire 0.16s 並自然回復。
- P1-D：加入原創程序化 Web Audio core profiles：五類槍械各有 crack／低頻 body／tail，並以距離衰減與 18 voice cap 控制負載；不使用 Counter-Strike／Valve 音效資產。

### 量化 Battle evidence

- 修正前 baseline median：Mirage `2,000ms`、Dust II `0ms`、Inferno `0ms`；baseline p90：`6,000 / 4,000 / 4,000ms`。這些數值包含舊 snapshot／queue 粒度。
- 修正後 authoritative telemetry sample：Mirage `197`、Dust II `193`、Inferno `665`；median `276 / 250 / 267ms`，model window 內的正常首接戰鬥已為數百毫秒。因 simulation snapshot 仍是 `2,000ms`，排隊中的後續接觸 p90 仍為 `4,230 / 2,268 / 2,313ms`，不把 snapshot 粒度誤報成 render latency。
- 命中位置證據：Mirage / Dust II / Inferno 的 `Hit_Chest child drift max = 0`，`authoritative parent drift = 0`；樣本分別 `20 / 5 / 5`。
- 五類 audio profile `5/5`；三圖 Battle 皆產生實際 audio event（本次抽樣未宣稱霰彈槍一定被 simulator 發射）。

### Gates / build / runtime

- Static：Renderer `24/24`、CS-A2 `10/10`、C2A `13/13`、C2B `14/14`、C2C `9/9`、C3 `18/18`、C4A `13/13`、C4B `20/20`、Camera `8/8`、RAF `7/7`、StableCanvas `5/5`、CS23 `28/28`、C5A `11/11`、C5A.1 `15/15` PASS。
- Production build：Vite `2743 modules` PASS；只有既有 main chunk >500kB warning。
- Browser Battle：Mirage / Dust II / Inferno `3/3` PASS；每圖有開火、命中、impact、death，desktop 與 390px viewport 均通過 C5A.1 reaction／drift／audio checks。Owner preview：`http://127.0.0.1:5470/ESMO-/artifacts/cs-c5a/gunfeel-final/owner-review.html`。
- P0 180 秒：`1765` samples、StableCanvas shift `0`、stale fIdx mismatch `0`、duplicate RAF/render `0`、rapid camera recovery `0`、browser errors `0`；canvas `410×484`（430px emulation）。
- Production preview：Home → Practice → Mirage → Battle smoke PASS，geometry samples `281`、shift `0`、browser errors `0`。Production bundle 的 DEV-only scene diagnostics 不對外暴露，因此量化 C5A.1 telemetry 以 dev Battle evidence 驗證，沒有把 production debug state 當成產品資料。

### Owner Review

`http://127.0.0.1:5470/ESMO-/artifacts/cs-c5a/gunfeel-final/owner-review.html`

頁面全中文，包含三張地圖 Battle 圖、reaction before／after、hit drift、五類 FX／audio profile 與保護契約說明；Owner 需依實際體感決定是否接受。

## C5A.2 Combat Audit（2026-08-27）

- 狀態：`C5A2_COMBAT_BEHAVIOUR_READY_FOR_OWNER_ACCEPTANCE`。本輪未 merge、未 push、未 deploy，未開始 C5B；此狀態不等同 Owner Acceptance。
- Reaction root cause：原本 2,000ms decision snapshot、一次一對 pair 配對與首次隨機 fire gate 疊加，造成 visible target 排隊。修法是將 simulator step 收斂到 500ms、以反應模型的 stat／distance／weapon family 決定 first permission，ready pair 優先，並以 sub-frame fire window 落實 shot timestamp；再加入 per-actor target lock，失去 LoS 或目標死亡才換目標。
- Cadence root cause：後續射擊原本受 snapshot loop 牽制，沒有由 weapon `rof` 主導。修法是每個 attacker→target engagement 使用 `fireClock`，以 `auth.intervalMs = 1000 / rof` 排程 due shots；simulation damage 與畫面 muzzle/tracer 仍由同一 authoritative event 產生。
- Tactical root cause：原有 route/HOLD/EXECUTE/RETAKE/ANCHOR/撤退分支存在，但 pair contention 會讓角色在多個目標間輪換；本輪只補 target lock 與可歸因的每攻擊者 focus-fire 配對，不重做 AI。低血量 runtime 仍可進入撤退，三圖均有 hold、reposition／rotate、site response 與 retreat evidence。
- Movement root cause：C5A.1 已隔離 Hit_Chest root／hips／pelvis position tracks；本輪第一版 audit 把 buy phase 的 spawn placement 誤列為 teleport，修正 audit 邊界後，authoritative route → collision → position chain 三圖 `blocked=0`、`teleport=0`、`wall crossing=0`，沒有以 clamp 或 teleport 修假。
- Reaction evidence：Mirage median/p90 `254/736ms`、Dust II `242/310ms`、Inferno `236/242ms`；三圖 sample 均保持 `visible ≤ acquired ≤ permission ≤ first shot`。同一 engagement cadence 觀測：Mirage pistol `125–250ms`、rifle `91–111ms`、shotgun `333ms`；Dust II pistol `125–250ms`、rifle `100–111ms`、SMG `67–83ms`；Inferno pistol `125ms`、rifle `100–111ms`、SMG `62–67ms`、shotgun `333ms`。
- Weapon authority：Pistol 代表 base damage `28–53`／`91–250ms`、range `38`；SMG `26–35`／`63–83ms`、range `42`；Rifle `30–39`／`91–111ms`、range `55`；Sniper `88–115`／`500–1000ms`、range `88`；Shotgun `62–86`／`200–500ms`、range `25`。畫面 family 由同一 `weaponAuthority()` 對應 simulation gun profile，沒有改 damage、fire rate 或 economy。
- Audio root cause：原程序音無法提供可信 attack/body/crack/tail，且 AudioContext suspended 時以 `currentTime` 節流會誤擋後續槍聲。修法是換成 [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library) 的 CC0 實錄檔，保存於 `public/audio/cs/c5a2/`，以既有 audio boundary 做四層 filter/envelope、pitch 與 distance attenuation；節流改用 monotonic wall clock，避免 suspended context 卡住。五檔 hash／來源記錄見 `public/audio/cs/c5a2/SOURCES.md`，未使用 Counter-Strike／Valve 資產。
- Battle audio evidence：三圖 Battle runtime 的 recorded events 合計 Pistol `4`、SMG `1`、Rifle `5`、Sniper `4`、Shotgun `3`；五 profile `5/5` decode、loadErrors `0`。Owner Review 以 Battle 時間軸 seek 到實際 muzzle frame，讓同一 React `fIdx → audio effect → recorded sample` 路徑驗證五類。

### Gates / build / runtime

- Static：Renderer `24/24`、CS-A2 `10/10`、C2A `13/13`、C2B `14/14`、C2C `9/9`、C3 `18/18`、C4A `13/13`、C4B `20/20`、Camera `8/8`、RAF `7/7`、StableCanvas `5/5`、CS23 `28/28`、C5A `11/11`、C5A.1 `15/15`、C5A.2 `21/21` PASS。
- Production build：Vite `2743 modules` PASS。新開的 production preview `5481` smoke PASS，canvas `430×507`、geometry shift `0`、browser errors `0`；舊 `5480` 的一次 shader log 判定為舊 preview process/cache，非新 preview 可重現錯誤。
- Battle：Mirage／Dust II／Inferno desktop `3/3` PASS；390×844 deterministic Battle audit 三圖均 canvas `370×437`，Mirage/Dust II 初跑零錯誤，Inferno 獨立重跑零錯誤；P0 390 smoke PASS。
- P0 180 秒：`1774` samples、StableCanvas shift `0`、stale fIdx mismatch `0`、duplicate RAF/render `0`、rapid camera recovery `0`、browser errors `0`；canvas `410×484`。

### Owner Review

單一中文 URL：`http://127.0.0.1:5470/ESMO-/artifacts/cs-c5a2/owner-review/owner-review.html`

頁面包含三圖 Battle 實際畫面、reaction/cadence、戰術狀態、移動 audit、五類實錄槍聲與來源授權。390px 只代表 browser viewport emulation，尚未取代 Android 真機 GPU/FPS/觸控驗收。
