# v1.0.10 — KPI Store 완전 통합 계획서

> **기반**: `docs/kpi-rules-audit-report.md` §5.1 중 v1.0.9에서 미처리된 필드
> **작성 일자**: 2026-04-16
> **범위**: `statusNames` · `dashboardProjectKey` · `weekStartsOn` · `prediction.*` · 나머지 `fields.*` 를 store 우선 참조로 전환
> **총 공수**: 약 1.5일
> **선행 조건**: v1.0.9 커밋 완료 (K1 `resolveKpiRules` 패턴 확립)

---

## 배경

v1.0.9에서 K1로 `labels` / `fields.actualDone` / `grades` / `weights` / `earlyBonus`를 store 우선 참조로 교체했습니다. 그러나 감사 보고서 §5.1이 지적한 나머지 필드는 여전히 `JIRA_CONFIG` 직접 참조 상태입니다.

본 계획서는 v1.0.9의 `resolveKpiRules` 패턴을 확장하여 **남은 5개 필드 군**을 동일한 방식으로 처리합니다. 감사 보고서 §5.0 (지표 구조 유연성)은 별도 문서 · 별도 마일스톤으로 분리합니다.

---

## 수정 대상 요약

| # | Store 필드 | 현재 참조처 | v1.0.9 상태 | v1.0.10 목표 |
|---|-----------|-----------|-----------|-------------|
| S1 | `statusNames.onHold` / `cancelled` | 5개 파일 | ❌ | store 우선 참조 |
| S2 | `dashboardProjectKey` | 4개 파일 | ❌ | store 우선 참조 (주의사항 있음) |
| S3 | `weekStartsOn` | date-utils.ts 2곳 | ❌ | store 우선 참조 |
| S4 | `prediction.*` (6개 파라미터) | 6개 파일 | ❌ | store 우선 참조 (모듈 스코프 const 해체) |
| S5 | `fields.storyPoint` / `plannedStart` / `actualStart` / `difficulty` | 6개 파일 | ❌ | store 우선 참조 (낮은 우선순위) |

### 심각도 분류

| 심각도 | 항목 | 이유 |
|--------|------|------|
| **High** | S1, S4 | 사용자 편집 시 즉시 영향이 큼 (status 기반 필터 · 예측 정확도) |
| **Medium** | S2, S3 | 변경 가능하지만 앱 재시작 요구 또는 영향 범위 제한적 |
| **Low** | S5 | 필드 ID는 바뀔 가능성이 낮고, 변경 시 이미 KpiFieldsEditor에서 관리 가능 |

---

## 사전 설계 — 공통 헬퍼 확장

v1.0.9의 `resolveKpiRules()`는 kpiService.ts 내부 전용이었습니다. v1.0.10에서는 store 규칙을 여러 서비스가 공유할 수 있도록 **공통 헬퍼 모듈**로 승격합니다.

### 신규 파일 — `src/lib/kpi-rules-resolver.ts`

```ts
import { JIRA_CONFIG } from '@/config/jiraConfig';
import { useKpiRulesStore, type KpiRuleSet } from '@/stores/kpiRulesStore';

/** store 규칙 우선, 실패 시 JIRA_CONFIG fallback */
export function getActiveRules(): KpiRuleSet | null {
    try {
        return useKpiRulesStore.getState().rules;
    } catch {
        return null;
    }
}

/** 단일 필드 resolver들 — 각 서비스가 import해서 사용 */
export function resolveAgreedDelayLabel(): string {
    return getActiveRules()?.labels?.agreedDelay ?? JIRA_CONFIG.LABELS.AGREED_DELAY;
}
export function resolveVerificationDelayLabel(): string {
    return getActiveRules()?.labels?.verificationDelay ?? JIRA_CONFIG.LABELS.VERIFICATION_DELAY;
}
export function resolveOnHoldStatus(): string {
    return getActiveRules()?.statusNames?.onHold ?? JIRA_CONFIG.STATUS_NAMES.ON_HOLD;
}
export function resolveCancelledStatus(): string {
    return getActiveRules()?.statusNames?.cancelled ?? JIRA_CONFIG.STATUS_NAMES.CANCELLED;
}
export function resolveDashboardProjectKey(): string {
    return getActiveRules()?.dashboardProjectKey ?? JIRA_CONFIG.DASHBOARD.PROJECT_KEY;
}
export function resolveWeekStartsOn(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
    return getActiveRules()?.weekStartsOn ?? JIRA_CONFIG.WEEK_STARTS_ON;
}
export function resolvePredictionConfig() {
    const p = getActiveRules()?.prediction;
    return {
        DEFAULT_HISTORY_DAYS: p?.defaultHistoryDays ?? JIRA_CONFIG.PREDICTION.DEFAULT_HISTORY_DAYS,
        MONTE_CARLO_TRIALS: p?.monteCarloTrials ?? JIRA_CONFIG.PREDICTION.MONTE_CARLO_TRIALS,
        DEFAULT_UTILIZATION: p?.defaultUtilization ?? JIRA_CONFIG.PREDICTION.DEFAULT_UTILIZATION,
        ETA_EFFORT_GAP_THRESHOLD: p?.etaEffortGapThreshold ?? JIRA_CONFIG.PREDICTION.ETA_EFFORT_GAP_THRESHOLD,
        SP_COVERAGE_THRESHOLD: p?.spCoverageThreshold ?? JIRA_CONFIG.PREDICTION.SP_COVERAGE_THRESHOLD,
        WORKLOG_COVERAGE_THRESHOLD: p?.worklogCoverageThreshold ?? JIRA_CONFIG.PREDICTION.WORKLOG_COVERAGE_THRESHOLD,
        // 아래 필드들은 store에 없으므로 config 고정
        MONTE_CARLO_MAX_DAYS: JIRA_CONFIG.PREDICTION.MONTE_CARLO_MAX_DAYS,
        // ... 기타 store 미포함 상수
    };
}
export function resolveFields() {
    const f = getActiveRules()?.fields;
    return {
        STORY_POINT: f?.storyPoint ?? JIRA_CONFIG.FIELDS.STORY_POINT,
        PLANNED_START: f?.plannedStart ?? JIRA_CONFIG.FIELDS.PLANNED_START,
        ACTUAL_START: f?.actualStart ?? JIRA_CONFIG.FIELDS.ACTUAL_START,
        ACTUAL_DONE: f?.actualDone ?? JIRA_CONFIG.FIELDS.ACTUAL_DONE,
        DIFFICULTY: f?.difficulty ?? JIRA_CONFIG.FIELDS.DIFFICULTY,
    };
}
```

### K1(v1.0.9) 리팩토링

v1.0.9의 `resolveKpiRules()`가 이 헬퍼 모듈의 함수들을 조합하도록 정리 → 중복 제거.

---

## Phase 1 — statusNames 통합 (High, 2h)

### S1-1. `useBacklogForecast.ts` L75

```ts
// 현재
const onHold = active.filter((i) => i.fields.status?.name === JIRA_CONFIG.STATUS_NAMES.ON_HOLD);

// 수정
import { resolveOnHoldStatus } from '@/lib/kpi-rules-resolver';
const onHoldName = resolveOnHoldStatus();
const onHold = active.filter((i) => i.fields.status?.name === onHoldName);
```

### S1-2. `project-stats-dialog.tsx` L120-121

```ts
// 현재
const isOnHold = (i: JiraIssue) => (i.fields.status?.name?.trim() ?? '') === (JIRA_CONFIG.STATUS_NAMES?.ON_HOLD ?? '보류');
const isCancelled = (i: JiraIssue) => (i.fields.status?.name?.trim() ?? '') === (JIRA_CONFIG.STATUS_NAMES?.CANCELLED ?? '취소');

// 수정 — store 구독으로 즉시 반영
const kpiRules = useKpiRulesStore((s) => s.rules); // 이미 K4에서 추가됨
const onHoldName = kpiRules.statusNames?.onHold ?? JIRA_CONFIG.STATUS_NAMES.ON_HOLD;
const cancelledName = kpiRules.statusNames?.cancelled ?? JIRA_CONFIG.STATUS_NAMES.CANCELLED;
const isOnHold = (i: JiraIssue) => (i.fields.status?.name?.trim() ?? '') === onHoldName;
const isCancelled = (i: JiraIssue) => (i.fields.status?.name?.trim() ?? '') === cancelledName;
```

### S1-3. `perAssigneeForecast.ts` L48, L52

```ts
// 현재 — 모듈 스코프는 함수 진입 시 resolve로 변경
function isOnHold(issue: JiraIssue): boolean {
    return issue.fields.status?.name === JIRA_CONFIG.STATUS_NAMES.ON_HOLD;
}

// 수정
import { resolveOnHoldStatus, resolveCancelledStatus } from '@/lib/kpi-rules-resolver';
function isOnHold(issue: JiraIssue): boolean {
    return issue.fields.status?.name === resolveOnHoldStatus();
}
function isCancelled(issue: JiraIssue): boolean {
    return issue.fields.status?.name === resolveCancelledStatus();
}
```

### S1-4. `effortEstimation.ts` L256

```ts
// 수정
return cat !== 'done' && name !== resolveCancelledStatus();
```

**테스트**: `perAssigneeForecast.test.ts`, `useBacklogForecast` 간접 테스트에 "store에서 status명 변경" 케이스 추가.

---

## Phase 2 — dashboardProjectKey 통합 (Medium, 1.5h)

⚠️ **주의사항**: `dashboardProjectKey`는 **TanStack Query key**로 사용되므로 변경 시 React 컴포넌트 재렌더 + 쿼리 재요청이 필요합니다. store 변경이 실시간 반영되려면 컴포넌트에서 훅으로 구독해야 함.

### S2-1. `dashboard.tsx` L59

```ts
// 현재
queryKey: ['epics', JIRA_CONFIG.DASHBOARD?.PROJECT_KEY ?? 'IGMU'],

// 수정
const projectKey = useKpiRulesStore((s) => s.rules.dashboardProjectKey);
queryKey: ['epics', projectKey],
```

### S2-2. `useBacklogForecast.ts` L66

```ts
// 현재
const projectKey = options?.projectKey ?? JIRA_CONFIG.DASHBOARD.PROJECT_KEY;

// 수정 — options.projectKey 우선 + store fallback
import { resolveDashboardProjectKey } from '@/lib/kpi-rules-resolver';
const projectKey = options?.projectKey ?? resolveDashboardProjectKey();
```

### S2-3. `progress-trends/index.tsx` L72

```ts
// 현재
const projectKey = JIRA_CONFIG.DASHBOARD.PROJECT_KEY; // IGMU 고정

// 수정
const projectKey = useKpiRulesStore((s) => s.rules.dashboardProjectKey);
```

### S2-4. `jiraClient.ts` L298 (보류)

```ts
const pk = (JIRA_CONFIG.DASHBOARD?.PROJECT_KEY ?? 'IGMU').trim();
```

**이 파일은 API 계층이고 store 초기화 전에도 호출될 수 있음. JIRA_CONFIG 유지 또는 명시적 param으로 교체 검토.**

**선택**: 호출자(`jiraApi.getEpics()`)가 projectKey를 명시적으로 전달하도록 시그니처 수정 — API 레이어는 `JIRA_CONFIG` fallback만 유지.

**테스트**: dashboard 테스트 (신설 필요) — store에서 `dashboardProjectKey: 'TEST'` 변경 시 epics 쿼리 key가 `['epics', 'TEST']`로 바뀌는지.

---

## Phase 3 — weekStartsOn 통합 (Medium, 0.5h)

### S3-1. `date-utils.ts` L158, L163

```ts
// 현재
export function startOfKoreanWeek(date: Date): Date {
    return startOfWeek(date, { weekStartsOn: JIRA_CONFIG.WEEK_STARTS_ON });
}
export function endOfKoreanWeek(date: Date): Date {
    return endOfWeek(date, { weekStartsOn: JIRA_CONFIG.WEEK_STARTS_ON });
}

// 수정
import { resolveWeekStartsOn } from '@/lib/kpi-rules-resolver'; // 순환 import 주의
export function startOfKoreanWeek(date: Date): Date {
    return startOfWeek(date, { weekStartsOn: resolveWeekStartsOn() });
}
export function endOfKoreanWeek(date: Date): Date {
    return endOfWeek(date, { weekStartsOn: resolveWeekStartsOn() });
}
```

⚠️ **순환 import 방지**: `kpi-rules-resolver` → `kpiRulesStore` → `JIRA_CONFIG`만 참조. `date-utils`는 resolver를 참조하지만 resolver는 `date-utils`를 import하지 않으므로 안전.

**테스트**: date-utils.test.ts에 "store에서 weekStartsOn 일요일(0)로 변경 후 startOfKoreanWeek 확인" 1 케이스.

---

## Phase 4 — prediction.* 통합 (High, 3h)

**핵심 난제**: 5개 prediction 서비스가 **모듈 스코프 `const C = JIRA_CONFIG.PREDICTION`**으로 값을 캡처 → 모듈 로드 시점 값 고정.

### 전략 — 함수 진입 시점 resolve

```ts
// 현재 (confidence.ts L14)
const C = JIRA_CONFIG.PREDICTION;
export function someFn() {
    if (days < C.DEFAULT_HISTORY_DAYS) { ... }
}

// 수정
import { resolvePredictionConfig } from '@/lib/kpi-rules-resolver';
export function someFn() {
    const C = resolvePredictionConfig(); // 함수 진입 시마다 최신 값
    if (days < C.DEFAULT_HISTORY_DAYS) { ... }
}
```

### 영향받는 5개 파일

| 파일 | 현재 `const C` 참조 | 수정 범위 |
|------|-----------------|---------|
| `confidence.ts` | L14 | 모든 export 함수 진입부에 `const C = resolvePredictionConfig()` 추가 |
| `crossValidation.ts` | L20 | 동일 |
| `effortEstimation.ts` | L25 | 동일 |
| `perAssigneeForecast.ts` | L29 | 동일 |
| `scopeAnalysis.ts` | L18 | 동일 |
| `useBacklogForecast.ts` | L65 (간접) | 이미 options 우선 + resolve fallback 패턴 |

**성능 영향**: resolver는 Zustand `getState()` 호출 + 객체 리터럴 생성. µs 단위로 무시 가능.

### 리팩토링 순서

1. `kpi-rules-resolver.ts` 신설 (헬퍼)
2. 5개 prediction 서비스를 한꺼번에 교체 (모두 동일 패턴)
3. 기존 `perAssigneeForecast.test.ts` 183 케이스가 통과하는지 확인
4. 신규 "store에서 monteCarloTrials=500 변경 후 simulation 결과 영향" 검증 케이스 추가

---

## Phase 5 — 나머지 fields.* (Low, 1h)

### S5-1. `JIRA_CONFIG.FIELDS.STORY_POINT`

현재 5개 파일에서 참조. `resolveFields().STORY_POINT`로 교체. 빈도 낮으나 resolver 도입 이후 일괄 처리.

### S5-2. DIFFICULTY, PLANNED_START, ACTUAL_START

동일 패턴. `difficulty-mini-pie.tsx`, `project-stats-dialog.tsx` 등에서 `resolveFields()` 호출.

**주의**: `issue.fields[JIRA_CONFIG.FIELDS.STORY_POINT]` 처럼 **동적 key 접근**이 많음 → 변수로 재대입만 하면 되므로 risk 낮음.

---

## 일정

```
D1 AM │ 공통 헬퍼 신설 (kpi-rules-resolver.ts) + K1 리팩토링  (2h)
D1 PM │ Phase 1: statusNames 5곳 교체 + 테스트              (2h)
D2 AM │ Phase 2: dashboardProjectKey 3곳 + jiraClient 결정  (2h)
D2 AM │ Phase 3: weekStartsOn 통합                          (0.5h)
D2 PM │ Phase 4: prediction.* 5개 서비스 일괄 교체          (3h)
D2 PM │ Phase 5: fields.* 나머지 일괄 교체                  (1h)
D2 말 │ 통합 테스트 + PATCH.md v1.0.10 + 커밋              (1h)

총: 1.5일 (11.5h)
```

---

## 검증 기준

### Phase 1 (statusNames)
- [ ] 설정 UI → `statusNames.onHold` 를 `"대기중"` 으로 변경 → 프로젝트 통계 다이얼로그가 "대기중" 상태를 보류로 인식
- [ ] `perAssigneeForecast` 계산에서 커스텀 status 사용 시 카운트 정확

### Phase 2 (dashboardProjectKey)
- [ ] 설정 UI → `dashboardProjectKey` 를 `"FO"` 로 변경 → dashboard가 FO 프로젝트의 epic 로드
- [ ] TanStack Query cache 적절히 invalidate됨

### Phase 3 (weekStartsOn)
- [ ] 설정 UI → `weekStartsOn: 0` (일요일) 변경 → "이번주 완료" 카운트가 일~토 기준으로 집계

### Phase 4 (prediction)
- [ ] 설정 UI → `monteCarloTrials: 500` 변경 → Monte Carlo 시뮬레이션이 500회만 실행되는지 (로그 확인)
- [ ] `defaultHistoryDays: 7` 변경 → 처리량 통계가 최근 7일만 사용

### Phase 5 (fields)
- [ ] 설정 UI → `fields.difficulty` 를 다른 field ID로 변경 → 난이도 파이차트가 변경된 필드 읽음

### 비기능
- [ ] 기존 vitest 235 케이스 통과 + 신규 8~10 케이스 추가
- [ ] tsc 에러 0, lint 에러 0
- [ ] store 변경 후 수동 앱 새로고침 없이 대시보드에 즉시 반영 (React.memo 캐시 주의)

---

## 보호 (변경 안 함)

```
✋ JIRA_CONFIG 파일 자체 — fallback 용도 유지 (삭제하지 말 것)
✋ prediction 서비스의 알고리즘 자체 — 값 소스만 변경
✋ Zustand persist 키 (jira-dash-kpi-rules)
✋ kpiService의 계산 흐름 (v1.0.9에서 확립된 resolveKpiRules 패턴)
✋ 감사 보고서 §5.0 (지표 구조 유연성) — 별도 문서·별도 마일스톤
```

---

## 위험 & 완화

| 위험 | 확률 | 완화 |
|------|------|------|
| Phase 4 성능 저하 (getState() 반복 호출) | 낮음 | benchmark로 확인 — µs 단위라 무시 가능 |
| dashboardProjectKey 변경 시 캐시 stale | 중간 | TanStack Query의 queryKey 기반 자동 invalidation으로 해결. 추가로 `queryClient.invalidateQueries()` 명시 |
| date-utils ↔ kpi-rules-resolver 순환 import | 낮음 | resolver는 date-utils를 import하지 않음 확인 |
| jiraClient.ts L298의 store 초기화 전 호출 | 낮음 | JIRA_CONFIG fallback 유지 + nullish coalescing |
| 모듈 스코프 `const C` 제거로 인한 hot-path 영향 | 낮음 | 리팩토링 후 기존 183 테스트 통과 여부로 회귀 방지 |

---

## 다음 액션

```
□ 본 계획서 검토
□ Phase 1 시작 (가장 높은 ROI)
□ 각 Phase 완료 시 vitest + tsc 중간 검증
□ 전체 완료 후 PATCH.md에 v1.0.10 항목 추가 + 커밋
```

---

## 관련 문서

- `docs/kpi-rules-fix-plan.md` — v1.0.9 완료 (K1~K13, 13건)
- `docs/kpi-rules-audit-report.md` — 내부 감사 보고서 (본 계획의 기반)
- `docs/kpi-management-ui-plan.md` — Level 4 UI 설계 (v1.0.8)
- 감사 보고서 §5.0 (구조적 경직성): **별도 ADR 문서 작성 예정**

---

**문서 끝.**
