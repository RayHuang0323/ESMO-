import fs from 'node:fs';
const text=`

### Owner4B接地與HE呈現架構（2026-10-14）

新增 src/battle/fps/presentation/fpsVisibleGrounding.js：nondeath pelvis保留經parent matrix投回local的世界UP位移，鎖住水平root motion；支撐點只取可見鞋底80候選/屍體1597候選，不拿cached Box3/hidden mesh當接地證據。fpsBoundsSampler.js繼續用於既有framing/診斷，沒有被改成另一份真地面。FpsCharacterRenderer順序是restore→mixer/pose→衣物sync→可見support取樣/apply單一modelY→衣物再次sync。停止的屍體使用姿態/root/visibility signature快取；權威parent X/Z與frame不變。Death contactY另記真取樣surfaceY，不能以rootY+offset代替。

新增 fpsFloorSampler.js：初始化讀同一份場景ground/roads/paving/room floor/paint triangles並以2m空間格索引；真callback傳入renderer，包含ramp tessellation與各種lift，不把.045寫死全圖。它只服務呈現，沒有第二份導航/collider/Store。真CPU15定姿+99動態與Browser三圖已保存完整可見vertex oracle；5mm候選不是全部通過（3個5.213mm），原8cm門檻不放寬。

新增 fpsHeVfx.js：4事件、每事件2暖色contact/6 sparks/3 brown-grey dust，最多44葉物件；contact .18s、sparks .32s、dust1.10s，依保存detonatedAtRoundSec與subframe，不讀wall time。Reduced motion移除動態火花仍保留暖色/塵煙；不新增PointLight/後處理/傷害或地圈。時間是本案設計值，非Valve公布參數；[Valve CS2視覺](https://www.counter-strike.net/cs2)僅作風格參考。

fpsAwarenessLook增加同源walls/lineBlocked，僅公共node/local clear-ray與TTL情報；保留合法corner/trueintel預瞄與封閉空間明示理由，沒讀hidden enemy/沒改duty或route。Mirage closedFacade只省內部outer endcaps（window jamb保留），belt兩端退30mm；crate steel最多20mm呈現外突、正規collider不變。Geometry candidate不是flicker outcome KPI；所有角度、專業CS體感与手機真機仍Owner驗收。
`;
for(const file of ['docs/handoff/06_目前主幹架構.md','docs/design/CS_FPS_Major_Upgrade.md','review/cs-major-upgrade/OWNER4B_CLOSURE.md'])fs.appendFileSync(file,text);
console.log('Owner4B architecture appended without rewriting historical handoff.');
