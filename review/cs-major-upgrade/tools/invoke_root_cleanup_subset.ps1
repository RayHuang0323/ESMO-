param(
 [Parameter(Mandatory=$true)][string]$ManifestPath,
 [string]$ExpectedManifestSha256,
 [string]$RootReviewPath,
 [string]$OutputPrefix,
 [switch]$Execute
)
# CS only. Default is dry-run. Owner has cleanup authority; this tool does not ask the user again.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$review = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$workspace = [IO.Path]::GetFullPath((Join-Path $review '../..'))
$scope = [IO.Path]::GetFullPath((Join-Path $review 'profile-builds'))
$retention = Join-Path $review 'evidence/retention-policy-20261011'
function Hash-File([string]$File) { (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() }
function Require-Inside([string]$File,[string]$Root) {
 $full = [IO.Path]::GetFullPath($File)
 if (!$full.StartsWith($Root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw "Outside authorized root: $full" }
 return $full
}
function Assert-RegularTree([string]$Folder) {
 $resolved = (Resolve-Path -LiteralPath $Folder).Path
 if (![string]::Equals($resolved,$Folder,[StringComparison]::OrdinalIgnoreCase)) { throw 'Resolved archive path drift' }
 $entries = @(Get-Item -LiteralPath $Folder)
 $entries += @(Get-ChildItem -LiteralPath $Folder -Force -Recurse)
 foreach ($entry in $entries) {
  if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse point is not authorized: $($entry.FullName)" }
 }
}
function Require-Record($Record) {
 $target = Require-Inside (Join-Path $workspace $Record.path) $review
 if (!(Test-Path -LiteralPath $target -PathType Leaf) -or (Hash-File $target) -ne $Record.sha256) { throw "Preserved evidence missing or changed: $target" }
}
function Hash-Bundle([string]$Folder) {
 $hash = [Security.Cryptography.SHA256]::Create()
 try {
  [string[]]$names = @(Get-ChildItem -LiteralPath (Join-Path $Folder 'assets') -File | Where-Object {$_.Extension -eq '.js'} | ForEach-Object {$_.Name})
  [Array]::Sort($names,[StringComparer]::Ordinal)
  foreach ($name in $names) {
   $nameBytes = [Text.Encoding]::UTF8.GetBytes($name+[char]0)
   [void]$hash.TransformBlock($nameBytes,0,$nameBytes.Length,$nameBytes,0)
   $stream = [IO.File]::OpenRead((Join-Path (Join-Path $Folder 'assets') $name))
   try { $buffer=New-Object byte[] 1048576; while (($read=$stream.Read($buffer,0,$buffer.Length)) -gt 0) { [void]$hash.TransformBlock($buffer,0,$read,$buffer,0) } }
   finally { $stream.Dispose() }
  }
  [void]$hash.TransformFinalBlock([byte[]]@(),0,0)
  return ([BitConverter]::ToString($hash.Hash)).Replace('-','').ToLowerInvariant()
 } finally { $hash.Dispose() }
}
$manifestFile = Require-Inside $ManifestPath $retention
$manifestHash = Hash-File $manifestFile
if ($ExpectedManifestSha256 -and $ExpectedManifestSha256 -ne $manifestHash) { throw 'Manifest hash mismatch' }
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestFile | ConvertFrom-Json
if ($manifest.schema -ne 'cs-major-root-reviewed-cleanup-subset.v1' -or $manifest.scope -ne $scope) { throw 'Unexpected manifest scope/schema' }
if (!$OutputPrefix) { $OutputPrefix = Join-Path $retention ('e-root-cleanup-'+(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')) }
$OutputPrefix = Require-Inside $OutputPrefix $retention
foreach ($suffix in @('.journal.jsonl','.result.json')) { if (Test-Path -LiteralPath ($OutputPrefix+$suffix)) { throw 'Never overwrite cleanup evidence' } }
$reviewRecord = $null
if ($RootReviewPath) { $reviewRecord = Get-Content -Raw -Encoding UTF8 -LiteralPath (Require-Inside $RootReviewPath $retention) | ConvertFrom-Json }
$selectedCandidates = @($manifest.approvedArchives)
if ($Execute) {
 if (!$ExpectedManifestSha256 -or !$reviewRecord -or $reviewRecord.owner -ne 'root' -or $reviewRecord.manifestSha256 -ne $manifestHash) { throw 'Execution requires root review tied to exact manifest SHA' }
 foreach ($flag in @('eComplete','finalPreviewPreserved','historicalLinksConverted','currentSourceRecoveryPreserved')) { if ($reviewRecord.$flag -ne $true) { throw "Root final review missing: $flag" } }
 if (!@($reviewRecord.archiveNames).Count) { throw 'Root review must explicitly list a nonempty subset' }
 foreach ($name in $reviewRecord.archiveNames) { if (@($manifest.approvedArchives.name) -notcontains $name) { throw 'Root review contains an archive outside the explicit manifest' } }
 $selectedCandidates = @($manifest.approvedArchives | Where-Object {@($reviewRecord.archiveNames) -contains $_.name})
}
Require-Record $manifest.sourceCandidateManifest
Require-Record $manifest.historicalManifest
Require-Record $manifest.policy
Require-Record $manifest.nativeResourceTool
foreach ($protected in $manifest.protectedPaths) { if (!(Test-Path -LiteralPath $protected)) { throw "Protected path missing: $protected" } }
$rows = @()
foreach ($candidate in $selectedCandidates) {
 $status = 'KEEP'; $reason = $null; $resourceReport = $null; $intentStarted = $false
 try {
  $target = Require-Inside $candidate.resolvedPath $scope
  if ((Split-Path -Leaf $target) -ne $candidate.name -or $candidate.name -notmatch '^phase-b7-[a-z0-9-]+-1366$' -or $candidate.name -match 'recovery|recovered|resume|preview') { throw 'Archive is not an explicit old candidate' }
  if (!(Test-Path -LiteralPath $target -PathType Container)) { throw 'Archive not present' }
  Assert-RegularTree $target
  if ((Hash-File (Join-Path $target 'build-manifest.json')) -ne $candidate.manifestSha256) { throw 'Archive manifest changed' }
  $buildRecord = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $target 'build-manifest.json') | ConvertFrom-Json
  if ($buildRecord.sourceFingerprint.sha256 -ne $candidate.sourceHash -or $buildRecord.bundleSha256 -ne $candidate.bundleSha256) { throw 'Source/bundle identity changed' }
  if ((Hash-Bundle $target) -ne $candidate.bundleSha256) { throw 'Actual JS bundle changed' }
  Require-Record $candidate.metrics; Require-Record $candidate.gate; Require-Record $candidate.native
  foreach ($log in $candidate.fullLogs) { Require-Record $log }
  foreach ($png in $candidate.representativePngs) {
   $pngFile = if ($png -is [string]) { Join-Path $workspace $png } elseif ($png.path) { Join-Path $workspace $png.path } elseif ($png.resolvedPath) { $png.resolvedPath } else { throw 'Unknown representative PNG shape' }
   if (!(Test-Path -LiteralPath $pngFile -PathType Leaf)) { throw "Representative PNG missing: $pngFile" }
  }
  $files = @(Get-ChildItem -LiteralPath $target -File -Force -Recurse)
  $logical = ($files | Measure-Object -Property Length -Sum).Sum
  if ($files.Count -ne $candidate.files -or $logical -ne $candidate.logicalBytes) { throw 'Archive file count/bytes changed' }
  $resourceList = $OutputPrefix+'.'+$candidate.name+'.resources.json'
  if (Test-Path -LiteralPath $resourceList) { throw 'Resource evidence already exists' }
  [IO.File]::WriteAllText($resourceList,(ConvertTo-Json -InputObject @($files | ForEach-Object {$_.FullName}) -Compress),[Text.UTF8Encoding]::new($false))
  $resourceOutput = & powershell.exe -NoProfile -File (Join-Path $PSScriptRoot 'read_archive_resource_use.ps1') -FileListPath $resourceList 2>&1
  $resourceNative = $LASTEXITCODE
  [IO.File]::WriteAllText($resourceList+'.log',($resourceOutput -join [Environment]::NewLine),[Text.UTF8Encoding]::new($false))
  if ($resourceNative -ne 0) { throw "Resource query native $resourceNative; KEEP" }
  $resourceReport = ($resourceOutput -join [Environment]::NewLine) | ConvertFrom-Json
  if ($resourceReport.files -ne $files.Count -or @($resourceReport.resourcePids).Count -or @($resourceReport.resourceFailures).Count) { throw 'Resource count mismatch, occupied handle or access unknown' }
  foreach ($process in $resourceReport.processes) {
   if ($process.scopeMention -and $process.cwdStatus -ne 'READ') { throw "Scoped cwd unknown: $($process.pid)" }
   if ($process.cwd -and ([string]::Equals($process.cwd,$target,[StringComparison]::OrdinalIgnoreCase) -or $process.cwd.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase))) { throw "Archive cwd in use: $($process.pid)" }
   if (@($process.archiveNames) -contains $candidate.name) { throw "Archive named by active process: $($process.pid)" }
  }
  $status='ELIGIBLE_ROOT_FINAL_REVIEW'
  if ($Execute) {
   if (@($reviewRecord.archiveNames) -notcontains $candidate.name) { throw 'Root review did not list this archive' }
   # Re-resolve and constrain the absolute target immediately before one-shell LiteralPath removal.
   $target = Require-Inside ((Resolve-Path -LiteralPath $target).Path) $scope
   Assert-RegularTree $target
   [IO.File]::AppendAllText($OutputPrefix+'.journal.jsonl',((@{stage='INTENT';archive=$candidate.name;resolvedPath=$target;manifestSha256=$manifestHash;checkedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json -Compress)+"`n"),[Text.UTF8Encoding]::new($false))
   $intentStarted = $true
   Remove-Item -LiteralPath $target -Recurse -Force
   if (Test-Path -LiteralPath $target) { throw 'Removal incomplete; stop and retain journal' }
   $status='DELETED_CONFIRMED'
  }
 } catch { $status=$(if($intentStarted){'DELETE_INCOMPLETE_STOP'}else{'KEEP'}); $reason=$_.Exception.Message }
 $row=[pscustomobject]@{archive=$candidate.name;resolvedPath=$candidate.resolvedPath;status=$status;reason=$reason;logicalBytes=$candidate.logicalBytes;identityBytes=$candidate.uniqueFileIdentityBytes;resourceCheckedAt=$resourceReport.checkedAt}
 $rows += $row
 [IO.File]::AppendAllText($OutputPrefix+'.journal.jsonl',(($row | ConvertTo-Json -Compress)+"`n"),[Text.UTF8Encoding]::new($false))
 if ($Execute -and $reason) { break }
}
$result=[pscustomobject]@{schema='cs-root-cleanup-execution.v1';mode=$(if($Execute){'EXECUTE'}else{'DRY_RUN'});manifestPath=$manifestFile;manifestSha256=$manifestHash;checkedAt=(Get-Date).ToUniversalTime().ToString('o');rows=$rows;deleted=@($rows | Where-Object {$_.status -eq 'DELETED_CONFIRMED'}).Count;eligible=@($rows | Where-Object {$_.status -eq 'ELIGIBLE_ROOT_FINAL_REVIEW'}).Count;kept=@($rows | Where-Object {$_.status -eq 'KEEP'}).Count;pngDeleted=0;processControlPerformed=$false;limits='Logical/file identity bytes are not actual disk or OneDrive reclaim. Native resource/cwd snapshots have a race boundary; no outside processes are controlled.'}
[IO.File]::WriteAllText($OutputPrefix+'.result.json',($result | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
$notRun = @($selectedCandidates | Where-Object {@($rows.archive) -notcontains $_.name} | ForEach-Object {$_.name})
$result | Add-Member -MemberType NoteProperty -Name notRunArchiveNames -Value $notRun
[IO.File]::WriteAllText($OutputPrefix+'.result.json',($result | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
$result | ConvertTo-Json -Depth 8
if ($result.kept -or @($rows | Where-Object {$_.status -eq 'DELETE_INCOMPLETE_STOP'}).Count) { exit 2 }
