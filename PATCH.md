# 패치 내역 (Jira Dashboard)

설치/배포 시 포함된 기능 변경 및 수정 사항입니다.

---

## [1.0.11] Hotfix — 설치 빌드에서 `jira-proxy-handler.cjs` 누락 수정

### 적용 버전
- 앱 버전: **1.0.11** (package.json 기준)
- 패치 반영일: 2026년 4월

### 문제
NSIS 설치 후 실행 시 다음 에러로 앱이 기동되지 않음:
```
A JavaScript error occurred in the main process
Uncaught Exception:
Error: Cannot find module './jira-proxy-handler.cjs'
Require stack:
- C:\Program Files\Jira Dashboard\resources\app.asar\dist-electron\main.js
```

### 원인
`electron/main.ts` 가 `createRequire('./jira-proxy-handler.cjs')` 로 CommonJS 헬퍼를 **동적 require** 함. Vite 번들러는 이 동적 require를 정적 분석하지 못해 `.cjs` 파일을 `dist-electron/` 으로 자동 복사하지 않음. `electron-builder` 의 `files: ["dist-electron/**/*"]` 규칙에 따라 asar 패키지에 아예 포함되지 않아 설치 버전에서 즉시 크래시.

### 수정
`vite.config.ts` 에 `copyElectronCjsAssets` 빌드 플러그인 추가:
- main 빌드의 `closeBundle` 훅에서 `electron/jira-proxy-handler.cjs` 를 `dist-electron/` 로 명시 복사
- dev watch + prod build 양쪽 모두 동작 (electron이 실제 로드하는 위치)
- electron-builder가 자동으로 asar에 포함 → 설치 버전에서도 정상 로드

### 검증
- 로컬 빌드 후 `dist-electron/` 에 `jira-proxy-handler.cjs` 정상 복사됨
- `vitest 251/251`, `tsc`, `lint` 모두 통과
- 이전 `npm run start`, `dev` 모드에서도 동일 로그 경고가 사라짐

### 빌드
```bash
npm run build          # 1.0.11 .exe + portable 재생성
```

---

## [1.0.10] KPI Store 완전 통합 — statusNames·projectKey·weekStartsOn·prediction·fields

### 적용 버전
- 앱 버전: **1.0.10** (package.json 기준)
- 패치 반영일: 2026년 4월
- 기반: `docs/kpi-store-integration-v1.0.10-plan.md` (감사 보고서 §5.1의 v1.0.9 미처리 잔여)

### 배경
v1.0.9에서 K1으로 `labels` / `fields.actualDone` / `grades` / `weights` / `earlyBonus`를 store 우선 참조로 교체했지만, 감사 보고서 §5.1이 지적한 나머지 5개 필드 군은 여전히 `JIRA_CONFIG` 직접 참조 상태였습니다. 이번 패치는 v1.0.9의 패턴을 공통 헬퍼로 승격하고 남은 필드를 일괄 통합합니다.

### 신규 공통 헬퍼

#### `src/lib/kpi-rules-resolver.ts`
- `getActiveRules()` — store 우선 + null fallback
- 개별 resolver: `resolveAgreedDelayLabel` / `resolveVerificationDelayLabel` / `resolveOnHoldStatus` / `resolveCancelledStatus` / `resolveDashboardProjectKey` / `resolveWeekStartsOn`
- 묶음 resolver: `resolvePredictionConfig()` (JIRA_CONFIG.PREDICTION shape 동일 — drop-in 교체 가능), `resolveFields()`
- v1.0.9 K1 재사용 헬퍼 통합: `resolveWeights` / `resolveGrades` / `resolveEarlyBonus`

#### `kpiService.ts` 리팩토링
- v1.0.9의 내부 `resolveKpiRules` + `FALLBACK_RULES` 제거
- 공통 resolver 조합만으로 동일 동작 유지 — 중복 제거

### Phase 1 — statusNames 통합 (5 지점)
- `useBacklogForecast.ts` — `onHold` 필터에 store 값 사용
- `project-stats-dialog.tsx` — `isOnHold` / `isCancelled`가 `kpiRules` 구독값 참조
- `perAssigneeForecast.ts` — 모듈 스코프 `const C = JIRA_CONFIG.PREDICTION` 제거 → 함수 진입 시 resolve
- `effortEstimation.ts` — cancelled status가 `resolveCancelledStatus()` 사용
- → store에서 `statusNames.onHold`를 `대기중`으로 변경 시 즉시 반영

### Phase 2 — dashboardProjectKey 통합
- `dashboard.tsx` — `useKpiRulesStore` 구독 → TanStack Query key 자동 재요청
- `progress-trends/index.tsx` — `useKpiRulesStore` 구독
- `useBacklogForecast.ts` — `options?.projectKey ?? resolveDashboardProjectKey()` 순서
- `api/jiraClient.ts` — API 레이어 (store 초기화 전 호출 가능) 이므로 `JIRA_CONFIG` fallback 유지

### Phase 3 — weekStartsOn 통합
- `date-utils.ts` — `startOfKoreanWeek` / `endOfKoreanWeek`가 `resolveWeekStartsOn()` 호출
- → store에서 `weekStartsOn: 0` 변경 시 "이번주 완료" 카운트가 일~토 기준으로 집계

### Phase 4 — prediction.* 모듈 스코프 해체
5개 파일의 `const C = JIRA_CONFIG.PREDICTION` 모듈 상수를 **함수 진입 시** `resolvePredictionConfig()`으로 대체:
- `confidence.ts` — confidenceLevel / buildConfidenceWarnings
- `crossValidation.ts` — crossValidate
- `effortEstimation.ts` — measureCoverage / aggregateBacklogEffort
- `perAssigneeForecast.ts` — buildForecast / perAssigneeForecast / teamForecast
- `scopeAnalysis.ts` — classifyScopeStatus

→ 설정에서 `monteCarloTrials: 5000` 변경 시 **다음 호출부터** 즉시 반영 (앱 재시작 불요).

### Phase 5 — 나머지 fields.* 통합
- `issue-detail-drawer.tsx` — `plannedStart` / `actualStart` / `actualDone` / `difficulty` 4필드 모두 store 구독
- `project-stats-dialog.tsx` — `storyPoint` / `difficulty` store 우선 참조
- `difficulty-mini-pie.tsx` — `DIFFICULTY` 필드 resolve
- `useBacklogForecast.ts` — dailySeries + counts에서 actualDoneField 변수화
- `effortEstimation.ts` — STORY_POINT / DIFFICULTY / ACTUAL_DONE 모두 store 참조

### 인프라
- **vitest 251건 통과** (v1.0.9 235 + 신규 resolver 16)
- `src/lib/__tests__/kpi-rules-resolver.test.ts` — 16 케이스 (default 일치 + store 변경 반영)
- TypeScript strict 통과, ESLint 에러 0

### 설정 변경 즉시 반영 필드 (v1.0.10)
v1.0.10 이후 PM이 KPI 관리 UI에서 변경 시 **앱 재시작 없이 즉시 반영**되는 필드:

| 필드 | v1.0.9 | v1.0.10 |
|------|--------|---------|
| `labels.*` | ✅ | ✅ |
| `fields.actualDone` | ✅ | ✅ |
| `grades` / `weights` / `earlyBonus` / `defectGrades` | ✅ | ✅ |
| `statusNames.onHold` / `cancelled` | ❌ | ✅ |
| `dashboardProjectKey` | ❌ | ✅ |
| `weekStartsOn` | ❌ | ✅ |
| `prediction.*` (6개 파라미터) | ❌ | ✅ |
| `fields.storyPoint` / `plannedStart` / `actualStart` / `difficulty` | ❌ | ✅ |

### 보호된 기존 기능 (변경 없음)
- `calculateKPI`의 KPI 산식 흐름
- Zustand persist 키 (`jira-dash-kpi-rules`)
- `JIRA_CONFIG` 자체 — fallback 유지 (삭제하지 않음)
- `api/jiraClient.ts` L298 — API 레이어는 `JIRA_CONFIG` 그대로 (store 초기화 전 호출 대비)
- 감사 보고서 §5.0 (지표 구조 유연성) — 별도 마일스톤 예약

### 빌드
```bash
npm run build          # 1.0.10 .exe + portable 생성
npm test               # vitest 251 케이스 통과
```

---

## [1.0.9] KPI 규칙 정합성 — Store 완전 연동 + 판정 기준 통일 + 검증 강화

### 적용 버전
- 앱 버전: **1.0.9** (package.json 기준)
- 패치 반영일: 2026년 4월
- 기반 분석: `docs/kpi-rules-fix-plan.md` (Cursor 분석 보고서 13건)

### 배경
v1.0.8의 Level 4 KPI 관리 UI는 편집은 가능했으나, **labels·fields·prediction 등 일부 규칙은 UI에서 변경해도 실제 계산에 반영되지 않는** 정합성 이슈가 있었습니다. 탭 간 준수율 산식 불일치, 에픽 회고의 on-time 판정이 ACTUAL_DONE 필드를 무시하는 문제도 확인됐습니다. 이 패치는 해당 13건을 4 Phase로 정리했습니다.

### Critical 수정 (Phase 1)

#### K1. kpiService Store 완전 연동
- `calculateKPI()`가 `JIRA_CONFIG.LABELS.AGREED_DELAY` 하드코딩 대신 `kpiRulesStore`의 `labels.agreedDelay` 참조
- `JIRA_CONFIG.FIELDS.ACTUAL_DONE`도 `rules.fields.actualDone`로 교체 → PM이 UI에서 custom field 변경 시 즉시 반영
- `resolveKpiRules()` 헬퍼로 fallback 보장 (store 초기화 전에도 안전)
- `getCompletionDate()` / `getCompletionDateStr()` 공통 헬퍼 export — 다른 서비스에서 재사용

#### K2. 프로젝트 현황 vs KPI 탭 준수율 통일
- 프로젝트 현황의 담당자별 준수율이 `compliant.length / total` (agreed-delay 미제외) → `calculateKPI(a.total).complianceRate` (agreed-delay 이중 제외)로 변경
- 동일 담당자의 준수율이 두 탭에서 **항상 일치**

#### K3. 에픽 회고 on-time 판정 통일
- `epicRetro.isOnTime()` / `cycleTimeDays()` / lastDoneTask가 `resolutiondate`만 쓰던 것을 `getCompletionDate()` 공통 헬퍼로 교체
- `onTimeRate`와 `kpiGrade`가 동일 날짜 소스 (ACTUAL_DONE 우선) 사용

#### K4. GradeCard 툴팁 동적화
- 4개 GradeCard의 하드코딩 `"S: 95% 이상"` 텍스트를 `kpiRules` 구독 기반 동적 생성으로 교체
- 신규 `src/lib/kpi-tooltip.ts` — `completionTooltip` / `complianceTooltip` / `earlyBonusTooltip` / `defectDensityTooltip` 헬퍼
- PM이 등급 기준을 변경하면 툴팁 설명도 즉시 반영

### Major 수정 (Phase 2)

#### K5. earlyRate 100% 상한
- `earlyRate = (kpiEarly / kpiTotal) * 100` → `Math.min(..., 100)` 적용
- 표시값이 논리적으로 100%를 초과하는 엣지 케이스 방지

#### K6. 기한 미설정 이슈 투명성
- `KPIMetrics.noDueDateCount` 필드 추가 — 기한 없이 "준수로 카운트된" 이슈 수
- 일정 준수율 카드 description + tooltip에 "기한 미설정 N건 준수 처리" 안내

#### K7. validateRuleSet 검증 범위 대폭 확장
- 기존 8건 → 신규 15건 검증 케이스
- defectGrades 범위(0~100), earlyBonus 빈 배열·중복 minRate·음수 bonus, weights 개별 음수, prediction 6개 파라미터 범위
- `importFromJson`이 에러 배열 반환 → 잘못된 규칙 import 거부 + toast

### Phase 3 — 정합성 & 타임존

#### K8. "미할당" / "미배정" 레이블 통일
- 신규 `src/lib/jira-constants.ts` — `UNASSIGNED_LABEL = '미배정'` 상수
- 6개 파일의 리터럴 → 상수 참조로 통일 (`'미할당'` 6곳 제거)
- `project-stats-dialog`의 `a.name === '미할당'` 특수 분기 로직 제거
- 결함 KPI 매핑의 brittle한 이름 fallback 해소

#### K10. 타임존 혼합 방어 헬퍼
- 신규 `endOfLocalDay()` / `startOfLocalDay()` in `date-utils.ts`
- `new Date(dueDateStr).setHours(23,59,59,999)` 패턴 3곳(kpiService, epicRetro, project-stats-dialog)에서 헬퍼로 통일
- 자정 근처 완료 이슈의 준수/지연 판정 안정성 확보

### Phase 4 — 관리 UI 완성

#### K12. Archive 복원 UI
- 신규 `src/components/kpi-rules/ArchiveList.tsx`
- 아카이브 20개 이하 목록 표시 + 복원 버튼
- 복원 시 **현재 규칙을 자동으로 "복원 전 백업" 아카이브에 보존**하여 사고 방지
- 복원 대상도 `validateRuleSet` 검사 → 잘못된 아카이브 복원 거부

#### K13. PredictionConfigEditor 즉시 범위 피드백
- 숫자 입력 시 min/max 범위 위반을 **즉시** 빨간 border + helper text로 표시
- 저장 시 전체 검증(K7)과 별개로 편집 중에도 잘못된 값 감지

#### K11. grades.total 반올림 정책 명시 (현행 유지)
- completion/compliance 등급은 unrounded float 기반, total은 rounded integer 기반 — 경계 케이스에서 정책 차이 발생 가능
- 코드 주석으로 **현행 정책·미래 변경 시 합의 필요** 명시. 실제 로직 변경은 PM 합의 전 미실행.

### 인프라
- **vitest 235건 통과** (기존 183 + 신규 52)
  - kpiService K1·K5·K6: 9건
  - epicRetro K3: 5건
  - kpi-tooltip K4: 8건
  - kpiRulesStore K7: 24건
  - date-utils K10: 4건
  - getCompletionDate: 3건
- TypeScript strict 통과, 빌드 실패 0
- 신규 파일 4개:
  - `src/lib/kpi-tooltip.ts`
  - `src/lib/jira-constants.ts`
  - `src/components/kpi-rules/ArchiveList.tsx`
  - `src/services/retrospective/__tests__/epicRetro.test.ts`
  - `src/stores/__tests__/kpiRulesStore.test.ts`
  - `src/lib/__tests__/kpi-tooltip.test.ts`

### 보호된 기존 기능 (변경 없음)
- `calculateKPI`의 핵심 산식 흐름 (for문 단일 패스, agreed-delay 이중 제외)
- `getGradeFromRules` / `getEarlyBonusFromRules` / `getDefectGradeFromRules` 알고리즘
- Zustand persist 키 (`jira-dash-kpi-rules`) — localStorage 마이그레이션 없음
- Level 4 UI의 탭 구조 (Jira 연결 / KPI 규칙)
- 사이드바 + 이슈 목록 + 이슈 상세 드로어

### 빌드
```bash
npm run build          # 1.0.9 .exe + portable 생성
npm test               # vitest 235 케이스 통과
```

---

## [1.0.7] 진행 추이/예측 신규 탭 — Monte Carlo ETA + 담당자별 처리량 + 백로그 공수

### 적용 버전
- 앱 버전: **1.0.7** (package.json 기준)
- 패치 반영일: 2026년 4월

### 변경 사항

#### 신규 탭 "진행 추이/예측" (프로젝트 통계 다이얼로그)
- **다중 프로젝트 선택**: `JIRA_CONFIG.PROJECT_KEYS` 드롭다운으로 프로젝트 자유 전환 (선택은 localStorage 저장)
- **백로그 6 카드**: 잔여/활성/보류/미할당/90일 완료/마감일 미설정
- **오늘·이번주 완료 카드** (한국식 월~일)
- **지연 분류 3카드**: 미완료 지연 / 완료 지연 / 마감일 미설정 — 용어 혼선 해소
- **일별 완료 추이 차트** (recharts BarChart, 최근 30일)

#### 백로그 완료 시점 예측 (Monte Carlo)
- **Monte Carlo 처리량 시뮬레이션** (10,000 trials) — 분포 자유 robust 모델
- **3 시나리오 ETA**: 낙관 (자유 재할당) / 기준 ★ (현재 할당 유지) / 병목 (최대 ETA)
- **확률 분포 시각화**: P50 / P85 (권장 약속) / P95 (위험 최소화)
- **Scope creep 보정**: 신규 유입 모델링 → 발산 시 강한 경고
- **신뢰도 등급** (high/medium/low/unreliable):
  - low면 단일 ETA 숨김, 범위만 표시
  - unreliable면 진단 정보만 표시 (정직성 원칙)

#### 담당자별 처리량 + 워크로드
- 담당자별 잔여·활동일·일평균·ETA·신뢰도 표 (정렬 가능, 가나다 default)
- 활동 7일 미만 인원 회색 처리 (휴가/specialization 미반영 안내)
- 미할당·보류 별도 카운트

#### 백로그 공수 추정
- **Hybrid 모델**: Worklog → SP → 난이도 → Cycle time fallback (자동 우선순위)
- 데이터 출처별 분포 시각화
- 인시 + 인일 환산 + 신뢰 구간 표시
- **ETA-공수 상호 검증**: 30% 격차 시 경고 + 해석 ("프로세스 비효율" / "공수 누락")

#### 인프라
- **vitest 단위 테스트 152개** (기존 58 + 신규 94) — 산식 회귀 박제
- **신규 서비스**: `src/services/prediction/` (7 파일)
  - Monte Carlo + 신뢰도 + Scope 분석 + 담당자별 + 공수 + 상호 검증
- **신규 hook**: `useProjectIssues`, `useBacklogForecast`
- **신규 store**: `projectSelectionStore` (Zustand persist)
- **date-utils 확장**: 영업일·한국 공휴일·KST timezone 안전 헬퍼

#### 보호된 기존 기능 (변경 없음)
- `kpiService.ts` (KPI 산식)
- `jira-helpers.ts` (filterLeafIssues)
- `jiraClient.ts` (API)
- `electron/main.ts` (보안 설정)
- 사이드바 + 이슈 목록 + 이슈 상세 드로어

### 빌드
```bash
npm run build          # 1.0.7 .exe + portable 생성
npm test               # vitest 152 케이스 통과
```

### 참조 문서
- `docs/progress-prediction-analysis.md` — 정밀 분석 (38KB)
- `docs/progress-prediction-workplan.md` — 작업계획서
- `docs/progress-prediction-data-fitness.md` — Phase 0 데이터 적합도 측정
- `docs/user-guide-prediction.md` — 사용자 가이드

---

## [1.0.5] 보류·취소 통계, 댓글 에디터 개선, 빌드 구조 정리

### 적용 버전
- 앱 버전: **1.0.5** (package.json 기준)
- 패치 반영일: 2026년 3월

### 변경 사항

#### 프로젝트 통계 – 보류·취소 반영
- **전체 현황**: 6개 카드로 확장 (전체 이슈 / 완료 / 진행 중 / 지연 / **보류** / **취소**).
- **이슈 분포 파이**: 5세그먼트(완료·진행·대기·보류·취소). 상호 배타적으로 분류.
- **담당자별 현황**: 완료 집계에 보류·취소 포함 (`isDoneForAssignee`). 조기완료·준수는 실제 완료만 유지.
- **막대 그래프**: 보류율·취소율 BarStat 추가.
- **설정**: `jiraConfig.ts`에 `STATUS_NAMES: { ON_HOLD: '보류', CANCELLED: '취소' }` 추가.

#### 댓글 에디터 개선
- **contentEditable 인라인 에디터** 도입: 텍스트와 멘션 칩이 자유롭게 혼재하는 Jira 스타일 에디터.
- `@` 입력 시 커서 위치에 멘션 칩 삽입. 칩 앞뒤 어디서든 텍스트 입력 가능.
- **수정 취소 버튼(X)**: 수정 모드일 때만 노출. 클릭 시 에디터 초기화 및 새 댓글 모드 복귀.
- 멘션 팝오버: 흰색 배경, 컴팩트 크기(`max-w-[220px]`), `onMouseDown`으로 포커스 유지.

#### 빌드·보안 구조 정리
- **보안**: `electron/main.ts`에서 Jira 이메일·토큰을 환경 변수(`JIRA_EMAIL`, `JIRA_API_TOKEN`)로 분리.
- **린트**: `eslint.config.js` globalIgnores에 `dist-electron` 추가.
- **clean 스크립트**: `dist_electron` 전체가 아닌 `win-unpacked` 등 언팩 폴더만 삭제하도록 변경 → 기존 exe 파일 보존.
- **미사용 파일 정리**: `statistics-panel.tsx`, `issue-drawer.tsx`, `use-jira.ts`, `overlay.tsx`, `avatar.tsx`, `react.svg` 삭제.

### 빌드 명령

```bash
npm run build          # 전체 빌드 (clean 없이)
npm run build:install  # clean(언팩만) 후 빌드
```

### 설치 파일 (Windows)
- **Jira Dashboard 1.0.5.exe** — portable (설치 없이 실행)
- **Jira Dashboard Setup 1.0.5.exe** — NSIS 설치 파일 (바탕화면·시작 메뉴 바로가기, 앱 아이콘)

> **환경 변수 설정 필요**: 실행 전 `JIRA_EMAIL`, `JIRA_API_TOKEN`을 설정해야 Jira API가 동작합니다.

---

## [1.0.4] 에픽 이슈 조회 400 수정 및 건수 규칙 반영

### 적용 버전
- 앱 버전: **1.0.4** (package.json 기준)
- 패치 반영일: 2026년 2월

### 변경 사항
- **버전**: 1.0.3 → 1.0.4
- **에픽 이슈 조회 400 수정**: Jira Cloud `POST /rest/api/3/search/jql` 는 요청 본문에 `startAt` 을 지원하지 않음. `startAt` 제거 후 **nextPageToken** 만 사용하도록 수정하여 "Request failed with status code 400" 제거.
- **이슈 건수·통계 규칙**: 할 일만 있으면 카운트, 하위 작업 있으면 부모 제외·하위만 반영. 대시보드·통계·KPI·검색 결과 건수에 `filterLeafIssues` 적용.
- **기타**: 이슈 상세 첨부파일 목록만 횡 표시(다운로드 미제공) 등 1.0.3 내용 유지.

### 설치 파일
- `npm run build` 실행 시 `dist_electron/` 에 **Jira Dashboard 1.0.4.exe** (Windows portable) 등이 생성됩니다.

---

## [1.0.3] 이슈 상세 첨부파일 UI 변경

### 적용 버전
- 앱 버전: **1.0.3** (package.json 기준)
- 패치 반영일: 2026년 2월

### 변경 사항
- **버전**: 1.0.2 → 1.0.3
- **이슈 상세 첨부파일**
  - **목록만 표시**: 다운로드 링크 제거. 파일명·크기·날짜·작성자만 표시합니다. (설명 본문 내 이미지/미디어 링크는 기존대로 유지)
  - **횡(일렬) 배치**: 세로 목록에서 **가로 나열**로 변경. `flex-wrap`으로 칩 형태로 일렬 배치되며, 많을 경우 줄바꿈됩니다.

### 설치 파일
- `npm run build` 실행 시 `dist_electron/` 에 **Jira Dashboard 1.0.3.exe** (Windows portable) 등이 생성됩니다.

---

## [1.0.2] 설치 파일 재패치 (난이도·설명 내 이미지 반영)

### 적용 버전
- 앱 버전: **1.0.2** (package.json 기준)
- 패치 반영일: 2026년 2월

### 변경 사항
- **버전**: 1.0.1 → 1.0.2. 분석 내용을 반영한 **설치 파일 재패치**입니다.
- **패치 문서 보강**: 1.0.1 패치 노트에 누락되었던 아래 항목을 명시했습니다.
  - **난이도 필드**: 필드명 '난이도'로 id 매핑, 이슈 상세에서 표시·팝오버 편집, Jira 반영.
  - **설명 내 이미지·미디어 표시**: renderDescriptionAdf, 설명 본문 내 인라인 이미지·첨부 링크·프록시 URL.
- **설치 파일**: `npm run build` 실행 시 `dist_electron/` 에 1.0.2 기준 설치 파일(Windows portable 등)이 생성됩니다. 포함 기능은 아래 [1.0.1]의 §1·§2·§3 및 설치·빌드 시 참고와 동일합니다.

### 포함 기능 (1.0.2 = 1.0.1과 동일, 문서만 보강)
- **난이도**: 이슈 상세 세부정보에서 필드명 '난이도' 조회·표시·편집(팝오버 → updateIssue).
- **설명 내 이미지**: 이슈 설명(ADF)에서 인라인 이미지·미디어·링크 표시(renderDescriptionAdf, 프록시 URL).

---

## [1.0.1] 전체 기능 검증 및 설치 파일 패치

### 적용 버전
- 앱 버전: **1.0.1** (package.json 기준)
- 패치 반영일: 2026년 2월

### 변경 사항
- **버전**: 1.0.0 → 1.0.1 (패치 버전 상향)
- **기능 검증**: 구현 검증 보고서(`docs/implementation-verification.md`)에 전체 기능 분석 요약 추가. API·이슈 상세(설명/우선순위/난이도/첨부)·댓글·멘션·설명 내 미디어 등 요구 기능 정상 구현 확인.
- **설치 파일**: 기존 electron-builder 설정 유지. 빌드 시 `npm run build` → 출력 디렉터리 `dist_electron`, Windows portable 타깃, NSIS(바탕화면·시작메뉴 바로가기) 포함.

### 1. 난이도 필드 (이슈 상세)

- **필드 식별**: Jira 필드 목록(GET `/field`)을 조회한 뒤 **필드명이 '난이도'인 필드**의 id를 사용합니다. 해당 필드가 없으면 `jiraConfig`의 DIFFICULTY id를 폴백으로 사용합니다.
- **표시**: 이슈 상세 세부정보 그리드에 난이도 현재 값(이름)을 표시합니다. 옵션 목록은 이슈별 editmeta의 `allowedValues`로 조회합니다.
- **편집**: 난이도 행 클릭 시 팝오버로 옵션 목록이 열리고, 항목 선택 시 `updateIssue`로 Jira에 즉시 반영됩니다. (구현 상태: **표시·편집 모두 동작**)

### 2. 설명 내 이미지·미디어 표시 (이슈 상세)

- **설명(description) 렌더링**: 이슈 설명은 Jira ADF 형식으로 내려오며, **renderDescriptionAdf**로 React 컴포넌트에 렌더링됩니다.
- **인라인 이미지**: ADF의 `media` 노드(이미지/첨부)는 **설명 본문 안에 인라인으로 표시**됩니다. 첨부 id 또는 파일명(alt)으로 이슈 첨부 목록과 매칭하며, 이미지 src는 프록시 경유 URL(`/api/attachment/content/{id}`)을 사용합니다.
- **첨부 링크·텍스트 링크**: 설명 내 링크는 `<a href>`로 렌더링됩니다. 첨부 파일 링크는 프록시 URL로, 외부 링크는 http(s)만 허용합니다.
- **요약**: 설명 본문에 **이미지가 그대로 노출**되며, 첨부 다운로드 링크를 눌러 파일을 받을 수 있습니다.

### 3. 포함된 기능 요약 (1.0.1 기준)
| 구분 | 내용 |
|------|------|
| 이슈 상세 | 설명(ADF)·**설명 내 이미지/미디어 표시**·우선순위(표시·편집)·**난이도(필드명 '난이도', 표시·편집)**·생성일·첨부 목록·다운로드(프록시 경유) |
| 댓글 | 작성·수정·@멘션·여러 줄 입력·에러 표시 (댓글 탭 전용) |
| 설명 내 미디어 | **인라인 이미지 표시**·첨부 링크·링크 마크 (renderDescriptionAdf, 프록시 URL) |

---

## [1.0.0] 이슈 상세 댓글·멘션 및 UI 개선

### 적용 버전
- 앱 버전: 1.0.0 (package.json 기준)
- 패치 반영일: 2025년 기준 최신 개발 분기

### 1. 댓글·멘션 기능

- **댓글 작성**
  - 이슈 상세에서 **댓글** 탭 선택 시에만 댓글 입력 영역이 표시됩니다.
  - Jira ADF 형식으로 전송하며, `addComment` API를 사용합니다.

- **@멘션**
  - 댓글 입력 중 **`@`** 를 입력하면 사용자 검색 팝오버가 열립니다.
  - 선택한 사용자는 입력 박스 **안**에 `@이름` 칩으로 표시됩니다.
  - 칩 **클릭** → 같은 팝오버에서 다른 사용자 선택 시 해당 멘션만 **교체**됩니다.
  - 칩 **X 버튼** → 해당 멘션만 **삭제**됩니다.

### 2. 여러 줄 댓글

- 댓글 입력이 **여러 줄** 작성 가능한 텍스트 영역(textarea)으로 변경되었습니다.
- 줄바꿈은 Jira ADF의 `hardBreak`로 저장됩니다.

### 3. 댓글 수정

- **댓글 탭**에서 기존 댓글 **카드를 클릭**하면, 해당 댓글 내용이 상단 입력란에 로드되고 **수정 모드**로 전환됩니다.
- 입력란 **우측 하단의 체크(✓) 버튼**을 클릭하면 수정 내용이 반영됩니다. (Jira `updateComment` API 사용)
- 새 댓글 작성 시에도 같은 체크 버튼으로 등록합니다.

### 4. UI 조정

- 댓글 입력 박스 크기를 줄였습니다.
- **멘션 추가** 버튼은 제거되었습니다. 멘션은 입력 중 `@` 로만 추가합니다.
- **등록/수정 반영**은 입력 박스 **우측 하단**의 체크(✓) 버튼 하나로 통합되었습니다.

### 5. 기타

- 이슈 상세 화면의 **Debug** 버튼 및 Debug 패널이 제거되었습니다.

---

## 설치·빌드 시 참고

- **빌드**: `npm run build` (TypeScript → Vite → electron-builder)
- **출력**: 설치 파일은 `dist_electron/` 에 생성됩니다. (Windows: portable 실행 파일, NSIS 옵션 적용)
- **실행**: Electron 앱은 내부 프록시(포트 3001)를 사용하므로, Jira API 토큰은 `electron/main.ts`(또는 배포 설정)에서 설정해야 합니다.
- **패치 반영 확인**  
  - 이슈 상세 → **댓글** 탭: 댓글 입력란·멘션 칩·체크 버튼·댓글 클릭 수정  
  - 이슈 상세 → **세부정보**: **난이도** (필드명 '난이도' 표시·팝오버 편집), 우선순위 팝오버 편집, **설명** (ADF·**설명 내 인라인 이미지/미디어 표시**), 첨부파일 목록·다운로드 링크
