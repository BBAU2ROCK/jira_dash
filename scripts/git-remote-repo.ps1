# 공통: 로컬에 둔 원격 저장소 URL 파일 경로 반환 (.gitlab-repo 우선, 다음 .github-repo)
function Get-RemoteRepoFile {
    param([Parameter(Mandatory)][string]$Root)
    $gitlab = Join-Path $Root '.gitlab-repo'
    $github = Join-Path $Root '.github-repo'
    if (Test-Path $gitlab) { return $gitlab }
    if (Test-Path $github) { return $github }
    return $null
}

function Read-RemoteRepoUrl {
    param([Parameter(Mandatory)][string]$Root)
    $f = Get-RemoteRepoFile -Root $Root
    if (-not $f) { return $null }
    foreach ($line in Get-Content $f -Encoding UTF8) {
        $t = $line.Trim()
        if ($t.Length -eq 0) { continue }
        if ($t.StartsWith('#')) { continue }
        return $t
    }
    return $null
}
