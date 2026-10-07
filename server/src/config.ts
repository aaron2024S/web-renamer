import fs from 'node:fs';
import path from 'node:path';

/**
 * 运行时配置。全部通过环境变量注入，方便容器 / NAS 面板部署。
 */
export interface AppConfig {
  port: number;
  host: string;
  /** 允许操作的文件根目录（白名单），前端只能在这些根里浏览 */
  roots: string[];
  /** 预设 / 历史 / 设置的持久化目录 */
  configDir: string;
  /** 运行时以哪个 uid/gid 处理文件（容器里用 entrypoint 降权，这里只记录） */
  puid?: number;
  pgid?: number;
}

function parseRoots(raw: string | undefined): string[] {
  const value = (raw ?? '/data').trim();
  if (!value) return [path.resolve('/data')];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => {
      const abs = path.resolve(p);
      // 根目录必须存在，避免后续 realpath 失败
      if (!fs.existsSync(abs)) {
        try {
          fs.mkdirSync(abs, { recursive: true });
        } catch {
          /* 创建失败就留给上层报错 */
        }
      }
      return abs;
    });
}

export function loadConfig(): AppConfig {
  const configDir = path.resolve(process.env.CONFIG_DIR ?? './renamer-config');
  fs.mkdirSync(configDir, { recursive: true });

  return {
    port: Number(process.env.PORT ?? 7582),
    host: process.env.HOST ?? '0.0.0.0',
    roots: parseRoots(process.env.ROOTS),
    configDir,
    puid: process.env.PUID ? Number(process.env.PUID) : undefined,
    pgid: process.env.PGID ? Number(process.env.PGID) : undefined,
  };
}
