import { FolderTree, Moon, RadioTower, RefreshCw, Sun, UserRound, Wand2 } from 'lucide-react';
import { useStore } from '../store';
import { Chip } from './ui';
import { relativeTime } from '../lib/format';
import { useState } from 'react';
import { AccountPanel } from './AccountPanel';

export function TopBar() {
  const config = useStore((s) => s.config);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const navigate = useStore((s) => s.navigate);
  const browse = useStore((s) => s.browse);
  const auth = useStore((s) => s.auth);
  const [accountOpen, setAccountOpen] = useState(false);

  const roots = config?.roots ?? [];
  const watchActive = config?.watch.active ?? false;

  const currentRoot =
    roots.find((r) => browse?.path?.toLowerCase().startsWith(r.path.toLowerCase()))?.path ??
    roots[0]?.path ??
    '';

  return (
    <header className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="flex flex-none items-center gap-2.5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            boxShadow: '0 6px 18px rgba(109,94,252,.35)',
          }}
        >
          <Wand2 size={18} color="#fff" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight">Web ReNamer</div>
          <div className="muted hidden text-[11px] sm:block">自托管 · 无限规则与预设</div>
        </div>
      </div>

      <div className="mx-2 hidden h-6 w-px lg:block" style={{ background: 'var(--border)' }} />

      <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
        <FolderTree size={15} className="muted flex-none" />
        <select
          className="field !py-1.5 min-w-0 sm:w-auto sm:min-w-[160px]"
          value={currentRoot}
          onChange={(e) => navigate(e.target.value)}
        >
          {roots.map((r) => (
            <option key={r.path} value={r.path}>
              {r.name}
            </option>
          ))}
          {roots.length === 0 && <option value="">无可用目录</option>}
        </select>
      </div>

      <div className="ml-auto flex flex-none items-center gap-2">
        {/* 桌面端：完整状态文字 */}
        <span className="hidden md:inline-flex">
          {watchActive ? (
            <Chip tone="ok">
              <RadioTower size={12} />
              监听中
              {config?.watch.config.lastRunAt ? ` · ${relativeTime(config.watch.config.lastRunAt)}` : ''}
            </Chip>
          ) : (
            <Chip>
              <RadioTower size={12} />
              未监听
            </Chip>
          )}
        </span>
        {/* 移动端：只留图标，点了能看到完整状态 */}
        <span className="md:hidden">
          {watchActive && (
            <Chip tone="ok">
              <RadioTower size={12} />
            </Chip>
          )}
        </span>

        <button
          className="icon-btn"
          title="刷新当前目录"
          onClick={() => navigate(browse?.path)}
        >
          <RefreshCw size={15} />
        </button>

        <button
          className="icon-btn"
          title={theme === 'dark' ? '切换到亮色' : '切换到暗色'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <button
          className="icon-btn relative"
          title={`账号与安全（${auth?.username ?? '-'}）`}
          onClick={() => setAccountOpen(true)}
        >
          <UserRound size={15} />
          {auth?.defaultCredentials && (
            <span
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--warn)' }}
            />
          )}
        </button>
      </div>

      {accountOpen && <AccountPanel onClose={() => setAccountOpen(false)} />}
    </header>
  );
}
