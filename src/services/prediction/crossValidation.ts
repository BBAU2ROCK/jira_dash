/**
 * ETA ↔ 공수 상호 검증.
 *
 * 분석 보고서 §6. 두 모델이 다른 답을 주면 가정 어디에 거짓이 있다는 신호.
 *
 * 검증 식:
 *   expected_eta = total_effort_hours / (team_size × 8h × utilization)
 *
 * 격차 해석:
 *   - 공수 ETA << MC ETA → 처리량 < 공수 비율 → 블로커·대기 시간 큼
 *   - 격차 < 30% → 두 모델 일치
 *   - 공수 ETA > MC ETA → worklog 미기록 가능성
 */

import { JIRA_CONFIG } from '@/config/jiraConfig';
import type { TeamForecast, BacklogEffortReport } from './types';
import { aggregateBacklogEffort } from './effortEstimation';
import type { JiraIssue } from '@/api/jiraClient';

const C = JIRA_CONFIG.PREDICTION;

export interface CrossValidationResult {
    /** 비교 가능 여부 (양쪽 모두 의미 있는 값) */
    available: boolean;
    /** 비교 불가 시 사유 */
    reason?: 'no-eta' | 'no-effort' | 'eta-unreliable' | 'effort-unreliable';
    teamEtaDays: number;
    effortEtaDays: number;
    /** 격차 비율 (0 ~ 1) */
    gapPct: number;
    /** 임계 초과 시 경고 메시지 */
    warning?: string;
    /** 격차 해석 */
    interpretation?: 'aligned' | 'process-inefficiency' | 'effort-undercount';
}

/**
 * 팀 forecast + 공수 보고서 통합 검증.
 */
export function crossValidate(team: TeamForecast, effort: BacklogEffortReport): CrossValidationResult {
    if (!team.realistic || team.realistic.confidence === 'unreliable') {
        return {
            available: false,
            reason: 'eta-unreliable',
            teamEtaDays: 0,
            effortEtaDays: 0,
            gapPct: 0,
        };
    }
    const teamEta = team.realistic.p85Days;
    const effortEta = effort.teamCapacityAssumption.teamDaysMid;
    if (teamEta <= 0) {
        return { available: false, reason: 'no-eta', teamEtaDays: 0, effortEtaDays: 0, gapPct: 0 };
    }
    if (effortEta <= 0) {
        return { available: false, reason: 'no-effort', teamEtaDays: teamEta, effortEtaDays: 0, gapPct: 0 };
    }

    const gap = Math.abs(teamEta - effortEta) / Math.max(teamEta, effortEta);
    const result: CrossValidationResult = {
        available: true,
        teamEtaDays: teamEta,
        effortEtaDays: effortEta,
        gapPct: +(gap * 100).toFixed(1),
    };

    if (gap <= C.ETA_EFFORT_GAP_THRESHOLD) {
        result.interpretation = 'aligned';
    } else if (effortEta < teamEta) {
        result.interpretation = 'process-inefficiency';
        result.warning = `처리량 ETA(${teamEta}일)가 공수 추정(${effortEta.toFixed(1)}일)보다 ${Math.round(gap * 100)}% 길음. 블로커·대기·리뷰 시간이 큼을 시사.`;
    } else {
        result.interpretation = 'effort-undercount';
        result.warning = `공수 추정(${effortEta.toFixed(1)}일)이 처리량 ETA(${teamEta}일)보다 큼. Worklog 미기록 또는 추정 과다 가능성.`;
    }

    return result;
}

/**
 * 한 번에 백로그 effort + cross-validation 수행 — UI 진입점.
 */
export function buildEffortReportWithValidation(
    allIssues: JiraIssue[],
    team: TeamForecast,
    options: { teamHeadcount?: number; utilization?: number } = {}
): { effort: BacklogEffortReport; validation: CrossValidationResult } {
    const headcount = options.teamHeadcount ?? Math.max(1, team.perAssignee.length);
    const teamEtaDays = team.realistic?.p85Days ?? 0;
    const effort = aggregateBacklogEffort(allIssues, {
        teamHeadcount: headcount,
        utilization: options.utilization,
        teamEtaDays,
    });
    const validation = crossValidate(team, effort);
    return { effort, validation };
}
