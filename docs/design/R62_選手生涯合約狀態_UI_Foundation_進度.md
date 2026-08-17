# R62 選手生涯／合約／狀態 UI Foundation

## 範圍

本 Sprint 只整理既有 Player 資料的呈現與未來 UI foundation，不新增 lifecycle simulation、season／competition、battle formula、contract transaction 或 salary engine。

## Audit 結果

- 唯一 Player 來源仍是 `profileStore.players`；Roster、Recruit 簽約後與 Player Profile 沿用同一個 `player.id`。
- 既有真實欄位包括 `lv`／`xp`、`potential`、`stats`、`energy`、`condition`、`injuryDays`、`morale`、`status`、`training`、`contract`、`salary` 與 `growthLog`。
- `conditionSummary()` 是體力／傷停／可出賽狀態的唯一路徑；`growthLogOf()` 是成長時間線的唯一路徑；`contract` 目前只提供剩餘天數摘要。
- Player 沒有正式 `careerStage`／退役／薪資交易／心理 lifecycle contract。R62 不從年齡推算階段，也不為正式存檔補假事件。

## 最終資訊架構

完整選手檔案分成「總覽／能力／成長／生涯」四個分頁。頂部共用 Player identity、Level／XP、potential、士氣／狀態與當前遊戲 mode；MOBA／CS 只替換戰力、role、suitability 與 stats。

- 總覽：快速查看當前遊戲戰力、主要定位、潛力、4 項代表能力、狀態、合約摘要與最近成長。
- 能力：MOBA 維持既有能力檢視；CS 顯示完整 16 項 `STAT_DEF` 與既有 derived values。
- 成長：Level／XP／potential 進度與 `growthLog` 實際紀錄，沒有重新推算成長。
- 生涯：年齡／生涯階段 placeholder、既有合約剩餘天數、狀態卡與只由 growthLog 組成的時間線。

## Fixture 與驗證

`tools/check_r62_player_ui_fixture.mjs` 使用 memory-only deterministic fixtures 覆蓋一般選手、潛力新秀、巔峰、老將、合約即將到期、疲勞／傷停、MOBA／CS、16 項能力、有／無 growthLog。Fixture 不呼叫 Store、不寫 localStorage、不改 production save。

瀏覽器模擬 CSS viewport 320／360／390／430／1280px；Profile、Roster 與 Recruit 均未見水平溢出。這不是實機 touch、safe-area、FPS 或動畫體感測試，仍需人工驗收。

## 明確留給後續系統 Sprint

age progression、aging／peak／decline、injury transaction、retirement、salary、renewal、market value、transfer、free agent、morale／satisfaction／playtime／team chemistry，以及加入／轉隊／續約／傷病／退役的正式 timeline event contract。
