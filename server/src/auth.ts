import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  deleteSession as dbDeleteSession,
  deleteOtherSessions as dbDeleteOtherSessions,
  getRawSetting,
  purgeExpiredSessions,
  setRawSetting,
} from './db.js';

/* ------------------------------------------------------------------ *
 * 凭据
 * ------------------------------------------------------------------ */

export interface Credentials {
  username: string;
  salt: string;
  hash: string;
  /** 仍是出厂默认密码（前端会提示尽快修改） */
  isDefault: boolean;
  updatedAt: string;
}

const SETTING_KEY = 'auth';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 256 * 1024 * 1024,
  }).toString('hex');
}

export function verifyPassword(password: string, cred: Credentials): boolean {
  const expected = Buffer.from(cred.hash, 'hex');
  const actual = Buffer.from(hashPassword(password, cred.salt), 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** 用户名不存在时也走一次同等开销的哈希，避免用响应时间探测账号是否存在 */
export function dummyVerify(password: string): void {
  hashPassword(password, 'dummy-salt-for-timing-equalization');
}

function makeCredentials(username: string, password: string, isDefault: boolean): Credentials {
  const salt = randomBytes(16).toString('hex');
  return {
    username,
    salt,
    hash: hashPassword(password, salt),
    isDefault,
    updatedAt: new Date().toISOString(),
  };
}

export function getCredentials(): Credentials | null {
  const raw = getRawSetting(SETTING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Credentials;
    if (!parsed.username || !parsed.salt || !parsed.hash) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCredentials(username: string, password: string, isDefault = false): Credentials {
  const cred = makeCredentials(username, password, isDefault);
  setRawSetting(SETTING_KEY, JSON.stringify(cred));
  return cred;
}

/** 首次启动时写入默认账号；已存在则不动 */
export function ensureDefaultCredentials(): { created: boolean; username: string } {
  const existing = getCredentials();
  if (existing) return { created: false, username: existing.username };
  const username = (process.env.AUTH_USER ?? 'admin').trim() || 'admin';
  const password = process.env.AUTH_PASSWORD ?? 'admin123';
  saveCredentials(username, password, true);
  return { created: true, username };
}

/* ------------------------------------------------------------------ *
 * 会话
 * ------------------------------------------------------------------ */

export interface SessionInfo {
  token: string;
  expiresAt: number;
  username: string;
}

export function newSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** 会话 cookie 名 */
export const COOKIE_NAME = 'renamer_session';

/* ------------------------------------------------------------------ *
 * 防爆破：失败计数 + 递增延迟 + 锁定
 * ------------------------------------------------------------------ */

export interface AuthPolicy {
  /** 会话有效期（默认 7 天） */
  sessionTtlMs: number;
  /** 窗口内允许的失败次数（默认 5 次） */
  maxAttempts: number;
  /** 失败计数窗口（默认 10 分钟） */
  windowMs: number;
  /** 首次锁定时长（默认 15 分钟），连续锁定按倍数递增 */
  lockMs: number;
  /** 锁定时长上限（默认 1 小时） */
  lockMaxMs: number;
  /** 失败后的递增延迟基数（默认 600ms），每失败一次翻倍 */
  delayBaseMs: number;
  /** 递增延迟上限（默认 4s） */
  delayMaxMs: number;
  /** 是否信任 X-Forwarded-For（反代后面才开） */
  trustProxy: boolean;
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function loadAuthPolicy(): AuthPolicy {
  return {
    sessionTtlMs: num(process.env.SESSION_TTL_MS, 7 * 24 * 60 * 60 * 1000),
    maxAttempts: num(process.env.LOGIN_MAX_ATTEMPTS, 5),
    windowMs: num(process.env.LOGIN_WINDOW_MS, 10 * 60 * 1000),
    lockMs: num(process.env.LOGIN_LOCK_MS, 15 * 60 * 1000),
    lockMaxMs: num(process.env.LOGIN_LOCK_MAX_MS, 60 * 60 * 1000),
    delayBaseMs: num(process.env.LOGIN_DELAY_BASE_MS, 600),
    delayMaxMs: num(process.env.LOGIN_DELAY_MAX_MS, 4000),
    trustProxy:
      (process.env.TRUST_PROXY ?? '').toLowerCase() === 'true' ||
      process.env.TRUST_PROXY === '1',
  };
}

interface AttemptState {
  /** 窗口内的失败次数 */
  failures: number;
  /** 本轮失败计数起点 */
  firstAt: number;
  /** 锁定截止时间戳（0 = 未锁） */
  lockedUntil: number;
  /** 累计被锁定次数，用于锁定递增 */
  lockCount: number;
}

/**
 * 双维度计数：
 *  - ip:<addr>   —— 防同一来源对多个账号喷射
 *  - user:<name> —— 防分布式来源对同一账号猜解
 * 任一维度触发锁定即拒绝登录。
 */
export class BruteForceGuard {
  private states = new Map<string, AttemptState>();

  constructor(private policy: AuthPolicy) {}

  private stateOf(key: string, now: number): AttemptState {
    let s = this.states.get(key);
    if (!s) {
      s = { failures: 0, firstAt: now, lockedUntil: 0, lockCount: 0 };
      this.states.set(key, s);
    }
    // 窗口过期且未锁定 → 重新计数
    if (!s.lockedUntil && now - s.firstAt > this.policy.windowMs) {
      s.failures = 0;
      s.firstAt = now;
    }
    return s;
  }

  /** 登录前调用；返回是否被锁与剩余等待时间 */
  check(keys: string[], now = Date.now()): { locked: boolean; retryAfterMs: number } {
    let retry = 0;
    for (const k of keys) {
      const s = this.stateOf(k, now);
      if (s.lockedUntil > now) retry = Math.max(retry, s.lockedUntil - now);
    }
    // 顺手清理过期条目，避免内存长期增长
    if (this.states.size > 5000) this.sweep(now);
    return { locked: retry > 0, retryAfterMs: retry };
  }

  /** 登录失败后调用；返回本次应答前的延迟与是否触发锁定 */
  fail(keys: string[], now = Date.now()): { delayMs: number; locked: boolean; retryAfterMs: number } {
    const p = this.policy;
    let maxFailures = 0;
    let retry = 0;
    let freshlyLocked = false;

    for (const k of keys) {
      const s = this.stateOf(k, now);
      s.failures += 1;
      maxFailures = Math.max(maxFailures, s.failures);
      if (p.maxAttempts > 0 && s.failures >= p.maxAttempts) {
        s.lockCount += 1;
        s.lockedUntil = now + lockDuration(p, s.lockCount);
        s.failures = 0;
        s.firstAt = now;
        freshlyLocked = true;
      }
      retry = Math.max(retry, Math.max(0, s.lockedUntil - now));
    }

    // 递增延迟：600ms、1.2s、2.4s…封顶 4s；已锁定则不再叠加
    const delayMs = freshlyLocked
      ? 0
      : Math.min(p.delayBaseMs * 2 ** Math.max(0, maxFailures - 1), p.delayMaxMs);
    return { delayMs, locked: freshlyLocked || retry > 0, retryAfterMs: retry };
  }

  /** 登录成功后清零该账号与该来源的计数 */
  reset(keys: string[]): void {
    for (const k of keys) this.states.delete(k);
  }

  /** 当前状态（给接口回显策略与剩余次数用） */
  peek(keys: string[], now = Date.now()): { remaining: number; retryAfterMs: number } {
    const p = this.policy;
    let remaining = p.maxAttempts;
    let retry = 0;
    for (const k of keys) {
      const s = this.states.get(k);
      if (!s) continue;
      if (s.lockedUntil > now) retry = Math.max(retry, s.lockedUntil - now);
      remaining = Math.min(remaining, Math.max(0, p.maxAttempts - s.failures));
    }
    return { remaining, retryAfterMs: retry };
  }

  private sweep(now: number): void {
    for (const [k, s] of this.states) {
      const idle = s.lockedUntil > now ? s.lockedUntil - now : now - s.firstAt;
      if (idle > this.policy.lockMaxMs && s.lockedUntil <= now) this.states.delete(k);
    }
  }
}

function lockDuration(p: AuthPolicy, lockCount: number): number {
  if (p.lockMs <= 0) return 0;
  const grown = p.lockMs * 2 ** Math.max(0, lockCount - 1);
  return Math.min(grown, Math.max(p.lockMs, p.lockMaxMs));
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function clientIp(
  headers: Record<string, unknown>,
  socketIp: string | undefined,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const xff = headers['x-forwarded-for'];
    const first = Array.isArray(xff) ? xff[0] : typeof xff === 'string' ? xff.split(',')[0] : '';
    if (first && first.trim()) return first.trim();
  }
  return socketIp ?? 'unknown';
}

export function attemptKeys(ip: string, username: string): string[] {
  return [`ip:${ip}`, `user:${username.trim().toLowerCase()}`];
}

export function validateUsername(name: string): string | null {
  const v = name.trim();
  if (v.length < 3 || v.length > 32) return '用户名需为 3–32 个字符';
  if (!/^[A-Za-z0-9_.-]+$/.test(v)) return '用户名只能包含字母、数字、下划线、点或短横线';
  return null;
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return '密码至少 8 位';
  if (pw.length > 128) return '密码最长 128 位';
  if (/^\d+$/.test(pw)) return '密码不能是纯数字';
  return null;
}

export { dbDeleteSession, dbDeleteOtherSessions, purgeExpiredSessions };
