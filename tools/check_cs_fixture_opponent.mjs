import assert from 'node:assert/strict';
import {CS_AI_TEAMS} from '../src/data/csAiTeams.js';
import {csFixtureOpponentSnapshot} from '../src/battle/fps/csFixtureOpponent.js';
for(const team of CS_AI_TEAMS){
 const session={origin:{kind:'fixture'},opponent:{id:team.id}};
 const before=JSON.stringify(team),snapshot=csFixtureOpponentSnapshot({session,config:{},year:1});
 assert.equal(snapshot.teamId,team.id);assert.equal(snapshot.name,team.name);
 assert.equal(snapshot.actors.length,5);assert.equal(new Set(snapshot.actors.map(p=>p.id)).size,5);
 assert.ok(snapshot.actors.every(p=>p.side==='ct'&&team.roster.some(r=>r.id===p._gid&&r.name===p.name)));
 assert.equal(JSON.stringify(team),before);
 assert.equal(csFixtureOpponentSnapshot({session,config:{opponentSnapshot:snapshot},year:2}),snapshot);
 assert.equal(csFixtureOpponentSnapshot({session,config:{},existingSimulation:true}),null);
}
assert.equal(csFixtureOpponentSnapshot({session:{origin:{kind:'practice'}},config:{}}),null);
console.log(`CS fixture opponent: ${CS_AI_TEAMS.length} teams canonical roster / frozen resume / legacy compatibility PASS`);
