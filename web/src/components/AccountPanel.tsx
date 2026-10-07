import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Info, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useStore } from '../store';
import { Chip } from './ui';

/** 账号与安全：改用户名 / 密码、查看防爆破策略、退出登录 */
export function AccountPanel({ onClose }: { onClose: () => void }) {
  const auth = useStore((s) => s.auth);
  const me = useStore((s) => s.me);
  const refreshMe = useStore((s) => s.refreshMe);
  const changeCredentials = useStore((s) => s.changeCredentials);
  const logout = useStore((s) => s.logout);
  const toast = useStore((s) => s.toast);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const policy = me?.policy;

  const fmtDur = (sec: number) => {
    if (sec < 60) return `${sec} 秒`;
    if (sec < 3600) return `${Math.round(sec / 60)} 分钟`;
    if (sec < 86400) return `${Math.round(sec / 3600)} 小时`;
    return `${Math.round(sec / 86400)} 天`;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!currentPassword) {
      setError('请输入当前密码以确认身份');
      return;
    }
    if (!newUsername.trim() && !newPassword) {
      setError('请填写新的用户名或新密码');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    setBusy(true);
    const res = await changeCredentials({
      currentPassword,
      username: newUsername.trim() || undefined,
      newPassword: newPassword || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? '修改失败');
      return;
    }
    setCurrentPassword('');
    setNewUsername('');
    setNewPassword('');
    setConfirmPassword('');
    toast('success', '账号信息已更新，其它设备的登录已失效');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-[6vh]">
      <div className="fixed inset-0" onClick={onClose} />
      <div
        className="panel animate-in relative z-10 w-full max-w-[520px] p-5"
        style={{ borderColor: 'var(--border-strong)' }}
      >
        <div className="mb-4 flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <UserRound size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">账号与安全</div>
            <div className="muted truncate text-[11.5px]">
              当前登录：<span className="mono">{auth?.username ?? '-'}</span>
              {me ? ` · ${me.activeSessions} 个活跃会话` : ''}
            </div>
          </div>
          {auth?.defaultCredentials && <Chip tone="warn">仍在用默认密码</Chip>}
        </div>

        <form className="flex flex-col gap-3" onSubmit={submit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <label className="field-label">当前密码（必填）</label>
              <input
                className="field"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                placeholder="用于确认身份"
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="sm:col-span-1">
              <label className="field-label">新用户名（可选）</label>
              <input
                className="field"
                autoComplete="username"
                value={newUsername}
                placeholder={auth?.username ?? 'admin'}
                onChange={(e) => setNewUsername(e.target.value)}
              />
            </div>
            <div className="sm:col-span-1">
              <label className="field-label">新密码（可选）</label>
              <input
                className="field"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                placeholder="至少 8 位，不能纯数字"
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="sm:col-span-1">
              <label className="field-label">确认新密码</label>
              <input
                className="field"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                placeholder="再输一次"
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]"
              style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
            >
              <AlertTriangle size={14} className="mt-0.5 flex-none" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
              <Check size={13} /> {busy ? '保存中…' : '保存修改'}
            </button>
            <span className="muted text-[11.5px]">改完会踢掉其它设备上的登录</span>
          </div>
        </form>

        <div
          className="mt-4 rounded-xl border p-3"
          style={{ borderColor: 'var(--border)', background: 'var(--panel-2)' }}
        >
          <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold">
            <ShieldCheck size={14} />
            登录防爆破策略
          </div>
          {policy ? (
            <ul className="muted flex flex-col gap-1 text-[11.5px] leading-relaxed">
              <li>
                · 同一来源 <b>{policy.maxAttempts}</b> 次密码错误 → 锁定 <b>{fmtDur(policy.lockSec)}</b>
              </li>
              <li>
                · 计数窗口 <b>{fmtDur(policy.windowSec)}</b>；连续被锁定时长翻倍，上限{' '}
                <b>{fmtDur(policy.lockMaxSec)}</b>
              </li>
              <li>
                · 每次失败还会递增延迟应答（{policy.delayBaseMs}ms 起，最高 {policy.delayMaxMs}ms），
                拖慢自动猜解
              </li>
              <li>
                · 同时按「来源 IP」和「账号名」双维度计数，分布式猜解同一账号也会被挡
              </li>
              <li>
                · 登录有效期 <b>{fmtDur(policy.sessionTtlSec)}</b>，会话 cookie 为 HttpOnly
              </li>
            </ul>
          ) : (
            <div className="muted text-[11.5px]">读取策略中…</div>
          )}
          <div className="muted mt-2 text-[11px] leading-relaxed">
            想调整这些数字（比如改成 3 次锁定、或延长锁定时间），用环境变量配置：
            <span className="mono"> LOGIN_MAX_ATTEMPTS / LOGIN_WINDOW_MS / LOGIN_LOCK_MS / LOGIN_LOCK_MAX_MS / LOGIN_DELAY_BASE_MS / LOGIN_DELAY_MAX_MS / SESSION_TTL_MS</span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            className="btn btn-sm"
            onClick={async () => {
              await logout();
              onClose();
            }}
          >
            <LogOut size={13} /> 退出登录
          </button>
          <button className="btn btn-sm btn-ghost ml-auto" onClick={onClose}>
            关闭
          </button>
        </div>

        <div
          className="muted mt-3 flex items-center justify-center gap-1.5 border-t pt-3 text-[11px]"
          style={{ borderColor: 'var(--border)' }}
        >
          <Info size={12} />
          <span>
            Web ReNamer <span className="mono">v{__APP_VERSION__}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
