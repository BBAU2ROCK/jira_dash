/* eslint-disable react-refresh/only-export-components --
 * 이 파일은 ManagerConsole 컴포넌트와 useManagerRiskCount hook을 함께 export.
 * 둘 다 매니저 콘솔 도메인이라 별도 파일 분리 이득 없음.
 */
/**
 * ManagerConsole — v1.0.28
 *
 * 매니저용 풀스크린 다이얼로그. 일일 브리프 + 리스크 보드 + 1:1 미팅 준비 통합.
 * 데이터 소스: Dashboard에서 fetch한 issues prop. 추가 API 호출 없음.
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Briefcase, Calendar as CalIcon, Flame, Users } from 'lucide-react';
import type { JiraIssue } from '@/api/jiraClient';
import { useRiskAnalysis, type RiskAnalysis } from '@/hooks/useRiskAnalysis';
import { useManagerBrief } from '@/hooks/useManagerBrief';
import { DailyBriefCard } from './DailyBriefCard';
import { RiskBoard } from './RiskBoard';
import { OneOnOnePrep } from './OneOnOnePrep';

interface Props {
    open: boolean;
    onClose: () => void;
    issues: JiraIssue[];
    selectedEpicCount: number;
    /** IssueList focus용 — Dashboard에 전파 */
    onIssueKeysFocus?: (keys: string[]) => void;
    /** 단일 이슈 클릭 → drawer */
    onIssueClick?: (issue: JiraIssue) => void;
}

export function ManagerConsole({ open, onClose, issues, selectedEpicCount, onIssueKeysFocus, onIssueClick }: Props) {
    const risk = useRiskAnalysis(issues);
    const brief = useManagerBrief(issues);
    const [tab, setTab] = useState<'brief' | 'risk' | 'oneonone'>('brief');

    // 클릭 후 drawer/list로 가면 다이얼로그도 자연스럽게 닫음
    const handleIssueClick = (i: JiraIssue) => {
        onClose();
        onIssueClick?.(i);
    };
    const handleIssueKeysFocus = (keys: string[]) => {
        onClose();
        onIssueKeysFocus?.(keys);
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="w-[95vw] max-w-[1600px] max-h-[92vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="px-6 py-4 border-b border-border bg-card">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Briefcase className="h-5 w-5 text-primary" aria-hidden />
                        매니저 콘솔
                        <span className="text-xs font-normal text-muted-foreground">
                            — 선택 에픽 <span className="tabular-nums">{selectedEpicCount}</span>개 기준
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-6 pt-4 border-b border-border bg-card/60">
                        <TabsList className="bg-muted/60 p-1 h-auto">
                            <TabsTrigger value="brief" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
                                <CalIcon className="h-3.5 w-3.5" aria-hidden />
                                오늘의 브리프
                            </TabsTrigger>
                            <TabsTrigger value="risk" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
                                <Flame className="h-3.5 w-3.5" aria-hidden />
                                리스크 보드
                                {risk.totalCount > 0 && (
                                    <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 dark:bg-red-600 text-white text-[10px] font-bold tabular-nums px-1">
                                        {risk.totalCount}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="oneonone" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5">
                                <Users className="h-3.5 w-3.5" aria-hidden />
                                1:1 미팅 준비
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-5">
                        <TabsContent value="brief" className="mt-0 focus-visible:outline-none">
                            <DailyBriefCard
                                brief={brief}
                                onIssueClick={handleIssueClick}
                                onIssueKeysFocus={handleIssueKeysFocus}
                            />
                        </TabsContent>
                        <TabsContent value="risk" className="mt-0 focus-visible:outline-none">
                            <RiskBoard
                                risk={risk}
                                onIssueClick={handleIssueClick}
                                onIssueKeysFocus={handleIssueKeysFocus}
                            />
                        </TabsContent>
                        <TabsContent value="oneonone" className="mt-0 focus-visible:outline-none">
                            <OneOnOnePrep
                                issues={issues}
                                onIssueClick={handleIssueClick}
                                onIssueKeysFocus={handleIssueKeysFocus}
                            />
                        </TabsContent>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

/** 헤더 위험 카운트 배지용 외부 노출 */
export function useManagerRiskCount(issues: JiraIssue[] | null | undefined): number {
    const risk: RiskAnalysis = useRiskAnalysis(issues);
    return risk.totalCount;
}
