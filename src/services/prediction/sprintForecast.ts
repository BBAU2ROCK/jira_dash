/**
 * Sprint Forecast — 활성 스프린트 종료일까지 완료 가능성.
 *
 * 분석 보고서 §11.2 / §D1.
 *
 * 산식:
 *   sprintRemainingDays = max(0, businessDays(today, sprint.endDate))
 *   p85SprintHits = (p85Days <= sprintRemainingDays)
 *
 * 결과 분류:
 *   - 'on-track'  : MC P85가 스프린트 종료일 이전 → 안전
 *   - 'at-risk'   : MC P85가 스프린트 종료일 이후, P50은 이전 → 50% 확률 위험
 *   - 'overrun'   : MC P50도 스프린트 종료일 이후 → 거의 확실한 지연
 */

import { businessDaysBetween } from '@/lib/date-utils';
import type { JiraSprint } from '@/api/jiraClient';
import type { ForecastResult } from './types';

export type SprintRiskStatus = 'on-track' | 'at-risk' | 'overrun' | 'no-data';

export interface SprintRisk {
    sprint: JiraSprint;
    sprintRemainingDays: number;
    forecastP50Days: number;
    forecastP85Days: number;
    status: SprintRiskStatus;
    /** 사용자 안내 메시지 */
    message: string;
}

export function classifySprintRisk(
    sprint: JiraSprint,
    forecast: ForecastResult,
    now = new Date()
): SprintRisk {
    const endDate = sprint.endDate ? new Date(sprint.endDate) : null;
    if (!endDate || isNaN(endDate.getTime())) {
        return {
            sprint,
            sprintRemainingDays: 0,
            forecastP50Days: forecast.p50Days,
            forecastP85Days: forecast.p85Days,
            status: 'no-data',
            message: '스프린트 종료일이 없습니다.',
        };
    }
    const sprintRemainingDays = Math.max(0, businessDaysBetween(now, endDate));
    const p50 = forecast.p50Days;
    const p85 = forecast.p85Days;

    let status: SprintRiskStatus;
    let message: string;
    if (p85 <= sprintRemainingDays) {
        status = 'on-track';
        message = `P85 (${p85}일) ≤ 스프린트 잔여 (${sprintRemainingDays}영업일) → 85% 확률로 종료일 안에 완료 가능.`;
    } else if (p50 <= sprintRemainingDays) {
        status = 'at-risk';
        message = `P50 (${p50}일) ≤ 잔여 (${sprintRemainingDays}일) < P85 (${p85}일) → 50% 확률은 안전, 약속하기 위험.`;
    } else {
        status = 'overrun';
        message = `P50 (${p50}일) > 잔여 (${sprintRemainingDays}일) → 거의 확실히 지연. 범위 축소·인력 보강 필요.`;
    }
    return {
        sprint,
        sprintRemainingDays,
        forecastP50Days: p50,
        forecastP85Days: p85,
        status,
        message,
    };
}
