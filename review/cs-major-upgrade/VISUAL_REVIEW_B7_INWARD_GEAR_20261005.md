# B7 正向狙擊／相向握姿／護具完整 Fresh-Eyes 審查

UTC 2026-10-05；對應 source `52286a4d5fa76efb694632efd4eb1ede7c47f8e88acefc92e619ebb8e982df1a`。獨立唯讀 reviewer `/root/b7_inward_gear_fresh_review`，`fork_turns=none`；只提供全圖清單、圖片、metrics／pixel JSON、原 scorecard 與三張校準圖，不提供 source、handoff、實作歷史或先前評分。以下為 Owner 保存的審查摘要；不挪作後續版本評分。

## 覆蓋與前提

- 實際逐張查看 **74/74**，另看三張校準圖；完整輸入清單為 `evidence/b7-inward-grip-sniper-gear-complete-review-inputs-20261005.json`。
- A：`phase-b7-inward-grip-sniper-gear-desktop-mirage-20261005/1366`，22圖。supervisor逾時，無最終metrics／crop，全部像素及性能 `NOT_MEASURED`。
- B：`phase-b7-inward-grip-sniper-gear-desktop-mirage-retry-20261005/1366`，26圖，55/55 browser PASS／原生exit0，26/26像素MEASURED／exit0。
- C：`phase-b7-inward-grip-sniper-gear-mobile-mirage-20261005/390`，26圖，55/55 browser PASS／原生exit0，26/26像素MEASURED／exit0。是桌機GPU的窄viewport，不是真手機。
- 每批7張主圖：active、detail、handling-crouch、handling-pov-reload、handling-reload、overview、pov；每批5張weapon-gallery與2張weapon-reload-gallery（pistol、sniper）。A人物8張（T三身份、CT assault各正反）；B／C各12張（兩隊assault／support／marksman各正反）。22+26+26=74，沒有挑選最佳子集。

## 原十類獨立評分

| 類別 | 分數 | 審查圖證據與判斷 |
|---|---:|---|
| Art direction | 2 | active／overview：石造水務、青灰屋頂、水塔、管線與隊伍衣色有共同主題。 |
| Hero/player | 1 | crouch／ct1-assault-front：肩臂、衣身仍平滑人偶感。 |
| Obstacles/enemies | 1 | t2-support-front／t3-marksman-front：三身份正面高度共用，差異集中背具。 |
| Rewards/interactables | 1 | pov可辨C4提示，但未提供兩種完整互動物件前後狀態。 |
| World/environment | 2 | active／overview／sniper-reload已有巷道、拱架、塔與設備層次；石牆、平窗、箱形仍顯眼。 |
| Materials/textures | 2 | detail／pistol：石材、地面、木箱、金屬槍身有差異；袖、包、手套仍是最弱表面。 |
| Lighting/render | 2 | sniper／overview：日光、陰影與前後景可讀；黑槍暗面較黏。 |
| VFX/motion | 1 | detail／pov／reload：有槍線、提示與姿勢，圖片無法證明動作銜接。 |
| UI/HUD | 1 | mobile pistol：回合卡覆蓋通訊第一行；mobile pov-reload重新置中按鈕遮手／槍。 |
| Performance evidence | 2 | renderer、frame times、像素及成本有記錄；實測低FPS，不支持流暢完成或3分。 |

平均 **1.50/3**；沒有任何類別足以給3。與校準scene-2比，場景已有層次，人物與袖仍偏scene-1到scene-2之間。未提供舊版圖，before=NOT_PROVIDED。

Automatic failures：近景角色外觀primitive-dominant；mobile回合卡遮通訊文字。不以此推定mesh拓撲。世界已有塔／設備，不另判純空地。真輸入、動畫連續、真機safe-area仍未實測。

專項：槍械外形 **2**；左右握持 **1**；手套 **1**；袖 **1**；三身份剪影 **1**。五槍族可辨，手槍雙手集握、長槍左手前托已有區別，但主握指節是零散綠色突起、第三人稱手槍有分叉讀感；不能由圖斷定骨架或穿模原因。T腕口有尖刺黑邊；三職業只有背包形狀較易辨，mobile正面槍口常超出畫框。

## 實測數字與限制

| 項目 | B desktop | C 390 viewport |
|---|---:|---:|
| FPS | 10.718 | 11.590 |
| p50／p95／p99／max ms | 67.4／261.2／378.3／402.9 | 66.7／244.6／331.1／438.6 |
| calls p95／triangles p95 | 442／218142 | 450／213828 |
| geometry／texture／materials／meshes | 348／36／985／1253 | 348／36／985／1253 |
| texture estimate／heap MB | 63.71／156.82 | 59.71／183.05 |
| active entropy／dominant／edge／contrast | 3.717774／.194805／.030772／89 | 3.739434／.187955／.033787／94 |
| detail entropy／dominant／edge／contrast | 3.887149／.183674／.067312／102 | 3.238960／.357054／.025602／86 |

同一AMD Radeon／ANGLE D3D11；量測10秒交戰，不是每張gallery的性能。calls advisory 300／150皆超出，不能當正式PASS門檻。coldReady 21212／19062ms含模擬及資產，不是純載圖。自製fallback像素不是官方inspector；地面可拉高edge，不能替手套與衣服評分。B 7/26、C18/26圖edge<.04，皆保留低值。

下一輪優先：修真腕口材質邊界與可讀布料／接縫；改善手套連續指節與自然接觸；身份差異移到胸肩與腰側；手機完整槍線framing及HUD遮字；隔離CPU／GPU後處理性能，不能削掉識別細節只求數字。

## Owner 後續環境診斷（不改獨立分數）

封存B5在同環境也只有15.342FPS／p95 207.9ms，`phase-b7-perf-isolation-b5-20261005/1366`原生exit0。唯讀行程診斷發現另一工作區的`tools/browser_check_moba_combat_feedback.mjs`：Chrome root177884、GPU167768，profile `esmo-cdp-R9G0s3`，CPU佔用高；非本CS worktree。這是低FPS受外部並行驗證干擾的證據與推論，不足以排除新版額外成本。不停止／修改該MOBA行程；性能需乾淨隔離重測，低值原證據不覆蓋、不改判流暢。
