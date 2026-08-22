# CS 出賽陣容與角色語意

## 核心規則

CS 出賽陣容由 `CS_SEATS` 的五個中性席位組成：`slot 1` 至 `slot 5`。
席位只表示出賽順序，不代表路線或 FPS role。

每名選手的 FPS role 是選手自身資料的一部分，優先讀 `player.csRole`；舊存檔沒有
該欄位時，使用既有 `playerModel` 的 FPS 適性作相容推導。CS lineup 不讀
`player.role` 的 MOBA lane，也不以陣列 index 推導 role。

可重複 FPS role。五名 Entry、沒有 AWP、沒有 Lurker 都可以出賽；陣容分析只能提供
「缺乏主要狙擊手」「無明確 IGL」等 advisory，不得成為 hard validation。

## 正式資料流

```text
profileStore.players + csLineup
        ↓
toFpsRoster（保留真實 playerId，產生 FPS role 與 derived stats）
        ↓
EsportsFPS3D effectiveRoster
        ├─ simulateFps(..., effectiveRoster)
        └─ FpsScene3D(roster={effectiveRoster})
```

simulation frame 的 `player.id` 與 renderer entity 的 `id` 必須來自同一份
`effectiveRoster`。死亡由 frame 的 `dead` state 控制身體隱藏；找不到 identity 時是
renderer contract 錯誤，不得當成死亡。

## CS-A 根因與修正

原本 `simulateFps` 使用 wrapper 內的 `effectiveRoster`，但 `FpsScene3D` 從
module-level mutable `ACTIVE_ROSTER` 建立 player pool，且重建 effect 只有 `[mapKey]`
依賴。換 roster、重賽或 effect 時序改變時，frame player ID 可能找不到舊 pool 的
entity，`P.g.visible = false` 便會把缺 ID 的整個 entity 隱藏；另一隊仍存在是因為
該側的 ID 恰好仍與舊 pool 相同。

CS-A 移除 `ACTIVE_ROSTER`，讓 renderer 直接接收與 simulation 相同的 roster，並在
map 或 roster 改變時重建 pool。`fpsIdentity.js` 與
`tools/check_cs_a_fps_correctness.mjs` 覆蓋正常、替補、restart/rematch、換圖及死亡
identity safety。

## UI 語意

出戰卡左側顯示中性 `SLOT N`；選手卡上的 `ENTRY／突破手`、`RIFLER／步槍手` 等
文字來自該選手的 FPS role。CS lineup 不顯示上路、打野、中路、射手、輔助等 MOBA
席位語意，也不再因 role 與 slot 不同而產生阻擋或錯誤 warning。
