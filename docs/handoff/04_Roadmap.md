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

### Sprint 21：Management Modules Recovery

目標恢復：

- Recruit
- Finance
- Inbox
- Sponsor
- Training
- Player Detail
- Team
- Roster

原則：

- 先 Component 化 Legacy UI。
- 再接 Adapter。
- 不重畫 UI。

### Sprint 22：CS / FPS Recovery Audit

目標：

確認 `EsportsFPS3D.jsx` 是否仍被主幹使用。

需要確認：

- 是否只是 Presentation。
- 是否已接 BattleResult。
- 是否已接 SeasonStore。
- 是否已接 Player Stats。
- 是否已接 CS 選手 16 項能力。

本 Sprint 前，不主動修改 FPS。

### Sprint 23：Battle Data Extension Proposal

目標：

提出契約擴充，不一定立即實作。

可能項目：

- mana
- CS
- 召喚師技能
- 技能 CD
- buff
- item
- chat / caster event

需要 Ray 核准後才能改 Contract。
