import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { buildPlan } from './rename/planner.js';
import { applyPlan } from './rename/executor.js';
import { getRuleSet, setWatchConfig } from './db.js';
import type { WatchConfig } from './types.js';

interface WatcherState {
  watcher: FSWatcher | null;
  config: WatchConfig;
  roots: string[];
  recentDests: Map<string, number>;
  active: boolean;
}

const state: WatcherState = {
  watcher: null,
  config: {
    enabled: false,
    paths: [],
    ruleSetId: null,
    stabilityMs: 800,
    recursive: true,
    recordHistory: true,
    lastRunAt: null,
    lastRunSummary: null,
  },
  roots: [],
  recentDests: new Map(),
  active: false,
};

const TMP_PREFIX = '.wr-tmp-';
const RECENT_TTL = 10_000;

function cleanupRecent(): void {
  const now = Date.now();
  for (const [k, t] of state.recentDests) {
    if (now - t > RECENT_TTL) state.recentDests.delete(k);
  }
}

async function handleFile(filePath: string): Promise<void> {
  if (process.env.WATCH_DEBUG) console.log('[watch][handle]', filePath);
  const name = path.basename(filePath);
  if (name.startsWith(TMP_PREFIX) || name.startsWith('.')) return;
  cleanupRecent();
  if (state.recentDests.has(filePath)) return;

  const cfg = state.config;
  if (!cfg.ruleSetId) return;
  const rs = getRuleSet(cfg.ruleSetId);
  if (!rs || rs.rules.length === 0) return;

  try {
    const plan = await buildPlan([filePath], rs.rules, state.roots);
    if (!plan.summary.canApply) {
      const only = plan.items[0];
      if (only && only.status !== 'unchanged') {
        console.warn(`[watch] 跳过 ${name}: ${only.reason ?? only.status}`);
      }
      return;
    }
    // 先把目标名登记为“最近产生”，避免自己触发自己造成死循环
    for (const it of plan.items) state.recentDests.set(it.dst, Date.now());
    const res = applyPlan(plan.items, plan.root, cfg.recordHistory);
    const summary = `自动改名 ${res.renamed.length} 个${
      res.failed.length ? `，失败 ${res.failed.length} 个` : ''
    }`;
    state.config = { ...cfg, lastRunAt: new Date().toISOString(), lastRunSummary: summary };
    setWatchConfig(state.config);
    console.log(`[watch] ${summary} (触发文件: ${name})`);
  } catch (e: any) {
    console.error(`[watch] 处理 ${name} 出错:`, e.message);
  }
}

export function getWatchState() {
  return {
    active: state.active,
    config: state.config,
    watchedPaths: state.config.paths,
  };
}

export function startWatcher(config: WatchConfig, roots: string[]): void {
  stopWatcher();
  state.config = { ...config, roots } as WatchConfig;
  state.roots = roots;

  if (!config.enabled) {
    state.active = false;
    return;
  }
  if (!config.paths.length || !config.ruleSetId) {
    state.active = false;
    console.warn('[watch] 已开启但缺少监听目录或规则集，未启动');
    return;
  }

  const watcher = chokidar.watch(config.paths, {
    ignoreInitial: true,
    persistent: true,
    depth: config.recursive ? undefined : 0,
    awaitWriteFinish: {
      stabilityThreshold: Math.max(200, config.stabilityMs),
      pollInterval: 100,
    },
    ignored: (p: string) => path.basename(p).startsWith(TMP_PREFIX),
  });

  watcher.on('add', (p: string) => void handleFile(p));
  watcher.on('error', (err: unknown) => console.error('[watch] 监听错误:', err));
  watcher.on('ready', () => console.log('[watch] 就绪，等待新文件…'));
  if (process.env.WATCH_DEBUG) {
    watcher.on('all', (ev: string, p: string) => console.log('[watch][raw]', ev, p));
  }

  state.watcher = watcher;
  state.active = true;
  console.log(`[watch] 已启动，监听: ${config.paths.join(', ')}`);
}

export function stopWatcher(): void {
  if (state.watcher) {
    void state.watcher.close();
    state.watcher = null;
  }
  state.active = false;
}

export async function restartWatcher(config: WatchConfig, roots: string[]): Promise<void> {
  startWatcher(config, roots);
}

export function updateWatcherConfig(config: WatchConfig, roots: string[]): void {
  startWatcher(config, roots);
}
