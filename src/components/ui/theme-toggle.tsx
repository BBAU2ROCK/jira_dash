/**
 * ThemeToggle — light / dark / system 순환 토글 (v1.0.21).
 */
import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDisplayPreferenceStore, type ThemeMode } from '@/stores/displayPreferenceStore';

const THEME_META: Record<ThemeMode, { Icon: typeof Sun; label: string; aria: string }> = {
    light:  { Icon: Sun,     label: '라이트', aria: '라이트 모드 (클릭하여 다크로)' },
    dark:   { Icon: Moon,    label: '다크',   aria: '다크 모드 (클릭하여 시스템으로)' },
    system: { Icon: Monitor, label: '시스템', aria: '시스템 설정 따라감 (클릭하여 라이트로)' },
};

export function ThemeToggle() {
    const theme = useDisplayPreferenceStore((s) => s.theme);
    const cycleTheme = useDisplayPreferenceStore((s) => s.cycleTheme);
    const { Icon, label, aria } = THEME_META[theme];

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={cycleTheme}
            aria-label={aria}
            title={aria}
            className="h-8 px-2 gap-1.5"
        >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="text-xs hidden sm:inline">{label}</span>
        </Button>
    );
}
