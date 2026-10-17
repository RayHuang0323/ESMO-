# Owner4G 槍枝音效稽核

狀態：實作完成，正式瀏覽器與 Owner 耳聽驗收進行中。不得把素材不同的雜湊當成槍械辨識度已獲真人認可。

## 真實來源與界線

正式22把槍分五族。原版只有五份族錄音，22組音高／增益／截取簽名；不是22把實槍各有原錄音。新版增加五份離線製作手槍素材與三份機械聲，總411364 bytes。正式槍聲一發仍只建立一個可回收 source，沒有即時合成槍響或新增常態音訊濾鏡。

| 正式槍枝 | 新版使用錄音 | 真實來源界線 |
| --- | --- | --- |
| Glock-18 | Glock17，Sonniss GDC2023 Pole Position | 同系列，不宣稱Glock18原錄音 |
| USP-S | Ruger MarkIII .22，CC0 | 經離線消音設計，不是USP原錄音 |
| P250 | Walther PPQ 9mm，CC0 | 同口徑設計，不是P250原錄音 |
| Desert Eagle | .50 Cal Pistol，Sonniss GDC2015 Coll Anderson | 大口徑手槍錄音；來源檔名未宣稱型號 |
| Tec-9 | Glock17 9mm，Sonniss GDC2023 | 緊湊設計，不是Tec9原錄音 |
| AK、M4、M4A4、Galil、FAMAS、AUG、SG | AK47，CC0 | 沿用各槍獨立簽名，7槍共用族body |
| AWP、Scout | Mosin Nagant，CC0 | 沿用獨立簽名，2槍共用族body |
| MP9、MAC10、UMP、P90 | Carl Gustav M45，CC0 | 沿用獨立簽名，4槍共用族body |
| Nova、XM1014、MAG7、Sawed-off | Benelli Nova，CC0 | 沿用獨立簽名，4槍共用族body |

原始下載、SHA、CRC、截取與處理參數保存在本輪evidence與忽略的assets-source；遊戲素材來源見 `public/audio/cs/owner4g/SOURCES.md`。Sonniss GDC v2.0允許商業互動作品同步使用，禁止獨立音效素材包再散布與AI訓練；本輪沒有訓練、付費或擷取Valve素材。

## 參考與試聽

參考創作者Fraximuz的CS2動畫／聲音比較影片：<https://www.youtube.com/watch?v=HBqcgUUX-yg>，Deagle 0:00、Glock 0:26、USP-S 0:38、P250 1:10。以原生Edge頁面播放與觀察動作時序；不下載／擷取其音軌。模型播放不等於真人完成耳聽盲測。

`owner4g-audio-ab.html` 是Owner Review整合作品頁，使用固定原版模組與當前模組，提供五槍原版／新版、單發／正式間隔四發／空彈／換彈，以及RMS平衡或正式增益。圖示與發聲同步；停止、換槍、離頁即取消排程。素材下載按鈕不提供。試聽結果須由Owner確認，不能以數學唯一性替代聽感。

## 正式狀態同步

正式槍聲由權威muzzle事件的真gun、位置、時間、事件ID驅動；連射頻率由真射擊事件決定，空彈／換彈由保存狀態轉換決定。原有事件去重、pause／seek取消、pool上限與距離衰減保留；Legacy沿用原素材。`loadedProfiles=5`仍指原五族，新增 `loadedWeaponRecordings=5`、`loadedAudioBuffers=10` 說明額外手槍，不偷換舊診斷語意。
