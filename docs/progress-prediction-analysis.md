# 진행 추이·예측 기능 정밀 분석 보고서

> **문서 목적**: 신규 "진행 추이/예측" 기능 구현 전, 도메인·수학·통합·운영·UX·보안 측면을 종합 분석하여 의사결정의 근거를 제공합니다.
> **작성 일자**: 2026-04-15
> **연관 문서**: [`progress-prediction-workplan.md`](./progress-prediction-workplan.md) (실행 계획)

---

## 0. 한 줄 요약

> 단순 평균 ETA는 30~50% 낙관 편향. **Monte Carlo 처리량 시뮬레이션 + 3 시나리오(낙관/기준/병목) + ETA-공수 상호 검증** 조합이 정직하면서 실용적인 답을 제공합니다.

---

## 1. 배경 및 목적

### 1.1 사용자 요청 4가지 기능
1. **오늘 / 이번주 완료 건수**
2. **지연 건수** (완료지연 + 미완료지연)
3. **시각화** (차트)
4. **전체 등록 타스크 완료 시점 예측** + 개발자별 속도 + 백로그 공수

### 1.2 기존 코드와의 관계
- 기존 자산: `filterLeafIssues`(통계 룰), `calculateKPI`(점수 산식), `customfield_10016`(SP), `customfield_10017`(난이도), `worklog`/`timespent`, `changelog`
- 재사용 80% / 신규 20% — 데이터 fetch는 기존 hook 활용 가능
- 통합 위치: `ProjectStatsDialog`에 신규 탭 추가 (별도 파일 분리)

### 1.3 본 문서의 범위
- 4개 기능의 수학적·도메인·UX 분석
- 데이터 무결성·성능·접근성·보안·운영 관점 보완
- 모델 한계와 안티패턴 명시
- 산업 표준 참고

---

## 2. 4가지 핵심 기능 — 정리

### 2-A. 오늘 / 이번주 완료 건수

**구현 가능성**: ✅ 가능 (난이도 낮음)

**완료일 결정 (기존 KPI와 동일)**:
```ts
actualEnd = customfield_11485 || resolutiondate
```

**시간대 함정**:
- `'YYYY-MM-DD'` 형식은 `new Date()`에서 UTC 자정으로 파싱 → KST 기준 9시간 어긋남
- 해결: `lib/date-utils.ts`에 `isCompletedToday(actualEnd)` 같은 의미별 헬퍼로 캡슐화

**이번주 정의**:
- `date-fns startOfWeek({weekStartsOn: 1})` → 월요일 시작 (한국 비즈니스 표준)
- `JIRA_CONFIG`에 `WEEK_STARTS_ON: 1` 상수로 박제

**표시 단위 권장**: 건수 (hover에 SP 정보)

### 2-B. 지연 건수 (용어 통일 필요)

현재 코드에 **3가지 다른 의미**로 "지연" 사용:

| 위치 | 변수 | 의미 |
|------|------|------|
| `kpiService.ts:51` | `delayedIssues` | 완료된 이슈 중 due 초과 |
| `project-stats-dialog.tsx` | `delayed` | 미완료 이슈 중 due 초과 |
| `issue-list.tsx:74` | `isDelayed` | 미완료 + due 초과 |
| `issue-list.tsx:78` | `isDelayedDone` | 완료 + due 초과 |

**표준화 권장**:
- `lateCompletion` (완료 후 늦음 = 사고 회복) — 기존 KPI delayedIssues
- `overdueInProgress` (미완료 진행 중 마감 초과 = 진행 위험)
- `overdueTotal = lateCompletion + overdueInProgress`

**카드 권장**: 미완료 지연 / 완료 지연 / 마감일 미설정 — 3개. "미완료 지연" 카드 클릭 → IssueList의 `onlyDelayed` 필터 자동 적용 (기존 메커니즘 재사용).

### 2-C. 시각화

| 시각화 | 라이브러리 | 위치 |
|--------|-----------|------|
| 요약 도넛 (오늘/이번주) | 커스텀 SVG | 카드 영역 |
| 일별 완료 추이 (30일) | recharts BarChart | 다이얼로그 |
| 지연 분포 (담당자별 stacked) | recharts BarChart | 다이얼로그 |
| 번다운/예측 깔때기 | recharts ComposedChart | 다이얼로그 |
| 워크로드 4분위 | recharts ScatterChart | 다이얼로그 |
| 헤더 sparkline | recharts mini LineChart | 헤더 |

### 2-D. 완료 시점 예측 — 별도 섹션 (3장)

---

## 3. 완료 시점 예측 정밀 분석

### 3.1 질문 자체 다시 정의

| 질문 형태 | 진짜 묻는 것 | 적합 모델 |
|----------|-------------|----------|
| "현재 백로그 다 끝나는 날?" | 닫힌 scope 가정 | 처리량 + 잔여 |
| "이번 분기 안에 끝낼 수 있나?" | 마감일 vs 능력 | 확률 P(완료 ≤ T) |
| "이 한 이슈 언제 끝나?" | 단일 항목 ETA | Cycle Time 분포 |
| "릴리스 일정 약속 가능?" | 위험 최소화 약속일 | 85th/95th percentile |

→ 본 화면 1순위 질문: "**현재 백로그 다 끝나는 보수적 약속일**"

### 3.2 단순 속도 평균이 잘못된 이유

#### (1) 분포가 정규분포가 아님
일별 완료 건수는 **포아송에 가까운 우측 치우침(right-skewed)**:
- 평균 ≠ 중앙값
- "평균 + 1σ"는 95% 신뢰구간이 아님 (정규분포 가정 위반)

#### (2) 비정상성(non-stationarity)
속도는 시간에 따라 체계적으로 변함:
- 스프린트 막판 가속, 분기말 일괄 close, 휴가철 둔화, 신규 인력 램프업, 블로커 발생/해소

#### (3) 잔여 작업의 비균질성
"건수 / 속도"는 모든 이슈를 동일하게 봄. 큰 작업 1개가 지배적일 수 있음.

#### **결론**: 단일 평균 ETA는 거의 항상 30~50% 빠르게 추정 → **분포·확률 framework 필수**.

### 3.3 6가지 모델 비교

| 모델 | 출력 | 강점 | 약점 | 구현 |
|------|------|------|------|------|
| A. 단순 평균 | 단일 날짜 | 직관적 | 분포 무시, 낙관 편향 | 1h |
| B. SMA + ±σ | 범위 | 변동 표시 | 정규성 가정 (틀림) | 2h |
| C. EMA (지수평활) | 범위 | 최근 가중치 | α 튜닝 필요 | 3h |
| D. 선형 회귀 | 추세선 | 트렌드 포착 | 비선형 무시 | 4h |
| **E. Monte Carlo Throughput** | **확률 분포** | **분포 자유, robust** | 학습곡선 약간 | **6h** |
| F. Cycle Time 백분위 | 단일 약속일 | 항목 단위 정확 | changelog 추가 fetch | 8h |

→ **권장**: E 주력 + F 보조

### 3.4 Monte Carlo 처리량 시뮬레이션

#### 핵심 아이디어
> "과거 일별 완료 건수에서 무작위로 하루치를 뽑아 잔여 작업이 0이 될 때까지 반복. 10,000번 시뮬레이션."

분포에 대한 어떤 가정도 하지 않음 (distribution-free).

#### 알고리즘 (TypeScript)
```typescript
function monteCarloForecast(
    remainingCount: number,
    historicalThroughput: number[],   // [2, 0, 3, 1, 2, 4, 0, 1, 5, ...]
    options: { trials?: number; maxDays?: number; rng?: () => number } = {}
): { daysToComplete: number[] } {
    const trials = options.trials ?? 10_000;
    const maxDays = options.maxDays ?? 365;
    const rng = options.rng ?? Math.random;
    const N = historicalThroughput.length;
    if (N === 0 || remainingCount <= 0) return { daysToComplete: [] };

    const results: number[] = new Array(trials);
    for (let t = 0; t < trials; t++) {
        let remaining = remainingCount;
        let days = 0;
        while (remaining > 0 && days < maxDays) {
            remaining -= historicalThroughput[Math.floor(rng() * N)];
            days++;
        }
        results[t] = days;
    }
    return { daysToComplete: results };
}

function percentileDays(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}
```

#### 출력
```
P(완료 ≤ 5/28) = 50%  ← 동전 던지기
P(완료 ≤ 6/12) = 85%  ← 권장 약속일 ★
P(완료 ≤ 6/27) = 95%  ← 위험 최소화
P(완료 ≤ 7/15) = 99%  ← 최악 시나리오
```

#### 실행 시간
- 10,000 trials × 평균 60일 루프 = ~600,000 연산 → **50ms 미만** (메인 스레드 OK)
- 100,000 trials 또는 1000일 시나리오는 Web Worker 권장 (8장 참고)

#### 산업 표준 근거
- Daniel Vacanti — *When Will It Be Done?* (Kanban University)
- Troy Magennis — Forecaster (FocusedObjective, 오픈소스)
- Atlassian Forecast (Jira Marketplace) — 동일 알고리즘
- #NoEstimates 운동 — 카운트 기반 예측 우월성

### 3.5 Scope Change — 1순위 예측 실패 원인

#### 측정
```
일별 신규 = count(created within day)
일별 완료 = count(actualDone within day)
순 속도   = 완료 - 생성
```

#### 임계값
| 비율 (신규/완료) | 상태 | 의미 |
|----------------|------|------|
| 0.7 ~ 1.0 | 안정 | 예측 신뢰 |
| 1.0 ~ 1.5 | 성장 | scope creep |
| **> 1.5** | **위기** | **백로그 발산, ETA 의미 없음** |
| < 0.7 | 수렴 | 마무리 단계 |

#### 보정된 Monte Carlo
```typescript
// 매 시뮬레이션 일에 신규 이슈도 무작위 샘플
const newToday = sampleFromHistory(creationHistory);
remaining += newToday;
remaining -= sampleFromHistory(completionHistory);
```

→ **단순 throughput 모델보다 항상 더 길고 정직한 ETA**

### 3.6 신뢰도 등급

```typescript
function confidenceLevel(stats): 'high' | 'medium' | 'low' | 'unreliable' {
    if (stats.activeDays < 7) return 'unreliable';
    if (stats.scopeRatio > 1.5) return 'unreliable';
    if (stats.cv > 0.8) return 'low';
    if (stats.activeDays < 14 || stats.cv > 0.5) return 'low';
    if (stats.activeDays >= 30 && stats.cv < 0.3) return 'high';
    return 'medium';
}
```

| 등급 | UI 동작 |
|------|---------|
| unreliable | 단일 날짜 X, "예측 불가" 표시 |
| low | 범위만 (5월 ~ 7월) |
| medium | P85 1개 + 신뢰 구간 |
| high | P50/P85/P95 모두 + 분포 차트 |

→ **낮은 신뢰도일 때 단일 날짜 표시는 가장 큰 거짓말**. 의도적 정보 숨김이 정직.

---

## 4. 담당자별 처리량 분석

### 4.1 핵심 통찰: 가정에 따라 ETA가 완전히 달라진다

같은 데이터로도 가정이 바뀌면:
```
시나리오 ① 완전 풀(누구나 누구 일이든)  → 11일
시나리오 ② 완전 고정(각자 자기 일만)    → 23일 (max 개인 ETA)
시나리오 ③ 부분 재할당                  → 11~23일 사이
```

**현실은 ② 또는 ③** — 단순히 ① (팀 합계)만 보면 30~50% 낙관 편향.

### 4.2 권장: 3가지 시나리오 동시 표시
```
ETA 예측 시나리오
┌────────────────────────────────────────────────────┐
│ 낙관 (자유 재할당)    : 6/02 (P85)  ⚠ 비현실적    │
│ 기준 (현재 할당 유지) : 6/27 (P85)  ◀ 권장 약속  │
│ 병목 (최대 ETA)       : 7/15 (P85)  ⛔ 위험 신호 │
└────────────────────────────────────────────────────┘
병목 인원: 김XX (9건 잔여, 0.4건/일) → ETA 23영업일
```

### 4.3 개인별 Monte Carlo
각 담당자에 대해 독립 시뮬레이션. 활동 일수 14일 미만은 confidence='low' 또는 'unreliable'.

### 4.4 미할당 이슈 처리

| 옵션 | 동작 | 권장 |
|------|------|------|
| A | 별도 카운트, ETA = ∞ | - |
| **B** | 팀 평균 속도로 가상 분배 + 경고 | **★ 권장** |
| C | 추세 기반 자동 할당 시뮬레이션 | Tier 3 |

### 4.5 워크로드 4분위 (병목 식별)

```
                 잔여 건수
                    │
       과부하       │      집중 필요
       ●김XX       │      ●이YY
     ●박ZZ        │
       ────────────┼──────────────
       여유        │      고속
       ●최AA      │      ●정BB
       ────────────┼──────────────► 일평균 처리량
                  0
```

recharts ScatterChart로 구현. 클릭 → 인원 이슈 목록.

### 4.6 한국 사내 환경 가드레일

| 위험 | 완화 |
|------|------|
| 개인 성과 비교 오용 | "워크로드 균형" 명명, "성과 평가 아님" 명시 |
| Ranking으로 기울어진 평가 | 정렬 default = 가나다순 |
| 휴가/병가 미반영 | "최근 활동 일수" 함께 표시, 7일 미만은 회색 처리 |
| 도메인 specialization 무시 | 해석 노트 ("백엔드/프론트엔드 분담 미반영") |
| 자동 알림 압박 | **알림 기능 만들지 말 것** (조회 전용) |
| 외부 공유 시 노출 | 익명화 모드 (Tier 3, 이름 → 닉네임) |

### 4.7 권장 표 형식
```
┌──────┬──────┬──────┬──────┬──────┬──────────┬──────┐
│담당자│잔여 │보류 │최근 │일평균│ ETA(P85)│신뢰도│
│      │     │     │14일 │처리량│          │      │
│      │     │     │활동 │      │          │      │
├──────┼──────┼──────┼──────┼──────┼──────────┼──────┤
│김XX │ 9   │ 1   │ 12일│ 0.4 │ 7/15    │ ●●● │
│이YY │ 6   │ 0   │ 11일│ 0.8 │ 6/02    │ ●●○ │
│박ZZ │ 7   │ 2   │ 8일 │ 0.6 │ 6/15    │ ●○○ │
│미배정│ 8  │  -  │  -  │  -  │ 가상    │  -   │
└──────┴──────┴──────┴──────┴──────┴──────────┴──────┘
```

---

## 5. 백로그 공수 예측

### 5.1 "공수"의 정의
- ETA = 시간(달력)
- 공수 = 노력의 양 (인일/인시)
- 100 인일 + 5명 → 이론상 20일. 실제는 더 길어짐.

### 5.2 4가지 데이터 소스

| 방법 | 데이터 | 정확도 | 적용 조건 |
|------|--------|--------|----------|
| A. Cycle Time | 과거 lead time | 낮~중 | 항상 가능 |
| B. Story Point | `customfield_10016` | 중 | SP 커버리지 >70% |
| C. Worklog | `timespent` | 높음 | timespent 기록 >30% |
| D. 난이도 | `customfield_10017` | 중 | 난이도 입력 일관 |
| **E. 하이브리드** | A+B+C+D 조합 | **최고** | 데이터 풍부 시 |

### 5.3 하이브리드 전략 (권장)

```typescript
function predictIssueEffort(issue, historicalStats): EffortPrediction {
    // 우선순위: worklog > SP > 난이도 > type 평균
    if (issue.fields.timespent > 0)
        return { hours: timespent/3600, source: 'worklog', confidence: 'high' };
    if (issue.fields.customfield_10016 && historicalStats.spCoverage >= 0.7)
        return { hours: SP × hoursPerSP, source: 'sp', confidence: 'medium' };
    if (난이도 in historicalStats.byDifficulty)
        return { hours: avgByDifficulty, source: 'difficulty', confidence: 'medium' };
    return { hours: typeAvg, source: 'type-avg', confidence: 'low' };
}
```

### 5.4 출력 — 신뢰 구간 필수
```
백로그 공수: 240~380 인시 (P50: 310 인시 = 약 39 인일)
구성:
  - worklog 기반: 12건 (high)   → 95 인시
  - SP 기반:     8건 (medium) → 60 인시
  - 난이도 기반: 18건 (medium) → 145 인시
  - 평균 추정:   9건 (low)     → 30~80 인시 (큰 변동)
```

### 5.5 이슈별 공수 표 (백로그 그루밍 용)

```
┌──────────┬─────────────────────┬────────┬──────────┬──────┐
│ 키       │ 제목                │ 난이도 │ 예측 공수│ 출처 │
├──────────┼─────────────────────┼────────┼──────────┼──────┤
│ IGMU-243 │ 결제 시스템 리팩터  │ 상     │ 32 인시  │ SP   │
│ IGMU-289 │ 인증 미들웨어 통합  │ 상     │ 28 인시  │ 난이도│
│ IGMU-301 │ 알림 큐 도입        │ 중     │ 14 인시  │ 난이도│
└──────────┴─────────────────────┴────────┴──────────┴──────┘
정렬: 공수 내림차순 / 클릭 → IssueDetailDrawer
```

→ 백로그 그루밍 미팅에서 "큰 작업 3개가 전체의 40%" 즉시 보임.

---

## 6. 모델 간 상호 검증 (ETA ↔ 공수)

### 6.1 자동 점검
```
expected_eta = total_effort / (team_size × 8h × utilization)
utilization = 0.6~0.7 (실효 가동률)
```

### 6.2 차이 해석

| ETA 격차 | 의미 | 액션 |
|----------|------|------|
| 공수 ETA < MC ETA × 0.5 | 처리량 << 공수 | 블로커·대기 시간 큼 → 프로세스 점검 |
| 격차 < 30% | 두 모델 일치 | 신뢰 ↑ |
| 공수 ETA > MC ETA | 거의 없음 | 있다면 worklog 미기록 의심 |

→ 화면에 **불일치 시 노란 경고**. 격차를 "프로세스 비효율도"로 해석.

---

## 7. 데이터 무결성 및 캐싱 ★보완

### 7.1 Atlassian API rate limit
- Atlassian Cloud: 호출당 cost 산정, 초당 평균 ~10 req
- 본 기능은 다음을 호출:
  - `/api/search/jql` (1회 ~ N회 변형)
  - `/api/field`
  - `/api/issue/{key}/changelog` (per-item, **위험**)
- **위험 지점**: changelog를 배치로 200 이슈 조회 시 200 req 발생 → rate limit 위반 가능
- **완화**:
  - changelog는 **선택형** (Tier 3에서만)
  - 또는 staleTime 1시간 이상으로 캐시
  - 또는 sampling (랜덤 50개만)

### 7.2 캐싱 전략 권장

| Query Key | staleTime | 이유 |
|-----------|-----------|------|
| `['project-issues', PK]` | 5분 | 백로그 변경 빈도 |
| `['daily-throughput', PK, days]` | 30분 | 과거 데이터, 거의 불변 |
| `['monte-carlo', issueCount, throughputHash]` | 무한 | 순수 함수 결과 |
| `['per-assignee-history', PK]` | 30분 | 변동 적음 |
| `['effort-stats', PK]` | 1시간 | cycle time 평균 |

캐시 키 디자인 시 **`throughputHash`** 같은 deterministic key 도입 → 메모이제이션 효과 극대화.

### 7.3 Defensive parsing

```typescript
function safeParseDate(value: unknown): Date | null {
    if (!value) return null;
    if (typeof value !== 'string') return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}
function safeNumber(value: unknown, fallback = 0): number {
    if (typeof value !== 'number' || isNaN(value)) return fallback;
    return value;
}
```

모든 Jira 응답 처리에서 이 패턴 강제. 잘못된 데이터로 차트가 깨지는 것 방지.

### 7.4 백로그 실시간성
- React Query `refetchOnWindowFocus: false` (현재 설정)
- 사용자가 수동 새로고침 또는 [refresh] 클릭 시만
- Webhook 등 push 모델은 부록 9.3 참고

---

## 8. 성능·확장성 ★보완

### 8.1 데이터 규모별 부담

| 이슈 수 | Monte Carlo | 차트 렌더 | 메모리 |
|---------|-------------|-----------|--------|
| < 100 | < 10ms | 즉시 | 무시 |
| 100~500 | 30~60ms | 100ms | < 5MB |
| 500~2000 | 100~300ms | 500ms | 10~20MB |
| **> 2000** | **500ms+** | **1초+** | **50MB+** |

### 8.2 권장 임계값
- 잔여 < 500 이슈: 메인 스레드, 즉시 표시
- 500~2000: useDeferredValue로 입력 응답성 보장
- **> 2000: Web Worker 분리 필수**

### 8.3 Web Worker 패턴

```typescript
// src/workers/forecast.worker.ts
self.onmessage = (e) => {
    const { remaining, throughput, trials } = e.data;
    const result = monteCarloForecast(remaining, throughput, { trials });
    self.postMessage(result);
};

// 사용처
const worker = useMemo(() => new Worker(new URL('./forecast.worker', import.meta.url), { type: 'module' }), []);
```

Vite는 `?worker` import 패턴 지원 — 빌드 통합 쉬움.

### 8.4 차트 성능
- recharts는 **데이터 포인트 200+에서 reflow 느려짐**
- 30일 일별 데이터는 30 포인트 → 안전
- 누적 흐름도(CFD)를 90일로 확장 시 데이터 down-sampling 필요

### 8.5 메모리 누수 방지
- TanStack Query gc time (default 5분) 신뢰
- 대규모 history 배열은 useRef로 보관, state 화 X
- Web Worker는 unmount 시 `worker.terminate()`

---

## 9. 접근성·국제화 ★보완

### 9.1 차트 a11y

| 요구 | 구현 |
|------|------|
| 색 + 패턴 | recharts `Bar` `pattern` prop, 또는 hatching SVG |
| ARIA label | `<svg role="img" aria-label="일별 완료 추이, 최근 30일">` |
| 키보드 네비 | 포커스 가능한 데이터 포인트 (recharts는 미흡 → 표 대안 제공) |
| 색약 친화 | Okabe-Ito 팔레트 (8색 색약 안전) |
| 텍스트 대안 | 차트 옆에 "주요 수치 요약" 텍스트 |

### 9.2 한국어/영어 혼용
- UI 한국어 통일 (현재와 동일)
- 산식 표기는 영어 코드 + 한국어 설명
- 차트 X축 날짜 포맷: `M.dd` (한국식)
- 숫자 천 단위 구분: ko-KR `Intl.NumberFormat`

### 9.3 키보드 네비
- 카드: `tabindex` + Enter 활성화
- 표: 화살표 키 행 이동
- 다이얼로그 탭: ←→ 키 전환

### 9.4 색약 대응 팔레트
```
완료 (녹) → blue-600  (#2563eb)
지연 (적) → orange-600 (#ea580c) — 적색 대신
보류    → slate-400
완료지연 → 빗금 패턴 + 색
```

---

## 10. 보안·개인정보 ★보완

### 10.1 데이터 노출 수준

| 데이터 | 현재 노출 | 권장 |
|--------|----------|------|
| 개인 일별 처리량 | (신규) | 동일 PC 사용자만 (현재 권한 모델 유지) |
| 개인 ETA | (신규) | 동일 PC 사용자만 |
| 개인 잔여 작업 | 이미 노출 (Jira 자체) | 변화 없음 |
| 워크로그 시간 | 이미 노출 | 변화 없음 |

→ Jira에서 이미 보이는 데이터를 시각화하는 것이므로 추가 누출 없음. 단 **시각화 자체가 압박감을 줄 수 있음**.

### 10.2 익명화 모드 (Tier 3)
```
설정: [개인 식별 모드] / [익명 모드]
익명 모드:
  - 이름 → "개발자 A/B/C..."
  - 본인은 자신만 볼 수 있음 (식별)
  - 관리자(role check) 시 식별 모드 가능
```

→ 본 앱은 단일 사용자 데스크톱이라 role check 어려움. 단순 토글 + "스크린샷 시 익명 모드 권장" 안내.

### 10.3 토큰 노출
- 기존 처리 그대로 (jira-proxy-config.json + admin endpoint)
- 변경 없음

### 10.4 로그 마스킹
- proxy.log에 토큰·이메일 평문 기록 안 함 (현재 OK)
- 토스트/콘솔에 인증 응답 본문 노출 안 함 (jiraClient.ts 인터셉터 검토 완료)

### 10.5 외부 공유 시
- 스크린샷에 개인명 노출 우려 → 익명 모드 권장 안내
- export 기능 (PDF/Excel)은 부록 9.2 참고

---

## 11. 도메인 룰 ★보완

### 11.1 휴가/병가 정보
- 현재 시스템에 없음
- 영향: 비활성 인원이 "낮은 처리량"으로 오해
- **완화**: "최근 활동 일수" 함께 표시. 7일 미만은 회색 처리. 사용자가 휴가임을 추측 가능

### 11.2 스프린트 vs 칸반
- 본 프로젝트는 sprint 정보 미수집 (보드 API 호출 없음)
- 스프린트 종료일 → 자연스러운 ETA 기준점 가능 (Tier 3에서 검토)
- 현재는 이슈의 duedate / created만 사용 (sprint-agnostic)

### 11.3 Epic 계층 vs flat backlog
- 현재: 사이드바에서 epic 선택 → 그 안의 leaf만
- 신규: "전체 프로젝트" 토글 → epic 무관 모든 leaf
- 두 관점은 다른 질문에 답함 (미시 vs 거시)

### 11.4 다중 프로젝트
- 본 앱은 단일 `JIRA_CONFIG.DASHBOARD.PROJECT_KEY` 가정 (`IGMU`)
- 한 사람이 여러 프로젝트에 걸쳐 작업하면 처리량 분리됨 (실제보다 낮게 추정)
- 완화: Tier 3에서 "프로젝트 다중 선택" + 사용자 별 cross-project velocity

### 11.5 한국 공휴일

| 수준 | 구현 | 정확도 |
|------|------|--------|
| L0 | 모든 날짜 동일 | 한국 공휴일 무시 → 6일 길게 추정 |
| L1 | 주말 제외 (`isWeekend`) | ✅ 권장 기본 |
| L2 | + 한국 공휴일 (수동) | 매년 업데이트 |
| L3 | `date-holidays` 라이브러리 | 자동, 의존성 추가 |

→ **L1 + JIRA_CONFIG.KOREAN_HOLIDAYS_2026 배열로 L2 부분 적용**

### 11.6 합의지연 라벨
- 기존 `agreed-delay`, `verification-delay` 룰 그대로 유지
- 백로그 정의에서는 라벨 무관 — 합의지연이라도 백로그에 있음
- 단 KPI 점수 산식에서는 차감 (기존 동작 유지)

---

## 12. UX 디테일 ★보완

### 12.1 빈 상태 (zero data)

| 상태 | UI |
|------|----|
| 백로그 0건 | "🎉 백로그가 비어 있습니다" + 완료 통계만 |
| 활동 일수 < 7일 | "예측 데이터 부족 (활동 N일). 14일 이후 다시 시도하세요." |
| Scope 발산 | "⛔ 백로그가 빠르게 증가 중. 신규 유입을 줄이거나 인력 보강이 필요합니다." |
| 모든 인원 unreliable | 팀 ETA만, 개인별 표는 "데이터 부족" 안내 |

### 12.2 로딩 상태
- 첫 로딩: 카드별 skeleton (회색 박스)
- 차트: recharts가 데이터 0이면 자동 빈 차트 → 명시적 로딩 표시
- Monte Carlo: < 100ms이면 표시 안 함, 그 이상이면 spinner

### 12.3 에러 상태
- 401/403: "Jira 인증 필요" + 설정 버튼 (기존 패턴 재사용)
- 네트워크: 토스트 + 마지막 캐시 데이터 표시 + "오프라인 데이터" 라벨
- 데이터 손상: defensive parsing으로 부분만 표시 + 경고

### 12.4 첫 사용자 온보딩
- 신규 탭 첫 클릭 시 "이 차트는 무엇인가요?" 툴팁 자동 표시 (한 번만)
- "방법론 보기" 링크 → 모달로 산식 설명

### 12.5 변경 알림
- ETA가 지난 측정 대비 ±20% 변경되면 카드에 ▲▼ 배지
- "지난주 대비 +5일 후퇴" 등 비교 정보 (단 알림 없음, 조회 시만)

### 12.6 인터랙션 패턴
- 모든 차트: hover → 툴팁
- 카드 클릭 → 상세 패널 펼침
- 표 헤더 클릭 → 정렬 (가나다 default)
- 행 클릭 → 해당 인원 이슈 목록 필터링

---

## 13. 테스트 전략 ★보완

### 13.1 단위 테스트 (vitest)

| 영역 | 케이스 수 |
|------|----------|
| Monte Carlo | 6 (빈/제로/균일/변동/scope발산/sample size) |
| 신뢰도 등급 | 5 (각 등급 경계) |
| 담당자별 | 6 (단일/균등/미할당/specialization/소수 활동) |
| 공수 추정 | 8 (각 데이터 소스 + 하이브리드) |
| 상호 검증 | 4 (일치/큰 격차/공수 누락/ETA 발산) |
| 시간대 처리 | 4 (자정/주경계/공휴일/dst) |
| **합계** | **33** |

### 13.2 컴포넌트 테스트 (Tier 2~3 선택)
- React Testing Library
- 핵심 카드 렌더링
- 인터랙션 (정렬, 필터)
- 차트는 snapshot (시각적 회귀는 별도)

### 13.3 시각적 회귀 (선택 — Tier 3)
- Playwright 또는 Storybook + Chromatic
- 차트 깨짐 감지

### 13.4 부하 테스트 (Tier 3)
- 가짜 5000 이슈 데이터로 렌더링 시간 측정
- Web Worker 임계값 확정

### 13.5 사용성 테스트
- 실제 팀 1~2명에게 시연
- 정직성·이해도 측정
- "단일 ETA 대신 P85 표시"에 대한 반응 수집

---

## 14. 마이그레이션·롤백 ★보완

### 14.1 기존 사용자 영향
- 신규 탭 추가만 → 기존 화면 영향 0
- 기존 KPI 산식 변경 안 함

### 14.2 Feature flag
- 환경변수 또는 `JIRA_CONFIG.FEATURES.PREDICTION = true/false`
- false면 신규 탭 숨김
- 점진적 출시·긴급 비활성화 가능

### 14.3 롤백
- 신규 탭만 비활성화 → 기존 동작 100% 복원
- DB/스키마 변경 없음 (모두 클라이언트 계산)

### 14.4 데이터 호환성
- localStorage 신규 키: `prediction-settings` (사용자 선호)
- 키 누락/손상 시 default로 graceful fallback

---

## 15. 운영·관측성 ★보완

### 15.1 예측 정확도 추적 (Tier 3)
```typescript
// localStorage 또는 IndexedDB
{
  recordedAt: '2026-04-15',
  predictedP85: '2026-06-12',
  actualCompletion: null,  // 완료 시 채움
  remainingAtTime: 47,
  velocityAtTime: 1.4,
}
```
완료 시점에 비교 → MAE 산출 → "지난 5회 예측 평균 ±N일 오차" 표시

### 15.2 사용 텔레메트리 (선택)
- 어느 카드가 가장 많이 클릭되는지
- 어느 차트가 표시되는지
- → 다음 iteration 우선순위 결정
- **단 외부 전송 X** (사내 데스크톱 가정)

### 15.3 에러 모니터링
- 현재 토스트 + 콘솔
- Sentry 등 도입은 별도 결정 (현재 미설정)

### 15.4 사용자 피드백
- 다이얼로그 푸터에 "👍 도움됐어요 / 👎 부정확해요" 옵션
- 클릭 → localStorage 누적 → 후속 분석

---

## 16. 문서·교육 ★보완

### 16.1 사용자 가이드
- README 또는 별도 `docs/user-guide-prediction.md`
- 스크린샷 + "이 화면이 답하는 질문" 섹션
- "왜 단일 날짜가 아니라 P85인가" 설명

### 16.2 산식 투명성
- 다이얼로그 내 [방법론] 버튼
- 클릭 → 모달로 Monte Carlo 알고리즘 설명
- 코드 링크 (`predictionService.ts`)

### 16.3 FAQ
- "왜 ETA가 매주 후퇴하나?" → scope creep
- "왜 동료 ETA를 못 보나?" → 익명화 모드
- "예측 완료일이 비현실적인데?" → CV 높음, 신뢰도 보기
- "공수와 ETA가 다른데?" → 6장 상호 검증

### 16.4 개발자 문서
- `predictionService.ts` JSDoc
- 단위 테스트가 의도 박제

---

## 17. 위험 매트릭스 종합

| # | 위험 | 가능성 | 영향 | 완화 | 책임 |
|---|------|--------|------|------|------|
| 1 | 단일 ETA로 잘못된 약속 | 중 | 큼 | P85 + 신뢰도 + 가정 명시 | UX |
| 2 | Scope 발산 미감지 | 중 | 큼 | scope creep 경고 강조 | 모델 |
| 3 | 개인 성과 평가로 오용 | 중 | 사회적 큼 | "균형 분석" 명명, 익명 모드 | 정책 |
| 4 | 휴가 미반영 부당 평가 | 중 | 사회적 큼 | 활동일 표시, 비활성 회색 | UI |
| 5 | API rate limit | 낮 | 중 | staleTime 설정, changelog 선택형 | 성능 |
| 6 | 1000+ 이슈 시 freeze | 낮 | 중 | Web Worker 임계값 | 성능 |
| 7 | SP/worklog 커버리지 부족 | 높 | 중 | hybrid + 자동 fallback | 모델 |
| 8 | 차트 a11y 미흡 | 중 | 작 | 패턴 + ARIA + 표 대안 | UX |
| 9 | 공수 = 비용 환산 오용 | 중 | 큼 | "추정 범위" 명시, 단일 숫자 X | 정책 |
| 10 | 신규 인력 램프업 미반영 | 높 | 중 | 30일 미만 confidence=low | 모델 |
| 11 | 한국 공휴일 미반영 | 중 | 작 | L2 수동 정의 | 도메인 |
| 12 | 알림 자동화로 압박 | 낮 | 큼 | **알림 기능 만들지 말 것** | 정책 |
| 13 | 백로그 모델 변경 (Sprint 도입) | 낮 | 중 | epic-agnostic 설계로 호환 | 아키 |
| 14 | 외부 공유 시 개인 노출 | 중 | 사회적 중 | 익명 모드 + 안내 | UX |
| 15 | Jira 필드 ID 변경 | 낮 | 중 | name 기반 자동 매칭 (현재 패턴) | 데이터 |

---

## 18. 산업 표준 참고

| 자료 | 활용 영역 |
|------|----------|
| Daniel Vacanti — *When Will It Be Done?* | Monte Carlo, 백분위 약속 |
| Daniel Vacanti — *Actionable Agile Metrics* | Cycle time, CFD |
| Troy Magennis — Forecaster (오픈소스) | Monte Carlo 구현 참고 |
| Don Reinertsen — *Principles of Product Development Flow* | WIP, Little's Law |
| #NoEstimates 운동 | 카운트 기반 예측 |
| Atlassian Forecast (Jira Marketplace) | UX 패턴 참고 |
| Okabe-Ito 색약 팔레트 | 차트 색상 |
| WCAG 2.2 | 접근성 기준 |

---

## 19. 부록 — 외부 통합 가능성

### 19.1 Slack/이메일 알림
- 본 작업 범위 X (12번 위험 참고)
- 별도 PR로 검토 가능

### 19.2 Export (PDF/Excel)
- recharts → SVG → PDF 변환 가능
- 표 → CSV 다운로드 가능
- Tier 3 이후 별도 검토

### 19.3 Jira webhook
- 실시간 갱신 가능하나 인프라 복잡 (수신 서버 필요)
- 본 앱은 dev 서버 + Electron이라 불가
- 폴링(staleTime) 모델로 충분

### 19.4 PR/CI 연동
- GitHub/GitLab API로 PR merge 시점 → 실제 cycle time 측정 가능
- Tier 3+ 검토 — 다중 시스템 통합 부담 큼

---

## 20. 데이터 모델 / 서비스 구조

### 20.1 신규 서비스
```
src/services/prediction/
├── types.ts                       — 타입 정의
├── monteCarloForecast.ts          — Monte Carlo (Tier 1)
├── perAssigneeForecast.ts         — 담당자별 (Tier 2)
├── effortEstimation.ts            — 4가지 방법 + hybrid (Tier 2)
├── crossValidation.ts             — ETA ↔ 공수 (Tier 2)
├── confidence.ts                  — 등급 산정
├── scopeAnalysis.ts               — Scope creep
└── index.ts                       — 전략 패턴 export
```

### 20.2 신규 hook
```
src/hooks/
├── useProjectIssues.ts            — 전체 프로젝트 fetch
├── useBacklogForecast.ts          — Forecast 통합
├── useEffortReport.ts             — 공수 분석
└── useWorkloadBalance.ts          — 4분위 데이터
```

### 20.3 신규 컴포넌트
```
src/components/progress-trends/
├── index.tsx                      — 진입점 (Tier 1)
├── BacklogStateCards.tsx          — 6 상태 카드 (Tier 1)
├── TodayWeekCards.tsx             — 오늘/이번주 (Tier 1)
├── DelayCards.tsx                 — 지연 분류 (Tier 1)
├── DailyCompletionChart.tsx       — 일별 추이 (Tier 1)
├── EtaScenarioCard.tsx            — 3 시나리오 (Tier 2)
├── ForecastFunnelChart.tsx        — 확률 깔때기 (Tier 2)
├── PerAssigneeTable.tsx           — 담당자별 표 (Tier 2)
├── EffortReportCard.tsx           — 공수 분석 (Tier 2)
├── EtaEffortConsistency.tsx       — 상호 검증 (Tier 2)
├── WorkloadScatter.tsx            — 4분위 (Tier 3)
├── PerIssueEffortTable.tsx        — 이슈별 공수 (Tier 3)
└── MethodologyDialog.tsx          — 방법론 설명
```

### 20.4 타입 핵심
```typescript
export interface ForecastResult {
    p50Days: number;
    p85Days: number;
    p95Days: number;
    p50Date: Date;
    p85Date: Date;
    p95Date: Date;
    confidence: 'high' | 'medium' | 'low' | 'unreliable';
    warnings: string[];
}

export interface PerAssigneeForecast {
    accountId: string;
    displayName: string;
    remaining: number;
    onHold: number;
    activeDays: number;
    avgDailyThroughput: number;
    forecast: ForecastResult | null;
    quadrant: 'overload' | 'focus' | 'capacity' | 'fast';
}

export interface TeamForecast {
    optimistic: ForecastResult;       // 풀 가정
    realistic: ForecastResult;        // 현재 할당 유지
    bottleneck: PerAssigneeForecast;  // max ETA 인원
    perAssignee: PerAssigneeForecast[];
    unassignedCount: number;
    scopeCreepRatio: number;
}

export interface IssueEffortPrediction {
    issueKey: string;
    summary: string;
    hours: number;
    hoursLow: number;
    hoursHigh: number;
    source: 'worklog' | 'sp' | 'difficulty' | 'type-avg';
    confidence: 'high' | 'medium' | 'low';
}

export interface BacklogEffortReport {
    totalHoursMid: number;
    totalHoursLow: number;
    totalHoursHigh: number;
    totalManDaysMid: number;
    sourceMix: { source: string; count: number; hours: number }[];
    perIssue: IssueEffortPrediction[];
    teamCapacityAssumption: { headcount: number; utilization: number; teamDaysMid: number };
    consistencyWithEta: { teamEtaDays: number; effortEtaDays: number; gapPct: number; warning?: string };
}
```

---

## 21. 사용자 환경 사전 측정 (구현 전 권장)

```bash
# 1. 활동일 분포
curl -s -X POST http://127.0.0.1:3001/api/search/jql \
  -H "Content-Type: application/json" \
  -d '{"jql":"project = IGMU AND resolved >= -90d", "fields":["resolutiondate"], "maxResults":500}' \
  | jq '[.issues[].fields.resolutiondate[:10]] | group_by(.) | map({date:.[0], count:length})'

# 2. SP 커버리지
curl -s -X POST http://127.0.0.1:3001/api/search/jql -H "Content-Type: application/json" \
  -d '{"jql":"project = IGMU AND resolved >= -90d", "fields":["customfield_10016"], "maxResults":500}' \
  | jq '[.issues[].fields.customfield_10016] | (map(select(. != null and . > 0)) | length) as $w | (length) as $t | {with_sp: $w, total: $t, coverage_pct: ($w * 100 / $t)}'

# 3. Worklog 커버리지
curl -s -X POST http://127.0.0.1:3001/api/search/jql -H "Content-Type: application/json" \
  -d '{"jql":"project = IGMU AND resolved >= -90d", "fields":["timespent"], "maxResults":500}' \
  | jq '[.issues[].fields.timespent] | (map(select(. != null and . > 0)) | length) as $w | (length) as $t | {with_worklog: $w, total: $t, coverage_pct: ($w * 100 / $t)}'

# 4. 난이도 커버리지
curl -s -X POST http://127.0.0.1:3001/api/search/jql -H "Content-Type: application/json" \
  -d '{"jql":"project = IGMU AND resolved >= -90d", "fields":["customfield_10017"], "maxResults":500}' \
  | jq '[.issues[].fields.customfield_10017] | (map(select(. != null)) | length) as $w | (length) as $t | {with_difficulty: $w, total: $t, coverage_pct: ($w * 100 / $t)}'

# 5. 활성 백로그 담당자 분포
curl -s -X POST http://127.0.0.1:3001/api/search/jql -H "Content-Type: application/json" \
  -d '{"jql":"project = IGMU AND statusCategory != Done", "fields":["assignee"], "maxResults":500}' \
  | jq '[.issues[].fields.assignee.displayName // "미배정"] | group_by(.) | map({person:.[0], count:length}) | sort_by(-.count)'

# 6. 미할당 비율
curl -s -X POST http://127.0.0.1:3001/api/search/jql -H "Content-Type: application/json" \
  -d '{"jql":"project = IGMU AND statusCategory != Done AND assignee is EMPTY"}' \
  | jq '.total'
```

이 6개 측정값에 따른 모델 적합도:

| 조건 | 결정 |
|------|------|
| 활동일 < 14일 | Tier 1만 (예측 비활성) |
| SP 커버리지 < 70% | hybrid에서 SP 모드 비활성 |
| Worklog 커버리지 < 30% | hybrid에서 worklog 모드 비활성 |
| 활동 인원 < 3명 | "낙관" 시나리오 비활성 |
| 미할당 > 30% | "미할당 우선" 경고 강조 |

---

## 22. 결정 필요 항목 (구현 시작 전)

| # | 결정 | 권장 |
|---|------|------|
| 1 | 데이터 범위 | 전체 프로젝트 + 토글 |
| 2 | "이번주" 시작 요일 | 월요일 |
| 3 | 표시 단위 | 건수 (SP는 hover) |
| 4 | 영업일/공휴일 | 주말 + 한국 공휴일 수동 |
| 5 | 예측 모델 | Monte Carlo + 14일 평균 + ±1σ |
| 6 | 차트 라이브러리 | recharts (이미 설치) + 작은 도넛만 SVG |
| 7 | 개인 식별 기본값 | 실명 (사내 환경) / 옵션 익명 |
| 8 | 미할당 처리 | 별도 카운트 + 가상 분배 |
| 9 | 공수 단위 | 인시(hours) 우선, 인일 환산 함께 |
| 10 | 가동률 가정 | 65% (변경 가능 슬라이더) |
| 11 | ETA-공수 불일치 임계 | 30% 차이 시 경고 |

---

## 23. 최종 권장 — Tier 2 (4일 공수)

- Monte Carlo 기반 3 시나리오 ETA
- 담당자별 처리량 표
- 하이브리드 공수 추정
- ETA-공수 상호 검증
- Forecast funnel chart
- Scope creep 보정

**Tier 1 (1.5일)**: 카드만, 예측 X
**Tier 2 (4일)**: 권장 ★
**Tier 3 (7일)**: + 워크로드 4분위 + 이슈별 공수 + 익명화 + 정확도 추적

세부 실행 계획은 [`progress-prediction-workplan.md`](./progress-prediction-workplan.md) 참고.

---

**문서 끝.**
