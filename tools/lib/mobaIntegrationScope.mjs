import {execFileSync} from 'node:child_process';
import {SIMULATION_SEMANTICS_FILES} from '../../src/platform/contracts/simulationVersion.js';

// 明確的已核准CS整合面；不是整個fps目錄或所有非MOBA路徑的豁免。
// 其餘src（包含未登錄的新增檔）仍須與各Gate原始基準相同。
export const CS_INTEGRATION_SOURCE_PATHS=Object.freeze([
 'src/AppShell.jsx','src/battle/fps/EsportsFPS3D.jsx','src/battle/fps/csCoachingAdvice.js',
 'src/battle/fps/csFixtureOpponent.js','src/battle/fps/csMapIdentity.js','src/battle/fps/fpsFoundryReplayPool.js',
 'src/battle/fps/fpsMatchAnalytics.js','src/battle/fps/fpsReplay.js','src/battle/fps/fpsWeaponHandling.js',
 'src/platform/contracts/CsMatchResult.js','src/platform/contracts/csMapVeto.js','src/platform/profileStore.js',
 'src/screens/fps/CsCoachingPanel.jsx','src/screens/fps/CsMapSelectScreen.jsx','src/screens/fps/CsMatchScreen.jsx',
 'src/screens/fps/CsPrepScreen.jsx','src/screens/fps/CsProfessionalReport.jsx','src/screens/fps/CsResultScreen.jsx',
 'src/screens/fps/CsTrainingReview.jsx','src/screens/fps/csCoaching.css','src/screens/fps/csCoachingNavigation.js',
 'src/screens/fps/csProfessionalReport.css','src/screens/fps/csTrainingReview.css','src/screens/manage/TrainingScreen.jsx',
]);
export function evaluateMobaIntegrationScope({changedPaths,dirtyPaths=[],semanticPaths=SIMULATION_SEMANTICS_FILES}){
 const allowed=new Set(CS_INTEGRATION_SOURCE_PATHS),protectedSet=new Set(semanticPaths);
 const semanticChanges=changedPaths.filter(p=>protectedSet.has(p));
 const unexpected=changedPaths.filter(p=>!allowed.has(p));
 const overlap=CS_INTEGRATION_SOURCE_PATHS.filter(p=>protectedSet.has(p));
 return {ok:!semanticChanges.length&&!unexpected.length&&!dirtyPaths.length&&!overlap.length,
  semanticChanges,unexpected,dirtyPaths,overlap,allowedCsChanges:changedPaths.filter(p=>allowed.has(p))};
}
export function inspectMobaIntegrationScope(baseline,root=process.cwd()){
 const git=(...args)=>execFileSync('git',['--no-optional-locks',...args],{cwd:root,encoding:'utf8'});
 const changedPaths=git('diff','--name-only','-z',baseline,'--','src').split('\0').filter(Boolean);
 const dirtyPaths=git('status','--porcelain=v1','-z','--untracked-files=all','--','src').split('\0').filter(Boolean);
 return {baseline,semanticFileCount:SIMULATION_SEMANTICS_FILES.length,...evaluateMobaIntegrationScope({changedPaths,dirtyPaths})};
}
