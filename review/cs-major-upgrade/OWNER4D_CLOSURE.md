# Owner4D：五項 Gameplay Authenticity 修正

狀態：新版驗證完成，5183已更新，停 Owner Review。基線 `4f168947`；不改 MOBA、不 commit／push／正式部署。

## 修正

- 三圖牆面：場景建立時裁切共面重疊，由一個渲染面擁有同一區域，保留覆蓋聯集、UV、normal、color、原碰撞與導航。不是每幀調深度。CPU 全垂直競爭 Mirage 1709→0、Dust2 3828→0、Inferno 3004→0。
- C4：掉包指定可達存活 T 回收，接手死亡／不可達才重選；依剩餘路程與安包預留時間提前 execute。安包使用真 3 秒進度、持包蹲姿、Major HUD 進度、開始事件聲與既有完成／倒數聲；實體 C4 放在真安包者位置並取真地坪。音效需由使用者點選開啟。
- 受擊與死亡：原 Hit_Chest 改上半身遮罩，腿步不中斷。最後活幀持續插值至死亡位置，按真 `kill.roundSec` 開始 Death01，保留跨幀與低幀連續播放及接地，不改保存幀或戰果。
- 選位與戰術：以實際遮蔽威脅方向的牆判定掩體，避免與隊友預約端點重疊；空地不因 HOLD 自動蹲下。回收／找掩體不因遠方 contact 永久停住，既有反應、射速、彈藥、交叉、trade、save、fake 與 TTL 情報守門保留。
- 導航另找到 Major memo 公分四捨五入讓相近目標共用舊端點；改精確座標 key 與有界 cache，Legacy 舊路徑保留。原 .001 門檻未放寬。

## 驗證與證據

完整 stdout／stderr／實際 native exit：`evidence/authenticity-closure-20261012/owner4d-*20261015.*`。各 runner 子項完整 log／state 已另存 `evidence/owner4d-review-20261015/*-child-logs/`，不只保存尾端計數。

- 最新完整戰術 34/34、Owner4D 13/13，exit 0；同 seed 完整保存幀 SHA 相等，三圖無穿牆／瞬移／非有限位置。
- lifecycle 19/19、pose 26/26、handling 21/21、audio 26/26、utility rules 37/37、最新 contact 12/12 與接地 34/34 已通過；新版 GPU／交付結果見下節收件。
- 新 AMD Radeon GPU 三圖 C4／死亡 34/34、exit 0：原生 UI 操作、1x 播放、安包 HUD／持包／蹲姿、真 AudioBufferSourceNode 開始／完成／tick、真 carrier 位置／地坪、死亡前不提前倒地與根節點無跳位。Chrome cleanup/profileRemoved 確認。證據 `objective-death-hud/`。

## 原失敗與工具校正

原始錯誤均保留，沒有改 seed／baseline 或刪 gate。詳細對照見 `OWNER4D_SCOPE.md`。

- 原 checkpoint 的 lifecycle12/19、pose17/26、audio fixture 紅燈已另存；修正隱藏 rig／缺 terrain sampler、bind AABB／真可見變形頂點、GLB 真 clip.duration、步頻時鐘及 quaternion 正規化 oracle，原數值門檻保持。
- tactical 原先以顯示用三位小數 routePoints 重算，改讀真 route；進一步找到產品 memo alias，修產品後才 34/34。
- 首輪新 GPU 28/34 PRODUCT_FAIL：三圖 Major HUD 未接安包進度（產品問題，已修）；另三項 plantRecord oracle 誤用零基 round，改依 audit 真一基 round，位置仍要求 1e-6。重建後 34/34，不將首輪當 PASS。
- 超過 Node 單字串上限的完整 fixture 改用逐 frame 串流分析；原讀取失敗保留，不冒充 gameplay regression。

## 驗收限制

GPU 只證明已取樣地圖／視角／時間，不能保證所有角度永無閃爍。專業 CS 的整體節奏與戰術體感留 Owner Review；不是把每回合寫成必然安包或獲勝。手機真機 FPS、觸控與視覺未實測。cloudflared 不在 PATH，未安裝，沒有手機 HTTPS 網址。原間歇空白回報仍保留。

格式檢查補記：預設 `git diff --check` 將兩檔 Windows CRLF 列為 trailing whitespace（exit 1）；`git -c core.whitespace=cr-at-eol diff --check` 為 exit 0，仍檢查真正行尾空白。未改受測產品 bytes，未降低 gameplay gate；完整兩份 log 與分類存 `git-format-check.json`。最新官方週額度 2026-10-15T12:19:23Z 剩84%，不觸發5%停工；本輪工程完成，僅保留5183 PID68400供Owner Review。


## 2026-10-15 Owner4D 五項追加收件：新版 5183，停 Owner Review

桌機驗收：http://localhost:5183/ESMO-/ 。正式無 probe `owner4d-pristine-20261015`；source `fbc1591be020d0f95521dcba02b09cbb1227fed4fb10be0b50a602808378c399`（112份），bundle `584b93f36c2459e6dcfd1958ba4122ee2707132368062edb9c777da790fd0a30`；HTML及全部10個JS HTTP200且逐byte吻合，Preview PID68400。本輪三圖牆面共面處理、掉包責任／回收與安包時間壓力、真安包HUD／姿勢／音源、受擊死亡時鐘及方向掩體已送新版。

CPU：完整戰術34/34、Owner4D13/13、最新反應12/12與接地34/34；lifecycle19/19、pose26/26、handling21/21、audio26/26、utility37/37。新GPU三圖C4／死亡34/34、三圖時序各15/15、Mirage三房間10/10、effects25/25、HE像素7/7；正式Dashboard→CS→Battle→Result桌機與390px各26/26，native皆0，Chrome cleanup確認。原始失敗完整保留：Major HUD缺進度已修；合併時序420樣本超16MiB為HARNESS_FAIL，逐圖同標準重驗才PASS。

證據總索引：`review/cs-major-upgrade/evidence/owner4d-review-20261015/engineering-complete.json`；驗收／原失敗／工具校正：`review/cs-major-upgrade/OWNER4D_CLOSURE.md`與`OWNER4D_SCOPE.md`。三圖CPU垂直共面競爭皆0，已檢視新移動像素及Mirage36張近房間裁圖未見共面雜色；仍只代表取樣視角／時間，不宣稱全角度永無閃爍。專業CS整體體感、原間歇空白回報與手機真機FPS／觸控／視覺保留Owner驗收；非新60秒FPS基準。音效須點選開啟。cloudflared未找到，未安裝，沒有手機HTTPS網址。

■ 修正｜■ 必要CPU與新GPU｜■ 正式Preview／文件｜▣ Owner Review。工程剩餘0分鐘，Owner驗收時間由Owner安排。未commit／push／deploy、不動MOBA、不開始下一Sprint。
