import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BookOpen } from 'lucide-react';
import React from 'react';

export function MethodologyDialog() {
    const [open, setOpen] = React.useState(false);
    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <BookOpen className="h-3.5 w-3.5 mr-1" />
                방법론 보기
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>예측 모델 방법론</DialogTitle>
                        <DialogDescription>
                            본 화면이 답하는 질문, 사용한 모델, 가정과 한계를 정직하게 안내합니다.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 text-sm text-slate-700 mt-2">
                        <section>
                            <h3 className="font-semibold text-slate-800 mb-1">1. 예측 모델 — Monte Carlo Throughput</h3>
                            <p>
                                과거 일별 완료 건수에서 무작위로 하루치를 뽑아 잔여가 0이 될 때까지 반복.
                                10,000번 시뮬레이션 후 결과 분포에서 P50/P85/P95 추출. 분포 가정이 없는 robust 방법.
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                                참고: Daniel Vacanti — When Will It Be Done?, Troy Magennis — Forecaster
                            </p>
                        </section>
                        <section>
                            <h3 className="font-semibold text-slate-800 mb-1">2. 3 시나리오 ETA</h3>
                            <ul className="list-disc pl-5 space-y-0.5">
                                <li><strong>낙관</strong>: 모든 일이 누구에게나 자유롭게 재할당된다는 가정 (비현실적)</li>
                                <li><strong>기준 ★</strong>: 현재 할당 유지. 최대 개인 ETA = 팀 ETA</li>
                                <li><strong>병목</strong>: ETA가 가장 큰 인원 — 일정 위험 신호</li>
                            </ul>
                        </section>
                        <section>
                            <h3 className="font-semibold text-slate-800 mb-1">3. 공수 추정 — Hybrid</h3>
                            <p>이슈마다 사용 가능한 가장 신뢰도 높은 데이터를 자동 선택:</p>
                            <ol className="list-decimal pl-5 space-y-0.5 mt-1">
                                <li>Worklog (이미 기록된 시간) — 가장 정확</li>
                                <li>Story Point × 평균 시간 — 커버리지 70% 이상일 때만</li>
                                <li>난이도별 평균 — 분류 있을 때</li>
                                <li>Cycle time fallback — 최후 수단</li>
                            </ol>
                        </section>
                        <section>
                            <h3 className="font-semibold text-slate-800 mb-1">4. 신뢰도 등급</h3>
                            <p>활동일·CV·Scope ratio에 따라 4단계로 분류. 신뢰도가 낮으면 단일 날짜를 표시하지 않습니다 (정직성 원칙).</p>
                        </section>
                        <section>
                            <h3 className="font-semibold text-slate-800 mb-1">5. 한계와 가정</h3>
                            <ul className="list-disc pl-5 space-y-0.5">
                                <li>주말 + 한국 공휴일 제외 (영업일 기준)</li>
                                <li>휴가/병가 정보 없음 — 활동 일수로 추정</li>
                                <li>도메인 specialization (백/프) 미반영</li>
                                <li>팀 인원 변동 미반영 — 신규 합류 인원은 30일 미만이면 confidence=low</li>
                                <li>Scope creep (신규 유입) 보정 ON: ETA가 매주 후퇴할 수 있음</li>
                            </ul>
                        </section>
                        <section>
                            <h3 className="font-semibold text-slate-800 mb-1">6. 정직성 원칙</h3>
                            <p>
                                정확한 단일 날짜는 거짓말. 범위가 진실. 확률 분포가 더 정직한 진실. 본 화면은 불확실성을 숨기지
                                않고 명시합니다.
                            </p>
                        </section>
                        <section className="text-xs text-slate-500 pt-2 border-t border-slate-200">
                            상세 분석: <code>docs/progress-prediction-analysis.md</code>
                        </section>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
