# Locate the Blender executable on this machine and print its full path.
# Usage:  powershell -ExecutionPolicy Bypass -File find_blender.ps1
# Exits 0 and prints the path on success; exits 1 if not found.

$found = @()

# 1) PATH
$onPath = Get-Command blender -ErrorAction SilentlyContinue
if ($onPath) { $found += $onPath.Source }

# 2) Standard install roots (newest version folder wins via sort later)
$roots = @(
    "C:\Program Files\Blender Foundation",
    "C:\Program Files (x86)\Blender Foundation",
    "$env:LOCALAPPDATA\Programs\Blender Foundation"
)
foreach ($r in $roots) {
    if (Test-Path $r) {
        Get-ChildItem $r -Filter blender.exe -Recurse -Depth 3 -ErrorAction SilentlyContinue |
            ForEach-Object { $found += $_.FullName }
    }
}

# 3) Start Menu shortcut target
$sm = Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs" `
    -Filter "*lender*.lnk" -Recurse -ErrorAction SilentlyContinue
foreach ($lnk in $sm) {
    $target = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk.FullName).TargetPath
    if ($target -and (Test-Path $target)) { $found += $target }
}

$found = $found | Where-Object { $_ -and (Test-Path $_) } | Sort-Object -Unique -Descending
# Prefer the real 'blender.exe' over 'blender-launcher.exe': the launcher detaches
# and breaks headless --background piping.
$exe = $found | Where-Object { (Split-Path $_ -Leaf) -ieq "blender.exe" }
if (-not $exe) { $exe = $found }
if (@($exe).Count -eq 0) {
    Write-Error "No blender.exe found. Install Blender or add it to PATH."
    exit 1
}
# Highest version path first (descending sort puts 'Blender 5.2' before '4.2')
Write-Output @($exe)[0]
exit 0
