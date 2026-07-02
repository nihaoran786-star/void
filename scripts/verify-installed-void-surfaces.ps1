param(
  [switch]$Strict
)

$ErrorActionPreference = "Stop"

$product = "void"
$publisher = "void Team"
$desktopExe = "void-desktop.exe"
$installerExe = "void-installer.exe"
$uninstallKey = "Software\Microsoft\Windows\CurrentVersion\Uninstall\$product"
$manufacturerKey = "Software\$publisher\$product"
$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "$product.lnk"
$startMenuShortcut = Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs\$product.lnk"

function New-Check {
  param(
    [string]$Name,
    [bool]$Pass,
    [string]$Detail = ""
  )

  [pscustomobject]@{
    name = $Name
    pass = $Pass
    detail = $Detail
  }
}

function Read-RegistryString {
  param(
    [Microsoft.Win32.RegistryHive]$Hive,
    [string]$SubKey,
    [string]$ValueName
  )

  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($Hive, [Microsoft.Win32.RegistryView]::Default)
  $key = $base.OpenSubKey($SubKey)
  if ($null -eq $key) {
    return $null
  }
  try {
    return [string]$key.GetValue($ValueName, $null)
  } finally {
    $key.Dispose()
    $base.Dispose()
  }
}

function Normalize-RegistryPath {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $null
  }
  return $Value.Trim().Trim('"')
}

function Read-ShortcutTarget {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  $shell = New-Object -ComObject WScript.Shell
  try {
    return $shell.CreateShortcut($Path).TargetPath
  } finally {
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
  }
}

$checks = @()

$displayName = Read-RegistryString -Hive CurrentUser -SubKey $uninstallKey -ValueName "DisplayName"
$publisherValue = Read-RegistryString -Hive CurrentUser -SubKey $uninstallKey -ValueName "Publisher"
$installLocationRaw = Read-RegistryString -Hive CurrentUser -SubKey $uninstallKey -ValueName "InstallLocation"
$uninstallString = Read-RegistryString -Hive CurrentUser -SubKey $uninstallKey -ValueName "UninstallString"
$installLocation = Normalize-RegistryPath $installLocationRaw

$checks += New-Check "uninstall-entry-exists" ($null -ne $displayName) "HKCU:\$uninstallKey"
$checks += New-Check "uninstall-display-name" ($displayName -eq $product) "DisplayName=$displayName"
$checks += New-Check "uninstall-publisher" ($publisherValue -eq $publisher) "Publisher=$publisherValue"
$checks += New-Check "uninstall-command" ($uninstallString -like "*uninstall.exe*") "UninstallString=$uninstallString"
$checks += New-Check "install-location-present" (-not [string]::IsNullOrWhiteSpace($installLocation)) "InstallLocation=$installLocation"

$manufacturerInstallLocation = Read-RegistryString -Hive CurrentUser -SubKey $manufacturerKey -ValueName ""
$checks += New-Check "manufacturer-install-location" (-not [string]::IsNullOrWhiteSpace($manufacturerInstallLocation)) "HKCU:\$manufacturerKey=$manufacturerInstallLocation"

if (-not [string]::IsNullOrWhiteSpace($installLocation)) {
  $desktopPath = Join-Path $installLocation $desktopExe
  $uninstallerPath = Join-Path $installLocation "uninstall.exe"
  $checks += New-Check "install-directory-exists" (Test-Path -LiteralPath $installLocation) $installLocation
  $checks += New-Check "desktop-exe-exists" (Test-Path -LiteralPath $desktopPath) $desktopPath
  $checks += New-Check "uninstaller-exists" (Test-Path -LiteralPath $uninstallerPath) $uninstallerPath

  if (Test-Path -LiteralPath $desktopPath) {
    $versionInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($desktopPath)
    $checks += New-Check "desktop-exe-product-name" ($versionInfo.ProductName -like "*Void*" -or $versionInfo.ProductName -like "*void*") "ProductName=$($versionInfo.ProductName)"
    $checks += New-Check "desktop-exe-company-name" ($versionInfo.CompanyName -like "*void*") "CompanyName=$($versionInfo.CompanyName)"
  }
}

$desktopTarget = Read-ShortcutTarget $desktopShortcut
$startMenuTarget = Read-ShortcutTarget $startMenuShortcut
$checks += New-Check "desktop-shortcut" ($desktopTarget -like "*\$desktopExe") "$desktopShortcut -> $desktopTarget"
$checks += New-Check "start-menu-shortcut" ($startMenuTarget -like "*\$desktopExe") "$startMenuShortcut -> $startMenuTarget"

$installerDir = "Void-Installer\src-tauri\target\release-fast"
$installerPath = Join-Path $installerDir $installerExe
if (Test-Path -LiteralPath $installerPath) {
  $installerInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($installerPath)
  $checks += New-Check "installer-product-name" ($installerInfo.ProductName -like "*void*") "ProductName=$($installerInfo.ProductName)"
  $checks += New-Check "installer-company-name" ($installerInfo.CompanyName -like "*void*") "CompanyName=$($installerInfo.CompanyName)"
} else {
  $checks += New-Check "installer-exe-exists" $false $installerPath
}

$checks | Format-Table -AutoSize

$failed = @($checks | Where-Object { -not $_.pass })
if ($Strict -and $failed.Count -gt 0) {
  Write-Error "Installed void surface verification failed: $($failed.Count) check(s) failed."
  exit 1
}

if ($failed.Count -gt 0) {
  Write-Output "Report-only mode: $($failed.Count) check(s) failed. Re-run with -Strict after a real install to make failures blocking."
} else {
  Write-Output "Installed void surface verification passed."
}
