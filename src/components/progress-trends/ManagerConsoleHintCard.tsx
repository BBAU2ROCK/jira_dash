import { ArrowRight, Briefcase } from 'lucide-react';

/**
 * v1.0.33: 그루밍 표 + AI 시뮬레이션 + ROI + 예산 시뮬 + 트렌드 + 히트맵을
 * 매니저 콘솔 "공수 & 예산" 탭으로 이전했음을 안내.
 *
 * 클릭 시 헤더의 매니저 콘솔 버튼을 시각 강조 (animate-pulse + ring).
 */
export function ManagerConsoleHintCard() {
    const handleClick = () => {
        // 헤더 매니저 버튼 강조 — id 기반
        const btn = document.querySelector<HTMLButtonElement>('[data-manager-console-trigger]');
        if (btn) {
            btn.classList.add('ring-2', 'ring-blue-400', 'dark:ring-blue-600', 'ring-offset-2', 'ring-offset-background', 'animate-pulse');
            setTimeout(() => {
                btn.classList.remove('ring-2', 'ring-blue-400', 'dark:ring-blue-600', 'ring-offset-2', 'ring-offset-background', 'animate-pulse');
            }, 2500);
            // 클릭으로 다이얼로그 열기
            btn.click();
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            className="w-full rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors p-4 text-left group"
        >
            <div className="flex items-start gap-3">
                <Briefcase className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                    <h4 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                        💼 공수 & AI 시뮬레이션 도구는 매니저 콘솔로 이동
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        그루밍 회의 / 예산 의사결정 / AI 도구 ROI 같은 매니저 의사결정 도구는
                        <strong className="text-foreground/90 mx-0.5">[💼 공수 & 예산]</strong>
                        탭에 있습니다.
                    </p>
                    <ul className="mt-2 text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
                        <li>이슈별 공수 그루밍 표 (10건 default + 펼침)</li>
                        <li>AI 도구 절감 시뮬레이션 (3 시나리오 + 슬라이더)</li>
                        <li>AI 도구 ROI 계산기 (도구 비용 → 순효과)</li>
                        <li>예산 시뮬레이터 (인원·utilization → 캘린더)</li>
                        <li>월별 공수 트렌드 (최근 6개월 line)</li>
                        <li>팀 부하 히트맵 (담당자 × 카테고리)</li>
                    </ul>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 shrink-0 self-center group-hover:translate-x-0.5 transition-transform">
                    매니저 콘솔 열기
                    <ArrowRight className="h-3.5 w-3.5" />
                </span>
            </div>
        </button>
    );
}
