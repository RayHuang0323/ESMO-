# Owner4G 手槍音效來源

以下是 ESMO 遊戲內使用的離線音色設計，不是 Valve／CS2 原始音效，也不宣稱每個檔案都是同名槍枝實錄。runtime 每次射擊仍使用一個已解碼 buffer／聲源，不疊加即時合成槍聲。

## 素材與授權

- **Sonniss GDC2023／Pole Position Production**：`Glock 17 - FIRING - Take 1 - 20m In Front - AB - MKH8020.wav`。用於 Glock 與 Tec-9 設計。
- **Sonniss GDC2015／Coll Anderson - Guns**：`EFX EXT .50 Cal Pistol Shots 02 A.wav`、`EFX INT AR-15 M4 Charging Handle With Mag 01_A.wav`、`EFX INT Unloading Magazine Singles 01.wav`。用於重型手槍、金屬機械層、空彈與換彈；不宣稱 AR-15 機構錄音是某把手槍的原槍機構。
- **The Free Firearm Sound Library／Ben Jaszczak、Brian Nelson、Kevin Heras、Matthew Nanney／CC0**：Walther PPQ `X_39P.wav` 用於 P250 設計；Ruger Mark III `R_35P.wav` 經兩段低通及短尾音處理，用於 USP-S 消音設計，並非 USP-S 原槍錄音。

GDC 素材依下載當日的 **Sonniss GDC Bundle License v2.0（2026-08-27）** 使用：可修改並同步於商業遊戲專案，不能作為獨立音效／素材包再分發，亦不得用於 AI／ML 訓練。含 GDC 機械層的成品不是整份 CC0。原始下載只留在未追蹤的研究目錄，不隨遊戲發行。

官方來源與授權：

- https://sonniss.com/gameaudiogdc/
- https://sonniss.com/gdc-bundle-license/
- 2023 官方曲目表：https://docs.google.com/spreadsheets/d/1HAJdNA-QIug2IZjUV-DwCo1IZ-XJ4Vv9gWIaumNScfc/edit
- 2015 官方曲目表：https://cdn.sonniss.com/storage/2025/05/Tracklist-GDC-GameAudio-Giveaway-Sheet1-1.pdf
- 2015 官方頁所列 mirror：https://ftpmirror.your.org/pub/misc/sonniss/sonniss.zip
- CC0 音庫：https://opengameart.org/content/the-free-firearm-sound-library

取得紀錄：2023 Glock 由公開 GDC mirror 取得，檔名與官方2023曲目表逐字一致；2015 三份檔案從官方列出的 ZIP mirror 以 HTTP Range 擷取，檢查 ZIP CRC／大小並保存 SHA-256。完整 URI、SHA、原檔片段與濾波／包絡參數見 `review/cs-major-upgrade/assets-source/owner4g-audio/sonniss-2015-acquisition-r2.json`、`prepared-pistols-r1.json`。製作程式：`review/cs-major-upgrade/tools/prepare_owner4g_pistols.py`。

## 成品

`glock-designed.wav`、`usp-designed.wav`、`p250-designed.wav`、`deagle-designed.wav`、`tec9-designed.wav` 是五份不同的裁切／音色設計；`handling-empty.wav`、`handling-reload-start.wav`、`handling-reload-complete.wav` 為真實金屬機構片段。全部為 44.1kHz／16-bit／mono，合計 411,364 bytes。射擊／空彈／換彈依原保存狀態派送，沒有另算彈藥或射速。
