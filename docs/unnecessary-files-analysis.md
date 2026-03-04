# 불필요 파일 삭제를 위한 프로젝트 분석

분석 일자: 프로젝트 구조 및 참조 관계 기준.

**삭제 완료 (검증 후)**  
아래 §1의 6개 파일 삭제 완료. `npx tsc -b --noEmit` 통과. `docs/implementation-verification.md`의 filterLeafIssues 적용 구역에서 StatisticsPanel 문구 제거함.

---

## 1. 삭제 권장 (미사용 소스·UI 컴포넌트) — §1 항목 삭제 완료

| 구분 | 경로 | 설명 | 참조 |
|------|------|------|------|
| **컴포넌트** | `src/components/statistics-panel.tsx` | 상태 분포·KPI 카드 패널. **어디에서도 import 되지 않음.** | App·Dashboard에서 사용 안 함. |
| **컴포넌트** | `src/components/issue-drawer.tsx` | 이슈 상세 드로어(use-jira 기반). **어디에서도 import 되지 않음.** | Dashboard는 `IssueDetailDrawer` 사용. |
| **훅** | `src/hooks/use-jira.ts` | `useIssueDetails`, `useIssueMutation`. **issue-drawer.tsx에서만 사용.** | issue-drawer 삭제 시 함께 미사용. |
| **UI** | `src/components/ui/overlay.tsx` | "SYNCING..." 펜듈럼 오버레이. **어디에서도 import 되지 않음.** | Dashboard는 인라인 오버레이 사용. |
| **UI** | `src/components/ui/avatar.tsx` | Radix Avatar. **어디에서도 import 되지 않음.** | 댓글/담당자 등은 `avatarUrls`로 `<img>` 직접 사용. |
| **에셋** | `src/assets/react.svg` | Vite 기본 React 로고. **코드에서 참조 없음.** | main.tsx·App 등에서 미사용. |

**삭제 시 주의**
- `issue-drawer.tsx` 삭제 시 `use-jira.ts`도 삭제 가능(다른 참조 없음).
- `avatar.tsx`, `overlay.tsx`는 shadcn/ui 스타일 공용 UI. 나중에 쓰일 수 있으면 유지해도 됨.

---

## 2. 삭제 가능 (빌드·실행 산출물, 로그)

| 경로 | 설명 | 비고 |
|------|------|------|
| `proxy.log` | proxy-server.cjs 실행 시 생성 로그. | `.gitignore` 포함. 삭제 시 재실행으로 다시 생성. |
| `dist/` | Vite 웹 빌드 결과. | `npm run build` 시 재생성. Git 미추적. |
| `dist-electron/` | Electron 메인·프리로드 번들. | 위와 동일. |
| `dist_electron/` | electron-builder 산출물(설치 exe 등). | 보관할 exe만 백업 후 삭제 가능. |

---

## 3. 선택 정리 (문서)

| 경로 | 내용 | 권장 |
|------|------|------|
| `docs/cleanup-candidate-files.md` | 기존 정리 후보 목록. | 이 문서로 통합·대체 가능. 삭제 또는 `docs/archive/` 이동. |
| `docs/stats-onhold-as-done-analysis.md` | 보류 건 완료 표시 분석. | 보류·취소 기능은 `stats-hold-cancel-feature-analysis.md`로 구현됨. 참고용으로 보관 또는 아카이브. |
| `docs/comment-edit-cancel-feature-analysis.md` | 댓글 수정 취소 분석. | 구현 완료. 참고용 유지 또는 아카이브. |
| `docs/worklog-parent-only-stats-analysis.md` | 업무로그(할 일 전용) 분석. | 참고용 유지. |
| `docs/mac-installer-build-analysis.md` | Mac 빌드 분석. | 참고용 유지. |
| `docs/development-analysis-and-patch.md` | 개발·패치 분석. | 이력 참고용 유지. |
| `docs/implementation-verification.md` | 구현 검증. | 유지 권장. |
| `docs/attachment-feature-analysis.md` | 첨부 기능 분석. | 스펙 참고용 유지. |
| `docs/comment-mention-ui-spec.md`, `docs/comment-multiline-edit-spec.md` | 댓글·멘션 스펙. | 유지 권장. |
| `docs/github-push-guide.md` | GitHub 푸시 가이드. | 사용 중이면 유지. |

---

## 4. 유지 (삭제 금지)

| 경로 | 비고 |
|------|------|
| `build/icon.ico`, `build/icon.png` | 빌드·패키징 아이콘. |
| `public/vite.svg` | index.html favicon 참조. |
| `scripts/*` | clean, git-setup, git-push, png-to-ico 등. |
| `.github-repo.example` | 저장소 URL 템플릿. |
| `vite.web.config.ts` | `npm run dev:web` 에서 사용. |
| 기타 `src/` 내 사용 중인 컴포넌트·api·config·pages` | 참조 관계 유지. |

---

## 5. 삭제 실행 순서 제안

1. **즉시 삭제 가능(미사용 소스)**  
   - `src/components/statistics-panel.tsx`  
   - `src/components/issue-drawer.tsx`  
   - `src/hooks/use-jira.ts`  
   - `src/components/ui/overlay.tsx`  
   - `src/components/ui/avatar.tsx`  
   - `src/assets/react.svg`  

2. **선택(UI 공용 라이브러리)**  
   - `avatar.tsx`, `overlay.tsx`는 추후 재사용 가능성이 있으면 남겨 둘 수 있음.

3. **로컬 정리(빌드·로그)**  
   - `proxy.log`  
   - `dist/`, `dist-electron/`, `dist_electron/` (필요한 exe만 백업 후)

4. **문서**  
   - 참고 완료된 분석 문서는 `docs/archive/` 로 옮기거나, `cleanup-candidate-files.md`를 이 문서로 대체한 뒤 기존 파일 삭제.

---

## 6. 요약

| 구분 | 개수 | 비고 |
|------|------|------|
| **미사용 소스** | 6개 | statistics-panel, issue-drawer, use-jira, ui/overlay, ui/avatar, assets/react.svg |
| **빌드·로그** | 4종 | proxy.log, dist, dist-electron, dist_electron |
| **문서 선택 정리** | 1~2개 | cleanup-candidate-files.md 통합·아카이브 등 |

삭제 후 `npx tsc -b --noEmit` 및 `npm run build`로 빌드가 정상 동작하는지 확인하는 것을 권장합니다.
