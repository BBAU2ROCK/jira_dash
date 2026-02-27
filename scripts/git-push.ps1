# 수정 후 GitHub 반영: 변경사항 add → commit → push
# 사용: npm run git:push
# 또는: npm run git:push -- "커밋 메시지"

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git이 설치되어 있지 않습니다. https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

$repoFile = Join-Path $root ".github-repo"
if (-not (Test-Path $repoFile)) {
    Write-Host ".github-repo 가 없습니다. 먼저 npm run git:setup 을 실행하세요." -ForegroundColor Yellow
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
    exit 0
}

git commit -m $msg
git push
Write-Host "푸시 완료: $msg" -ForegroundColor Green
