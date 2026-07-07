# 更新日誌 — Sprint 08：Hero Progress System

## 誠實前提
閱讀清單中的 `BattleResult`/`Hero Progress`/`recordMatch`/`heroes.js`/`Codex`/`HeroStats` 不存在於主幹（Sprint02/03 產物未回同步）。本 Sprint 依「BattleResult 為唯一來源」原則將其正式化重建。`recordMatch` 屬 Legacy（EsportsGame.jsx），未觸碰。

## 修改檔案（完整路徑）
- `src/battle/battleResult.js`（新）：`snapshotToBattleResult()` 純函數——BattleResult 正式契約，Hero Progress 唯一來源
- `src/hero/heroProgress.js`（新）：唯一正式模型（XP/等級/屬性/Mastery/`applyMatchResult`/`buildLoadout`，全純函數）
- `src/hero/heroProgressStore.js`（新）：唯一儲存（zustand + localStorage，Node 退化記憶體；防同場重複入帳）
- `src/data/roster.js`（新）：隊伍/選手/英雄名單（遊戲內容資料；heroId 預留對接 CHAMPIONS_100）
- `src/LogicEngine.js`：`constructor(seed, loadout=null)`——**預設 null 逐幀等價**（Battle Balance 零改變 ✅）；帶 loadout 按等級縮放 tough/power；snapshot 附加 `lv`
- `src/useLocalServer.js`：建引擎時 `getLoadout()`（下場沿用；start/stop/tick 節奏不變）
- `src/battle/useBattleFeed.js`：終局偵測 → `recordBattleResult(snap)`（一場一次）
- `src/battle/ui/BattleEndScreen.jsx`：本場成長面板（+XP/⬆升級/生存·輸出提升%/Mastery），列點擊開 Hero Page
- `src/battle/ui/HeroDetailPanel.jsx`（新）：Hero Page——等級/XP 進度/四屬性/引擎映射/Mastery 全欄
- `src/MobaView3D.jsx`：Overlay `Lv—` 佔位 → 真等級 `Lv${snapshot.lv}`
- `src/GameView.jsx` + `BattlePresentationLayer/BattleTimeline`：全 UI 接 roster 真名（不再 B1/B2）

## Hero Progress 架構圖
```
LogicEngine(seed, loadout) → 終局 snapshot
        ↑                          ↓ snapshotToBattleResult（唯一來源）
  buildLoadout                BattleResult
        ↑                          ↓ applyMatchResult（唯一模型）
  heroProgressStore ←── progress + detail ──→ 持久化 localStorage
        ↓                                        ↓
  下場沿用（useLocalServer）          EndScreen 成長面板 / HeroDetailPanel / Overlay Lv
```

## Hero Formula
EXP/場 = 90 + K×8 + A×4 + 參與率×60 + 勝80 + MVP60（cap 400）｜need(L)=round(120×1.18^(L-1))，cap L20｜每級：HP+2.0% ATK+1.6% Armor+1.2% AS+1.0%｜引擎映射：tough=hp×armor、power=atk×as（L20：tough×1.695、power×1.552）

## Node 驗證
公式（單調/封頂/守恆/純函數）✅｜無 loadout 逐幀等價 5 seed ✅｜20 seed 回歸逐字一致 ✅｜對稱 L10/L20 節奏 10/10 落 15–25 分 ✅｜L15vsL1 藍 10/10 勝（等級真實生效）✅｜全閉環（打→入帳→升級→下場帶新屬性→snapshot.lv 反映）✅｜10 場成長分化（勝方 L11 vs 敗方 L9）✅｜保存/還原一致 ✅｜單向流動 ✅

## 本機驗證
`npm run dev` 打完一場 → EndScreen 出現成長面板（+XP/升級/能力%）→ 點列開 Hero Page → 重整頁面（localStorage 持久）→ 再開一場，Overlay Lv 應已上升。`resetProgress()` 可清檔。

## 技術債
對手（赤焰軍團）與我方共用同一 progress 池（AI 隊伍也成長，暫為對稱設計；獨立 AI 成長曲線待定）｜heroId 尚未對接 CHAMPIONS_100（結構已預留）｜L20 對稱局均殺 55 略高於 L1 的 53（幅度可接受，未調）｜Mana 仍無｜localStorage 無版本遷移機制（KEY 已帶 v1）。

## Sprint 09 建議
**賽季/聯賽閉環**：Hero Progress 已能跨場累積，下一步把 BattleResult 接進積分榜與賽程（Platform 層），形成「打→成長→排名→下一輪」的經營模擬完整循環——這是「比照專業經營模擬遊戲」的骨幹一步。
