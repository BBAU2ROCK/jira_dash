# IGMU-47 에픽 이슈 표시 분석

## 1. 현재 표시되는 할 일·하위 작업 구조

### 1.1 데이터 흐름

1. **대시보드** (`dashboard.tsx`): 에픽 선택 시 `jiraApi.getIssuesForEpic(epicKey)` 호출.
2. **getIssuesForEpic** (`jiraClient.ts`):
   - **Step 1**: JQL `"Epic Link" = "${epicKey}" OR parent = "${epicKey}"` 로 **부모 이슈(할 일)** 를 페이지네이션으로 조회. `maxResults: 100`.
   - **Step 2**: 수집된 부모 이슈의 `fields.subtasks[]` 에서 하위 작업 key 수집.
   - **Step 3**: 하위 작업 key 목록으로 JQL `key IN (...)` 배치(100개 단위) 조회.
   - **Step 4**: `parents + subtasks` 병합 반환.
3. **화면**: 반환된 이슈 목록을 `IssueList`에 넘겨 표시. 계층은 `parent` / `subtasks` 기준으로 유지.

### 1.2 표시 규칙

- **할 일**: Epic Link = 해당 에픽이거나 parent = 해당 에픽인 이슈(부모 이슈). 하위가 없으면 단독 행, 있으면 접기/펼치기.
- **하위 작업**: 각 부모의 `fields.subtasks` 로 가져온 이슈. 부모 행 펼침 시 자식으로 표시.
- **건수**: `filterLeafIssues(issues)` 적용 — 할 일만 있으면 1건, 하위가 있으면 부모 제외·하위만 건수.

---

## 2. IGMU-49 ~ IGMU-200 구간이 안 보이는 원인

### 2.1 페이지네이션 버그 (원인)

`getIssuesForEpic` Step 1에서:

- **nextPageToken** 이 있으면 `payload.nextPageToken` 으로 다음 페이지 요청.
- **nextPageToken 이 없을 때** (Jira 응답에 없거나 프록시가 그대로 전달하지 않을 때) **fallback** 으로 `startAt` 을 로컬에서만 증가시키고, **다음 요청 payload 에 `startAt` 을 넣지 않음**.

결과:

- 두 번째 루프부터도 항상 **동일한 첫 페이지**(startAt=0)만 요청됨.
- 따라서 **최대 100건만** 반복해서 받거나, 동일 100건이 중복 누적될 수 있음.
- IGMU-47 에픽에 이슈가 100건을 넘으면(예: IGMU-48 ~ IGMU-200) **101번째 이후(IGMU-149 ~ IGMU-200 등)는 한 번도 요청되지 않아 화면에 표시되지 않음**.

### 2.2 JQL·범위

- JQL 자체는 `"Epic Link" = "IGMU-47" OR parent = "IGMU-47"` 로, IGMU-49 ~ IGMU-200 을 포함한 **전체 에픽 이슈**가 맞음.
- 문제는 **페이지네이션**으로 인해 두 번째 페이지(100번째 이후)를 가져오지 않는 것.

### 2.3 하위 작업

- 하위 작업은 **Step 1에서 조회된 부모**의 `subtasks` 만 수집한 뒤 Step 3에서 조회함.
- 부모가 100건으로 잘리면, 101번째 이후 부모의 하위 작업은 수집·조회되지 않아 **역시 표시되지 않음**.

---

## 3. 수정 사항 요약

- **400 원인**: Jira Cloud `POST /rest/api/3/search/jql` 는 요청 본문에 **`startAt` 을 지원하지 않음**. `startAt` 을 넣으면 "Invalid request payload" 로 **400 Bad Request** 발생. 페이지네이션은 **nextPageToken** 만 사용해야 함.
- **조치**: payload 에 `startAt` 을 넣지 않고, **nextPageToken 이 있을 때만** payload.nextPageToken 으로 다음 페이지 요청. 첫 요청은 jql, fields, maxResults 만 전송하여 400 제거.
- **페이지 2 이상**: Jira 가 응답에 `nextPageToken` 을 주면 그대로 다음 페이지 조회 가능. `nextPageToken` 이 없으면 현재는 첫 페이지(최대 100건)만 조회됨.

---

## 4. 적용 후 기대

- IGMU-47 에픽에 속한 **모든 할 일**(IGMU-48, IGMU-49, …, IGMU-200 등)이 페이지 단위로 모두 조회됨.
- 그에 딸린 **하위 작업**도 전부 수집·조회되어 화면에 표시됨.
- 할 일·하위 작업 표시 규칙과 건수(leaf 기준) 로직은 기존과 동일.
