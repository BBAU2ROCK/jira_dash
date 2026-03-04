# 이슈 상세 댓글 수정 취소 기능 구현 분석

## 1. 요구사항

- **기능**: 작성 댓글의 **수정을 취소**할 수 있도록 한다.
- **의미**: 수정 모드 진입 후, 사용자가 "수정 반영" 없이 편집을 포기하고 **새 댓글 작성 모드**로 되돌릴 수 있어야 한다.

---

## 2. 현재 구현 상태

### 2.1 댓글 수정 흐름

| 단계 | 동작 | 상태 |
|------|------|------|
| 1 | 댓글 탭에서 댓글 클릭 | `onEditClick` → `setEditingCommentId(c.id)`, `setCommentSegments(adfToSegments(c.body))`, `setCommentInputValue('')` |
| 2 | 입력란에 기존 댓글 내용 표시 | placeholder: "댓글 수정 중... (우측 하단 ✓ 클릭 시 반영)" |
| 3 | 체크(✓) 버튼 클릭 | `updateCommentMutation.mutate(...)` → 성공 시 `setEditingCommentId(null)`, 입력 초기화 |
| 4 | **취소** | **미구현** — 수정 포기 시 입력란을 비우거나 다른 댓글을 클릭해야 함. 전용 "취소" 버튼 없음. |

### 2.2 관련 코드 위치

| 항목 | 파일 | 위치 |
|------|------|------|
| 수정 모드 상태 | `issue-detail-drawer.tsx` | `editingCommentId` (281행) |
| 수정 반영 성공 시 초기화 | 동일 | `updateCommentMutation.onSuccess` (265–268행): `setEditingCommentId(null)`, `setCommentSegments([])`, `setCommentInputValue('')` |
| 입력 박스·체크 버튼 | 동일 | 737–818행 (댓글 입력 영역, 우측 하단 체크만 있음) |
| 댓글 클릭 → 수정 모드 | 동일 | `ActivityItem` `onEditClick` (911–915행) |

### 2.3 기존 문서 정리

- `docs/comment-multiline-edit-spec.md` §3: "수정 취소: 수정 모드에서 취소 버튼 또는 입력란 비우고 blur 시 `editingCommentId` 초기화 등 (선택)."
- §4 체크리스트: "수정 모드 취소 (선택): 취소 버튼 또는 빈 영역 클릭 시 `editingCommentId` 초기화." — **미체크**.
- `docs/implementation-verification.md` §7: "수정 취소: 수정 모드 진입 후 취소 버튼은 없음. …"

---

## 3. 구현 설계

### 3.1 취소 시 기대 동작

- 사용자가 **취소**를 선택하면:
  1. **수정 모드 해제**: `editingCommentId` → `null`
  2. **입력 초기화**: `commentSegments` → `[]`, `commentInputValue` → `''`
  3. **결과**: 상단 입력란은 빈 상태로 돌아가고, "댓글 입력..." placeholder가 보이며, 체크 버튼은 **새 댓글 등록** 모드로 동작.

- **API 호출 없음**: 취소는 로컬 상태만 되돌리며, 서버에 PUT 요청을 보내지 않는다.

### 3.2 UI 제안

- **취소 버튼**
  - **위치**: 입력 박스 **우측 하단**, 체크(✓) 버튼 **왼쪽** (또는 오른쪽에 취소, 왼쪽에 체크 — 팀 컨벤션에 따름).
  - **표시 조건**: `editingCommentId !== null` 일 때만 노출. (새 댓글 작성 모드에서는 취소 버튼 숨김.)
  - **레이블/아이콘**: "취소" 텍스트 또는 `X` 아이콘. `lucide-react`의 `X`는 이미 import 되어 있음.
  - **동작**: 클릭 시 `setEditingCommentId(null)`, `setCommentSegments([])`, `setCommentInputValue('')` 호출.

- **선택 사항**
  - **Blur 시 취소**: 입력란 포커스를 잃을 때 자동 취소 — 의도치 않은 포커스 이동으로 취소될 수 있어 권장하지 않음. 필요 시 옵션으로만 고려.
  - **빈 영역 클릭**: 댓글 목록이나 탭 등 다른 영역 클릭 시 취소 — 동일하게 실수 취소 가능성이 있어, **명시적 취소 버튼**을 1차로 구현하는 것이 안전함.

### 3.3 구체적 변경 위치

**파일**: `src/components/issue-detail-drawer.tsx`

- **추가할 UI**: 입력 박스 하단 `flex justify-end items-center` 영역(791–817행 근처)에서, **체크 버튼 앞**에 조건부 **취소 버튼** 추가.
  - 조건: `editingCommentId !== null`
  - 버튼: `variant="ghost"` 또는 `outline`, `size="sm"`, "취소" 또는 `<X />` 아이콘.
  - `onClick`:  
    `setEditingCommentId(null); setCommentSegments([]); setCommentInputValue('');`
  - `aria-label`: "수정 취소" 등.

- **초기화 로직 재사용**: 수정 반영 성공 시와 동일한 3줄(`setEditingCommentId(null)` + `setCommentSegments([])` + `setCommentInputValue('')`)이므로, 필요 시 `const resetCommentComposer = () => { setEditingCommentId(null); setCommentSegments([]); setCommentInputValue(''); }` 같은 헬퍼를 만들어 취소 버튼과 `updateCommentMutation.onSuccess`에서 공통으로 호출할 수 있음 (선택).

### 3.4 상태 정리

| 상태 | 취소 시 |
|------|--------|
| `editingCommentId` | `null` |
| `commentSegments` | `[]` |
| `commentInputValue` | `''` |
| `editingMentionIndex` | 변경 없음 (이미 닫혀 있음) 또는 `null` 로 초기화해도 무방 |
| `mentionPopoverOpen` | 변경 없음 또는 `false` (취소 시 팝오버가 열려 있다면 닫는 편이 자연스러울 수 있음) |

---

## 4. 사이드 이펙트

| 구분 | 내용 |
|------|------|
| **API** | 취소는 로컬만 동작하므로 API 호출·쿼리 무효화 없음. |
| **다른 댓글 클릭** | 현재: 다른 댓글 클릭 시 해당 댓글으로 `editingCommentId` 전환. 취소 버튼 추가 후에도 동작 유지. (기존 `onEditClick` 로직 변경 없음.) |
| **새 댓글 등록** | 취소 후 입력란 비움 → 등록 버튼 비활성(빈 입력) 상태. 기존과 동일. |
| **전체 탭** | 댓글 탭이 아닌 전체 탭에서는 댓글에 `onEditClick`이 없어 수정 모드 진입 자체가 없음. 영향 없음. |
| **키보드** | Esc 키로 취소를 넣을 경우, 포커스가 입력란에 있을 때 Esc → 취소 처리 추가 가능 (선택). |

---

## 5. 검증 포인트

- 수정 모드 진입 후 **취소 버튼** 클릭 → 입력란 비워지고 placeholder가 "댓글 입력..."으로 바뀜, 체크는 등록 모드로 동작.
- **수정 반영(✓)** 은 기존처럼 동작.
- **다른 댓글 클릭** 시 해당 댓글로 수정 대상만 바뀌는지 확인.
- 취소 버튼은 **수정 모드일 때만** 보이고, 새 댓글 모드에서는 보이지 않는지 확인.

---

## 6. 결론

- **구현 범위**: 이슈 상세 **댓글 탭** 입력 영역에, **수정 모드일 때만** 노출되는 **취소 버튼**을 추가하고, 클릭 시 `editingCommentId`·`commentSegments`·`commentInputValue` 를 초기화하면 요구사항을 충족한다.
- **선택**: Blur/빈 영역 클릭/Esc 취소, 또는 `resetCommentComposer` 헬퍼 도입은 팀 정책에 따라 추가하면 된다.
- 구현 후 `comment-multiline-edit-spec.md` §4의 "수정 모드 취소" 항목 체크 및 `implementation-verification.md` §7의 "수정 취소" 문구 업데이트를 권장한다.

---

## 7. 구현 완료 (검증)

- **issue-detail-drawer.tsx**: 댓글 입력 하단에 `editingCommentId`일 때만 "취소" 버튼 추가. 클릭 시 `setEditingCommentId(null)`, `setCommentSegments([])`, `setCommentInputValue('')`, `setMentionPopoverOpen(false)`, `setEditingMentionIndex(null)`.
- **문서**: comment-multiline-edit-spec.md §4 체크, implementation-verification.md §7 수정 취소 문구 반영.
- **검증**: `npx tsc -b --noEmit` 통과, 수정 파일 린트 에러 없음. (설치 파일 패치 미진행.)
