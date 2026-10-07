import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Journal, RuleSet, Settings, WatchConfig } from './types.js';

let db: DatabaseSync;

const DEFAULT_WATCH: WatchConfig = {
  enabled: false,
  paths: [],
  ruleSetId: null,
  stabilityMs: 800,
  recursive: true,
  recordHistory: true,
  lastRunAt: null,
  lastRunSummary: null,
};

export function initDb(configDir: string): void {
  const file = path.join(configDir, 'renamer.sqlite');
  db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS rulesets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT,
      rules TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS journals (
      id TEXT PRIMARY KEY,
      root TEXT NOT NULL,
      created_at TEXT NOT NULL,
      entries TEXT NOT NULL,
      undone INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      ip TEXT,
      ua TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
  `);
}

/* ------------------------------- 规则集 / 预设 ------------------------------- */

function rowToRuleSet(row: any): RuleSet {
  return {
    id: row.id,
    name: row.name,
    folder: row.folder ?? null,
    rules: JSON.parse(row.rules),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listRuleSets(): RuleSet[] {
  const rows = db.prepare('SELECT * FROM rulesets ORDER BY folder, name').all() as any[];
  return rows.map(rowToRuleSet);
}

export function getRuleSet(id: string): RuleSet | null {
  const row = db.prepare('SELECT * FROM rulesets WHERE id = ?').get(id) as any;
  return row ? rowToRuleSet(row) : null;
}

export function saveRuleSet(rs: RuleSet): RuleSet {
  const now = new Date().toISOString();
  const existing = getRuleSet(rs.id);
  if (existing) {
    db.prepare(
      'UPDATE rulesets SET name = ?, folder = ?, rules = ?, updated_at = ? WHERE id = ?',
    ).run(rs.name, rs.folder ?? null, JSON.stringify(rs.rules), now, rs.id);
  } else {
    db.prepare(
      'INSERT INTO rulesets (id, name, folder, rules, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(rs.id, rs.name, rs.folder ?? null, JSON.stringify(rs.rules), rs.createdAt || now, now);
  }
  return getRuleSet(rs.id)!;
}

export function deleteRuleSet(id: string): void {
  db.prepare('DELETE FROM rulesets WHERE id = ?').run(id);
}

/* ---------------------------------- 历史 ---------------------------------- */

function rowToJournal(row: any): Journal {
  return {
    id: row.id,
    root: row.root,
    createdAt: row.created_at,
    entries: JSON.parse(row.entries),
    undone: !!row.undone,
  };
}

export function addJournal(j: Journal): void {
  db.prepare(
    'INSERT INTO journals (id, root, created_at, entries, undone) VALUES (?, ?, ?, ?, 0)',
  ).run(j.id, j.root, j.createdAt, JSON.stringify(j.entries));
}

export function listJournals(limit = 100): Journal[] {
  const rows = db
    .prepare('SELECT * FROM journals ORDER BY created_at DESC LIMIT ?')
    .all(limit) as any[];
  return rows.map(rowToJournal);
}

export function getJournal(id: string): Journal | null {
  const row = db.prepare('SELECT * FROM journals WHERE id = ?').get(id) as any;
  return row ? rowToJournal(row) : null;
}

export function markJournalUndone(id: string): void {
  db.prepare('UPDATE journals SET undone = 1 WHERE id = ?').run(id);
}

export function clearJournals(): void {
  db.prepare('DELETE FROM journals').run();
}

/* --------------------------------- 设置 --------------------------------- */

function getRawSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row ? row.value : null;
}

function setRawSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}

export { getRawSetting, setRawSetting };

export function getSettings(): Settings {
  const watch = { ...DEFAULT_WATCH };
  const theme = (getRawSetting('theme') as 'dark' | 'light' | null) ?? 'dark';

  const watchRaw = getRawSetting('watch');
  if (watchRaw) {
    try {
      Object.assign(watch, JSON.parse(watchRaw));
    } catch {
      /* 忽略损坏的设置 */
    }
  }
  return { watch, theme };
}

export function setSettings(patch: Partial<Settings>): Settings {
  if (patch.theme) setRawSetting('theme', patch.theme);
  if (patch.watch) setRawSetting('watch', JSON.stringify(patch.watch));
  return getSettings();
}

export function setWatchConfig(watch: WatchConfig): void {
  setRawSetting('watch', JSON.stringify(watch));
}

export function getWatchConfig(): WatchConfig {
  return getSettings().watch;
}

/* --------------------------------- 会话 --------------------------------- */

export interface SessionRecord {
  token: string;
  username: string;
  createdAt: string;
  expiresAt: string;
  ip: string | null;
  ua: string | null;
}

function rowToSession(row: any): SessionRecord {
  return {
    token: row.token,
    username: row.username,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ip: row.ip ?? null,
    ua: row.ua ?? null,
  };
}

export function createSession(s: SessionRecord): void {
  db.prepare(
    'INSERT INTO sessions (token, username, created_at, expires_at, ip, ua) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(s.token, s.username, s.createdAt, s.expiresAt, s.ip, s.ua);
  purgeExpiredSessions(new Date().toISOString());
}

export function getSession(token: string): SessionRecord | null {
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as any;
  return row ? rowToSession(row) : null;
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/** 改密后踢掉其它会话，只保留当前这一个 */
export function deleteOtherSessions(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token <> ?').run(token);
}

export function deleteAllSessions(): void {
  db.prepare('DELETE FROM sessions').run();
}

export function purgeExpiredSessions(nowIso: string): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso);
}

export function countSessions(): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as any;
  return Number(row?.n ?? 0);
}
