# 댓글 에디터 통합 스펙: 여러 줄 입력·멘션·수정 취소

> *`comment-mention-ui-spec.md` 및 `comment-edit-cancel-feature-analysis.md` 내용을 통합.*

## 1. 요구사항

| 항목 | 내용 |
|------|------|
| 여러 줄 입력 | 댓글 입력 박스에서 여러 줄 작성 가능 |
| 댓글 수정 | 작성한 댓글 클릭 시 수정 가능 상태로 전환 |
| 수정 반영 | 입력 박스 우측 하단 체크 표시 클릭 시 수정 반영 |
| 멘션(@) | 입력 중 `@` 입력 시 사용자 검색 팝오버, 선택 시 커서 위치에 멘션 칩 삽입 |
| 수정 취소 | 수정 모드 진입 후 X 버튼 클릭 시 수정 포기 및 새 댓글 작성 모드 복귀 |

---

## 2. 분석

### 2.1 여러 줄 입력

- **구현**: `<Input>` → `<textarea>` 로 변경, `min-height` / `rows` 로 높이 확보.
- **키 동작**: 여러 줄에서 Enter = 새 줄, 단일 제출 키는 별도 버튼(등록/체크)만 사용.
  - **선택**: Enter = 줄바꿈, **등록 버튼** 또는 **체크 버튼** 클릭 시에만 전송. (Shift+Enter/Enter 구분 없이 Enter는 항상 줄바꿈.)
- **ADF**: 문단 내 줄바꿈은 `hardBreak` 노드. `buildCommentAdf` 에서 텍스트 세그먼트의 `\n` 을 구분해 `text` + `hardBreak` + `text` … 로 생성.

### 2.2 댓글 클릭 → 수정 모드

- **동작**: 댓글(ActivityItem) 클릭 시 해당 댓글의 `body`(ADF)를 편집용 세그먼트로 변환해 상단 입력 박스에 넣고, “수정 모드”로 전환.
- **데이터**: ADF → 세그먼트 변환 함수 `adfToSegments(body)` 필요. `paragraph.content` 의 `text` / `mention` / `hardBreak` 를 순서대로 `CommentSegment[]` 로 변환 (mention 은 `accountId`, `displayName` 유지, hardBreak 는 `\n` 텍스트 세그먼트로).
- **상태**: `editingCommentId: string | null`. `null` 이면 새 댓글 작성, 값이 있으면 해당 댓글 수정 중.
- **수정 API**: Jira REST v3 `PUT /rest/api/3/issue/{issueIdOrKey}/comment/{id}` body `{ body: adfDoc }`.

### 2.3 체크 표시로 수정 반영

- **위치**: 입력 박스 **우측 하단** 에 체크 버튼.
- **의미**:  
  - 수정 모드: 체크 클릭 → `updateComment(issueKey, editingCommentId, adf)` 호출 후 성공 시 쿼리 무효화, `editingCommentId` 초기화, 입력 초기화.  
  - 작성 모드: 기존 “등록” 버튼과 동일하게 새 댓글 등록 (같은 체크를 공유하거나, 등록 버튼을 우측 하단으로 이동해 체크 아이콘으로 통일).

---

## 3. 사이드 이펙트 체크

| 구분 | 항목 | 영향 | 대응 |
|------|------|------|------|
| 키보드 | Enter 로 전송 여부 | 여러 줄에서는 Enter = 줄바꿈이 자연스러움 | 전송은 “등록/체크” 버튼만 사용. Enter 는 줄바꿈만. |
| ADF | 기존 단일 문단 가정 | 여러 줄은 문단 내 `hardBreak` 로 표현 | `buildCommentAdf` 에서 텍스트의 `\n` → `hardBreak` 삽입. |
| 수정 권한 | Jira 에서 댓글 수정 권한 | 권한 없으면 403 | API 실패 시 에러 메시지 표시, 수정 모드 유지. |
| 포커스/스크롤 | 수정 모드 진입 시 | 클릭한 댓글 대신 상단 입력란에 포커스 | 수정 시 입력 박스로 포커스 이동, 필요 시 스크롤하여 입력란 노출. |
| 취소 | 수정 취소 | 사용자가 수정 포기 시 | 수정 모드에서 “취소” 또는 입력란 비우고 blur 시 `editingCommentId` 초기화 등 (선택). |

---

---

## 4. 멘션(@) 기능 스펙

> *`comment-mention-ui-spec.md` 내용 흡수.*

### 4.1 에디터 방식: contentEditable 인라인 에디터

| 방안 | 설명 | 채택 |
|------|------|------|
| **contentEditable div** | 단일 편집 영역에 텍스트+멘션 노드 삽입 | **✅ 채택** |
| div + span/칩 + input | flex 컨테이너에 칩과 textarea 혼용 | 이전 방식, 중간 위치 삽입 불가 |

- `contentEditable` div 안에서 텍스트와 멘션 칩(`<span contenteditable="false">`)이 자유롭게 혼재.
- `@` 입력 → 커서 앞 텍스트 분석 → 멘션 팝오버 표시.
- 팝오버에서 사용자 선택 → 커서 위치에 멘션 칩 삽입 → 포커스 칩 뒤로 이동.
- Backspace/Delete로 칩 삭제 가능 (브라우저 기본 동작).
- 붙여넣기: 순수 텍스트만 허용 (`onPaste`에서 HTML 차단).

### 4.2 표시 위치

- 댓글 탭(`TabsContent value="comments"`) 안에서만 에디터 표시.
- 전체/기록/업무로그 탭에서는 미표시.

### 4.3 사이드 이펙트

| 구분 | 항목 | 대응 |
|------|------|------|
| 탭 전환 | 다른 탭 이동 시 입력 내용 유지 여부 | 컴포넌트 state 유지됨 (탭 이동 후 복귀 시 복원) |
| 포커스 | 멘션 선택 후 포커스 복원 | `onMouseDown` + `e.preventDefault()`로 에디터 포커스 유지 |
| 다중 멘션 | 동일 사용자 여러 번 멘션 | 제한 없음 |
| 에러 상태 | 등록 실패 시 입력 내용 유지 | mutation 실패 시 에디터 초기화하지 않음 |

### 4.4 멘션 관련 구현 체크리스트

- [x] `contentEditable` div 기반 에디터 (`editorRef`)
- [x] `@` 입력 시 커서 앞 텍스트 분석 → 팝오버 오픈, `savedMentionRange` 저장
- [x] 팝오버에서 사용자 선택 시 `@검색어` 삭제 후 멘션 칩 삽입 (커서 위치)
- [x] `segmentsToHtml()`: 기존 댓글 수정 시 ADF → HTML 변환 후 에디터에 로드
- [x] `extractSegmentsFromEditor()`: 제출 시 DOM → `CommentSegment[]` 추출
- [x] `onPaste`: 순수 텍스트만 허용 (HTML 차단)
- [x] 멘션 칩: `inline-flex`, `bg-blue-100`, `text-[10px]`, `contenteditable="false"`
- [x] `data-mention-id`, `data-mention-name` 속성으로 ADF 변환 시 accountId·displayName 추출

---

## 5. 수정 취소 기능 스펙

> *`comment-edit-cancel-feature-analysis.md` 내용 흡수.*

### 5.1 취소 시 동작

1. `editingCommentId` → `null` (수정 모드 해제)
2. 에디터 내용 초기화 (`editorRef.current.innerHTML = ''`)
3. `editorHasContent` → `false`
4. 팝오버 닫기 (`setMentionPopoverOpen(false)`)
5. **API 호출 없음**: 로컬 상태만 초기화

### 5.2 UI

- **위치**: 입력 박스 우측 하단, 체크(✓) 버튼 왼쪽
- **표시 조건**: `editingCommentId !== null` 일 때만 노출
- **아이콘**: `<X className="h-4 w-4" />` (lucide-react)

### 5.3 구현 체크리스트

- [x] 취소 버튼: `editingCommentId` 일 때만 노출
- [x] 클릭 시 `setEditingCommentId(null)`, `clearEditor()` 호출
- [x] `clearEditor()` 헬퍼: 에디터 innerHTML 초기화 + 관련 state 일괄 리셋
- [x] 수정 반영 성공 시에도 동일한 `clearEditor()` 재사용

---

## 6. 구현 체크리스트 (전체)

- [x] `buildCommentAdf`: 텍스트 세그먼트 내 `\n` → `hardBreak` 로 ADF 생성.
- [x] `adfToSegments(body)`: ADF doc → `CommentSegment[]` (mention, hardBreak → `\n`).
- [x] `jiraApi.updateComment(issueKey, commentId, body)` 추가.
- [x] 댓글 입력: `contentEditable` div, Enter = 줄바꿈, 전송은 체크 버튼만.
- [x] 입력 박스 우측 하단에 체크(✓) 버튼 (등록/수정 공통).
- [x] 댓글 클릭 시 `editingCommentId` 설정, `segmentsToHtml(adfToSegments(body))` 로 에디터 채움.
- [x] 체크 클릭 시: `editingCommentId` 있으면 `updateComment`, 없으면 `addComment`; 성공 시 무효화 및 `clearEditor()`.
- [x] 수정 모드 취소(X 버튼): `editingCommentId`·에디터 일괄 초기화.
- [x] `@` 멘션: 커서 위치에 칩 삽입, 포커스 유지, 팝오버 흰색 배경·컴팩트 크기.
