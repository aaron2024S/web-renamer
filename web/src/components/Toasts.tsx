import { CheckCircle2, Info, XCircle, X } from 'lucide-react';
import { useStore } from '../store';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[330px] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? XCircle : Info;
        const tone =
          t.kind === 'success' ? 'var(--ok)' : t.kind === 'error' ? 'var(--danger)' : 'var(--accent)';
        return (
          <div
            key={t.id}
            className="panel animate-in pointer-events-auto flex items-start gap-2.5 px-3.5 py-3"
            style={{ borderColor: 'var(--border-strong)' }}
          >
            <Icon size={17} style={{ color: tone }} className="mt-0.5 flex-none" />
            <div className="flex-1 text-[13px] leading-snug">{t.message}</div>
            <button className="icon-btn -mr-1 -mt-0.5 h-6 w-6" onClick={() => dismiss(t.id)}>
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
