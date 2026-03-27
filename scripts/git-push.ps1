# 수정 후 원격 반영: 변경사항 add → commit → push
# 사용: npm run git:push
# 또는: npm run git:push -- "커밋 메시지"
# origin 에 푸시한 뒤, git remote 로 등록된 gitlab 이 있으면 동일 브랜치로 추가 푸시합니다.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'git-remote-repo.ps1')

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git이 설치되어 있지 않습니다. https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

$repoFile = Get-RemoteRepoFile -Root $root
if (-not $repoFile) {
    Write-Host ".gitlab-repo 또는 .github-repo 가 없습니다. npm run git:setup 을 먼저 실행하세요." -ForegroundColor Yellow
    exit 1
}

Set-Location $root

$msg = $args -join " "
if ([string]::IsNullOrWhiteSpace($msg)) {
    $msg = "chore: 소스 수정 반영"
}

git add .
$status = git status -s 2>$null
if (-not $status) {
    Write-Host "커밋할 변경이 없습니다." -ForegroundColor Gray
} else {
    git commit -m $msg
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
git push -u origin $branch
Write-Host "origin 푸시 완료 ($branch): $msg" -ForegroundColor Green

$remotes = @(git remote 2>$null)
if ($remotes -contains 'gitlab') {
    git push -u gitlab $branch
    Write-Host "gitlab 원격 푸시 완료 ($branch)." -ForegroundColor Green
}
