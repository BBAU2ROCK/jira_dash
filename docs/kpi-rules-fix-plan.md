# KPI 규칙 정합성 — 수정 계획서

> **기반**: `C:\Users\jwchoo\.cursor\plans\kpi_rules_analysis_774dc2be.plan.md` 분석 보고서
> **작성 일자**: 2026-04-16
> **범위**: Level 4 KPI Rules Store(v1.0.8) 완전 통합 + 판정 기준 통일 + 검증 강화
> **총 공수**: 약 2.5일

---

## 배경

v1.0.8에서 **Level 4 KPI 관리 UI**가 완성되어 PM이 앱 내에서 등급 기준·가중치·결함 등급·Jira 연결·프로젝트·예측 파라미터를 편집할 수 있게 됐습니다. 그러나 Cursor 분석 보고서에 따르면 **편집 가능하지만 실제로 반영되지 않는 필드**가 다수 존재하며, 탭 간 계산 불일치와 하드코딩된 툴팁 등 정합성 이슈가 남아 있습니다.

본 계획서는 그 보고서의 **Critical 4 + Major 5 + Minor 4**건을 4개 Phase로 묶어 수정합니다. `docs/prediction-fix-plan.md`(예측 관련 22건)와는 별개의 작업으로, **KPI 규칙 일관성**에 초점을 맞춥니다.

---

## 수정 대상 (13건)

### 심각도별 요약

| 심각도 | 건수 | 항목 |
|--------|------|------|
| Critical | 4 | K1 Store-Config 연결, K2 준수율 탭 불일치, K3 on-time 판정 불일치, K4 툴팁 하드코딩 |
| Major | 5 | K5 earlyRate 상한, K6 마감일 없음 처리, K7 validateRuleSet 확장, K8 미할당/미배정 통일, K9 weights 구조 확장 |
| Minor | 4 | K10 타임존, K11 total 반올림, K12 Archive 복원 UI, K13 prediction UI 검증 |

### Cursor 보고서와의 항목 매핑

| Cursor 번호 | 본 계획 번호 | 제목 요약 |
|-------------|--------------|-----------|
| 4-1 | K1 | Store 설정 → 실제 로직 반영 |
| 4-2 | K2 | 프로젝트 현황 vs KPI 탭 준수율 |
| 4-3 | K3 | epicRetro isOnTime ↔ kpiService 통일 |
| 4-4 | K4 | GradeCard 툴팁 동적화 |
| 5-1 | K5 | earlyRate 상한 |
| 5-2 | K6 | dueDate 없으면 준수 처리 |
| 5-3 | K7 | validateRuleSet 확장 |
| 5-4 | K8 | 미할당/미배정 레이블 |
| 5-5 | K9 | weights 3요소 확장 가능성 |
| 6-① | K10 | 타임존 혼합 |
| 6-② | K11 | grades.total 반올림 |
| 6-③ | K12 | Archive 복원 UI |
| 6-④ | K13 | PredictionConfigEditor 검증 누락 |

---

## Phase 1 — Store-Config 완전 연결 (1일)

현재 가장 큰 UX 부채. UI에서 편집하면 저장은 되지만 동작에 반영 안 되는 필드가 많음.

### 전략 선택

두 가지 접근이 있음:
- **A안 (권장)**: Store를 **single source of truth**로 — 서비스 코드가 `useKpiRulesStore.getState().rules`를 참조. `JIRA_CONFIG`는 초기 default 용도만.
- **B안**: 편집 불필요한 필드는 **UI에서 제거** + `JIRA_CONFIG`만 사용.

혼합 접근(권장):
- **A안 적용**: `labels`, `fields.actualDone`, `grades`, `weights`, `earlyBonus`, `defectGrades` (KPI 산식에 직접 영향)
- **B안 적용**: `dashboardProjectKey`, `projectKeys` (앱 구조 변경 필요 — 현실적으로 어려움 → UI에서 "변경 후 재시작 필요" 경고만 표시)
- **하이브리드**: `prediction.*`, `weekStartsOn`, `statusNames`, `fields.*` (나머지) — 서비스가 store 우선, 없으면 JIRA_CONFIG fallback

---

### K1. KPI Service의 store 완전 연동

**파일**: `src/services/kpiService.ts`

**현재 (line 81, 92)**:
```ts
const isAgreedDelay = labels?.includes(JIRA_CONFIG.LABELS.AGREED_DELAY) ?? false;
const isVerificationDelay = labels?.includes(JIRA_CONFIG.LABELS.VERIFICATION_DELAY) ?? false;
// ...
const actualEndStr =
    (issue.fields[JIRA_CONFIG.FIELDS.ACTUAL_DONE] as string | undefined) ||
    issue.fields.resolutiondate;
```

**수정**:
```ts
/** store 규칙 우선, 실패 시 JIRA_CONFIG fallback */
function getActiveRules() {
    try {
        return useKpiRulesStore.getState().rules;
    } catch {
        return null;
    }
}

export function calculateKPI(issues: JiraIssue[]): KPIMetrics {
    const rules = getActiveRules();
    const agreedDelayLabel = rules?.labels.agreedDelay ?? JIRA_CONFIG.LABELS.AGREED_DELAY;
    const verificationDelayLabel = rules?.labels.verificationDelay ?? JIRA_CONFIG.LABELS.VERIFICATION_DELAY;
    const actualDoneField = rules?.fields.actualDone ?? JIRA_CONFIG.FIELDS.ACTUAL_DONE;

    // ... for문 내부에서 JIRA_CONFIG 대신 이 로컬 변수 사용
    const isAgreedDelay = labels?.includes(agreedDelayLabel) ?? false;
    const actualEndStr = (issue.fields[actualDoneField] as string | undefined) || issue.fields.resolutiondate;
}
```

**테스트**: `kpiService.test.ts`에 "store에서 labels 변경 후 계산" 케이스 3개 추가.
**공수**: 2시간

---

### K2. 프로젝트 현황 탭 준수율 통일

**파일**: `src/components/project-stats-dialog.tsx` (line 527~530)

**현재**:
```ts
// KPI A와 일치시키려면: (compliant / (total - agreed)) * 100?
// 여기서는 심플하게: compliant / total * 100 (전체 대비 준수율)
const complianceRate = t > 0 ? Math.round((a.compliant.length / t) * 100) : 0;
```

**문제**: 담당자별 `a.compliant.length / t`가 agreed-delay 미제외 → KPI 탭과 수치 다름.

**수정 (권장)**: `calculateKPI(assigneeIssues).complianceRate` 재사용하여 한 곳에서만 산출.
```ts
const kpi = calculateKPI(a.allIssues); // a.allIssues 추가 필요
const complianceRate = kpi.complianceRate;
```

**대안**: UI에 InfoTip 추가하여 "전체 대비 (합의연기 포함)" 명시 → 기존 계산 유지하되 의미 전달.

**선택**: 권장안(재사용). KPI 정합성이 InfoTip보다 중요.
**테스트**: 프로젝트 현황 vs KPI 탭 준수율이 동일 인원에 대해 일치하는지 snapshot.
**공수**: 1시간

---

### K3. 에픽 회고 isOnTime 통일

**파일**: `src/services/retrospective/epicRetro.ts` (line 40~47)

**현재**:
```ts
function isOnTime(issue: JiraIssue): boolean {
    const due = parseLocalDay(issue.fields.duedate ?? null);
    const done = parseLocalDay(issue.fields.resolutiondate ?? null);  // ← ACTUAL_DONE 미사용
    if (!due || !done) return true;
    const dueEnd = new Date(due);
    dueEnd.setHours(23, 59, 59, 999);
    return done <= dueEnd;
}
```

**문제**: `resolutiondate`만 사용 → kpiService는 `ACTUAL_DONE` 우선. 동일 에픽 카드에서 `onTimeRate`와 `kpiGrade` 날짜 소스 불일치.

**수정**: 공통 헬퍼 추출.
```ts
// src/lib/jira-helpers.ts에 신규 export
export function getCompletionDate(issue: JiraIssue, rules?: KpiRuleSet): Date | null {
    const actualField = rules?.fields.actualDone ?? JIRA_CONFIG.FIELDS.ACTUAL_DONE;
    const str = (issue.fields[actualField] as string | undefined) || issue.fields.resolutiondate;
    return str ? new Date(str) : null;
}

// epicRetro.ts
import { getCompletionDate } from '@/lib/jira-helpers';
function isOnTime(issue: JiraIssue): boolean {
    const due = parseLocalDay(issue.fields.duedate ?? null);
    const done = getCompletionDate(issue); // ← 통일
    if (!due || !done) return true;
    const dueEnd = new Date(due);
    dueEnd.setHours(23, 59, 59, 999);
    return done <= dueEnd;
}

// cycleTimeDays도 동일하게 교체
function cycleTimeDays(issue: JiraIssue): number | null {
    const created = parseLocalDay(issue.fields.created);
    const done = getCompletionDate(issue);
    if (!created || !done || done < created) return null;
    return Math.max(differenceInDays(done, created), 1);
}
```

**영향**: epicRetro 외에 `progress-trends` 관련 서비스에서도 resolutiondate 직접 참조 확인 후 통일.
**테스트**: `epicRetro.test.ts` (없다면 신설)에 ACTUAL_DONE 우선 3 케이스.
**공수**: 2시간

---

### K4. GradeCard 툴팁 동적 반영

**파일**: `src/components/project-stats-dialog.tsx` (line 729, 733, 737, 753)

**현재**:
```tsx
tooltip={`📌 등급 기준 (S·A·B·C·D)
S: 95% 이상  A: 90% 이상  B: 80% 이상  C: 70% 이상  D: 70% 미만`}
```

**수정**:
```tsx
const rules = useKpiRulesStore((s) => s.rules);
const gradeThresholdsText = `S: ${rules.grades.S}% 이상  A: ${rules.grades.A}% 이상  B: ${rules.grades.B}% 이상  C: ${rules.grades.C}% 이상  D: ${rules.grades.C}% 미만`;
const defectGradeText = `S: ${rules.defectGrades.S}% 이하  A: ${rules.defectGrades.A}% 이하  B: ${rules.defectGrades.B}% 이하  C: ${rules.defectGrades.C}% 이하  D: 그 외`;
const earlyBonusText = rules.earlyBonus
    .sort((a, b) => b.minRate - a.minRate)
    .map((s) => `${s.minRate}% 이상 → +${s.bonus}점`)
    .join('  ');

<GradeCard tooltip={`...\n📌 등급 기준 (S·A·B·C·D)\n${gradeThresholdsText}`} />
```

**리팩터링 권장**: 툴팁 텍스트 빌더 헬퍼를 `src/lib/kpi-tooltip.ts`로 추출.
**공수**: 1시간

---

## Phase 2 — 판정 기준 명확화 (0.5일)

### K5. earlyRate 상한 100% 적용

**파일**: `src/services/kpiService.ts` (line 149)

**현재**:
```ts
const earlyRate = (kpiEarly / kpiTotal) * 100;  // 상한 없음
```

**수정**:
```ts
const earlyRate = Math.min((kpiEarly / kpiTotal) * 100, 100);
```

**이유**: earlyBonus 단계는 50% 이상이 최대이므로 로직상 영향 없으나, UI 표시값이 100% 초과 가능 → 일관성을 위해 통일.
**테스트**: `kpiService.test.ts`에 earlyRate cap 1 케이스.
**공수**: 15분

---

### K6. 기한 없음 이슈 분리 표시

**파일**: `src/services/kpiService.ts`, `src/components/project-stats-dialog.tsx`

**현재 (line 95~99)**: `!dueDateStr || !actualEndStr`이면 무조건 `compliantIssues++`.

**선택 (합의 필요)**:
- **Option A** (현행 유지): "기한 없으면 어긴 것도 아니다" 논리 유지 + UI에 별도 카운트 표시.
- **Option B**: 분모에서 제외 (합의지연처럼) — "측정 불가"로 분리.

**권장**: Option A + UI 투명성.
```ts
// KPIMetrics에 필드 추가
noDueDateCount: number; // "기한 미설정 → 준수로 카운트" 수치 별도 노출

// GradeCard InfoTip에 추가
tooltip={`...\n📌 기한 미설정 처리\n기한/완료일이 없는 이슈 ${noDueDateCount}건은 기본적으로 준수로 카운트됩니다 (어긴 것도 아니라는 논리).`}
```

**구현**: 계산 시 `noDueDateCount` 누적 + InfoTip 표시.
**공수**: 1시간

---

### K7. validateRuleSet 검증 범위 확장

**파일**: `src/stores/kpiRulesStore.ts` (line 223~263)

**현재 누락**:
- `defectGrades` 수치 범위 (음수, 100 초과)
- `earlyBonus` 빈 배열·중복 minRate·음수 bonus
- `weights` 개별 음수 (합만 검증)
- `prediction.*` 전체 범위
- `importFromJson` 일부 필드만 체크

**수정**:
```ts
export function validateRuleSet(rules: KpiRuleSet): string[] {
    const errors: string[] = [];
    const { grades, defectGrades, weights, earlyBonus, prediction } = rules;

    // 기존 grades 검증 유지 ...

    // 추가: defectGrades 범위
    if (defectGrades.S < 0 || defectGrades.C > 100) {
        errors.push('결함 등급 기준: 0~100 범위여야 합니다.');
    }

    // 추가: earlyBonus 빈 배열·중복·음수
    if (!earlyBonus || earlyBonus.length === 0) {
        errors.push('조기 보너스 단계가 비어있습니다.');
    } else {
        const seen = new Set<number>();
        for (const step of earlyBonus) {
            if (seen.has(step.minRate)) {
                errors.push(`조기 보너스: minRate ${step.minRate}% 중복`);
            }
            seen.add(step.minRate);
            if (step.bonus < 0) {
                errors.push(`조기 보너스: bonus ${step.bonus}점은 음수 불가`);
            }
        }
    }

    // 추가: weights 개별 음수
    if (weights.completion < 0 || weights.compliance < 0) {
        errors.push('가중치는 음수일 수 없습니다.');
    }

    // 추가: prediction 범위
    if (prediction.monteCarloTrials < 100 || prediction.monteCarloTrials > 100_000) {
        errors.push('Monte Carlo trials는 100~100,000 범위여야 합니다.');
    }
    if (prediction.defaultHistoryDays < 7 || prediction.defaultHistoryDays > 365) {
        errors.push('예측 history 일수는 7~365 범위여야 합니다.');
    }
    if (prediction.defaultUtilization <= 0 || prediction.defaultUtilization > 1) {
        errors.push('Default utilization은 0~1 범위여야 합니다.');
    }

    return errors;
}
```

**importFromJson 강화**:
```ts
importFromJson: (ruleSet) => {
    const errors = validateRuleSet(ruleSet);
    if (errors.length > 0) {
        throw new Error(`Invalid rule set: ${errors.join('; ')}`);
    }
    set({ rules: { ...ruleSet, updatedAt: new Date().toISOString() } });
},
```

**UI 연동**: JsonImportExport 컴포넌트에서 import 실패 시 toast로 에러 표시.
**테스트**: `kpiRulesStore.test.ts`에 "validateRuleSet 경계" 8 케이스.
**공수**: 1.5시간

---

## Phase 3 — 데이터 정합성 및 레이블 통일 (0.5일)

### K8. 미할당/미배정 레이블 일원화

**파일**: 여러 파일 (grep로 확인됨)

**현재**:
- `src/components/project-stats-dialog.tsx` line 149, 208: `'미할당'`
- `src/lib/defect-kpi-utils.ts` line 27: `'미배정'`
- `src/components/issue-list.tsx` line 252: `'미할당'`
- `project-stats-dialog.tsx` line 1065~1066: `a.name === '미할당'` → `defectKpiByDisplayName.get('미배정')` 특수 매핑

**수정**: 상수로 통일.
```ts
// src/lib/jira-constants.ts (신규)
export const UNASSIGNED_LABEL = '미배정' as const;
export const UNKNOWN_LABEL = '(미상)' as const;
```

**적용**: 모든 파일에서 `'미할당'` 또는 `'미배정'` 리터럴 → `UNASSIGNED_LABEL` 참조로 교체.

**테스트**: `anonymize.test.ts`에 이미 PRESERVED_LABELS 케이스 있으므로 `UNASSIGNED_LABEL` 추가만.
**공수**: 1시간

---

### K10. 타임존 혼합 방어

**파일**: `src/services/kpiService.ts`, `src/services/retrospective/epicRetro.ts`

**현재**:
```ts
const dueEnd = new Date(dueDateStr);
dueEnd.setHours(23, 59, 59, 999);  // local time
const actualEnd = new Date(actualEndStr);  // UTC ISO
if (actualEnd <= dueEnd) // ← UTC vs local 비교
```

**위험**: 자정 근처(23:50~00:10) 완료 이슈에서 local/UTC 경계 오차로 준수/지연 판정이 뒤집힐 가능성.

**수정**:
```ts
// src/lib/date-utils.ts에 헬퍼 추가
export function toEndOfLocalDay(isoDate: string): Date {
    const d = new Date(isoDate);
    d.setHours(23, 59, 59, 999);
    return d;
}

// kpiService.ts에서
const dueEnd = toEndOfLocalDay(dueDateStr);
const actualEnd = new Date(actualEndStr); // 이건 그대로 (UTC)
// 둘 다 Date 객체의 millisec 기준 비교 → 일관성 유지
```

**주의**: Jira의 `duedate`는 `YYYY-MM-DD` (날짜만) → local 자정 처리 OK. `resolutiondate`는 `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC) → 변환 없이 비교 시 문제.

실제로는 `new Date('2026-04-16')`가 UTC 자정으로 해석되므로 `setHours(23,59,59,999)`는 local 23:59:59로 변환됨. 이는 **사용자 timezone에 따라 기대와 다를 수 있음**.

**권장**: `date-fns-tz`의 `toZonedTime` 적용 또는 명확한 timezone offset 문서화.
**공수**: 1시간 (또는 현행 유지 + 문서화만, 30분)

---

## Phase 4 — 완성도 및 사용성 (0.5일)

### K9. weights 구조 확장 대비 (문서화만)

**현재**: `weights: { completion, compliance }` 2필드 고정.

**향후 요구**: 결함 밀도도 weighted KPI에 포함하고 싶을 때 구조 변경 필요.

**수정안 (Phase 5 예약)**:
```ts
weights: {
    completion: 0.4,
    compliance: 0.4,
    defectDensity: 0.2,  // 신규 (기본 0 — 현재 로직 무영향)
}
```

**본 Phase에서는**: 향후 확장 가능성 주석만 추가. 실제 구조 변경은 별도 버전(v1.1)에서.
**공수**: 15분

---

### K11. grades.total 반올림 정책 통일

**파일**: `src/services/kpiService.ts` (line 161, 170~177)

**현재**:
```ts
const totalScore = Math.min(Math.round(weightedScore + earlyBonus), 100);
// ...
grades: {
    completion: getGrade(completionRate),         // unrounded float
    compliance: getGrade(complianceRate),         // unrounded float
    earlyBonus,
    total: getGrade(totalScore),                  // rounded integer
},
```

**문제**: `completion`/`compliance`는 raw rate로 등급 산정하지만 `total`은 반올림된 score 기반.

**수정**: 모든 등급 산정을 동일 정책으로.
```ts
const completionRateUnrounded = (kpiCompleted / kpiTotal) * 100; // 상한 전
const complianceRateUnrounded = (kpiCompliant / kpiTotal) * 100;
// 등급은 unrounded 기반
completion: getGrade(Math.min(completionRateUnrounded, 100)),
compliance: getGrade(Math.min(complianceRateUnrounded, 100)),
total: getGrade(weightedScore + earlyBonus), // 반올림 전 값
// 표시용 rates는 반올림
completionRate: Math.round(completionRateUnrounded),
```

**영향**: 경계 케이스 (89.5%, 94.5% 등)에서 등급이 바뀔 수 있음. **의도된 정책 결정 필요** — PM과 합의 후 적용.
**공수**: 30분 (단 합의 필요)

---

### K12. Archive 복원 UI

**파일**: `src/components/kpi-rules/` (신규 컴포넌트)

**현재**: `kpiRulesStore.archive`에 최대 20개 이전 버전 보관되나 복원 UI 없음.

**수정**: `ArchiveList.tsx` 추가.
```tsx
export function ArchiveList() {
    const { archive, importFromJson } = useKpiRulesStore();
    if (archive.length === 0) return <p className="text-xs text-slate-500">이전 버전 없음</p>;

    return (
        <ul className="space-y-2">
            {archive.map((r, i) => (
                <li key={i} className="flex items-center justify-between rounded border p-2">
                    <div>
                        <p className="text-sm font-medium">{r.label} (v{r.version})</p>
                        <p className="text-xs text-slate-500">{new Date(r.updatedAt).toLocaleString()}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => {
                        if (confirm(`"${r.label}"으로 복원하시겠습니까? 현재 규칙은 덮어쓰여집니다.`)) {
                            importFromJson(r);
                            toast.success('복원 완료');
                        }
                    }}>복원</Button>
                </li>
            ))}
        </ul>
    );
}
```

**통합 위치**: `KpiRulesManager`의 하단 또는 별도 탭 ("버전 히스토리").
**공수**: 1시간

---

### K13. PredictionConfigEditor 범위 검증 (중복 방지)

**파일**: `src/components/kpi-rules/PredictionConfigEditor.tsx`

**현재**: UI의 `min`/`max` attribute만 제공. 사용자가 비활성화/우회 시 잘못된 값 저장 가능. (실제로 K7의 validateRuleSet 확장으로 커버됨)

**수정**: K7이 포함하므로 **추가 작업 불요**. 다만 Editor 내부에서 저장 전 `validateRuleSet` 호출하여 즉시 피드백.
```tsx
const handleBlur = (field: keyof KpiRuleSet['prediction'], value: number) => {
    const draft = { ...rules, prediction: { ...rules.prediction, [field]: value } };
    const errors = validateRuleSet(draft);
    if (errors.length > 0) {
        toast.error(errors[0]);
        return; // 저장 거부
    }
    updateRules({ prediction: draft.prediction });
};
```

**공수**: 30분

---

## 일정

```
D1 AM │ Phase 1: K1 (kpiService store 연동) + K3 (epicRetro on-time 통일)    (4h)
D1 PM │ Phase 1: K2 (현황 탭 준수율) + K4 (툴팁 동적화)                        (2h)
D2 AM │ Phase 2: K5 (earlyRate cap) + K6 (기한없음 분리) + K7 (validate 확장) (3h)
D2 PM │ Phase 3: K8 (미할당/미배정) + K10 (타임존)                             (2h)
D3 AM │ Phase 4: K9 (문서만) + K11 (반올림 합의) + K12 (Archive UI) + K13      (3h)
D3 PM │ 통합 검증 + PATCH.md + v1.0.9 커밋                                   (1h)

총: 2.5일 (15시간)
```

---

## 검증 기준

### Phase 1 후 (가장 중요)
- [ ] 설정 다이얼로그 → KPI 규칙 탭 → `labels.agreedDelay` 값 변경 → KPI 탭에서 다른 라벨로 인식되는지 확인
- [ ] 설정 다이얼로그 → `fields.actualDone` 값 변경 → ETA 재계산 시 다른 필드 참조하는지 확인
- [ ] 프로젝트 현황 준수율 vs KPI 탭 준수율 동일 인원 수치 일치
- [ ] 에픽 회고 카드의 `onTimeRate`와 `kpiGrade` 동일 날짜 기준 사용 (ACTUAL_DONE 우선)
- [ ] 등급 기준 S를 90으로 변경 → 툴팁에도 "S: 90% 이상"으로 즉시 반영

### Phase 2 후
- [ ] earlyRate >100% 발생 불가능 (UI·계산값)
- [ ] InfoTip에 "기한 없음 N건 준수 카운트" 표시
- [ ] validateRuleSet에 8개 경계 케이스 통과
- [ ] JSON import 시 잘못된 데이터 거부 (toast)

### Phase 3 후
- [ ] 프로젝트 전체에서 `'미할당'` 리터럴 0건 (상수화 완료)
- [ ] `defectKpiByDisplayName.get('미배정')` 특수 케이스 제거
- [ ] 자정 근처 완료 이슈 판정 안정성 (수동 테스트 3건)

### Phase 4 후
- [ ] Archive 복원 UI로 이전 버전 적용 가능
- [ ] PredictionConfigEditor 저장 전 validate 호출로 즉시 에러 피드백
- [ ] grades.total 반올림 정책 (합의 후) 일관 적용

### 비기능
- [ ] 기존 vitest 케이스 전부 통과 (현 183건 + 신규 15건 = 198건)
- [ ] tsc 에러 0
- [ ] lint 에러 0
- [ ] 앱 재시작 없이 설정 변경 즉시 반영 (Zustand subscribe 활용)

---

## 보호 (변경 안 함)

```
✋ calculateKPI의 핵심 산식 흐름 (for문 단일 패스, agreed-delay 이중 제외)
✋ getGradeFromRules / getEarlyBonusFromRules / getDefectGradeFromRules 로직
✋ Zustand persist 키 이름 (jira-dash-kpi-rules) — localStorage 마이그레이션 회피
✋ 기존 183 vitest 케이스
✋ kpiRulesStore의 기본값 구조 (version, label, updatedAt)
✋ Level 4 UI의 탭 구조 (Jira 연결 / KPI 규칙)
```

---

## 위험 & 완화

| 위험 | 완화 |
|------|------|
| K1 적용 후 React 컴포넌트가 Zustand 변경을 재구독하지 않을 수 있음 | `useKpiRulesStore` 훅 사용 컴포넌트는 자동 재렌더. 서비스 코드는 `getState()` 호출 시점 값 사용 — 호출자가 re-render triggered되면 반영됨. |
| K2 리팩터링 후 프로젝트 현황 탭 성능 저하 (calculateKPI 인원당 호출) | 결과 memoize. 인원 30명 × 500 이슈 = 15000 loop × 0.01ms = 150ms (허용) |
| K3 통일로 기존 에픽 회고 결과 수치 변동 | ACTUAL_DONE 필드가 없는 이슈는 resolutiondate fallback → 실제 변화 미미. 단 changelog 필요. |
| K11 반올림 정책 변경으로 등급 변동 | **PM 합의 필수**. 합의 전 현행 유지. |
| K8 레이블 교체 누락 | grep 기반 검증 + tsc strict mode로 compile-time 검출 |
| K12 Archive 복원 UI에서 덮어쓰기 사고 | 확인 다이얼로그 + 현재 규칙 자동 archive (createVersion) |

---

## 다음 액션

```
□ 본 계획서 검토
□ K11 반올림 정책 PM 합의 (의도된 동작인지)
□ Phase 1 시작 — K1 먼저 (가장 높은 ROI)
□ 각 Phase 완료 시 vitest + tsc 중간 검증
□ 전체 완료 후 PATCH.md에 v1.0.9 항목 추가 + 커밋
□ docs/prediction-fix-plan.md와 병렬 진행 가능 (독립 작업)
```

---

## 관련 문서

- `docs/prediction-fix-plan.md` — 진행 추이/예측 22건 수정 (별개)
- `docs/kpi-management-ui-plan.md` — Level 4 UI 설계 (v1.0.8 완료)
- `docs/kpi-rules-audit-report.md` — 내부 감사 보고서
- Cursor 분석 보고서 원본: `C:\Users\jwchoo\.cursor\plans\kpi_rules_analysis_774dc2be.plan.md`

---

**문서 끝.**
