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

### Sprint 20：PostMatch / Result / Season Recovery

目標：

BattleResult  
→ Result 畫面  
→ HeroProgress  
→ SeasonStore  
→ Dashboard / History

重點：

- 移除或隔離 genMatch 假資料。
- Result 只吃 BattleResult。
- 賽後成長、MVP、KDA、戰績都走唯一資料流。
- Legacy PostMatch UI Recovery。

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
