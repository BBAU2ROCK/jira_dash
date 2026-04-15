# 진행 추이·예측 기능 작업계획서

> **연관 문서**: [`progress-prediction-analysis.md`](./progress-prediction-analysis.md) (정밀 분석 보고서)
> **작성 일자**: 2026-04-15
> **대상 Tier**: **Tier 2** (4 영업일 + 사전 측정 0.5일)

---

## 1. Context (왜 이 작업)

### 문제
1. 사용자가 백로그 완료 시점을 가늠할 수단이 없음 — "언제 끝나?"에 답할 수 없음
2. 오늘/이번주 완료 건수 같은 일일 KPI 없음
3. 미완료 지연 (overdue in progress)이 KPI 산식에 누락되어 있어 "지금 처리 필요" 신호 없음
4. 개인별 워크로드 균형을 볼 수단 없음 — 병목 식별 불가
5. 백로그 그루밍 시 작업 크기 추정에 의존할 데이터 없음

### 목표 (acceptance criteria)
- ✅ 다이얼로그 신규 탭 "진행 추이/예측" 추가
- ✅ Monte Carlo 기반 P85 약속일 표시 (신뢰도 등급 동반)
- ✅ 3 시나리오 ETA (낙관/기준/병목) 비교
- ✅ 담당자별 처리량 표 (정렬 가능, 가나다 default)
- ✅ 백로그 공수 추정 (3 데이터 소스 hybrid + 신뢰 구간)
- ✅ ETA ↔ 공수 자동 상호 검증 + 불일치 경고
- ✅ 6 카드 (백로그 상태 5종 + 오늘/이번주 완료)
- ✅ 일별 완료 추이 차트
- ✅ 단위 테스트 33+ 케이스
- ✅ 신규 산식의 회귀 안전망 확보

### 비목표 (Tier 3로 분리)
- ❌ 워크로드 4분위 scatter chart
- ❌ 이슈별 공수 표 (그루밍 뷰)
- ❌ 익명화 모드
- ❌ 예측 정확도 추적 (localStorage 기록)
- ❌ Web Worker 분리 (1000+ 이슈일 때만)
- ❌ Cycle time per issue 정밀 분석
- ❌ Slack/이메일 알림

---

## 2. 사전 결정 항목 (작업 시작 전 확인)

```
□ 1. 데이터 범위         : 전체 프로젝트 + 토글 [기본 ON]
□ 2. "이번주" 시작 요일  : 월요일
□ 3. 표시 단위           : 건수 (SP는 hover)
□ 4. 영업일/공휴일       : 주말 + 한국 공휴일 수동
□ 5. Monte Carlo trials  : 10,000
□ 6. 참조 기간           : 30일 default, 14/30/60/90 옵션
□ 7. 노출 백분위         : P50, P85, P95
□ 8. 개인 식별 기본값    : 실명 (사내 환경)
□ 9. 미할당 처리         : 별도 카운트 + 가상 분배
□ 10. 가동률 가정        : 65% (슬라이더)
□ 11. ETA-공수 불일치 임계: 30%
```

→ 권장값 그대로 진행. 변경 시 작업 시작 전 합의.

---

## 3. Phase 0 — 사전 측정 (0.5일)

데이터 적합도 사전 평가. **이 결과에 따라 Tier 조정 가능**.

### 작업
1. 21장의 6개 curl 명령 실행 (분석 보고서)
2. 결과 표 작성:

```
측정 결과 (2026-04-XX)
┌──────────────────────────┬────────────┬──────────┐
│ 항목                     │ 값         │ 적합도   │
├──────────────────────────┼────────────┼──────────┤
│ 90일 활동 일수           │ N일        │ ✅ / ⚠ / ❌│
│ SP 커버리지              │ XX%        │ ✅ / ⚠ / ❌│
│ Worklog 커버리지         │ XX%        │ ✅ / ⚠ / ❌│
│ 난이도 커버리지          │ XX%        │ ✅ / ⚠ / ❌│
│ 활성 담당자 수           │ N명        │ ✅ / ⚠ / ❌│
│ 미할당 비율              │ XX%        │ ✅ / ⚠ / ❌│
└──────────────────────────┴────────────┴──────────┘
```

3. **분기 결정**:
   - 활동 일수 < 14일 → Tier 1만 진행 (예측 비활성)
   - SP 커버리지 < 70% → hybrid에서 SP 모드 자동 OFF
   - Worklog 커버리지 < 30% → hybrid에서 worklog 모드 자동 OFF
   - 활동 인원 < 3명 → "낙관" 시나리오 비표시
   - 모든 게 적합 → Tier 2 그대로 진행

### 산출물
- `docs/progress-prediction-data-fitness.md` (측정 결과 + 결정 사항)

---

## 4. Phase 1 — 기반 인프라 (0.5일)

### 4.1 신규 의존성 검토
- `recharts` ✅ 이미 설치됨
- `date-fns` ✅ 이미 설치됨
- 추가 설치 없음

### 4.2 신규 타입 정의
- `src/services/prediction/types.ts` — 분석 보고서 20.4 그대로

### 4.3 환경 설정 확장
```typescript
// src/config/jiraConfig.ts (확장)
export const JIRA_CONFIG = {
    // ... 기존
    WEEK_STARTS_ON: 1, // 월요일
    KOREAN_HOLIDAYS_2026: [
        '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18',
        '2026-03-01', '2026-05-05', '2026-05-25', '2026-06-06',
        '2026-08-15', '2026-09-24', '2026-09-25', '2026-09-26',
        '2026-10-03', '2026-10-09', '2026-12-25',
    ],
    PREDICTION: {
        DEFAULT_HISTORY_DAYS: 30,
        MONTE_CARLO_TRIALS: 10_000,
        DEFAULT_UTILIZATION: 0.65,
        ETA_EFFORT_GAP_THRESHOLD: 0.30,
        SP_COVERAGE_THRESHOLD: 0.70,
        WORKLOG_COVERAGE_THRESHOLD: 0.30,
    },
};
```

### 4.4 date-utils 확장
```typescript
// src/lib/date-utils.ts (확장)
export function isBusinessDay(date: Date, holidays: Set<string>): boolean
export function addBusinessDays(start: Date, days: number, holidays: Set<string>): Date
export function businessDaysBetween(a: Date, b: Date, holidays: Set<string>): number
export function startOfKoreanWeek(date: Date): Date
export function endOfKoreanWeek(date: Date): Date
export function isToday(date: Date): boolean
export function isThisWeek(date: Date): boolean
export function safeParseDate(value: unknown): Date | null
```

### 4.5 단위 테스트 (4 케이스)
- `business day count`
- `add business days across holidays`
- `start of Korean week (Mon)`
- `safeParseDate edge cases`

### 산출물 체크리스트
- [ ] `src/services/prediction/types.ts`
- [ ] `src/config/jiraConfig.ts` (확장)
- [ ] `src/lib/date-utils.ts` (확장)
- [ ] `src/lib/__tests__/date-utils.test.ts`

---

## 5. Phase 2 — 핵심 서비스 + 단위 테스트 (1.5일)

### 5.1 Monte Carlo 엔진
- `src/services/prediction/monteCarloForecast.ts`
- 분석 보고서 3.4 알고리즘 그대로
- Scope creep 옵션 (3.5) 포함
- 단위 테스트 6 케이스

### 5.2 신뢰도 등급
- `src/services/prediction/confidence.ts`
- 분석 보고서 3.6
- 단위 테스트 5 케이스

### 5.3 담당자별 forecast
- `src/services/prediction/perAssigneeForecast.ts`
- 분석 보고서 4.3, 4.4 (미할당 처리)
- 단위 테스트 6 케이스

### 5.4 공수 추정 (hybrid)
- `src/services/prediction/effortEstimation.ts`
- 분석 보고서 5.3
- 단위 테스트 8 케이스

### 5.5 상호 검증
- `src/services/prediction/crossValidation.ts`
- 분석 보고서 6.1
- 단위 테스트 4 케이스

### 5.6 Scope 분석
- `src/services/prediction/scopeAnalysis.ts`
- 분석 보고서 3.5
- 단위 테스트 4 케이스 (안정/성장/위기/수렴)

### 산출물 체크리스트
- [ ] 6개 service 파일
- [ ] 33개 vitest 케이스 통과
- [ ] `npm test` 0 fail
- [ ] 새 함수 모두 JSDoc 작성

---

## 6. Phase 3 — Hook + 데이터 fetch (0.5일)

### 6.1 전체 프로젝트 fetch hook
```typescript
// src/hooks/useProjectIssues.ts
export function useProjectIssues(projectKey: string, options?: {
    enabled?: boolean;
    staleTime?: number;
}): {
    data: JiraIssue[] | undefined;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
}
```

JQL: `project = ${projectKey}` — 모든 이슈. 페이지네이션은 `getIssuesForEpic` 패턴 재사용.

### 6.2 통합 forecast hook
```typescript
// src/hooks/useBacklogForecast.ts
export function useBacklogForecast(options?: {
    rangeDays?: number;
    mode?: 'epic' | 'project';
}): {
    team: TeamForecast | null;
    effort: BacklogEffortReport | null;
    isLoading: boolean;
    error: Error | null;
    confidence: ConfidenceLevel;
    warnings: string[];
}
```

내부에서 useMemo chain으로 모든 service 호출.

### 6.3 캐싱 키
- `['project-issues', PK]` staleTime 5분
- `['daily-throughput', PK, days]` staleTime 30분
- `['monte-carlo', issueCount, throughputHash]` staleTime ∞ (순수 함수)

### 산출물 체크리스트
- [ ] `useProjectIssues.ts`
- [ ] `useBacklogForecast.ts`
- [ ] hook 테스트 (선택, 통합 테스트로 대체 가능)

---

## 7. Phase 4 — UI 컴포넌트 (1.5일)

### 7.1 신규 디렉터리 구조
```
src/components/progress-trends/
├── index.tsx                    — 진입점, 탭 컨텐츠
├── BacklogStateCards.tsx        — 6 카드 (잔여/활성/보류/미할당/완료/지연)
├── TodayWeekCards.tsx           — 오늘/이번주 카드
├── DelayCards.tsx               — 미완료지연/완료지연/마감일미설정
├── DailyCompletionChart.tsx     — recharts BarChart 30일
├── EtaScenarioCard.tsx          — 3 시나리오
├── ForecastFunnelChart.tsx      — 확률 깔때기
├── PerAssigneeTable.tsx         — 담당자별 표
├── EffortReportCard.tsx         — 공수 분석
├── EtaEffortConsistency.tsx     — 상호 검증 + 경고
└── MethodologyDialog.tsx        — "방법론 보기" 모달
```

### 7.2 ProjectStatsDialog 통합
```tsx
<TabsContent value="trends">
    <ProgressTrends />
</TabsContent>
```
신규 탭만 추가, 기존 두 탭 동작 영향 없음.

### 7.3 색상 팔레트 (색약 친화)
```typescript
export const PROGRESS_COLORS = {
    completed: '#2563eb',     // blue-600 (녹색 대신)
    inProgress: '#0891b2',    // cyan-600
    waiting: '#94a3b8',       // slate-400
    onHold: '#a855f7',        // purple-500 (대비)
    cancelled: '#64748b',     // slate-600
    overdue: '#ea580c',       // orange-600 (적색 대신)
    overdueDone: '#9333ea',   // purple-600 (빗금 보조)
};
```

### 7.4 a11y 기본
- 모든 차트: `<svg role="img" aria-label="...">`
- 차트 옆 "주요 수치 요약" 텍스트 (스크린리더용)
- 표: `<th scope="col">` 명시
- 카드: `tabindex="0"` + Enter 활성화

### 산출물 체크리스트
- [ ] 11개 컴포넌트 파일
- [ ] ProjectStatsDialog에 신규 탭 등록
- [ ] 색상·a11y 패턴 적용
- [ ] 빈 상태/로딩/에러 분기 처리 (분석 보고서 12.1~12.3)

---

## 8. Phase 5 — 통합 + 검증 (0.5일)

### 8.1 자동 검증
```bash
npm run lint           # 0 errors 유지
npx tsc -b             # 0 errors
npx vitest run         # 33+ pass
npm run build          # 빌드 성공
```

### 8.2 수동 스모크 테스트 체크리스트

```
[기본 동작]
□ 다이얼로그에서 "진행 추이/예측" 탭이 보임
□ 6 카드 모두 데이터 표시 (또는 적절한 빈 상태)
□ 오늘/이번주 카드가 KST 기준 정확
□ 일별 완료 BarChart 렌더링 (최근 30일)

[ETA 시나리오]
□ 3 시나리오 ETA가 모두 표시됨
□ Confidence 배지가 데이터에 맞게 표시 (high/med/low/unreliable)
□ 신뢰도 low일 때 단일 날짜 숨김 + 범위만 표시
□ Funnel chart에서 P50/P85/P95 마커 보임

[담당자별]
□ 표가 가나다 순으로 정렬
□ 미할당 행이 별도 표시 + "가상 분배" 라벨
□ 활동일 7일 미만 인원 회색 처리
□ ETA 정렬 옵션 동작

[공수]
□ 총 공수가 인시 + 인일로 표시
□ 데이터 출처 분포 표시 (worklog/SP/난이도/평균)
□ SP 커버리지 < 70% 이면 SP 출처 비활성 + 안내
□ Worklog 커버리지 < 30% 이면 worklog 출처 비활성 + 안내

[상호 검증]
□ ETA-공수 일치 시 정상 표시
□ 30% 격차 시 노란 경고 박스
□ 50% 이상 격차 시 "프로세스 비효율도" 해석

[Scope creep]
□ 신규/완료 비율 1.5 이상 시 ⛔ 경고
□ 보정된 Monte Carlo 결과가 단순 모델보다 길게 표시

[빈 상태]
□ 백로그 0건 시 "🎉 비어있음" 메시지
□ 활동 7일 미만 시 "데이터 부족" 메시지
□ 모든 인원 unreliable 시 팀 ETA만, 개인 표 안내

[성능]
□ 100~200 이슈에서 렌더링 1초 이내
□ 차트 hover 지연 없음
□ 다이얼로그 열기 200ms 이내

[a11y]
□ Tab 키로 모든 카드 포커스
□ 차트 ARIA label 존재
□ 색약 시뮬레이션 (Chrome DevTools)에서 구분 가능
```

### 8.3 산출물 체크리스트
- [ ] 자동 검증 4종 통과
- [ ] 수동 스모크 28개 항목 통과
- [ ] 사용자 가이드 초안 작성

---

## 9. 일정 (5 영업일)

```
일자  | Phase                       | 시간    | 누적
─────┼─────────────────────────────┼────────┼──────
D1 AM │ Phase 0: 사전 측정          │ 0.5일  │ 0.5
D1 PM │ Phase 1: 기반 인프라        │ 0.5일  │ 1.0
D2    │ Phase 2: 핵심 서비스 + 테스트│ 1.0일  │ 2.0
D3 AM │ Phase 2 마무리              │ 0.5일  │ 2.5
D3 PM │ Phase 3: Hook + fetch       │ 0.5일  │ 3.0
D4    │ Phase 4: UI 컴포넌트        │ 1.0일  │ 4.0
D5 AM │ Phase 4 마무리              │ 0.5일  │ 4.5
D5 PM │ Phase 5: 통합 + 검증        │ 0.5일  │ 5.0
```

**버퍼**: 0.5~1일 (예상치 못한 데이터 적합도 문제, refactor 발견)

---

## 10. 산출물 목록

### 신규 파일
```
src/services/prediction/
├── types.ts
├── monteCarloForecast.ts
├── perAssigneeForecast.ts
├── effortEstimation.ts
├── crossValidation.ts
├── confidence.ts
├── scopeAnalysis.ts
└── index.ts

src/services/prediction/__tests__/
├── monteCarloForecast.test.ts
├── perAssigneeForecast.test.ts
├── effortEstimation.test.ts
├── crossValidation.test.ts
├── confidence.test.ts
└── scopeAnalysis.test.ts

src/hooks/
├── useProjectIssues.ts
└── useBacklogForecast.ts

src/components/progress-trends/
├── index.tsx
├── BacklogStateCards.tsx
├── TodayWeekCards.tsx
├── DelayCards.tsx
├── DailyCompletionChart.tsx
├── EtaScenarioCard.tsx
├── ForecastFunnelChart.tsx
├── PerAssigneeTable.tsx
├── EffortReportCard.tsx
├── EtaEffortConsistency.tsx
└── MethodologyDialog.tsx

docs/
├── progress-prediction-analysis.md       (이미 작성)
├── progress-prediction-workplan.md       (본 문서)
├── progress-prediction-data-fitness.md   (Phase 0 산출)
└── user-guide-prediction.md              (Phase 5 산출)
```

### 수정 파일
```
src/lib/date-utils.ts              (확장)
src/config/jiraConfig.ts           (확장)
src/components/project-stats-dialog.tsx  (탭 추가만)
PATCH.md                           (1.0.7 변경 내역 추가)
package.json                       (version bump 1.0.6 → 1.0.7)
```

### 변경 안 함 (보호)
```
- src/services/kpiService.ts        (산식 동일 유지)
- src/lib/jira-helpers.ts           (filterLeafIssues 동일)
- src/api/jiraClient.ts             (API 동일)
- electron/main.ts                  (보안 설정 동일)
```

---

## 11. 검증 기준 (acceptance criteria)

### 기능 요구
- [ ] 모든 Phase 0~5 산출물 완성
- [ ] 33+ 단위 테스트 통과
- [ ] 28+ 수동 스모크 통과
- [ ] 빌드 (`npm run build`) 성공
- [ ] Lint 0 errors

### 비기능 요구
- [ ] 200 이슈에서 렌더링 < 1초
- [ ] 다이얼로그 탭 전환 < 300ms
- [ ] 차트 hover 지연 없음
- [ ] 색약 시뮬레이션에서 색 구분 가능
- [ ] Tab 키 네비게이션 가능

### 정직성 요구 (UX)
- [ ] confidence 'unreliable'일 때 단일 날짜 표시 안 됨
- [ ] confidence 'low'일 때 범위만 표시 (단일 날짜 X)
- [ ] 모든 ETA에 P85 마커 명시
- [ ] 가정 정보 (영업일/공휴일/N일 history) 명시
- [ ] Scope creep 위기일 때 ETA 비표시 + 강한 경고
- [ ] 공수 항상 신뢰 구간 표시 (단일 숫자 X)

---

## 12. 위험 매트릭스 (실행 단계)

| 위험 | 발생 시점 | 완화 |
|------|-----------|------|
| 데이터 적합도 부족 | Phase 0 | Tier 1로 후퇴 결정 |
| Monte Carlo 성능 이슈 | Phase 2 | trials 5000으로 감소, Web Worker는 Tier 3 |
| 차트 렌더링 느림 | Phase 4 | useDeferredValue, lazy import |
| ProjectStatsDialog 충돌 | Phase 4 | 신규 탭만 추가, 기존 코드 보호 |
| 단위 테스트 timezone fail | Phase 2 | now 인자 주입, 모든 케이스 KST 가정 |
| 사용자가 단일 ETA 요구 | UAT | "정직성 요구"를 분석 보고서로 설명 |
| 개인 정보 우려 | UAT | 익명화 모드를 Tier 3로 약속 |

---

## 13. 출시 후 백로그 (Tier 3 후보)

우선순위 순:

1. **[중요]** 예측 정확도 추적 — 신뢰도 calibration의 근거
2. **[중요]** 익명화 모드 — 외부 공유 시 안전
3. **[중간]** 워크로드 4분위 scatter — 병목 시각화
4. **[중간]** 이슈별 공수 표 — 백로그 그루밍
5. **[중간]** Cycle time per issue — 항목별 ETA
6. **[중간]** Web Worker — 1000+ 이슈 대응
7. **[낮음]** 한국 공휴일 자동 (`date-holidays` 라이브러리)
8. **[낮음]** Sprint API 연동 (스프린트 종료일 기반)
9. **[낮음]** Export (PDF/Excel)
10. **[낮음]** 다중 프로젝트 지원

---

## 14. 다음 액션

```
□ 본 작업계획서 검토
□ 11개 사전 결정 항목 확정
□ Phase 0 사전 측정 실행 (0.5일)
□ 측정 결과 보고
□ Tier 2 진행 또는 Tier 1 후퇴 결정
□ 결정 시 Plan 모드 진입 → 구현 시작
```

---

## 15. 참고 명령

### Phase 0 측정
```bash
cd D:/01_project/01_jira_dash
# 분석 보고서 21장의 6개 curl 실행
# 결과를 docs/progress-prediction-data-fitness.md에 정리
```

### 개발 시작
```bash
npm run dev:web              # 또는 npm run dev (Electron)
npx vitest                   # watch 모드
```

### 최종 검증
```bash
npm run lint
npx tsc -b
npx vitest run
npm run build
npm run build:install        # exe까지 검증 (선택)
```

---

**문서 끝 — 작업 시작 전 본 문서로 정렬, 진행 중 체크리스트로 진척 추적.**
