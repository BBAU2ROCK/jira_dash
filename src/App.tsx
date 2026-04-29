import { useEffect } from 'react';
import { Dashboard } from './pages/dashboard';
import { Toaster } from 'sonner';
import { useForecastHistoryStore } from '@/stores/forecastHistoryStore';
import { useDisplayPreferenceStore, applyTheme } from '@/stores/displayPreferenceStore';

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

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground antialiased">
      <Dashboard />
      <Toaster richColors position="top-right" closeButton theme={theme === 'system' ? 'system' : theme} />
    </div>
  )
}

export default App
