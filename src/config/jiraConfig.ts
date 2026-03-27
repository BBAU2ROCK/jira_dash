export const JIRA_CONFIG = {
    /** 대시보드 사이드바 에픽 JQL (프로젝트·유형은 인스턴스에 맞게 수정) */
    DASHBOARD: {
        PROJECT_KEY: 'IGMU',
    },
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
};
