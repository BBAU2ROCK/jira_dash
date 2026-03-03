# 이슈 상세 세부정보·첨부파일 조회·수정 기능 분석

구현 전 검토용 문서입니다. **기능 구현은 하지 않았습니다.**

---

## 1. 요구사항 정리

| 구분 | 내용 |
|------|------|
| **조회** | 이슈 상세에서 Jira 이슈의 **주요 세부 정보**와 **첨부파일 목록(세부정보)** 를 가져와 표시. (Jira 이슈 상세 화면에 나오는 핵심 정보 전체를 포함) |
| **수정** | 이슈 수정 시 **첨부한 파일**까지 반영되어 Jira 해당 이슈에 **추가** 가능. (기존 첨부 삭제 필요 시 함께 고려) |
| **등록(생성)** | 에픽·할 일·하위 작업의 **신규 생성은 본 앱에서 미지원**임. 조회 및 기존 이슈 필드 수정만 가능. (`docs/implementation-verification.md` §6 참고) |

---

## 2. 이슈 상세 “주요 세부정보” – 현재 조회·표시 상태

### 2.1 현재 getIssueDetails로 가져오는 필드

`GET /issue/{issueKey}` 시 **fields** 에 포함되는 항목:

| 필드 | 설명 | 비고 |
|------|------|------|
| summary | 제목 | ✅ |
| status | 상태 | ✅ |
| assignee | 담당자 | ✅ |
| reporter | 보고자 | ✅ |
| priority | 우선순위 | ✅ |
| issuetype | 이슈 유형 | ✅ |
| comment | 댓글 목록 | ✅ (초과 시 별도 페이징 조회) |
| worklog | 업무 로그 | ✅ (초과 시 별도 페이징 조회) |
| customfield_11481 | 계획 시작일 | ✅ |
| customfield_11484 | 실제 시작일 | ✅ |
| customfield_11485 | 실제 완료일 | ✅ |
| duedate | 완료 예정일 | ✅ |
| created | 생성일 | ✅ |
| resolutiondate | 해결일(실제 완료일) | ✅ |
| description | 설명(본문) | ✅ |
| attachment | 첨부파일 메타 목록 | ✅ (요청만 함, 타입·UI 미정의) |

**expand:** `changelog` → 변경 이력 별도 조회 후 병합.

### 2.2 현재 이슈 상세 UI에 표시하는 항목

| 항목 | 표시 위치 | 비고 |
|------|-----------|------|
| 이슈 키, 제목(summary) | 헤더 | ✅ |
| 상태(status) | 헤더 배지·팝오버 | ✅ |
| 계획 시작일, 완료 예정일, 실제 시작일, 실제 완료일 | 필드 그리드 | ✅ |
| 담당자, 보고자 | 필드 그리드 | ✅ (편집 가능) |
| 댓글·변경 이력·업무 로그 | 활동 탭(전체/댓글/기록/업무로그) | ✅ |

### 2.3 가져오지만 화면에 미표시인 항목 (주요 세부정보 누락)

| 필드 | Jira 상세에서의 의미 | 구현 시 고려 |
|------|----------------------|--------------|
| **description** | 이슈 설명(본문). ADF 등 리치 텍스트. | 표시 시 ADF → HTML/텍스트 변환 필요(기존 adfToText 확장 또는 전용 렌더러). |
| **priority** | 우선순위 | 라벨/아이콘으로 표시 가능. |
| **created** | 이슈 생성일 | 필드 그리드 또는 헤더에 추가 가능. |
| **resolutiondate** | 해결일(실제 완료일) | 이미 customfield_11485(실제 완료일)와 중복·유사 개념일 수 있음. 프로젝트 설정에 따라 하나만 표시하거나 둘 다 노출. |
| **attachment** | 첨부파일 목록 | **현재 UI에 전혀 노출 안 됨.** 목록·다운로드·(선택) 미리보기 추가 필요. |

### 2.4 Jira 이슈 상세에 흔히 있으나 현재 요청하지 않는 필드

| 필드 | 설명 | 구현 시 필요 시 |
|------|------|------------------|
| labels | 라벨 | fields 에 `labels` 추가 요청 후 표시. |
| components | 컴포넌트 | 프로젝트별. |
| fixVersions / versions | 버전 | 프로젝트별. |
| parent | 부모 이슈(에픽 등) | 리스트/트리에서는 사용, 상세 단일 이슈에서는 선택. |
| customfield_10016 | 스토리 포인트 | JIRA_CONFIG 에 정의만 있고 상세 요청·표시 없음. |
| subtasks | 하위 작업 | 상세 단일 이슈에서는 필요 시 요청. |

→ **“주요 세부정보”** 륄 Jira와 맞추려면 최소한 **description, priority, created, attachment** 표시를 추가하고, 필요 시 **labels, resolutiondate** 등도 정리해 반영하는 것이 좋음.

---

## 3. 현재 코드 상태 (API·UI·프록시)

### 3.1 API

- **getIssueDetails(issueKey)**  
  - `GET /rest/api/3/issue/{issueKey}` 호출 시 **`fields` 파라미터에 `attachment` 포함**됨.  
  - 따라서 **이미 응답에 `issue.fields.attachment`(첨부 메타데이터 배열)이 포함**될 수 있음.
- **JiraIssue 타입**  
  - `fields`에 `[key: string]: any` 가 있어 `attachment` 필드는 타입상으로는 허용되나, **attachment 전용 타입(구조) 정의는 없음**.  
  - **description** 등 ADF 필드에 대한 공식 타입도 없음.
- **updateIssue(issueKey, fields)**  
  - `PUT /issue/{issueKey}` 로 **일반 필드만** 수정.  
  - Jira REST v3에서는 **첨부파일 추가/삭제는 이 API로 불가**하며, **별도 첨부 전용 API** 사용 필요.

### 3.2 UI

- **issue-detail-drawer**  
  - **description(설명 본문)** 표시 없음.  
  - **priority(우선순위), created(생성일)** 표시 없음.  
  - `details?.fields?.attachment` 를 **참조·표시하는 코드 없음**.  
  - 즉, **가져온 주요 세부정보 중 상당 부분이 화면에 나오지 않고, 첨부파일 목록도 노출되지 않음**.

### 3.3 프록시 (Electron main)

- **GET**  
  - `/attachment/content/`, `/avatar/` 경로는 **이미 바이너리(responseType: arraybuffer)** 로 처리 중.  
  - 첨부 **내용** 다운로드/미리보기 시 동일 경로 사용 가능.
- **POST**  
  - 현재 `data: req.body`, JSON 위주 가정.  
  - **첨부 추가**는 `multipart/form-data` + `X-Atlassian-Token: no-check` 필요 → **프록시에서 multipart 전달 및 헤더 전달** 여부 확인·보완 필요.

---

## 3. Jira REST API v3 – 첨부파일 관련

### 3.1 조회 (이미 사용 중인 방식)

- **이슈 조회 시 첨부 메타데이터**  
  - `GET /rest/api/3/issue/{issueIdOrKey}` 에 **`fields=...,attachment`** 포함 시  
  - 응답 `issue.fields.attachment` 에 **배열**로 들어옴.
- **단일 첨부 메타데이터**  
  - `GET /rest/api/3/attachment/{id}`  
  - 필요 시 개별 첨부 상세 조회용.
- **첨부 파일 내용(다운로드)**  
  - `GET /rest/api/3/attachment/content/{id}`  
  - 바이너리. 현재 프록시의 binary 처리로 호출 가능.
- **썸네일**  
  - `GET /rest/api/3/attachment/thumbnail/{id}`  
  - 이미지 미리보기 등에 활용 가능.

**attachment 배열 요소 예시 (메타데이터):**

- `id`, `filename`, `size`, `mimeType`, `created`
- `author` (accountId, displayName, avatarUrls 등)
- `content` (파일 다운로드 URL)
- `thumbnail` (썸네일 URL, 있을 경우)

### 3.2 추가 (수정 시 “첨부한 파일” 반영)

- **엔드포인트:** `POST /rest/api/3/issue/{issueIdOrKey}/attachments`
- **Content-Type:** `multipart/form-data`
- **헤더:** `X-Atlassian-Token: no-check` 필수 (문서 명시)
- **본문:** form 필드 이름 `file`. 한 번에 여러 파일 시 `file` 을 여러 개 보내는 방식 지원 (일반적).
- **인증:** 기존과 동일 (Basic 등).  
→ **이슈 “수정” 시 새로 첨부한 파일은 이 API로 추가**하면 됨.

### 3.3 삭제

- **엔드포인트:** `DELETE /rest/api/3/attachment/{id}`
- **권한:** 프로젝트 권한 “Delete own attachments” / “Delete all attachments” 등.
→ 수정 시 “기존 첨부 삭제”까지 지원하려면 이 API 호출 필요.

---

## 4. 구현 방향 요약 (분석만, 미구현)

### 4.1 조회 (주요 세부정보 + 첨부파일)

1. **주요 세부정보 표시 보완**  
   - **description(설명):** 전용 섹션 추가. ADF이면 `adfToText` 또는 간단 ADF 렌더링으로 읽기 전용 표시.  
   - **priority(우선순위), created(생성일):** 필드 그리드 또는 헤더 근처에 표시.  
   - (선택) resolutiondate 등 이미 가져온 필드 중 Jira 상세와 맞춰 표시할 항목 정리.
2. **타입**  
   - `JiraIssue.fields` 에 **attachment** 타입 정의 추가:  
     `attachment?: Array<{ id: string; filename: string; size: number; mimeType?: string; created?: string; author?: { displayName: string }; content?: string; thumbnail?: string }>` 등.
3. **getIssueDetails**  
   - 이미 `fields` 에 `attachment` 포함되어 있으므로 **추가 요청 변경 없이** 응답만 타입/실제 데이터로 사용.
4. **이슈 상세 UI**  
   - **첨부파일:** `details?.fields?.attachment` 를 리스트로 렌더링.  
   - 각 항목: 파일명, 크기, 올린 날짜/작성자, 링크(다운로드: `/api/attachment/content/{id}` 등 프록시 경유).
5. **다운로드/미리보기**  
   - `content` URL은 Jira 절대 URL이므로, 앱에서는 **반드시** `/api/attachment/content/{id}` 처럼 프록시 경유 URL만 사용. 현재 프록시 binary 처리로 전달 가능.

### 4.2 수정(첨부 추가·삭제)

1. **추가**  
   - UI: 파일 선택(input file) → “첨부 추가” 등으로 **선택한 파일**을 `POST /rest/api/3/issue/{issueKey}/attachments` 로 **multipart/form-data** 전송.  
   - 프록시: `multipart/form-data` 수신 시 **body와 Content-Type을 그대로** Jira로 전달하고, 요청 헤더에 **X-Atlassian-Token: no-check** 추가.
2. **삭제**  
   - 목록 각 항목에 “삭제” 버튼 → `DELETE /rest/api/3/attachment/{id}` 호출.  
   - 성공 시 이슈 상세 다시 조회하거나, 클라이언트에서 해당 id만 목록에서 제거.
3. **이슈 “수정”과의 관계**  
   - 일반 필드 수정: 기존처럼 **updateIssue(issueKey, fields)**.  
   - 첨부만 추가/삭제: 위 **첨부 추가 API / 첨부 삭제 API** 륄 별도 호출.  
   - “저장” 한 번에 필드+첨부 모두 반영하려면: 필드 PUT → (추가할 파일들) POST attachments → (삭제할 id들) DELETE attachment 순서로 호출하면 됨.

---

## 5. 구현 전 체크리스트 (사전 체크)

### 5.1 조회

- [ ] **JiraIssue 타입**에 `fields.attachment` 배열 타입 정의 추가.
- [ ] **getIssueDetails** 응답에 `attachment` 가 실제로 오는지(필드 이름·구조) Jira 응답으로 한 번 확인.
- [ ] 이슈 상세 UI에 **첨부파일 섹션** 추가 (제목, 목록, 파일명/크기/날짜/작성자).
- [ ] 다운로드 링크: **프록시 경유 URL** (`/api/attachment/content/{id}` 또는 동일 규칙) 사용 시 **로그인/쿠키 없이** 프록시의 Authorization으로 접근 가능한지 확인.
- [ ] (선택) 이미지 등은 **thumbnail** 또는 **content** 로 미리보기 링크 제공.

### 5.2 첨부 추가

- [ ] **jiraClient** (또는 전용 모듈)에 **addAttachments(issueKey, files: File[])** 같은 함수 추가.  
  - 내부: `FormData` 에 `file` 로 파일 append → `POST /issue/{issueKey}/attachments`, `Content-Type: multipart/form-data` (브라우저가 자동 설정), **헤더에 X-Atlassian-Token: no-check** 추가.
- [ ] **Electron 프록시**에서 **multipart 요청** 수신 시:  
  - `req.body` 륄 그대로 쓰지 말고, **raw body** 또는 **multipart 파싱 후 재조립**이 필요할 수 있음.  
  - Express의 `express.json()` 만 쓰면 multipart body가 비어 있을 수 있으므로, **multipart 처리 미들웨어** 또는 **프록시에서 stream/raw forward** 검토.
- [ ] Jira **첨부 크기 제한** (예: attachment/meta 의 `uploadLimit`) 확인 후, UI에서 파일 크기 제한 또는 안내.

### 5.3 첨부 삭제

- [ ] **jiraClient**에 **deleteAttachment(attachmentId)** 추가.  
  - `DELETE /attachment/{id}`.
- [ ] UI에서 삭제 시 권한(403) 처리 및 메시지 표시.

### 5.4 수정 플로우 통합

- [ ] 이슈 상세 “수정” 시:  
  - 기존 필드 수정 → **updateIssue**.  
  - 새 파일 선택 후 “첨부 추가” → **addAttachments**.  
  - “첨부 삭제” 선택 시 → **deleteAttachment**.  
  - 성공 후 **issueDetails 쿼리 무효화**로 목록/상세 갱신.

---

## 6. 사이드 이펙트 분석

| 구분 | 항목 | 영향 | 대응 |
|------|------|------|------|
| **프록시** | POST multipart | 현재 `express.json()` + `req.body` 는 multipart 본문을 채우지 않음. 첨부 추가 POST가 실패할 수 있음. | multipart 요청은 **별도 처리**: `express.raw()` 또는 `multer` 등으로 처리 후 Jira로 전송, 또는 클라이언트에서 **프록시를 거치지 않고 직접 Jira URL** 호출은 CORS 문제로 어려우므로, **프록시에서 multipart 전달 로직 추가** 필요. |
| **프록시** | X-Atlassian-Token | Jira 첨부 추가는 **X-Atlassian-Token: no-check** 필수. | 프록시에서 `POST .../attachments` 요청 시 **해당 헤더 추가**. |
| **권한** | 삭제 403 | “Delete own attachments” 등 권한 없으면 403. | 403 시 에러 메시지 표시, 삭제 버튼 비활성화 또는 권한별 노출 고려. |
| **용량** | Jira uploadLimit | 인스턴스별 첨부 최대 크기 제한 있음. | GET /attachment/meta 로 제한값 조회 후, UI에서 업로드 전 검사 또는 안내. |
| **표시** | content URL | `content` 가 절대 URL(예: https://okestro.atlassian.net/...) 이면, 그대로 쓰면 프록시를 타지 않아 인증 실패 가능. | 링크는 **상대 경로 `/api/attachment/content/{id}`** 로 만들어 프록시 경유하도록 함. |
| **CORS** | 브라우저 직접 호출 | 웹 앱이 Jira에 직접 multipart POST 시 CORS 제한. | 반드시 **현재처럼 프록시 경유**하여 업로드. |
| **Electron** | 파일 선택 | Electron 렌더러에서 `<input type="file">` 또는 dialog로 로컬 파일 선택 가능. | 기존 패턴 유지. |

---

## 7. 구현 시 문제가 되는 부분

아래는 구현 단계에서 **장애 요인**이 되거나 **주의하지 않으면 버그·불일치**가 나기 쉬운 지점입니다.

### 7.1 조회·표시

| 문제 | 설명 | 대응 방향 |
|------|------|-----------|
| **description 미표시** | 설명(본문)을 가져오지만 UI에 안 보임. Jira 상세의 “주요 세부정보”에 포함되므로 누락 시 요구사항 미충족. | description 전용 섹션 추가. ADF이면 기존 `adfToText` 또는 간단한 ADF→HTML/텍스트 렌더링 적용. |
| **description이 ADF** | Jira v3는 description을 ADF로 반환. 단순 문자열이 아님. | adfToText로 평문만 보여주거나, 링크/리스트 등 최소 포맷만 지원하는 렌더러 구현. 리치 에디터는 범위가 커지므로 1차는 읽기 전용 표시만 권장. |
| **priority·created 미표시** | 가져오지만 화면에 없음. “주요 세부정보”로 보면 부족해 보일 수 있음. | 필드 그리드 또는 헤더에 우선순위·생성일 한 줄 추가. |
| **attachment 타입 없음** | `fields.attachment` 구조가 타입에 없어 자동완성·검증 불가. | Jira 응답 샘플로 배열 요소 타입 정의 후 `JiraIssue.fields` 에 반영. |
| **attachment 응답 형식** | Jira가 attachment를 생략하거나 다른 키로 내려줄 수 있음. | 실제 `GET /issue/{key}` 응답으로 `fields.attachment` 존재 여부·배열 구조 확인. |

### 7.2 첨부 추가(업로드)

| 문제 | 설명 | 대응 방향 |
|------|------|-----------|
| **프록시가 multipart를 안 넘김** | `express.json()` 만 사용 시 multipart 본문이 비어 있어, Jira로 전달해도 파일이 없음. **첨부 추가가 동작하지 않는 직접 원인.** | multipart 전용 라우트 또는 미들웨어 도입. `multer` 등으로 받아서 Jira로 재전송하거나, raw body를 그대로 Jira로 스트리밍. |
| **X-Atlassian-Token 누락** | Jira는 이 헤더가 없으면 첨부 추가를 거부할 수 있음. | `POST .../attachments` 요청 시 프록시에서 반드시 `X-Atlassian-Token: no-check` 추가. |
| **Content-Type 덮어쓰기** | multipart는 boundary가 포함된 `Content-Type` 이 필요한데, 프록시에서 JSON용 헤더로 덮어쓰면 업로드 실패. | multipart 요청은 헤더와 body를 그대로 전달. |
| **파일 크기 제한** | Express 기본 body 크기 제한. 대용량 첨부 시 413 등. | `express.json()` 외에 multipart용 제한을 별도 설정. Jira uploadLimit 도 확인. |

### 7.3 첨부 다운로드·링크

| 문제 | 설명 | 대응 방향 |
|------|------|-----------|
| **content가 절대 URL** | `attachment.content` 이 `https://okestro.atlassian.net/...` 형태면, 그대로 쓰면 브라우저가 직접 Jira로 요청해 인증 없이 401/403. | 앱에서는 **항상** `/api/attachment/content/{id}` 처럼 프록시 경유 URL만 사용. id만 추출해 경로 조합. |
| **프록시 경로 매핑** | `/api/attachment/content/12345` 를 Jira `GET /rest/api/3/attachment/content/12345` 로 넘기려면, 현재 프록시가 `/api` 다음 경로를 `/rest/api/3/` 로 붙이는지 확인. | `req.path` 가 `/attachment/content/:id` 형태로 넘어가면 `jiraPath` 가 `/rest/api/3/attachment/content/12345` 가 되는지 확인. |

### 7.4 수정 플로우·권한

| 문제 | 설명 | 대응 방향 |
|------|------|-----------|
| **삭제 403** | 권한 없을 때 DELETE attachment 가 403. 사용자는 “삭제 실패”만 보게 됨. | 403 시 메시지 표시. 가능하면 “본인 첨부만 삭제 가능” 등 안내. |
| **필드 수정과 첨부 순서** | “저장” 한 번에 필드 수정 + 첨부 추가/삭제를 하려면, 호출 순서·에러 처리 정책 필요. | 예: updateIssue → addAttachments → deleteAttachment 순. 중간 실패 시 이미 반영된 건 롤백 불가하므로, 부분 성공 메시지 또는 단계별 확인 고려. |

### 7.5 기타

| 문제 | 설명 | 대응 방향 |
|------|------|-----------|
| **Jira 필드명/커스텀 필드** | 프로젝트마다 description·날짜 필드가 다르거나 커스텀 필드만 쓰는 경우 있음. | 현재는 OKESTRO/IGMU 기준 필드로 가정. 다른 프로젝트 지원 시 필드 매핑 또는 설정화 검토. |
| **표시 정보 과다** | description·첨부·우선순위·생성일 등을 한꺼번에 넣으면 드로어가 길어짐. | 섹션 접기/펼치기, 탭 분리(예: 상세/첨부) 등으로 가독성 유지. |

### 7.6 이슈 상세 UI·추가 필드

| 항목 | 내용 | 대응 |
|------|------|------|
| **우선순위 콤보 배색** | 팝오버 배경/글자 대비가 낮아 선택 목록 글씨가 잘 안 보임. | PopoverContent·리스트 항목에 명시적 배경색(bg-white 등)·글자색(text-slate-900) 적용, 선택 항목은 구분되면서도 가독성 있게(bg-slate-200 등). |
| **난이도 필드** | Jira 이슈의 난이도 필드 **필드명은 '난이도'**. 조회·표시·수정 후 Jira 반영 필요. | (1) **필드 id 결정**: GET /rest/api/3/field 로 전체 필드 조회 후 **name === '난이도'** 인 필드의 id 사용. 없으면 JIRA_CONFIG.FIELDS.DIFFICULTY 폴백. (2) getIssueDetails(issueKey, difficultyFieldId) 로 해당 필드 포함 조회. (3) editmeta → fields[fieldId].allowedValues 로 옵션 조회. (4) UI 표시·팝오버 셀렉트로 **수정 가능**, updateIssue로 Jira 반영. |

**난이도 사이드 이펙트:** (1) **필드 id**: GET /field 로 필드 목록 조회 후 **필드명 '난이도'** 로 id 결정. 없으면 **JIRA_CONFIG.FIELDS.DIFFICULTY** 폴백(기본 customfield_10017). 인스턴스에서 다른 id를 쓰면 config에서 변경하거나, 필드명이 '난이도'면 자동 반영. (2) editmeta는 이슈별로 컨텍스트가 달라 동일 이슈에서만 옵션 일관. (3) 단일 선택 필드면 값은 보통 `{ id, value }` 형태, 수정 시 `{ [fieldId]: { id } }` 전송. (4) 해당 이슈 타입/화면에 난이도 필드가 없으면 editmeta에 필드가 없을 수 있음 → 옵션 0개면 읽기 전용 표시만.

**난이도 매핑 보강:** Jira가 이슈/editmeta에서 id·value·name 등 서로 다른 키로 내려줄 수 있으므로, (1) **현재 값 표시**: `rawDiff.value` ?? `rawDiff.name` ?? 문자열/숫자면 그대로, 없으면 allowedValues에서 id로 찾아 value 표시. (2) **옵션 정규화**: allowedValues 각 항목을 `{ id: String(opt.id ?? opt.value ?? opt.name), value: String(opt.value ?? opt.name ?? opt.id) }` 로 통일. (3) **선택 상태**: 현재 id가 있으면 id로 옵션 매칭, id 없고 value만 있으면 value로 옵션 매칭해 선택 항목 강조.

---

## 8. 이슈 상세 설명(description) 내 첨부파일 표시 가능 여부

설명(description) 본문은 ADF(Atlassian Document Format)로 내려옵니다. 사용자가 설명에 **이미지나 파일을 붙여넣기**하면 ADF 안에 **미디어 노드**가 들어갈 수 있습니다. 이 노드들로 “설명 안에 포함된 첨부”를 우리 앱에서 표시할 수 있는지 정리합니다.

### 8.1 ADF에서 설명 내 미디어 표현

| 노드 | 역할 | 주요 attrs |
|------|------|------------|
| **media** | 단일 파일/이미지 참조 | `id`(Media Services ID), `type`("file"\|"link"), `collection`, `alt`(파일명 등), `width`, `height` |
| **mediaSingle** | media 한 개를 블록으로 감쌈 | (자식으로 media 1개) |
| **mediaGroup** | media 여러 개를 묶음 | (자식으로 media 배열) |

- ADF 스펙상 **media.attrs.id** 는 “Media Services ID”로 정의되어 있으며, “Media API로 메타데이터를 조회하라”고 명시되어 있음.
- Jira Cloud가 설명에 이미지를 넣을 때, 이 **id**가 이슈의 **attachment id**와 같은지 여부는 제품/버전에 따라 다를 수 있음. 커뮤니티 자료에서는 “ADF media id ≠ attachment id”인 경우가 있다고 함.

### 8.2 현재 앱 동작

- **설명 표시:** 이슈 상세에서는 **renderDescriptionAdf** 로 ADF를 React 노드로 렌더링함. **media, mediaSingle, mediaGroup** 노드를 처리하며, (1) `media.attrs.id`가 이슈 첨부 목록에 있으면 해당 id로 이미지/링크 표시. (2) **§8.6 파일명 폴백**: id로 찾지 못하면 `media.attrs.alt`와 **동일한 filename**인 첨부를 찾아 그 id로 `getAttachmentContentUrl(id)` 호출 후 `<img>` 또는 `<a>` 표시. (3) 둘 다 실패 시 "[이미지: alt]" 텍스트. **링크**: text 노드의 link mark(`marks: [{ type: 'link', attrs: { href } }]`)가 있으면 `http:`/`https:`일 때만 `<a href target="_blank">` 로 표시.
- **adfToText** 는 평문 변환용으로만 사용되며, media 계열은 빈 문자열로 처리함.

### 8.3 표시 가능 여부 정리

| 시나리오 | 표시 가능 여부 | 비고 |
|----------|----------------|------|
| **media.attrs.id = 이슈 attachment id** | ✅ 가능 | 기존 `GET /rest/api/3/attachment/content/{id}` 로 다운로드/미리보기 가능. ADF 파싱 후 해당 노드에서 id 추출해 `<img src="/api/attachment/content/{id}">` 또는 링크로 표시하면 됨. |
| **media.attrs.id ≠ attachment id (Media Services 전용)** | ⚠️ 제한적 | Jira REST v3의 **Issue attachments** API(`/attachment/content/{id}`)만으로는 조회 불가. **Media Services/Forge 등 다른 API**로 해당 id를 조회·다운로드해야 함. 해당 API가 공개·인증 방식이 우리 프록시와 맞는지 확인 필요. |
| **media.attrs.alt에 파일명만 있는 경우** | ✅ 텍스트 대체는 가능 | 이미지 대신 “[이미지: moon.jpeg]” 같은 대체 텍스트로 표시하는 것은 **지금도 구현 가능**. adfToText에 media/mediaSingle/mediaGroup case를 넣고 `attrs.alt` 또는 `attrs.id`를 문자열로 붙이면 됨. |

### 8.4 구현 시 필요한 작업 (표시를 넣을 경우)

1. **ADF 파싱 확장**  
   - description을 순회할 때 **media, mediaSingle, mediaGroup** 노드 처리 추가.  
   - **media**: `attrs.id`, `attrs.alt`, `attrs.type` 사용.
2. **id가 attachment id인지 확인**  
   - 실제 Jira 응답(description ADF)에서 media가 있는 이슈를 골라, **media.attrs.id**와 **issue.fields.attachment[].id** 를 비교해 동일한지 확인. 동일하면 기존 attachment content URL로 표시 가능.
3. **표시 방식**  
   - **동일한 경우:** `getAttachmentContentUrl(attrs.id)` 로 이미지면 `<img>`, 파일이면 `<a>다운로드</a>` 등으로 표시.  
   - **다른 경우(Media 전용):** Media API 문서 확인 후, 해당 API를 프록시 경유로 호출해 URL 또는 바이너리를 받아 표시. 없으면 alt만 텍스트로 표시.
4. **adfToText vs 리치 렌더링**  
   - **adfToText만 확장:** media를 “[첨부: alt 또는 id]” 같은 텍스트로만 남기면, “표시”는 가능하나 인라인 이미지는 아님.  
   - **인라인 이미지까지:** ADF → React 컴포넌트(paragraph, media, text 등)로 렌더링하는 전용 뷰어가 필요.

### 8.5 결론

- **표시 가능 여부**는 **“설명 내 media 노드의 id가 이슈 attachment id와 일치하는지”**에 따라 갈림.  
  - 일치하면 → **현재 사용 중인 attachment content API만으로 설명 내 첨부도 표시 가능.**  
  - 불일치(Media Services 전용 id)면 → **별도 API·인증 확인 후** 표시 가능 여부가 결정됨.
- **권장 순서:**  
  1) 실제 Jira description ADF에서 media id와 attachment id 매핑을 샘플로 확인.  
  2) 일치하면 ADF 파싱 + 기존 attachment content URL로 표시 구현.  
  3) 불일치하면 **파일명(alt)으로 첨부 목록 매칭**하여 같은 파일이면 해당 attachment id로 이미지/링크 표시.  
  4) 불일치 시 Media API 문서를 보고, 지원 범위(텍스트 대체만 vs 인라인 이미지)를 정한 뒤 분석 자료를 보완.

### 8.6 설명 내 첨부 미표시 대응 및 링크 표시 (보완)

**현상:** 설명에 넣은 이미지가 `[이미지: 파일명.png]` 텍스트로만 나오고 인라인 이미지로 표시되지 않음. Jira에서 설명 본문에 붙인 미디어의 **media.attrs.id**가 이슈 **attachment id**와 다를 수 있음(§8.1 Media Services ID).

**보완 방안 (미디어):**

| 순서 | 내용 |
|------|------|
| 1 | **id 매칭** 유지: `media.attrs.id`가 `issue.fields.attachment[].id`에 있으면 기존대로 `<img>`/`<a>` 표시. |
| 2 | **파일명(alt) 폴백**: id로 찾지 못하면 `media.attrs.alt`(또는 유사 필드)와 **동일한 filename**을 가진 첨부를 찾아, 그 첨부의 id로 `getAttachmentContentUrl(id)` 호출 후 이미지/다운로드 링크 표시. |
| 3 | 둘 다 실패 시에만 `[이미지: alt]` 텍스트 유지. |

**설명 내 링크 표시:** ADF에서 링크는 **text 노드의 marks**로 들어감. `marks: [{ type: 'link', attrs: { href: '...' } }]` 이 있으면 해당 텍스트를 `<a href={href} target="_blank">` 로 감싸서 표시.

**사이드 이펙트:**

| 항목 | 영향 | 대응 |
|------|------|------|
| **파일명 중복** | 동일 filename 첨부가 여러 개면 첫 번째만 매칭됨. | filename 매칭 시 첫 일치 사용. 필요 시 나중에 “동일 이름 중 id 우선” 등 정책 추가. |
| **alt 없음** | media에 alt가 비어 있으면 파일명 폴백 불가. | id 매칭만 적용, 실패 시 `[이미지: 첨부]` 등 고정 문구. |
| **외부 링크** | `href`가 외부 URL이면 그대로 노출. | `target="_blank"`, `rel="noopener noreferrer"` 적용. 앱 내 라우트가 아닌 외부 링크만 있으므로 보안상 기존 정책 유지. |
| **XSS** | description에 악의적 href(예: javascript:) 입력 가능. | href 프로토콜 검사: `http:`, `https:` 만 허용, 그 외는 텍스트만 표시 또는 제거. |

**체크리스트:**

- [x] **미디어 파일명 폴백**: renderDescriptionAdf에서 media 노드 처리 시, `attachmentIds.has(String(id))` 실패하면 `attachments` 중 `filename === alt`(trim 비교)인 항목을 찾아 그 id로 URL 생성 후 `<img>`/`<a>` 렌더링.
- [x] **링크 마크 처리**: text 노드 렌더 시 `node.marks`에 `type === 'link'`인 mark가 있으면 `attrs.href`를 사용해 `<a href={href} target="_blank" rel="noopener noreferrer">` 로 감싸기.
- [x] **href 보안**: link mark의 href가 `http:` 또는 `https:`로 시작할 때만 `<a>` 사용, 그 외는 텍스트만 표시.

---

## 9. 우선순위·설명 수정 가능 여부 및 방법

이슈 상세에서 **우선순위(priority)** 와 **설명(description)** 을 수정할 수 있는지, 가능하다면 **어떤 API·포맷으로** 보내야 하는지 정리합니다.

### 9.1 API 관점: 수정 가능 여부

| 필드 | 수정 가능 여부 | 사용 API | 비고 |
|------|----------------|----------|------|
| **priority** | ✅ 가능 | `PUT /rest/api/3/issue/{issueIdOrKey}` | `fields.priority` 로 전송. |
| **description** | ✅ 가능 | 동일 (PUT issue) | `fields.description` 로 전송. **값은 ADF 문서 객체**여야 함 (평문 문자열 아님). |

- 현재 앱의 **updateIssue(issueKey, fields)** 는 이미 `PUT /issue/{issueKey}` 에 `{ fields }` 를 그대로 보내므로, **우선순위와 설명 모두 동일 API로 수정 가능**합니다.  
- 단, **description** 은 Jira Cloud에서 ADF를 사용하므로, 수정 시 **ADF 구조의 JSON**을 보내야 합니다. 평문 문자열을 보내면 "Operation value must be a string" 등 오류가 날 수 있습니다.

### 9.2 우선순위(priority) 수정 방법

- **전송 형식:**  
  - **방식 1:** `{ "priority": { "id": "3" } }` — 프로젝트/인스턴스별 우선순위 **id** 사용 (권장).  
  - **방식 2:** `{ "priority": { "name": "High" } }` — 이름으로 지정. 인스턴스에 동일 이름이 하나일 때 사용.
- **선택 가능한 값 확인:**  
  - `GET /rest/api/3/priority` 로 전체 우선순위 목록 조회.  
  - 또는 `GET /rest/api/3/issue/{issueIdOrKey}/editmeta` 로 해당 이슈에서 **편집 가능한 필드**와 priority의 **allowedValues** 등을 확인 가능.
- **현재 UI:**  
  - 이슈 상세에서 우선순위는 **편집 가능**. `getPriorities()` 로 목록 조회 후 팝오버 셀렉트로 선택 시 `updateIssue({ priority: { id } })` 호출해 Jira에 반영됨.  
- **구현 시:**  
  - `handleUpdateField('priority', { id: selectedId })` 또는 `{ name: selectedName }` 형태로 기존 **updateMutation** 에 넘기면 됨.  
  - UI에 우선순위 셀렉트를 추가하고, 필요 시 **getPriority** 또는 **editmeta** 로 옵션 목록을 가져와 바인딩.

### 9.3 설명(description) 수정 방법

- **전송 형식:**  
  - **반드시 ADF 문서 객체.**  
  - 예: `{ "description": { "version": 1, "type": "doc", "content": [ { "type": "paragraph", "content": [ { "type": "text", "text": "수정한 설명 텍스트" } ] } ] } }`  
  - Jira Cloud는 description을 ADF로만 저장하므로, **평문 문자열을 그대로 fields.description에 넣으면 오류**가 발생할 수 있음.
- **현재 앱 상태:**  
  - **adfToText**: ADF → 평문 텍스트 변환만 있음 (표시용).  
  - **평문 → ADF 생성**: 댓글용 `buildCommentAdf` 는 있으나, **이슈 description용 ADF 빌더는 없음.**  
  - 이슈 상세에서 설명은 **읽기 전용**으로만 표시됨. **편집 입력/저장 UI 없음.**
- **구현 방향 (택 1 또는 조합):**  
  1. **단순 텍스트 편집:** 사용자가 입력한 평문을 **한 개 paragraph + text 노드**로만 구성한 ADF로 변환해 PUT. (기존 리치 구조·미디어는 무시되고 단일 문단으로 덮어쓰기됨.)  
  2. **기존 ADF 유지 + 최소 편집:** GET으로 받은 description ADF를 그대로 두고, 특정 노드만 치환하는 방식. 구현 복잡도 높음.  
  3. **리치 에디터 도입:** ADF를 편집·생성할 수 있는 에디터 컴포넌트를 붙여, 저장 시 해당 ADF를 그대로 `fields.description` 에 넣어 PUT. (예: Atlassian 공식 문서/에디터 라이브러리 검토.)

### 9.4 정리

| 항목 | 수정 가능 여부 | 방법 요약 | 현재 UI |
|------|----------------|-----------|----------|
| **우선순위** | ✅ 가능 | PUT issue, `fields.priority` = `{ id }` 또는 `{ name }`. 옵션은 /priority 또는 editmeta로 조회. | 읽기 전용 |
| **설명** | ✅ 가능 | PUT issue, `fields.description` = **ADF 문서 객체**. 평문만 보낼 수 없음. | 읽기 전용 |

- **우선순위:** API·인프라는 이미 갖춰져 있으므로, **편집 UI(셀렉트)** 와 **옵션 조회(priority 또는 editmeta)** 만 추가하면 됨.  
- **설명:** **ADF를 생성·전송하는 로직**이 필요함. 단순 텍스트 편집만 지원할지, 리치(표·미디어 등)까지 지원할지에 따라 **단일 문단 ADF 빌더** vs **ADF 리치 에디터** 선택이 갈림.

---

## 10. 구현 체크리스트 (데모 형식 기준)

분석 문서 §2·§4·§5·§7을 참고하여, **데모로 보여준 형식**(설명·우선순위·생성일·첨부 목록+다운로드만 표시, 업로드/삭제·편집 없음)을 구현하기 위한 단계별 체크리스트입니다.

### 10.1 1단계: 데모 형식 (조회·표시만)

**목표:** 이슈 상세에 주요 세부정보(설명, 우선순위, 생성일)와 첨부파일 목록을 표시하고, 첨부는 다운로드 링크만 제공.

#### API·타입

- [x] **JiraIssue.fields.attachment** 타입 정의 추가 (§5.1, §7.1)  
  - `attachment?: Array<{ id: string | number; filename: string; size?: number; mimeType?: string; created?: string; author?: { displayName?: string }; content?: string; thumbnail?: string }>` 등.
- [ ] **getIssueDetails** 응답에 `fields.attachment` 가 실제로 오는지 Jira 응답으로 확인 (§5.1, §7.1).

#### UI – 주요 세부정보 표시

- [x] **설명(description)** 전용 섹션 추가 (§2.3, §4.1, §7.1)  
  - ADF이면 기존 **adfToText** 로 읽기 전용 표시.  
  - 없을 때는 섹션 숨김 또는 “설명 없음” 처리.
- [x] **우선순위(priority)** 필드 그리드에 표시 (§2.3, §4.1, §7.1)  
  - `details?.fields.priority?.name ?? issue.fields.priority?.name` 및 필요 시 아이콘.
- [x] **생성일(created)** 필드 그리드에 표시 (§2.3, §4.1)  
  - `details?.fields.created ?? issue.fields.created` 를 날짜 포맷으로 표시.
- [x] **첨부파일** 섹션 추가 (§4.1, §5.1)  
  - 제목(예: "첨부파일 (n)"), 목록(파일명, 크기, 올린 날짜, 작성자).  
  - 각 항목에 **다운로드 링크**: `/api/attachment/content/{id}` (또는 `getAttachmentContentUrl(att.id)`).

#### 다운로드·프록시

- [x] 다운로드 링크는 **프록시 경유 URL만** 사용 (§4.1, §7.3)  
  - `content` 절대 URL이 아닌 `/api/attachment/content/{id}` 형태.  
  - `getAttachmentContentUrl(id)` 사용 여부 확인.
- [x] 프록시에서 `GET /attachment/content/:id` → Jira `GET /rest/api/3/attachment/content/{id}` 전달 및 바이너리 응답 처리 확인 (§3.3, §7.3).

#### 검증

- [x] 이슈 상세 열었을 때 설명·우선순위·생성일·첨부 목록이 데모와 동일한 형식으로 표시되는지 확인.  
- [ ] 첨부 "다운로드" 클릭 시 파일 다운로드(또는 이미지면 새 탭 표시) 동작 확인.

---

### 10.2 2단계: 첨부 추가·삭제 (수정 기능)

데모 범위를 넘어 **첨부 업로드·삭제**까지 구현할 때 사용. §4.2, §5.2, §5.3, §6, §7.2 참고.

- [ ] **addAttachments(issueKey, files)** (또는 동일 역할) API 추가.  
  - FormData + `POST /issue/{issueKey}/attachments`, 헤더 `X-Atlassian-Token: no-check`.
- [ ] **deleteAttachment(attachmentId)** API 추가.  
  - `DELETE /attachment/{id}`.
- [ ] **Electron 프록시** multipart 요청 처리 (§6, §7.2)  
  - multipart 수신·Jira 전달, `X-Atlassian-Token: no-check` 추가, Content-Type(boundary) 유지.
- [ ] UI: 첨부 추가(파일 선택 + 업로드), 첨부 삭제(버튼 + 확인).  
- [ ] Jira **uploadLimit** 확인 및 UI 안내/검사 (§5.2, §6).  
- [ ] 삭제 403 시 에러 메시지 표시 (§5.3, §7.4).

---

### 10.3 3단계: 우선순위·설명 편집 (선택)

§9 참고.

- [ ] **우선순위 편집**  
  - [ ] 우선순위 목록 조회 (`GET /rest/api/3/priority` 또는 editmeta).  
  - [ ] UI: 셀렉트/드롭다운 추가.  
  - [ ] 저장 시 `handleUpdateField('priority', { id } 또는 { name })`.
- [ ] **설명 편집**  
  - [ ] 평문 → ADF 빌더(단일 문단) 또는 리치 에디터(ADF 출력) 결정.  
  - [ ] 저장 시 `fields.description` 에 ADF 객체 전송 (평문 문자열 불가).

---

### 10.4 4단계: 설명 내 미디어 표시 (선택)

§8 참고. 설명 본문 안에 삽입된 이미지/파일 표시.

- [ ] 실제 Jira description ADF에서 **media.attrs.id** 와 **issue.fields.attachment[].id** 매핑 확인 (§8.5).  
- [ ] **adfToText** 또는 전용 ADF 렌더러에 **media / mediaSingle / mediaGroup** 처리 추가.  
- [ ] id가 attachment id와 일치하면 `getAttachmentContentUrl(attrs.id)` 로 이미지/링크 표시; 불일치 시 alt 텍스트 또는 Media API 검토.

---

### 10.5 체크리스트 요약

| 단계 | 범위 | 참고 섹션 |
|------|------|-----------|
| **1단계** | 데모 형식: 설명·우선순위·생성일·첨부 목록+다운로드 표시 | §2, §4.1, §5.1, §7.1, §7.3 |
| **2단계** | 첨부 추가·삭제 | §4.2, §5.2, §5.3, §6, §7.2, §7.4 |
| **3단계** | 우선순위·설명 편집 | §9 |
| **4단계** | 설명 내 미디어(인라인 첨부) 표시 | §8 |

구현 시 **§6 사이드 이펙트**, **§7 구현 시 문제가 되는 부분**을 함께 확인하는 것을 권장합니다.

---

## 11. 정리

- **조회(주요 세부정보 + 첨부):**  
  - 이미 `getIssueDetails` 에서 **summary, status, assignee, reporter, priority, issuetype, comment, worklog, 날짜 필드, description, attachment** 등을 요청 중.  
  - **표시 측면**에서는 **description(설명), priority(우선순위), created(생성일), attachment(첨부 목록)** 이 빠져 있으므로, 이들을 이슈 상세 UI에 반영해야 “Jira 이슈 상세의 주요 세부정보”를 포함한다고 볼 수 있음.  
  - 첨부는 **타입 정의 + 목록 영역 + 다운로드 링크(프록시 경유)** 추가.
- **수정(첨부 반영):**  
  - **추가:** `POST /issue/{issueKey}/attachments` (multipart, X-Atlassian-Token).  
  - **삭제:** `DELETE /attachment/{id}`.  
  - **프록시:** multipart 수신·전달 및 X-Atlassian-Token 헤더 처리 보완이 **선행**되어야 첨부 추가가 동작함.
- **설명 내 첨부:** **§8 이슈 상세 설명(description) 내 첨부파일 표시 가능 여부** 참고. media 노드 id와 attachment id 일치 여부 확인 후, ADF 파싱·표시 범위 결정.
- **우선순위·설명 수정:** **§9 우선순위·설명 수정 가능 여부 및 방법** 참고. 둘 다 PUT issue로 수정 가능하며, 우선순위는 id/name 전송, 설명은 ADF 객체 전송 필요. 현재 UI는 둘 다 읽기 전용.
- 구현 시 **§10 구현 체크리스트 (데모 형식 기준)** 를 단계별로 진행하고, **§5 체크리스트**, **§6 사이드 이펙트**, **§7 구현 시 문제가 되는 부분**을 함께 확인하는 것을 권장합니다.
