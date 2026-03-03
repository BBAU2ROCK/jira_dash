# 프로젝트 내 불필요·정리 가능 파일 목록

프로젝트 루트 및 하위를 기준으로, **삭제·정리해도 되는 파일/폴더**와 **선택적으로 정리할 수 있는 항목**을 정리했습니다.

---

## 1. 삭제해도 되는 파일 (즉시 정리 가능)

| 경로 | 설명 | 비고 |
|------|------|------|
| **proxy.log** | 프록시 서버(`proxy-server.cjs`) 실행 시 생성되는 로그 파일. | `.gitignore`에 포함. 삭제 시 다음 `npm run start` 등으로 프록시 실행 시 다시 생성됨. |
| **dist/** | Vite 빌드 결과물(웹 클라이언트). | `npm run build` 시 재생성. Git 미추적. |
| **dist-electron/** | Vite가 생성하는 Electron 메인/프리로드 번들. | `npm run build` 시 재생성. Git 미추적. |
| **dist_electron/** | electron-builder 패키징 결과(설치 파일, win-unpacked 등). | `npm run build` 시 재생성. Git 미추적. 기존 설치 exe를 보관하려면 필요한 것만 백업 후 폴더 삭제. |

**실행 예 (PowerShell, 프로젝트 루트)**  
- 로그만 삭제: `Remove-Item -Force proxy.log -ErrorAction SilentlyContinue`  
- 빌드 산출물 전체 삭제: `Remove-Item -Recurse -Force dist, dist-electron, dist_electron -ErrorAction SilentlyContinue`

---

## 2. 빌드 산출물 폴더 설명 (참고)

| 폴더 | 생성 주체 | 용도 |
|------|-----------|------|
| **dist** | Vite | 웹 클라이언트 정적 파일 (index.html, JS, CSS). Electron 앱이 로드하는 리소스. |
| **dist-electron** | vite-plugin-electron | Electron 메인 프로세스·프리로드 스크립트 (main.js, preload.mjs). |
| **dist_electron** | electron-builder | 최종 패키징 출력. Windows: portable exe, NSIS 설치 파일, win-unpacked. |

세 폴더 모두 **재빌드 시 다시 만들어지므로** 디스크 정리 목적이라면 삭제 가능합니다. (보관 중인 설치 파일이 있다면 필요한 exe 등만 옮긴 뒤 삭제.)

---

## 3. 선택적 정리 (팀 판단)

### 3.1 문서(docs/)

| 파일 | 내용 | 정리 권장 |
|------|------|-----------|
| **development-analysis-and-patch.md** | 개발/패치 분석. | 이력 참고용 유지 권장. |
| **implementation-verification.md** | 구현 검증. | 기능 검증 참고용 유지 권장. |
| **attachment-feature-analysis.md** | 첨부 기능 분석. | 스펙 참고용. |
| **comment-mention-ui-spec.md**, **comment-multiline-edit-spec.md** | 댓글/멘션/다중행 스펙. | 스펙 유지 권장. |
| **worklog-parent-only-stats-analysis.md**, **mac-installer-build-analysis.md** | 업무로그(할 일 전용)·Mac 빌드 분석. | 최근 분석이므로 유지 권장. |
| **github-push-guide.md** | GitHub 푸시 가이드. | 사용 중이면 유지. |

**삭제 완료(과거 정리)**: `project-cleanup-summary.md`, `jql-epic-subtasks-only.md`, `jql-parentEpic-analysis.md`, `stats-priority-summary-analysis.md`, `epic-issues-display-analysis.md` — 소스/다른 문서 참조 없음 확인 후 삭제함.

**정리 시**: 더 이상 참고하지 않는 분석/스펙만 선택적으로 `docs/archive/` 등으로 옮기거나 삭제.

### 3.2 루트 파일

| 파일 | 내용 | 정리 권장 |
|------|------|-----------|
| **PATCH.md** | 버전별 패치/릴리스 노트. | 릴리스 이력으로 유지 권장. `docs/` 로 옮기려면 경로만 정리. |

---

## 4. 삭제하면 안 되는 항목

| 경로 | 비고 |
|------|------|
| **.github-repo** | Git 무시됨. 로컬용 GitHub 저장소 URL. 삭제 시 `git-push` 등에서 사용 불가. |
| **.github-repo.example** | 예시 템플릿. 새 클론 시 참고용으로 유지. |
| **build/** | `icon.ico`, `icon.png` — 빌드·패키징에 사용. 삭제 시 아이콘 빌드 실패. |
| **node_modules/** | 의존성. `npm install`로 재설치 가능하지만, 삭제 시 개발/빌드 불가. |
| **public/** | Vite 정적 자산. `vite.svg` 등 앱에서 참조. |
| **scripts/** | clean, git-setup, git-push, png-to-ico 등 빌드/배포에 사용. |

---

## 5. 요약 체크리스트

- **즉시 삭제 가능**: `proxy.log`, `dist/`, `dist-electron/`, `dist_electron/` (필요한 설치 파일만 백업 후)
- **선택 정리**: `docs/` 내 참고 완료된 분석 문서 아카이브·삭제(일부 삭제 완료), `PATCH.md` 위치 조정
- **유지**: `build/`, `public/`, `scripts/`, `.github-repo.example`, 소스 및 설정 파일

이 목록은 현재 프로젝트 구조 기준입니다. 빌드/배포 스크립트 변경 시 해당 경로가 스크립트에서 참조되는지 확인한 뒤 정리하세요.
