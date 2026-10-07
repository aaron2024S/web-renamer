import { useEffect, useRef } from 'react';
import { useStore } from './store';
import { TopBar } from './components/TopBar';
import { FileBrowser } from './components/FileBrowser';
import { RuleStack } from './components/RuleStack';
import { RightPanel } from './components/RightPanel';
import { Toasts } from './components/Toasts';
import { LoginScreen } from './components/LoginScreen';
import { Spinner } from './components/ui';

export default function App() {
  const ready = useStore((s) => s.ready);
  const bootstrap = useStore((s) => s.bootstrap);
  const authenticated = useStore((s) => s.auth?.authenticated ?? false);
  const queue = useStore((s) => s.queue);
  const rules = useStore((s) => s.rules);
  const runPreview = useStore((s) => s.runPreview);

  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    void bootstrap();
  }, [bootstrap]);

  // 规则或文件变化后自动刷新预览（防抖）
  const rulesKey = JSON.stringify(rules);
  useEffect(() => {
    if (!ready || !authenticated) return;
    const t = setTimeout(() => void runPreview(), 260);
    return () => clearTimeout(t);
  }, [queue.length, rulesKey, ready, authenticated, runPreview]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center gap-3">
        <Spinner size={20} />
        <span className="muted text-sm">正在加载…</span>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <>
        <LoginScreen />
        <Toasts />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar />
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 pt-0 xl:grid-cols-[320px_minmax(0,1fr)_minmax(0,1fr)] xl:overflow-hidden">
        <div className="flex min-h-[320px] flex-col xl:min-h-0">
          <FileBrowser />
        </div>
        <div className="flex min-h-[380px] flex-col xl:min-h-0">
          <RuleStack />
        </div>
        <div className="flex min-h-[420px] flex-col xl:min-h-0">
          <RightPanel />
        </div>
      </main>
      <Toasts />
    </div>
  );
}
