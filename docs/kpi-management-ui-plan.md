# KPI 관리 UI — Level 4 구현 계획서

> **목적**: PM이 앱 내에서 직접 KPI 등급 기준·가중치·결함 등급을 편집. 매년 코드 배포 없이 규칙 변경.
> **공수**: 7~10일
> **선결**: Tier 3 + InfoTip 확대 완료 (현재)

---

## 1. 범위

### 관리 가능한 항목

| 항목 | 현재 위치 | 관리 UI |
|------|----------|---------|
| KPI 등급 기준 (S≥95, A≥90...) | kpiService.ts 하드코딩 | ✅ 슬라이더/입력 |
| 조기 보너스 기준 (10%→+1...) | kpiService.ts 하드코딩 | ✅ 편집 표 |
| 결함 등급 기준 (S≤5%...) | defect-kpi-utils.ts 하드코딩 | ✅ 편집 표 |
| 가중치 (완료율 50%+준수율 50%) | kpiService.ts 산식 안 | ✅ 비율 조정 |
| 라벨 (agreed-delay 등) | jiraConfig.ts | ✅ 텍스트 입력 |
| 상태 이름 (보류/취소) | jiraConfig.ts | ✅ 텍스트 입력 |
| 커스텀 필드 ID | jiraConfig.ts | ✅ 텍스트 입력 |
| 한국 공휴일 | date-holidays 자동 + 배열 | ⬜ 자동 (UI 불필요) |
| Prediction 임계값 | jiraConfig.ts | ✅ 고급 설정 |
| 프로젝트 키 | jiraConfig.ts | ✅ 텍스트 입력 |

### UI 위치
- 신규 탭 또는 설정 다이얼로그 안 "KPI 규칙 관리" 섹션
- 또는 독립 모달 (우상단 ⚙ → KPI 규칙)

---

## 2. 데이터 구조 — KPI 규칙 스키마

```typescript
export interface KpiRuleSet {
    version: string;          // '2026'
    label: string;            // '2026년 KPI 기준'
    activatedAt?: string;     // ISO timestamp
    
    // 등급 기준 (점수 → 등급)
    grades: {
        S: number;  // 95
        A: number;  // 90
        B: number;  // 80
        C: number;  // 70
    };
    
    // 가중치 (합 = 1.0)
    weights: {
        completion: number;   // 0.5
        compliance: number;   // 0.5
    };
    
    // 조기 보너스 (rate% → bonus 점수)
    earlyBonus: Array<{ minRate: number; bonus: number }>;
    
    // 결함 등급 (defect density % → 등급)
    defectGrades: {
        S: number;  // 5
        A: number;  // 10
        B: number;  // 15
        C: number;  // 20
    };
    
    // Jira 라벨/상태
    labels: {
        agreedDelay: string;       // 'agreed-delay'
        verificationDelay: string; // 'verification-delay'
    };
    statusNames: {
        onHold: string;    // '보류'
        cancelled: string; // '취소'
    };
    
    // 커스텀 필드 매핑
    fields: {
        storyPoint: string;    // 'customfield_10016'
        plannedStart: string;  // 'customfield_11481'
        actualStart: string;   // 'customfield_11484'
        actualDone: string;    // 'customfield_11485'
        difficulty: string;    // 'customfield_10017'
    };
    
    // 프로젝트 설정
    projectKeys: string[];     // ['IGMU', 'IPCON', ...]
    dashboardProjectKey: string; // 'IGMU'
    weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;  // 1 = 월요일
}
```

---

## 3. 저장소

### 옵션 A — localStorage (Zustand persist) ★ 권장
- 가장 단순, 서버 없이 작동
- 클라이언트 로컬 → 다른 PC 동기화 안 됨
- 초기값: 현재 jiraConfig.ts의 값을 default로
- Electron: userData에도 저장 가능

### 옵션 B — 서버 파일 (proxy-server.cjs의 /admin/kpi-rules)
- /admin/kpi-rules GET/POST 엔드포인트
- 서버 디스크에 JSON 저장
- 여러 사용자가 같은 프록시 사용하면 공유 가능

### 옵션 C — Jira Project Properties API
- Jira 프로젝트에 직접 저장 (`/rest/api/3/project/{key}/properties/kpi-rules`)
- Jira가 진짜 single source of truth
- 인증 필요, API 호출 추가

→ **권장: A (localStorage) + 내보내기/가져오기 JSON**. 사유: 서버리스 + 단순. 동기화 필요하면 JSON 파일 공유.

---

## 4. UI 설계

### 4.1 진입점
설정(⚙) 다이얼로그에 새 탭 "KPI 규칙" 추가. 또는 프로젝트 통계 다이얼로그에 5번째 탭.

### 4.2 섹션 구성

```
[KPI 규칙 관리]
┌──────────────────────────────────────────────────┐
│ 활성 버전: 2026  [새 버전 만들기] [JSON 가져오기] │
├──────────────────────────────────────────────────┤
│                                                    │
│ ━ 1. 등급 기준 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  S ≥ [95]%   A ≥ [90]%   B ≥ [80]%   C ≥ [70]% │
│  (슬라이더 또는 숫자 입력)                        │
│                                                    │
│ ━ 2. 가중치 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  완료율 [50]%  +  준수율 [50]%  = 100%            │
│  (합계 100% 강제)                                  │
│                                                    │
│ ━ 3. 조기 보너스 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  ≥ 50% → +5점                                      │
│  ≥ 40% → +4점                                      │
│  ≥ 30% → +3점  [행 추가] [행 삭제]                │
│  ...                                               │
│                                                    │
│ ━ 4. 결함 등급 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  S ≤ [5]%   A ≤ [10]%   B ≤ [15]%   C ≤ [20]%   │
│                                                    │
│ ━ 5. Jira 연결 설정 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  라벨: 합의지연 [agreed-delay]                     │
│        검증지연 [verification-delay]               │
│  상태: 보류 [보류]  취소 [취소]                    │
│                                                    │
│ ━ 6. 커스텀 필드 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  Story Point [customfield_10016]                   │
│  난이도       [customfield_10017]                  │
│  계획시작     [customfield_11481]                  │
│  ...                                               │
│                                                    │
│ ━ 7. 프로젝트 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  대시보드 PK: [IGMU]                               │
│  선택 가능: [IGMU, IPCON, REQ, ...]  [추가][삭제] │
│                                                    │
│ ━ 8. 고급 (예측 파라미터) ━━━━━━━━━━━━━━━━━━━━━━━ │
│  Monte Carlo trials: [10000]                       │
│  기본 가동률: [65]%                                │
│  ...                                               │
│                                                    │
├──────────────────────────────────────────────────┤
│  [JSON으로 내보내기]  [초기값으로 리셋]  [저장]    │
└──────────────────────────────────────────────────┘
```

---

## 5. 핵심 흐름

### 저장 시
1. 입력값 검증 (등급 순서: S > A > B > C, 가중치 합 = 100%, etc.)
2. Zustand persist → localStorage 저장
3. React Query 캐시 invalidate → 대시보드 즉시 반영
4. toast.success('KPI 규칙이 저장되었습니다')

### 로드 시
1. localStorage에서 KpiRuleSet 로드
2. 없으면 default (현재 jiraConfig.ts의 값)
3. kpiService / defect-kpi-utils가 store에서 규칙 읽어 동적 계산

### 버전 관리
- 새 버전 만들기 → 현재 규칙 복사 + version 변경
- 활성 버전 선택 → 즉시 반영
- 이전 버전은 JSON으로 내보내기 가능

---

## 6. 코드 변경 지점

### 신규 파일
```
src/stores/kpiRulesStore.ts       — Zustand persist (KpiRuleSet)
src/components/kpi-rules/
├── index.tsx                      — 관리 UI 진입점
├── GradeEditor.tsx                — 등급 기준 편집
├── WeightEditor.tsx               — 가중치 편집
├── EarlyBonusEditor.tsx           — 보너스 표 편집
├── DefectGradeEditor.tsx          — 결함 등급 편집
├── JiraFieldsEditor.tsx           — 필드·라벨·상태 편집
├── ProjectEditor.tsx              — 프로젝트 키 편집
├── PredictionConfigEditor.tsx     — 고급 파라미터
├── JsonImportExport.tsx           — JSON 가져오기/내보내기
└── RuleValidation.ts              — 검증 로직
```

### 수정 파일
```
src/services/kpiService.ts         — getGrade/getEarlyBonus → store 참조
src/lib/defect-kpi-utils.ts        — defectRateToGrade → store 참조
src/config/jiraConfig.ts           — default 값으로만 유지 (store 초기값)
src/services/prediction/confidence.ts — PREDICTION 임계값 → store 참조
src/components/jira-settings-dialog.tsx — 새 탭 "KPI 규칙" 추가
또는 src/components/project-stats-dialog.tsx — 5번째 탭
```

---

## 7. 일정

```
D1    kpiRulesStore + 타입 + default 초기값
D2    GradeEditor + WeightEditor + EarlyBonusEditor
D3    DefectGradeEditor + JiraFieldsEditor + ProjectEditor
D4    PredictionConfigEditor + JsonImportExport
D5    RuleValidation + 검증 로직 + 에러 처리
D6    kpiService → store 연동 + defect-kpi-utils 연동
D7    통합 테스트 + 기존 183 tests 호환 확인
D8    UI 다듬기 + 접근성 + InfoTip + 사용자 가이드
D9    빌드·검증·커밋 + 문서
```

---

## 8. 다음 액션

```
□ 본 계획서 검토
□ 저장소 방식 결정 (A: localStorage / B: 서버 / C: Jira)
□ UI 위치 결정 (설정 다이얼로그 탭 / 프로젝트 통계 5번째 탭)
□ Plan 모드 진입 → 구현 시작
```

---

**문서 끝.**
