# MOBA 召喚師技能系統（Sprint 29B1 — MVP）

> 原則（任務單§七）：**只實作有真實引擎作用點的技能，不只補圖示**。
> 其他位置的第二技能 = 明確的 `reserved` 狀態，不虛構效果。
> 引擎：`src/LogicEngine.js`（`R.summonerSpells`，v3 才啟用）。
> HUD：`src/battle/ui/BattleHeroStrip.jsx` SpellSquare（F/D 兩格）。

## 1. Audit 結論（F/D 欄位原資料來源）

Sprint18 恢復 Legacy TenManPanel 版型時，SpellSquare 只是 14px 佔位方格
（title=「召喚師技能：目前無資料，保留位置（待接）」）——**引擎從未有技能資料**，
手機上看到的「F/D 空框」就是它。

## 2. 技能配置

| 格 | 技能 | 對象 | CD | 效果 |
|---|---|---|---|---|
| F | **Flash 閃現** | 全員 | 210s | 位移 7 單位（真實改變 pos） |
| D | **Smite 懲戒** | 只有打野 | 75s | 對中立目標真實扣 550 HP |
| D | reserved | 其他四路 | — | 明確保留狀態（虛線框「—」），不虛構 |

## 3. 觸發條件（全部真實條件，決定性、可回溯）

**Flash**（同一 tick 只會觸發一種；`triggerReason` 記錄在事件與 `sp.f.lastReason`）：

- `escape` 逃生/躲避致命交戰：撤退中、HP <16%、敵人貼身 <3.5 ⇒ 向泉水閃 7。
  在 **tick 開頭的前置階段**以凍結位置評估（敵人貼身的那一刻就閃；撤退位移會把
  敵人甩出觸發圈，移動後評估永遠不會觸發）。
- `chase` 追擊收頭：CHASE 狀態、目標殘血 <12%、卡在攻擊圈外（3.8–8）⇒ 閃到目標身邊。
- `engage` 切入：正要進團、距熱點 9–13、我方人數不劣 ⇒ 向熱點閃 6。

`chase`/`engage` 在 `_postCombatV3`（全員移動+傷害結算後）評估。三種觸發全部
「凍結位置、先收集後套用」⇒ 與 players 陣列迭代順序無關（P0 防線；初版在循序
移動迴圈內就地施放，實測造成先迭代方 ~17pp 系統性優勢，已修）。

**Smite**：目標（龍/巴龍/營地）HP ≤ 550 且打野在 6.5 內且 CD 就緒 ⇒ 施放（secure 語意）。
兩側打野**同時評估、同時結算**（無迭代順序偏差）；擊殺歸屬 = 對目標累計傷害較多的一方
⇒ **不保證搶到目標**（40 場實測 962 次 Smite，全部來自打野席位）。

## 4. 資料流

```
引擎 p.sp = { f:{id:"flash",readyAt,lastUsedAt,lastReason,uses}, d:{...|reserved} }
engine.spellLog（上限 400）＝事件唯一來源 { id, t, playerId, side, spell, reason, from, to }
  ├→ snapshot.players[].sp（HUD 的 F/D：圖示/ready/cd 秒數/cdMax/上次 reason）
  ├→ snapshot.spellEvents（最近 8 筆）→ BattleEventTracker ⇒ SPELL_USED Timeline 事件
  └→ battleStore.log → finalizeReplay ⇒ Replay events 原封保存（Replay 不重新判定）
```

HUD 呈現：可用 = 亮色框 + 圖示（⚡/🎯）；冷卻中 = 灰化 + 剩餘秒數遮罩；
reserved = 虛線框「—」。tooltip 顯示中文名、冷卻、上次觸發原因。

## 5. 實測（40 場、v3）

- Flash 1135 次；同人間隔全部 ≥ 210s（違規 0）；reason 分布 engage 610 / escape 515 / chase 10。
- Smite 962 次；全部打野；微場景驗證：500 HP 龍被斬殺、killerTeam 正確、進 75s 冷卻。

## 6. 誠實揭露 / 29B2 建議

- chase-flash 觸發率低（追擊窗本來就短）——屬預期，非 bug。
- 其他四路的 D 技能（治癒/屏障/點燃…）需要先有對應的引擎作用點（治療量/護盾/持續傷害），
  留待後續 sprint；**先不上圖示**，避免「有圖無效果」。
- Flash 目前是引擎自動決策（模擬選手操作），無玩家手動施放介面——本遊戲是經營模擬，
  符合定位；若 29B2 手機 HUD 要展示技能使用，讀 `SPELL_USED` 事件即可。
