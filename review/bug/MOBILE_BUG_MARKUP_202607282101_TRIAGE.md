# 手機版問題標記（202607282101ChatGPT Image.png）排查結果

畫面來源：`yhuang0323.github.io`（GitHub Pages 正式站，即 `origin/main`，目前是 H.1
`15b5abb`，**不含**尚未 push 的 H.2 本機 commit）。地圖模式按鈕顯示「地圖 新版」
（`src/GameView.jsx` `isRuntimeV2(mapMode) === true`），確認畫面走的是
Runtime-v2 渲染管線：`MobaRuntimeHeroes.jsx` / `MobaRuntimeStructures.jsx` /
`mobaRuntimeMapAdapter.js`。

## 問題 1：黃色圈圈孤立無怪——**已修**

**根因**：座標系統不一致，跟塔位曾經踩過的病灶（H.1/H.2）是同一種問題，
但這次發生在 Buff 野怪身上。

- `mapCampLayout.js`（Milestone G.4）把兩個 Buff 營地的**呈現座標**位移了 17.1
  單位——原始模擬座標離中路只有 5.9/5.5，畫面上會變成「怪站在路上」，所以只在
  呈現層把它們推開（`gameData.js` 與模擬常數完全沒動）。
- 但 `mobaRuntimeMapAdapter.js` 的 `adaptObjectives()` 原本直接拿 `snapshot.objectives[].pos`
  （**模擬座標**）當畫面位置，於是「存活狀態環」（`MobaRuntimeStructures.jsx` 的
  `objRing`）畫在模擬座標，地圖的野怪剪影卻畫在位移後的呈現座標
  ⇒ 兩者相差 17 個單位，畫面上就是一個孤立的黃圈、旁邊沒有怪。

實測位移量（`node` 直接呼叫 `buildCampPlan`）：

```
camp_blue_buff   disp=(76,171) sim=(74,154) shift=17.12
camp_red_buff    disp=(144,49) sim=(146,66) shift=17.12
camp_blue_a/b, camp_red_a/b                shift=0.00   ← 沒位移，本來就沒問題
```

**修法**（`src/battle/moba/map/mobaRuntimeMapAdapter.js`）：`adaptObjectives()`
新增 `campDisplayPos(id)`（快取一次的 `buildCampPlan` 查表），野區營地一律改用
呈現座標；沒有位移的營地與 dragon/baron 不受影響（原本就相同或不經過這條路徑）。

驗證：
```
dragon           position= { x: 160, y: 157.8 }   ← 不變
baron            position= { x: 60, y: 62.2 }     ← 不變
camp_blue_buff   position= { x: 76, y: 171 }       ← 改用呈現座標（原 74,154）
camp_red_buff    position= { x: 144, y: 49 }       ← 改用呈現座標（原 146,66）
camp_blue_a      position= { x: 48, y: 142 }       ← 無位移，不變
```

## 問題 2：英雄仍會穿越野區障礙/石頭/牆體——**已修，尚未部署**

這正是 Milestone H.2 要解決的問題：H.1 的碰撞用 `gameData.WALLS`（28 個手寫圓），
跟畫面上的真實地圖幾何對不上，所以英雄會穿基地牆、穿岩壁、穿塔、穿主堡、穿坑壁。

H.2 已把碰撞改成以地圖幾何為唯一真實來源（`src/battle/moba/nav/mobaNavigation.js`），
本機驗證：`check_moba_nav_h2` 14/0、`check:mobamap` 3553/0、`regress` 15/15、
`regress2` 8/8、`build` ✅、240 seeds 公平性優於 H.1（順序偏差 2.1pp vs 3.8pp）。

**目前狀態**：三個本機 commit（`d9c93c4` `1950b00` `5401098`），**未 push、未部署**，
且**尚未經過真實 Chrome 戰鬥畫面驗收**（詳見
`review/moba-runtime/h2/H2_COLLISION_NAV_REPORT.md`）。這張截圖反映的是 H.2
之前的舊行為，不是新的回歸。要讓正式站上的英雄不再穿牆，需要先完成 H.2 剩下的
Chrome 驗收，再由使用者決定何時 push/部署。

## 問題 3：畫面偶發閃爍/破圖感——**已修**

**根因**：`MobaRuntimeHeroes.jsx` 與 `MobaRuntimeStructures.jsx` 的所有 mesh
每幀都用 `ref` 直接改 `position`/`scale`/`visible`/`material`（不走 React
re-render），卻沒有關閉 Three.js 的 frustum culling。這正是本專案自己在
`docs/09_技術債務清單.md` 記過的教訓：「玩家 mesh 一律 `frustumCulled=false`，
否則會閃爍/消失」。地圖的靜態量體（`MobaMapBlockout.jsx`）已經照做（3 處），
但 H.1 新增的 Runtime 英雄/結構渲染漏了套用這條規則。

Three 的 frustum culling 用「建立當下」算出的 boundingSphere 判斷該不該畫；
運鏡（RTS 大範圍平移/縮放，畫面上的「戰術：全圖游走」）常讓角色貼近視錐邊界，
在這種情境下很容易誤判剔除，一幀不畫就是閃爍/破圖感。

**修法**：`MobaRuntimeHeroes.jsx`（選取環、陣亡標記、本體、肩塊、血條背板/前景）與
`MobaRuntimeStructures.jsx`（塔身、塔冠、塔環、大型目標環）全部加上
`frustumCulled={false}`。英雄只有 10 個、結構最多 20 個，幾何都很小，關閉 culling
的效能代價可忽略。

## 問題 4：缺小兵/技能特效/英雄專屬 2D/3D——**非 bug，已知限制**

`H1`/`H2` 報告都已列在「已知限制」：英雄仍是 Prototype 膠囊，不是正式模型；沒有
小兵/技能特效的 3D 呈現。這是資產管線（`ESMO-Art-SOP`）與後續 Milestone（H.3+）
的範圍，不是這輪要排的程式 bug，這裡不動。

## 驗證

- `npm run build` ✅
- `npm run check:mobamap` 3553 通過 / 0 失敗
- `node tools/check_moba_runtime_map_h1.mjs` 66 通過 / 0 失敗
- `node tools/regress.mjs` 15/15（確認 adapter/render 層改動沒有動到模擬）
- 未經瀏覽器實測：問題 1、3 的修法是 Node 端邏輯驗證 + 既有 verifier，沒有實際
  在手機/Chrome 上看過修後畫面。

## 尚未處理

- 目前所有改動**未 commit**（等使用者確認方向再決定是否連同或分開 commit）。
- 問題 2（H.2）維持先前結論：需完成 Chrome 戰鬥畫面驗收才算完成，不在本次範圍內處理。
