import fs from 'node:fs';
import path from 'node:path';

/** 判断 abs 是否位于某个根目录内部（含根本身） */
export function isInsideRoot(abs: string, roots: string[]): boolean {
  return roots.some((root) => {
    const rel = path.relative(root, abs);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
}

/**
 * 把用户传入的路径解析为绝对路径，并强制落在白名单根目录内。
 * 只做字符串层面校验，用于那些尚不存在的目标路径。
 */
export function resolveSafe(inputPath: string, roots: string[]): string {
  const abs = path.resolve(inputPath);
  if (!isInsideRoot(abs, roots)) {
    throw new PathSecurityError(`路径超出允许范围: ${inputPath}`);
  }
  return abs;
}

/**
 * 更严格的校验：解析真实路径（跟随符号链接），防止通过软链逃逸根目录。
 * 对不存在的路径，回溯到最近的已存在祖先目录做校验。
 */
export function realpathSafe(inputPath: string, roots: string[]): string {
  const abs = resolveSafe(inputPath, roots);
  let probe = abs;
  // 找到最近的已存在祖先
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  let realProbe: string;
  try {
    realProbe = fs.realpathSync.native(probe);
  } catch {
    realProbe = probe;
  }
  // 真实祖先也要在根目录内
  if (!isInsideRoot(realProbe, roots.map((r) => safeReal(r)))) {
    throw new PathSecurityError(`路径经符号链接后逃逸出允许范围: ${inputPath}`);
  }
  return abs;
}

function safeReal(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

export class PathSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathSecurityError';
  }
}

/** 生成相对某个根的展示路径（用于前端显示） */
export function displayPath(abs: string, roots: string[]): string {
  for (const root of roots) {
    if (isInsideRoot(abs, [root])) {
      const rel = path.relative(root, abs);
      const base = path.basename(root);
      return rel ? `${base}/${rel.split(path.sep).join('/')}` : base;
    }
  }
  return abs;
}
