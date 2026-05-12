/**
 * v1.0.32: AI 개발 도구 활용 시 공수 절감 시뮬레이션.
 *
 * 절감률 매트릭스 = 이슈 카테고리(타입) × 난이도 보정.
 * 사용자가 슬라이더로 평균 시나리오 절감률 조정 가능 (보수/낙관은 ±10%pt 자동).
 *
 * 정직성 원칙 (Tier 2 유지):
 *   - 백로그 100건 미만 또는 worklog 데이터 없으면 confidence 'low'
 *   - 수치는 추정. UI에서 "업계 평균 기준 ±20% 변동 가능" 명시
 */

import type { BacklogEffortReport, IssueEffortPrediction } from './types';
import type {
    AiSavingsScenario,
    IssueCategory,
    AiSavingsConfig,
    AiSavingsReport,
    IssueAiSavings,
    ConfidenceLevel,
} from './types';

/**
 * 카테고리 라벨 (UI 표시용).
 */
export const CATEGORY_LABEL: Record<IssueCategory, string> = {
    story: 'Story (신규 개발)',
    bug: 'Bug (수정)',
    subtask: 'Sub-task (작업 분할)',
    test: 'Test (테스트)',
    doc: 'Documentation (문서)',
    default: '기타',
};

/**
 * v1.0.46 (M7): 카테고리 매칭 키워드 (이슈 타입 이름에서 검색).
 *
 * 검사 순서가 중요 (위에서 아래로):
 *   1. test  — 'test'는 'subtask'·'task'에 포함될 수 있어 먼저
 *   2. doc
 *   3. bug
 *   4. subtask  — 'subtask'가 'task'에 포함되므로 task보다 먼저
 *   5. story    — 마지막 (task, 할 일이 가장 일반적)
 *
 * 사용자 정의 키워드를 추가하려면 `aiSavingsConfigStore.categoryKeywords` 확장.
 * default(fallback)는 키워드 없이 매칭 안 된 경우.
 */
export type CategoryKeywords = Record<Exclude<IssueCategory, 'default'>, string[]>;

export const DEFAULT_CATEGORY_KEYWORDS: CategoryKeywords = {
    test:    ['test', '테스트', 'qa'],
    doc:     ['doc', '문서', 'manual'],
    bug:     ['bug', '결함', 'defect', 'error'],
    subtask: ['sub', '하위'],
    story:   ['story', '스토리', 'task', '할'],
};

/**
 * 카테고리별 평균 시나리오 기준 절감률 (0~1).
 * 업계 데이터 기반 (GitHub Copilot 2023 / 사내 보수적 평균):
 *   - Story:    35% (Copilot 연구 26~46%)
 *   - Bug:      25% (디버깅은 도메인 이해 필요 → 보수적)
 *   - Sub-task: 40% (정형화된 작업 多)
 *   - Test:     50% (AI 도구 강점 영역)
 *   - Doc:      45% (자연어 생성 강점)
 *   - default:  30% (보수적 fallback)
 */
export const DEFAULT_REDUCTION_BY_CATEGORY: Record<IssueCategory, number> = {
    story:   0.35,
    bug:     0.25,
    subtask: 0.40,
    test:    0.50,
    doc:     0.45,
    default: 0.30,
};

/**
 * 난이도 보정 (라벨별 곱셈 계수).
 * - 상: × 0.7 (복잡한 알고리즘·도메인 — AI 도움 ↓)
 * - 중: × 1.0 (기준)
 * - 하: × 1.2 (boilerplate·CRUD — AI 도움 ↑)
 *
 * 한계: 절감률 80% 초과 시 cap (지나친 낙관 방지).
 */
export const DEFAULT_DIFFICULTY_MULTIPLIER: Record<string, number> = {
    '상': 0.7, 'High': 0.7, '높음': 0.7, '어려움': 0.7,
    '중': 1.0, 'Medium': 1.0, '보통': 1.0, '중간': 1.0,
    '하': 1.2, 'Low': 1.2, '낮음': 1.2, '쉬움': 1.2,
};

/** 시나리오 보정 — 평균 대비 ±10%pt */
const SCENARIO_DELTA: Record<AiSavingsScenario, number> = {
    conservative: -0.10,
    average:       0.00,
    optimistic:   +0.15,  // 낙관은 평균 +15%pt (변동성 ↑)
};

/** 최대 절감률 cap (지나친 낙관 방지) */
const MAX_REDUCTION = 0.80;

/** 기본 사용자 설정 */
export const DEFAULT_AI_SAVINGS_CONFIG: AiSavingsConfig = {
    reductionByCategory: { ...DEFAULT_REDUCTION_BY_CATEGORY },
    difficultyMultiplier: { ...DEFAULT_DIFFICULTY_MULTIPLIER },
};

/**
 * 이슈 타입 이름 → 카테고리 매핑.
 * Jira 한글/영어 + 일반 변형 수용.
 *
 * v1.0.46 (M7): customKeywords 옵션 추가 — 사용자 정의 매핑 (커스텀 이슈 타입 지원).
 *   undefined 시 DEFAULT_CATEGORY_KEYWORDS 사용 (기존 동작 유지).
 *   다른 키워드 시 그것만 사용 (replace, not merge).
 *
 * 검사 순서: test > doc > bug > subtask > story (CategoryKeywords 정의 순서)
 */
export function categorizeIssue(
    typeName: string | undefined,
    customKeywords?: CategoryKeywords
): IssueCategory {
    if (!typeName) return 'default';
    const t = typeName.toLowerCase().trim();
    const kw = customKeywords ?? DEFAULT_CATEGORY_KEYWORDS;

    // 검사 순서: 정의된 객체의 키 순서 (test → doc → bug → subtask → story)
    const order: Array<Exclude<IssueCategory, 'default'>> = ['test', 'doc', 'bug', 'subtask', 'story'];
    for (const cat of order) {
        const keywords = kw[cat] ?? [];
        if (keywords.some((k) => t.includes(k.toLowerCase()))) return cat;
    }
    return 'default';
}

/**
 * 이슈 단위 절감 산정.
 * 적용된 절감률 = base × difficulty multiplier (cap 80%).
 *
 * v1.0.46 (M7): customKeywords 옵션 — 카테고리 매칭 키워드 사용자 정의.
 */
export function calculateIssueSavings(
    prediction: IssueEffortPrediction,
    scenario: AiSavingsScenario,
    config: AiSavingsConfig = DEFAULT_AI_SAVINGS_CONFIG,
    customKeywords?: CategoryKeywords
): IssueAiSavings {
    const category = categorizeIssue(prediction.meta?.issueTypeName, customKeywords);
    const baseReduction = (config.reductionByCategory[category] ?? DEFAULT_REDUCTION_BY_CATEGORY[category])
        + SCENARIO_DELTA[scenario];

    const diffLabel = prediction.meta?.difficultyLabel;
    const diffMultiplier = diffLabel != null
        ? (config.difficultyMultiplier[diffLabel] ?? 1.0)
        : 1.0;

    // base × multiplier, cap [0, 0.80]
    const applied = Math.max(0, Math.min(baseReduction * diffMultiplier, MAX_REDUCTION));
    const saved = prediction.hours * applied;
    const after = prediction.hours - saved;

    return {
        issueKey: prediction.issueKey,
        summary: prediction.summary,
        category,
        baseHours: prediction.hours,
        appliedReduction: +applied.toFixed(3),
        savedHours: +saved.toFixed(2),
        afterHours: +after.toFixed(2),
    };
}

/**
 * 백로그 전체 AI 절감 보고서.
 * 3 시나리오 + 카테고리별 분해 + Top 5 효과 이슈.
 */
export function aggregateAiSavings(
    report: BacklogEffortReport,
    config: AiSavingsConfig = DEFAULT_AI_SAVINGS_CONFIG,
    options: { teamHeadcount?: number; utilization?: number; categoryKeywords?: CategoryKeywords } = {}
): AiSavingsReport {
    const headcount = options.teamHeadcount ?? report.teamCapacityAssumption.headcount;
    const utilization = options.utilization ?? report.teamCapacityAssumption.utilization;

    // 시나리오별 산정
    const scenarios: Record<AiSavingsScenario, AiSavingsReport['scenarios'][AiSavingsScenario]> = {
        conservative: { avgReductionPct: 0, savedManDaysMid: 0, afterManDaysMid: 0, afterManMonthsMid: 0, afterTeamDays: 0 },
        average:      { avgReductionPct: 0, savedManDaysMid: 0, afterManDaysMid: 0, afterManMonthsMid: 0, afterTeamDays: 0 },
        optimistic:   { avgReductionPct: 0, savedManDaysMid: 0, afterManDaysMid: 0, afterManMonthsMid: 0, afterTeamDays: 0 },
    };

    const customKeywords = options.categoryKeywords;
    (['conservative', 'average', 'optimistic'] as AiSavingsScenario[]).forEach((scenario) => {
        let totalSavedHours = 0;
        let totalBaseHours = 0;
        report.perIssue.forEach((p) => {
            const s = calculateIssueSavings(p, scenario, config, customKeywords);
            totalSavedHours += s.savedHours;
            totalBaseHours += s.baseHours;
        });
        const savedManDays = totalSavedHours / 8;
        const afterManDays = (totalBaseHours - totalSavedHours) / 8;
        const afterTeamDays = afterManDays / Math.max(1, headcount * utilization);
        scenarios[scenario] = {
            avgReductionPct: totalBaseHours > 0 ? +(100 * totalSavedHours / totalBaseHours).toFixed(1) : 0,
            savedManDaysMid: +savedManDays.toFixed(1),
            afterManDaysMid: +afterManDays.toFixed(1),
            afterManMonthsMid: +(afterManDays / 20).toFixed(2),
            afterTeamDays: +afterTeamDays.toFixed(1),
        };
    });

    // 카테고리별 분해 (평균 시나리오 기준)
    const categoryMap = new Map<IssueCategory, { count: number; baseHours: number; savedHours: number }>();
    const allAvgSavings: IssueAiSavings[] = [];
    report.perIssue.forEach((p) => {
        const s = calculateIssueSavings(p, 'average', config, customKeywords);
        allAvgSavings.push(s);
        const prev = categoryMap.get(s.category) ?? { count: 0, baseHours: 0, savedHours: 0 };
        prev.count++;
        prev.baseHours += s.baseHours;
        prev.savedHours += s.savedHours;
        categoryMap.set(s.category, prev);
    });

    const byCategory = Array.from(categoryMap.entries())
        .map(([category, v]) => ({
            category,
            label: CATEGORY_LABEL[category],
            count: v.count,
            baseManDays: +(v.baseHours / 8).toFixed(1),
            savedManDays: +(v.savedHours / 8).toFixed(1),
            afterManDays: +((v.baseHours - v.savedHours) / 8).toFixed(1),
            reductionPct: v.baseHours > 0 ? +(100 * v.savedHours / v.baseHours).toFixed(1) : 0,
        }))
        .sort((a, b) => b.savedManDays - a.savedManDays);

    // Top 5 효과 이슈
    const topImpactIssues = [...allAvgSavings]
        .sort((a, b) => b.savedHours - a.savedHours)
        .slice(0, 5);

    // 신뢰도 — worklog 데이터 비중 + 백로그 크기 기준
    const confidence: ConfidenceLevel = (() => {
        if (report.perIssue.length < 10) return 'unreliable';
        const wlShare = report.sourceMix.find((s) => s.source === 'worklog')?.count ?? 0;
        const ratio = wlShare / report.perIssue.length;
        if (report.perIssue.length < 100) {
            // 작은 백로그 — 신뢰도 ↓
            return ratio >= 0.5 ? 'medium' : 'low';
        }
        if (ratio >= 0.5) return 'high';
        if (ratio >= 0.3) return 'medium';
        return 'low';
    })();

    return {
        scenarios,
        byCategory,
        topImpactIssues,
        config,
        confidence,
    };
}
