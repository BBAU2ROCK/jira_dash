# GitHub 첫 연결: 저장소 생성 후 한 번만 실행
# 1) .github-repo.example 을 .github-repo 로 복사 후 URL 수정
# 2) Git 설치: https://git-scm.com/download/win
# 3) 이 스크립트 실행: npm run git:setup

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git이 설치되어 있지 않습니다. https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

$repoFile = Join-Path $root ".github-repo"
if (-not (Test-Path $repoFile)) {
    Write-Host ".github-repo 파일이 없습니다." -ForegroundColor Yellow
    Write-Host "1. .github-repo.example 을 .github-repo 로 복사하세요."
    Write-Host "2. .github-repo 안에 GitHub 저장소 URL을 한 줄에 넣으세요. (예: https://github.com/사용자명/01_jira_dash.git)"
    exit 1
}

$repoUrl = (Get-Content $repoFile -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($repoUrl) -or $repoUrl.StartsWith("#")) {
    Write-Host ".github-repo 에 URL이 없습니다. 주석(#)이 아닌 한 줄에 URL을 입력하세요." -ForegroundColor Yellow
    exit 1
}

Set-Location $root

if (-not (Test-Path (Join-Path $root ".git"))) {
    git init
    Write-Host "git init 완료." -ForegroundColor Green
}

$remotes = git remote 2>$null
if (-not $remotes) {
    git remote add origin $repoUrl
    Write-Host "origin 원격 저장소 추가: $repoUrl" -ForegroundColor Green
} else {
    git remote set-url origin $repoUrl
    Write-Host "origin URL 갱신: $repoUrl" -ForegroundColor Green
}

git add .
git status -s
$count = (git status -s 2>$null | Measure-Object -Line).Lines
if ($count -eq 0) {
    Write-Host "커밋할 변경이 없습니다. (이미 모두 커밋된 상태일 수 있음)" -ForegroundColor Gray
} else {
    git commit -m "chore: Jira Dashboard 소스 업로드 (v1.0.5)"
    git branch -M main
    git push -u origin main
    Write-Host "푸시 완료." -ForegroundColor Green
}
