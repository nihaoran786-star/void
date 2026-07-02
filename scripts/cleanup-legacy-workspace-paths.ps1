param(
  [switch]$Apply,
  [string]$DocumentsRoot = ([Environment]::GetFolderPath("MyDocuments")),
  [string]$ArchiveRoot = (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "void-legacy-workspace-archive")
)

$ErrorActionPreference = "Stop"

$legacyLower = "bit" + "fun"
$repoRoot = (Resolve-Path ".").Path

function New-Action {
  param(
    [string]$Path,
    [string]$Kind,
    [string]$Status,
    [string]$Action,
    [string]$Detail = ""
  )

  [pscustomobject]@{
    path = $Path
    kind = $Kind
    status = $Status
    action = $Action
    detail = $Detail
  }
}

function Invoke-Git {
  param(
    [string]$WorkingDirectory,
    [string[]]$Arguments
  )

  $output = & git -C $WorkingDirectory @Arguments 2>&1
  [pscustomobject]@{
    exitCode = $LASTEXITCODE
    output = ($output | Out-String).Trim()
  }
}

function Get-WorktreePaths {
  $result = Invoke-Git -WorkingDirectory $repoRoot -Arguments @("worktree", "list", "--porcelain")
  if ($result.exitCode -ne 0) {
    return @{}
  }

  $paths = @{}
  foreach ($line in ($result.output -split "`r?`n")) {
    if ($line.StartsWith("worktree ")) {
      $path = $line.Substring("worktree ".Length)
      $full = [System.IO.Path]::GetFullPath($path)
      $paths[$full.ToLowerInvariant()] = $full
    }
  }
  return $paths
}

function Test-PathIsCurrentRepo {
  param([string]$Path)
  return [System.IO.Path]::GetFullPath($Path).TrimEnd('\') -ieq $repoRoot.TrimEnd('\')
}

function Get-DirectoryStatus {
  param(
    [string]$Path,
    [hashtable]$WorktreePaths
  )

  $full = [System.IO.Path]::GetFullPath($Path)
  $key = $full.ToLowerInvariant()
  $isWorktree = $WorktreePaths.ContainsKey($key)

  if (Test-PathIsCurrentRepo -Path $full) {
    return New-Action -Path $full -Kind "git-worktree" -Status "blocked" -Action "manual" -Detail "current active repository path"
  }

  if ($isWorktree) {
    $gitDir = Invoke-Git -WorkingDirectory $full -Arguments @("rev-parse", "--git-dir")
    $gitCommonDir = Invoke-Git -WorkingDirectory $full -Arguments @("rev-parse", "--git-common-dir")
    if ($gitDir.exitCode -ne 0 -or $gitCommonDir.exitCode -ne 0) {
      return New-Action -Path $full -Kind "git-worktree" -Status "blocked" -Action "manual" -Detail "could not inspect git directory layout"
    }
    $gitDirPath = [System.IO.Path]::GetFullPath((Join-Path $full $gitDir.output))
    $gitCommonDirPath = [System.IO.Path]::GetFullPath((Join-Path $full $gitCommonDir.output))
    if ($gitDirPath.TrimEnd('\') -ieq $gitCommonDirPath.TrimEnd('\')) {
      return New-Action -Path $full -Kind "git-main-worktree" -Status "blocked" -Action "manual" -Detail "main git working tree cannot be removed with git worktree remove"
    }

    $status = Invoke-Git -WorkingDirectory $full -Arguments @("status", "--short")
    if ($status.exitCode -ne 0) {
      return New-Action -Path $full -Kind "git-worktree" -Status "blocked" -Action "manual" -Detail "could not read git status"
    }
    if (-not [string]::IsNullOrWhiteSpace($status.output)) {
      return New-Action -Path $full -Kind "git-worktree" -Status "blocked" -Action "manual" -Detail "worktree has local changes or untracked files"
    }
    return New-Action -Path $full -Kind "git-worktree" -Status "ready" -Action "remove-worktree" -Detail "clean git worktree"
  }

  if (Test-Path -LiteralPath (Join-Path $full ".git")) {
    return New-Action -Path $full -Kind "git-directory" -Status "blocked" -Action "manual" -Detail "git directory is not registered as a worktree"
  }

  return New-Action -Path $full -Kind "directory" -Status "ready" -Action "archive" -Detail "non-git directory"
}

function Ensure-ArchiveRoot {
  if (-not (Test-Path -LiteralPath $ArchiveRoot)) {
    New-Item -ItemType Directory -Path $ArchiveRoot | Out-Null
  }
}

function Get-ArchiveLeafName {
  param([string]$Path)

  $name = Split-Path -Path $Path -Leaf
  $pattern = [regex]::Escape($legacyLower)
  $sanitized = [regex]::Replace($name, $pattern, "legacy", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ([string]::IsNullOrWhiteSpace($sanitized)) {
    return "legacy-workspace"
  }
  return $sanitized
}

function Move-ToArchive {
  param([string]$Path)
  Ensure-ArchiveRoot
  $name = Get-ArchiveLeafName -Path $Path
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $destination = Join-Path $ArchiveRoot "$name-$stamp"
  Move-Item -LiteralPath $Path -Destination $destination
  return $destination
}

if (-not (Test-Path -LiteralPath $DocumentsRoot)) {
  Write-Error "Documents root not found: $DocumentsRoot"
  exit 1
}

$worktreePaths = Get-WorktreePaths
$candidates = @(
  Get-ChildItem -LiteralPath $DocumentsRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name.ToLowerInvariant().Contains($legacyLower.ToLowerInvariant()) }
)

if ($candidates.Count -eq 0) {
  Write-Output "No legacy-named workspace paths were found."
  exit 0
}

$actions = @($candidates | ForEach-Object { Get-DirectoryStatus -Path $_.FullName -WorktreePaths $worktreePaths })
$actions | Format-Table -AutoSize

if (-not $Apply) {
  Write-Output "Dry run. Re-run with -Apply to archive ready non-git directories and remove ready clean worktrees."
  exit 0
}

foreach ($action in $actions) {
  if ($action.status -ne "ready") {
    Write-Output "Skipped $($action.path): $($action.detail)"
    continue
  }

  if ($action.action -eq "remove-worktree") {
    $result = Invoke-Git -WorkingDirectory $repoRoot -Arguments @("worktree", "remove", $action.path)
    if ($result.exitCode -ne 0) {
      Write-Error "Failed to remove worktree $($action.path): $($result.output)"
    } else {
      Write-Output "Removed worktree: $($action.path)"
    }
    continue
  }

  if ($action.action -eq "archive") {
    $destination = Move-ToArchive -Path $action.path
    Write-Output "Archived directory: $($action.path) -> $destination"
  }
}
