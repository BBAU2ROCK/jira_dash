import React from 'react';
import { Save, AlertTriangle, CheckCircle2, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { InfoTip } from '@/components/ui/info-tip';
import { useKpiRulesStore, validateRuleSet, type KpiRuleSet } from '@/stores/kpiRulesStore';
import { GradeEditor } from './GradeEditor';
import { WeightEditor } from './WeightEditor';
import { EarlyBonusEditor } from './EarlyBonusEditor';
import { JiraFieldsEditor } from './JiraFieldsEditor';
import { ProjectEditor } from './ProjectEditor';
import { PredictionConfigEditor } from './PredictionConfigEditor';
import { JsonImportExport } from './JsonImportExport';
import { ArchiveList } from './ArchiveList';

/**
 * KPI 규칙 관리 UI — 설정 다이얼로그 안 탭으로 배치.
 *
 * PM이 직접 등급 기준·가중치·결함 등급·Jira 필드를 편집.
 * localStorage에 저장 → 대시보드 즉시 반영 (서버 재시작 불필요).
 */
export function KpiRulesManager() {
    const queryClient = useQueryClient();
    const rules = useKpiRulesStore((s) => s.rules);
    const archive = useKpiRulesStore((s) => s.archive);
    const updateRules = useKpiRulesStore((s) => s.updateRules);
    const createVersion = useKpiRulesStore((s) => s.createVersion);
    const resetToDefault = useKpiRulesStore((s) => s.resetToDefault);
    const importFromJson = useKpiRulesStore((s) => s.importFromJson);

    // 로컬 드래프트 (저장 전 편집용)
    const [draft, setDraft] = React.useState<KpiRuleSet>(rules);
    const [errors, setErrors] = React.useState<string[]>([]);

    // rules가 변경되면 draft 동기화 (외부 import 등)
    React.useEffect(() => {
        setDraft(rules);
    }, [rules]);

    const handleSave = () => {
        const validationErrors = validateRuleSet(draft);
        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            toast.error(`검증 실패: ${validationErrors.length}건`);
            return;
        }
        setErrors([]);
        updateRules(draft);
        // 모든 캐시 무효화 → KPI 점수 즉시 재계산
        queryClient.invalidateQueries();
        toast.success('KPI 규칙이 저장되었습니다 — 대시보드에 즉시 반영');
    };

    const handleNewVersion = () => {
        const year = new Date().getFullYear() + 1;
        const version = prompt('새 버전 이름:', String(year));
        if (!version) return;
        const label = prompt('설명:', `${version}년 KPI 기준`);
        createVersion(version, label ?? `${version}년 기준`);
        toast.success(`v${version} 생성 (이전 규칙 아카이브됨)`);
    };

    const isDirty = JSON.stringify(draft) !== JSON.stringify(rules);

    return (
        <div className="space-y-6 max-w-2xl">
            {/* 헤더: 버전 정보 + 저장 */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        KPI 규칙 관리
                        <InfoTip>PM이 매년 KPI 등급·가중치·결함 기준을 직접 편집. 저장 즉시 대시보드에 반영. JSON으로 내보내기/가져오기 가능.</InfoTip>
                    </h2>
                    <div className="text-xs text-slate-500 mt-0.5">
                        활성: <span className="font-mono font-semibold">v{draft.version}</span> · {draft.label}
                        {archive.length > 0 && (
                            <span className="ml-2 text-slate-400">
                                <History className="h-3 w-3 inline mr-0.5" />
                                아카이브 {archive.length}개
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleNewVersion}>
                        새 버전
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={!isDirty && errors.length === 0}
                        className={isDirty ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
                    >
                        <Save className="h-3.5 w-3.5 mr-1" />
                        {isDirty ? '변경사항 저장' : '저장됨'}
                    </Button>
                </div>
            </div>

            {/* 검증 에러 */}
            {errors.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <ul className="space-y-0.5 list-disc list-inside text-xs">
                            {errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                    </div>
                </div>
            )}

            {/* ━ 1. KPI 등급 기준 ━ */}
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <GradeEditor
                    title="KPI 등급 기준"
                    tip="총점이 이 값 이상이면 해당 등급. 95 이상 = S, 90 이상 = A ..."
                    grades={draft.grades}
                    onChange={(grades) => setDraft({ ...draft, grades })}
                />
            </section>

            {/* ━ 2. 가중치 ━ */}
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <WeightEditor
                    weights={draft.weights}
                    onChange={(weights) => setDraft({ ...draft, weights })}
                />
            </section>

            {/* ━ 3. 조기 보너스 ━ */}
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <EarlyBonusEditor
                    steps={draft.earlyBonus}
                    onChange={(earlyBonus) => setDraft({ ...draft, earlyBonus })}
                />
            </section>

            {/* ━ 4. 결함 등급 ━ */}
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <GradeEditor
                    title="결함 등급 기준"
                    tip="Defect Density가 이 값 이하이면 해당 등급. S ≤ 5%, A ≤ 10% ..."
                    grades={draft.defectGrades}
                    invertLabel
                    onChange={(defectGrades) => setDraft({ ...draft, defectGrades })}
                />
            </section>

            {/* ━ 5. Jira 연결 ━ */}
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-800 mb-3">Jira 연결 설정</div>
                <JiraFieldsEditor
                    labels={draft.labels}
                    statusNames={draft.statusNames}
                    fields={draft.fields}
                    onLabelsChange={(labels) => setDraft({ ...draft, labels })}
                    onStatusNamesChange={(statusNames) => setDraft({ ...draft, statusNames })}
                    onFieldsChange={(fields) => setDraft({ ...draft, fields })}
                />
            </section>

            {/* ━ 6. 프로젝트 ━ */}
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-800 mb-3">프로젝트 설정</div>
                <ProjectEditor
                    dashboardProjectKey={draft.dashboardProjectKey}
                    projectKeys={draft.projectKeys}
                    weekStartsOn={draft.weekStartsOn}
                    onDashboardKeyChange={(dashboardProjectKey) => setDraft({ ...draft, dashboardProjectKey })}
                    onProjectKeysChange={(projectKeys) => setDraft({ ...draft, projectKeys })}
                    onWeekStartsOnChange={(weekStartsOn) => setDraft({ ...draft, weekStartsOn: weekStartsOn as KpiRuleSet['weekStartsOn'] })}
                />
            </section>

            {/* ━ 7. 고급 (예측) ━ */}
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <PredictionConfigEditor
                    config={draft.prediction}
                    onChange={(prediction) => setDraft({ ...draft, prediction })}
                />
            </section>

            {/* ━ JSON + 리셋 ━ */}
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-slate-800">데이터 관리</div>
                    {isDirty && (
                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                            미저장 변경사항 있음
                        </span>
                    )}
                </div>
                <JsonImportExport
                    rules={draft}
                    onImport={(imported) => {
                        // K7: importFromJson이 검증 에러 배열 반환 — 실패 시 토스트 + 미적용
                        const importErrors = importFromJson(imported);
                        if (importErrors.length > 0) {
                            setErrors(importErrors);
                            toast.error(
                                `가져오기 실패 (${importErrors.length}건): ${importErrors[0]}`
                            );
                            return;
                        }
                        setDraft(imported);
                        setErrors([]);
                        toast.success('규칙셋을 가져왔습니다.');
                    }}
                    onReset={() => {
                        resetToDefault();
                        setDraft(useKpiRulesStore.getState().rules);
                        setErrors([]);
                    }}
                />
            </section>

            {/* ━ K12: 아카이브 복원 ━ */}
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <ArchiveList archive={archive} />
            </section>

            {/* 저장 상태 */}
            {!isDirty && (
                <div className="flex items-center gap-1.5 text-xs text-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    모든 변경이 저장되었습니다. 마지막 수정: {new Date(rules.updatedAt).toLocaleString('ko-KR')}
                </div>
            )}
        </div>
    );
}
