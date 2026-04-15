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
        /** 난이도 (커스텀 필드 id는 Jira 인스턴스별로 다를 수 있음. 필요 시 변경) */
        DIFFICULTY: 'customfield_10017',
    },
    LABELS: {
        AGREED_DELAY: 'agreed-delay', // Label to mark issues as agreed delay
        VERIFICATION_DELAY: 'verification-delay',
    },
    /** 프로젝트 통계에서 보류·취소로 분류할 상태 이름 (Jira status.name과 일치) */
    STATUS_NAMES: {
        ON_HOLD: '보류',
        CANCELLED: '취소',
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
