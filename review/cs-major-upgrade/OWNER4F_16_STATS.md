# Owner4F 五職與16能力接線

## 職業與相容

正式新 Major 戰術類別：Entry／Lurker／Support／AWPer（鍵 awp）／IGL。舊 rifler 保留在選手來源、舊 Replay、舊 Result；新比賽以 Support 執行支援責任，specialtyRole 保留原始來源。這是相容轉接，並不表示步槍能力等於輔助能力，更不會將 Rifler 當成 Lurker。CS 適性列提供五份正式職業權重；原 FPS步槍手保留作武器能力，未刪選手數值。

本身適性與隊伍任務分開：不強迫每隊必須各一職。Entry 首波進點、Lurker 側線牽制、Support 煙閃／攜包／補槍、AWPer 長線與狙擊購槍、IGL 情報／領導執行。真正使用 duty、道具庫存、路線與交戰資格；賽後 duty 時間讀真保存幀。

安包後：AWPer 偏長距離、Lurker 偏遠側、Support 近包、IGL 中距離協調、Entry 控制入口。所有選點仍需真碰撞導航、對包視線、掩體與隊友位置，公開地圖或3秒內隊伍情報。持續保留預約角度，敵情證實新側線才重選。CT 拆彈者停住執行，其餘 CT 尋找不同的掩護角度；不能大家一起擠在 C4 上。

## 能力消費鏈

輸入統一經 getPlayerDerivedStats → applyFatigueToStats → STAT_L2S → 引擎 persStat（含個性及 clamp）。UI 適性是 base stats 加權，戰鬥另使用 effective stats；兩者不冒充相同數值。

| 長鍵／短鍵 | 正式用途與邊界 |
|---|---|
| reflex／rxn | 真反應就緒時間、機械對槍與 Entry 適性；raw role-fit 與 effective 反應分開 |
| accuracy／acc | 命中、爆頭／武器契合，AWPer／步槍專長；不直接寫入擊殺結果 |
| apm／apm | 機械交戰、視線轉向速度、Entry 適性與風險傾向；不能繞過槍械射速 |
| positioning／pos | 架槍與狙擊契合、交戰修正、撤退傾向；蹲下還須真方向掩體 |
| mapAware／vis | 取得目標的可視距離、Lurker 適性與側線交戰；牆／煙／FOV 資格仍必須成立 |
| tacticalIQ／tac | IGL 執行路線、CT 回防、Support 道具適性 |
| decision／dec | 交戰判斷、Lurker／IGL 適性及拆彈速度；剩餘時間須足以完成 |
| adaptability／adp | 有門檻的替代／重定位路線、Lurker／IGL 適性；新守包亦需實際敵情才重選 |
| courage／cou | Entry 適性、進攻／撤退風險與交戰修正 |
| clutch／str | 真 lastAlive 交戰能力與低血穩定、風險傾向；不保證殘局成功 |
| focus／foc | 反應、命中／狙擊架槍、拆彈速度；不生成額外射擊 |
| resilience／res | 低血量執行能力衰退修正；不替代 Clutch 的1vN責任 |
| comms／com | 目標／包點情報交接、Support／IGL 適性；不提供全圖透視 |
| leadership／led | IGL 路線協調與隊友執行；仍須符合正式路線和生存條件 |
| synergy／coo | 真補槍候選、跟進掩護／交戰路線、Support 適性 |
| learning／lrn | 賽後 CS 經驗吸收（learningGrowth → csProgressAdapter）；不是局內槍法加成，不宣稱16項都直接加命中 |

成長仍使用既有課程／XP／潛力與疲勞系統，沒有寫入第二份選手能力，沒有新增獎勵公式。來源：fpsRoster.js、playerModel.js、EsportsFPS3D.jsx 的 POS_PROFILE／combatSkill／反應與情報函式、learningGrowth.js、csProgressAdapter.js。

## 音效

22 把正式槍：AK-47、M4A1-S、M4A4、Galil、FAMAS、AUG、SG553、AWP、SSG08、MP9、MAC10、UMP45、P90、Deagle、Glock、USP-S、P250、Tec9、Nova、XM1014、MAG7、Sawed-Off。fpsGunAudio.js 為每把定義錄音家族、pitch、gain、尾音長度；消音槍較低聲且較短，狙擊較長，連發節奏仍由權威 shotAtMs 決定。全部共用原五份 CC0 實錄，不增加音訊 buffer／filter／source 數。換彈起止／空彈由保存狀態轉換觸發並依原位置衰減。

素材來源與作者見 public/audio/cs/c5a2/SOURCES.md；本輪重新查核 OpenGameArt 原作者頁 CC0。參考 Valve 官方位置音訊設計原則，不複製 Valve 聲音。22份波形測量能證明解碼、非靜音與差異；聲音是否足夠好辨識仍須 Owner 實聽，不能用 hash 冒充聽覺評測。
