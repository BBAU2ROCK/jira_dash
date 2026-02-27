# jira_dash 프로젝트 정리 요약

## 프로젝트 구조 (유지)

| 경로 | 용도 |
|------|------|
| `src/` | React 앱 소스 |
| `electron/` | Electron 메인·프리로드 |
| `public/` | 정적 자산 (vite.svg 등) |
| `docs/` | 스펙·검증 문서 |
| `proxy-server.cjs` | 개발용 Jira CORS 프록시 |
| `vite.config.ts`, `vite.web.config.ts` | Vite 설정 |
| `package.json`, `tsconfig*.json` | 빌드·타입 설정 |

## 제거한 불필요 파일

| 파일 | 사유 |
|------|------|
| `proxy.log` | 프록시 실행 시 생성되는 로그. 재실행 시 다시 생성됨. |
| `test-jira.cjs` | Jira API 단발 테스트 스크립트. API 토큰 포함으로 보안 위험, 앱에서 미사용. |
| `JiraDashboard_Release.zip` | 예전 릴리스 압축. 최신 빌드는 `npm run build` 후 `dist_electron/` 사용. |

## .gitignore 보강

- `dist-electron` — Vite 플러그인으로 생성되는 Electron 빌드
- `dist_electron` — electron-builder 출력 (설치 파일, win-unpacked 등)
- `proxy.log` — 프록시 로그

## 빌드 산출물 (정리 후에도 생성됨)

- `npm run build` 시 생성: `dist/`, `dist-electron/`, `dist_electron/`
- 필요 시 수동 삭제: `Remove-Item -Recurse -Force dist, dist-electron, dist_electron`

## docs/ 문서

- `comment-mention-ui-spec.md` — 댓글·멘션 UI 스펙
- `comment-multiline-edit-spec.md` — 여러 줄·수정 스펙
- `implementation-verification.md` — 구현 검증

유지해 두었으며, 불필요하다고 판단되는 문서만 선택적으로 제거하면 됩니다.
