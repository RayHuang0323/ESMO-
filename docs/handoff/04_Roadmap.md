# 04 Roadmap

## 目前階段

ESMO 目前處於：

**Legacy Recovery + 主幹整合階段**

不是新功能擴張階段。

## 近期 Roadmap

### Sprint 19：MOBA 主流程修復 + Draft Presentation 串接

目標：

Dashboard  
→ 5 人賽前配置  
→ 配對  
→ Ban/Pick  
→ 戰術  
→ Loading  
→ Battle  
→ Result

重點：

- 修正首頁 MOBA 入口錯接單一選手詳細頁。
- 5 人配置頁恢復。
- Ban/Pick 選誰，Loading 顯示誰。
- Loading 顯示誰，Battle Hero Strip 顯示誰。
- 戰術選擇顯示到 Loading / Battle HUD。
- HeroCodexDetail 與 HeroDetailPanel 分工。
- 英雄圖片 Audit。

### Sprint 20：Hero Images + PostMatch Result Recovery（已完成）

目標：
- 抽取 Legacy HERO_IMG。
- 接到 Codex / HeroDetail / BanPick / Loading / BattleHeroStrip。
- Result / PostMatch 改讀 BattleResult。
- 隔離 genMatch 假資料。

結果：
- HERO_IMG 100 張全數抽出（heroImages.js 資源表 + heroDatabase.heroImage() 唯一入口）。
- 上述 5 個 UI 加上 BattleEndScreen（MVP 卡 / 成長欄）皆已接圖，缺圖有 fallback。
- genMatch / PostMatchDashboard 主幹本來就沒有；BattleEndScreen 早已只讀 BattleResult。
- 補上真正缺口：draftRoster Adapter → BattleResult.players[].heroId = Ban/Pick 選角，
  Draft / Loading / Battle / Result 英雄一致。引擎與 Balance 未動。

### Sprint 21：Management Modules Recovery（已完成）

目標恢復：Recruit / Finance / Inbox / Sponsor / Training / Player Detail / Team / Roster。

原則：先 Component 化 Legacy UI → 再接 Adapter → 不重畫 UI。

結果：

- 八個模組全數 Component 化，接進 `src/screens/manage/`，Dashboard 不再開假 Modal。
- 補上主幹缺的「選手領域模型」（本 Sprint 的真正缺口）：
  `data/playerModel.js`（16 項能力 × 個性 × 士氣 × 位置適配 × 訓練課程 × 贊助商，
  Legacy 逐字）+ `data/players.js`（身分仍讀 ROSTER）+ `data/recruitPool.js`（決定性新秀池）。
- `profileStore` 擴充（非第二套 Store）：players / activeSponsor / scouted /
  finance 四張表 / 收件匣正規化 + 11 個經營行為，全部向下相容 localStorage。
- 引擎、Balance、BattleResult、HeroProgress、SeasonStore、roster、heroDatabase
  git diff 零改變；20 seed 回歸不變。

仍不一致（見 05_Sprint紀錄 Legacy Diff Checklist）：
轉會市場/我的報價（Negotiation 領域）、逐項潛力（需 Contract 擴充）、
CS 分部名單（Sprint22）、賽後獎金回寫財務。

### Sprint 22：CS / FPS Recovery Audit + Minimal Integration（已完成）

目標：確認 `EsportsFPS3D.jsx` 是否仍被主幹使用，並完成可安全完成的最小接線。

結果：

- Audit：孤立 Legacy Presentation（只被 Legacy EsportsGame.jsx import，主幹不可達）；
  BattleResult / SeasonStore / Player Stats / 16 項能力全部未接。
- 接線：Dashboard CS 磚 → CsMatchScreen；名單接 profileStore 真實選手
  （fpsRoster Adapter，Legacy STAT_L2S 逐字）；引擎 Presentation 原封。
- 刻意未接：CS 結果入史（無 CS BattleResult 契約，不偽造 → Sprint 23 提案）。
- 詳見 05_Sprint紀錄 Sprint 22 節。

### Sprint 23：Battle Data Extension Proposal

目標：

提出契約擴充，不一定立即實作。

可能項目：

- **CS MatchResult → 統一結果流程**（S22 遺留：獎金 / 粉絲 / XP / Match History 回寫）
- mana
- CS
- 召喚師技能
- 技能 CD
- buff
- item
- chat / caster event

需要 Ray 核准後才能改 Contract。
