/**
 * K12: Archive 복원 UI.
 *
 * kpiRulesStore.archive (최대 20개 이전 버전) 목록 표시 + 복원 버튼.
 * 복원 전 현재 규칙을 createVersion으로 자동 보존하여 사고 방지.
 */

import React from 'react';
import { toast } from 'sonner';
import { History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoTip } from '@/components/ui/info-tip';
import { useKpiRulesStore, validateRuleSet, type KpiRuleSet } from '@/stores/kpiRulesStore';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
    archive: KpiRuleSet[];
}

export function ArchiveList({ archive }: Props) {
    const queryClient = useQueryClient();
    const current = useKpiRulesStore((s) => s.rules);
    const importFromJson = useKpiRulesStore((s) => s.importFromJson);
    const createVersion = useKpiRulesStore((s) => s.createVersion);

    const handleRestore = (target: KpiRuleSet) => {
        // 복원 대상 검증 — K7 validateRuleSet 적용
        const errors = validateRuleSet(target);
        if (errors.length > 0) {
            toast.error(
                `복원 실패 (${errors.length}건): ${errors[0]}`
            );
            return;
        }

        const ok = window.confirm(
            `"${target.label}" (v${target.version})으로 복원하시겠습니까?\n\n` +
            `현재 규칙 "${current.label}" (v${current.version})은 새 아카이브로 자동 보존됩니다.`
        );
        if (!ok) return;

        // 1) 현재 규칙을 "복원 전 자동 백업"으로 archive에 밀어 넣기
        //    suffix는 current.updatedAt 해시 기반으로 pure하게 생성 (react-compiler 규칙 준수)
        const suffix = new Date(current.updatedAt).getTime().toString(36).slice(-5);
        createVersion(
            `${current.version}-backup-${suffix}`,
            `${current.label} (복원 전 백업)`
        );
        // 2) 대상 규칙으로 교체 — importFromJson (validate 내장)
        const importErrors = importFromJson(target);
        if (importErrors.length > 0) {
            toast.error(`복원 중 에러: ${importErrors[0]}`);
            return;
        }
        // 3) 캐시 무효화 → 대시보드 즉시 재계산
        queryClient.invalidateQueries();
        toast.success(`v${target.version}으로 복원되었습니다.`);
    };

    if (archive.length === 0) {
        return (
            <div className="text-xs text-slate-400 py-2">
                <History className="h-3.5 w-3.5 inline mr-1" />
                아카이브된 이전 버전이 없습니다. "새 버전" 버튼으로 새 KPI 규칙을 만들면 현재 규칙이 자동으로 아카이브됩니다.
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    <History className="h-4 w-4 text-slate-500" />
                    아카이브 이전 버전 ({archive.length})
                    <InfoTip>
                        "새 버전" 작성 시 또는 복원 시 현재 규칙이 자동 보관됩니다 (최대 20개). 복원 버튼으로 과거 규칙으로 되돌릴 수 있으며, 복원 직전의 규칙은 다시 아카이브됩니다.
                    </InfoTip>
                </div>
            </div>
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded">
                {archive.map((r, i) => (
                    <li
                        key={`${r.version}-${i}`}
                        className="flex items-center justify-between px-3 py-2 hover:bg-slate-50"
                    >
                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                                <span className="text-sm font-medium text-slate-800 truncate">
                                    {r.label}
                                </span>
                                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                                    v{r.version}
                                </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                                저장: {new Date(r.updatedAt).toLocaleString('ko-KR')}
                                <span className="mx-2 text-slate-300">|</span>
                                등급 S≥{r.grades.S} · 가중치 {Math.round(r.weights.completion * 100)}/{Math.round(r.weights.compliance * 100)} · 결함 S≤{r.defectGrades.S}%
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRestore(r)}
                            className="shrink-0 ml-3 h-7 px-2 text-xs"
                            title="이 규칙으로 복원"
                        >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            복원
                        </Button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
