import type { ReactNode } from 'react';
import clsx from 'clsx';

export function Panel({
  title,
  subtitle,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={clsx('panel flex min-h-0 flex-col overflow-hidden', className)}>
      {(title || actions) && (
        <header className="panel-head">
          <div className="min-w-0">
            <div className="panel-title">
              {icon}
              <span className="truncate">{title}</span>
              {subtitle && <span className="muted text-xs font-normal">{subtitle}</span>}
            </div>
          </div>
          {actions && <div className="flex flex-none items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={clsx('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Toggle({
  on,
  onChange,
  disabled,
  title,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="switch"
      data-on={on}
      disabled={disabled}
      title={title}
      aria-pressed={on}
      onClick={() => onChange(!on)}
    />
  );
}

export function Chip({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: 'default' | 'ok' | 'warn' | 'danger' | 'accent';
  className?: string;
}) {
  const toneClass =
    tone === 'ok'
      ? 'chip-ok'
      : tone === 'warn'
        ? 'chip-warn'
        : tone === 'danger'
          ? 'chip-danger'
          : tone === 'accent'
            ? 'chip-accent'
            : '';
  return <span className={clsx('chip', toneClass, className)}>{children}</span>;
}

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="muted opacity-60">{icon}</div>}
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="muted max-w-xs text-xs leading-relaxed">{hint}</div>}
    </div>
  );
}

export function Field({
  label,
  help,
  children,
  className,
}: {
  label: string;
  help?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      {children}
      {help && <div className="muted mt-1 text-[11px] leading-snug">{help}</div>}
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
