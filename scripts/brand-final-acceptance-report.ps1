param(
  [switch]$Strict
)

$ErrorActionPreference = "Stop"

$legacyTitle = "Bit" + "Fun"
$legacyLower = "bit" + "fun"
$legacyOwner = "GC" + "Wing"
$legacyOpen = "open" + $legacyLower
$repoRoot = Resolve-Path "."
$documentsRoot = [Environment]::GetFolderPath("MyDocuments")
$workspaceArchiveRoot = Join-Path $documentsRoot "void-legacy-workspace-archive"

function New-Check {
  param(
    [string]$Name,
    [string]$Status,
    [string]$Detail = ""
  )

  [pscustomobject]@{
    name = $Name
    status = $Status
    detail = $Detail
  }
}

function Invoke-Capture {
  param(
    [scriptblock]$Script
  )

  $output = & $Script 2>&1
  [pscustomobject]@{
    exitCode = $LASTEXITCODE
    output = ($output | Out-String).Trim()
  }
}

$checks = @()

$brandAudit = Invoke-Capture { node scripts/brand-residue-audit.mjs --strict }
if ($brandAudit.exitCode -eq 0) {
  $checks += New-Check "tracked-brand-audit" "pass" "strict audit reported zero residue"
} else {
  $checks += New-Check "tracked-brand-audit" "fail" $brandAudit.output
}

$trackedPattern = "$legacyLower\|$legacyTitle\|$legacyOwner\|$legacyOpen"
$trackedGrep = Invoke-Capture { git grep -n -i $trackedPattern -- . ":!scripts/brand-residue-audit.mjs" }
if ($trackedGrep.exitCode -eq 1) {
  $checks += New-Check "tracked-content-grep" "pass" "no tracked legacy brand matches"
} elseif ($trackedGrep.exitCode -eq 0) {
  $checks += New-Check "tracked-content-grep" "fail" $trackedGrep.output
} else {
  $checks += New-Check "tracked-content-grep" "fail" "git grep failed: $($trackedGrep.output)"
}

$gitConfig = Invoke-Capture { git config --local --list --show-origin }
if ($gitConfig.exitCode -ne 0) {
  $checks += New-Check "local-git-config" "fail" $gitConfig.output
} elseif ($gitConfig.output -match $trackedPattern) {
  $matches = @(
    $gitConfig.output -split "`r?`n" |
      Where-Object { $_ -match $trackedPattern } |
      Select-Object -First 10
  )
  $checks += New-Check "local-git-config" "warn" ($matches -join "; ")
} else {
  $checks += New-Check "local-git-config" "pass" "local git config has no legacy brand references"
}

$cleanup = Invoke-Capture { powershell -NoProfile -ExecutionPolicy Bypass -File scripts\cleanup-legacy-brand-remnants.ps1 }
if ($cleanup.exitCode -eq 0 -and $cleanup.output -match "No legacy brand remnants were found") {
  $checks += New-Check "system-legacy-remnants" "pass" "cleanup dry run found no known system remnants"
} else {
  $checks += New-Check "system-legacy-remnants" "warn" $cleanup.output
}

$workspaceCleanup = Invoke-Capture { powershell -NoProfile -ExecutionPolicy Bypass -File scripts\cleanup-legacy-workspace-paths.ps1 }
if ($workspaceCleanup.exitCode -eq 0 -and $workspaceCleanup.output -match "No legacy-named workspace paths were found") {
  $checks += New-Check "workspace-cleanup-plan" "pass" "no legacy-named workspace paths detected"
} elseif ($workspaceCleanup.exitCode -eq 0) {
  $checks += New-Check "workspace-cleanup-plan" "warn" "legacy-named workspace paths remain; run cleanup-legacy-workspace-paths.ps1 for a safe dry run"
} else {
  $checks += New-Check "workspace-cleanup-plan" "fail" $workspaceCleanup.output
}

$installed = Invoke-Capture { powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-installed-void-surfaces.ps1 }
if ($installed.exitCode -eq 0 -and $installed.output -match "Installed void surface verification passed") {
  $checks += New-Check "installed-surfaces" "pass" "installed registry, shortcuts, install directory, and metadata verified"
} else {
  $checks += New-Check "installed-surfaces" "warn" "real install not fully verified; run verify-installed-void-surfaces.ps1 -Strict after GUI install"
}

$repoPathText = $repoRoot.Path.ToLowerInvariant()
if ($repoPathText.Contains($legacyLower.ToLowerInvariant())) {
  $checks += New-Check "active-workspace-path" "warn" "current path contains legacy brand text: $($repoRoot.Path)"
} else {
  $checks += New-Check "active-workspace-path" "pass" "current path is brand-clean: $($repoRoot.Path)"
}

$legacyDirs = @()
if (Test-Path -LiteralPath $documentsRoot) {
  $legacyDirs = @(
    Get-ChildItem -LiteralPath $documentsRoot -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name.ToLowerInvariant().Contains($legacyLower.ToLowerInvariant()) }
  )
}

if ($legacyDirs.Count -eq 0) {
  $checks += New-Check "external-workspace-paths" "pass" "no legacy-named directories found under Documents"
} else {
  $checks += New-Check "external-workspace-paths" "warn" (($legacyDirs | ForEach-Object { $_.FullName }) -join "; ")
}

$legacyArchivePaths = @()
if (Test-Path -LiteralPath $workspaceArchiveRoot) {
  $legacyArchivePaths = @(
    Get-ChildItem -LiteralPath $workspaceArchiveRoot -Recurse -Force -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName.ToLowerInvariant().Contains($legacyLower.ToLowerInvariant()) }
  )
}

if ($legacyArchivePaths.Count -eq 0) {
  $checks += New-Check "workspace-archive-paths" "pass" "no legacy-named paths found in workspace archive"
} else {
  $checks += New-Check "workspace-archive-paths" "warn" (($legacyArchivePaths | Select-Object -First 10 | ForEach-Object { $_.FullName }) -join "; ")
}

$status = Invoke-Capture { git status --short }
if ($status.exitCode -eq 0 -and [string]::IsNullOrWhiteSpace($status.output)) {
  $checks += New-Check "working-tree" "pass" "clean"
} elseif ($status.exitCode -eq 0) {
  $checks += New-Check "working-tree" "warn" $status.output
} else {
  $checks += New-Check "working-tree" "fail" $status.output
}

$checks | Format-Table -AutoSize

$blocking = @($checks | Where-Object { $_.status -ne "pass" })
if ($blocking.Count -eq 0) {
  Write-Output "Final brand acceptance report passed."
  exit 0
}

Write-Output "Final brand acceptance report has $($blocking.Count) non-passing check(s)."
if ($Strict) {
  exit 1
}
