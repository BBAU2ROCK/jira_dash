# 프로젝트 통계 – 보류·취소 기초 분석 및 구현 보고서

## 0. 기초 분석: 완료 판단 기준 및 보류·취소 처리 방식

> *통합 전 별도 문서(`stats-onhold-as-done-analysis.md`)의 내용을 흡수함.*

### 0.1 현재 "완료" 판단 기준

| 구분 | 기준 | 코드 위치 |
|------|------|-----------|
| **완료(done)** | `status.statusCategory.key === 'done'` | `project-stats-dialog.tsx` |
| **진행(inProg)** | `statusCategory.key === 'indeterminate'` | 동일 |
| **대기(todo)** | `statusCategory.key === 'new'` (그 외 포함) | 동일 |

- 완료율·파이/막대·담당자별 완료 건수·KPI 완료율은 모두 `done` 집합을 사용합니다.
- **상태 이름(`status.name`)을 직접 보지 않고**, **카테고리 키(`done` / `new` / `indeterminate`)만** 사용합니다.
- `kpiService.ts`도 동일하게 `statusCategory.key === 'done'`만 사용하며, 보류·취소를 완료로 보는 별도 분기가 없습니다.

### 0.2 "보류"가 통계에서 어떻게 보이는가

- **Jira에서 "보류" 상태가 Done 카테고리에 매핑된 경우**: API가 `statusCategory.key === 'done'`을 주므로, 별도 코드 없이도 완료 건수·완료율·KPI에 포함됩니다.
- **"보류"가 To Do(`new`) 또는 In Progress(`indeterminate`) 카테고리인 경우**: 완료로 집계되지 않고, 대기 또는 진행으로만 집계됩니다.

즉, "보류 건을 완료로 처리하여 표시"하는 앱 내 전용 로직은 없고, 전적으로 **Jira의 status category 설정**에 따라 결정됩니다.

### 0.3 결론

| 항목 | 내용 |
|------|------|
| 보류 → 완료 전용 로직 | **없음** (구현 전 기준) |
| 완료 판단 기준 | `status.statusCategory.key === 'done'` 만 사용 |
| 보류·취소를 별도로 보고 싶을 때 | 앱에서 `status.name` 기반으로 식별하는 확장 필요 → §3 설계 참조 |

---

## 1. 요구사항 정리

| 번호 | 요구사항 | 적용 위치 |
|------|----------|-----------|
| 1 | **전체 현황**에 '보류'와 '취소'를 **포함한 패널** 구성 (현재: 전체이슈/완료/진행중/지연 4개) | 프로젝트 통계 다이얼로그 – 전체 현황 |
| 2 | **이슈 분포** 파이 차트에 '보류', '취소' **세그먼트 포함** (현재: 완료/진행/대기 3분할) | 동일 – 이슈 분포 파이 + 범례 |
| 3 | **담당자별 현황**은 UI/컬럼은 현 상태 유지하되, '보류'와 '취소'는 **완료로 집계** | 담당자별 현황 테이블 |

---

## 2. 현재 구현 상태

### 2.1 전체 현황

- **패널**: 전체 이슈, 완료(%), 진행 중(개), 지연(개) — 4개 카드.
- **분류 기준**: `status.statusCategory.key`만 사용.
  - 완료 = `done`
  - 진행 = `indeterminate`
  - 대기 = `new` (그 외 포함)
- **보류·취소**: 상태명(`status.name`) 기준 구분 없음 → 카테고리에 따라 위 셋 중 하나에만 포함됨.

### 2.2 이슈 분포 파이

- **세그먼트**: 완료 / 진행 / 대기 3개 (`overallSegments`).
- **데이터**: `done.length`, `inProg.length`, `todo.length` (동일 카테고리 기준).
- **보류·취소**: 별도 슬라이스 없음.

### 2.3 담당자별 현황

- **완료 컬럼**: `statusCategory.key === 'done'`인 이슈만 `s.done`에 포함.
- **보류·취소**: 완료로 치지 않음 (카테고리가 done이 아니면 대기/진행으로만 분류).

---

## 3. 변경 설계

### 3.1 보류·취소 식별

- **기준**: Jira **상태 이름** `status.name` 문자열.
- **기본값**: `'보류'`, `'취소'` (Jira 워크플로우에서 사용하는 표시명).
- **설정**: `jiraConfig.ts`에 상태명 추가하여, 인스턴스별로 다른 이름 사용 가능하도록 함.

```ts
// jiraConfig.ts 추가 제안
STATUS_NAMES: {
    ON_HOLD: '보류',   // 프로젝트 현황·파이·담당자별 식별용
    CANCELLED: '취소',
}
```

- **헬퍼**: `isOnHold(issue)`, `isCancelled(issue)` — `issue.fields.status?.name`이 설정값과 일치(trim 후)하면 true.

### 3.2 전체 현황 – 패널 구성 (요구 1)

- **변경 전**: 4개 카드 (전체 이슈, 완료, 진행 중, 지연).
- **변경 후**: **6개 카드** — 기존 4개 + **보류**, **취소**.
- **집계**:
  - `onHold` = `status.name === JIRA_CONFIG.STATUS_NAMES.ON_HOLD` (또는 trim 비교)
  - `cancelled` = `status.name === JIRA_CONFIG.STATUS_NAMES.CANCELLED`
- **UI**: 기존 4개 유지, 그 옆 또는 다음 줄에 보류(개)·취소(개) StatCard 추가. 아이콘/색은 보류=회색·취소=회색 계열 등 구분 가능하게.
- **클릭 동작**: 보류/취소 카드 클릭 시 해당 이슈만 하단 그룹 목록으로 열기 (`openGroup('보류 이슈', onHold, color)` 등).

### 3.3 이슈 분포 파이 (요구 2)

- **변경 전**: 3 세그먼트 (완료, 진행, 대기).
- **변경 후**: **5 세그먼트** — 완료, 진행, 대기, **보류**, **취소**.
- **분할 규칙** (상호 배타적):
  1. **보류** = `status.name === '보류'` (설정값)
  2. **취소** = `status.name === '취소'` (설정값)
  3. **완료** = `statusCategory.key === 'done'` 이면서 보류·취소가 **아닌** 이슈
  4. **진행** = `statusCategory.key === 'indeterminate'`
  5. **대기** = 그 외 전부 (`new` 및 기타)

- **집계 순서**: 보류/취소를 먼저 빼고, 나머지를 done / inProg / 대기(그 외)로 나눔. **대기** = 완료·진행·보류·취소가 아닌 전부(상호 배타적).

```ts
// 의사 코드 (5분할 상호 배타)
const onHold = leafIssues.filter(i => isOnHold(i));
const cancelled = leafIssues.filter(i => isCancelled(i));
const done = leafIssues.filter(i => i.fields.status.statusCategory.key === 'done' && !isOnHold(i) && !isCancelled(i));
const inProg = leafIssues.filter(i => i.fields.status.statusCategory.key === 'indeterminate');
const todo = leafIssues.filter(i => !isOnHold(i) && !isCancelled(i) && i.fields.status.statusCategory.key !== 'done' && i.fields.status.statusCategory.key !== 'indeterminate');
```

- **파이 세그먼트**:  
  `overallSegments = [ { 완료, done.length }, { 진행, inProg.length }, { 대기, todo.length }, { 보류, onHold.length }, { 취소, cancelled.length } ]`  
  값이 0인 세그먼트도 포함해 5개 고정해 두면, 범례 클릭 시 해당 그룹만 필터해서 하단 목록에 표시 가능.
- **중앙 라벨**: 현재는 완료율(%)인데, “실제 완료만 분자”로 유지할지, “실제 완료+보류+취소”를 분자로 할지는 정책 선택. 본 설계에서는 **전체 현황 완료율은 기존과 동일(실제 완료만)** 로 두고, 담당자별에서만 보류·취소를 완료에 포함.

### 3.4 담당자별 현황 – 보류·취소를 완료로 포함 (요구 3)

- **UI**: 테이블 구조·컬럼(전체/완료/진행/대기/지연/조기완료/로그 있음·없음/…) **변경 없음**.
- **집계 로직만 변경**:
  - **기존**: `cat === 'done'`일 때만 `s.done`에 push.
  - **변경**: `(cat === 'done') || isOnHold(issue) || isCancelled(issue)`일 때 `s.done`에 push.
- **영향**:
  - 담당자별 **완료** 건수 증가 (보류·취소 포함).
  - **진행률(완료율)** = done/total → 보류·취소가 포함된 완료로 계산.
  - **조기완료**: 기존처럼 `resolutiondate < duedate` 등만 사용하면 되며, 보류·취소는 보통 resolutiondate가 없을 수 있으므로 조기완료 집계에서는 제외해도 됨(기존 done 필터에 resolutiondate 조건이 있음). 담당자별 `earlyDone`은 “실제 완료(done 상태) 중 조기 완료”만 두고, 보류·취소는 done에만 넣고 earlyDone에는 넣지 않으면 됨.
  - **준수(compliant)**: 보류·취소는 완료로만 셀 뿐, “기한 내 완료” 준수에는 포함하지 않는 것이 자연스러움. 즉 보류·취소는 `s.compliant`에 넣지 않음.

**담당자별 분류 의사 코드**:

```ts
const isDoneForAssignee = (issue) =>
    issue.fields.status.statusCategory.key === 'done' || isOnHold(issue) || isCancelled(issue);

if (isDoneForAssignee(issue)) {
    s.done.push(issue);
    // earlyDone, compliant는 기존과 동일하게: statusCategory === 'done'인 경우만 계산
    if (cat === 'done' && issue.fields.duedate && issue.fields.resolutiondate && ...) { s.earlyDone.push(issue); }
    if (cat === 'done' && ...) { s.compliant.push(issue); }
} else if (cat === 'indeterminate') {
    s.inProgress.push(issue);
} else {
    s.todo.push(issue);
}
```

---

## 4. 설정 제안 (jiraConfig)

```ts
// src/config/jiraConfig.ts

export const JIRA_CONFIG = {
    FIELDS: { /* 기존 */ },
    LABELS: { /* 기존 */ },
    /** 프로젝트 통계에서 보류·취소로 분류할 상태 이름 (Jira status.name과 일치) */
    STATUS_NAMES: {
        ON_HOLD: '보류',
        CANCELLED: '취소',
    },
};
```

- 다른 표기(예: "On Hold", "Cancelled")를 쓰는 Jira는 여기만 수정하면 됨.

---

## 5. 파일·위치별 변경 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/config/jiraConfig.ts` | `STATUS_NAMES: { ON_HOLD, CANCELLED }` 추가. |
| `src/components/project-stats-dialog.tsx` | ① 보류/취소 식별 헬퍼 또는 인라인 조건 사용. ② `onHold`, `cancelled` 집계 추가. ③ **전체 통계**: `done`을 “실제 완료만”으로 재정의(보류·취소 제외). ④ `overallSegments`를 5개(완료/진행/대기/보류/취소)로 확장. ⑤ 전체 현황에 보류·취소 StatCard 2개 추가. ⑥ 파이 범례 클릭 시 보류/취소 그룹 매핑. ⑦ 담당자별 루프에서 `isDoneForAssignee` 사용해 `s.done`에 보류·취소 포함, earlyDone/compliant는 기존 done만 유지. |

### 5.1 project-stats-dialog.tsx 상세

- **집계(useMemo 또는 상수)**  
  - `onHold`, `cancelled` 필터 추가.  
  - `done` = `statusCategory === 'done' && !isOnHold(i) && !isCancelled(i)`.  
  - `todo` = 전체 − done − inProg − onHold − cancelled (또는 `statusCategory === 'new'`이면서 보류·취소 아님).
- **전체 현황 카드**  
  - 기존 4개 카드 다음에 보류(개), 취소(개) 카드 추가. 그리드는 `sm:grid-cols-6` 또는 2줄(4+2) 등 레이아웃 선택.
- **overallSegments**  
  - 5개 항목, 색상: 보류=#94a3b8, 취소=#64748b 등.
- **파이 범례 버튼**  
  - `seg.label === '보류' ? onHold : seg.label === '취소' ? cancelled : ...` 로 `openGroup`에 넘길 이슈 배열 선택.
- **담당자별**  
  - `cat === 'done'` 분기에서 `s.done.push` 조건을 `(cat === 'done') || isOnHold(issue) || isCancelled(issue)`로 확장.  
  - earlyDone / compliant 계산은 기존처럼 `cat === 'done'`인 경우만 유지.

---

## 6. 지표 정리

| 지표 | 전체 현황 | 담당자별 |
|------|-----------|----------|
| **완료 건수** | 실제 완료만 (보류·취소 제외) | **실제 완료 + 보류 + 취소** |
| **완료율** | (실제 완료 / 전체)×100 | (done / total)×100, done에 보류·취소 포함 |
| **조기완료** | 기존 유지 (실제 완료 중 조기) | 기존 유지 |
| **준수** | 기존 유지 | 기존 유지 (보류·취소는 compliant 제외) |
| **보류/취소** | 별도 패널·파이 세그먼트로 표시 | 완료 컬럼에 포함, UI는 현 상태 유지 |

---

## 7. 결론

- **요구 1**: 전체 현황에 **보류**, **취소** 패널을 추가해 6개 카드 구성.
- **요구 2**: 이슈 분포 파이를 **완료/진행/대기/보류/취소** 5세그먼트로 구성.
- **요구 3**: 담당자별은 컬럼·레이아웃은 그대로 두고, **완료** 집계만 보류·취소를 포함하도록 변경.

보류·취소 식별은 `status.name`과 `JIRA_CONFIG.STATUS_NAMES`로 하며, Jira 인스턴스별 상태명 차이는 설정으로 흡수할 수 있다.

이 분석서를 기준으로 `project-stats-dialog.tsx` 및 `jiraConfig.ts` 수정 구현을 진행하면 된다.

---

## 8. 구현·검증 요약 (적용 완료)

- **jiraConfig.ts**: `STATUS_NAMES: { ON_HOLD: '보류', CANCELLED: '취소' }` 추가.
- **project-stats-dialog.tsx**:
  - 보류·취소 식별: `isOnHold(i)`, `isCancelled(i)` (status.name trim 비교).
  - 전체 통계: onHold/cancelled 필터 추가, done = category done이고 보류·취소 제외, todo = 나머지(완료·진행·보류·취소 제외).
  - 전체 현황: 6개 카드 (전체/완료/진행/지연/보류/취소), StatCard에 slate 색상 추가.
  - 이슈 분포 파이: 5세그먼트(완료·진행·대기·보류·취소), 범례 클릭 시 해당 그룹 매핑.
  - 담당자별: `isDoneForAssignee` = done \|\| 보류 \|\| 취소 → s.done에 포함. earlyDone/compliant는 cat === 'done'일 때만. 지연은 !isDoneForAssignee일 때만.
- **사이드이펙트**: KPI 서비스(kpiService.ts)·이슈 리스트·필터·통계 패널 등은 미수정. 완료율/준수율은 기존(statusCategory 기준) 유지.
- **검증**: `npx tsc -b --noEmit` 통과, 수정 파일 린트 에러 없음. (설치 파일 패치 미진행.)
