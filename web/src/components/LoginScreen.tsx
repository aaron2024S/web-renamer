import { useEffect, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Lock, LogIn, ShieldCheck, User } from 'lucide-react';
import { useStore } from '../store';

export function LoginScreen() {
  const login = useStore((s) => s.login);
  const loggingIn = useStore((s) => s.loggingIn);
  const defaultCredentials = useStore((s) => s.auth?.defaultCredentials ?? false);
  const initialRetry = useStore((s) => s.auth?.retryAfterSec ?? 0);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(initialRetry);

  // 锁定倒计时
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0 || loggingIn) return;
    setError(null);
    const res = await login(username.trim(), password);
    if (res.ok) return;
    setError(res.error ?? '登录失败');
    if (res.retryAfterSec && res.retryAfterSec > 0) setCooldown(res.retryAfterSec);
    setLeft(null);
    setPassword('');
  };

  const locked = cooldown > 0;

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto p-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-5 flex items-center justify-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              boxShadow: '0 10px 26px rgba(109,94,252,.35)',
            }}
          >
            <Lock size={20} color="#fff" />
          </div>
          <div className="leading-tight">
            <div className="text-[19px] font-semibold tracking-tight">Web ReNamer</div>
            <div className="muted text-[12px]">自托管 · 批量重命名</div>
          </div>
        </div>

        <form
          className="panel flex flex-col gap-3 p-5"
          style={{ borderColor: 'var(--border-strong)' }}
          onSubmit={submit}
        >
          <div>
            <label className="field-label" htmlFor="login-user">
              用户名
            </label>
            <div className="relative">
              <User size={14} className="muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-user"
                className="field !pl-9"
                autoFocus
                autoComplete="username"
                value={username}
                placeholder="admin"
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="login-pass">
              密码
            </label>
            <div className="relative">
              <Lock size={14} className="muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-pass"
                className="field !pl-9 !pr-10"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                placeholder="••••••••"
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="icon-btn absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2"
                title={showPw ? '隐藏密码' : '显示密码'}
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]"
              style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
            >
              <AlertTriangle size={14} className="mt-0.5 flex-none" />
              <div>
                {error}
                {locked && <div className="mt-0.5">请在 {cooldown} 秒后重试。</div>}
                {!locked && left !== null && left > 0 && (
                  <div className="mt-0.5">还可尝试 {left} 次，之后将临时锁定。</div>
                )}
              </div>
            </div>
          )}

          <button
            className="btn btn-primary btn-lg mt-1 w-full justify-center"
            type="submit"
            disabled={loggingIn || locked || !username || !password}
          >
            <LogIn size={15} />
            {locked ? `已锁定 · ${cooldown}s` : loggingIn ? '登录中…' : '登录'}
          </button>

          {defaultCredentials && (
            <div className="muted flex items-start gap-2 text-[11.5px] leading-relaxed">
              <ShieldCheck size={13} className="mt-0.5 flex-none" />
              <span>
                首次使用请用默认账号 <b className="mono">admin</b> / <b className="mono">admin123</b>{' '}
                登录，登录后请立即在右上角「账号」里修改用户名和密码。
              </span>
            </div>
          )}
        </form>

        <div className="muted mt-3 text-center text-[11px] leading-relaxed">
          连续输错会临时锁定（默认 5 次后锁定 15 分钟，连续锁定时间递增），请勿反复尝试。
        </div>
      </div>
    </div>
  );
}
