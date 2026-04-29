import { useEffect } from 'react';
import { Dashboard } from './pages/dashboard';
import { Toaster } from 'sonner';
import { useForecastHistoryStore } from '@/stores/forecastHistoryStore';

function App() {
  // v1.0.20: 앱 부팅 시 forecast history 1회 정리 (90일 이상·1000건 초과)
  // localStorage 무한 증가 방지. 부수 효과 없음 (idempotent).
  useEffect(() => {
    useForecastHistoryStore.getState().pruneStale();
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <Dashboard />
      <Toaster richColors position="top-right" closeButton />
    </div>
  )
}

export default App
