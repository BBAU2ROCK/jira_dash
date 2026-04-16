# 진행 추이 예측 분석 보고서

> **프로젝트**: JIRA Dashboard — Progress Trends / Prediction System  
> **분석일**: 2026-04-16  
> **분석 범위**: 예측 서비스 10개 모듈, UI 컴포넌트 24개, 훅 2개, 스토어 3개, 회고 서비스 2개, 유틸 3개  
> **코드 내 TODO/FIXME 마커**: 0건 (모든 이슈는 코드 리뷰를 통해 식별)

---

## 1. 시스템 아키텍처 개요

### 1.1 전체 구조

예측 시스템은 **Section A (예측)**과 **Section B (회고)** 두 영역으로 구성되며, `ProjectStatsDialog`의 세 번째 탭 "진행 추이/예측"에서 렌더링됩니다.

```
Dashboard
  └─ ProjectStatsDialog (3개 탭)
       ├─ 프로젝트 현황
       ├─ KPI 성과
       └─ 진행 추이/예측 ← ProgressTrends 컴포넌트
            ├─ Section A: 예측 (useBacklogForecast 오케스트레이션)
            └─ Section B: 회고 (analyzeEpicsRetrospective)
```

### 1.2 데이터 흐름

```
issues (에픽별 Jira 이슈)
  │
  ├─► useBacklogForecast ──► counts, dailySeries, team, effort, validation, cycleTimeStats
  │     ├─ perAssigneeForecast (담당자별 MC 예측)
  │     ├─ effortEstimation (공수 추정)
  │     ├─ crossValidation (ETA-공수 교차검증)
  │     ├─ cycleTimeAnalysis (사이클 타임)
  │     └─ forecastHistoryStore (예측 스냅샷 기록)
  │
  ├─► useDefectKpiAggregation ──► defectKpi (결함 밀도)
  │
  └─► analyzeEpicsRetrospective ──► perEpic, comparison, strengthMatrix
```

### 1.3 Section A — 예측 (Forecast) 구성요소

| 카테고리 | 컴포넌트 | 역할 |
|---------|---------|------|
| 현황 | BacklogStateCards | 총 이슈, 활성, 보류, 미배정, 90일 완료, 기한미설정 |
| 일일 활동 | TodayWeekCards, DailyCompletionChart | 오늘/이번주 완료 + 30일 바 차트 |
| 지연 분석 | DelayCards | 진행중 초과, 기한 후 완료, 기한 미설정 |
| 완료 예측 | SprintForecastCard, EtaScenarioCard, ForecastFunnelChart, ForecastAccuracyCard | MC P50/P85/P95, 스프린트 리스크, 예측 정확도 |
| 공수 분석 | EffortReportCard, EtaEffortConsistency, CycleTimeCard, PerIssueEffortTable | Worklog/SP/난이도 추정, 교차검증, 사이클 타임 |
| 팀 분포 | WorkloadScatter, PerAssigneeTable | 워크로드 사분면, 담당자별 예측 |

### 1.4 Section B — 회고 (Retrospective) 구성요소

| 컴포넌트 | 역할 |
|---------|------|
| EpicRetroCard | 에픽별 KPI 등급, 완료율/준수율/사이클타임, 기여자 |
| EpicDefectCard | 에픽별 결함 밀도, 심각도 분류 |
| MultiEpicCompare | 에픽 간 KPI 델타 비교 (2개 이상 선택 시) |
| DeveloperStrengthMatrix | 담당자 x 이슈유형별 사이클 타임 히트맵 |
| DefectPatternCard | 담당자별 결함 패턴 |

---

## 2. 핵심 알고리즘 검증

### 2.1 Monte Carlo 시뮬레이션

- **방식**: 10,000회 부트스트랩 리샘플링. 매 시행마다 과거 일별 처리량에서 랜덤 샘플링하여 잔여 이슈가 0이 될 때까지 시뮬레이션
- **출력**: P50 (낙관), P85 (현실), P95 (비관) 완료 일수
- **Worker 오프로드**: `workSize > 50,000`이면 Web Worker에서 실행
- **Seeded RNG**: Mulberry32 기반 재현 가능한 결과
- **판정**: 정상 구현됨

### 2.2 신뢰도 체계 (Confidence)

- 활동일, scope ratio, CV 기반 4단계 분류: `high` / `moderate` / `low` / `unreliable`
- 각 수준별 UI guidance와 경고 메시지 자동 연동
- **판정**: 정상 구현됨 (단, JSDoc 불일치 있음 — 5.5 참조)

### 2.3 교차 검증 (Cross-Validation)

- MC throughput 기반 ETA vs 공수 기반 ETA 비교
- Gap 30% 초과 시 `process-inefficiency` 또는 `effort-undercount` 진단
- **판정**: 정상 구현됨

### 2.4 정확도 추적 (Accuracy Tracking)

- 예측 스냅샷 자동 기록 + 백로그 완료 시 실적 자동 연결
- MAE, P50/P85/P95 hit rate, calibration 자동 산출
- **판정**: 로직은 정상이나 Calendar vs Business Days 혼용 문제 있음 (3.2 참조)

---

## 3. Critical 이슈 — 예측 정확도에 직접 영향 (4건)

### 3.1 [C1] Monte Carlo 시뮬레이션에 Scope Creep 미반영

**파일**: `src/services/prediction/perAssigneeForecast.ts` — `buildForecast()`, `teamForecast()`

**현상**: `monteCarloForecast.ts`는 `creationHistory` 파라미터를 지원하여 시뮬레이션 중 신규 이슈 생성을 반영할 수 있으나, 실제 호출부인 `buildForecast`/`teamForecast`에서 이 값을 **전달하지 않습니다**.

**영향**: Scope 증가가 confidence/warning 텍스트에만 반영되고, 실제 MC 시뮬레이션 결과(P50/P85/P95 일수)에는 반영되지 않습니다. **이슈 생성이 활발한 프로젝트에서 예측이 낙관적으로 치우칩니다.**

**근거**: `monteCarloForecast.test.ts`에 `creationHistory` 테스트가 존재하여 기능 자체는 검증 완료. 연결만 누락된 상태.

**권고**: `buildForecast`에서 `dailyCreations`를 MC의 `creationHistory`로 전달. `teamForecast`도 동일 적용.

---

### 3.2 [C2] 정확도 추적의 Calendar vs Business Days 혼용

**파일**: `src/services/prediction/accuracyTracking.ts` — `computeAccuracy()`

**현상**: MAE 계산 시 `differenceInCalendarDays`를 사용하지만, MC 예측값은 **business days** 기반입니다.

**영향**: 주말/공휴일이 포함된 기간에서 실제 소요 일수(calendar)가 예측 일수(business)보다 항상 크게 나와, **MAE가 실제보다 높게(나쁘게) 산출**됩니다. P85 hit rate 기반 calibration 판정도 영향을 받아 모델이 `over-confident`로 오판될 수 있습니다.

**권고**: `accuracyTracking`에서 `businessDaysBetween`을 사용하여 단위를 통일하거나, 예측값을 calendar days로 변환 후 비교.

---

### 3.3 [C3] KPI Rules Store와 JIRA_CONFIG 간 설정 불일치

**파일**: `src/services/kpiService.ts`, `src/stores/kpiRulesStore.ts`

**현상**: `kpiService.ts`의 `calculateKPI()`는 done date 판별에 `JIRA_CONFIG`의 labels/field keys를 **직접 참조**하지만, KPI Rules Store에서 사용자가 override한 Jira 필드/라벨 값은 이 함수에 전달되지 않습니다.

**영향**: KPI Rules UI에서 필드를 변경해도 실제 KPI 계산에 반영되지 않아, **UI 설정과 실제 동작이 괴리**됩니다. 에픽 회고의 KPI 등급 산출에도 동일한 문제가 전파됩니다.

**권고**: A안) 모든 서비스가 `kpiRulesStore`를 single source of truth로 사용, B안) 편집 불필요한 필드는 UI에서 제거.

---

### 3.4 [C4] 에픽 회고 On-time 판정 기준 불일치

**파일**: `src/services/retrospective/epicRetro.ts` — `isOnTime()`, `buildEpicRetroSummary()`

**현상**: `epicRetro.ts`의 `isOnTime()`은 `resolutiondate`와 `duedate`로 준수 여부를 판정하지만, `kpiService.ts`는 `ACTUAL_DONE` 커스텀 필드를 사용할 수 있습니다. 동일 에픽의 회고 요약 내에서 `completionRate`(isOnTime)과 `kpiGrade`(calculateKPI)가 **서로 다른 날짜 기준**을 사용합니다.

**영향**: 하나의 에픽 회고 카드에서 "기한 준수율"과 "KPI 등급"이 **상충하는 결과**를 보여줄 수 있어, 사용자 혼란을 유발합니다.

**권고**: `epicRetro.ts`의 `isOnTime()`이 `getCompletionDate()` 헬퍼를 공유하여 ACTUAL_DONE 우선 참조하도록 통일.

---

## 4. Major 개선사항 — 기능 완성도 및 UX (5건)

### 4.1 [M1] 담당자별 Scope Ratio 항상 0

**파일**: `src/services/prediction/perAssigneeForecast.ts`

**현상**: 개인별 `computeThroughputStats` 호출 시 `creationCount`를 `0`으로 전달. 개인별 scope 경고/신뢰도가 항상 `stable`로 표시됨.

**권고**: 해당 담당자의 daily creation 수를 전달하여 개인별 scope 상태도 의미있게 반영.

---

### 4.2 [M2] Sprint Forecast 무음 숨김

**파일**: `src/components/progress-trends/SprintForecastCard.tsx`

**현상**: 보드/스프린트/팀 데이터 없으면 `return null`로 카드 자체가 숨겨짐. 왜 안 보이는지 사용자 피드백 없음.

**권고**: empty state UI 표시. "스크럼 보드가 없습니다" / "활성 스프린트가 없습니다" 등 구체적 안내.

---

### 4.3 [M3] PDF Export 미흡

**파일**: `src/lib/export.ts`

**현상**: `window.print()` 호출만 하는 수준. 인쇄용 CSS 미적용 시 레이아웃 깨짐 가능.

**권고**: `@media print` CSS 작성 또는 html2canvas/jspdf 기반 렌더링 도입.

---

### 4.4 [M4] Barrel Export 누락

**파일**: `src/services/prediction/index.ts`

**현상**: `sprintForecast`, `cycleTimeAnalysis`, `accuracyTracking`이 barrel에서 re-export되지 않음.

**권고**: barrel에 추가하여 import 경로 일관성 확보.

---

### 4.5 [M5] Confidence 문서-코드 불일치

**파일**: `src/services/prediction/confidence.ts`

**현상**: JSDoc은 "활동일 < 30"을 언급하나 실제 코드는 `activeDays < 14` 사용. 유지보수 시 혼동 유발.

**권고**: JSDoc을 실제 코드 기준(`14`)으로 정정.

---

## 5. Minor 이슈 — 코드 품질 및 유지보수 (7건)

| ID | 항목 | 설명 | 위치 |
|----|------|------|------|
| m1 | Hardcoded Jira URL | `okestro.atlassian.net`이 3개 파일에 하드코딩 | PerIssueEffortTable, EpicRetroCard, EpicDefectCard |
| m2 | PerAssigneeTable colSpan | 테이블 컬럼 8개이나 빈 상태 행이 colSpan={7} 사용 | PerAssigneeTable.tsx |
| m3 | MultiEpicCompare React 타입 | React.ReactNode 사용하나 React import 누락 가능성 | MultiEpicCompare.tsx |
| m4 | Holiday 범위 제한 | 한국 공휴일 데이터가 2025~2030년만 커버 | src/lib/date-utils.ts |
| m5 | Cross-validation 무의미한 guard | `if (!team.realistic)` 체크가 있으나 realistic은 항상 객체로 존재 | crossValidation.ts |
| m6 | Async MC Worker 테스트 부재 | monteCarloForecastAsync의 Worker 분기가 단위 테스트에서 미커버 | monteCarloForecast.ts |
| m7 | forecastHistoryStore pruneStale | JSDoc에 1000건 초과 정리 언급하나 실제는 addRecord에서만 수행 | forecastHistoryStore.ts |

---

## 6. 잘 구현된 영역 (강점)

### 6.1 예측 엔진
Monte Carlo 10,000회 시뮬레이션 + Web Worker 오프로드, seeded RNG, 비활성일 포함 throughput 배열 등 **통계적으로 견고한 구현**. P50/P85/P95 3단계 시나리오 제공.

### 6.2 신뢰도 체계
활동일, scope ratio, CV 기반 다단계 confidence 분류 (high/moderate/low/unreliable). 각 수준별 **UI guidance와 경고 메시지 자동 연동**.

### 6.3 교차 검증
MC throughput 기반 ETA와 공수 기반 ETA를 비교하여 process inefficiency / effort undercount 진단. **두 모델의 정합성을 자동 검증**.

### 6.4 정확도 추적
예측 스냅샷 자동 기록 + 백로그 완료 시 실적 자동 연결. MAE, hit rate, calibration 자동 산출. **90일 자동 정리**로 데이터 비대화 방지.

### 6.5 테스트 커버리지
9개 테스트 파일이 핵심 예측 로직(MC, per-assignee, sprint, cycle time, accuracy, confidence, scope, effort, cross-validation)을 커버. **Edge case 처리 포함**.

### 6.6 익명화 / 내보내기
결정론적 별칭 기반 이름 익명화로 공유 안전성 확보. **Excel 5시트 내보내기** (요약/일별/담당자/이슈별/예측이력) 구현 완료.

---

## 7. 개선 권고 우선순위

### Phase 1 — 예측 정확도 핵심 수정 (높은 우선순위)

1. **C1**: `buildForecast`에 `dailyCreations`를 MC의 `creationHistory`로 전달
2. **C2**: `accuracyTracking`에서 `businessDaysBetween`으로 통일
3. **M1**: 개인별 forecasting에 실제 creation count 전달

### Phase 2 — 데이터 일관성 수정 (중간 우선순위)

4. **C3**: `kpiService`가 KPI Rules Store를 우선 참조하도록 수정 (또는 편집 불가 필드 UI 제거)
5. **C4**: `epicRetro`의 `isOnTime`이 `getCompletionDate` 헬퍼를 공유하도록 통일
6. **M5**: `confidence.ts` JSDoc 정정

### Phase 3 — UX 및 기능 보완 (낮은 우선순위)

7. **M2**: Sprint card empty state UI 추가
8. **M3**: PDF export 개선 (`@media print` 또는 html2canvas)
9. **M4**: Barrel export 추가
10. **m1~m7**: 코드 품질 개선 (Hardcoded URL, colSpan, holiday 범위 등)

---

## 부록: 분석 대상 파일 목록

**예측 서비스** (`src/services/prediction/`)
- `monteCarloForecast.ts`, `monteCarloForecast.worker.ts`
- `perAssigneeForecast.ts`
- `confidence.ts`, `scopeAnalysis.ts`
- `effortEstimation.ts`, `crossValidation.ts`
- `sprintForecast.ts`, `cycleTimeAnalysis.ts`, `accuracyTracking.ts`
- `types.ts`, `index.ts`

**UI 컴포넌트** (`src/components/progress-trends/`)
- `index.tsx` (ProgressTrends 메인)
- BacklogStateCards, TodayWeekCards, DailyCompletionChart, DelayCards
- SprintForecastCard, EtaScenarioCard, ForecastFunnelChart, ForecastAccuracyCard
- EffortReportCard, EtaEffortConsistency, CycleTimeCard, PerIssueEffortTable
- WorkloadScatter, PerAssigneeTable
- EpicRetroCard, EpicDefectCard, MultiEpicCompare, DeveloperStrengthMatrix, DefectPatternCard
- CategorySection, SectionDivider, MethodologyDialog, ExportMenu

**훅/스토어/유틸**
- `src/hooks/useBacklogForecast.ts`, `src/hooks/useDefectKpiAggregation.ts`
- `src/stores/forecastHistoryStore.ts`, `src/stores/displayPreferenceStore.ts`, `src/stores/kpiRulesStore.ts`
- `src/services/retrospective/epicRetro.ts`, `src/services/retrospective/types.ts`
- `src/services/kpiService.ts`
- `src/lib/date-utils.ts`, `src/lib/export.ts`, `src/lib/anonymize.ts`
