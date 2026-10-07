import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { loadConfig } from './config.js';
import { getSettings, initDb } from './db.js';
import { registerRoutes } from './routes.js';
import { createAuthContext, registerAuth } from './auth-routes.js';
import { startWatcher } from './watcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = loadConfig();
initDb(config.configDir);

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  bodyLimit: 8 * 1024 * 1024,
});

await app.register(fastifyCors, { origin: true });

// 安全响应头（不引入额外依赖）
app.addHook('onSend', async (_req, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
});

// 登录鉴权 + 防爆破守卫（注册在业务路由之前，/api 默认需要登录）
await registerAuth(app, createAuthContext());

await registerRoutes(app, config);

// 生产模式下由后端托管前端构建产物
const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) {
      return reply.code(404).send({ error: '接口不存在' });
    }
    return reply.sendFile('index.html');
  });
  app.log.info(`前端静态资源: ${webDist}`);
} else {
  app.get('/', async () => ({
    message: '前端尚未构建。开发模式请访问 http://localhost:5173 ，或先执行 npm run build。',
  }));
  app.log.warn('未找到 web/dist，仅提供 API');
}

// 按已保存的设置启动目录监听
startWatcher(getSettings().watch, config.roots);

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`ReNamer Web 已启动 → http://localhost:${config.port}`);
  app.log.info(`可操作根目录: ${config.roots.join(', ')}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
