export const JIRA_CONFIG = {
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
    }
};
