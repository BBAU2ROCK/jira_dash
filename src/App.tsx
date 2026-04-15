import { Dashboard } from './pages/dashboard';
import { Toaster } from 'sonner';

function App() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <Dashboard />
      <Toaster richColors position="top-right" closeButton />
    </div>
  )
}

export default App
