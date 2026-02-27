import { type JiraIssue } from "@/api/jiraClient";
import { filterLeafIssues } from "@/lib/jira-helpers";
import { calculateKPI } from "@/services/kpiService";
import { useMemo } from "react";
import {
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatisticsPanelProps {
    issues: JiraIssue[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export function StatisticsPanel({ issues }: StatisticsPanelProps) {
    // 건수 규칙: 할 일만 카운트, 하위 작업 있으면 부모 제외·하위만 반영 (통계/KPI 동일)
    const leafIssues = useMemo(() => filterLeafIssues(issues), [issues]);
    const kpi = useMemo(() => calculateKPI(leafIssues), [leafIssues]);

    const statusData = useMemo(() => {
        const counts: Record<string, number> = {};
        leafIssues.forEach(i => {
            const status = i.fields.status.name;
            counts[status] = (counts[status] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [leafIssues]);

    // Derived for chart (re-calculating compliant count from rate for simplicity in display)
    const chartData = [
        { name: '전체', value: kpi.totalIssues },
        { name: '완료', value: kpi.completedIssues },
        { name: '지연', value: kpi.delayedIssues },
        { name: '조기', value: kpi.earlyIssues },
    ];

    return (
        <div className="space-y-4 h-full overflow-y-auto p-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KPICard title="기능 개발 완료율" value={`${kpi.completionRate.toFixed(1)}%`} grade={kpi.grades.completion} />
                <KPICard title="일정 준수율" value={`${kpi.complianceRate.toFixed(1)}%`} grade={kpi.grades.compliance} />
                <KPICard title="조기 완료 가점" value={`+${kpi.grades.earlyBonus}`} grade={kpi.grades.earlyBonus > 0 ? 'S' : '-'} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[300px]">
                <Card>
                    <CardHeader><CardTitle>상태 분포</CardTitle></CardHeader>
                    <CardContent className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {statusData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle>성과 지표</CardTitle></CardHeader>
                    <CardContent className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="value" fill="#8884d8" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function KPICard({ title, value, grade }: { title: string, value: string, grade: string }) {
    const gradeColor =
        grade === 'S' ? 'text-purple-600 bg-purple-100' :
            grade === 'A' ? 'text-green-600 bg-green-100' :
                grade === 'B' ? 'text-blue-600 bg-blue-100' :
                    grade === 'C' ? 'text-yellow-600 bg-yellow-100' :
                        'text-red-600 bg-red-100';

    return (
        <Card>
            <CardContent className="p-6 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
                    <div className="text-2xl font-bold">{value}</div>
                </div>
                <div className={cn("text-xl font-bold px-3 py-1 rounded", gradeColor)}>
                    {grade}
                </div>
            </CardContent>
        </Card>
    );
}
