param(
  [Parameter(Mandatory=$true)][string]$Phase,
  [Parameter(Mandatory=$true)][int]$Width,
  [int]$TimeoutMs=450000,
  [string[]]$ProbeArgs=@(),
  [ValidateSet('Diagnostic','Performance','Acceptance')][string]$EvidencePurpose='Diagnostic',
  [ValidateRange(1,1024)][int]$PlannedOutputMiB=32,
  [string]$EvidenceReason='',
  [switch]$PlanOnly
)
$ErrorActionPreference='Stop'
$repoPath=(Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
if((Get-Location).Path -ne $repoPath -or $Phase -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]*$' -or $Width -lt 320 -or $Width -gt 4096){throw 'GPU guard工作區／phase／width不合法'}
$probeOptions=@{}
foreach($option in $ProbeArgs){
  if($option -notmatch '^--([^=]+)=(.+)$'){throw 'ProbeArgs須明確key=value'}
  if($probeOptions.ContainsKey($Matches[1])){throw 'ProbeArgs不可重複key'}
  $probeOptions[$Matches[1]]=$Matches[2]
}
$maximumPng=$null
if($EvidencePurpose -eq 'Diagnostic'){
  if($probeOptions['maps'] -notmatch '^(mirage|dust2|inferno)$'){throw '局部診斷必須明確單地圖；完整驗收須指定Acceptance與原因'}
  if($PlannedOutputMiB -gt 64){throw '局部診斷容量預算上限64MiB；大量trace须獨立Performance工序'}
  foreach($key in @('trace','cpuProfile','characterViews','weaponGallery','weaponReloadGallery','weaponHandling')){if($probeOptions[$key] -eq 'true'){throw '局部診斷不得附加整套圖庫／profile；改用具名Performance或Acceptance'}}
  if($probeOptions['captureMode'] -eq 'metrics'){$maximumPng=0}
  elseif($probeOptions['operatorGallery'] -eq 'true' -and $probeOptions['operatorFocus'] -eq 'support'){
    $maximumPng=if($probeOptions['operatorTriggerClose'] -eq 'true'){2}else{4}
  }else{throw '局部診斷只允許metrics零PNG或support最多四圖，不默認建立全圖庫'}
}else{
  if([string]::IsNullOrWhiteSpace($EvidenceReason)){throw 'Performance／Acceptance須記錄本次必要性，不得默默展開全量產出'}
  if($EvidencePurpose -eq 'Performance' -and $probeOptions['captureMode'] -ne 'metrics'){throw 'Performance只允許metrics；視覺驗收另列Acceptance'}
}
$policy=[ordered]@{purpose=$EvidencePurpose;reason=$EvidenceReason;maximumSuccessPng=$maximumPng;plannedOutputBytes=$PlannedOutputMiB*1MB;scope='本輪證據及完整prepare/browser logs；build另由同源重用與public內容定址控制'}
if($PlanOnly){$policy | ConvertTo-Json -Compress;exit 0}
$reportPath=Join-Path $repoPath "review/cs-major-upgrade/evidence/$Phase-$Width-isolation.json"
if(Test-Path -LiteralPath $reportPath){throw '隔離紀錄已存在，不覆蓋；請使用新phase'}
$prepareLog=Join-Path $repoPath "review/cs-major-upgrade/evidence/$Phase-$Width-prepare-full.log"
$browserLog=Join-Path $repoPath "review/cs-major-upgrade/evidence/$Phase-$Width-browser-full.log"
foreach($taskLog in @($prepareLog,$browserLog)){if(Test-Path -LiteralPath $taskLog){throw '完整程序log已存在，不覆寫；請使用新phase'}}
function Read-ForeignGpuGates {
  $found=@()
  foreach($entry in @(Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction Stop)){
    if($entry.CommandLine -like '*--type=*'){continue}
    $match=[regex]::Match($entry.CommandLine,'--user-data-dir=(?:"([^"\r\n]+)"|(\S+))')
    if(!$match.Success){continue}
    $gateProfilePath=if($match.Groups[1].Success){$match.Groups[1].Value}else{$match.Groups[2].Value}
    if($gateProfilePath -like '*esmo-cdp-*' -and !$gateProfilePath.StartsWith($repoPath+'\',[System.StringComparison]::OrdinalIgnoreCase)){
      $found+=[PSCustomObject]@{pid=$entry.ProcessId;profileName=[IO.Path]::GetFileName($gateProfilePath)}
    }
  }
  return $found
}
$report=[ordered]@{version='cs-major-gpu-isolation.v4';phase=$Phase;width=$Width;evidencePolicy=$policy;evidenceOutput=$null;before=$null;after=$null;artifactPreparation=$null;fullOutputLogs=@{prepare=$prepareLog;browser=$browserLog;format='PowerShell native stdout+stderr redirection'};gateNativeExit=$null;wrapperExit=$null;status='NOT_RUN'}
function Save-IsolationReport {
  [IO.File]::WriteAllText($reportPath,($report | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
}
try{
  $report.before=@{checkedAt=(Get-Date).ToUniversalTime().ToString('o');peers=@(Read-ForeignGpuGates)}
}catch{
  $report.status='UNKNOWN_QUERY';$report.before=@{error=$_.Exception.Message};$report.wrapperExit=2;Save-IsolationReport
  Write-Output 'RESULT=HARNESS_FAIL｜GPU隔離查詢失敗，不能以空結果宣稱隔離';exit 2
}
if($report.before.peers.Count -gt 0){
  $report.status='HARNESS_FAIL_FOREIGN_GPU_GATE';$report.wrapperExit=2;Save-IsolationReport
  Write-Output ('RESULT=HARNESS_FAIL｜另一工作區GPU gate仍在執行；不操作其行程：'+($report.before.peers | ConvertTo-Json -Compress));exit 2
}
Save-IsolationReport
# PowerShell 5 treats redirected native stderr (including Vite advisories) as
# NativeCommandError. Preserve stderr, classify the native exit, keep CIM Stop.
$nodePath=(Get-Command node -CommandType Application -ErrorAction Stop).Source
$nativePreference=$ErrorActionPreference
try{
  $ErrorActionPreference='Continue'
  $gateClock=[Diagnostics.Stopwatch]::StartNew()
  $nativeGateExit=2
  $artifactReady=$true
  if($ProbeArgs -contains '--production=true' -and $ProbeArgs -notcontains '--buildOnly=true'){
    if(@($ProbeArgs | Where-Object {$_ -like '--prepareOnly=*'}).Count){throw 'wrapper自行管理artifact準備，不接受重複prepareOnly'}
    # A separate short-lived process owns build/rollup/esbuild memory. It
    # exits before Chrome starts; an existing matching archive is verified,
    # never rebuilt merely to split phases. Preparation is not browser PASS.
    [IO.File]::Open($prepareLog,[IO.FileMode]::CreateNew).Dispose()
    & $nodePath tools/browser/run-gate.mjs tools/browser_measure_cs_major_upgrade.mjs --timeout $TimeoutMs -- "--phase=$Phase" "--width=$Width" @ProbeArgs '--prepareOnly=true' *> $prepareLog
    $prepareExit=$LASTEXITCODE
    $report.artifactPreparation=@{nativeExit=$prepareExit;elapsedMs=$gateClock.ElapsedMilliseconds;browser='NOT_RUN';separateProcess=$true}
    Save-IsolationReport
    $artifactReady=$prepareExit -eq 0
    Write-Output "artifact完整stdout/stderr：$prepareLog；native=$prepareExit"
    if(!$artifactReady){Write-Output "RESULT=HARNESS_FAIL｜artifact準備失敗 native=$prepareExit；browser NOT RUN"}
  }
  $remainingMs=[Math]::Floor($TimeoutMs-$gateClock.ElapsedMilliseconds)
  if($artifactReady -and $remainingMs -ge 1000){
    [IO.File]::Open($browserLog,[IO.FileMode]::CreateNew).Dispose()
    & $nodePath tools/browser/run-gate.mjs tools/browser_measure_cs_major_upgrade.mjs --timeout $remainingMs -- "--phase=$Phase" "--width=$Width" @ProbeArgs *> $browserLog
    $nativeGateExit=$LASTEXITCODE
    Write-Output "browser完整stdout/stderr：$browserLog；native=$nativeGateExit"
  }elseif($artifactReady){Write-Output 'RESULT=HARNESS_FAIL｜artifact準備已耗盡總時限；browser NOT RUN'}
  $gateClock.Stop()
}finally{
  $ErrorActionPreference=$nativePreference
}
$report.gateNativeExit=$nativeGateExit
$outputDirectory=Join-Path $repoPath "review/cs-major-upgrade/evidence/$Phase/$Width"
$outputFiles=@()
if(Test-Path -LiteralPath $outputDirectory){$outputFiles=@(Get-ChildItem -LiteralPath $outputDirectory -File -Recurse)}
$pngCount=@($outputFiles | Where-Object {$_.Extension -eq '.png'}).Count
$outputBytes=($outputFiles | Measure-Object Length -Sum).Sum
foreach($taskLog in @($prepareLog,$browserLog)){if(Test-Path -LiteralPath $taskLog){$outputBytes+=(Get-Item -LiteralPath $taskLog).Length}}
$report.evidenceOutput=@{files=$outputFiles.Count;png=$pngCount;bytes=$outputBytes}
# 失敗時允許單張timeout診斷，但不把它當成功的零PNG量測。
$allowedPng=if($nativeGateExit -ne 0 -and $maximumPng -eq 0){1}else{$maximumPng}
if($outputBytes -gt $policy.plannedOutputBytes -or ($null -ne $allowedPng -and $pngCount -gt $allowedPng)){
  $report.status='HARNESS_FAIL_EVIDENCE_BUDGET';$report.wrapperExit=2;Save-IsolationReport
  Write-Output 'RESULT=HARNESS_FAIL｜本輪證據超出產出計畫；保留原生結果與證據，停止擴張，不自動刪除';exit 2
}
try{
  $report.after=@{checkedAt=(Get-Date).ToUniversalTime().ToString('o');peers=@(Read-ForeignGpuGates)}
  if($report.after.peers.Count -gt 0){
    $report.status='HARNESS_FAIL_FOREIGN_GPU_GATE';$report.wrapperExit=2;Save-IsolationReport
    Write-Output ('RESULT=HARNESS_FAIL｜收尾發現並行GPU gate，保留產品gate原生exit／sample，但性能隔離無效：'+($report.after.peers | ConvertTo-Json -Compress));exit 2
  }
}catch{
  $report.status='UNKNOWN_QUERY';$report.after=@{error=$_.Exception.Message};$report.wrapperExit=2;Save-IsolationReport
  Write-Output 'RESULT=HARNESS_FAIL｜收尾隔離查詢失敗；不宣稱性能隔離';exit 2
}
$report.status='MEASURED_NO_FOREIGN_GATE_AT_BOUNDARIES';$report.wrapperExit=$nativeGateExit;Save-IsolationReport
Write-Output "GPU隔離邊界紀錄：$reportPath；只查前後快照，不保證期間絕無其他負載。"
exit $nativeGateExit
