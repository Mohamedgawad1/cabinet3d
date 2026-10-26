# Export real rendered pictures of each equipment family from the PS5 model.
#
# Why: the app shows a picture for every device. When Navisworks automation is
# available these exports replace the built-in 3D renders with photographs of the
# actual equipment as modelled in the NWD.
#
# Requirements
#   * Navisworks Manage 2017 installed (automation host = Roamer.exe)
#   * no Navisworks window already open
#
# Usage
#   powershell -ExecutionPolicy Bypass -File tools\export_family_shots.ps1
#
# Output
#   F:\work\NAVIS WORK\c3d_out\shots\*.png  ->  data\img\fam\<FAMILY>.png

$ErrorActionPreference = 'Stop'

$nwd     = 'C:\Users\mylap\OneDrive\Desktop\ECP-Review-A50-DE_PS5(30) July2026.nwd'
$work    = 'F:\work\NAVIS WORK'
$probe   = Join-Path $work 'C3DProbe'
$out     = Join-Path $work 'c3d_out\shots'
$app     = Split-Path -Parent $PSScriptRoot
$famDir  = Join-Path $app 'data\img\fam'

if (-not (Test-Path $nwd))  { throw "model not found: $nwd" }
if (-not (Test-Path $out))  { New-Item -ItemType Directory -Force $out | Out-Null }
if (-not (Test-Path $famDir)) { New-Item -ItemType Directory -Force $famDir | Out-Null }

# one representative asset per family, chosen from tags that exist in the model
$reps = [ordered]@{
  TRANSFORMER = 'PS5-61-IU- 0001D'
  VSD_XFMR    = 'PS5-61-IU- 3100A'
  PANEL       = 'PS5-61-IK-0001'
  VALVE_MOV   = 'PS5-25-MOV- 0027'
  VALVE_SDV   = 'PS5-25-SDV- 0035C'
  SPEAKER     = 'PS5-08-01LS-0628'
  BEACON      = 'PS5-08-01FB- 1012'
  CAMERA      = 'PS5-08-52CM- 0140'
  CAMERA_TANK = 'PS5-08-52TK- 0140'
  READER      = 'PS5-08-85BR-0004'
  CONTACT     = 'PS5-08-85DC-1910'
  JUNCTION    = 'PS5-08-01BT-1902'
  DETECTOR    = 'PS5-03-GDLHP- 0142'
  PHONE       = 'PS5-08-03TP-1904'
  WAP         = 'PS5-08-12AP-0101'
  SOCKET      = 'PS5-60-ISO-62800C'
  GENERATOR   = 'PS5-05-DG-8100'
  PUMP        = 'PS5-61-IDH- 3100C'
}

$cmds = foreach ($k in $reps.Keys) {
  "C3DExport.KENT|$($reps[$k])|$($out.Replace('\','/'))|pic|$k"
}
$cmdFile = Join-Path $work 'c3d_out\batch_shots.txt'
$cmds | Set-Content -Path $cmdFile -Encoding ASCII

Write-Host "exporting $($cmds.Count) families - index build takes ~20 min, then ~15 s per family"
& (Join-Path $probe 'run_batch.ps1') -nwd $nwd -cmdFile $cmdFile

Get-Process Roamer -ErrorAction SilentlyContinue | Stop-Process -Force

# copy whatever was produced into the app, and record it in the manifest
$made = @{}
Get-ChildItem $out -Filter *.png -ErrorAction SilentlyContinue | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $famDir $_.Name) -Force
  $made[[IO.Path]::GetFileNameWithoutExtension($_.Name)] = 1
  Write-Host ("  ok  " + $_.Name + "  " + [math]::Round($_.Length/1kb) + " KB")
}

$manifest = "/* families with a real render exported from the Navisworks model */`nwindow.C3D_FAM = " +
  ($made | ConvertTo-Json -Compress) + ";`n"
Set-Content -Path (Join-Path $famDir 'manifest.js') -Value $manifest -Encoding UTF8

Write-Host ""
Write-Host ("done - " + $made.Count + " family pictures in " + $famDir)
