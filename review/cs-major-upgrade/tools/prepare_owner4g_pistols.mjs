import {spawnSync} from 'node:child_process';const r=spawnSync('python',['review/cs-major-upgrade/tools/prepare_owner4g_pistols.py'],{stdio:'inherit',windowsHide:true});process.exitCode=r.status??2;
