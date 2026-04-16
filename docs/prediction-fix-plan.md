# 진행 추이/예측 — 수정 계획서

> **기반**: 코드리뷰 분석 보고서 (Critical 4 + Major 5 + Minor 7 + 추가 발견 6 = 22건)
> **작성 일자**: 2026-04-16
> **총 공수**: 약 3일

---

## 수정 대상 (22건)

### 심각도별 요약

| 심각도 | 건수 | 작업 |
|--------|------|------|
| Critical | 4 (C1~C4) | 예측 정확도·데이터 일관성 |
| High | 1 (X2) | Excel export 익명화 누락 |
| Major | 5 (M1~M5) | Scope ratio·Sprint empty·PDF·barrel·JSDoc |
| Medium | 1 (C2 강등) | Calendar vs Business days |
| Low | 11 (m1~m7, X1·X3·X4·X5·X6) | 코드 품질 |

---

## Phase 1 — 예측 정확도 핵심 수정 (1일)

가장 높은 ROI. 예측 숫자가 직접 바뀜.

### C1. Monte Carlo에 Scope Creep 실제 반영

**파일**: `src/services/prediction/perAssigneeForecast.ts`

**현재**: `buildForecast(remaining, throughput, totalCreations, now)` → MC에 `creationHistory` 미전달
```ts
// line 145 — 현재
const mc = monteCarloForecast(remaining, throughput, {
    trials: C.MONTE_CARLO_TRIALS,
    maxDays: C.MONTE_CARLO_MAX_DAYS,
    rng,
});
```

**수정**:
```ts
// 수정 — creationHistory를 dailyCreations로 전달
const creationHist = dailyCreations(issues, historyDays, now); // issues는 인자로 전달 필요
const mc = monteCarloForecast(remaining, throughput, {
    trials: C.MONTE_CARLO_TRIALS,
    maxDays: C.MONTE_CARLO_MAX_DAYS,
    rng,
    creationHistory: creationHist,
});
```

**영향**: buildForecast 시그니처에 `issues` 또는 `creationHistory: number[]` 인자 추가 필요.
**테스트**: 기존 MC 테스트의 "Scope creep 보정" 케이스가 이미 있음 — 통합 테스트 추가.

---

### C2 (→Medium). Calendar vs Business Days 통일

**파일**: `src/services/prediction/accuracyTracking.ts`

**현재**: `differenceInCalendarDays(actual, recorded)` (line 52)

**수정**:
```ts
import { businessDaysBetween } from '@/lib/date-utils';
const actualDays = Math.max(0, businessDaysBetween(new Date(r.recordedAt), actual));
```

**참고**: MC p85Days 자체가 throughput history 기반 (주말 0 포함 시 calendar-ish)이므로 영향은 제한적. 단 일관성 위해 통일 권장.
**테스트**: accuracyTracking.test.ts의 "정확히 P85대로 완료" 케이스 조정.

---

### M1. 개인별 Scope Ratio 실제 반영

**파일**: `src/services/prediction/perAssigneeForecast.ts`

**현재**: `computeThroughputStats(throughput, 0)` — 항상 creationCount=0 → ratio=0
**수정**: 개인별 creation count 산출 후 전달 (또는 개인 단위 scope ratio는 의미 없으니 팀 ratio 전파)

**권장**: 개인 scope ratio 대신 팀 전체 scope ratio를 각 개인의 stats에도 주입 (현실적).
```ts
const stats = computeThroughputStats(throughput, teamCreationCount);
```

---

## Phase 2 — 데이터 일관성 수정 (0.5일)

### C3. KPI Rules Store 완전 연동

**파일**: `src/services/kpiService.ts`

**현재**: `JIRA_CONFIG.LABELS.AGREED_DELAY`, `JIRA_CONFIG.FIELDS.ACTUAL_DONE` 직접 참조

**수정**:
```ts
function getActiveRules() {
    try {
        return useKpiRulesStore.getState().rules;
    } catch {
        return null; // fallback to JIRA_CONFIG
    }
}

// calculateKPI 내부에서:
const rules = getActiveRules();
const agreedDelayLabel = rules?.labels.agreedDelay ?? JIRA_CONFIG.LABELS.AGREED_DELAY;
const verificationDelayLabel = rules?.labels.verificationDelay ?? JIRA_CONFIG.LABELS.VERIFICATION_DELAY;
const actualDoneField = rules?.fields.actualDone ?? JIRA_CONFIG.FIELDS.ACTUAL_DONE;
```

**테스트**: 기존 kpiService.test.ts에 "store override" 케이스 추가.

---

### C4. 에픽 회고 On-time 판정 통일

**파일**: `src/services/retrospective/epicRetro.ts`

**현재**:
```ts
function isOnTime(issue) {
    const done = parseLocalDay(issue.fields.resolutiondate);  // ← actualDone 미사용
}
```

**수정**: kpiService와 동일한 `getCompletionDate` 헬퍼 추출·공유.
```ts
// perAssigneeForecast.ts에 이미 있는 getCompletionDate 재사용:
const done = getCompletionDate(issue);
```

**영향**: epicRetro.ts import 추가만. 산식 변경 없음.

---

### M5. confidence.ts JSDoc 정정

**파일**: `src/services/prediction/confidence.ts`
**현재**: JSDoc `활동일 < HIGH_CONFIDENCE_ACTIVE_DAYS (30)` → 실제 코드 `activeDays < 14`
**수정**: JSDoc을 코드에 맞게 수정 (14일).

---

## Phase 3 — 보안/UX 수정 (0.5일)

### X2 (High). Excel export 익명화 미적용

**파일**: `src/lib/export.ts`

**현재**: `team.perAssignee.displayName` 그대로 Excel에 기록 → 익명 모드 무력화

**수정**:
```ts
export async function exportToExcel(payload: ExportPayload & { anonymizeMode?: boolean }): Promise<void> {
    // anonymize 매핑 생성
    const anonMap = payload.anonymizeMode
        ? buildAnonymizeMap(payload.team?.perAssignee.map(r => r.displayName) ?? [])
        : null;
    const anon = (name: string) => anonMap ? maybeAnonymize(name, anonMap, true) : name;

    // Per-assignee 시트에서:
    (payload.team?.perAssignee ?? []).forEach((p) => {
        assigneeRows.push([anon(p.displayName), ...]);
    });
}
```

**ExportMenu에서**: `anonymizeMode` prop 전달.

---

### M2. Sprint card empty state UI

**파일**: `src/components/progress-trends/SprintForecastCard.tsx`

**현재**: `return null` (무음)
**수정**: 빈 상태 카드 표시:
```tsx
if (!activeSprint || !team) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            ℹ 스프린트 데이터 없음 — 칸반 보드이거나 활성 스프린트 없음
        </div>
    );
}
```

---

### M3. PDF export 인쇄 CSS 기본 적용

**파일**: `src/index.css` (추가)
```css
@media print {
    .no-print { display: none !important; }
    body { font-size: 12px; }
    /* 차트 SVG는 자동 포함됨 (recharts) */
}
```

**export.ts에서**: 인쇄 전 임시 class 토글 (헤더·사이드바 숨김).

---

## Phase 4 — 코드 품질 (1일)

### M4. barrel export 누락

**파일**: `src/services/prediction/index.ts`
```ts
// 추가:
export * from './sprintForecast';
export * from './cycleTimeAnalysis';
export * from './accuracyTracking';
```

---

### X1. useBacklogForecast의 `now` 고정 문제

**파일**: `src/hooks/useBacklogForecast.ts`
**수정**: refetch 시 now도 갱신되도록 useRef + 수동 갱신 패턴:
```ts
const [now, setNow] = React.useState(() => options?.now ?? new Date());
// refetch wrapper:
const refetchWithNow = () => { setNow(new Date()); refetch(); };
```

---

### X3. StrictMode 이중 기록 방지

**파일**: `src/hooks/useBacklogForecast.ts`
**수정**: useEffect 내 lastRecordedRef 이미 있으나, StrictMode에서 첫 호출도 2번 실행. useRef 기반 guard 보강.

---

### X4. anonymize 매핑 불안정

**파일**: `src/lib/anonymize.ts`
**수정 권장**: 인덱스 기반 → hash 기반으로 변경 (팀원 추가/삭제 시에도 기존 alias 유지).
```ts
function stableHash(name: string): number { /* djb2 */ }
function indexToLetter(hash: number): string { /* mod 26 */ }
```

---

### m1~m7 (Minor)

| # | 수정 | 공수 |
|---|------|------|
| m1 | `okestro.atlassian.net` → kpiRulesStore 또는 환경변수 | 0.25h |
| m2 | PerAssigneeTable colSpan 8로 수정 | 0.05h |
| m3 | MultiEpicCompare에 `import React` 확인 | 0.05h |
| m4 | date-holidays가 2030 이후도 지원 (라이브러리 자체) | 문서만 |
| m5 | crossValidation guard 제거 또는 조건 강화 | 0.1h |
| m6 | MC async Worker 분기 통합 테스트 추가 | 0.5h |
| m7 | forecastHistoryStore JSDoc 수정 | 0.05h |

---

## 일정

```
D1 AM │ Phase 1: C1 (MC scope creep 연결)           (0.5d)
D1 PM │ Phase 1: C2 (calendar→business) + M1 (개인 ratio) (0.5d)
D2 AM │ Phase 2: C3 (store 연동) + C4 (on-time 통일)   (0.5d)
D2 PM │ Phase 3: X2 (export 익명화) + M2 (sprint empty) + M3 (PDF CSS) (0.5d)
D3    │ Phase 4: M4·M5·X1·X3·X4 + m1~m7              (1d)

총: 3일
```

---

## 검증 기준

### Phase 1 후
- [ ] MC 시뮬레이션에 scope creep 활성화 → ETA가 이전보다 약간 길어지면 정상
- [ ] accuracyTracking MAE가 business days 기준
- [ ] 기존 183 tests 통과 + 신규 3~5 케이스 추가

### Phase 2 후
- [ ] kpiRulesStore에서 labels 변경 → kpiService 결과에 즉시 반영
- [ ] epicRetro on-time이 ACTUAL_DONE 필드 우선 사용
- [ ] confidence.ts JSDoc ↔ 코드 일치

### Phase 3 후
- [ ] 익명 모드 ON + Excel export → 시트 내 실명 0건
- [ ] Sprint 없는 프로젝트에서 empty state 카드 표시
- [ ] window.print()에서 차트·표 정상 출력

### Phase 4 후
- [ ] barrel import 정상 (`import { classifySprintRisk } from '@/services/prediction'`)
- [ ] 탭 1시간 열어둔 후 refetch → "오늘 완료" 카운트 정확
- [ ] 팀원 1명 추가 후 기존 인원의 alias 불변 (hash 기반)

---

## 보호 (변경 안 함)

```
✋ 기존 183 vitest 케이스 — 모두 통과 유지
✋ kpiService의 KPI 산식 흐름 — 가중치/등급만 store 참조, 핵심 로직 불변
✋ UI 컴포넌트 배치 — 구조 변경 없이 데이터 로직만 수정
```

---

## 다음 액션

```
□ 본 계획서 검토 + 우선순위 합의
□ Phase 1 시작 (가장 높은 ROI)
□ 각 Phase 완료 시 vitest + tsc 중간 검증
□ 전체 완료 후 v1.0.9 커밋
```

---

**문서 끝.**
