# 更新日誌 — Sprint 06：Battle Presentation Integration

## 修改檔案
- `LogicEngine.js`：儀器化 v2（純附加）——`a`（助攻，擊殺前 8 秒窗）、`dmg`（對英雄輸出）、`heal`（實際回復量）、`hitBy` 追蹤表（復活清空）；feed 附加 `assists`；snapshot players 附加 `a/dmg/heal`。**5 seed 逐幀等價驗證：Battle Balance 零改變、勝者一致。**
- `battle/battleEvents.js`：擊殺事件文字含助攻；`playerRating()`（k*3+a*1.5−d*2+dmg/800+heal/1600+gold/400，暫定公式已文件化）、`participation()`；塔名改 MOBA 慣例（外塔=一塔）。
- `battle/ui/BattleScoreboard.jsx`：TAB 記分板 v2——英雄/玩家、K/D/A、Gold、DMG、HEAL、參與率、Rating、MVP 標記，全真資料。
- `battle/ui/BattleEndScreen.jsx`（新）：Victory/Defeat 進場動畫、MVP 卡、最佳數據（最多擊殺/最高輸出/最高治療/最富有）、Timeline 摘要、`onContinue` 進 Result 掛鉤（不碰 Router）。
- `battle/ui/BattlePresentationLayer.jsx`：按住 TAB 記分板、終局接 BattleEndScreen、透傳 onContinue。
- `battle/ui/BattleHUD.jsx`：MVP 標籤含助攻（K/D/A）。
- `MobaView3D.jsx`：Hero Overlay（玩家名·職業 + K/D/A；死亡→灰字復活倒數，僅字串變化時重繪 texture）；`OrbitControls makeDefault` + 掛入 `BattleCameraController`；`battleFollow`/`roster` props；跟隨時停用環繞。
- `GameView.jsx`：**正式掛入** BattlePresentationLayer（移除舊內聯比分/勝率/結算）；「導播鏡頭/自由鏡頭」切換；roster/onContinue props。

## 驗證（Node，真引擎）
- 儀器化等價：5 seed 逐幀一致、勝者一致 ✅
- 20 seed 回歸：與 Sprint05 指標逐字一致（18.0 分、9:11、ACE 17、Baron 20、逆轉 18）✅
- **單向流動**：掛完整呈現層（tracker+reducer+focus+mvp） vs 純引擎，20 seed 結果完全一致 ✅
- Snapshot 契約：players 含 id/side/role/pos/hp/dead/respawn/state/k/d/a/gold/dmg/heal ✅
- 助攻文字（例：R4 擊殺 B2（助攻 R1,R2,R3,R5））、MVP 參與率 97%、復活倒數資料 ✅
- FPS 隔離：EsportsFPS3D 零引用 MOBA 引擎/store ✅

## 誠實缺口（引擎無此概念，依「不造假」原則未顯示）
- **Lv 等級**：引擎無成長系統 → Sprint07 建議項。
- **Mana**：需求註明「若有」→ 無，跳過。
- **Crit / 逐擊傷害浮字**：引擎為連續 DPS 模型（無離散命中/爆擊），逐擊浮字無真實對應 → 事件型浮動大字（First Blood/連殺/ACE/塔/龍/巴龍/Victory）為正確呈現。
- 所有 `.jsx` 於此環境無法編譯（無 R3F/Vite），需本機 `npm run dev` 驗收。
