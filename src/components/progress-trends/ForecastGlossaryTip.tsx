import { HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * v1.0.12 F1-2: 완료 예측 섹션 용어 글로서리.
 *
 * Monte Carlo·Throughput·P50/P85/P95·Scope Ratio·Confidence 등의 용어를
 * 섹션 헤더 바로 옆에서 한번에 확인할 수 있도록 Popover로 제공.
 * 기존 MethodologyDialog는 더 상세한 방법론 — 여기는 용어 빠른 조회용.
 */
export function ForecastGlossaryTip() {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full p-0.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 transition-colors"
                    aria-label="예측 용어 설명"
                    title="예측 용어 설명"
                >
                    <HelpCircle className="h-4 w-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="bottom"
                align="start"
                className="w-[420px] max-w-[90vw] text-xs leading-relaxed"
            >
                <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-1.5">
                        예측 용어 빠른 설명
                    </h4>

                    <dl className="space-y-2">
                        <div>
                            <dt className="font-semibold text-indigo-700">Monte Carlo</dt>
                            <dd className="text-slate-600 ml-2">
                                무작위 샘플링 기법. 과거 일별 완료 건수에서 하루씩 무작위로 뽑아 잔여가 0이 될 때까지 반복.
                                10,000번 시뮬레이션 → 결과 분포로 P50/P85/P95 산출. 분포 가정 없는 robust 방법.
                            </dd>
                        </div>

                        <div>
                            <dt className="font-semibold text-indigo-700">Throughput (처리량)</dt>
                            <dd className="text-slate-600 ml-2">
                                일별 완료 건수. 팀 또는 개인의 "얼마나 빠르게 끝내는가" 지표. 변동성이 크면 신뢰도 하락.
                            </dd>
                        </div>

                        <div>
                            <dt className="font-semibold text-indigo-700">P50 / P85 / P95</dt>
                            <dd className="text-slate-600 ml-2">
                                시뮬레이션의 50/85/95%가 이 날짜까지 완료됨.
                                <span className="font-medium text-slate-800"> P85 = 권장 약속일</span> (15% 리스크 감수).
                                P50은 중앙값 (낙관적), P95는 안전선 (보수적).
                            </dd>
                        </div>

                        <div>
                            <dt className="font-semibold text-indigo-700">3 시나리오 ETA</dt>
                            <dd className="text-slate-600 ml-2">
                                <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                                    <li><strong>낙관</strong>: 재할당 가능 가정 (비현실적 — 하한선)</li>
                                    <li><strong>기준 ★</strong>: 현재 할당 유지 (약속 시 권장)</li>
                                    <li><strong>병목</strong>: 최대 개인 ETA — 지원 필요 신호</li>
                                </ul>
                            </dd>
                        </div>

                        <div>
                            <dt className="font-semibold text-indigo-700">Scope Ratio</dt>
                            <dd className="text-slate-600 ml-2">
                                신규 유입 ÷ 완료 비율.
                                <span className="text-red-700 font-medium"> 1.5x 초과 = 발산</span>,
                                <span className="text-amber-700 font-medium"> 1.0~1.5x = Scope creep</span>,
                                ~1.0x 안정, &lt;0.7 수렴(마무리).
                            </dd>
                        </div>

                        <div>
                            <dt className="font-semibold text-indigo-700">Confidence (신뢰도)</dt>
                            <dd className="text-slate-600 ml-2">
                                활동일·변동성(CV)·Scope 기반 4단계:
                                <span className="text-green-700"> high</span> ·
                                <span className="text-blue-700"> medium</span> ·
                                <span className="text-amber-700"> low</span> ·
                                <span className="text-red-700"> unreliable</span>.
                                <br />낮을수록 단일 날짜 숨김, 범위만 표시 (정직성 원칙).
                            </dd>
                        </div>

                        <div>
                            <dt className="font-semibold text-indigo-700">영업일</dt>
                            <dd className="text-slate-600 ml-2">
                                주말 + 한국 공휴일 제외. 휴가/병가는 미반영.
                            </dd>
                        </div>
                    </dl>

                    <p className="text-[11px] text-slate-400 pt-1.5 border-t border-slate-100">
                        전체 방법론·한계: 헤더의 <strong>"방법론 보기"</strong> 버튼 참조.
                    </p>
                </div>
            </PopoverContent>
        </Popover>
    );
}
