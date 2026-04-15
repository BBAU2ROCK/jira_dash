# 원격 저장소 첫 연결: 저장소 생성 후 한 번만 실행
# 1) .gitlab-repo.example 또는 .github-repo.example 을 복사해 URL 수정
#    - GitLab: .gitlab-repo.example → .gitlab-repo
#    - GitHub: .github-repo.example → .github-repo
# 2) Git 설치: https://git-scm.com/download/win
# 3) 이 스크립트 실행: npm run git:setup

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'git-remote-repo.ps1')

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git이 설치되어 있지 않습니다. https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

$repoFile = Get-RemoteRepoFile -Root $root
if (-not $repoFile) {
    Write-Host "원격 URL 파일이 없습니다." -ForegroundColor Yellow
    Write-Host "1. GitLab: .gitlab-repo.example 을 .gitlab-repo 로 복사 후 URL 입력"
    Write-Host "2. GitHub: .github-repo.example 을 .github-repo 로 복사 후 URL 입력"
    exit 1
}

$repoUrl = Read-RemoteRepoUrl -Root $root
if (-not $repoUrl) {
    Write-Host "$(Split-Path $repoFile -Leaf) 에 유효한 URL이 없습니다. 주석(#)이 아닌 줄에 HTTPS URL을 한 줄 이상 입력하세요." -ForegroundColor Yellow
    exit 1
}

$pkgPath = Join-Path $root 'package.json'
$appVersion = '1.0.0'
if (Test-Path $pkgPath) {
    try {
        $pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($pkg.version) { $appVersion = [string]$pkg.version }
    } catch { }
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
    git commit -m "chore: Jira Dashboard 소스 업로드 (v$appVersion)"
    git branch -M main
    git push -u origin main
    Write-Host "푸시 완료." -ForegroundColor Green
}
