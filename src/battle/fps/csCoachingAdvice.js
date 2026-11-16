// Read-only coaching view model. Analytics and Training retain their authority.
import {calculateCourse,courseById} from '../../data/playerModel.js';
const finite=n=>Number.isFinite(n)&&n>=0;
const scope=r=>r?.sceneVersion&&r?.mapIdentity?.sceneVersion===r.sceneVersion&&r?.mapIdentity?.competitionMapId&&r?.mapIdentity?.layoutId
 ? [r.mapIdentity.competitionMapId,r.mapIdentity.layoutId,r.sceneVersion].join('/') : null;
function actorFor(result,playerId){
 const rows=(result?.players||[]).filter(p=>p.playerId===playerId);
 if(rows.length!==1||(result.players||[]).filter(p=>p.playerName===rows[0].playerName).length!==1)return null;
 const matches=(result.analytics?.players||[]).filter(p=>p.teamId==='us'&&p.name===rows[0].playerName);
 if(matches.length!==1)return null;
 const a=matches[0];return ['shots','hits','openingKills','openingDeaths'].every(k=>finite(a[k]))&&a.hits<=a.shots?a:null;
}
export function buildCsCoachingAdvice({result,history=[],players=[]}={}){
 const identity=scope(result);
 if(!identity||result?.analytics?.version!==1)return {status:'insufficient',cards:[],reason:'資料不足：這份戰報沒有完整的地圖版本或進階表現紀錄。'};
 const seen=new Set(),unique=[];
 for(const record of [result,...history])if(record?.matchId&&!seen.has(record.matchId)){seen.add(record.matchId);unique.push(record);}
 const records=unique.filter(r=>scope(r)===identity&&r.analytics?.version===1).slice(0,10),cards=[];
 let observed=0,eligiblePlayers=0;
 for(const row of result.players||[]){
  const player=players.find(p=>p.id===row.playerId),current=actorFor(result,row.playerId);if(!player||!current)continue;
  eligiblePlayers++;
  const samples=records.flatMap(r=>{const a=actorFor(r,player.id);return a&&a.role===current.role?[{matchId:r.matchId,shots:a.shots,hits:a.hits,openingKills:a.openingKills,openingDeaths:a.openingDeaths}]:[];});
  observed=Math.max(observed,samples.length);
  const sum=k=>samples.reduce((s,r)=>s+r[k],0),shots=sum('shots'),hits=sum('hits'),openingKills=sum('openingKills'),openingDeaths=sum('openingDeaths');
  let rule=null;
  if(Number.isFinite(player.energy)&&player.energy<60)rule={course:'rest',title:'先恢復比賽狀態',observation:`目前體力 ${player.energy}，先安排恢復。`,caveat:'疲勞會影響表現，不能直接判定為永久能力不足。'};
  else if(samples.length>=3&&shots>=100&&hits/shots<.55)rule={course:'aim',title:'覆核射擊穩定度',observation:`近 ${samples.length} 場同地圖：${hits}/${shots} 發命中（${Math.round(hits/shots*100)}%）。`,caveat:'武器與交戰距離也會影響命中；這是覆核線索，不是唯一原因。'};
  else if(samples.length>=3&&openingDeaths-openingKills>=3)rule={course:'positioning',title:'覆核第一波交火位置',observation:`近 ${samples.length} 場同地圖：首死 ${openingDeaths} 次／首殺 ${openingKills} 次。`,caveat:'先核對角色任務與交火位置；不能只憑首死判定走位有問題。'};
  if(!rule)continue;
  const course=courseById(rule.course),preview=calculateCourse(player,course.id);
  cards.push({playerId:player.id,playerName:player.name,matchId:result.matchId,mapName:result.mapName,role:current.role,...rule,course,preview,samples,shots,hits,openingKills,openingDeaths,alreadyTraining:Boolean(player.training),capped:course.id!=='rest'&&preview.totalGain<=0,energy:player.energy});
 }
 return {status:cards.length?'ready':observed<3||!eligiblePlayers?'insufficient':'no-priority',cards:cards.slice(0,3),observed,reason:!eligiblePlayers?'資料不足：目前無法安全對應可訓練選手，或選手姓名重複。':observed<3?`資料不足：相同地圖版本與角色需至少 3 場，現有 ${observed} 場。`:'目前沒有明確需要優先調整的項目，可繼續累積同條件比賽。'};
}
