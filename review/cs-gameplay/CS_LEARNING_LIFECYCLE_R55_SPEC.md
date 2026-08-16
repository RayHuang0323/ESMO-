# CS Learning Lifecycle R55 Spec

日期：2026-08-16
範圍：CS match completion 後的 Learning 跨場 lifecycle consumer

## 目標

讓既有 `training` / `meta` / `talent` / `growthLog` / `profileStore` 資料鏈，安全吸收 CS match performance 的 XP；Learning 只影響跨場經驗吸收，不進單場 combat。

## 最小 production hook

`CsMatchResult.v1` → `csResultToTransaction()` → `settleMatchThroughSession()` → `applyMatchProgress()` → `players[].xp` / `growthLog` → `profileStore.save()`。

不修改 `CsMatchResult.v1`、`simulateFps()`、`combatSkill`、Replay、single-match RNG、其他 15 項 stat balance 或 season/event。

## Formula

`cs-learning-lifecycle.v1`：

```text
value = clamp(learning, 0, 100)
multiplier = 1 + (value - 50) * 0.002
xpGained = round(baseXp * multiplier)
```

Learning 50 為 neutral baseline；每 +10 Learning 為 XP multiplier +2 percentage points；乘數範圍為 `0.900–1.100`。legacy player 缺少 Learning 時 fallback 50。

## Safety gates

- low / baseline / high Learning 同條件下 growth direction 單調。
- 固定 `recordedAt` 可重現 transaction 與 result digest。
- save/load 後 XP 與 match `growthLog` 保留。
- 同一 `transactionId` 重送只回 `alreadyApplied`，不重複 XP、growthLog 或 reward。
- match result digest 不因 lifecycle wiring 改變。
- simulator source 沒有 Learning read；formula helper 沒有 RNG。
