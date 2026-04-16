# 회고·예측 — 인사이트 강화 계획서

> **분석 기반**: 사용자 피드백 6건 (2026-04-16)
> **목표**: "개발자들이 더 나은 개발 지표를 위해 부족한 부분이 어디이고, 개선 방법은 무엇인지" — 담당자 맞춤 인사이트 제공
> **범위**: 진행 추이/예측 탭의 **예측·회고 섹션 (A/B 카테고리 모두)**
> **총 공수**: 약 3~4일

---

## 현황 진단 (사용자 피드백 6건)

| # | 피드백 | 현재 구현 | 문제 |
|---|--------|---------|------|
| 1 | 에픽 회고 담당자 테이블에 정보 팁 | `EpicRetroCard.tsx` L76~109 — 헤더만 있고 툴팁 없음 | "담당자 5명 전체/완료/진행/대기/지연" 카운트가 어떻게 산출되는지 설명 없음 |
| 2 | 완료 예측 용어 정의 (Monte Carlo 등) | `index.tsx` L208~210 subtitle에만 등장, 설명은 `MethodologyDialog` 안 깊숙이 | 용어가 나오는 **바로 그 위치**에 툴팁이 없음 — 방법론 다이얼로그를 열어야만 확인 |
| 3 | 결함 회고 심도 부족 | `EpicDefectCard.tsx` L75~112 — 결함수·Density·심각도 분포·등급 **4개 메트릭만** | 트렌드, 타입 분포, 누적 분석, 병목, 개선 인사이트 없음 |
| 4 | ETA 설명 부족 | `EtaScenarioCard.tsx` — 시나리오 이름과 날짜만 표시 | ETA·P85·영업일·병목 용어 설명 없음 |
| 5 | 담당자 결함 패턴 심각도 분포 간격 과대 | `DefectPatternCard.tsx` L112~119 — `flex justify-between` 으로 이름↔카운트 양 끝 배치 | `max-w-[120px]` + `justify-between` 조합으로 여백이 과도 |
| 6 | 담당자별 결함 패턴 일반론 수준 | `DefectPatternCard.tsx` — 담당/결함/비율/심각도/등급 5개 컬럼 | 개선 방향성·시간 추세·동료 대비 위치·자동 코칭 제안 없음 |

---

## 설계 원칙 — "코칭 vs 평가"

회고·예측 섹션은 이미 `index.tsx` L290 에서 **"코칭 도구 (성과 평가 X)"** 로 선언돼 있습니다. 본 개선도 이 원칙을 유지합니다:

- 순위·등수 대신 **영역별 강/약점 매핑**
- 절대값 대신 **팀 중앙값 대비 상대 위치**
- 결함 비율만으로 평가 X → **"High severity 집중도 + Fast cycle + 많은 완료"** 같은 다차원 프로파일
- 자동 인사이트는 **권장(recommend)** 용어 사용, "평가"·"등급 D" 같은 낙인 표현 최소화

---

## Phase 1 — InfoTip 즉시 확대 (요청 1·2·4, **0.5일**)

가장 ROI 높은 작업. 기존 `InfoTip` 컴포넌트 재사용, 텍스트만 추가.

### F1-1. 에픽 회고 담당자 테이블

**파일**: `EpicRetroCard.tsx`

헤더에 InfoTip 추가 — 카운트 산정 규칙 설명:

```tsx
<th className="... text-left">
    담당자 ({summary.contributors.length}명)
    <InfoTip>
        이 에픽에 assignee로 연결된 인원 수.
        각 행의 "전체"는 해당 담당자의 leaf task 수 (프로젝트 현황 탭과 동일 카운트 규칙).
        하위 작업이 있으면 부모 task는 제외되고 하위만 카운트됩니다.
    </InfoTip>
</th>
<th>전체 <InfoTip size="sm">leaf task 총 수</InfoTip></th>
<th>완료 <InfoTip size="sm">statusCategory=done</InfoTip></th>
<th>진행 <InfoTip size="sm">statusCategory=indeterminate</InfoTip></th>
<th>대기 <InfoTip size="sm">statusCategory=new</InfoTip></th>
<th>지연 <InfoTip size="sm">미완료 + 마감일 경과</InfoTip></th>
```

### F1-2. 완료 예측 섹션 — 용어 글로서리

**파일**: `index.tsx` L206~254 (CategorySection "완료 예측")

CategorySection의 `title` 옆에 큰 설명 Popover 추가. 새 컴포넌트: `ForecastGlossaryTip.tsx`

```tsx
<CategorySection
    title="완료 예측"
    subtitle="..."
    titleAfter={<ForecastGlossaryTip />}   // 신규 prop
>
```

`ForecastGlossaryTip` 내용 (한 곳에 정리):
- **Monte Carlo**: 무작위 샘플링 10,000회로 ETA 분포 산출
- **Throughput**: 일별 완료 건수 (= 처리량)
- **P50 / P85 / P95**: 전체 시뮬레이션 중 50%/85%/95%가 이 날짜까지 완료됨 (P85 권장 약속)
- **Scope Ratio**: 신규 유입 ÷ 완료. >1.5 = 발산, 1.0~1.5 = scope creep
- **Confidence**: 활동일·변동성·scope 기반 4단계 (high/medium/low/unreliable)
- **3 시나리오**: 낙관(재할당 가능) / 기준(현재 할당 유지, 권장) / 병목(최대 개인 ETA)

### F1-3. ETA 카드 세부 툴팁

**파일**: `EtaScenarioCard.tsx`

시나리오별 라벨에 개별 InfoTip + ScenarioRow 내부 툴팁:

```tsx
<ScenarioRow
    label="낙관 (자유 재할당)"
    labelTip="모든 잔여 task가 누구에게나 재할당 가능하다는 가정. 실무에서는 specialization 때문에 비현실적 — 하한선 참조용."
    ...
/>
<ScenarioRow
    label="기준 ★ 권장 약속"
    labelTip="현재 담당자 배정을 유지했을 때의 팀 ETA. 개인별 P85 중 최대값 = 팀 P85. 약속·마감 협의 시 이 값 권장."
    ...
/>
<ScenarioRow
    label="병목 (최대 ETA)"
    labelTip="현재 가장 느린 인원의 ETA. 이 인원이 팀 일정을 좌우함 → 지원·재배분 대상 신호."
    ...
/>
```

**공수**: 0.5일 (텍스트 작성 + 3개 컴포넌트 수정)

---

## Phase 2 — 담당자 결함 패턴 UI 정리 (요청 5, **0.3일**)

### F2-1. 심각도 분포 간격 개선

**파일**: `DefectPatternCard.tsx` L107~123

**현재**:
```tsx
<ul className="text-[11px] space-y-0.5">
    {r.severityBreakdown.slice(0, 3).map((s) => (
        <li className="flex justify-between gap-2 tabular-nums">
            <span className="truncate max-w-[120px]">{s.name}</span>
            <span className="font-medium">{s.count}</span>
        </li>
    ))}
</ul>
```

**수정**: Pill/chip 형태로 변경 + 색상 코딩 + 인접 배치
```tsx
<div className="flex flex-wrap gap-1">
    {r.severityBreakdown.slice(0, 4).map((s) => (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border',
                sevColor(s.name)  // EpicDefectCard의 SEVERITY_COLOR 재사용
            )}
            title={`${s.name} ${s.count}건`}
        >
            <span className="font-medium">{s.name}</span>
            <span className="font-bold tabular-nums">{s.count}</span>
        </span>
    ))}
    {r.severityBreakdown.length > 4 && (
        <span className="text-slate-400 text-[10px]">+{r.severityBreakdown.length - 4}</span>
    )}
</div>
```

**효과**: 이름·숫자 간격 확 줄어듦 + 색상으로 한눈에 심각도 분포 파악 + 공통 컴포넌트화.

### F2-2. SEVERITY_COLOR 헬퍼 추출

**신규 파일**: `src/lib/defect-severity-color.ts`

`EpicDefectCard.tsx` 에 있는 `SEVERITY_COLOR` 매핑을 헬퍼로 이동 → `DefectPatternCard`·`EpicDefectCard` 등 공유.

**공수**: 0.3일

---

## Phase 3 — 결함 회고 심도 확장 (요청 3, **1.2일**)

### F3-1. `EpicRetroSummary.defectStats` 확장

**파일**: `src/services/retrospective/types.ts` + `src/hooks/useDefectKpiAggregation.ts`

현재:
```ts
defectStats?: {
    defectCount: number;
    defectsPerCompletedTask: number;
    severityBreakdown: Array<{ name: string; count: number }>;
};
```

확장:
```ts
defectStats?: {
    // 기존
    defectCount: number;
    defectsPerCompletedTask: number;
    severityBreakdown: Array<{ name: string; count: number }>;

    // 신규 (Phase 3)
    /** 결함 타입 분포 (issuetype.name — 버그/개선/보안 등) */
    typeBreakdown: Array<{ name: string; count: number }>;
    /** 주간 발생 추이 (최근 12주) */
    weeklyTrend: Array<{ weekStart: string; count: number }>;
    /** 트렌드 방향: 'improving' | 'stable' | 'worsening' */
    trendDirection: 'improving' | 'stable' | 'worsening' | 'insufficient';
    /** 결함 집중 담당자 (상위 N명) */
    topAffectedPeople: Array<{ name: string; count: number; pctOfEpic: number }>;
    /** 자동 생성된 권고 메시지 */
    recommendations: string[];
    /** 팀 평균 대비 Density delta (pct points) */
    densityVsTeamAvg: number | null;
};
```

### F3-2. `EpicDefectCard` 재설계

**파일**: `EpicDefectCard.tsx` — 대폭 확장

기존 4개 메트릭 + 신규 4개 섹션:

```
┌─────────────────────────────────────────────────────┐
│ 결함 회고                          [S/A/B/C/D 등급] │
├─────────────────────────────────────────────────────┤
│ ┌────────┬────────┬──────────┬─────────────┐       │
│ │ 결함   │ Defect │ 팀 평균  │ 트렌드       │       │
│ │ N건    │ Density│ 대비     │ ↗↘→         │       │
│ │        │ X%     │ +/-N%p   │              │       │
│ └────────┴────────┴──────────┴─────────────┘       │
│                                                     │
│ 심각도 분포  [Critical 3] [Major 5] [Minor 2]      │
│ 타입 분포    [버그 7] [개선 2] [보안 1]             │
│                                                     │
│ 주간 추이 (최근 12주) ▂▃▅▃▂▁                       │
│                                                     │
│ 집중 담당자:                                         │
│   홍길동 4건 (40%) · 김철수 3건 (30%)               │
│                                                     │
│ 💡 권고:                                            │
│   ▸ Critical 3건 중 2건이 동일 담당자 →            │
│     코드 리뷰 심화 또는 pair programming            │
│   ▸ 최근 4주간 감소세 → 현재 대응 방향 유지        │
└─────────────────────────────────────────────────────┘
```

### F3-3. 자동 권고 규칙 엔진 (Phase 3 핵심)

**신규 파일**: `src/services/retrospective/defectInsights.ts`

규칙 기반 권고 생성:

```ts
export function generateDefectRecommendations(
    stats: DefectStatsExtended,
    teamBaseline: TeamDefectBaseline
): string[] {
    const recs: string[] = [];

    // R1: Critical/Blocker 집중도
    const critical = stats.severityBreakdown.find(s =>
        /critical|blocker|highest/i.test(s.name)
    );
    if (critical && critical.count >= 3) {
        recs.push(
            `Critical/Blocker 결함 ${critical.count}건 발생 — ` +
            `근본 원인 분석(RCA) 세션 권장`
        );
    }

    // R2: 1인 집중
    const top = stats.topAffectedPeople[0];
    if (top && top.pctOfEpic >= 50) {
        recs.push(
            `결함의 ${top.pctOfEpic}%가 ${top.name}에게 집중 — ` +
            `업무 부하·전문 영역 재검토 또는 pair programming 고려`
        );
    }

    // R3: 트렌드 악화
    if (stats.trendDirection === 'worsening') {
        recs.push(
            `최근 4주 결함 증가세 — 릴리스 전 QA 체크리스트·회귀 테스트 보강 권장`
        );
    }

    // R4: 트렌드 개선
    if (stats.trendDirection === 'improving') {
        recs.push(
            `최근 4주 감소세 — 현재 프로세스 유지, 다른 에픽에도 확산 고려`
        );
    }

    // R5: 팀 평균 대비 과다
    if (stats.densityVsTeamAvg != null && stats.densityVsTeamAvg > 5) {
        recs.push(
            `Defect Density가 팀 평균 대비 +${stats.densityVsTeamAvg}%p — ` +
            `요구사항 명확화·설계 리뷰 단계 강화 필요`
        );
    }

    // R6: 타입 편향
    const topType = stats.typeBreakdown[0];
    if (topType && topType.count >= stats.defectCount * 0.7) {
        recs.push(
            `결함의 70% 이상이 '${topType.name}' 타입 — ` +
            `해당 영역 자동화 테스트 투자 우선`
        );
    }

    return recs.slice(0, 3); // 최대 3건 표시
}
```

**공수**: 1.2일 (타입·hook 확장 0.4d + 컴포넌트 재설계 0.5d + 규칙 엔진 + 테스트 0.3d)

---

## Phase 4 — 담당자별 결함 인사이트 (요청 6, **1.5일**)

**"개발자들의 앞으로 더 나은 개발 지표를 위해 부족한 부분은 어디인지, 개선 할 방법은 무엇인지"**

### F4-1. 담당자 프로파일 타입 확장

**파일**: `defect-kpi-utils.ts`

```ts
export interface DefectKpiDeveloperRow {
    // 기존 필드
    key: string;
    displayName: string;
    devIssueCount: number;
    defectCount: number;
    defectRatePercent: number | null;
    severityBreakdown: Array<{ name: string; count: number }>;
    grade: 'S'|'A'|'B'|'C'|'D'|'—';

    // 신규 필드 (v1.0.12 인사이트)
    /** 팀 중앙값 대비 백분위 (0~100, 낮을수록 결함 적음) */
    teamPercentile: number | null;
    /** Critical/Blocker 등 심각 결함의 비중 (가중 점수) */
    severityWeightedScore: number;
    /** 개발자의 주력 이슈 타입 (최다 담당) */
    primaryIssueType: string | null;
    /** 완료 Task 대비 Cycle time percentile — 느림 vs 빠름 */
    speedPercentile: number | null;
    /** 강점 영역 (DeveloperStrengthMatrix 결과 병합) */
    strengths: string[]; // ['Fast cycle in 버그', 'Low defect rate']
    /** 개선 포인트 — 자동 권고 */
    improvementAreas: string[]; // ['Critical 결함 집중', 'Cycle time 팀 평균 대비 +40%']
    /** 페르소나 분류 */
    profile: 'mentor' | 'balanced' | 'specialized' | 'needs-support' | 'new-joiner';
}
```

### F4-2. 인사이트 엔진 규칙

**신규 파일**: `src/services/retrospective/developerInsights.ts`

```ts
/**
 * 담당자별 회고 인사이트 생성.
 * 여러 데이터 소스 통합: DefectKpiDeveloperRow + DeveloperStrengthRow + (선택) KPI 점수.
 */
export function analyzeDeveloperProfile(
    defectRow: DefectKpiDeveloperRow,
    strengthRow: DeveloperStrengthRow | undefined,
    teamBaseline: { medianDefectRate: number; medianCycleTime: number },
): DeveloperProfile {
    const strengths: string[] = [];
    const improvements: string[] = [];

    // 결함 백분위
    if (defectRow.defectRatePercent != null) {
        if (defectRow.defectRatePercent <= teamBaseline.medianDefectRate * 0.5) {
            strengths.push('낮은 결함율 (팀 평균의 절반 이하)');
        } else if (defectRow.defectRatePercent >= teamBaseline.medianDefectRate * 2) {
            improvements.push(
                `결함율 팀 평균 대비 ${Math.round(
                    (defectRow.defectRatePercent / teamBaseline.medianDefectRate - 1) * 100
                )}% 높음 — 요구사항 재확인·테스트 커버리지 점검`
            );
        }
    }

    // Severity weighted
    const weighted = weightedSeverityScore(defectRow.severityBreakdown);
    if (weighted >= 10) {
        improvements.push(
            `심각 결함(Critical/Blocker) 비중 높음 (가중 점수 ${weighted}) — ` +
            `설계 리뷰·pair programming 권장`
        );
    }

    // Strength matrix 활용 (type별 cycle time)
    if (strengthRow) {
        const types = Array.from(strengthRow.byType.entries())
            .sort((a, b) => a[1].avgCycleTimeDays - b[1].avgCycleTimeDays);
        if (types.length > 0) {
            const fastest = types[0];
            if (fastest[1].count >= 3 && fastest[1].avgCycleTimeDays <= teamBaseline.medianCycleTime * 0.7) {
                strengths.push(`'${fastest[0]}' 타입에서 팀 평균보다 빠름 — 멘토링·리뷰어 역할 적합`);
            }
            const slowest = types[types.length - 1];
            if (slowest[1].count >= 3 && slowest[1].avgCycleTimeDays >= teamBaseline.medianCycleTime * 1.5) {
                improvements.push(
                    `'${slowest[0]}' 타입 cycle time 팀 평균 대비 +${Math.round(
                        (slowest[1].avgCycleTimeDays / teamBaseline.medianCycleTime - 1) * 100
                    )}% — pair programming 또는 해당 영역 학습 기회 제공`
                );
            }
        }
    }

    // 페르소나 분류
    let profile: DeveloperProfile['profile'] = 'balanced';
    if (strengths.length >= 2 && improvements.length === 0) profile = 'mentor';
    else if (improvements.length >= 2) profile = 'needs-support';
    else if (strengths.length === 1 && improvements.length === 1) profile = 'specialized';
    else if (defectRow.devIssueCount < 5) profile = 'new-joiner';

    return { strengths, improvements, profile, severityWeightedScore: weighted };
}
```

### F4-3. `DefectPatternCard` 확장 — 인사이트 셀

**파일**: `DefectPatternCard.tsx`

기존 테이블에 **드릴다운 행** 추가 — 행 클릭 시 펼침:

```
┌─────────┬────────┬─────┬────────┬───────────┬─────┐
│ 담당자  │ Task  │결함 │ 비율   │ 심각도    │ 등급│
├─────────┼────────┼─────┼────────┼───────────┼─────┤
│ ▶ 홍길동│  15   │  3  │ 20%    │[C1][Mj 2] │  C  │
│    └──────────────── 펼침 ────────────────────┤
│    📊 팀 백분위:  상위 40% (낮을수록 좋음)        │
│    💪 강점:                                      │
│       ▸ '버그' 타입 cycle time 팀 평균의 60%     │
│    🎯 개선 포인트:                               │
│       ▸ Critical 1건 — 설계 리뷰 단계 강화       │
│       ▸ '개선' 타입 cycle time +40% — 학습 기회 │
│    🏷️ 프로파일: [Specialized — 특정 영역 강함]   │
├─────────┼────────┼─────┼────────┼───────────┼─────┤
│ ▶ 김철수│  ...                                 │
└─────────┴────────┴─────┴────────┴───────────┴─────┘
```

### F4-4. 팀 기준선(baseline) 계산

**추가 함수**: `computeTeamDefectBaseline(rows): { medianDefectRate, medianCycleTime }`

중앙값·사분위수 기반 — 평균 대비 outlier 영향 최소화.

**공수**: 1.5일 (타입 + 엔진 + UI + 테스트)

---

## Phase 5 — 용어 글로서리 중앙화 (옵션, 0.5일)

Phase 1의 InfoTip 텍스트를 분산 관리하면 유지보수 어려움. 한 파일로:

**신규 파일**: `src/lib/glossary.ts`

```ts
export const GLOSSARY = {
    monteCarloForecast: {
        term: 'Monte Carlo Throughput',
        short: '무작위 샘플링 10,000회 기반 ETA 예측',
        long: '과거 일별 완료 건수에서 무작위로 하루치를 뽑아...'
    },
    p85: {
        term: 'P85 (85th Percentile)',
        short: '전체 시뮬레이션의 85%가 이 날짜까지 완료',
        long: '...'
    },
    // ... 20개 용어
} as const;
```

각 InfoTip에서 `GLOSSARY.p85.short` 참조 → 변경 시 한 곳만 수정.

**공수**: 0.5일

---

## 일정

```
D1 AM │ Phase 1: InfoTip 확대 (F1-1·F1-2·F1-3)              (4h)
D1 PM │ Phase 2: 심각도 분포 UI + SEVERITY_COLOR 공용화       (2h)
D2    │ Phase 3: defectStats 확장 + EpicDefectCard 재설계   (1d)
D3    │ Phase 3: 권고 규칙 엔진 + 테스트 완료
       Phase 4: 타입 + 인사이트 엔진                          (1d)
D4 AM │ Phase 4: DefectPatternCard 드릴다운 UI                (4h)
D4 PM │ Phase 5: 글로서리 (옵션) + 통합 테스트 + PATCH.md    (4h)

총: 3~4일 (Phase 5 포함 시 4일)
```

---

## 검증 기준

### Phase 1 (InfoTip)
- [ ] 에픽 회고 담당자 테이블 5개 컬럼 모두 InfoTip 부착
- [ ] 완료 예측 섹션 헤더에 용어 글로서리 아이콘 → 6개 용어 설명
- [ ] EtaScenarioCard 3 시나리오에 개별 InfoTip

### Phase 2 (UI)
- [ ] 담당자 결함 패턴의 심각도 셀이 pill 형태로 붙어 표시
- [ ] 색상이 Critical=적, Major=주, Minor=청 으로 정확히 매핑
- [ ] 모바일 viewport (375px)에서도 레이아웃 깨짐 없음

### Phase 3 (결함 회고 심도)
- [ ] 타입 분포·주간 추이·집중 담당자·권고 모두 표시
- [ ] 권고 엔진이 6개 규칙(R1~R6) 모두 트리거 가능
- [ ] 데이터 부족 시 안내 (e.g., "주 4개 미만 — 추세 분석 불가")

### Phase 4 (개발자 인사이트)
- [ ] 각 담당자 행 클릭 시 강점/개선점/프로파일 펼쳐짐
- [ ] 팀 백분위·페르소나 라벨이 한눈에 읽힘
- [ ] 개선 제안이 구체적 액션을 포함 ("학습 기회 제공" 등)

### 비기능
- [ ] 기존 251 vitest 케이스 통과 + 신규 15~20 케이스
- [ ] tsc·lint 에러 0
- [ ] Export(Excel)에도 인사이트 시트 추가 고려

---

## 보호 (변경 안 함)

```
✋ calculateKPI의 핵심 산식
✋ "코칭 도구 — 성과 평가 X" 원칙
✋ 익명화 모드 (외부 공유 시 모든 이름 alias 처리)
✋ 기존 InfoTip 컴포넌트 구조 (children 기반)
✋ KPI 성과 탭의 DefectKpiDashboard (동일 데이터 소스 공유만)
```

---

## 위험 & 완화

| 위험 | 완화 |
|------|------|
| 자동 권고가 "평가"로 오해 | 용어 신중 — "권장", "고려", "기회 제공" 사용. 배너에 "코칭 도구" 재강조 |
| 주간 추이 데이터 부족 (매핑 기간 짧음) | "주 4개 미만 — 추세 분석 불가" 안내 + fallback |
| 팀 중앙값이 소수 인원으로 왜곡 | rows < 3 이면 백분위 계산 스킵 + "표본 부족" 표시 |
| 인사이트 UI가 너무 무거워 로딩 느림 | useMemo로 계산 캐시 + 행 펼침은 lazy (클릭 시에만 계산) |
| 사용자별로 필요한 인사이트가 다름 | Phase 5의 글로서리로 용어 일관성 + 향후 권고 규칙 on/off UI (별도 마일스톤) |

---

## 다음 액션

```
□ 본 계획서 검토
□ Phase 1 시작 (가장 빠른 ROI — 2~3시간)
□ Phase 3·4의 자동 권고 규칙에 대한 PM 합의 (용어·기준치)
□ 각 Phase 완료 시 vitest + tsc 중간 검증
□ 전체 완료 후 PATCH.md v1.0.12 + 커밋
```

---

## 관련 문서

- `docs/kpi-rules-fix-plan.md` — v1.0.9 (KPI 정합성)
- `docs/kpi-store-integration-v1.0.10-plan.md` — v1.0.10 (Store 통합)
- `docs/epic-retrospective-analysis.md` — 기존 회고 설계
- `docs/user-guide-prediction.md` — 사용자 가이드

---

**문서 끝.**
