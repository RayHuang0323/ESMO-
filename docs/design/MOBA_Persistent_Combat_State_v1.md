# MOBA Persistent Combat State v1（CombatState.v1）

> 2026-09-30，分支 `feature/moba-persistent-combat-state-v1`（基準 main `75f44c8`，moba-sim.v15 不變）。
> 目標：DoT、領域／牆、護盾、控制、增減益、隱身的**持續狀態**由正式引擎作唯一權威來源，
> 完整進入 LogicEngine → snapshot → Battle UI/VFX → Replay。不建立第二套狀態、不做 presentation-only gameplay。

## 1. 權威來源與資料流

```
gameplay 欄位（p.*Until／因子／來源、p.shield/shieldUntil、heroSkillPending 的領域與 root-dot）
   │  （唯一讀取點）
   ├─ LogicEngine._statusEffectsOf(p)      → snapshot.players[].statusEffects（舊契約，輸出逐位元相同＋新增 dot）
   └─ LogicEngine._combatStateStep()（每 tick 末端）→ this._cs（生命期：開始／到期／結束原因／序號）
                                           → snapshot.combatStates（CombatState.v1）
        ├─ Live：adapter → frame.zones → CombatZones（3D 地面領域）；statusEffects → HUD／HeroStatusFx
        └─ Replay：replayBuffer 每個 snapshot 收 → replay.combatStates（區間表）
                   → replayPresentationSource.seek(t) 還原 statusEffects＋combatStates（與現場同形狀）
```

- gameplay **從不讀** `this._cs`；追蹤器不回寫任何 gameplay 欄位、不耗 rng ⇒ 模擬結果不變（見 §5）。
- 狀態的真值仍是原本的 gameplay 欄位；`_statusEffectsOf` 是 snapshot 與追蹤器**共用**的唯一讀取點，
  不會出現「HUD 顯示一套、追蹤一套」。

## 2. 契約

### snapshot.combatStates（只在 hero skills 開啟時輸出）

```
{ version: "CombatState.v1", t, seq,
  active: [Row], ended: [Row + { endedAt, reason, seq }]  // ended 保留最近 160 筆，依 seq 遞增
}
Row = { id, kind, targetId, side, sourceId, skillId, startedAt, until,
        activeFrom?,   // 領域開始生效時刻（施放延遲後）；生效前＝預警
        value?,        // 護盾量、減傷比、增傷比、加速／強化／冷卻因子
        shape? }       // 領域：{ c:[x,y], r } 圓；{ a:[x,y], b:[x,y], w } 牆／線
```

| 欄位 | 語意 |
|---|---|
| `id` | `${kind}:${targetId}@${startedAt}`（英雄狀態）或 `zone:${zoneId}@${castAt}`（領域） |
| `startedAt` | 英雄狀態：第一個觀察到的 tick（最多晚 0.5 模擬秒）；領域：施放時刻 `castAt`（精確） |
| `until` | 權威到期時刻；刷新／延長 ⇒ 同一筆、`until` 變大 |
| `reason` | `expired`（到期）／`death`（目標死亡）／`broken`（護盾被打穿）／`removed`（其他提前移除，如淨化） |

### kind 一覽

英雄狀態：`shield` `guard` `stun` `knockup` `root` `silence` `taunt` `slow`（紅 Buff）`hero-slow`
`mark` `dot`（新）`ignite` `haste` `hero-haste` `hero-power` `empowered-strike` `hero-cdr`
`control-immune` `stealth`。
領域：`zone-dot`（area-dot）、`zone-wall`（barrier-line）、`zone-dashwall`（dash-wall）。

### replay.combatStates（optional additive，MobaReplay.v1 不升版）

`{ version: "CombatStateReplay.v1", kinds, skills, rows }`，每列
`[kind, target, source, skill, startedAt, until, endedAt|-1, reason|-1, value, activeFrom, shape, vk?, uk?]`：
- `vk`／`uk`：value 與 until 的關鍵影格（護盾被逐步打掉、狀態被刷新時各記一格）。
- 形狀檢查在 `platform/contracts/mobaReplay.js`（`validateMobaReplay`）；舊 Replay 沒有此欄 ⇒ 照舊播放（只有 bf 的減速）。

## 3. 精度

| 項目 | 現場擷取（每 tick） | 快速完成（每 2 tick 擷取） |
|---|---|---|
| 狀態種類 | 與現場逐時刻相同 | 與現場逐時刻相同（結束紀錄依 seq 收，不遺失） |
| 剩餘秒數 | 相同 | 刷新落在兩次擷取之間 ⇒ 最多差 1 秒（實測 1/2199） |
| 護盾剩餘量 | 相同 | 解析度 1 秒（實測 8/179 不同） |
| 開始／最終結束 | 引擎給，永遠精確 | 同左 |

## 4. 支援矩陣（`tools/check_moba_combat_state_matrix.mjs`）

受控單技能情境（只有受測技能可放、目標站定）：400 技能中 273 個宣告持續欄位，
**271/273（99.3%）** 的每個宣告欄位都產生對應 CombatState，且時長與規則吻合（Lv1，±5%＋一 tick）。

唯一例外（**TD-CS1，wiring bug，未修**）：`split-projectile`（liuxing:Q、miwu:E）宣告 `slowDuration`，
技能詳情也會顯示，但引擎命中處理只對 `projectile` 套減速。修正會改模擬結果 ⇒ 需 moba-sim.v16，待 Owner 決定。

瞬發、沒有持續欄位的 mechanic（dash-strike、cone-strike、delayed-area、piercing-line、target-heal…）不產生持續狀態，屬正確行為。

## 5. 模擬不變性

- 正式設定 12 場整份 snapshot 串流（去掉新增的 `combatStates` 與 `dot`）、legacy 指紋 6 場：與 `75f44c8` 逐位元相同。
- moba-sim.v15 同版號重新登記語意指紋（非語意變更）。

## 6. 仍未做

- 無 channel（引導）類 mechanic——引擎本身沒有，未新增。
- `startedAt` 對英雄狀態是觀察時刻（≤0.5 秒誤差）；要精確需在每個套用點記錄，屬下一步。
- 英雄狀態只有部分帶 `sourceId`（標記、加速、強化、沉默、嘲諷、隱身、DoT、領域）；暈眩／定身／減傷等未帶來源。
