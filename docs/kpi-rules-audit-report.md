# KPI 규칙 정합성 분석 보고서

> **프로젝트**: JIRA Dashboard — KPI Rules System  
> **분석일**: 2026-04-16  
> **분석 범위**: kpiService, kpiRulesStore, KPI Rules UI(7개 에디터), defect KPI, 에픽 회고 KPI  
> **코드 내 TODO/FIXME 마커**: 0건

---

## 1. KPI 시스템 구조

### 1.1 3축 구성

```
KPI 시스템
  ├─ Delivery KPI ── calculateKPI() (kpiService.ts)
  │    ├─ 완료율 (completionRate)
  │    ├─ 준수율 (complianceRate)
  │    ├─ 조기 보너스 (earlyBonus)
  │    └─ 종합 등급 (totalScore + grade)
  │
  ├─ Defect KPI ── defectRateToGrade() (defect-kpi-utils.ts)
  │    ├─ 결함 밀도 (defectRatePercent)
  │    └─ 심각도 분류 (severityBreakdown)
  │
  └─ KPI Rules Store ── kpiRulesStore.ts (사용자 편집 가능)
       ├─ 등급 기준 (grades)
       ├─ 결함 등급 기준 (defectGrades)
       ├─ 가중치 (weights)
       ├─ 조기 보너스 단계 (earlyBonus)
       ├─ Jira 연결 (labels, fields, statusNames)
       ├─ 프로젝트 (projectKeys, weekStartsOn)
       └─ 예측 설정 (prediction)
```

### 1.2 KPI Rules UI 구성 (KpiRulesManager)

`JiraSettingsDialog` > `kpi-rules` 탭에서 접근하며 7개 에디터로 구성:

| 에디터 | 편집 대상 | Store 필드 |
|--------|----------|-----------|
| GradeEditor | KPI 등급 S/A/B/C 기준 | `grades` |
| GradeEditor (invertLabel) | 결함 등급 기준 | `defectGrades` |
| WeightEditor | 완료율/준수율 가중치 | `weights` |
| EarlyBonusEditor | 조기 보너스 단계 | `earlyBonus` |
| JiraFieldsEditor | 라벨, 상태명, 필드ID | `labels`, `statusNames`, `fields` |
| ProjectEditor | 프로젝트 키, 주 시작일 | `dashboardProjectKey`, `projectKeys`, `weekStartsOn` |
| PredictionConfigEditor | 예측 파라미터 | `prediction` |

---

## 2. 현재 기본 규칙값

### 2.1 KPI 등급 기준 (rate >= 이면 해당 등급)

| 등급 | 기준 |
|------|------|
| **S** | >= 95% |
| **A** | >= 90% |
| **B** | >= 80% |
| **C** | >= 70% |
| **D** | < 70% |

### 2.2 결함 등급 기준 (rate <= 이면 해당 등급, 낮을수록 우수)

| 등급 | 기준 |
|------|------|
| **S** | <= 5% |
| **A** | <= 10% |
| **B** | <= 15% |
| **C** | <= 20% |
| **D** | > 20% |

### 2.3 가중치

| 항목 | 비중 |
|------|------|
| 완료율 (completion) | 50% |
| 준수율 (compliance) | 50% |
| **합계** | **100%** |

### 2.4 조기 보너스 단계

| earlyRate 기준 | 보너스 점수 |
|---------------|-----------|
| >= 50% | +5 |
| >= 40% | +4 |
| >= 30% | +3 |
| >= 20% | +2 |
| >= 10% | +1 |
| < 10% | +0 |

### 2.5 Jira 연결 기본값

| 항목 | 값 |
|------|-----|
| agreed-delay 라벨 | `agreed-delay` |
| verification-delay 라벨 | `verification-delay` |
| 보류 상태명 | `보류` |
| 취소 상태명 | `취소` |
| Story Point 필드 | `customfield_10016` |
| 실제 완료일 필드 | `customfield_11485` |
| 난이도 필드 | `customfield_10017` |
| 대시보드 프로젝트 | `IGMU` |
| 주 시작일 | 월요일 (1) |

### 2.6 예측 설정 기본값

| 항목 | 값 |
|------|-----|
| 과거 이력 기간 | 30일 |
| Monte Carlo 시행 횟수 | 10,000회 |
| 가동률 (utilization) | 65% |
| ETA-공수 격차 임계값 | 30% |
| SP 커버리지 임계값 | 70% |
| Worklog 커버리지 임계값 | 30% |

---

## 3. KPI 산출 공식 상세 분석

### 3.1 totalScore 산출 공식

```
[분모]
kpiTotal = totalIssues - agreedDelayIssues

[분자 (agreed-delay 제외)]
kpiCompleted = max(completedIssues - agreedDelayDoneCount, 0)
kpiCompliant = max(compliantIssues - agreedDelayCompliantCount, 0)
kpiEarly    = max(earlyIssues - agreedDelayEarlyCount, 0)

[비율]
completionRate = min((kpiCompleted / kpiTotal) * 100, 100)
complianceRate = min((kpiCompliant / kpiTotal) * 100, 100)
earlyRate      = (kpiEarly / kpiTotal) * 100   ← 상한 없음

[보너스]
earlyBonus = getEarlyBonusFromRules(earlyRate, steps)

[종합 점수]
weightedScore = completionRate * wCompletion + complianceRate * wCompliance
totalScore    = min(round(weightedScore + earlyBonus), 100)
```

### 3.2 판정 기준

| 판정 | 조건 | 비고 |
|------|------|------|
| **기한 준수** | `actualEnd <= dueEnd(23:59:59.999)` | 기한일 마감시각까지 완료 |
| **조기 완료** | `actualEnd < dueStart(00:00:00.000)` | 기한일 **전날까지** 완료해야 조기 |
| **기한/완료일 미설정** | 무조건 **준수** 처리 | `compliantIssues++` |
| **verification-delay** | late여도 **준수** 처리 | 검증 지연 흡수 |
| **agreed-delay** | 분모와 분자 양쪽에서 제외 | 100% 초과 방지 |

### 3.3 완료일 결정 우선순위

1. `ACTUAL_DONE` 커스텀 필드 (`customfield_11485`) — truthy이면 사용
2. `resolutiondate` — fallback

### 3.4 등급 산출

- **completion grade**: `getGradeFromRules(completionRate)` — unrounded float 기반
- **compliance grade**: `getGradeFromRules(complianceRate)` — unrounded float 기반
- **total grade**: `getGradeFromRules(totalScore)` — **rounded integer** 기반
- **defect grade**: `getDefectGradeFromRules(defectRatePercent)` — 역방향 비교 (낮을수록 좋음)

---

## 4. 올바르게 동작하는 영역 (검증 완료)

### 4.1 등급 산출 로직
`getGradeFromRules`가 **내림차순 비교**(S -> A -> B -> C -> D)를 정확히 수행. `getDefectGradeFromRules`는 **오름차순 비교**(S <= 5 -> A <= 10 ...) 정확 수행. **판정: 정상**

### 4.2 agreed-delay 이중 제외
분모(`kpiTotal`)와 분자(`kpiCompleted`, `kpiCompliant`, `kpiEarly`) 양쪽에서 동일 이슈를 제거. rate가 100%를 초과하지 않도록 방어. **판정: 정상**

### 4.3 verification-delay 흡수
late이지만 검증 지연 라벨이 있으면 준수로 처리. 의도적 비즈니스 규칙으로 판단. **판정: 정상**

### 4.4 조기 보너스 런타임 정렬
`getEarlyBonusFromRules`가 내부에서 `minRate` 내림차순 재정렬하므로 Store 배열 순서에 무관하게 동작. **판정: 정상**

### 4.5 가중치 합 검증
`validateRuleSet`이 `|sum - 1.0| <= 0.01` 체크. **판정: 정상**

### 4.6 등급 순서 검증
KPI: `S > A > B > C` (strict), Defect: `S < A < B < C` (strict) 검증. **판정: 정상**

### 4.7 결함 밀도 팀 합산
개인별 % 평균이 아닌 `(총결함/총개발) * 100` 비율로 일관 계산. **판정: 정상**

### 4.8 KPI Rules 저장 및 전파
`updateRules(draft)` 후 `queryClient.invalidateQueries()`로 앱 전체 KPI 재계산 트리거. **판정: 정상**

---

## 5. 문제점 및 불일치

### 5.0 [Critical] KPI 지표 자체 변경 불가 — 구조적 경직성

현재 KPI 시스템은 **지표(metric) 자체가 코드에 하드코딩**되어 있어, 요율(threshold)만 변경할 수 있고 지표를 추가/교체/삭제할 수 없습니다.

#### 5.0.1 하드코딩된 계층 전체 분석

**Layer 1 — 타입 정의 (`KPIMetrics` interface)**

```typescript
// kpiService.ts — 지표가 타입에 고정
export interface KPIMetrics {
    completionRate: number;    // 완료율 — 고정
    complianceRate: number;    // 준수율 — 고정
    earlyRate: number;         // 조기완료율 — 고정
    grades: {
        completion: KpiGrade;  // 고정
        compliance: KpiGrade;  // 고정
        earlyBonus: number;    // 고정
        total: KpiGrade;       // 고정
    };
    totalScore: number;
}
```

새 지표(예: "코드 리뷰 완료율", "평균 사이클 타임", "재작업률")를 추가하려면 이 interface를 수정해야 합니다.

**Layer 2 — 산출 로직 (`calculateKPI` function)**

```typescript
// kpiService.ts — 산출 공식이 함수 내부에 하드코딩
const weightedScore = completionRate * wCompletion + complianceRate * wCompliance;
const totalScore = Math.min(Math.round(weightedScore + earlyBonus), 100);
```

총점 공식이 "완료율 x 가중치 + 준수율 x 가중치 + 조기보너스"로 고정. 새 지표를 가중 합산에 포함하려면 함수 자체를 수정해야 합니다.

**Layer 3 — 가중치 구조 (`KpiWeights` type)**

```typescript
// kpiRulesStore.ts — 가중치 필드가 2개로 고정
export interface KpiWeights {
    completion: number;   // 완료율 가중치
    compliance: number;   // 준수율 가중치
    // 새 지표 가중치를 추가할 수 없음
}
```

`WeightEditor.tsx` UI도 완료율/준수율 2개 입력 필드만 렌더링합니다.

**Layer 4 — UI 표시 (`project-stats-dialog.tsx`)**

```tsx
// 4개 GradeCard가 하드코딩
<GradeCard title="기능 개발 완료율" grade={kpiMetrics.grades.completion} ... />
<GradeCard title="일정 준수율" grade={kpiMetrics.grades.compliance} ... />
<GradeCard title="조기 종료 가점" grade={`+${kpiMetrics.grades.earlyBonus}`} ... />
<GradeCard title="팀 결함 밀도" grade={teamDefectKpiSummary.grade} ... />
```

카드 구성, 레이블, 툴팁 텍스트가 모두 고정되어 있습니다.

**Layer 5 — 담당자별 성과 테이블**

열 구성이 "종합 | 총점 | 완료 | 준수 | 가점 | 지연 | 결함..." 순서로 하드코딩.

#### 5.0.2 구체적으로 불가능한 변경 시나리오

| 시나리오 | 현재 가능 여부 | 필요한 변경 범위 |
|---------|--------------|----------------|
| 등급 기준값 변경 (S: 95→90) | **가능** (KPI Rules UI) | Store만 |
| 가중치 비율 변경 (50:50→60:40) | **가능** (KPI Rules UI) | Store만 |
| 조기 보너스 단계 추가/삭제 | **가능** (KPI Rules UI) | Store만 |
| 결함 밀도를 가중 합산에 포함 | **불가능** | KpiWeights 타입 + calculateKPI + WeightEditor + 검증 |
| "코드 리뷰 완료율" 지표 추가 | **불가능** | KPIMetrics 타입 + calculateKPI + KpiWeights + Store + UI 전체 |
| "준수율" 지표를 "평균 사이클 타임"으로 교체 | **불가능** | calculateKPI 로직 전체 + UI 라벨/툴팁 |
| 특정 지표 비활성화 (예: 조기보너스 폐지) | **불가능** (가중치 0 불가) | calculateKPI에서 earlyBonus 조건 분기 |
| 연도별 다른 지표 세트 적용 | **불가능** | 전체 아키텍처 변경 필요 |

#### 5.0.3 영향

현재 KPI 규칙은 **"같은 지표, 다른 기준값"만 지원**하는 구조입니다. 매년 KPI 지표 체계가 변경될 가능성이 있다면 (예: 2027년에 "재작업률" 추가, "조기 보너스" 폐지 등), 현재 아키텍처로는 **매번 코드 수정이 필요**합니다.

#### 5.0.4 개선 방향 (참고)

지표 자체를 동적으로 관리하려면 다음과 같은 구조 변경이 필요합니다:

**A안 — 지표 정의 데이터 드리븐 (대규모 리팩토링)**

```typescript
interface KpiMetricDefinition {
    id: string;                    // 'completion' | 'compliance' | 'cycleTime' | ...
    label: string;                 // '완료율', '준수율', '평균 사이클 타임'
    type: 'rate' | 'duration' | 'count';
    direction: 'higher-better' | 'lower-better';
    weight: number;
    gradeThresholds: GradeThresholds;
    calculator: (issues: JiraIssue[]) => number;  // 또는 calculator ID
    enabled: boolean;
}

interface KpiRuleSet {
    metrics: KpiMetricDefinition[];  // 동적 지표 배열
    bonusRules: BonusRule[];         // 보너스도 동적
    // ...
}
```

이 방향은 calculateKPI, 모든 UI, 가중치 에디터, 등급 에디터를 전면 재설계해야 합니다.

**B안 — 플러그인 방식 (중규모 리팩토링)**

기존 3개 지표는 유지하되, "추가 지표" 슬롯을 만들어 Store에서 on/off 및 가중치 배분. 기존 코드 변경 최소화.

**C안 — 현상 유지 + 코드 변경 관리 (최소 비용)**

현재 구조를 유지하되, 지표 변경 시 수정이 필요한 파일 목록과 절차를 문서화. 매년 KPI 기준이 바뀔 때 개발자가 체크리스트로 활용.

---

### 5.1 [Critical] Store 설정이 실제 로직에 반영되지 않는 필드들

KPI Rules UI에서 편집 가능하지만, **실제 코드가 `JIRA_CONFIG` 하드코딩 값을 사용**하는 필드:

| Store 필드 | 실제 참조처 | 상태 |
|-----------|-----------|------|
| `labels.agreedDelay` | `JIRA_CONFIG.LABELS.AGREED_DELAY` | Store 값 무시됨 |
| `labels.verificationDelay` | `JIRA_CONFIG.LABELS.VERIFICATION_DELAY` | Store 값 무시됨 |
| `fields.actualDone` | `JIRA_CONFIG.FIELDS.ACTUAL_DONE` | Store 값 무시됨 |
| `statusNames.onHold` | `JIRA_CONFIG.STATUS_NAMES` | Store 값 무시됨 |
| `statusNames.cancelled` | `JIRA_CONFIG.STATUS_NAMES` | Store 값 무시됨 |
| `dashboardProjectKey` | `JIRA_CONFIG.DASHBOARD.PROJECT_KEY` | Store 값 무시됨 |
| `weekStartsOn` | `JIRA_CONFIG.WEEK_STARTS_ON` | Store 값 무시됨 |
| `prediction.*` 전체 | `JIRA_CONFIG.PREDICTION` | Store 값 무시됨 |

**실제로 Store 값이 반영되는 필드**: `grades`, `defectGrades`, `weights`, `earlyBonus`만 해당.

**영향**: 사용자가 UI에서 설정을 변경하면 저장은 되지만 동작에 영향이 없어, **설정과 실제 동작의 괴리**가 발생합니다.

---

### 5.2 [Critical] 프로젝트 현황 탭 vs KPI 탭 — 준수율 계산 불일치

| 탭 | 계산 방식 | agreed-delay 처리 |
|----|---------|------------------|
| 프로젝트 현황 | `compliant.length / totalLeafIssues` | **미제외** |
| KPI 성과 | `kpiCompliant / kpiTotal` | **제외** |

동일 담당자의 준수율이 두 탭에서 서로 다르게 표시될 수 있습니다.

---

### 5.3 [Critical] 에픽 회고 on-time vs kpiService 판정 불일치

`epicRetro.ts`의 `isOnTime()`은 **`resolutiondate`** 사용, `kpiService`는 **`ACTUAL_DONE` 우선**. 동일 에픽 회고 카드에서 "기한 준수율"과 "KPI 등급"이 상충 가능.

---

### 5.4 [Critical] KPI 탭 GradeCard 툴팁 하드코딩

GradeCard 툴팁이 "S: 95% 이상, A: 90% 이상..." 등을 **고정 텍스트**로 표시. 사용자가 KPI Rules에서 등급 기준을 변경해도 **툴팁 설명은 기본값 그대로** 유지.

---

### 5.5 [Major] earlyRate 상한 미설정

`completionRate`와 `complianceRate`는 `min(..., 100)` 적용되지만, `earlyRate`는 **상한 없음**. 이론적으로 100% 초과 가능. 표시값이 100%를 넘을 수 있음.

---

### 5.6 [Major] 기한/완료일 미설정 시 무조건 "준수" 처리

`!dueDateStr || !actualEndStr` → `compliantIssues++`. 기한 미설정 이슈가 많으면 **준수율이 인위적으로 높아짐**. 이것이 의도된 비즈니스 규칙인지, "측정 불가"로 분리해야 하는지 검토 필요.

---

### 5.7 [Major] validateRuleSet 검증 범위 부족

**검증되는 항목**:
- KPI grades 순서 (S > A > B > C) 및 범위 (C >= 0, S <= 100)
- Defect grades 순서 (S < A < B < C)
- Weights 합 (|sum - 1.0| <= 0.01)
- EarlyBonus minRate 내림차순
- dashboardProjectKey 비어있지 않은지
- fields.storyPoint 비어있지 않은지

**검증 누락 항목**:
- `defectGrades` 수치 범위 (음수, 100 초과 가능)
- `earlyBonus` 빈 배열, 중복 minRate, 음수 bonus 허용
- `weights` 개별 값 음수 허용 (합만 검증)
- `labels`, `statusNames`, 대부분의 `fields` (storyPoint만 필수 체크)
- `prediction` 블록 전체 (UI min/max가 유일한 방어선)
- `importFromJson` 경로에서 부분적 스키마만 체크 (`version`, `grades` 존재 여부)

---

### 5.8 [Major] "미할당" vs "미배정" 레이블 불일치

- 프로젝트 현황: 미배정 담당자를 `'미할당'`으로 표시
- 결함 KPI: `'미배정'`으로 표시
- KPI 탭에서 보상 로직 있지만 (`a.name === '미할당'` → `'미배정'` 룩업), brittle한 매핑

---

### 5.9 [Major] 등급별 개별 가중치 확장 불가

현재 `KpiWeights`가 `{ completion, compliance }` 2개 필드로 고정. 결함 밀도를 가중 평가에 포함하려면 타입 구조 변경 필요.

---

### 5.10 [Minor] done 날짜 타임존 혼합

Jira의 `resolutiondate`(UTC ISO)와 `setHours`(local) 비교 시 자정 근처 경계 오차 가능.

### 5.11 [Minor] grades.total 반올림 비대칭

completion/compliance grade는 **unrounded float**, total grade는 **rounded integer** 기반. 경계값에서 등급 차이 발생 가능.

### 5.12 [Minor] Archive 복원 UI 부재

버전 아카이브(최대 20개)가 저장되지만 UI에서 복원 기능 없음. 현재는 카운트 뱃지만 표시.

### 5.13 [Minor] PredictionConfigEditor 범위

UI에서만 min/max 제한, `validateRuleSet`에서 미검증. JSON import로 범위 외 값 입력 가능.

---

## 6. 개선 권고 우선순위

### Phase 0 — 지표 관리 전략 결정 (아키텍처 의사결정)

**결정 필요사항**: 매년/분기별로 KPI 지표 자체가 변경될 가능성이 있는지 확인.

- **지표 변경 빈도가 낮은 경우 (1~2년에 한 번)**: C안(현상 유지 + 변경 절차 문서화) 권고
- **지표 변경이 잦거나 프로젝트별로 다른 지표가 필요한 경우**: B안(플러그인 방식)으로 확장 검토
- **완전한 유연성이 필요한 경우**: A안(데이터 드리븐) — 대규모 리팩토링

어떤 방향이든, 현재 구조에서 지표 변경 시 수정이 필요한 **7개 파일 체크리스트**를 작성:

1. `src/services/kpiService.ts` — KPIMetrics 타입 + calculateKPI 로직
2. `src/stores/kpiRulesStore.ts` — KpiWeights 타입 + KpiRuleSet + validateRuleSet
3. `src/components/kpi-rules/WeightEditor.tsx` — 가중치 UI
4. `src/components/kpi-rules/GradeEditor.tsx` — 등급 기준 UI (지표별 등급 추가 시)
5. `src/components/project-stats-dialog.tsx` — GradeCard + 담당자별 테이블
6. `src/services/retrospective/epicRetro.ts` — 에픽 회고 KPI 호출부
7. `src/lib/export.ts` — Excel 내보내기 (KPI 시트 열 구성)

### Phase 1 — Store-Config 연결 수정 (가장 시급)

**방향 A**: 모든 서비스가 `kpiRulesStore`를 single source of truth로 사용, `JIRA_CONFIG`는 초기 기본값만 제공

**방향 B**: 편집 불필요한 필드는 UI에서 제거하고, `JIRA_CONFIG`만 사용하는 것으로 명시

두 방향 중 하나를 선택한 후:
1. `kpiService.ts`에서 labels/fields 참조 소스 통일
2. 진행 추이 서비스에서 status/project/prediction 참조 소스 통일
3. `date-utils.ts`에서 weekStartsOn 참조 소스 통일

### Phase 2 — 판정 기준 통일

4. `epicRetro.ts`의 `isOnTime()`이 `getCompletionDate()` 헬퍼를 사용하도록 통일
5. 프로젝트 현황 탭의 준수율도 agreed-delay 제외 여부를 KPI 탭과 동일하게 처리하거나, 차이를 UI에서 명시
6. GradeCard 툴팁에 `rules.grades` 동적 값 반영

### Phase 3 — 검증 강화

7. `validateRuleSet`에 defectGrades 범위, earlyBonus 음수/빈배열, weights 개별 음수, prediction 범위 검증 추가
8. `importFromJson`에서 전체 스키마 검증 적용
9. earlyRate 상한(100%) 적용 검토

### Phase 4 — UX 개선

10. Archive 복원 UI 추가
11. "미할당"/"미배정" 레이블 통일
12. 기한 미설정 시 "준수" 대신 "측정 불가" 분류 검토

---

## 부록: 분석 대상 파일 목록

**KPI 핵심**
- `src/services/kpiService.ts` — calculateKPI, getGrade, getEarlyBonus
- `src/stores/kpiRulesStore.ts` — KpiRuleSet, validateRuleSet, grade/bonus 헬퍼
- `src/lib/defect-kpi-utils.ts` — defectRateToGrade
- `src/config/jiraConfig.ts` — JIRA_CONFIG 기본값

**KPI UI**
- `src/components/project-stats-dialog.tsx` — KPI 탭, 프로젝트 현황 탭
- `src/components/kpi-rules/index.tsx` — KpiRulesManager
- `src/components/kpi-rules/GradeEditor.tsx`
- `src/components/kpi-rules/WeightEditor.tsx`
- `src/components/kpi-rules/EarlyBonusEditor.tsx`
- `src/components/kpi-rules/JiraFieldsEditor.tsx`
- `src/components/kpi-rules/ProjectEditor.tsx`
- `src/components/kpi-rules/PredictionConfigEditor.tsx`
- `src/components/kpi-rules/JsonImportExport.tsx`

**관련 서비스**
- `src/hooks/useDefectKpiAggregation.ts` — 결함 KPI 집계
- `src/services/retrospective/epicRetro.ts` — 에픽 회고 KPI
