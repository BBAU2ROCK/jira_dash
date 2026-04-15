import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { CrossValidationResult } from '@/services/prediction/crossValidation';

interface Props {
    validation: CrossValidationResult | null;
}

export function EtaEffortConsistency({ validation }: Props) {
    if (!validation) return null;
    if (!validation.available) {
        return (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                ETA-공수 비교 불가 ({validation.reason ?? '데이터 부족'})
            </div>
        );
    }
    if (validation.interpretation === 'aligned') {
        return (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-900 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
                <div>
                    <div className="font-semibold">ETA-공수 일관 ({validation.gapPct}% 격차)</div>
                    <div className="mt-0.5">
                        처리량 ETA <strong>{validation.teamEtaDays}일</strong> ↔ 공수 환산{' '}
                        <strong>{validation.effortEtaDays}일</strong>. 두 모델이 서로 검증.
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
                <div className="font-semibold">
                    ETA-공수 격차 {validation.gapPct}%{' '}
                    {validation.interpretation === 'process-inefficiency' ? '— 프로세스 비효율 의심' : '— 공수 누락 의심'}
                </div>
                <div className="mt-0.5">
                    처리량 ETA <strong>{validation.teamEtaDays}일</strong> ↔ 공수 환산{' '}
                    <strong>{validation.effortEtaDays}일</strong>
                </div>
                {validation.warning && <div className="mt-1">{validation.warning}</div>}
            </div>
        </div>
    );
}
