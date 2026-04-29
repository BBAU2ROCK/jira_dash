export const JIRA_CONFIG = {
    /** 대시보드 사이드바 에픽 JQL (프로젝트·유형은 인스턴스에 맞게 수정) */
    DASHBOARD: {
        PROJECT_KEY: 'IGMU',
    },
    /** 진행 추이/예측 탭에서 선택 가능한 프로젝트 키 목록.
     *  사용자 환경에 맞게 수정. ProjectSelector 드롭다운에 표시됨.
     *  참고: docs/progress-prediction-data-fitness.md (활성도 측정 결과) */
    PROJECT_KEYS: ['IGMU', 'IPCON', 'REQ', 'CTS', 'TPS', 'DXD', 'OKTR'] as const,
    FIELDS: {
        STORY_POINT: 'customfield_10016',
        PLANNED_START: 'customfield_11481',
        ACTUAL_START: 'customfield_11484',
        ACTUAL_DONE: 'customfield_11485',
        /**
         * 난이도 (option select: 상/중/하).
         * v1.0.17 fix: customfield_10017 → customfield_11624 (실제 IGMU 인스턴스 값).
         * /editmeta로 확인된 정확한 ID. KPI 규칙에서 변경 가능.
         */
        DIFFICULTY: 'customfield_11624',
        /**
         * v1.0.14: 서브담당자 (다중 사용자 array). 협업·페어 프로그래밍에서 보조 인원 표시.
         *
         * Jira UI 필드명: **'서브담당자'** (띄어쓰기 없음, IGMU 프로젝트 표준).
         * IGMU 프로젝트 = `customfield_11482`.
         * 동일 이름의 변형 필드: `customfield_11011`(서브담당자), `customfield_10913`(서브 담당자, 띄어쓰기 있음) — 다른 프로젝트에서 사용될 수 있음.
         * 변경하려면 KPI 규칙 → 커스텀 필드 → "서브담당자" 입력란.
         */
        SUB_ASSIGNEE: 'customfield_11482',
    },
    LABELS: {
        AGREED_DELAY: 'agreed-delay', // Label to mark issues as agreed delay
        VERIFICATION_DELAY: 'verification-delay',
    },
    /**
     * 프로젝트 통계·KPI에서 분류할 상태 이름 (Jira status.name과 일치).
     *
     * v1.0.18: REJECTED 추가.
     *   - CANCELLED/REJECTED: statusCategory='done'이라도 KPI 분모·분자에서 제외
     *     (agreed-delay 라벨과 동일한 처리. 성과 평가 제외)
     *   - ON_HOLD: 별도 카운트 (보류는 미완료지만 활성도 아님)
     */
    STATUS_NAMES: {
        ON_HOLD: '보류',
        CANCELLED: '취소',
        REJECTED: '반려',
    },
    /** 이번주 시작 요일 — 1 = 월요일 (한국 비즈니스 표준) */
    WEEK_STARTS_ON: 1 as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    /** 한국 공휴일 (영업일 계산용). 매년 갱신 필요. */
    KOREAN_HOLIDAYS_2026: [
        '2026-01-01', // 신정
        '2026-02-16', '2026-02-17', '2026-02-18', // 설날
        '2026-03-01', // 삼일절
        '2026-05-05', // 어린이날
        '2026-05-25', // 부처님오신날
        '2026-06-06', // 현충일
        '2026-08-15', // 광복절
        '2026-09-24', '2026-09-25', '2026-09-26', // 추석
        '2026-10-03', // 개천절
        '2026-10-09', // 한글날
        '2026-12-25', // 성탄절
    ] as const,
    /** 진행 추이/예측 기능 설정 (docs/progress-prediction-analysis.md §22) */
    PREDICTION: {
        /** 처리량 통계 참조 기간 (일) */
        DEFAULT_HISTORY_DAYS: 30,
        /** Monte Carlo 시뮬레이션 횟수 */
        MONTE_CARLO_TRIALS: 10_000,
        /** Monte Carlo 단일 trial 최대 일수 (안전장치) */
        MONTE_CARLO_MAX_DAYS: 365,
        /** 팀 평균 가동률 (effective utilization) */
        DEFAULT_UTILIZATION: 0.65,
        /** 이 비율 이상 격차 시 ETA-공수 경고 */
        ETA_EFFORT_GAP_THRESHOLD: 0.30,
        /** 이 미만이면 SP 모드 자동 비활성 */
        SP_COVERAGE_THRESHOLD: 0.70,
        /** 이 미만이면 worklog 모드 자동 비활성 */
        WORKLOG_COVERAGE_THRESHOLD: 0.30,
        /** 이 미만 활동 일수면 confidence='unreliable' */
        MIN_ACTIVE_DAYS_RELIABLE: 7,
        /** 이상 활동 일수면 confidence 'high' 가능 */
        HIGH_CONFIDENCE_ACTIVE_DAYS: 30,
        /** CV 이 초과면 confidence='low' */
        LOW_CONFIDENCE_CV: 0.5,
        /** CV 이 초과면 confidence='unreliable' 후보 */
        UNRELIABLE_CV: 0.8,
        /** Scope 비율 이 초과면 'crisis' (백로그 발산) */
        SCOPE_CRISIS_RATIO: 1.5,
        /** Scope 비율 이 초과면 'growing' */
        SCOPE_GROWING_RATIO: 1.0,
    },
};
