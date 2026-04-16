/**
 * K8: Jira 데이터 표시에 사용하는 공통 상수.
 *
 * 여러 파일에서 '미할당' / '미배정'이 섞여 있던 문제를 단일 상수로 해소.
 * 코드 변경 시 이 파일만 수정하면 전역 반영.
 */

/** 담당자가 지정되지 않은 이슈의 표시 레이블 (프로젝트 현황·결함 KPI 공통) */
export const UNASSIGNED_LABEL = '미배정' as const;

/** 이름을 알 수 없는 인원 (displayName이 없고 accountId만 있는 경우 등) */
export const UNKNOWN_LABEL = '(미상)' as const;

/** 알 수 없는 타입·필드 값 (예: issuetype이 누락된 경우) */
export const UNKNOWN_VALUE = '(unknown)' as const;
