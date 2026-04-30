# 패치 내역 (Jira Dashboard)

설치/배포 시 포함된 기능 변경 및 수정 사항입니다.

---

## [1.0.31] KPI 성과 탭 + 회고 영역 매핑 자동 모드

### 적용 버전
- 앱 버전: **1.0.31**

### 배경
사용자 정정:
> "프로젝트 통계의 KPI 성과 탭과, 예측/회고 탭에서 회고 영역은 KPI 성과 탭에서 맵핑한 정보가 있는 경우 해당 정보를 기반으로 표시"
> "담당자별 성과 분석도 매핑 정보를 기반으로 당시의 내용을 보여주고"

v1.0.30에서 회고 영역만 사이드바 기준으로 롤백한 것은 **사용자의 처음 의도를 잘못 해석**한 것. 다시 매핑 모드 자동 전환 적용. 이번에는 KPI 성과 탭 전체(4 카드 + 상세 산출 + 담당자 표)도 동일 원칙 적용.

### 통일 원칙 (확정)
```
이슈 목록 / 프로젝트 현황 / 진행 추이      = 사이드바 선택 기준
KPI 성과 탭 / 회고 영역                    = 매핑 있으면 매핑 dev 에픽 기준 (당시 평가)
                                            매핑 없으면 사이드바 기준
```

### 핵심 변경

#### 1. dashboard.tsx — ProjectStatsDialog props 추가
- `mappingDevIssues={Array.from(devIssuesByEpic.values()).flat()}`
- `mappedDevEpicKeys={defectKpi.mappedDevEpicKeys}`

#### 2. project-stats-dialog.tsx — KPI 탭 전용 매핑 모드 변수
```ts
const isKpiMappingMode = mappingDevIssues.length > 0;
const kpiTabIssues = isKpiMappingMode ? mappingDevIssues : issues;
const kpiTabLeafIssues = filterLeafIssues(kpiTabIssues);
const kpiTabKpiMetrics = calculateKPI(kpiTabLeafIssues);

// 담당자 분석 — 매핑 모드일 때 assignees Map 인라인 재빌드
const kpiTabAssigneesWithKPI = useMemo(() => {
    if (!isKpiMappingMode) return assigneesWithKPI;
    // ... assignees Map 재빌드 + collaborations + worklog 합산
}, [...]);

const displayKpi = isKpiMappingMode ? kpiTabKpiMetrics : kpiMetrics;
const displayAssigneesWithKPI = isKpiMappingMode ? kpiTabAssigneesWithKPI : assigneesWithKPI;
```
- KPI 탭 내 16 곳의 `kpiMetrics.*` → `displayKpi.*` 자동 일괄 교체
- 담당자 표 1 곳의 `assigneesWithKPI` → `displayAssigneesWithKPI`
- 프로젝트 현황 탭은 그대로 (변경 없음, 사이드바 기준 유지)

#### 3. progress-trends/index.tsx — 회고 영역 매핑 모드 자동 전환 복원
```ts
const retroMode = defectKpi.mappingCount > 0 ? 'mapping' : 'sidebar';
const retroEpicKeys = retroMode === 'mapping' ? defectKpi.mappedDevEpicKeys : selectedEpicIds;
const retroIssues = retroMode === 'mapping'
    ? Array.from(defectKpi.devIssuesByEpic.values()).flat()
    : issues;
const retro = analyzeEpicsRetrospective(retroIssues, retroEpicKeys, defectKpi.defectStatsByDevEpic);
```

#### 4. 두 영역 모드 안내 배지 (통일)
- **KPI 성과 탭 상단**: 매핑 모드일 때 인디고 박스
  ```
  🔗 매핑 기반 KPI 평가
  매핑된 1개 에픽 (IGMU-47) 기준 — 당시의 등급 평가 내용
  ```
- **진행 추이/예측 → 회고 섹션 헤더 우측**: 작은 배지
  - `🔗 매핑 기반 (IGMU-47)` 인디고 / `📂 사이드바 선택 기반` 무채색
- subtitle도 모드별 다르게 안내

### 사용자 시나리오 (정상화)
| 매핑 | 사이드바 | KPI 성과 탭 | 회고 영역 |
|------|--------|----------|---------|
| 없음 | IGMU-538 | IGMU-538 KPI (사이드바 기준) | IGMU-538 회고 (사이드바 기준) |
| **IGMU-47 ↔ TQ-605** | IGMU-538 | **IGMU-47 KPI** ✓ + 결함 KPI ✓ | **IGMU-47 회고 + TQ-605 결함** ✓ |
| 둘 다 매핑 | 무관 | 두 에픽 통합 KPI | 두 에픽 회고 |

### 검증
- TypeScript strict 통과
- ESLint 0 errors (15 기존 warnings)
- vitest 25 files / 320 tests 통과

---

## [1.0.30] 회고 영역 정정 (v1.0.31에서 다시 자동 모드 적용)

### 적용 버전
- 앱 버전: **1.0.30**

### 배경
v1.0.29의 자동 모드 전환이 사용자 의도와 충돌:
- 사이드바 IGMU-538 (현재 v3.0.5.2_PPP) 선택
- 매핑 IGMU-47 ↔ TQ-605 (이전 v3.0.5.1) 등록
- v1.0.29 자동 모드 → 회고 좌측이 **IGMU-47 (이전 버전)** KPI 표시 ❌

사용자 명확화:
> "사이드바에서 에픽을 선택해야 모든게 표시가 되는데, 선택한 상황에서는 프로젝트 통계에서도 사이드바에서 선택한 에픽 기준이고, 프로젝트 통계의 KPI 성과 탭과, 예측/회고 탭에서 회고 영역은 KPI 성과 탭에서 맵핑한 정보가 있는 경우 해당 정보를 기반으로 표시"

### 통일 원칙 (확정)
```
모든 영역 = 사이드바 선택 = 기본 기준
결함 데이터(매핑 의존) 영역만 매핑 정보 결합:
  • KPI 성과 탭 → 결함 KPI 섹션 (이미 매핑 기반 작동)
  • 진행 추이/예측 탭 → 회고 우측 (v1.0.30 정정)
매핑 없음 → 친화적 안내 메시지
```

### 핵심 변경 (v1.0.29 일부 롤백)

#### 1. `progress-trends/index.tsx` — retroEpicKeys/retroIssues 롤백
```ts
// v1.0.29 (잘못된 방향)
const retroMode = mappingCount > 0 ? 'mapping' : 'sidebar';
const retroEpicKeys = retroMode === 'mapping' ? mappedDevEpicKeys : selectedEpicIds;
const retroIssues = retroMode === 'mapping' ? Array.from(devIssuesByEpic.values()).flat() : issues;

// v1.0.30 (정정)
const retro = analyzeEpicsRetrospective(issues, selectedEpicIds, defectStatsByDevEpic);
```

#### 2. 회고 섹션 헤더 모드 배지 제거
- v1.0.29의 "🔗 매핑 기반" / "📂 사이드바 선택 기반" 배지 → 삭제 (혼란만 가중)
- subtitle만 명확화: "좌: 사이드바 선택 에픽 KPI · cycle time / 우: 매핑된 결함 회고 (있으면 표시)"

#### 3. EpicDefectCard 4분기 메시지 유지 (v1.0.29 좋은 변경)
- 로딩 / fetch 에러 / 매핑 0건 / 이 에픽 미매핑 — 그대로
- 사용자가 즉시 진단 가능

#### 4. useDefectKpiAggregation 노출 강화는 그대로 유지
- `devIssuesByEpic`, `mappedDevEpicKeys`, `mappings` — 다른 곳에서 활용 가능 (예: 매니저 콘솔의 진단 정보)

### 사용자 시나리오 (정상화)
| 매핑 | 사이드바 | 좌측 (에픽 회고) | 우측 (결함 회고) |
|------|--------|-----------|------------|
| 없음 | IGMU-538 | **IGMU-538 KPI** ✓ | "결함 매핑 미등록" |
| IGMU-47 ↔ TQ-605 | IGMU-538 | **IGMU-538 KPI** ✓ | "이 에픽 미매핑 — IGMU-538 매핑 추가하세요" |
| IGMU-538 ↔ TQ-605 | IGMU-538 | **IGMU-538 KPI** ✓ | **TQ-605 결함** ✓ |

### 검증
- TypeScript strict 통과
- ESLint 0 errors
- vitest 25 files / 320 tests 통과

---

## [1.0.29] 회고 영역 매핑 자동 모드 전환 (v1.0.30에서 일부 롤백)

### 적용 버전
- 앱 버전: **1.0.29**

### 배경
사용자 피드백:
> "결함 KPI를 위한 매핑이 없을 시에는 사이드바 선택 기반으로 표출하고, 매핑이 되어 있을 때는 매핑 기반 정보로 표출하는 건 어때?"

직전까지 회고 영역(진행 추이/예측 → "B. 회고")의 데이터 흐름:
- 좌측 (에픽 회고): 사이드바 선택 에픽 기준
- 우측 (결함 회고): 매핑 기준 (단, 사이드바 선택 ∩ 매핑 dev 에픽 일치 시에만 표시)
→ **두 영역의 데이터 소스가 달라** 사용자가 IGMU-538 선택 + 매핑 IGMU-47 ↔ TQ-605 일 때 결함 회고 "매핑 미등록" 잘못 표시.

### 핵심 변경

#### 1. 회고 영역 자동 모드 전환 — `progress-trends/index.tsx`
```ts
const retroMode = defectKpi.mappingCount > 0 ? 'mapping' : 'sidebar';
const retroEpicKeys = retroMode === 'mapping'
    ? defectKpi.mappedDevEpicKeys     // 매핑된 dev 에픽 (예: IGMU-47)
    : selectedEpicIds;                  // 사이드바 선택 (예: IGMU-538)
const retroIssues = retroMode === 'mapping'
    ? Array.from(defectKpi.devIssuesByEpic.values()).flat()
    : issues;
```
**사이드바 선택과 매핑이 다른 경우** 매핑 기반으로 자동 전환 — 좌·우 회고 카드 모두 정상 표시.

#### 2. useDefectKpiAggregation 노출 강화 — `useDefectKpiAggregation.ts`
- 신규: `devIssuesByEpic: Map<string, JiraIssue[]>` — 매핑된 dev 에픽의 raw issues
- 신규: `mappedDevEpicKeys: string[]` — 매핑된 모든 dev 에픽 키
- 신규: `mappings` — 진단 메시지용

#### 3. 회고 섹션 헤더 모드 배지 (CategorySection.headerRight)
- **🔗 매핑 기반 (IGMU-47, ... 외 N)** — 인디고 톤
- **📂 사이드바 선택 기반** — 무채색 톤
- title 툴팁으로 상세 안내

#### 4. EpicDefectCard 분기 메시지 4가지 정교화
| 케이스 | 조건 | 메시지 |
|--------|------|------|
| 로딩 | `isLoading` | 스피너 + "결함 데이터 로딩 중..." |
| Fetch 에러 | `hasError` | 빨강 + "Jira 권한 또는 네트워크 문제. 새로고침으로 재시도" |
| 매핑 0건 | `mappingCount === 0` | "결함 매핑 미등록 → KPI 탭" (기존 메시지 유지) |
| 에픽 매핑 X | `mappingCount > 0` 인데 이 에픽 매핑 X | **"이 에픽은 매핑되지 않음 + 현재 등록 매핑 목록 + 추가 안내"** |

### 사용자 시나리오
| 매핑 | 사이드바 | 회고 모드 | 좌측 (에픽 회고) | 우측 (결함 회고) |
|------|--------|---------|-----------|------------|
| 0건 | IGMU-538 | 사이드바 | IGMU-538 KPI | "매핑 미등록" |
| IGMU-47 ↔ TQ-605 | IGMU-538 | **매핑** | **IGMU-47 KPI** ✓ | **TQ-605 결함** ✓ |
| IGMU-47, IGMU-538 매핑 2건 | 무관 | **매핑** | 두 에픽 KPI | 두 결함 데이터 |

### 영향 (이슈 목록은 사이드바 기준 그대로)
- IssueList(메인 화면 이슈 목록)는 사이드바 선택 기반 유지 — 매핑된 dev 에픽 외 다른 에픽도 자유롭게 탐색 가능.
- KPI 성과 탭의 결함 KPI는 v1.0.28과 동일 (변경 없음).

### 검증
- TypeScript strict 통과
- ESLint 0 errors
- vitest 25 files / 320 tests 통과

---

## [1.0.28] 매니저 콘솔 — 일일 브리프 + 리스크 보드 + 1:1 미팅 준비

### 적용 버전
- 앱 버전: **1.0.28**

### 배경
관리자가 매일·매주 단위로 "지금 무엇을 봐야 하는가" 답하는 액션 지향 화면이 부재. 기존 통계 탭은 분석은 풍부하지만 조치 가능 항목이 분산됨. 매니저 1차 가치 패키지(Tier 1) 신규 구현.

### 핵심 변경

#### 1. useRiskAnalysis hook (신규)
6 위험 카드 산정 — 모두 기존 issues에서 합성, 추가 API 호출 0건.
| 카드 | 산정 룰 |
|------|--------|
| 🔥 마감 임박 | duedate D-3 이내 + 미완료 |
| 👻 Stale | updated 7일 무변동 + 미완료 |
| 🚫 미배정 방치 | assignee 없음 + created 3일 초과 |
| ⏸️ 보류 장기 | status=보류 + updated 7일 초과 |
| 🪣 과부하 | 1인당 동시 진행 5건 이상 |
| 📈 Scope creep | 최근 7일 신규/완료 비율 > 1.5 |

각 임계값은 props로 조정 가능 (기본값 산업 표준).

#### 2. useManagerBrief hook (신규)
일일 브리프 9개 지표:
- 어제: 완료 / 신규 등록
- 오늘: 진행 중 / D-0 마감 / 시작 예정
- 내일: 시작 예정
- 7일: 신규 / 완료 / 진척률
- 어제 완료 이슈 / 오늘 마감 이슈 / 오늘 시작 이슈 (drill-down 가능)

#### 3. ManagerConsole 컴포넌트 (신규 폴더)
풀스크린 Dialog (`w-[95vw] max-w-[1600px]`) + 3 Tabs:
- `📅 오늘의 브리프` (default)
- `🔥 리스크 보드` (탭에 위험 카운트 빨강 배지)
- `👤 1:1 미팅 준비` (담당자 dropdown 자동 요약)

#### 4. DailyBriefCard
3 섹션 grid (어제·오늘·다음 3일) — 카드 클릭 → 해당 이슈 IssueList focus.
- 어제 완료 이슈 미니 리스트 (최대 10건 미리보기 + 전체 보기)

#### 5. RiskBoard
6 카드 grid + 카드별:
- 상위 3건 인라인 리스트 (이슈 키 + summary + 메타: D-N / N일 stale / N일 보류)
- "+ N건 더 보기" → 전체 펼침
- "전체 IssueList로" → focus 모드로 이동
- 0건이면 "위험 없음 ✓" 표시

#### 6. OneOnOnePrep
- 담당자 popover 선택 (300+ 인원 검색 가능)
- 4 KPI 카드: 담당 task / 완료율 / 준수율 / 종합 등급
- **격려 포인트** 자동 추출 (룰 기반): 완료량·조기 완료·준수율·난이도 상 도전
- **코칭 포인트** 자동 추출: 지연·보류·동시 진행 과다·완료 0건
- 4 활동 리스트 (완료·진행·지연·보류 each)

#### 7. Dashboard 헤더 통합
- 새 버튼 `🎯 매니저` (Briefcase 아이콘)
- **위험 카운트 빨강 배지** — 위험 N건 자동 카운트 (-1px right shift, 0이면 숨김)
- 99 초과 시 `99+` 표시
- IssueList focus·이슈 drawer 연동 (다이얼로그 자동 닫힘 후 해당 화면)

#### 8. jiraClient.ts 보강
- `searchIssues` fields 배열에 `'updated'` 추가 → Stale 감지에 활용

### 영향
| 영역 | v1.0.27 | v1.0.28 |
|------|---------|---------|
| 매니저 일일 점검 | 통계 탭 → 분석 데이터 | **매니저 버튼 → 30초 안에 위험·우선순위 파악** |
| 위험 식별 | 수동 (필터로 검색) | **헤더 빨강 배지 자동 표시** |
| 1:1 준비 | 수동 데이터 수집 | **담당자 클릭 → 자동 요약** |
| 데이터 흐름 | useBacklogForecast | useRiskAnalysis + useManagerBrief (모두 기존 issues 합성) |

### 검증
- TypeScript strict 통과
- ESLint 0 errors
- vitest 298/298 통과
- 추가 Jira API 호출 0건 (기존 fetch 데이터만 활용)

---

## [1.0.27] 다크모드 default + 네트워크 keepalive (장시간 idle 끊김 방지)

### 적용 버전
- 앱 버전: **1.0.27**

### 배경
사용자 피드백:
1. **다크모드를 default로 했으면** — 현재는 'system' (OS 따라감), 사용자는 다크를 원함
2. **장시간 사용하지 않아도 네트워크 끊김 방지** — 화면 idle 시 Jira 세션·proxy 연결이 끊어지는 것 같음

원인 분석:
- Atlassian 세션 token 무활동 시 만료
- Electron BrowserWindow background throttling 발생 가능
- React Query staleTime 미설정 + refetchOnWindowFocus=false 로 자동 갱신 없음
- Network drop 시 자동 재시도 없음

### 핵심 변경

#### 1. 다크모드 default
- `displayPreferenceStore.ts`: theme 초기값 `'system'` → **`'dark'`**
- 신규 사용자/스토어 초기화 시 다크가 기본 적용. 사용자가 토글하면 그 선택이 persist 유지.

#### 2. useJiraKeepalive hook 신규 — `src/hooks/useJiraKeepalive.ts`
- **10분마다** 가벼운 `jiraApi.getFields()` ping → Atlassian 세션 갱신 유도
- **window focus** 이벤트 → 즉시 ping (탭/모니터 복귀 시)
- **online/offline** 이벤트 → 네트워크 복구 즉시 재연결
- 상태 반환: `lastPingAt`, `isStale`, `isOnline`

#### 3. ConnectionIndicator 컴포넌트 — `src/components/ui/connection-indicator.tsx`
- 우하단 미세 indicator (Wifi 아이콘 + "온라인"/"세션 갱신"/"오프라인")
- 색상 토큰: 정상 emerald / stale amber / offline red (다크 자동 대응)
- hover 시 마지막 ping 시각 tooltip
- App.tsx 글로벌 배치 (모든 화면에서 보임)

#### 4. React Query keepalive 옵션 일관 적용 — `dashboard.tsx`
**epics + issues 두 핵심 쿼리에 적용:**
```ts
refetchOnWindowFocus: true,       // 창 복귀 자동 새로고침
refetchOnReconnect: true,          // 네트워크 복구 자동 재요청
refetchInterval: 15 * 60 * 1000,  // 15분 백그라운드 갱신
staleTime: 5 * 60 * 1000,         // 5분 fresh
gcTime: 30 * 60 * 1000,            // 30분 캐시 보관
retry: 3,
retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),  // exponential backoff
```

#### 5. Electron powerSaveBlocker — `electron/main.ts`
- `app.whenReady()` 시점에 `powerSaveBlocker.start('prevent-app-suspension')` 호출
- 앱 백그라운드 throttling 방지 (시스템 모니터 끔은 허용)
- 사용자가 자리 비워도 네트워크 작업·타이머 정상 동작

### 영향
| 영역 | v1.0.26 | v1.0.27 |
|------|---------|---------|
| 신규 사용자 첫 접속 | system 모드 (OS 따라) | **다크 모드** |
| 30분 idle 후 작업 | 401 / 끊김 가능 | **자동 ping + 자동 refetch** |
| Window focus 복귀 | 데이터 stale | **즉시 새로고침** |
| 네트워크 drop → 복구 | 수동 새로고침 필요 | **자동 재연결** |
| 일시 500/429 에러 | 즉시 실패 | **3회 exponential backoff (1s→2s→4s→8s)** |
| 연결 상태 가시성 | 없음 | **우하단 indicator** |
| 시스템 절전 | 앱 throttle | **prevent-app-suspension** |

### 검증
- TypeScript strict 빌드 통과
- ESLint 0 errors
- vitest 298/298 통과

---

## [1.0.26] 이슈 상세 드로어 — X 중복 제거 + 다크 마감

### 적용 버전
- 앱 버전: **1.0.26**

### 배경
사용자 화면 캡처 확인:
1. **이슈 상세 드로어 헤더에 X 버튼이 두 개** 보임 (Sheet 컴포넌트 기본 absolute close + 헤더 자체 close 중복)
2. **드로어 안 일부 잔여 hard-code** (`bg-slate-700` 탭 트리거, `hover:bg-slate-300` mention chip, `bg-slate-500/10` activity 배지 등)

→ "왜 닫힘 버튼이 두개야. 하나만 하자. 그리고 슬라이드 팝업에도 모두 적용된거지?"

### 핵심 변경

#### 1. X 버튼 중복 제거 — `src/components/ui/sheet.tsx`
- `<SheetPrimitive.Close className="absolute right-4 top-4 ..."> <X /> </SheetPrimitive.Close>` 자동 렌더링 블록 제거
- `import { X }` 도 제거 (미사용)
- Sheet 사용처(issue-detail-drawer)가 헤더에 자체 close 통합 → 일원화

#### 2. drawer 헤더 close 토큰화
- `ring-offset-white focus:ring-slate-950` → `text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:ring-ring focus-visible:ring-offset-background`
- X 아이콘 사이즈 `h-5 w-5` → `h-4 w-4` (헤더 RefreshCw와 통일)
- `sr-only "Close"` → `"닫기"` (한글)

#### 3. 탭 트리거 토큰화
- `data-[state=active]:bg-slate-700 data-[state=active]:text-white` → `data-[state=active]:bg-primary data-[state=active]:text-primary-foreground`
- 4개 트리거(`전체`/`댓글`/`기록`/`업무로그`) 모두 일괄 적용 (replace_all)

#### 4. Status chip & key 잔재 토큰화
- 이슈 키: `text-blue-600` → `text-blue-600 dark:text-blue-400`
- Status 변경 chip 버튼: `hover:bg-slate-300 focus:ring-blue-500` → `hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-background`

#### 5. activity.tsx 배지 다크 variant
- `bg-blue-500/10 text-blue-600` → 추가 `dark:text-blue-400`
- `bg-amber-500/10 text-amber-600` → 추가 `dark:text-amber-400`
- `bg-slate-500/10 text-foreground/80` → `bg-muted text-muted-foreground`

### 영향
| 영역 | v1.0.25 | v1.0.26 |
|------|---------|---------|
| 이슈 상세 헤더 X 버튼 | **2개** (Sheet 기본 + 헤더) | **1개** (헤더만) |
| 드로어 close 다크 | `ring-offset-white` 등 라이트 hex | **토큰 자동** |
| 탭 트리거 active | bg-slate-700 (검정) | **bg-primary** (다크 자동 글로우) |
| Status chip hover | bg-slate-300 | **bg-accent** |
| Activity 배지(이력) | slate-500/10 (라이트만) | **bg-muted** (다크 자동) |
| 이슈 키 색 | text-blue-600 (라이트만) | **+dark:text-blue-400** |

### 검증
- TypeScript strict 빌드 통과
- ESLint 0 errors
- vitest 298/298 통과

---

## [1.0.25] 담당자별 현황·KPI 성과 표 다크 핫픽스

### 적용 버전
- 앱 버전: **1.0.25**

### 배경
v1.0.24에서 7개 KPI 카드를 처리했으나 **담당자별 현황 표** 및 **KPI 성과 표** 영역에 또 다른 inline hex (`backgroundColor: '#ffffff'`, `color: '#1e293b'`, `'#64748b'`, `'#475569'` 등) 잔존:
- thead 배경 #f8fafc, 라벨 hex 6종
- 본 row `bg #ffffff` + hover `#f8fafc`
- sub-row `#faf5ff` (보라 라이트)
- 등급(S/A/B/C/D) 색상 hex 직접 비교 (#4f46e5, #2563eb, #16a34a 등)
- selectedGroup 슬라이드 패널 전체 inline
- 난이도 버튼 hex
- GradeCard 4색 매핑 hex

→ 다크 모드에서 라이트 색 그대로 노출, 가독성 박살. 사용자 두 번째 지적: "프로젝트 현황의 담당자별 현황 색은 원래 이래?" + "kpi도 마찬가지잖아."

### 핵심 변경

#### 1. 담당자별 현황 표 (status 탭)
- thead `bg #f8fafc` → `bg-muted/40 border-b border-border text-muted-foreground`
- 라벨 hex (#15803d/#1d4ed8/#475569/#b91c1c/#0e7490/#2563eb/#64748b) → 의미 색 토큰 (`text-green-700 dark:text-green-400` 등)
- 본 row `bg #ffffff` + hover handler → `bg-card hover:bg-accent/40 transition-colors`
- User icon `color #94a3b8` → `text-muted-foreground`
- 이름 `color #1e293b` → `text-foreground`
- sub-row `bg #faf5ff` → `bg-violet-50 dark:bg-violet-950/30`
- sub-row `└` 표시 → 다크 variant 추가

#### 2. selectedGroup 슬라이드 패널
- `borderTop #e2e8f0` + `bg #f8fafc` → `border-t border-border bg-muted/40`
- 제목 색 `#1e293b` → `text-foreground`
- 카운트 배지 `#e2e8f0/#475569` → `bg-muted text-foreground/80`
- 닫기 버튼 hover hex → `hover:text-foreground transition-colors`
- 난이도 버튼 (라벨+카운트+퍼센트) → `bg-card border-border hover:bg-accent` + `tabular-nums`
- 이슈 카드 `bg #ffffff border #e2e8f0 hover #f1f5f9` → `bg-card border-border hover:bg-accent/40`
- 상태 배지 `bg #f8fafc color #475569` → `bg-muted/40 text-foreground/80`

#### 3. KPI 성과 표
- thead inline → `bg-muted/40 border-b border-border text-muted-foreground`
- 본 row `bg #ffffff` + hover → `bg-card hover:bg-accent/40 transition-colors`
- User icon `#94a3b8` → `text-muted-foreground`
- **등급별 색 헬퍼** `gradeTextClass(grade, type)` 신규 — S/A/그외 + total/completion/compliance 매트릭스로 클래스 반환 (ex. `text-indigo-600 dark:text-indigo-400`)
- 종합/완료율/준수율/조기보너스 모두 hex → 헬퍼 또는 `text-amber-600 dark:text-amber-400`
- (점수) 라벨 `#64748b` → `text-muted-foreground tabular-nums`
- KPI sub-row `bg #faf5ff` → `bg-violet-50 dark:bg-violet-950/30`
- 협업 등급 색 hex → `text-violet-600 dark:text-violet-400` 등

#### 4. GradeCard
- 4색 매핑 (blue/green/amber/rose) hex → Tailwind 토큰 + dark variant
- inline `style={{ padding: 20, borderRadius: 12 }}` → `rounded-xl p-5`
- 32px 등급 숫자 `fontSize: 32, fontWeight: 800` → `text-[32px] font-extrabold tabular-nums leading-none`

#### 5. PieChart 범례 칩
- inline hex → `bg-muted/40 border-border hover:bg-accent` + tabular-nums

### 영향
| 영역 | v1.0.24 | v1.0.25 |
|------|---------|---------|
| 담당자별 표 행 배경 | 흰색(#ffffff) 그대로 | **bg-card 자동** |
| 표 라벨 색 | hex hard-code | **의미 토큰 + dark variant** |
| 등급 S/A 색 | hex 비교 inline | **헬퍼 함수 단일화** |
| sub-row 보라 톤 | #faf5ff (라이트만) | **dark:bg-violet-950/30** |
| selectedGroup 패널 | 전부 inline | **모두 토큰** |
| GradeCard 4색 | hex 매핑 | **Tailwind 클래스 객체** |

### 검증
- TypeScript strict 빌드 통과
- ESLint 0 errors
- vitest 298/298 통과

---

## [1.0.24] 프로젝트 통계 다크 핫픽스 + 다이얼로그 폭 확장

### 적용 버전
- 앱 버전: **1.0.24**

### 배경
v1.0.23에서 `text-{slate|gray}-*`, `bg-{color}-50` 같은 Tailwind 클래스는 토큰 마이그레이션됐으나, `project-stats-dialog.tsx`의 **`StatCard`, `BarStat`, `ClickCell`, `RateBadge` 컴포넌트가 inline `style={{ backgroundColor: '#eff6ff' }}` 같은 hex hard-code 사용** → Tailwind dark variant 적용 불가, 다크 모드에서도 라이트 색이 그대로 노출되는 문제 발견. 또한 반려 카드(7번째)가 6열 그리드라 다음 줄로 떨어지고 사용자가 다이얼로그 폭이 좁다고 지적.

### 핵심 변경

#### 1. StatCard inline hex → Tailwind 토큰
- `style={{ backgroundColor: '#eff6ff' }}` 등 6개 색 매핑을 클래스 객체로 변환
- 다크 variant 자동 (`bg-blue-50 dark:bg-blue-950/30`, `border-blue-200 dark:border-blue-900/60`, `text-blue-700 dark:text-blue-300`)
- `purple` 색 추가 (반려 카드용)
- hover 효과도 hex inline → Tailwind hover 클래스
- `card-hover` 유틸 적용 — 시각 일관성

#### 2. 7개 카드 한 줄 정렬
- `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` → `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7`
- 반려 카드가 다른 6개와 같은 줄에 배치 — 시각적 통일

#### 3. BarStat·ClickCell·RateBadge 토큰화
- `BarStat`: `style={{ color: '#475569' }}` → `text-foreground/80`, 트랙 `#f1f5f9` → `bg-muted/60`
- `ClickCell`: hover 색 hex → `hover:bg-accent`, 비활성 색 → `text-muted-foreground/50`
- `RateBadge`: 9가지 색 매핑을 모두 다크 variant 포함 (`bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300` 등)

#### 4. 다이얼로그 폭 확장
- `max-w-[1180px]` → **`w-[95vw] max-w-[1600px]`** — 모니터 폭의 95% 사용, 최대 1600px cap
- `max-h-[90vh]` → `max-h-[92vh]` — 약간 더 넉넉
- 큰 모니터에서 시원한 화면, 작은 화면에서도 자동 축소

### 영향 — 사용자 체감 변화

| 영역 | v1.0.23 | v1.0.24 |
|------|---------|---------|
| KPI 카드 다크 모드 | 라이트 hex 그대로 (어색) | **다크 tint 자동** |
| 반려 카드 위치 | 6열 그리드라 다음 줄 | **7열 한 줄 정렬** |
| 다이얼로그 폭 | 1180px 고정 | **95vw / max 1600px (시원)** |
| BarStat 트랙 색 | #f1f5f9 (라이트만) | **bg-muted/60 토큰** |
| RateBadge 다크 | 미반영 | **9가지 모두 dark variant** |
| 카드 hover | filter inline | **card-hover 토큰 일관** |

### 검증
- TypeScript strict 빌드 통과
- ESLint 0 errors
- vitest 298/298 통과

---

## [1.0.23] 다크모드 일관성 완성 — 전체 화면 토큰 마이그레이션

### 적용 버전
- 앱 버전: **1.0.23**
- 패치 반영일: 2026년 4월

### 배경
v1.0.22에서 사이드바·헤더·다크 토큰을 정련했지만 사용자 화면 캡처 확인 결과:
- **메인 IssueList 색감 박살** — `text-slate-700`, `bg-white`, `border-slate-200` 그대로 → 다크에서 안 보임
- **다크모드 토글이 진행 추이/예측 탭 안에만 존재** → 메인 화면에서 접근 불가
- **사이드바 collapse 버튼 식별 불가** — 단순 ChevronLeft만, 클릭 영역 작음
- **project-stats-dialog 95개 hard-code 잔존** → KPI/현황 탭 다크 미반영

→ 전체 컴포넌트 토큰 일괄 마이그레이션 + UX 개선.

### 핵심 변경

#### 1. 메인 헤더 다크모드 토글
- `Dashboard` 헤더에 `<ThemeToggle>` 배치 + 구분선 (`bg-border`)
- 어디서든 light/dark/system 순환 가능 — 더 이상 진행 추이/예측 탭에 들어갈 필요 없음

#### 2. 사이드바 collapse 버튼 강화
- 단순 ghost button → 명시적 outlined 버튼 (`h-7 w-7 border border-border bg-background/80 shadow-sm`)
- title + aria-label 명확화: "사이드바 접기"
- ChevronLeft 사이즈 통일 (h-3.5 w-3.5)

#### 3. IssueList 토큰화
- 행 배경: `bg-blue-50` → `bg-primary/[0.04] dark:bg-primary/[0.06]` (subtask), `bg-slate-50` → `bg-muted/30` (parent), `bg-white` → `bg-card`
- hover: `hover:bg-muted/50` → `hover:bg-accent/40`
- 제목 텍스트: `text-slate-800` → `text-foreground`, hover `text-blue-600` → `text-primary`
- ChevronRight/Down: `text-blue-600` → `text-primary`
- Status badges: `bg-green-50/text-green-700/border-green-200` → 추가 `dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60`
- "검색 결과 N건" 박지: `bg-blue-50/50 text-blue-600` → `bg-primary/10 text-primary` 토큰
- focus banner: `bg-slate-100 border-slate-200` → `bg-muted/40 border-border`

#### 4. IssueFilterBar 전면 리뉴얼
- 검색 input/Popover trigger: `bg-white text-slate-900` → `bg-card text-foreground` 자동
- 다중 선택 체크박스: `bg-blue-500 border-blue-500` → `bg-primary border-primary` + `Check` 아이콘
- 선택된 항목: `bg-blue-50 text-blue-600` → `bg-primary/10 text-primary`
- **강제 dark 캘린더 제거** — `<div className="dark"><Calendar className="bg-black text-white border-zinc-800" /></div>` → 토큰 기반 자동 (라이트/다크 모두 정상)
- 지연/지연완료 토글: 의미 색(red/orange) 유지하되 `dark:bg-{color}-950/40 dark:text-{color}-300 dark:border-{color}-900/60` 추가

#### 5. project-stats-dialog · 기타 35개 파일 일괄 토큰 마이그레이션
- `scripts/migrate-colors.cjs` 신규 — 일회성 자동화 스크립트
  - text-{slate|gray}-{50~900} → semantic 토큰 (foreground/muted-foreground/foreground/80/90)
  - bg-white → bg-card
  - bg-{slate|gray}-{50,100,200} → bg-muted/{40,60,주}
  - border-{slate|gray}-{100,200,300} → border-border/{50,주}
  - hover:bg-, hover:text-, divide- 모두 처리
- 총 **537 위치 / 34 파일** 자동 마이그레이션 (project-stats-dialog 114, EpicDefectCard 34, MultiEpicCompare 23, EpicRetroCard 20 등)

#### 6. 의미색 dark variant 자동 추가
- `scripts/migrate-semantic-dark.cjs` 신규
  - `bg-{color}-50` → `+ dark:bg-{color}-950/30`
  - `bg-{color}-50/50` → `+ dark:bg-{color}-950/20`
  - `text-{color}-{700,800,900}` → `+ dark:text-{color}-300`
  - `border-{color}-{200,300}` → `+ dark:border-{color}-900/60`
- 총 **341 위치 / 35 파일** (DefectPatternCard 38, EpicDefectCard 36, project-stats-dialog 25, ConfidenceBadge 12 등)

#### 7. BacklogStateCards 명시적 dark variant
- `bg-blue-50 text-blue-700 text-blue-500` → 추가 `dark:bg-blue-950/30 dark:text-blue-300 dark:text-blue-400`
- 5개 의미 색 (blue/cyan/purple/amber/green) 모두 동일 패턴
- slate는 이미 토큰 기반 (`bg-muted/40 text-foreground/90`)

### 영향 — 사용자 체감 변화

| 영역 | v1.0.22 | v1.0.23 |
|------|---------|---------|
| 메인 IssueList 가독성 | 다크에서 텍스트 묻힘 | **모든 텍스트 또렷** (text-foreground/90) |
| 헤더 테마 토글 | 진행 추이/예측 탭에만 | **메인 헤더에서 접근** |
| 사이드바 접기 버튼 | ChevronLeft 단독 | **테두리 + 그림자 명확** |
| 검색·필터 다크 대응 | bg-white 그대로 | **bg-card 자동 대응** |
| 캘린더 다크 강제 | 라이트 모드도 검정 | **테마 따라 자동** |
| 통계 다이얼로그 | 95개 hard-code | **모두 토큰** |
| KPI 카드 의미색 | 라이트만 | **dark variant 자동** |

### 신규 스크립트
- `scripts/migrate-colors.cjs` — 일반 색 → 토큰 자동 마이그레이션
- `scripts/migrate-semantic-dark.cjs` — 의미색에 dark variant 자동 추가

(일회성 도구, 향후 다른 프로젝트 적용 시 재사용 가능)

### 검증
- TypeScript strict 빌드 통과
- ESLint **0 errors** (13 기존 warnings)
- vitest **298/298 통과**

---

## [1.0.22] 다크모드 가독성 핫픽스 + 프리미엄 마감

### 적용 버전
- 앱 버전: **1.0.22**
- 패치 반영일: 2026년 4월

### 배경
v1.0.21에서 디자인 토큰 시스템을 정립했지만 **이미 작성된 코드의 hard-code 색상이 토큰을 거치지 않아** 다크모드에서 가독성이 박살. 사용자 화면 캡처 확인 결과:
- Sidebar 비선택 카드 텍스트가 거의 안 보임 (`text-gray-500/700/800/900` 그대로)
- 메인 빈 영역이 새까만 사막 (placeholder 텍스트 한 줄)
- 헤더가 평면적 (depth/shadow 없음)
- 사이드바와 메인의 시각적 분리감 없음

→ 즉시 핫픽스 + 프리미엄 마감.

### 핵심 변경

#### 1. Sidebar 카드 전면 리뉴얼 — `src/components/layout/sidebar.tsx`
- 모든 `text-gray-*`/`bg-blue-500`/`bg-transparent` hard-code → 토큰 (`text-foreground/90`, `bg-primary/[0.08]`, `bg-accent/40`)
- 선택 카드: **좌측 3px primary strip** + `ring shadow` + tint 배경 (`bg-primary/[0.08]`) + 좌측 패딩 보정
- 비선택 카드: `bg-card hover:bg-accent/40`, `border-border/60 hover:border-border`, hover 시 `shadow-sm`
- Badge 가독성 강화 (선택 시 `bg-primary/15 text-primary`, 비선택 시 `text-foreground/80`)
- Sidebar 컨테이너에 `bg-gradient-to-b from-card to-card/60` + 백드롭 블러 + `border-r border-border` (분리감)
- Epics 헤더 아이콘 컨테이너 (`p-1.5 bg-primary/10`) 추가

#### 2. Dashboard 헤더 glassmorphism — `src/pages/dashboard.tsx`
- `bg-card/80 supports-[backdrop-filter]:bg-card/60 backdrop-blur-xl` (반투명 + 블러)
- `shadow-[0_1px_0_0_hsl(var(--border)),0_4px_12px_-8px_hsl(var(--foreground)/0.1)]` — subtle depth
- 메타 정보 ("이슈/SP/Epic 개수") tabular-nums + Pill 배지
- 버튼 hard-code (`bg-blue-500`, `bg-gray-500`) 제거 → variant 시스템 활용
- 버튼 사이즈 `default` → `sm` (h-8) — 헤더 컴팩트화

#### 3. 메인 Hero EmptyState
- 단순 텍스트 1줄 → **일러스트 + 제목 + 설명 + CTA hint**
- Layers 아이콘 컨테이너 (rounded-2xl, gradient blur backdrop, Sparkles 보조 아이콘)
- 제목: "분석할 에픽을 선택해주세요"
- 설명: 한 줄에 분석 가능 영역 모두 안내 (이슈·KPI·진행 추이·회고)
- Pill hint: MousePointerClick 아이콘 + "여러 에픽 동시 선택 비교 분석" 안내

#### 4. 다크모드 색상 토큰 대비 강화 — `src/index.css`
- `--background`: 222 47% 5% → 224 47% 6% (살짝 따뜻한 검정)
- `--card`/`--popover`: 222 47% 8% → 222 33% 11% (background와 분리감 ↑)
- `--muted-foreground`: 215 20% 65% → 215 25% 75% (보조 텍스트 가독성 ↑)
- `--border`: 217 33% 18% → 217 33% 22% (카드 boundary 명확)
- `--accent`: 217 33% 17% → 217 33% 20% (hover 피드백 명확)
- `--primary`: 217 91% 60% → 217 91% 65% (다크에서 살짝 글로우)

#### 5. Radial gradient 배경 (Linear 스타일)
- Dashboard `<div>` 안에 absolute positioned radial gradient 2개:
  - 우상단: primary tint (60% × 50%, 12% opacity)
  - 좌하단: chart-2 (emerald) tint (50% × 40%, 8% opacity)
- `opacity-[0.35] dark:opacity-[0.5]` — 라이트는 미세, 다크에서 더 깊이감

#### 6. 콘텐츠 카드 토큰화
- `bg-background rounded-lg border` → `bg-card rounded-xl border-border shadow-sm`
- `bg-muted/10` 메인 영역 배경 제거 (gradient가 대신함)

### 영향 — 사용자 체감 변화

| 영역 | v1.0.21 | v1.0.22 |
|------|---------|---------|
| 사이드바 비선택 카드 가독성 | **거의 안 보임** | **선명** (text-foreground/90) |
| 사이드바 선택 카드 강조 | bg-blue 단색 | **strip + ring + glow + tint** |
| 메인 빈 영역 | 텍스트 한 줄 | **일러스트 + CTA** |
| 헤더 depth | 평면 | **glassmorphism + shadow** |
| 사이드바·메인 분리 | 없음 | **gradient bg + border** |
| 다크 배경 | 단조로운 검정 | **radial glow gradient** |
| 버튼 색상 일관성 | hard-code 혼재 | **variant 시스템 통일** |

### 검증
- TypeScript strict 빌드 통과
- ESLint **0 errors** (13 기존 warnings)
- vitest **298/298 통과**

---

## [1.0.21] UI 세련화 대형 패스 — 디자인 시스템 정립

### 적용 버전
- 앱 버전: **1.0.21**
- 패치 반영일: 2026년 4월

### 배경
v1.0.20까지 산업 표준 수준(8/10)이었으나 "프리미엄 SaaS 수준"(9.5/10)으로 가기 위한 디자인 시스템 정립. Linear·Notion·Vercel 같은 모던 SaaS 디자인 패턴 적용.

### Tier A — 즉시 효과 큰 핵심 (4)

#### 1. Vite 기본 템플릿 잔재 제거
- `src/index.css`에서 Vite 기본 `a` 보라색(#646cff), 전역 `button` padding/border, `h1` 3.2em, `body` flex layout 모두 제거 → shadcn 컴포넌트와 충돌 해소

#### 2. Pretendard 한글 폰트 도입
- `index.html`: jsdelivr CDN preconnect + variable font 로드 (gzip ~92KB)
- `index.css`: 한글 우선 폰트 스택 (`Pretendard Variable, system-ui, Apple SD Gothic Neo, Noto Sans KR, Malgun Gothic`)
- letter-spacing -0.01em 추가 (한글 미세 조정)

#### 3. 차트 색상 토큰화
- `src/lib/chart-tokens.ts` 신규 — `CHART.{primary,success,warning,danger,neutral,grid,axisText,...}` 형태 hsl(var(--chart-N)) 래퍼
- DailyCompletionChart, ForecastFunnelChart, WorkloadScatter, defect-kpi-dashboard의 hard-code (#2563eb, #ef4444 등) 일괄 토큰 교체
- 차트 tooltip 도 토큰화 (배경·border·shadow)

#### 4. 카드 hover 마이크로 인터랙션
- `.card-hover` 유틸 클래스 — `transition: box-shadow + border-color + transform 200ms`
- BacklogStateCards: 그룹 hover 시 아이콘 scale-110, shadow-md
- 모든 차트 카드에도 일관 적용

### Tier B — 세련도 향상 (4)

#### 5. shadcn Card 컴포넌트 강화
- `interactive` prop (자동 card-hover), `compact` prop (작은 padding)
- `tracking-tight`, `leading-tight` 일관 적용

#### 6. 섹션 헤더 accent bar 리뉴얼
- `CategorySection.tsx` 전면 리뉴얼:
  - 좌측 3px colored strip (Linear/Notion 스타일)
  - 1px border (전 2px) — 시각 노이즈 감소
  - icon container 다크모드 자동 (`bg-blue-100 dark:bg-blue-950/40`)
  - shadow-sm + hover:shadow-md — 미세 lift
  - emerald, rose accent 추가 (8개 색)

#### 7. Skeleton loading
- `src/components/ui/skeleton.tsx` 신규 — Skeleton, SkeletonStatCard, SkeletonChart, SkeletonRow, SkeletonSection
- shimmer 애니메이션 (`@keyframes shimmer`)
- BacklogStateCards에 적용 (spinner 대체) → layout shift 0

#### 8. 숫자 통일
- `tabular-nums` 자동 적용 클래스 (`.tabular`, `[class*="tabular-nums"]`)
- font-feature-settings: rlig + calt + ss03 (Pretendard 미세 조정)

### Tier C — 프리미엄 마감 (2)

#### 9. 다크모드 토글 (light / dark / system)
- `displayPreferenceStore`에 `theme`, `setTheme`, `cycleTheme` 추가 (persist)
- `applyTheme()` 헬퍼 — `documentElement.classList.toggle('dark')` + `meta[theme-color]` 동기화
- `App.tsx`: 부팅 시 + theme 변경 시 + system 모드일 때 `prefers-color-scheme` 미디어 쿼리 변경 감지
- `<ThemeToggle>` 컴포넌트 — 진행 추이/예측 헤더 배치, sun/moon/monitor 아이콘 순환
- `index.css` `.dark` 변수 완전 정의 (전 oklch 일부만 → 전체 HSL 통일)

#### 10. 차트 fontFamily inherit
- `CHART_FONT` 토큰: `fontFamily: 'inherit'` — recharts 기본 'sans-serif' → 시스템 폰트 통일
- fontSize 10 → 11 (가독성)
- fill: muted-foreground 토큰

### 디자인 토큰 추가
- 신규 semantic colors: `--success`, `--warning`, `--info` (전 destructive만 있던 것)
- shadow tokens: `--shadow-sm/md/lg` (다크모드는 더 진한 alpha)
- radius: 0.625rem (전 0.5rem) — 살짝 부드럽게
- 스크롤바 커스텀 (8px, border 토큰)
- ::selection 색 (primary 0.2 alpha)
- focus ring 통일 (2px outline + 2px offset)

### 검증
- TypeScript strict 빌드 통과
- ESLint **0 errors** (13 기존 warnings, 무관)
- vitest **298/298 통과**

### 영향 — 사용자 가시 변화
| 영역 | v1.0.20 | v1.0.21 |
|------|---------|---------|
| 한글 가독성 | system-ui (영문 우선) | **Pretendard variable** |
| 차트 색상 일관성 | hard-code 7+ 위치 | **단일 토큰 시스템** |
| 카드 인터랙션 | 정적 | **hover lift + scale** |
| 섹션 헤더 | 2px border + bg tint | **좌측 strip + 미세 shadow** |
| 다크모드 | 미지원 | **3 모드 토글** (light/dark/system) |
| 로딩 상태 | "데이터 로딩 중..." 텍스트 | **Skeleton (layout shift 0)** |
| 색 의미론 | destructive만 | **success/warning/info/destructive** |
| Vite 잔재 | a 보라색·h1 3.2em·flex body | **모두 제거** |

### 빌드
```bash
npm run build          # 1.0.21 .exe + portable
```

---

## [1.0.20] 정밀분석 후속 — 성능·구조·UX 일관성 보강

### 적용 버전
- 앱 버전: **1.0.20**
- 패치 반영일: 2026년 4월

### 배경
v1.0.19 출시 후 전체 정밀분석 — 4개 영역(아키텍처·UX/UI·성능·정확성)을 점검하여 P0~P2 우선순위 보완 항목을 일괄 처리.

### 핵심 변경

#### 1. 성능 — Web Worker 실연결 (P0)
- `monteCarloForecast.worker.ts` 인프라는 v1.0.7~ 존재했으나 `useBacklogForecast` 가 동기 `teamForecast` 만 호출 → worker 자동 분기 미작동.
- v1.0.20: `buildForecastAsync`, `perAssigneeForecastAsync`, `teamForecastAsync` 추가.
- `useBacklogForecast` 가 `useState + useEffect` 기반으로 비동기 처리. 큰 입력(remainingCount × historyDays × trials/1000 > 50,000)은 자동으로 worker offload — 1000+ 이슈 시 main thread freeze 방지.
- 동기 버전(`teamForecast` 등)은 테스트 호환·rngSeed 시나리오용으로 유지.

#### 2. 구조 — 큰 컴포넌트 분해 (P1)
- `issue-detail-drawer.tsx` 1245줄 → 약 900줄 + 3개 모듈로 분해:
  - `issue-detail/helpers.tsx` (240줄) — segmentsToHtml, extractSegmentsFromEditor, IssueTypeIcon, adfToText, isSafeHref, renderDescriptionAdf, EmptyState
  - `issue-detail/activity.tsx` (78줄) — ActivityItem, HistoryItems
  - `issue-detail/editable-info-row.tsx` (87줄) — EditableInfoRow + Jira 사용자 검색 250ms 디바운스
- `jiraClient.ts` `fetchEpicsForProjectKey()` 63줄을 `tryEpicJqlVariants()` + `fetchAllPagesForJql()` 2개 헬퍼로 분해 — 가독성·재사용성 ↑

#### 3. 안정성 — useMemo selector 안정화 (P1)
- `issue-detail-drawer.tsx`에서 `kpiFields` 객체 참조 변경 시 불필요한 리렌더 발생 가능 → primitive selector 4개로 분리 (`s.rules.fields?.plannedStart` 등). Zustand `Object.is` 비교가 string 단위로 안정 작동.

#### 4. localStorage 무한 증가 방지 (P1)
- `forecastHistoryStore.pruneStale()` 가 `useBacklogForecast` 안에서만 호출 → 앱 부팅 시 1회 명시 호출 추가 (`App.tsx`).

#### 5. UX/UI 일관성 폴리싱
- **EmptyState 공용 컴포넌트** (`@/components/ui/empty-state.tsx`) 신규 — info/success/warning/minimal 4 variant. 진행 추이/예측의 인라인 회색 박스 적용.
- **버튼 hover 피드백 강화** — `transition-all`, `hover:shadow-md`, `active:scale-[0.98]`, `focus-visible:ring-2` 추가.
- **ConfidenceBadge** (`@/components/ui/confidence-badge.tsx`) 신규 — 4단계(high/medium/low/unreliable) 일관 색상·아이콘. ForecastFunnelChart 헤더에 적용.
- **색맹 대응** — WorkloadScatter 4분위에 색상 외 모양(triangle/square/diamond/circle) 추가 + 범례에도 모양 미리보기 (WCAG 1.4.1).

#### 6. 코드 품질
- `kpiService.calculateWeightedKPI` 반환에 누락됐던 `cancelledIssues`, `rejectedIssues` 카운트 추가 (v1.0.18 누락분).
- 테스트 fixture 일괄 보완 (rejected, subAssignee, teamMonthsMid, totalManMonthsLow/Mid/High).
- `.gitignore` 정리 — 일회성 작업 산출물 4건 추가.

### 검증
- TypeScript strict 빌드 통과
- ESLint 0 errors (13 기존 warnings, 모두 신규 변경 무관)
- vitest 298/298 통과
- 진행 추이/예측 탭 전체 일관성 유지

### 영향
| 영역 | v1.0.19 까지 | v1.0.20 |
|------|-------------|---------|
| 1000+ 이슈 시 freeze | 가능 | **Worker offload — 0** |
| issue-detail-drawer 응집도 | 1245줄 단일 | **3개 모듈 분리** |
| 부팅 시 localStorage 정리 | 미실행 | **자동 1회 호출** |
| 차트 색맹 접근성 | 색상만 | **+ 모양** |
| Empty State 일관성 | 인라인 박스 | **공용 컴포넌트** |
| 버튼 클릭 가능성 인지 | 보통 | **hover shadow + active scale** |

### 빌드
```bash
npm run build          # 1.0.20 .exe + portable
```

---

## [1.0.19] 진행 추이/예측 — 취소·반려 일관 적용 (v1.0.18 후속)

### 적용 버전
- 앱 버전: **1.0.19**
- 패치 반영일: 2026년 4월

### 배경
v1.0.18에서 KPI·프로젝트 현황 탭은 취소·반려를 완료에서 제외했지만, **진행 추이/예측 탭의 일부 카운트는 여전히 포함**되고 있던 미완성 상태:

```
v1.0.18까지 (불일치):
  KPI 탭          : 취소 제외 ✓
  프로젝트 현황   : 취소·반려 제외 ✓
  회고 (epicRetro): isDone에서 제외 ✓
  cycleTime 통계  : 제외 ✓
  effort 추정     : 제외 ✓
  ⚠ counts.completed90d/Today/ThisWeek : 미적용
  ⚠ dailySeries (일별 추이)              : 미적용
  ⚠ lateCompletion                        : 미적용
  ⚠ isInBacklog (rejected만 누락)         : 부분 적용
```

사용자 의견: "진행 추이/예측에서도 동일한 개념으로 반영해야"
→ **동의 — 일관성·예측 정확성·회고 정직성** 필요.

### 수정 내용

#### 1. `useBacklogForecast` counts 일관 적용
- `isRealDone` 헬퍼 도입 (statusCategory='done' AND NOT(취소·반려))
- 5개 카운트 모두 적용:
  - `completed90d` — 90일 완료
  - `completedToday` — 오늘 완료
  - `completedThisWeek` — 이번주 완료
  - `lateCompletion` — 완료 지연
  - `dailySeries` — 일별 처리량 (예측 모델 입력)

#### 2. `isInBacklog` rejected 추가
- v1.0.18의 isInBacklog가 cancelled만 제외 → rejected 추가
- 영향: 담당자별 잔여·active 카운트, ETA 산정에서 반려 제외

### 영향 — 사용자에게 보이는 변화

| 카드/차트 | v1.0.18까지 | v1.0.19 |
|-----------|-----------|--------|
| **오늘 완료 N건** | 취소·반려 포함 가능 | **실제 완료만** |
| **이번주 완료 N건** | 동일 | **실제 완료만** |
| **90일 완료 N건** | 동일 | **실제 완료만** |
| **완료 지연 N건** | 취소된 task 포함 가능 | **제외** |
| **일별 처리량 차트** | 취소된 날 막대 부풀림 | **정직한 처리량** |
| **백로그 active 카운트** | 반려 포함 가능 | **제외** |
| **Monte Carlo 입력** | 취소·반려 처리량 포함 | **실제 처리량만** → ETA 정직성 향상 |

### 검증
- vitest 298/298 통과 (변경 없음)
- TypeScript strict, ESLint 에러 0
- 진행 추이/예측 탭 전체 일관성 — KPI·프로젝트 현황과 동일 정의

### 영향받는 화면 컴포넌트
- `BacklogStateCards` — 6 카드 (잔여/활성/보류/미배정/90일완료/마감일미설정)
- `TodayWeekCards` — 오늘·이번주 완료
- `DelayCards` — 미완료 지연/완료 지연/마감일 미설정
- `DailyCompletionChart` — 최근 30일 일별 추이
- `EtaScenarioCard` — Monte Carlo 입력 데이터 정직성 → ETA 더 정확
- `PerAssigneeTable` — 담당자별 처리량 (이미 isDone 적용됨)

### 빌드
```bash
npm run build          # 1.0.19 .exe + portable 생성
```

---

## [1.0.18] 취소·반려 KPI/통계 제외 — 완료 카운트 정직성 강화

### 적용 버전
- 앱 버전: **1.0.18**
- 패치 반영일: 2026년 4월

### 배경
사용자 피드백: "완료한 타스크라고 하더라도 취소나 반려의 경우는 완료 항목에서 제외해줘 + 프로젝트 현황에서도 마찬가지야"

#### 발견된 문제
Jira의 status 카테고리 매핑상 `취소`·`반려`도 `statusCategory='done'`이라, 기존 KPI가 이를 **완료로 카운트**하던 정직성 이슈:

| Status | statusCategory | v1.0.17까지 | **v1.0.18** |
|--------|---------------|-----------|-----------|
| 완료 | done | 완료 ✓ | 완료 ✓ |
| **취소** | **done** | **완료 ✗** | **분모·분자 모두 제외** |
| **반려** | **done** | **완료 ✗** | **분모·분자 모두 제외** |
| 보류 | done | 별도 | 별도 (변경 없음) |
| 진행 | indeterminate | 진행 | 진행 |
| 할 일 | new | 대기 | 대기 |

IGMU 실측: 취소 20건, 보류 3건이 모두 done 카테고리에 들어있어 KPI 완료율을 부풀리던 상태였음.

### 수정 — 분모·분자 제외 (agreed-delay 패턴 적용)
취소·반려는 합의지연 라벨처럼 **분모와 분자 양쪽에서 제외** → 성과 평가에서 완전 제외.

#### 1. 데이터 모델 확장
- `JIRA_CONFIG.STATUS_NAMES.REJECTED = '반려'` 추가
- `kpiRulesStore.statusNames.rejected` 필드 추가
- `resolveRejectedStatus()` resolver 추가
- `KPIMetrics` 타입에 `cancelledIssues`·`rejectedIssues` 필드 노출 (UI 투명성)

#### 2. `calculateKPI` 흐름 변경
```ts
for (const issue of issues) {
    const isCancelled = statusName === rules.cancelledStatus;
    const isRejected = statusName === rules.rejectedStatus;
    if (isCancelled) cancelledIssues++;
    if (isRejected) rejectedIssues++;
    if (isCancelled || isRejected) continue; // 분자에서 제외
    // ... 기존 로직
}
const kpiTotal = totalIssues - agreedDelayIssues - cancelledIssues - rejectedIssues; // 분모 차감
```

#### 3. 프로젝트 현황 탭 (project-stats-dialog)
- `done` 필터에 `!isRejected` 조건 추가 (이미 isCancelled 제외됨)
- 6분할 파이차트: 완료·진행·대기·보류·취소·**반려** (보라색)
- 신규 "반려" StatCard + "반려율" BarStat
- `completionDenom = total - cancelled - rejected` (KPI와 동일 산식)
- `isDoneForAssignee` 함수: 보류는 done 포함, 취소·반려는 제외

#### 4. 진행 추이/예측·회고 일관 적용
- `epicRetro.isDone()` — 취소·반려 제외
- `perAssigneeForecast.isDone()` — 동일
- `useBacklogForecast.cycleTimeStats` — done 필터에 취소·반려 제외
- `effortEstimation.aggregateBacklogEffort` — resolved/active 둘 다 제외

#### 5. 설정 UI
- `JiraFieldsEditor`: "반려" status 입력란 추가

### 검증
- vitest 298/298 통과
- TypeScript strict, ESLint 에러 0
- IGMU 실측 데이터 기준: 취소 20건이 완료에서 자동 제외되어 KPI 완료율 정직성 향상

### 영향 — 사용자에게 보이는 변화
v1.0.18 적용 후 IGMU 데이터 기준:
- KPI 탭 완료율: 분모에서 취소·반려 제외 → 일반적으로 **약간 상승** (취소 task가 분모만 차지하던 효과 제거)
- 프로젝트 현황 탭: 6분할 파이차트로 **반려가 별도 시각화**
- 진행 추이/예측 cycle time: 취소된 task 제외로 더 정직한 통계

### 빌드
```bash
npm run build          # 1.0.18 .exe + portable 생성
```

---

## [1.0.17] Hotfix — 난이도 필드 ID 수정 (10017 → 11624) + 312건 난이도 일괄 등록

### 적용 버전
- 앱 버전: **1.0.17**
- 패치 반영일: 2026년 4월

### 발견된 버그
v1.0.10에서 도입한 store 필드 ID 시스템이 잘못된 값으로 설정돼 있었음:

| 항목 | 잘못된 값 | 실제 IGMU 값 |
|------|---------|------------|
| `JIRA_CONFIG.FIELDS.DIFFICULTY` | `customfield_10017` | **`customfield_11624`** |

**증상**:
- 프로젝트 통계의 분포 컬럼 작은 원이 모두 `-` (난이도 데이터 없음)
- DifficultyMiniPie 컴포넌트가 빈 fallback 표시
- 사용자가 어제 v1.0.16 분석 시 발견 — "어제 import한 313건 모두 난이도 비어있음"

**원인**:
실제 Jira /editmeta 응답에서 난이도 필드는:
```
customfield_11624 (option select: 상/중/하)
allowedValues: id=12151(상), id=12150(중), id=12152(하)
```

### 수정
- `jiraConfig.ts` `FIELDS.DIFFICULTY`: `customfield_10017` → `customfield_11624`
- 주석에 정확한 schema 명시 (option select + allowedValues)

### 동시 작업 — 312건 난이도 일괄 등록

`04_TROMBONE_API_FIRST` 코드 베이스 정밀 분석 + IGMU-538 자식 312건의 summary 휴리스틱 매칭 → 난이도 추정:

#### 분포
```
상 (Hard)  : 93건 (30%) — 외부 통합·실행·워크플로
중 (Medium): 29건 (9%)  — 매핑·다중 엔티티
하 (Easy)  : 190건 (61%) — 단순 CRUD
```

#### 도메인별 패턴
- 워크플로우 관리 (18건) — 100% 상 (워크플로우 엔진)
- 결과물 연계 (10건) — 100% 상 (외부 시스템 통합)
- 테스트 작업 (16건) — 75% 상 (Sonar/JUnit 통합)
- Nexus/ArgoCd/오브젝트스토리지/클러스터/툴체인 — 100% 하 (도구 관리 페이지)

#### 휴리스틱 룰
```
점수 = (Hard 키워드 × 3) + (Medium × 1.5) + (Easy × -1)
       + 동작 가중 (실행+1, 모니터링+1.5, 조회-0.5, 등록-0.3)
       + baseline 2

  ≥ 5점  → 상  (외부 통합·워크플로)
  3~4점  → 중  (매핑·다중 엔티티)
  ≤ 2점  → 하  (단순 CRUD)
```

#### 작성된 도구 (재사용 가능)
- `scripts/analyze-domain-complexity.cjs` — 04_TROMBONE_API_FIRST 도메인 라인·컨트롤러 카운트
- `scripts/estimate-difficulty.cjs` — IGMU-538 자식 휴리스틱 분류
- `scripts/update-difficulty.cjs` — Jira customfield_11624 일괄 업데이트

#### 검증
- 312/312 PUT 성공
- IGMU-1053 sample 검증: `{ value: '하', id: '12152' }` 정상 반영

### 영향
**v1.0.17 부터 자동 반영**:
- 프로젝트 통계 분포 컬럼 작은 원: 회색 `-` → **상/중/하 색상 파이차트** 정상 표시
- 난이도 별 색상: 상=빨강 / 중=주황 / 하=초록
- 진행 추이/예측 탭의 effort 추정에 난이도 출처 활성화 가능

### 빌드
```bash
npm run build          # 1.0.17 .exe + portable 생성
npm test               # vitest 298/298 통과
```

---

## [1.0.16] 진행 추이/예측 — 용어 단순화·일/월 단위·데이터 충족 현황 카드

### 적용 버전
- 앱 버전: **1.0.16** (package.json 기준)
- 패치 반영일: 2026년 4월

### 배경
사용자 피드백:
1. **인시(man-hour)·인일(man-day) 등 전문용어를 대중적 표현으로** 교체
2. **시간 단위 제거**, 일과 월 기준으로 표시
3. 예측 영역의 **기준·임계값을 정밀하게** 분석
4. **데이터가 어느 정도 쌓여야 표시 가능한지** 시각화

### 1. 용어 단순화 + 일/월 기준

#### `EffortReportCard.tsx`
- "총 공수 (mid) 인시" → **"추정 작업량 — N일"** + InfoTip에 "1 인일 = 1명 8시간" 명시
- "인일 환산" → **"월 환산 — N.NN 월"** (1 인월 = 영업일 20일 = 4주 × 5일)
- 출처 라벨: Worklog → **"작업 기록"**, Story Point → **"SP 점수"**, Cycle time → **"소요시간"** (모두 InfoTip에 영문 병기)
- "팀 N명 × 가동률 65%" → **"실작업 비율"** + 팀 일수·월수 둘 다 표시
- 시간 단위 (인시) UI에서 제거 — 내부 계산만 유지

#### `PerIssueEffortTable.tsx`
- "공수 (인시)" → **"추정 작업 (일)"** — 시간 → 일 환산 (8h = 1일)
- 0.1일 미만은 소수점 2자리, 그 이상은 1자리
- 출처 배지: WL → **"기록"**, SP, CT → **"추정"**, 난이도 (한글)

#### `EtaScenarioCard.tsx` + `ForecastGlossaryTip.tsx`
- "예측 불가" → **"데이터 부족"** (사용자 친화)
- Monte Carlo, Throughput, P50/P85/P95 등 모든 용어에 한글 + 영문 병기
- 글로서리 항목 추가: 변동성 (CV), 작업 일수 (인일)

### 2. 데이터 충족 현황 카드 (신규) — `DataReadinessCard.tsx`

**완료 예측 섹션 최상단**에 배치. 다음 항목을 진행 바로 시각화:

```
📊 데이터 충족 현황                        현재 등급: 낮음

✓ 활동 일수             ▮▮▮▮▮▮▮▮▯▯▯▯  12/30일
                        ✓ 낮음≥7  ✓ 중간≥14  · 높음≥30

⚠ 처리량 변동성 (CV)    ▮▮▮▮▮▮▮▯▯▯  0.65 (낮을수록 안정)
                        · 낮음≤0.8  · 중간≤0.5  · 높음≤0.3

✓ 유입/완료 비율        ▮▮▮▯▯▯▯▯▯▯  0.4 (낮을수록 마무리)

🎯 '중간' 등급 가능 조건
   활동 일수: 2일 더 (현재 12/14일)
   변동성: CV 0.65 → 0.5 이하 (안정적 처리 패턴 필요)
```

#### `confidence.ts` 신규 함수 — `computeReadiness(stats)`
- `metrics: ReadinessMetric[]` — 활동일·CV·scope 3개 진행 바
- `nextRequirements: NextLevelRequirement[]` — 다음 등급까지 필요한 조건 + "현재 N/M, X 더 필요" 친화 텍스트
- `currentLevel` 표시 + 임계값 마커

### 3. 임계값 정밀 분석 결과

| 등급 | 활동일 | CV (변동성) | Scope (유입/완료) | UI 분기 |
|------|--------|-----------|----------------|------|
| 데이터 부족 | < 7일 OR | — | OR > 1.5x | 단일 ETA / 범위 / 분포 모두 숨김 |
| 낮음 | ≥ 7일 | > 0.5 OR > 0.8 | ≤ 1.5 | 범위만 표시 |
| 중간 | ≥ 14일 | ≤ 0.5 | ≤ 1.5 | 단일 ETA + 범위 표시 |
| 높음 | ≥ 30일 | < 0.3 | ≤ 1.5 | 모든 표시 |

### 데이터 모델 변경
`BacklogEffortReport` 타입 확장:
- `totalManDaysLow`, `totalManDaysHigh` — 일 단위 범위
- `totalManMonthsMid`, `totalManMonthsLow`, `totalManMonthsHigh` — 월 단위 범위
- `sourceMix[].manDays` — 출처별 일수 (기존 hours 그대로 유지)
- `teamCapacityAssumption.teamMonthsMid` — 팀 월 환산
- `BUSINESS_DAYS_PER_MONTH = 20` 상수 export

### 검증
- vitest 298/298 통과 (변경 없음 — 기존 테스트 유지)
- TypeScript strict, ESLint 에러 0

### 신규 파일
- `src/components/progress-trends/DataReadinessCard.tsx`

### 보호된 기존 기능
- 산식·임계값 (PREDICTION 설정) 변경 없음 — 표시 라벨만 변경
- 시간(인시) 내부 계산은 그대로 — 재사용 가능
- Monte Carlo·신뢰도 산정 로직 영향 없음

### 빌드
```bash
npm run build          # 1.0.16 .exe + portable 생성
```

---

## [1.0.15] 서브담당자 인라인 sub-row + KPI 탭 협업 평가

### 적용 버전
- 앱 버전: **1.0.15** (package.json 기준)
- 패치 반영일: 2026년 4월

### 배경
v1.0.14에서 펼침 토글 + "서브참여" 컬럼 + 카드형 펼침 영역으로 서브담당자를 표현했지만, 사용자 피드백에 따라 다음과 같이 변경:
- 펼침 토글 → **항상 표시 인라인 sub-row** ("담당자 아래 라인으로 목록")
- "서브" **라벨 배지** 부착 (보라색 chip)
- KPI 탭에도 **동일한 형식 적용** + 협업 가중 KPI로 **성과 평가** 가능

### 데이터 구조 재설계

#### `sub-assignee-utils.ts` 신규 함수
```ts
buildMainCollaborations(issues): Map<mainName, MainCollaboration[]>
```
- 메인 X의 task 중 서브가 등록된 것 → 서브 인원별 그룹
- `MainCollaboration { subKey, subDisplayName, sharedIssues }` — 메인 시점 협업 그래프
- 셀프 등록(메인=서브) 자동 무시
- 정렬: sharedIssues 건수 내림차순

#### `AssigneeStats` 단순화
- v1.0.14의 `subTasks·subPartners·subCoSubs` 제거
- 신규 `collaborations: MainCollaboration[]` — 메인 시점 협업 그래프

### UI 변경 — 프로젝트 통계 다이얼로그

#### 프로젝트 현황 탭 (담당자별 현황)
```
┌──────────────────┬─────┬──────┬──────┬──────┬──────┬...
│ 담당자            │ 분포 │ 전체 │ 완료 │ 진행 │ ...   │
├──────────────────┼─────┼──────┼──────┼──────┼──────┼...
│ 최준배            │ ●●  │ 12   │  8  │  3   │ ...   │
│ └─[서브] 강현      │      │ 가중 2.0│  3 │  -  │ ...   │ ← 4건 협업
│ └─[서브] 김태현    │      │ 가중 1.0│  1 │  -  │ ...   │ ← 2건 협업
│ 김휘령            │ ●●  │ 16   │  9  │  5   │ ...   │
│ └─[서브] 김성은    │      │ 가중 1.0│  2 │  -  │ ...   │
│ ...
```
- **메인 행**: 본인 메인 task 기반 KPI (단순 calculateKPI, 가중 X)
- **Sub-row**: 보라색 배경 + 들여쓰기 + `[서브]` 배지 + 협업 카운트 클릭 시 이슈 모달
- 펼침 토글·서브참여 컬럼 모두 제거 (v1.0.14에서)

#### KPI 탭 (담당자별 성과 분석)
```
┌──────────────────┬──────────┬──────────┬──────────┬...
│ 담당자            │ 종합 등급 │ 완료율    │ 준수율   │ ...
├──────────────────┼──────────┼──────────┼──────────┼...
│ 최준배            │ A (85점) │ A (90%)  │ A (95%)  │ ...
│ └─[서브] 강현 (4×0.5)│ S (95점)  │ S (100%) │ S (100%) │ 협업 KPI
│ └─[서브] 김태현 (2×0.5)│ B (80점) │ A (90%)  │ B (85%)  │ 협업 KPI
│ ...
```
- **메인 행 KPI**: 메인 본인 task만 (변경 없음 — 본인 책임 평가)
- **Sub-row KPI**: 메인 X와 함께한 task만의 가중 KPI (`calculateWeightedKPI({mainIssues:[], subIssues:sharedIssues, subWeight:0.5})`)
- 같은 sub 인원이 여러 메인 아래 다른 점수로 노출 → "이 페어로 일했을 때 그 사람의 성과 기여도" 평가 가능

### 설계 결정 (사용자 합의)
- **K-A 옵션**: sub-row 점수 = 메인 X와 함께한 task만의 협업 KPI ("이 페어 협업의 성과")
- **항상 표시**: 펼침 토글 X, 인라인 sub-row 자동 노출
- **셀프 등록 무시**: 메인=서브 같은 케이스(IGMU에서 2건 발견) 자동 필터링

### 정보 소스 명확화
- Jira UI 필드명: **'서브담당자'** (IGMU 표준 = `customfield_11482`)
- KPI 규칙 → 커스텀 필드 → "서브담당자" 입력에서 변경 가능
- fetch 시 `searchIssues`/`getIssuesForEpic`이 자동 포함하여 별도 조회 불필요

### 검증
- vitest 298/298 통과 (변경 없음 — 기존 테스트 유지)
- TypeScript strict 통과, ESLint 에러 0
- IGMU 실제 데이터 검증 (24개 협업 관계, 11명 메인)

### 보호된 기존 기능
- `calculateKPI` / `calculateWeightedKPI` 산식 변경 없음
- 메인 행 KPI는 메인 본인 task 기반 (성과 평가의 기본)
- 서브담당자 필드 미설정 시 v1.0.13과 완전 동일 동작
- KPI 탭 헤더·결함 컬럼 구조 변경 없음 (sub-row만 추가)

### 빌드
```bash
npm run build          # 1.0.15 .exe + portable 생성
```

---

## [1.0.14] 프로젝트 통계 — 서브담당자 가시화 + 가중 KPI (drill-down UI)

### 적용 버전
- 앱 버전: **1.0.14** (package.json 기준)
- 패치 반영일: 2026년 4월

### 배경
프로젝트 통계의 담당자별 테이블이 메인 담당자 1축만 표현해, 페어/협업 task의 보조 인원이 가시화되지 않았습니다. IGMU 데이터에서 `customfield_11482` (서브담당자) 가 24건 활용 중 (1명 17건, 2명 페어 7건). 사용자 결정에 따라:
- **A+B 하이브리드 UI**: 메인 행 좌측 ▶ 드릴다운 토글 + "서브참여" 컬럼
- **가중 KPI (sub weight 0.5)**: 서브 참여도 KPI 점수에 절반 반영

### 데이터 레이어 변경

| 파일 | 변경 |
|------|------|
| `src/config/jiraConfig.ts` | `FIELDS.SUB_ASSIGNEE = 'customfield_11482'` 추가 |
| `src/stores/kpiRulesStore.ts` | `fields.subAssignee` 필드 추가 + default |
| `src/lib/kpi-rules-resolver.ts` | `resolveFields().SUB_ASSIGNEE` 추가 |
| `src/api/jiraClient.ts` | `searchIssues` / `getIssuesForEpic` fields에 `customfield_11482` 포함 |

### 신규 모듈

#### `src/lib/sub-assignee-utils.ts`
- `SUB_ASSIGNEE_WEIGHT = 0.5` 상수 export
- `extractSubAssignees(issue)` — 다중 사용자 array 안전 평탄화 (BOM·null·중복 처리)
- `buildSubAssigneeMap(issues)` — `personKey → { issues, mainPartners, coSubs }` 매핑

#### `src/services/kpiService.ts` 확장
- 신규 `calculateWeightedKPI({ mainIssues, subIssues, subWeight })` 함수
- 가중 평균 산식: `((mainRate × mainKpi) + (subRate × subKpi × weight)) / (mainKpi + subKpi × weight)`
- `WeightedKpiMetrics` 타입 — `mainOnly` / `subOnly` / `appliedSubWeight` / `weightedTotalRaw` / `weightedCompletedRaw` 분해 표시

### UI 변경 — `src/components/project-stats-dialog.tsx`

#### 담당자별 테이블
- **새 컬럼**: ▶/▼ 펼침 토글 (서브 협업 0건이면 비활성)
- **새 컬럼**: "서브참여" — 보라색 배지로 건수 + 클릭 시 이슈 목록
- **신규 라벨**: `서브 전용` — 메인 담당 0건이지만 서브로만 참여한 인원
- **준수율**: 가중 KPI 기반 (메인 1.0 + 서브 0.5)
- **정렬**: 메인 + 서브×0.5 합계 기준

#### 펼침 영역 (드릴다운)
```
서브담당자로 참여한 이슈 N건 (가중 N×0.5점)
▸ 메인 담당자별 협업 횟수: [이찬웅 ×2] [최준배 ×1] ...
▸ 함께 서브로 참여한 동료: [강현 ×3] [김태현 ×3] ...
💡 KPI 점수는 메인(1.0) + 서브(0.5) 가중 평균 — 코칭 도구·성과 평가 X
```

### 설정 UI — `src/components/kpi-rules/JiraFieldsEditor.tsx`
- "서브담당자" 필드 ID 입력 추가 (커스텀 필드 ID 섹션)
- 빈 값이면 기능 비활성. 다른 프로젝트는 `customfield_11011`/`10913` 으로 변경 가능

### 검증
- **vitest 298/298 통과** (v1.0.13 279 + 신규 19)
  - `kpiService.test.ts` +6 (calculateWeightedKPI)
  - `sub-assignee-utils.test.ts` +13 (extract·buildMap·store override)
- TypeScript strict 통과, ESLint 에러 0

### 신규 파일 (3)
- `src/lib/sub-assignee-utils.ts`
- `src/lib/__tests__/sub-assignee-utils.test.ts`
- (kpiService.ts 확장만으로 처리)

### 보호된 기존 기능
- `calculateKPI` 단일 함수는 그대로 (가중 KPI는 별도 함수)
- Zustand persist 키 (`jira-dash-kpi-rules`) — 마이그레이션 없음
- `subAssignee` 필드 빈 값이면 v1.0.13 동작과 완전 동일 (drop-in 안전)
- 회고·예측 탭 / KPI 성과 탭 / 결함 KPI 탭 영향 없음

### 빌드
```bash
npm run build          # 1.0.14 .exe + portable 생성
```

---

## [1.0.13] Hotfix — jiraApi.getEpics가 KPI Rules Store의 dashboardProjectKey를 반영하지 않던 버그 수정

### 적용 버전
- 앱 버전: **1.0.13** (package.json 기준)
- 패치 반영일: 2026년 4월

### 문제
v1.0.10에서 KPI Rules Store에 `dashboardProjectKey` 필드를 추가하고 `dashboard.tsx`의 `useQuery` queryKey도 store 값을 구독하도록 변경했지만, **`queryFn: jiraApi.getEpics`** 는 그대로 두어 실제 API 호출은 여전히 `JIRA_CONFIG.DASHBOARD.PROJECT_KEY` (하드코딩 `IGMU`)로 이루어지는 상태였습니다.

→ 사용자가 설정 다이얼로그에서 dashboardProjectKey를 변경해도:
- queryKey는 새 값으로 invalidate됨 → 재요청 trigger
- 그러나 실제 fetch는 여전히 `IGMU` → 같은 결과 → 의도한 동작 안 됨

### 원인
- `jiraClient.ts`의 `getEpics()` 시그니처가 인자 없음 (`async (): Promise<JiraIssue[]>`)
- 내부에서 `JIRA_CONFIG.DASHBOARD?.PROJECT_KEY` 직접 참조

### 수정
1. **`getEpics`에 optional `projectKey` 파라미터 추가**:
   ```ts
   getEpics: async (projectKey?: string): Promise<JiraIssue[]> => {
       const pk = (projectKey ?? JIRA_CONFIG.DASHBOARD?.PROJECT_KEY ?? 'IGMU').trim();
       return fetchEpicsForProjectKey(pk);
   },
   ```
   → 인자 생략 시 기존 동작 유지 (하위 호환)

2. **`dashboard.tsx`의 queryFn에 store 값 명시 전달**:
   ```ts
   queryFn: () => jiraApi.getEpics(dashboardProjectKey),
   ```

### 검증
- TypeScript strict 통과
- vitest 279/279 통과
- 설정 → KPI 규칙 → `dashboardProjectKey: 'FO'` 변경 시 dashboard가 FO 프로젝트의 에픽 fetch (실측)

### 빌드
```bash
npm run build          # 1.0.13 .exe + portable 생성
```

---

## [1.0.12] 회고·예측 인사이트 강화 — 용어 글로서리 + 결함 심도 분석 + 담당자 프로파일

### 적용 버전
- 앱 버전: **1.0.12** (package.json 기준)
- 패치 반영일: 2026년 4월
- 기반: `docs/retrospective-insights-plan.md` (사용자 피드백 6건)

### 배경
회고·예측 섹션이 지표는 있으나 **"어떻게 읽어야 하는가"**와 **"다음에 무엇을 해야 하는가"**에 대한 안내가 부족했습니다. 본 패치는 용어 설명·심도 분석·자동 권고·담당자 프로파일을 추가하여 **개발자 개선을 위한 인사이트 도구**로 격상합니다.

### 설계 원칙 — 코칭 vs 평가
- 순위·등수 대신 **영역별 강·약점 매핑**
- 절대값 대신 **팀 중앙값 대비 상대 위치** (백분위)
- 낙인 용어 금지 ("D 등급", "평가") → **"권장·고려·기회 제공"**
- 자동 권고는 규칙 기반 투명성 + 구체 액션 포함

### Phase 1 — InfoTip 확대 (요청 1·2·4)

#### F1-1. 에픽 회고 담당자 테이블
- `EpicRetroCard.tsx` — 담당자/전체/완료/진행/대기/지연 **5개 컬럼 모두** InfoTip 부착
- 카운트 규칙(leaf task, filterLeafIssues), Jira statusCategory 매핑, 지연 정의 명시

#### F1-2. 완료 예측 섹션 용어 글로서리
- 신규 `ForecastGlossaryTip.tsx` — 6개 핵심 용어 설명 Popover
- CategorySection 헤더 옆 ❓ 아이콘 클릭 → Monte Carlo / Throughput / P50·P85·P95 / 3 시나리오 / Scope Ratio / Confidence / 영업일 한번에 확인
- `CategorySection`에 `titleAfter` prop 추가 (기타 섹션도 확장 가능)

#### F1-3. ETA 카드 시나리오별 InfoTip
- `EtaScenarioCard.tsx` — 3 시나리오(낙관·기준·병목) 각각 개별 툴팁
- "영업일" 옆 미니 InfoTip (주말·공휴일 제외 기준)
- 상단 "팀 ETA — 3 시나리오" 제목에 ETA 정의 툴팁
- 신뢰도 배지에도 4단계 분류 설명

### Phase 2 — 심각도 분포 UI 정리 (요청 5)

#### F2-1. `DefectPatternCard` 심각도 pill 형태
- 기존: `flex justify-between` 으로 이름↔카운트 양 끝 배치 (여백 과다)
- 신규: 색상 pill (이름·카운트 붙어 표시) + Critical/Major/Minor 색상 코딩
- 최대 4개 표시 + 나머지는 +N

#### F2-2. `src/lib/defect-severity-color.ts` 공용화
- EpicDefectCard·DefectPatternCard가 중복 정의하던 SEVERITY_COLOR를 헬퍼로 추출
- `severityColorClass(name)` / `severityWeight(name)` / `weightedSeverityScore(breakdown)` / `criticalPlusCount(breakdown)`

### Phase 3 — 결함 회고 심도 확장 (요청 3)

#### F3-1. `DefectStatsExtended` 타입 확장
기존 3필드(결함수·Density·심각도) → 신규 9필드:
- `typeBreakdown` — issuetype 분포
- `weeklyTrend` — 최근 12주 주간 추이
- `trendDirection` — improving/stable/worsening/insufficient
- `topAffectedPeople` — 집중 담당자 상위 3명
- `recommendations` — 자동 권고 최대 3건
- `densityVsTeamAvg` — 팀 평균 대비 델타

#### F3-2. `EpicDefectCard` 재설계
4개 메트릭 카드 → 6개 섹션:
1. 핵심 메트릭 (결함수·Density·팀대비·트렌드 — 4 타일)
2. 심각도 분포 pill
3. **타입 분포 pill** (버그/개선/보안 색상 구분)
4. **주간 추이 스파크라인** (12주 bar chart, 색상 강도)
5. **집중 담당자** (상위 3명 + 비율, 익명화 지원)
6. **자동 권장 액션** (최대 3건, 💡 아이콘)

#### F3-3. 권고 규칙 엔진 — `defectInsights.ts`
6개 규칙:
- R1: Critical/Blocker ≥ 3건 → RCA 세션 권장
- R2: 1인 집중 ≥ 50% → Pair programming 고려
- R3: 트렌드 악화 → QA 체크리스트·회귀 테스트 보강
- R4: 트렌드 개선 → 프로세스 유지·확산
- R5: 팀 평균 +5%p 초과 → 요구사항·설계 리뷰 강화
- R6: 타입 편향 ≥ 70% → 자동화 테스트 투자

`classifyTrend` — 최근 4주 vs 이전 4주 ±30% 경계로 4단계 분류.

### Phase 4 — 담당자별 결함 인사이트 (요청 6)

#### F4-1. `developerInsights.ts` 엔진
- `computeTeamBaseline` — 팀 중앙값 (결함율·cycle time)
- `analyzeDeveloperProfile` — 강점 3규칙(S1~S3) + 개선점 3규칙(I1~I3)
- **페르소나 분류** (5종):
  - `mentor` — 강점 2+, 개선 0 (리뷰어·멘토 적합)
  - `balanced` — 강점·개선 1개씩
  - `specialized` — 특정 타입 강함
  - `needs-support` — 개선점 2+ (pair programming 기회)
  - `new-joiner` — 담당 task < 5 (표본 부족)

#### F4-2. `DefectPatternCard` 드릴다운 UI
- 행 클릭 시 펼침: **팀 내 위치 / 강점 / 개선 기회 3열**
- 팀 백분위 + 심각도 가중 점수 + 주력 타입 표시
- 프로파일 배지 (각 페르소나 색상)
- 펼침 영역 하단에 프로파일 설명 + "코칭 도구 · 성과 평가 X" 재강조

### 인프라
- **vitest 279건 통과** (v1.0.11 251 + 신규 28)
  - `defectInsights.test.ts` 16 케이스
  - `developerInsights.test.ts` 12 케이스
- TypeScript strict 에러 0, ESLint 에러 0
- 신규 파일 5개:
  - `src/lib/defect-severity-color.ts`
  - `src/services/retrospective/defectInsights.ts`
  - `src/services/retrospective/developerInsights.ts`
  - `src/services/retrospective/__tests__/defectInsights.test.ts`
  - `src/services/retrospective/__tests__/developerInsights.test.ts`
  - `src/components/progress-trends/ForecastGlossaryTip.tsx`

### 보호된 기존 기능 (변경 없음)
- `calculateKPI` 산식
- 익명화 모드 (외부 공유)
- 프로젝트 현황 탭·KPI 탭 UI
- 다중 에픽 비교·개발자 강점 매트릭스 (데이터 소스만 확장)

### 빌드
```bash
npm run build          # 1.0.12 .exe + portable 생성
npm test               # vitest 279 케이스 통과
```

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
