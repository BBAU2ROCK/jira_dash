import { TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { InfoTip } from '@/components/ui/info-tip';
import { getMonthlyEffortTrend } from '@/services/prediction/budgetEffortAnalysis';
import type { JiraIssue } from '@/api/jiraClient';

interface Props {
    issues: JiraIssue[];
    months?: number;
}

export function QuarterlyEffortTrendCard({ issues, months = 6 }: Props) {
    const trend = getMonthlyEffortTrend(issues, months);
    const hasData = trend.some((p) => p.completedIssues > 0);

    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    월별 공수 트렌드
                    <InfoTip>
                        <div className="space-y-2 max-w-sm">
                            <div className="font-semibold text-foreground text-sm">월별 공수 트렌드 — 최근 {months}개월</div>
                            <p className="text-muted-foreground">
                                과거 N개월 동안 완료된 이슈의 공수를 월별로 집계한 추이.
                                팀의 처리 능력 변화·번아웃·과부하 시기를 추적할 수 있음.
                            </p>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">📊 표시 항목</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li><span className="text-blue-600 font-medium">완료 이슈 수</span>: 해당 월에 완료된 leaf 이슈 카운트 (취소·반려 제외)</li>
                                    <li><span className="text-emerald-600 font-medium">Worklog 인일</span>: 실제 기록된 작업 시간 합계 (인일 환산)</li>
                                    <li><span className="text-amber-600 font-medium">평균 cycle time</span>: 이슈당 평균 created→done 시간 (시간 단위)</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">📐 산정 기준</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li>완료일 기준 = 실제완료일(customfield_11485) 우선, 없으면 resolutiondate</li>
                                    <li>월 시작일(startOfMonth)로 buckle</li>
                                    <li>worklog는 timespent 필드(초 단위) ÷ 3600 → 시간</li>
                                    <li>인일 = worklog 시간 ÷ 8</li>
                                    <li>cycle time = differenceInHours(완료일 - 생성일), 최소 1시간</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5">
                                <div className="font-medium text-foreground/90 mb-1">💡 활용 사례</div>
                                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                                    <li><strong>처리량 변화 추적</strong>: 완료 건수 line이 우상향이면 팀 성장</li>
                                    <li><strong>번아웃 감지</strong>: cycle time 급증 = 작업 길어짐 = 블로커 의심</li>
                                    <li><strong>스프린트 회고</strong>: 직전 분기 vs 이번 분기 비교</li>
                                    <li><strong>임원 보고</strong>: 분기별 성과 트렌드</li>
                                </ul>
                            </div>
                            <div className="border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">
                                ⚠️ worklog 데이터 부족한 팀은 worklog 인일 line이 0에 가까움. 완료 건수와 cycle time line은 항상 표시.
                            </div>
                        </div>
                    </InfoTip>
                </h3>
                <div className="text-[11px] text-muted-foreground">
                    최근 {months}개월
                </div>
            </div>

            {!hasData ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                    최근 {months}개월에 완료된 이슈가 없습니다.
                </div>
            ) : (
                <>
                    <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgb(148 163 184 / 0.2)" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" />
                            <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="currentColor" />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="currentColor" />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'rgb(var(--card-rgb, 255 255 255))',
                                    border: '1px solid rgb(148 163 184 / 0.4)',
                                    borderRadius: 6,
                                    fontSize: 12,
                                }}
                                formatter={(value, name) => {
                                    const v = typeof value === 'number' ? value : Number(value);
                                    if (name === '평균 cycle time') return [`${v.toFixed(1)}h`, name];
                                    if (name === 'Worklog 인일') return [`${v.toFixed(1)} MD`, name];
                                    return [v.toString(), name];
                                }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="completedIssues"
                                name="완료 이슈 수"
                                stroke="rgb(59, 130, 246)"
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                            />
                            <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="worklogManDays"
                                name="Worklog 인일"
                                stroke="rgb(16, 185, 129)"
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                            />
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="avgCycleHours"
                                name="평균 cycle time"
                                stroke="rgb(245, 158, 11)"
                                strokeWidth={2}
                                strokeDasharray="4 4"
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>

                    <div className="mt-3 text-[11px] text-muted-foreground bg-muted/40 px-2 py-1.5 rounded border border-border/60">
                        💡 좌축: 완료 건수 / Worklog 인일 (MD) — 같은 스케일.
                        우축 (점선): 평균 cycle time (시간) — 단위 다름.
                        worklog 등록률 낮으면 emerald line이 낮을 수 있음.
                    </div>
                </>
            )}
        </div>
    );
}
