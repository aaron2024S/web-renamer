import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  BruteForceGuard,
  COOKIE_NAME,
  attemptKeys,
  clientIp,
  dummyVerify,
  ensureDefaultCredentials,
  getCredentials,
  loadAuthPolicy,
  newSessionToken,
  saveCredentials,
  sleep,
  validatePassword,
  validateUsername,
  verifyPassword,
  type AuthPolicy,
} from './auth.js';
import {
  countSessions,
  createSession,
  deleteOtherSessions,
  deleteSession,
  getSession,
  purgeExpiredSessions,
} from './db.js';

/** 免登录即可访问的接口（登录页 / 健康检查） */
const PUBLIC_API = new Set(['/api/health', '/api/auth/login', '/api/auth/status']);

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function tokenFrom(req: FastifyRequest): string | null {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];
  const auth = req.headers.authorization;
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return null;
}

function isHttps(req: FastifyRequest): boolean {
  const proto = req.headers['x-forwarded-proto'];
  const value = Array.isArray(proto) ? proto[0] : proto;
  return typeof value === 'string' && value.split(',')[0].trim() === 'https';
}

function cookieHeader(token: string, maxAgeSec: number, secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export interface AuthContext {
  policy: AuthPolicy;
  guard: BruteForceGuard;
}

interface SessionUser {
  token: string;
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    sessionUser?: SessionUser;
  }
}

export function createAuthContext(): AuthContext {
  const policy = loadAuthPolicy();
  return { policy, guard: new BruteForceGuard(policy) };
}

export async function registerAuth(app: FastifyInstance, ctx: AuthContext): Promise<void> {
  const { policy, guard } = ctx;

  /* ------------------------- 全局守卫：/api 需登录 ------------------------- */
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const path = (req.url.split('?')[0] ?? '/').replace(/\/+$/, '') || '/';
    if (!path.startsWith('/api')) return; // 静态资源与 SPA 外壳放行，由前端渲染登录页
    if (PUBLIC_API.has(path) || req.method === 'OPTIONS') return;

    const token = tokenFrom(req);
    if (!token) return reply.code(401).send({ error: '未登录', code: 'unauthorized' });

    const sess = getSession(token);
    if (!sess) return reply.code(401).send({ error: '登录已失效，请重新登录', code: 'unauthorized' });
    if (new Date(sess.expiresAt).getTime() <= Date.now()) {
      deleteSession(token);
      return reply.code(401).send({ error: '登录已过期，请重新登录', code: 'unauthorized' });
    }
    req.sessionUser = { token, username: sess.username };
  });

  const ipOf = (req: FastifyRequest) =>
    clientIp(req.headers as Record<string, unknown>, req.ip, policy.trustProxy);

  /* ----------------------------- 登录状态（公开） ---------------------------- */
  app.get('/api/auth/status', async (req) => {
    purgeExpiredSessions(new Date().toISOString());
    const token = tokenFrom(req);
    const sess = token ? getSession(token) : null;
    const cred = getCredentials();
    const authenticated = !!sess && new Date(sess.expiresAt).getTime() > Date.now();
    return {
      authenticated,
      // 未登录时不回显用户名，避免泄露账号名
      username: authenticated ? sess!.username : null,
      // 仍在使用出厂默认密码时，前端提示尽快修改
      defaultCredentials: cred?.isDefault ?? false,
      // 被锁的客户端也能在前端提示剩余锁定时间
      retryAfterSec: Math.ceil(guard.check([`ip:${ipOf(req)}`]).retryAfterMs / 1000),
    };
  });

  /* --------------------------------- 登录 --------------------------------- */
  const loginBody = z.object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(256),
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: '请输入用户名和密码' });

    const ip = ipOf(req);
    const username = parsed.data.username.trim();
    const keys = attemptKeys(ip, username);

    // 1) 锁定中直接拒绝（不消耗算力）
    const pre = guard.check(keys);
    if (pre.locked) {
      const sec = Math.ceil(pre.retryAfterMs / 1000);
      return reply
        .code(429)
        .send({ error: `尝试次数过多，请在 ${sec} 秒后再试`, retryAfterSec: sec, locked: true });
    }

    // 2) 校验凭据（用户名不存在也走一次等开销哈希）
    const cred = getCredentials();
    const sameUser = !!cred && cred.username.toLowerCase() === username.toLowerCase();
    const ok = sameUser && cred ? verifyPassword(parsed.data.password, cred) : (dummyVerify(parsed.data.password), false);

    if (!ok) {
      const res = guard.fail(keys);
      if (res.delayMs > 0) await sleep(res.delayMs);
      if (res.locked) {
        const sec = Math.ceil(Math.max(res.retryAfterMs, policy.lockMs) / 1000);
        return reply.code(429).send({
          error: `失败次数过多，已临时锁定，请在 ${sec} 秒后再试`,
          retryAfterSec: sec,
          locked: true,
        });
      }
      const left = guard.peek(keys).remaining;
      return reply.code(401).send({
        error: '用户名或密码错误',
        remainingAttempts: left,
        retryAfterSec: Math.ceil(res.retryAfterMs / 1000),
      });
    }

    // 3) 成功：清零计数 + 下发会话
    guard.reset(keys);
    const token = newSessionToken();
    const now = Date.now();
    createSession({
      token,
      username: cred!.username,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + policy.sessionTtlMs).toISOString(),
      ip,
      ua: (req.headers['user-agent'] as string | undefined)?.slice(0, 200) ?? null,
    });
    reply.header(
      'Set-Cookie',
      cookieHeader(token, Math.floor(policy.sessionTtlMs / 1000), isHttps(req)),
    );
    return { ok: true, username: cred!.username, isDefault: cred!.isDefault };
  });

  /* --------------------------------- 登出 --------------------------------- */
  app.post('/api/auth/logout', async (req, reply) => {
    const token = tokenFrom(req);
    if (token) deleteSession(token);
    reply.header('Set-Cookie', cookieHeader('', 0, isHttps(req)));
    return { ok: true };
  });

  /* ------------------------------- 当前账号 ------------------------------- */
  app.get('/api/auth/me', async (req) => {
    const cred = getCredentials();
    return {
      authenticated: true,
      username: req.sessionUser!.username,
      isDefault: cred?.isDefault ?? false,
      passwordUpdatedAt: cred?.updatedAt ?? null,
      activeSessions: countSessions(),
      policy: {
        maxAttempts: policy.maxAttempts,
        windowSec: Math.round(policy.windowMs / 1000),
        lockSec: Math.round(policy.lockMs / 1000),
        lockMaxSec: Math.round(policy.lockMaxMs / 1000),
        delayBaseMs: policy.delayBaseMs,
        delayMaxMs: policy.delayMaxMs,
        sessionTtlSec: Math.round(policy.sessionTtlMs / 1000),
      },
    };
  });

  /* ---------------------------- 修改用户名/密码 ---------------------------- */
  const credBody = z.object({
    currentPassword: z.string().min(1).max(256),
    username: z.string().min(1).max(64).optional(),
    newPassword: z.string().min(1).max(256).optional(),
    logoutOtherSessions: z.boolean().optional(),
  });

  app.put('/api/auth/credentials', async (req, reply) => {
    const parsed = credBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: '请求参数不完整' });

    const { token, username: currentUser } = req.sessionUser!;
    const ip = ipOf(req);
    const keys = attemptKeys(ip, currentUser);

    // 锁定中不允许改密，避免拿它当密码校验器
    const pre = guard.check(keys);
    if (pre.locked) {
      const sec = Math.ceil(pre.retryAfterMs / 1000);
      return reply.code(429).send({ error: `尝试次数过多，请在 ${sec} 秒后再试`, retryAfterSec: sec });
    }

    const cred = getCredentials();
    if (!cred || !verifyPassword(parsed.data.currentPassword, cred)) {
      const res = guard.fail(keys);
      if (res.delayMs > 0) await sleep(res.delayMs);
      return reply.code(401).send({
        error: '当前密码不正确',
        remainingAttempts: guard.peek(keys).remaining,
      });
    }

    const nextUser = (parsed.data.username ?? cred.username).trim();
    const nextPass = parsed.data.newPassword ?? parsed.data.currentPassword;

    if (parsed.data.username) {
      const err = validateUsername(nextUser);
      if (err) return reply.code(400).send({ error: err });
    }
    if (parsed.data.newPassword) {
      const err = validatePassword(nextPass);
      if (err) return reply.code(400).send({ error: err });
    }
    if (nextUser === cred.username && nextPass === parsed.data.currentPassword && parsed.data.username) {
      return reply.code(400).send({ error: '用户名和密码都没有变化' });
    }

    saveCredentials(nextUser, nextPass, false);
    guard.reset(keys);
    if (parsed.data.logoutOtherSessions !== false) deleteOtherSessions(token);

    return {
      ok: true,
      username: nextUser,
      passwordUpdatedAt: new Date().toISOString(),
      otherSessionsRevoked: parsed.data.logoutOtherSessions !== false,
    };
  });

  /* ------------------------------ 首次初始化 ------------------------------ */
  const init = ensureDefaultCredentials();
  if (init.created) {
    app.log.warn(
      `已创建默认账号 ${init.username} / ${process.env.AUTH_PASSWORD ?? 'admin123'}，请登录后立即在「账号」里修改用户名和密码`,
    );
  }
  app.log.info(
    `登录防爆破策略：窗口内 ${policy.maxAttempts} 次失败即锁定，首次锁定 ${Math.round(
      policy.lockMs / 1000,
    )}s，连续锁定最长 ${Math.round(policy.lockMaxMs / 1000)}s，失败递增延迟 ${policy.delayBaseMs}ms→${policy.delayMaxMs}ms，会话 ${Math.round(
      policy.sessionTtlMs / 3600000,
    )}h`,
  );
}
