# B7 方向性袖裁片完整獨立審查

`directional_cut_fresh_review` 逐張 original 看完整32/32 PNG及3/3 anchors，讀兩組 metrics／pixel-metrics；未讀source、checkpoint、歷史review，未改檔或跑測試。沒有before，不推論改善。

inventory：`evidence/b7-directional-cut-complete-inventory-20261007.json`。來源c708043ab09dac9f083692aeb46ba1ade6ed0d939540dc890cbf57808fb906af／59檔，bundle60ea5a97654b2adc2fdf0e92a7981e85879819b74a48068aa1151ba2db7c29cc。桌機與390各16圖，四視角及六身份真正正背。

| 原十類 | 分數 | 本批可見依據／缺口 |
|---|---:|---|
| Art direction | 2 | 石造水務、青綠金屬及兩隊制服配色一致。 |
| Hero/player | 2 | 人形、持槍、頭盔／耳機、胸包及三種背裝已超anchor1；臉袖裝備仍簡化。 |
| Obstacles/enemies | 1 | 箱桶建物可辨，六身份主體頭形相同，包袋／袖環不足以形成三種強輪廓與預示。 |
| Rewards/interactables | 1 | A/B與C4可讀，紅色塊／標籤／底圈，缺兩種完整authored互動形態及狀態證據。 |
| World/environment | 2 | 拱窗梁架、屋頂罐體門框提供層次；總覽外圍平坦稀疏，不能評3。 |
| Materials/textures | 2 | 石縫地面木紋金屬與衣縫可見，衣袖窗口仍平滑。 |
| Lighting/render | 2 | 日照投影體積可讀；390POV槍火附近過曝，缺節制。 |
| VFX/motion | 2 | 靜圖射擊事件的槍火、彈道與擊殺提示可見；不涵蓋完整時序／持續效能。 |
| UI/HUD | 2 | 比分隊色彈藥HP、播放／返回有層級；桌機字小、部分面板通用。 |
| Performance evidence | 2 | renderer／timing及雙viewport證據齊，calls超advisory、非真手機。 |

18/30，平均1.8；沒有3。未達十類皆≥2、平均≥2.3的Premium門檻。

## 第三人稱袖：1/3，B不放行

CT1／CT2／CT3、T1／T2／T3，在桌機正／背及390正／背全部各1，共24個袖觀察。正面細縫線可見，但肩上臂仍圓滑膨起，前臂均勻漸變，肘壓皺／裁片方向性不足。CT1/T1外側大裝備與CT3/T3袖環不能代替布料層次。CT2/T2縫線與彎曲連接較清楚，大面仍平滑。六背面肩背平滑，包袋遮袖，露出的上臂結構不足；背包波紋不計作袖褶。390原PNG為780×1688，原圖可見細線不等於390 CSS px同辨識度。

## 量測與限制

像素兩組各16 MEASURED，0 NOT_MEASURED／ERROR；自製fallback非官方inspector、非品質PASS。四視角entropy D3.244–3.927、M3.377–4.644；active／overview edge D.02953／.02637、M.03297／.02875均<.04，支持遠景稀疏不能評3。contrast D69–128、M71–210；390POV bright clip6.52%與可見槍火過曝一致。gallery entropy D3.061–4.120／M3.282–4.143，edge D.0371–.0930／M.0240–.0418。

| active量測 | D1366 | M390 |
|---|---:|---:|
| FPS | 39.36 | 42.12 |
| p50／p95／p99 ms | 33／33.5／34 | 16.8／33.5／33.8 |
| callsP95／advisory | 444／300 | 450／150 |
| triP95 | 214496 | 210098 |
| geometry／texture／material／mesh | 348／38／985／1253 | 348／38／985／1253 |
| texture估MB／heapMB | 74.39／109.56 | 70.39／144.37 |

同AMD桌機GPU，非真手機FPS；active renderer不套為每張gallery獨立成績。page／console error0。後續60秒效能另記，不以本批短窗否認其他樣本。

下次先讓肩肘裁片、褶皺與材質差異在正背／窄版可讀，再以完整集合複查。B袖仍未放行，C／D／E未開始。
