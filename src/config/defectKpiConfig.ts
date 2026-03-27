/**
 * 결함 KPI — 필드 id는 런타임에 getFields()로 이름 매칭합니다.
 */
export const DEFECT_KPI_CONFIG = {
    /** 결함 이슈에서 개발자 식별용 커스텀 필드명 후보 (Jira 필드 name 과 일치) */
    WORKER_FIELD_NAMES: ['작업자'],
    /**
     * 결함 이슈「주요 세부 정보」의 심각도 — Jira **우선순위(priority)와 별개**인 커스텀 필드 name.
     * 코드는 priority를 심각도로 쓰지 않습니다. 이름 매칭 후에도 없으면 필드 API에서
     * 이름에「결함」「심각도」가 모두 포함된 필드를 보조 탐색합니다.
     */
    DEFECT_SEVERITY_FIELD_NAMES: ['결함 심각도', '결함심각도', 'Defect Severity', 'Defect severity'],
    /** 결함 프로젝트 키 (UI 힌트·검증용) */
    DEFECT_PROJECT_KEY_HINT: 'TQ',
    /**
     * TQ 프로젝트 이슈 보드 (Jira Software).
     * 에픽 목록은 동일 프로젝트에서 issuetype=에픽/Epic 검색으로 가져옵니다.
     */
    DEFECT_PROJECT_BOARD_URL:
        'https://okestro.atlassian.net/jira/software/c/projects/TQ/issues?jql=project%20%3D%20TQ%20ORDER%20BY%20created%20DESC',
    /**
     * 결함 심각도(커스텀 필드 옵션) 표시·정렬 순서 (높은 심각도를 위로).
     * 목록에 없는 이름은 알파벳 순으로 뒤에 붙습니다.
     */
    SEVERITY_DISPLAY_ORDER: [
        'Blocker',
        'Critical',
        'Highest',
        'Highest (P0)',
        'High',
        'Major',
        'Medium',
        'Normal',
        'Low',
        'Lowest',
        'Minor',
        'Trivial',
        '긴급',
        '상',
        '높음',
        '중간',
        '보통',
        '낮음',
        '최하',
        '하',
    ],
} as const;
