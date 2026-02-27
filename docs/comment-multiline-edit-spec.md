# 댓글 여러 줄 입력 및 수정 기능: 분석·사이드이펙트·체크리스트

## 1. 요구사항

| 항목 | 내용 |
|------|------|
| 여러 줄 입력 | 댓글 입력 박스에서 여러 줄 작성 가능 |
| 댓글 수정 | 작성한 댓글 클릭 시 수정 가능 상태로 전환 |
| 수정 반영 | 입력 박스 우측 하단 체크 표시 클릭 시 수정 반영 |

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

## 4. 구현 체크리스트

- [x] `buildCommentAdf`: 텍스트 세그먼트 내 `\n` → `hardBreak` 로 ADF 생성.
- [x] `adfToSegments(body)`: ADF doc → `CommentSegment[]` (mention, hardBreak → `\n`).
- [x] `jiraApi.updateComment(issueKey, commentId, body)` 추가.
- [x] 댓글 입력: `<Input>` → `<textarea>`, Enter = 줄바꿈, 전송은 체크 버튼만.
- [x] 입력 박스 우측 하단에 체크 버튼 (등록/수정 공통).
- [x] 댓글 클릭 시 `editingCommentId` 설정, `adfToSegments(comment.body)` 로 입력란 채움.
- [x] 체크 클릭 시: `editingCommentId` 있으면 `updateComment`, 없으면 `addComment`; 성공 시 무효화 및 초기화.
- [ ] 수정 모드 취소 (선택): 취소 버튼 또는 빈 영역 클릭 시 `editingCommentId` 초기화.
