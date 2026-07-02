param(
  [switch]$Apply,
  [string]$ArchiveRoot = (Join-Path $env:LOCALAPPDATA "void-legacy-archive")
)

$ErrorActionPreference = "Stop"

$legacyTitle = "Bit" + "Fun"
$legacyLower = "bit" + "fun"
$legacyInstallDir = Join-Path $env:LOCALAPPDATA $legacyTitle
$legacyWebViewDir = Join-Path $env:LOCALAPPDATA ("com." + $legacyLower + ".desktop")
$legacyRoamingDir = Join-Path $env:APPDATA $legacyLower
$legacyShortcut = $legacyTitle + ".lnk"
$legacyUninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$legacyTitle"

function New-Action {
  param(
    [string]$Kind,
    [string]$Path,
    [string]$Action,
    [string]$Detail = ""
  )

  [pscustomobject]@{
    kind = $Kind
    path = $Path
    action = $Action
    detail = $Detail
  }
}

function Ensure-ArchiveRoot {
  if (-not (Test-Path -LiteralPath $ArchiveRoot)) {
    New-Item -ItemType Directory -Path $ArchiveRoot | Out-Null
  }
}

function Move-ToArchive {
  param(
    [string]$Path,
    [string]$Name
  )

  Ensure-ArchiveRoot
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $destination = Join-Path $ArchiveRoot "$Name-$stamp"
  Move-Item -LiteralPath $Path -Destination $destination
  return $destination
}

$actions = @()

if (Test-Path -LiteralPath $legacyUninstallKey) {
  $item = Get-ItemProperty -LiteralPath $legacyUninstallKey
  $actions += New-Action `
    -Kind "registry" `
    -Path $legacyUninstallKey `
    -Action "remove" `
    -Detail "DisplayName=$($item.DisplayName); Publisher=$($item.Publisher)"
}

$shortcutCandidates = @(
  (Join-Path ([Environment]::GetFolderPath("Desktop")) $legacyShortcut),
  (Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) $legacyShortcut),
  (Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs\$legacyShortcut"),
  (Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs\$legacyTitle\$legacyShortcut"),
  (Join-Path ([Environment]::GetFolderPath("CommonStartMenu")) "Programs\$legacyShortcut"),
  (Join-Path ([Environment]::GetFolderPath("CommonStartMenu")) "Programs\$legacyTitle\$legacyShortcut")
)

foreach ($shortcutPath in $shortcutCandidates) {
  if (Test-Path -LiteralPath $shortcutPath) {
    $actions += New-Action -Kind "shortcut" -Path $shortcutPath -Action "remove"
  }
}

$legacyDirs = @(
  @{ path = $legacyInstallDir; archiveName = "local-install" },
  @{ path = $legacyWebViewDir; archiveName = "local-webview" },
  @{ path = $legacyRoamingDir; archiveName = "roaming-data" }
)

foreach ($entry in $legacyDirs) {
  if (Test-Path -LiteralPath $entry.path) {
    $actions += New-Action `
      -Kind "directory" `
      -Path $entry.path `
      -Action "archive" `
      -Detail "archiveName=$($entry.archiveName)"
  }
}

if ($actions.Count -eq 0) {
  Write-Output "No legacy brand remnants were found."
  exit 0
}

if (-not $Apply) {
  Write-Output "Dry run. Re-run with -Apply to remove shortcuts/registry entries and archive legacy data."
  $actions | Format-Table -AutoSize
  exit 0
}

foreach ($action in $actions) {
  switch ($action.kind) {
    "registry" {
      Remove-Item -LiteralPath $action.path -Force
      Write-Output "Removed registry entry: $($action.path)"
    }
    "shortcut" {
      Remove-Item -LiteralPath $action.path -Force
      Write-Output "Removed shortcut: $($action.path)"
    }
    "directory" {
      $archiveName = ($action.detail -replace "^archiveName=", "")
      $destination = Move-ToArchive -Path $action.path -Name $archiveName
      Write-Output "Archived directory: $($action.path) -> $destination"
    }
  }
}
