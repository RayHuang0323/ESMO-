import {csAiTeamById,csAiRosterAt,csAiLineupAt} from '../../data/csAiTeams.js';
import {toFpsRoster} from './fpsRoster.js';

// Freeze only new official CS battles. A saved legacy simulation keeps its
// original actors; importing a Replay never re-resolves its opponent.
export function csFixtureOpponentSnapshot({session,config,existingSimulation=false,year=1}){
 if(config?.opponentSnapshot?.schema==='CsOpponent.v1')return config.opponentSnapshot;
 if(existingSimulation||session?.origin?.kind!=='fixture')return null;
 const team=csAiTeamById(session.opponent?.id);
 if(!team)return null;
 const actors=toFpsRoster(csAiRosterAt(team,year),csAiLineupAt(team,year));
 if(!actors||actors.length!==5)return null;
 return {schema:'CsOpponent.v1',teamId:team.id,name:team.name,year,actors:actors.map((p,i)=>({...p,id:`ct${i+1}`,side:'ct'}))};
}
