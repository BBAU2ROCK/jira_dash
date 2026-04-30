import { useEffect } from 'react';
import { Dashboard } from './pages/dashboard';
import { Toaster } from 'sonner';
import { useForecastHistoryStore } from '@/stores/forecastHistoryStore';
import { useDisplayPreferenceStore, applyTheme } from '@/stores/displayPreferenceStore';
import { useJiraKeepalive } from '@/hooks/useJiraKeepalive';
import { ConnectionIndicator } from '@/components/ui/connection-indicator';

function App() {
  // v1.0.20: 앱 부팅 시 forecast history 1회 정리 (90일 이상·1000건 초과)
  // localStorage 무한 증가 방지. 부수 효과 없음 (idempotent).
  useEffect(() => {
    useForecastHistoryStore.getState().pruneStale();
  }, []);

  // v1.0.21: 테마 적용 — 부팅 시 + theme 변경 시 + system 변경 감지
  const theme = useDisplayPreferenceStore((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => applyTheme('system');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
  }, [theme]);

  // v1.0.27: Jira 세션 keepalive — 10분마다 ping + focus/online 감지
  const keepalive = useJiraKeepalive();

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground antialiased">
      <Dashboard />
      <Toaster richColors position="top-right" closeButton theme={theme === 'system' ? 'system' : theme} />
      {/* 우하단 connection indicator (글로벌) */}
      <div className="fixed bottom-3 right-3 z-50 pointer-events-auto">
        <ConnectionIndicator state={keepalive} />
      </div>
    </div>
  )
}

export default App
