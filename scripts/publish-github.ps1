# Safe first-publish helper. Run only AFTER creating a repository on GitHub.
# Example: powershell -ExecutionPolicy Bypass -File scripts/publish-github.ps1
#        -RepoUrl https://github.com/toyhank/space-cadet-rust.git
param(
  [Parameter(Mandatory=$true)]
  [string]$RepoUrl
)
$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
if ($RepoUrl -notmatch '^https://github\.com/[^/]+/[^/]+(?:\.git)?$') {
  throw "Expected https://github.com/OWNER/REPO.git"
}
if (-not (Test-Path ".git")) {
  git init -b main
  if ($LASTEXITCODE -ne 0) { throw "git init failed" }
}
$paths = @(
  ".gitignore", ".github", "README.md", "DEPLOY.md", "VPX-WEB.md",
  "LICENSE", "Cargo.toml", "src",
  "package.json", "package-lock.json", "vpx.html", "vpx",
  "scripts", "tests"
)
git add -- $paths
if ($LASTEXITCODE -ne 0) { throw "git add failed" }
$staged = @(git diff --cached --name-only)
$forbidden = @($staged | Where-Object {
  $_ -match '^(?:dist/|assets/vpx-local/|node_modules/)' -or
  $_ -match '\.(?:vpx|glb|dat|bmp|png|7z)$'
})
if ($forbidden.Count -gt 0) {
  git reset -- $forbidden
  throw "Blocked possibly copyrighted or built assets: $($forbidden -join ', ')"
}
$remoteNames = @(git remote)
if ($remoteNames -contains "origin") {
  $existingRemote = @(git remote get-url origin)
  if ($existingRemote[0].TrimEnd('/') -ne $RepoUrl.TrimEnd('/')) {
    throw "Existing origin points to $existingRemote; refusing to replace it."
  }
} else {
  git remote add origin $RepoUrl
}
if ($staged.Count -gt 0) {
  git commit -m "feat: VPX Space Cadet web gameplay, local WASM import and Pages deployment"
  if ($LASTEXITCODE -ne 0) { throw "Commit failed: check git user.name/user.email." }
}
git branch -M main
git push -u origin main
if ($LASTEXITCODE -ne 0) {
  throw "Push failed: check repository existence, permissions and authentication."
}
Write-Host "Published source to $RepoUrl (no VPX assets or dist)."
