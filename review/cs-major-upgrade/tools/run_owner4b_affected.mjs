import {spawn} from 'node:child_process';
process.env.ESMO_CS_OWNER4_CONTACT_REPORT='review/cs-major-upgrade/evidence/owner4b-review-20261014/contact-runtime-after.json';
process.env.ESMO_CS_RUNTIME_FIXTURE='review/cs-major-upgrade/evidence/owner4b-review-20261014/tactical-runtime-after.json.gz';
const child=spawn(process.execPath,['tools/verify.mjs','--only=cs_owner4_contact_runtime,cs_major_tactical_runtime','--timeout=240000'],{stdio:'inherit',windowsHide:true,env:process.env});
child.on('close',(code)=>process.exitCode=code??2);
