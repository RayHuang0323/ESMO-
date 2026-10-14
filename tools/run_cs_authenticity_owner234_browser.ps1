param(
  [string]$BuildDir='review/cs-major-upgrade/profile-builds/diagnostic-authenticity-v5-20261012-1366',
  [string]$OutDir='review/cs-major-upgrade/evidence/authenticity-closure-20261012/owner234-browser-v5-final'
)
$ErrorActionPreference='Stop'
$repoPath=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if((Get-Location).Path -ne $repoPath){throw '需在本CS worktree執行'}
$buildPath=(Resolve-Path -LiteralPath $BuildDir).Path
$archiveRoot=(Resolve-Path -LiteralPath 'review/cs-major-upgrade/profile-builds').Path
$evidenceRoot=(Resolve-Path -LiteralPath 'review/cs-major-upgrade/evidence/authenticity-closure-20261012').Path
$outPath=[IO.Path]::GetFullPath((Join-Path $repoPath $OutDir))
if(!$buildPath.StartsWith($archiveRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or !$outPath.StartsWith($evidenceRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'build／evidence resolved path越界'}
if(Test-Path -LiteralPath $outPath){throw '拒覆寫Browser evidence'}
$prefix=$OutDir
$isolationPath=$outPath+'.isolation.json'
if(Test-Path -LiteralPath $isolationPath){throw '拒覆寫CIM isolation記錄'}
foreach($suffix in @('.stdout.log','.stderr.log','.exit.json')){if(Test-Path -LiteralPath ($prefix+$suffix)){throw '拒覆寫完整log／native'} }
function Read-GateProfiles {
  $found=@()
  foreach($entry in @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction Stop)){
    if($entry.CommandLine -like '*--type=*'){continue}
    $m=[regex]::Match($entry.CommandLine,'--user-data-dir=(?:"([^"\r\n]+)"|(\S+))')
    if(!$m.Success){continue}
    $profile=if($m.Groups[1].Success){$m.Groups[1].Value}else{$m.Groups[2].Value}
    if($profile -like '*esmo-cdp-*'){
      $found+=[PSCustomObject]@{pid=$entry.ProcessId;profileName=[IO.Path]::GetFileName($profile);workspace=$profile.StartsWith($repoPath+'\',[StringComparison]::OrdinalIgnoreCase)}
    }
  }
  return $found
}
$report=[ordered]@{schema='cs-authenticity-owner234-browser-isolation.v1';buildDir=$BuildDir;outDir=$OutDir;rootSlotRequired='呼叫前必須root明確授權，不與C三圖／其他GPU重疊';before=$null;after=$null;gateNativeExit=$null;wrapperNativeExit=$null;status='NOT_RUN';screenshots=0}
function Save-Report {[IO.File]::WriteAllText($isolationPath,($report|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))}
try{
  $report.before=@{atUTC=(Get-Date).ToUniversalTime().ToString('o');profiles=@(Read-GateProfiles)}
}catch{$report.before=@{error=$_.Exception.Message};$report.status='HARNESS_FAIL_CIM_UNKNOWN';$report.wrapperNativeExit=2;Save-Report;Write-Output 'RESULT=HARNESS_FAIL CIM前置查詢失敗';exit 2}
if($report.before.profiles.Count -gt 0){$report.status='HARNESS_FAIL_GPU_SLOT_OCCUPIED';$report.wrapperNativeExit=2;Save-Report;Write-Output 'RESULT=HARNESS_FAIL 仍有gate Chrome profile，不啟動Browser、不操作其他行程';exit 2}
Save-Report
$nodePath=(Get-Command node -CommandType Application).Source
$savedPreference=$ErrorActionPreference
try{
  $ErrorActionPreference='Continue'
  & $nodePath review/cs-major-upgrade/tools/run_authenticity_step.mjs $prefix tools/browser/run-gate.mjs tools/browser_check_cs_authenticity_owner234.mjs --timeout 300000 -- "--buildDir=$BuildDir" "--outDir=$OutDir"
  $report.wrapperNativeExit=$LASTEXITCODE
}finally{$ErrorActionPreference=$savedPreference}
try{
  $nativePath=$prefix+'.exit.json'
  if(Test-Path -LiteralPath $nativePath){$report.gateNativeExit=(Get-Content -Raw -Encoding UTF8 -LiteralPath $nativePath|ConvertFrom-Json).nativeExitCode}
  $report.after=@{atUTC=(Get-Date).ToUniversalTime().ToString('o');profiles=@(Read-GateProfiles)}
  $pngCount=if(Test-Path -LiteralPath $outPath){@(Get-ChildItem -LiteralPath $outPath -Filter '*.png' -File -Recurse).Count}else{0}
  $report.screenshots=$pngCount
  if($report.after.profiles.Count -gt 0 -or $pngCount -gt 0){$report.status='HARNESS_FAIL_CLEANUP_OR_PNG';$report.wrapperNativeExit=2}
  else{$report.status=if($report.wrapperNativeExit -eq 0){'PASS'}elseif($report.wrapperNativeExit -eq 1){'PRODUCT_FAIL'}else{'HARNESS_FAIL'}}
}catch{$report.after=@{error=$_.Exception.Message};$report.status='HARNESS_FAIL_CIM_UNKNOWN';$report.wrapperNativeExit=2}
Save-Report
Write-Output ($report|ConvertTo-Json -Depth 8 -Compress)
exit $report.wrapperNativeExit
