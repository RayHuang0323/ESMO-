$ErrorActionPreference='Stop'
$env:NODE_OPTIONS='--max-old-space-size=1536'
$csCases=@(@('dust2','f1'),@('dust2','f2'),@('dust2','f4'),@('dust2','f5'),@('mirage','f5'),@('inferno','f5'))
$csEvidence='review/cs-major-upgrade/evidence/owner5-review-20261013'
$csQuota=node review/cs-major-upgrade/tools/check_weekly_quota.mjs | ConvertFrom-Json
if($csQuota.pauseRequired){throw 'weekly quota pause required; no cases started'}
foreach($csCase in $csCases){
  $csName="owner5-$($csCase[0])-$($csCase[1])-fresh-selection-verified-20261013"
  $env:ESMO_CS_OWNER5_MAP=$csCase[0];$env:ESMO_CS_OWNER5_SELECTION=$csCase[1]
  $env:ESMO_CS_OWNER5_REPORT="$csEvidence/$csName.json"
  $env:ESMO_CS_API_STAGE_PREFIX="$csEvidence/$csName-stage"
  $csQuota=node review/cs-major-upgrade/tools/check_weekly_quota.mjs | ConvertFrom-Json
  if($csQuota.pauseRequired){throw 'weekly quota pause required; remaining cases not run'}
  node review/cs-major-upgrade/tools/run_authenticity_step.mjs "review/cs-major-upgrade/evidence/authenticity-closure-20261012/$csName" tools/verify.mjs --only=cs_owner5_runtime --timeout=180000
  $csNative=$LASTEXITCODE
  if(Test-Path -LiteralPath tmp/verify-logs/cs_owner5_runtime.log){Copy-Item -LiteralPath tmp/verify-logs/cs_owner5_runtime.log -Destination "$csEvidence/$csName.complete-segment.log" -ErrorAction Stop}
  Write-Output "$csName native=$csNative"
  if($csNative -ne 0){throw 'case failed/incomplete; preserve result, stop new cases'}
}
