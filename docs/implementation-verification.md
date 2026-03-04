# 구현 검증 보고서

## 검증 일자
최근 패치 적용 후 구현 상태 점검.

## 전체 기능 분석 요약

| 구분 | 기능 | 구현 상태 | 비고 |
|------|------|----------|------|
| **API** | 이슈/보드/상세/댓글/우선순위/필드/editmeta/첨부 URL | ✅ | jiraClient.ts 일원화, 프록시 경유 |
| **이슈 상세** | 설명(ADF)·**설명 내 이미지/미디어 표시**·우선순위·**난이도**(표시·편집)·생성일·첨부 목록·다운로드 | ✅ | 필드명 '난이도'로 id 자동 매핑, 우선순위/난이도 편집 가능 |
| **댓글** | 작성·수정·멘션(@)·여러 줄·에러 표시 | ✅ | 댓글 탭 전용, ADF/멘션 칩 |
| **설명 내 미디어** | **인라인 이미지 표시**·첨부 링크·링크 마크 | ✅ | renderDescriptionAdf, 설명 본문 내 이미지 노출, 프록시 URL |
| **빌드/타입** | tsc, lint | ✅ | 에러 없음 |
| **미구현** | 첨부 추가/삭제, 설명 본문 텍스트 편집 | — | 선택 개선 항목. |
| **에픽/할 일/하위 작업 신규 등록** | ❌ 미구현 | 등록 기능은 구현 전 상태로 롤백됨. 조회·수정(우선순위·난이도 등)만 가능. |

**설치 파일**: `npm run build` → electron-builder → Windows portable(`dist_electron`), NSIS 옵션(바탕화면/시작메뉴 바로가기). 버전은 `package.json`의 `version` 필드 기준.

## 검증 항목 및 결과

### 1. API 레이어 (`src/api/jiraClient.ts`)

| 항목 | 상태 | 비고 |
|------|------|------|
| `addComment(issueKey, body)` | ✅ | POST `/issue/{key}/comment`, body ADF |
| `updateComment(issueKey, commentId, body)` | ✅ | PUT `/issue/{key}/comment/{id}`, body ADF |
| `buildCommentAdf(segments)` | ✅ | 텍스트 `\n` → hardBreak, mention → ADF mention |
| `adfToSegments(body)` | ✅ | ADF doc → CommentSegment[] (수정 시 로드용) |
| `getPriorities()` | ✅ | GET `/priority` — 우선순위 목록 조회(이슈 상세 우선순위 편집용) |
| `getFields()` | ✅ | GET `/field` — 전체 필드 목록(id, name). 필드명 '난이도' → id 매핑용 |
| `getEditMeta(issueKey)` | ✅ | GET `/issue/{key}/editmeta` — 커스텀 필드 allowedValues(난이도 등) 조회 |
| ADF 타입 (AdfDoc, AdfParagraph, AdfText, AdfMention, AdfHardBreak) | ✅ | Jira REST v3 형식 |

### 2. 이슈 상세 댓글 UI (`src/components/issue-detail-drawer.tsx`)

| 항목 | 상태 | 비고 |
|------|------|------|
| 댓글 입력 영역 위치 | ✅ | 활동 탭 중 **댓글** 탭 선택 시에만 표시 |
| 여러 줄 입력 | ✅ | `<textarea>`, rows=3, min/max height, resize-y |
| 입력 박스 내 멘션 칩 | ✅ | 텍스트 + 멘션 칩 인라인, 같은 박스 내 |
| 멘션 추가 | ✅ | 입력 중 `@` 입력 시 사용자 검색 팝오버 |
| 멘션 수정/삭제 | ✅ | 칩 클릭 → 교체, X 버튼 → 삭제 |
| 등록/수정 반영 | ✅ | 입력 박스 우측 하단 체크(✓) 버튼, 새 댓글은 addComment, 수정은 updateComment |
| 댓글 클릭 → 수정 모드 | ✅ | 댓글 탭에서 댓글 카드 클릭 시 해당 댓글 내용 로드, editingCommentId 설정 |
| 에러 표시 | ✅ | 등록/수정 실패 시 동일 영역에 메시지 표시 |
| Debug 버튼/패널 | ✅ | 제거됨 |

### 3. 빌드 및 타입

| 항목 | 상태 |
|------|------|
| `npx tsc -b --noEmit` | ✅ 통과 |
| Lint (edited files) | ✅ 에러 없음 |

### 4. 이슈 상세 – 데모 형식 (체크리스트 §10.1 기준)

분석 문서 `docs/attachment-feature-analysis.md` §10.1 1단계(데모 형식) 구현·검증.

| 항목 | 상태 | 비고 |
|------|------|------|
| **API·타입** | | |
| JiraIssue.fields.attachment 타입 정의 | ✅ | id, filename, size?, mimeType?, created?, author?, content?, thumbnail? |
| getIssueDetails fields에 description, attachment 포함 | ✅ | params.fields에 이미 포함 |
| **UI – 주요 세부정보** | | |
| 설명(description) 섹션 | ✅ | ADF → React(**renderDescriptionAdf**). 설명 내 미디어(§8): id 매칭 + **파일명(alt) 폴백**(§8.6)으로 인라인 이미지/첨부 링크. **링크**: text 노드 link mark → `<a href>` (§8.6). href는 http(s)만 허용. 없을 때 "설명 없음" |
| 우선순위(priority) 필드 그리드 표시·편집 | ✅ | name 표시. **편집 가능**: 팝오버 셀렉트 → `updateIssue(priority: { id })` 로 Jira 반영 (§9). **배색**: 팝오버 배경/글자 대비 개선(§7.6)—bg-white, text-slate-900, 선택 시 bg-slate-200. |
| 난이도(difficulty) 필드 표시·편집 | ✅ | **필드명 '난이도'** 기준: getFields()로 필드 목록 조회 후 name === '난이도'인 필드 id 사용(없으면 JIRA_CONFIG.FIELDS.DIFFICULTY). getIssueDetails(key, difficultyFieldId)·getEditMeta로 조회, 값/옵션 정규화. **수정 가능**: 팝오버 셀렉트 → updateIssue로 Jira 반영. |
| 생성일(created) 필드 그리드 표시 | ✅ | yyyy.MM.dd HH:mm |
| 첨부파일 섹션 제목 "첨부파일 (n)" | ✅ | n=0일 때도 표시, 빈 상태 메시지 |
| 첨부 목록(파일명, 크기, 날짜, 작성자) | ✅ | **목록만 표시**, 다운로드 미제공. **횡(일렬) 배치**: flex-wrap으로 가로 나열, 칩 형태 |
| **다운로드·프록시** | | |
| 링크가 프록시 경유 URL만 사용 | ✅ | baseURL/attachment/content/{id} |
| 프록시 GET /attachment/content/:id → Jira 바이너리 | ✅ | electron/main.ts isBinary, arraybuffer |

### 5. 이슈 건수·통계 규칙 (filterLeafIssues)

| 규칙 | 적용 |
|------|------|
| 1. 할 일만 있는 경우 카운트 | 해당 이슈(부모, 하위 없음)를 건수에 포함 |
| 2. 하위 작업이 있는 경우 할 일 미포함 | 부모는 건수에서 제외, 하위 작업만 건수에 반영 |
| 3. 통계·KPI 동일 조건 | 전체 통계·담당자별 통계·KPI 성과 모두 leaf 이슈만 사용 |

**적용 구역**: `src/lib/jira-helpers.ts`의 `filterLeafIssues()`가 단일 기준. 대시보드 헤더 이슈 수·SP, 프로젝트 통계 다이얼로그(전체/담당자별·KPI), 이슈 리스트 검색 결과 건수에서 사용.

**사이드 이펙트**: 리스트/드로어에는 부모+하위 모두 표시(계층 유지). 건수·완료율·준수율·KPI 점수만 leaf 기준으로 계산되므로, “할 일만 있으면 1건, 하위가 있으면 하위 N건”으로 통일됨.

### 6. 에픽·할 일·하위 작업의 등록 및 수정 가능 여부

| 구분 | 등록(생성) | 수정 | 비고 |
|------|------------|------|------|
| **에픽** | ❌ 불가 | ⚠️ 제한적 | 등록 기능 미구현. 수정은 에픽 상세 편집 플로우 없음(에픽 선택 시 할 일/하위 목록만 표시). |
| **할 일(부모 이슈)** | ❌ 불가 | ✅ 가능 | 등록 기능 미구현. **수정**: 이슈 상세에서 우선순위·난이도 등 `updateIssue`. |
| **하위 작업(Subtask)** | ❌ 불가 | ✅ 가능 | 등록 기능 미구현. **수정**: 이슈 상세에서 우선순위·난이도 등 `updateIssue`. |

**API 현황** (`src/api/jiraClient.ts`):

- **조회**: `getEpics()`, `getIssuesForEpic(epicKey)` — 에픽 목록, 에픽별 할 일·하위 작업 조회.
- **수정**: `updateIssue(issueKey, fields)` — PUT `/issue/{key}`, 기존 이슈 필드만 수정. UI에서는 우선순위(priority)·난이도(커스텀 필드) 등에 사용.
- **생성(등록)**: 미구현 — createIssue·getCreateMeta·CreateIssueDialog 등은 롤백되어 제거됨.

### 7. 잠재 이슈 및 제한

- **수정 권한**: Jira에서 댓글 수정 권한이 없으면 API 403 → 에러 메시지로 처리됨.
- **수정 취소**: 수정 모드일 때 입력란 우측 하단 "취소" 버튼으로 수정 포기 후 새 댓글 모드로 복귀 가능. 다른 댓글 클릭 시 해당 댓글으로 전환.
- **전체 탭**: 전체 탭에서 댓글 아이템은 `onEditClick` 미전달로 클릭해도 수정 모드로 진입하지 않음. (댓글 탭에서만 수정 가능.)
- **이슈 상세**: 첨부 추가/삭제(§10.2)는 미구현.
- **건수 규칙**: 부모만 있고 하위가 0개인 이슈는 API상 `subtasks: []`로 오므로 leaf로 포함됨. 하위가 1개 이상이면 부모는 제외. **우선순위 편집**(§10.3) 및 **설명 내 미디어 표시**(§10.4)는 구현 완료. 설명 본문 *텍스트 편집*은 미구현(ADF 전송 필요).
- **에픽/할 일/하위 작업 등록**: 미구현(롤백됨). §6 참고.

## 결론

요구된 개발 사항은 구현되어 있으며, 타입/빌드 검증을 통과했습니다. 위 제한 사항은 선택 개선 사항으로 두고, 패치 내역은 `PATCH.md`에 반영했습니다.
