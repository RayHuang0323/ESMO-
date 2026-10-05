# CS 原創場景使用的 CC0 建築模組

來源為 Kenney 官方套件，不使用 CS 官方地圖、模型、UI、貼圖或音效。下載包內的 `License.txt` 均聲明 CC0，可用於個人、教育與商業用途，不要求署名；此處仍保留來源方便追溯。

| 官方套件 | 下載包版本／建立日期 | ZIP SHA-256 |
| --- | --- | --- |
| [Building Kit](https://kenney.nl/assets/building-kit) | 1.0／2025-03-29 | `2740ef5772fb5fb3d7aab881db22d129f6b68afe711b1a79e6d5e9e19cf3eec6` |
| [Factory Kit](https://kenney.nl/assets/factory-kit) | 3.0／2026-05-01 | `7e31fb2308e90304672bd15cd18fa9d9f02c03731a8cbc57a8e3e1c181dfb0a7` |
| [City Kit Industrial](https://kenney.nl/assets/city-kit-industrial) | 2.0／2026-08-31 | `5b381164e5760f3830a2dbee43b972deee38b2a695d091b56e238ab2910c96d2` |

授權：[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。不使用來源套件的 Kenney 商標或預覽圖作遊戲素材。

## 實際轉換流程

`tools/pack_cs_architecture_kit.mjs` 只在開發時讀取官方 OBJ 與 palette，合併靜態 geometry、去除重複頂點、將 palette 烘成頂點色，再將位置／法線／UV 量化為 compact geometry。stdout 由 owner 使用 `apply_patch` 保存為 `fpsAuthoredKitData.js`；遊戲不呼叫生成 API，也不在執行時向外站請求素材。

來源 OBJ 與 palette 的逐檔 SHA-256、原始 bounds、頂點數、三角數與 CC0 識別保存在資料中。呈現工廠按 bounds 正規化尺度；共用解碼後的 geometry，再與同材質靜態物件合批。原始 ZIP／解壓目錄只留在 review 暫存，不納入 commit。

實際使用：拱窗／方窗／門框、牆內控制設備與場外工業建築。門洞由 `majorRoomWalls` 的相同資料決定，不以模型替換碰撞或另算導航。窗是閉合玻璃，不宣稱可穿透射擊。來源的動態零件在本輪作靜態建築裝置，沒有宣稱已有機械動畫。
